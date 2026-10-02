import {
  streamText,
  tool,
  isStepCount,
  convertToModelMessages,
  createUIMessageStreamResponse,
  toUIMessageStream,
  type UIMessage,
} from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { hybridSearch } from '@/lib/retrieval';
import type { SourceRef } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const CHAT_MODEL = process.env.CHAT_MODEL || 'gpt-4.1-mini';
const TOP_K = Number(process.env.RAG_TOP_K || 6);

const SYSTEM = `You are "PhilGov Procurement Navigator", a research assistant for Philippine public procurement.
The governing law is RA No. 12009 (New Government Procurement Act) and its IRR. Base every answer on it.
Your ONLY knowledge source is the searchProcurementLaw tool, which searches:
  • RA 12009 IRR – the PRIMARY and authoritative source (default search scope).
  • RA 9184 IRR (2016 Revised, updated 19 July 2024) – the repealed prior law, kept ONLY as a historical reference.

Rules:
1. ALWAYS call searchProcurementLaw before answering any procurement question, even if you think you know the answer. You may call it up to 3 times with different phrasings.
2. Search RA 12009 (the default). Search law="ra9184" ONLY when the user explicitly asks about RA 9184, the old/previous rules, a comparison, or a procurement begun under the old law. Never answer a general question from RA 9184 alone.
3. Answer ONLY from the returned excerpts. If the RA 12009 excerpts do not contain the answer, say so plainly and suggest a rephrasing. Never fill gaps from general knowledge or from RA 9184.
4. If you cite RA 9184 at all, label it clearly as "RA 9184 IRR (repealed; for reference only)" and keep it after the RA 12009 answer.
5. Put a citation marker at the end of EVERY sentence and EVERY bullet/list item, e.g. "…not less than 2% of the ABC [1]." Use [1][3] when several sources support it. Use only numbers that appear in tool results. Do NOT add a "References" or "Sources" list at the end — the interface already displays the sources.
6. Quote exact figures, periods and thresholds as written (e.g. "seven (7) calendar days"). Name the Section in prose (e.g. "Under Section 34 of the RA 12009 IRR…").
7. Style: concise, formal, structured. Start with a one- or two-sentence direct answer, then bullets or a short numbered procedure if helpful. No preamble.
8. Off-topic questions (not Philippine government procurement): decline politely in one sentence and offer an example procurement question.
9. You are not a lawyer; for binding interpretations users should consult GPPB issuances, GPPB-TSO opinions or their legal office. Mention this only when the user asks for a legal opinion or the matter is contentious.`;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  // Source numbers are unique across every tool call in this response.
  let refCounter = 0;

  const result = streamText({
    model: openai(CHAT_MODEL),
    system: SYSTEM,
    messages: await convertToModelMessages(messages.slice(-12)),
    stopWhen: isStepCount(5),
    temperature: 0.1,
    tools: {
      searchProcurementLaw: tool({
        description:
          'Search the official IRR of RA 12009 (New Government Procurement Act), the governing Philippine procurement law. ' +
          'Optionally searches the repealed 2016 Revised IRR of RA 9184 as a historical reference only. ' +
          'Use for ANY question on procurement modes (competitive bidding, small value procurement, negotiated procurement, ' +
          'direct contracting, emergency, shopping, framework agreements), BAC composition and functions, thresholds and ceilings (ABC), ' +
          'bid/performance security, eligibility documents, timelines, post-qualification, failure of bidding, protests, blacklisting, ' +
          'penalties, honoraria, PhilGEPS, APP/PPMP planning and contract implementation. ' +
          'Write the query as a specific legal-search phrase with key terms (e.g. "bid security amount form percentage of ABC"). ' +
          'Returns numbered excerpts with section and page citations.',
        inputSchema: z.object({
          query: z.string().describe('Specific search phrase using procurement terminology'),
          law: z
            .enum(['ra12009', 'ra9184', 'both'])
            .default('ra12009')
            .describe(
              'Default "ra12009" (governing law). Use "ra9184" or "both" ONLY when the user explicitly asks about RA 9184, the old rules, or a comparison.',
            ),
        }),
        execute: async ({ query, law }) => {
          const hits = await hybridSearch(query, { law, topK: TOP_K });
          const sources: SourceRef[] = hits.map((h) => {
            const ref = ++refCounter;
            const pages = h.page === h.pageEnd ? `p. ${h.page}` : `pp. ${h.page}–${h.pageEnd}`;
            return {
              ref,
              docId: h.docId,
              docShort: h.docShort,
              docStatus: h.docStatus,
              citation: `${h.docShort}, ${h.label}${h.context && h.section ? ` (${h.context})` : ''}, ${pages}`,
              label: h.label,
              context: h.context,
              page: h.page,
              pageEnd: h.pageEnd,
              pdfUrl: `${h.file}#page=${h.page}`,
              excerpt: h.text,
              match:
                h.vectorRank && h.keywordRank ? 'semantic + keyword' : h.vectorRank ? 'semantic' : 'keyword',
            };
          });
          return { query, law, count: sources.length, sources };
        },
      }),
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
