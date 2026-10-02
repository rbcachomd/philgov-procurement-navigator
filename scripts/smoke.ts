/**
 * Retrieval evaluation harness: runs gold questions through hybridSearch and
 * reports hit@K (does the expected section appear in the top K?).
 *   npm run eval
 */
import { hybridSearch, retrievalMode } from '../lib/retrieval';
import gold from './gold.json';

type Gold = { q: string; law?: 'ra12009' | 'ra9184' | 'both'; expect: { docId: string; section?: number; label?: string }[] };

async function main() {
  const K = Number(process.env.RAG_TOP_K || 6);
  let hits = 0;
  let rr = 0;
  for (const g of gold as Gold[]) {
    const res = await hybridSearch(g.q, { law: g.law ?? 'both', topK: K });
    const idx = res.findIndex((r) =>
      g.expect.some(
        (e) => e.docId === r.docId && (e.section ? r.section === e.section : r.label.toLowerCase().includes((e.label ?? '').toLowerCase())),
      ),
    );
    if (idx >= 0) {
      hits++;
      rr += 1 / (idx + 1);
    }
    console.log(`${idx >= 0 ? 'HIT ' + (idx + 1) : 'MISS '} | ${g.q}`);
    if (process.env.VERBOSE || idx < 0)
      res.forEach((r, i) => console.log(`     ${i + 1}. ${r.docShort} ${r.label} p.${r.page} [v${r.vectorRank ?? '-'} k${r.keywordRank ?? '-'}]`));
  }
  const n = (gold as Gold[]).length;
  console.log(`\nmode=${retrievalMode()}  hit@${K}=${((hits / n) * 100).toFixed(0)}%  MRR=${(rr / n).toFixed(2)}  (n=${n})`);
}
main();
