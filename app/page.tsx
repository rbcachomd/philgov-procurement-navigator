'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { SourceRef } from '@/lib/types';

const SUGGESTIONS = [
  { tag: 'Modes', q: 'What are the modes of procurement under RA 12009?' },
  { tag: 'Bidding', q: 'How much bid security is required, and in what forms?' },
  { tag: 'BAC', q: 'Who composes the Bids and Awards Committee and what are its functions?' },
  { tag: 'Bidding', q: 'When may a procuring entity declare a failure of bidding?' },
  { tag: 'Modes', q: 'What is Competitive Dialogue and when may it be used?' },
  { tag: 'Sanctions', q: 'What are the grounds and process for blacklisting a supplier?' },
];

const STATS = [
  { k: '116', v: 'Sections of the RA 12009 IRR indexed' },
  { k: '193', v: 'Pages of governing rules, searchable' },
  { k: '100%', v: 'Retrieval hit-rate on 20 benchmark questions' },
  { k: 'p. #', v: 'Every claim cited to section & page' },
];

const STEPS = [
  { n: '01', t: 'Ask in plain language', d: 'Type a question the way a BAC member, end-user or supplier would ask it.' },
  { n: '02', t: 'The IRR is searched', d: 'A retrieval tool runs hybrid semantic + keyword search over every section of RA 12009.' },
  { n: '03', t: 'Answer with proof', d: 'A concise answer streams in with numbered citations that open the PDF at the cited page.' },
];

type ToolOutput = { query: string; law: string; count: number; sources: SourceRef[] };

