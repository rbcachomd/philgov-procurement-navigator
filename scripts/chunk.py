"""
Section-aware chunker for the Philippine procurement IRRs.

Splits each PDF (via pdftotext -layout) into structural units
(Rule -> Section, Annex/Appendix -> numbered parts), then windows long
sections into overlapping chunks. Every chunk carries citation metadata:
document, rule, section, heading and the PDF page it starts on.

Usage:  python3 scripts/chunk.py   ->  data/chunks.json
"""
import json, re, subprocess, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOCS = [
    {
        "id": "ra12009",
        "file": "ra12009-irr.pdf",
        "short": "RA 12009 IRR",
        "title": "IRR of RA No. 12009 (New Government Procurement Act)",
        "status": "Governing law – primary source",
    },
    {
        "id": "ra9184",
        "file": "ra9184-irr-2016-rev-2024.pdf",
        "short": "RA 9184 IRR (ref.)",
        "title": "2016 Revised IRR of RA No. 9184 (updated 19 July 2024)",
        "status": "Repealed prior law – reference only",
    },
]

TARGET_WORDS = 380   # chunk window
OVERLAP_WORDS = 70   # overlap between windows of the same section
MIN_WORDS = 12       # drop near-empty fragments

RULE_RE = re.compile(r"^RULE\s+([IVXLC]+)\b\s*(?:[–\-—]\s*(.+))?$")
SECTION_RE = re.compile(r"^(?:Section|SECTION)\s+(\d+)\.\s+(.{3,140})$")
APPX_RE = re.compile(r"^(APPENDIX|ANNEX)\s+[“\"]?([A-Z0-9]+)[”\"]?$")
TOC_RE = re.compile(r"\.{5,}")
PAGENUM_RE = re.compile(r"^\d{1,3}$")
RUNHEAD_RE = re.compile(r"^The 2016 Revised Implementing Rules and Regulations")


def pages_of(pdf: pathlib.Path):
    txt = subprocess.run(["pdftotext", "-layout", str(pdf), "-"],
                         capture_output=True, text=True, check=True).stdout
    return txt.split("\f")


SMALL = {"a","an","and","as","at","by","for","in","of","on","or","the","to","with","under","from","into"}
KEEP_UPPER = {"BAC","GPPB","NGO","NGOS","GOP","IRR","RA","TWG","LGU","LGUS","GOCC","GOCCS","SUC","SUCS","PS","DBM","COA","HOPE","ABC","APP","PPMP","TSO","II","III","IV","VI","VII","VIII","IX","XI","XII","COVID-19","PHILGEPS","EPA","CPA","NGAS"}


def smart_title(s: str) -> str:
    out = []
    for i, w in enumerate(s.split()):
        core = w.strip("()“”\",.:;-")
        if core.upper() in KEEP_UPPER or (w.startswith("(") and len(core) <= 6):
            out.append(w.replace("PHILGEPS", "PhilGEPS"))
        elif i > 0 and core.lower() in SMALL:
            out.append(w.lower())
        else:
            out.append(w[:1].upper() + w[1:].lower())
    return " ".join(out)


def clean(line: str) -> str:
    s = line.strip()
    s = re.sub(r"\s{2,}", " ", s)
    return s


