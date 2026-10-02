# PhilGov Procurement Navigator

A public RAG assistant for Philippine government procurement. It is grounded in the **IRR of RA No. 12009 (New Government Procurement Act)**, the governing law. The **2016 Revised IRR of RA No. 9184** (updated 19 July 2024) is included only as a repealed, reference-only source. Every answer streams in with numbered citations that give the section and page and link to the official PDF at that page.

*AIM MAIDA — Graded Mini Project 14.3 "Ship Your Own RAG"*

## Architecture

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router) + Vercel AI SDK 7 | `useChat` streaming UI and `streamText` with tool calls |
| LLM | OpenAI `gpt-4.1-mini` (override with `CHAT_MODEL`) | Fast first token, reliable tool use, low cost |
| Retrieval | **Tool call** `searchProcurementLaw` (multi-step, up to 5 steps) | The model decides when and what to search and can re-query |
| Index | Pre-computed vectors (`data/embeddings.bin`, `text-embedding-3-small`) shipped with the serverless function | No external vector DB: one env var, no cold-start DB connection; about 4.5 MB for 737 chunks |
| Ranking | **Hybrid**: cosine similarity + BM25, merged with Reciprocal Rank Fusion; at most 2 windows per section | Legal text relies on exact terms ("bid securing declaration", "ABC", "Section 53.9"), which pure semantic search misses |
| Scope | Defaults to RA 12009; RA 9184 is searched only when the user asks about the old rules or a comparison | Keeps answers on the governing law |

### Chunking (`scripts/chunk.py`)
The chunker follows the legal structure instead of a fixed character count:
1. Extract text page by page with `pdftotext -layout`, keeping track of each page number.
2. Detect **Rule → Section** headings in the IRR body and **Annex / Appendix** headings in RA 9184, and skip the table of contents.
3. Turn each section into one unit. Long sections are split into windows of about 380 words with a 70-word overlap.
4. Store metadata on every chunk: `docShort`, `rule`, `ruleTitle`, `section`, `label` (for example "Sec. 56. Bid Security"), `page`, `pageEnd` and `file`. The UI builds its citations and `#page=` deep links from these fields.

## Stretch goals
1. **Hybrid retrieval** (vector + BM25 with RRF), with an evaluation harness (`npm run eval`) that reports hit@6 and MRR on 20 gold questions.
2. **Source-PDF from citation**: each source card opens the official PDF at the cited page.

## Run locally
```bash
npm install
cp .env.example .env.local        # add OPENAI_API_KEY
npm run chunk                     # optional – data/chunks.json is committed
npm run embed                     # builds data/embeddings.bin (~US$0.01)
npm run eval                      # retrieval hit@K / MRR
npm run dev                       # http://localhost:3000
```

## Deploy (Vercel)
1. Push the repo to GitHub. **Commit `data/embeddings.bin` and `data/embeddings.meta.json`.**
2. In Vercel, choose New Project → Import repo, then Settings → Environment Variables, and add `OPENAI_API_KEY` for Production and Preview.
3. Deploy. Then open the URL in an incognito window and ask a question to confirm that sources appear.

## Security
- `OPENAI_API_KEY` is read only in `app/api/chat/route.ts` and `lib/retrieval.ts`, which import `server-only`. It has no `NEXT_PUBLIC_` prefix.
- Errors that reach the client are masked ("An error occurred").

## Corpus
| File | Pages | Status |
|---|---|---|
| `public/docs/ra12009-irr.pdf` | 193 | Governing law: primary source |
| `public/docs/ra9184-irr-2016-rev-2024.pdf` | 422 | Repealed: reference only |

Source: Government Procurement Policy Board (gppb.gov.ph). This is a research aid, not a legal opinion.