function linkifyRefs(text: string) {
  // [1] or [2][4] -> markdown links to the source cards
  return text.replace(/\[(\d{1,2})\](?!\()/g, '[$1](#src-$1)');
}

function SourceCard({ s, msgId }: { s: SourceRef; msgId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={`src src-${s.docId}`} id={`${msgId}-src-${s.ref}`}>
      <div className="src-head">
        <span className="src-num">{s.ref}</span>
        <span className={`badge badge-${s.docId}`}>{s.docShort}</span>
        <span className="src-pages">{s.page === s.pageEnd ? `p. ${s.page}` : `pp. ${s.page}–${s.pageEnd}`}</span>
      </div>
      <div className="src-label">{s.label}</div>
      {s.context && s.context !== s.label && <div className="src-ctx">{s.context}</div>}
      <div className="src-actions">
        <button type="button" className="linkish" onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide excerpt' : 'Show excerpt'}
        </button>
        <a href={s.pdfUrl} target="_blank" rel="noreferrer" className="linkish">
          Open PDF at p. {s.page} ↗
        </a>
        <span className="src-match">{s.match}</span>
      </div>
      {open && <blockquote className="src-excerpt">{s.excerpt}</blockquote>}
    </li>
  );
}

export default function Page() {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status, stop, error, regenerate, setMessages } = useChat();
  const busy = status === 'submitted' || status === 'streaming';
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length === 0) return; // keep the landing page at the top
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, status]);

  const ask = (q: string) => {
    const text = q.trim();
    if (!text || busy) return;
    sendMessage({ text });
    setInput('');
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="seal" aria-hidden>₱</span>
          <div>
            <div className="brand-name">PhilGov Procurement Navigator</div>
            <div className="brand-sub">Grounded answers from the IRR of RA 12009 (New Government Procurement Act)</div>
          </div>
        </div>
        {messages.length > 0 && (
          <button className="ghost" type="button" onClick={() => setMessages([])} disabled={busy}>
            New chat
          </button>
        )}
      </header>

      <main className="thread">
        {messages.length === 0 ? (
          <section className="empty">
            <div className="hero">
              <svg className="hero-sun" viewBox="-100 -100 200 200" aria-hidden>
                {Array.from({ length: 8 }).map((_, i) => (
                  <g key={i} transform={`rotate(${i * 45})`}>
                    <polygon points="0,-36 -5,-92 5,-92" />
                    <polygon points="0,-36 -3,-80 3,-80" transform="rotate(-12)" />
                    <polygon points="0,-36 -3,-80 3,-80" transform="rotate(12)" />
                  </g>
                ))}
                <circle r="30" />
              </svg>
              <span className="eyebrow">RA No. 12009 · New Government Procurement Act</span>
              <h1>
                Ask the procurement rules.
                <br />
                <em>Get the exact section.</em>
              </h1>
              <p className="lede">
                A retrieval-augmented assistant for BAC members, Secretariats, end-users and suppliers. Every answer is
                grounded in the official Implementing Rules and Regulations and cited to the section and page.
              </p>
              <div className="hero-cta">
                <button type="button" className="cta" onClick={() => ask(SUGGESTIONS[0].q)}>
                  Try a sample question →
                </button>
                <a className="cta-ghost" href="/docs/ra12009-irr.pdf" target="_blank" rel="noreferrer">
                  Read the IRR (PDF)
                </a>
              </div>
            </div>

            <div className="stats">
              {STATS.map((x) => (
                <div key={x.v} className="stat">
                  <div className="stat-k">{x.k}</div>
                  <div className="stat-v">{x.v}</div>
                </div>
              ))}
            </div>

            <h2 className="section-title">Start with a question</h2>
            <div className="chips">
              {SUGGESTIONS.map((s) => (
                <button key={s.q} type="button" className="chip" onClick={() => ask(s.q)}>
                  <span className="chip-tag">{s.tag}</span>
                  <span className="chip-q">{s.q}</span>
                  <span className="chip-go" aria-hidden>→</span>
                </button>
              ))}
            </div>

            <h2 className="section-title">How it works</h2>
            <ol className="steps">
              {STEPS.map((x) => (
                <li key={x.n} className="step">
                  <span className="step-n">{x.n}</span>
                  <strong>{x.t}</strong>
                  <span>{x.d}</span>
                </li>
              ))}
            </ol>

            <h2 className="section-title">The corpus</h2>
            <div className="corpus">
              <a className="corpus-card c-ra12009" href="/docs/ra12009-irr.pdf" target="_blank" rel="noreferrer">
                <span className="badge badge-ra12009">Governing law · searched by default</span>
                <strong>IRR of RA No. 12009</strong>
                <span>New Government Procurement Act · 193 pp. · 23 Rules · Sections 1–117</span>
              </a>
              <a className="corpus-card c-ra9184" href="/docs/ra9184-irr-2016-rev-2024.pdf" target="_blank" rel="noreferrer">
                <span className="badge badge-ra9184">Reference only · repealed</span>
                <strong>2016 Revised IRR of RA No. 9184</strong>
                <span>Consulted only when you ask about the old rules or a comparison</span>
              </a>
            </div>

            <div className="author-card">
              <div className="author-mark" aria-hidden>RC</div>
              <div>
                <div className="author-name">Richard Ronald B. Cacho, MD, MHA</div>
                <div className="author-role">Public Procurement Specialist Level 2</div>
                <div className="author-meta">Developer &amp; Owner · Version 01 · 2026</div>
              </div>
            </div>
            <p className="fineprint">
              Research aid only — not a legal opinion. For binding interpretation, refer to GPPB resolutions and GPPB-TSO
              advisories.
            </p>
          </section>
        ) : (
          messages.map((m) => {
            const toolParts = m.parts.filter((p) => p.type === 'tool-searchProcurementLaw') as any[];
            const sources: SourceRef[] = toolParts
              .filter((p) => p.state === 'output-available')
              .flatMap((p) => (p.output as ToolOutput).sources);
            const searching = toolParts.filter((p) => p.state === 'input-streaming' || p.state === 'input-available');
            return (
              <article key={m.id} className={`msg msg-${m.role}`}>
                {m.role === 'user' ? (
                  <div className="bubble">{m.parts.map((p, i) => (p.type === 'text' ? <span key={i}>{p.text}</span> : null))}</div>
                ) : (
                  <div className="answer">
                    {toolParts.length > 0 && (
                      <div className="searches">
                        {toolParts.map((p, i) => (
                          <span key={i} className={`search-pill ${p.state === 'output-available' ? 'done' : ''}`}>
                            {p.state === 'output-available' ? '✓' : '⌕'} Searched
                            {p.input?.law === 'ra9184' ? ' RA 9184 (reference)' : p.input?.law === 'both' ? ' RA 12009 + RA 9184' : ' RA 12009'}
                            {p.input?.query ? `: “${p.input.query}”` : '…'}
                            {p.state === 'output-error' ? ' (failed)' : ''}
                          </span>
                        ))}
                      </div>
                    )}
                    {m.parts.map((p, i) =>
                      p.type === 'text' ? (
                        <div key={i} className="md">
                          <ReactMarkdown
                            components={{
                              a: ({ href, children }) => {
                                const mm = href?.match(/^#src-(\d+)$/);
                                if (mm) {
                                  const n = Number(mm[1]);
                                  const s = sources.find((x) => x.ref === n);
                                  return (
                                    <a
                                      className="cite"
                                      href={`#${m.id}-src-${n}`}
                                      title={s ? s.citation : `Source ${n}`}
                                    >
                                      {n}
                                    </a>
                                  );
                                }
                                return (
                                  <a href={href} target="_blank" rel="noreferrer">
                                    {children}
                                  </a>
                                );
                              },
                            }}
                          >
                            {linkifyRefs(p.text)}
                          </ReactMarkdown>
                        </div>
                      ) : null,
                    )}
                    {searching.length > 0 && sources.length === 0 && <div className="typing">Searching the IRRs…</div>}
                    {sources.length > 0 && (
                      <details className="sources" open>
                        <summary>
                          Sources <span className="count">{sources.length}</span>
                        </summary>
                        <ol>
                          {sources.map((s) => (
                            <SourceCard key={`${m.id}-${s.ref}`} s={s} msgId={m.id} />
                          ))}
                        </ol>
                      </details>
                    )}
                  </div>
                )}
              </article>
            );
          })
        )}
        {status === 'submitted' && <div className="typing">Thinking…</div>}
        {error && (
          <div className="error">
            Something went wrong ({error.message || 'network error'}).{' '}
            <button type="button" className="linkish" onClick={() => regenerate()}>
              Retry
            </button>
          </div>
        )}
        <div ref={endRef} />
      </main>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <textarea
          value={input}
          rows={1}
          placeholder="Ask about bidding, SVP, bid security, BAC…"
          onChange={(e) => setInput(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              ask(input);
            }
          }}
        />
        {busy ? (
          <button type="button" className="send" onClick={() => stop()}>
            Stop
          </button>
        ) : (
          <button type="submit" className="send" disabled={!input.trim()}>
            Ask
          </button>
        )}
        <div className="credit">
          © 2026 Richard Ronald B. Cacho, MD, MHA · Public Procurement Specialist Level 2 · Version 01 · Proprietary — all rights reserved
        </div>
      </form>
    </div>
  );
}