def chunk_doc(doc):
    pages = pages_of(ROOT / "public" / "docs" / doc["file"])
    units = []  # each: dict(rule, ruleTitle, section, heading, page, lines)
    state = {"rule": None, "ruleTitle": None, "part": None, "kind": "body"}
    cur = None
    last_sec = 0
    pending_rule_title = False
    pending_appx_title = 0
    started = False
    annex = None

    def open_unit(section, heading, page):
        nonlocal cur
        cur = {
            "rule": state["rule"], "ruleTitle": state["ruleTitle"],
            "part": state["part"], "section": section, "heading": heading,
            "page": page, "lines": [],
        }
        units.append(cur)

    for pno, page in enumerate(pages, start=1):
        for raw in page.splitlines():
            s = clean(raw)
            if not s or PAGENUM_RE.match(s) or RUNHEAD_RE.match(s):
                continue
            if TOC_RE.search(s):
                continue  # table of contents line
            m_rule = RULE_RE.match(s)
            if m_rule and raw.startswith(" " * 10):
                started = True
                state.update(rule=m_rule.group(1), part=None, kind="body",
                             ruleTitle=smart_title((m_rule.group(2) or "").strip()) or None)
                pending_rule_title = state["ruleTitle"] is None
                open_unit(None, f"Rule {m_rule.group(1)}", pno)
                continue
            if not started:
                continue
            if pending_rule_title and s.isupper():
                state["ruleTitle"] = smart_title(s)
                cur["ruleTitle"] = state["ruleTitle"]
                pending_rule_title = False
                continue
            pending_rule_title = False
            m_ap = APPX_RE.match(s)
            if m_ap and raw.startswith("      "):
                kind, code = m_ap.group(1), m_ap.group(2)
                if kind == "ANNEX":
                    annex = f"Annex {code}"
                    label = annex
                elif code.isalpha() and annex:
                    label = f"{annex}, Appendix {code}"
                else:
                    annex = None
                    label = f"Appendix {code}"
                state.update(kind="appendix", part=label, rule=None, ruleTitle=None)
                last_sec = 0
                open_unit(None, label, pno)
                pending_appx_title = 3
                continue
            if pending_appx_title and s.isupper() and len(s) > 6 and not s[0].isdigit() and not re.match(r"^[IVX]+\.", s):
                cur["heading"] = (cur["heading"] + " – " if " – " not in cur["heading"] else cur["heading"] + " ") + smart_title(s)
                pending_appx_title -= 1
                continue
            pending_appx_title = 0
            m_sec = SECTION_RE.match(s)
            if m_sec and state["kind"] == "body":
                n = int(m_sec.group(1))
                if last_sec <= n <= last_sec + 3:
                    last_sec = n
                    title = re.sub(r"\d+$", "", m_sec.group(2)).strip()
                    open_unit(n, title, pno)
                    continue
            if cur is None:
                continue
            cur["lines"].append((pno, s))
    return units


def windows(words_pages):
    n = len(words_pages)
    if n <= TARGET_WORDS + 60:
        yield 0, n
        return
    start = 0
    while start < n:
        end = min(n, start + TARGET_WORDS)
        yield start, end
        if end == n:
            break
        start = end - OVERLAP_WORDS


def main():
    out = []
    for doc in DOCS:
        units = chunk_doc(doc)
        for u in units:
            wp = []
            for pno, line in u["lines"]:
                for w in line.split(" "):
                    wp.append((w, pno))
            if len(wp) < MIN_WORDS:
                continue
            # citation label
            if u["section"] is not None:
                loc = f"Sec. {u['section']}. {u['heading']}"
                ctx = f"Rule {u['rule']}" + (f" – {u['ruleTitle']}" if u["ruleTitle"] else "")
            elif u["part"]:
                loc = u["heading"]
                ctx = u["part"]
            else:
                loc = u["heading"] + (f" – {u['ruleTitle']}" if u["ruleTitle"] else "")
                ctx = ""
            loc = re.sub(r"(?<=[A-Za-z)])\d{2,3}$", "", loc).strip()
            for i, (a, b) in enumerate(windows(wp)):
                text = " ".join(w for w, _ in wp[a:b])
                out.append({
                    "id": f"{doc['id']}-{len(out):05d}",
                    "docId": doc["id"],
                    "docShort": doc["short"],
                    "docTitle": doc["title"],
                    "docStatus": doc["status"],
                    "file": f"/docs/{doc['file']}",
                    "rule": u["rule"],
                    "ruleTitle": u["ruleTitle"],
                    "section": u["section"],
                    "part": u["part"],
                    "label": loc,
                    "context": ctx,
                    "page": wp[a][1],
                    "pageEnd": wp[b - 1][1],
                    "part_index": i,
                    "text": text,
                })
    (ROOT / "data").mkdir(exist_ok=True)
    (ROOT / "data" / "chunks.json").write_text(json.dumps(out, ensure_ascii=False))
    by = {}
    for c in out:
        by[c["docId"]] = by.get(c["docId"], 0) + 1
    words = sum(len(c["text"].split()) for c in out)
    print(f"{len(out)} chunks, {words} words", by)


if __name__ == "__main__":
    main()
