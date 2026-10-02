import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Ship the pre-computed vector index with the serverless chat function.
  outputFileTracingIncludes: {
    '/api/chat': ['./data/embeddings.bin', './data/embeddings.meta.json'],
  },
};

export default nextConfig;
