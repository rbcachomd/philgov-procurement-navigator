export type Chunk = {
  id: string;
  docId: 'ra12009' | 'ra9184';
  docShort: string;
  docTitle: string;
  docStatus: string;
  file: string;
  rule: string | null;
  ruleTitle: string | null;
  section: number | null;
  part: string | null;
  label: string;
  context: string;
  page: number;
  pageEnd: number;
  part_index: number;
  text: string;
};

export type SearchHit = Chunk & {
  score: number;
  vectorRank: number | null;
  keywordRank: number | null;
};

/** What the retrieval tool returns to the model and to the UI. */
export type SourceRef = {
  ref: number;
  docId: Chunk['docId'];
  docShort: string;
  docStatus: string;
  citation: string;
  label: string;
  context: string;
  page: number;
  pageEnd: number;
  pdfUrl: string;
  excerpt: string;
  match: string;
};
