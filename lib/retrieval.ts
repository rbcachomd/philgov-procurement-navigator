import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';
import chunksJson from '@/data/chunks.json';
import type { Chunk, SearchHit } from './types';

export const EMBEDDING_MODEL = 'text-embedding-3-small';
const chunks = chunksJson as Chunk[];

/* ------------------------------------------------------------------ */
/* Vector index: Float32 matrix written by `npm run embed`             */
/* ------------------------------------------------------------------ */
let vectors: Float32Array | null | undefined;
let dims = 0;

function loadVectors(): Float32Array | null {
  if (vectors !== undefined) return vectors;
  try {
    const dir = path.join(process.cwd(), 'data');
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'embeddings.meta.json'), 'utf8'));
    const buf = fs.readFileSync(path.join(dir, 'embeddings.bin'));
    if (meta.count !== chunks.length) {
      console.warn('[retrieval] embeddings are stale (count mismatch) – run `npm run embed`. Using keyword search only.');
      vectors = null;
      return vectors;
    }
    dims = meta.dims;
    vectors = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  } catch {
    console.warn('[retrieval] data/embeddings.bin not found – run `npm run embed`. Using keyword search only.');
    vectors = null;
  }
  return vectors;
}

/* ------------------------------------------------------------------ */
/* BM25 keyword index (built once per cold start)                      */
/* ------------------------------------------------------------------ */
const STOP = new Set(
  'a an and are as at be by for from has have if in into is it its of on or shall such that the their then there these this to under was were which will with within without may any all other per not no be been being what how when who whom where why which does do can should would could i we our my you'.split(' '),
);

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[“”"’']/g, '')
    .split(/[^a-z0-9.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ''))
    .filter((t) => t.length > 1 && !STOP.has(t));
}

type Bm25 = { tf: Map<string, number>[]; len: number[]; df: Map<string, number>; avg: number };
let bm25: Bm25 | null = null;

function buildBm25(): Bm25 {
  if (bm25) return bm25;
  const df = new Map<string, number>();
  const tf: Map<string, number>[] = [];
  const len: number[] = [];
  for (const c of chunks) {
    // section titles weighted x3 so "Sec. 26. Modes of Procurement" wins on title matches
    const toks = tokenize(`${c.label} ${c.label} ${c.label} ${c.context} ${c.text}`);
    const m = new Map<string, number>();
    for (const t of toks) m.set(t, (m.get(t) ?? 0) + 1);
    for (const t of m.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    tf.push(m);
    len.push(toks.length);
  }
  const avg = len.reduce((a, b) => a + b, 0) / len.length;
  bm25 = { tf, len, df, avg };
  return bm25;
}

function keywordScores(query: string, allowed: (i: number) => boolean): [number, number][] {
  const { tf, len, df, avg } = buildBm25();
  const q = [...new Set(tokenize(query))];
  const N = chunks.length;
  const k1 = 1.4;
  const b = 0.75;
  const out: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    if (!allowed(i)) continue;
    let s = 0;
    for (const t of q) {
      const f = tf[i].get(t);
      if (!f) continue;
      const n = df.get(t) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * len[i]) / avg)));
    }
    if (s > 0) out.push([i, s]);
  }
  return out.sort((a, b) => b[1] - a[1]);
}

async function vectorScores(query: string, allowed: (i: number) => boolean): Promise<[number, number][]> {
  const v = loadVectors();
  if (!v) return [];
  const { embedding } = await embed({ model: openai.embeddingModel(EMBEDDING_MODEL), value: query });
  let qn = 0;
  for (const x of embedding) qn += x * x;
  qn = Math.sqrt(qn);
  const out: [number, number][] = [];
  for (let i = 0; i < chunks.length; i++) {
    if (!allowed(i)) continue;
    let dot = 0;
    const off = i * dims;
    for (let d = 0; d < dims; d++) dot += v[off + d] * embedding[d];
    out.push([i, dot / qn]); // stored vectors are pre-normalised
  }
  return out.sort((a, b) => b[1] - a[1]);
}

/* ------------------------------------------------------------------ */
/* Hybrid search with Reciprocal Rank Fusion                           */
/* ------------------------------------------------------------------ */
export type LawFilter = 'ra12009' | 'ra9184' | 'both';

export async function hybridSearch(query: string, opts: { law?: LawFilter; topK?: number } = {}): Promise<SearchHit[]> {
  const topK = opts.topK ?? 6;
  const law = opts.law ?? 'ra12009';
  const allowed = (i: number) => law === 'both' || chunks[i].docId === law;

  const [vec, kw] = await Promise.all([vectorScores(query, allowed), Promise.resolve(keywordScores(query, allowed))]);

  const K = 60;
  const fused = new Map<number, { score: number; vRank?: number; kRank?: number }>();
  vec.slice(0, 50).forEach(([i], r) => fused.set(i, { score: 1 / (K + r + 1), vRank: r + 1 }));
  kw.slice(0, 50).forEach(([i], r) => {
    const e = fused.get(i) ?? { score: 0 };
    e.score += 1 / (K + r + 1);
    e.kRank = r + 1;
    fused.set(i, e);
  });

  const ranked = [...fused.entries()].sort((a, b) => b[1].score - a[1].score);
  const hits: SearchHit[] = [];
  const seenSections = new Map<string, number>();
  for (const [i, e] of ranked) {
    const c = chunks[i];
    // diversity: at most 2 windows from the same section
    const key = `${c.docId}|${c.section ?? c.label}`;
    const n = seenSections.get(key) ?? 0;
    if (n >= 2) continue;
    seenSections.set(key, n + 1);
    hits.push({ ...c, score: Number(e.score.toFixed(4)), vectorRank: e.vRank ?? null, keywordRank: e.kRank ?? null });
    if (hits.length >= topK) break;
  }
  return hits;
}

export function retrievalMode(): 'hybrid' | 'keyword-only' {
  return loadVectors() ? 'hybrid' : 'keyword-only';
}
