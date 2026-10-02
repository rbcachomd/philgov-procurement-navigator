/**
 * Seeds the vector index: embeds every chunk in data/chunks.json with
 * OpenAI text-embedding-3-small and writes a normalised Float32 matrix to
 * data/embeddings.bin (+ data/embeddings.meta.json).
 *
 *   npm run embed        (needs OPENAI_API_KEY in .env.local)
 */
import fs from 'node:fs';
import path from 'node:path';
import { embedMany } from 'ai';
import { openai } from '@ai-sdk/openai';

const ROOT = path.resolve(__dirname, '..');
const MODEL = 'text-embedding-3-small';

function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}

async function main() {
  loadEnv();
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing (put it in .env.local)');
  const chunks = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/chunks.json'), 'utf8'));
  // Embed the citation context together with the text so section titles are searchable.
  const inputs: string[] = chunks.map(
    (c: any) => `${c.docShort} | ${c.context} | ${c.label}\n${c.text}`.slice(0, 8000),
  );

  const BATCH = 96;
  const all: number[][] = [];
  for (let i = 0; i < inputs.length; i += BATCH) {
    const { embeddings } = await embedMany({
      model: openai.embeddingModel(MODEL),
      values: inputs.slice(i, i + BATCH),
    });
    all.push(...embeddings);
    process.stdout.write(`\rembedded ${Math.min(i + BATCH, inputs.length)}/${inputs.length}`);
  }
  const dims = all[0].length;
  const out = new Float32Array(all.length * dims);
  all.forEach((v, i) => {
    const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0));
    for (let d = 0; d < dims; d++) out[i * dims + d] = v[d] / n;
  });
  fs.writeFileSync(path.join(ROOT, 'data/embeddings.bin'), Buffer.from(out.buffer));
  fs.writeFileSync(
    path.join(ROOT, 'data/embeddings.meta.json'),
    JSON.stringify({ model: MODEL, dims, count: all.length, createdAt: new Date().toISOString() }, null, 2),
  );
  console.log(`\nwrote data/embeddings.bin (${all.length} x ${dims})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
