// ─── iliad_web_search — AXIS-owned BM25 search over cached docs ─
//
// Honest "owned" scope: this is NOT a Google/Bing scraper. It's a
// search engine over content YOUR AXIS instance has indexed —
// pages fetched via iliad_web_research, docs pushed in by agents,
// snapshot-derived content, etc. BM25 ranking, account-scoped
// namespacing, persistent across restarts via the existing
// @axis/snapshots SQLite database.
//
// Why this scope? AXIS doesn't operate a web crawler with billions
// of pages indexed; reselling Google/Bing without paying them is
// a legal/operational mine field; honest "owned" search means
// search over a corpus we actually own. Agents that have spent
// real budget calling iliad_web_research now get free-tier
// retrieval back across their cached content. Agents that haven't
// indexed anything get a clean empty result with guidance.
//
// Future upgrade path: an inverted index instead of full-table
// scan; we'll add it the first time per-query latency exceeds a
// few ms. Until then, the per-doc tf precompute keeps query cost
// O(N × |Q|) per namespace which is fast enough for ≤100k docs.

import { getDb } from "@axis/snapshots";

export interface SearchDocument {
  /** Stable id within the namespace. */
  doc_id: string;
  /** Source URL (optional but recommended — surfaced in search hits). */
  url?: string;
  /** Human-readable title (optional). */
  title?: string;
  /** Indexable body text. Required, 1-1 MiB. */
  content: string;
  /** Arbitrary JSON metadata (max 64 KiB serialized). */
  metadata?: Record<string, unknown>;
}

export interface SearchHit {
  doc_id: string;
  url: string | null;
  title: string | null;
  snippet: string;
  score: number;
  metadata: Record<string, unknown> | null;
}

export interface SearchOptions {
  query: string;
  /** Top-k cap on results. Defaults 10, max 100. */
  max_results?: number;
  /** Restrict to docs whose stored URL host matches this string (exact match, case-insensitive). */
  site?: string;
}

let initialized = false;

function ensureSchema(): void {
  if (initialized) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS search_documents (
      namespace    TEXT NOT NULL,
      doc_id       TEXT NOT NULL,
      url          TEXT,
      url_host     TEXT,
      title        TEXT,
      content      TEXT NOT NULL,
      content_len  INTEGER NOT NULL,
      tf_json      TEXT NOT NULL,
      metadata     TEXT,
      created_at   TEXT NOT NULL,
      PRIMARY KEY (namespace, doc_id)
    );
    CREATE INDEX IF NOT EXISTS idx_search_docs_ns ON search_documents(namespace);
    CREATE INDEX IF NOT EXISTS idx_search_docs_ns_host ON search_documents(namespace, url_host);
  `);
  initialized = true;
}

/** Test-only helper. Drops the table + resets lazy-init. */
export function resetWebSearchForTests(): void {
  const db = getDb();
  db.exec("DROP TABLE IF EXISTS search_documents;");
  initialized = false;
}

// ─── Tokenization ───────────────────────────────────────────────

// Tiny stop-word set keeps the index lean without language-specific
// processing. BM25's IDF already down-weights high-df tokens so this
// is more about saving bytes than correctness.
const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "of", "in", "on", "at",
  "to", "for", "by", "with", "from", "as", "is", "are", "was", "were", "be",
  "been", "being", "has", "have", "had", "do", "does", "did", "this", "that",
  "these", "those", "it", "its", "i", "you", "he", "she", "we", "they",
  "what", "which", "who", "whom", "when", "where", "why", "how",
]);

export function tokenize(text: string): string[] {
  if (typeof text !== "string" || text.length === 0) return [];
  const lowered = text.toLowerCase();
  const tokens: string[] = [];
  // Match runs of letters/digits/_ — same as \w in ASCII. Avoid a regex
  // global to skip allocator churn on giant docs.
  let buf = "";
  for (let i = 0; i < lowered.length; i++) {
    const c = lowered.charCodeAt(i);
    // a-z 97-122, 0-9 48-57, _ 95
    if ((c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95) {
      buf += lowered[i];
    } else {
      if (buf.length >= 2 && !STOP_WORDS.has(buf)) tokens.push(buf);
      buf = "";
    }
  }
  if (buf.length >= 2 && !STOP_WORDS.has(buf)) tokens.push(buf);
  return tokens;
}

function termFrequencies(tokens: string[]): Record<string, number> {
  const tf: Record<string, number> = {};
  for (const t of tokens) tf[t] = (tf[t] ?? 0) + 1;
  return tf;
}

// ─── URL host extraction (no upfront URL parse cost on hot path) ─

function extractHost(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.host.toLowerCase();
  } catch {
    return null;
  }
}

// ─── Validation ─────────────────────────────────────────────────

const MAX_CONTENT_BYTES = 1_048_576; // 1 MiB
const MAX_METADATA_BYTES = 65_536;   // 64 KiB
const MAX_QUERY_CHARS = 1024;
const MAX_DOC_ID_CHARS = 200;
const DEFAULT_MAX_RESULTS = 10;
const HARD_MAX_RESULTS = 100;

function validateDocument(d: SearchDocument): { tfJson: string; metadataJson: string | null; urlHost: string | null } {
  if (!d || typeof d !== "object") {
    throw new Error("addDocument: document is required");
  }
  if (typeof d.doc_id !== "string" || d.doc_id.length === 0) {
    throw new Error("addDocument: doc_id must be a non-empty string");
  }
  if (d.doc_id.length > MAX_DOC_ID_CHARS) {
    throw new Error(`addDocument: doc_id exceeds ${MAX_DOC_ID_CHARS} chars`);
  }
  if (typeof d.content !== "string" || d.content.length === 0) {
    throw new Error(`addDocument: content must be a non-empty string`);
  }
  if (Buffer.byteLength(d.content, "utf8") > MAX_CONTENT_BYTES) {
    throw new Error(`addDocument: content exceeds ${MAX_CONTENT_BYTES} bytes`);
  }
  if (d.url !== undefined) {
    if (typeof d.url !== "string" || d.url.length === 0) {
      throw new Error("addDocument: url must be a non-empty string when provided");
    }
  }
  if (d.title !== undefined && typeof d.title !== "string") {
    throw new Error("addDocument: title must be a string when provided");
  }
  let metadataJson: string | null = null;
  if (d.metadata !== undefined) {
    if (typeof d.metadata !== "object" || Array.isArray(d.metadata)) {
      throw new Error("addDocument: metadata must be a plain object");
    }
    metadataJson = JSON.stringify(d.metadata);
    if (metadataJson.length > MAX_METADATA_BYTES) {
      throw new Error(`addDocument: metadata JSON exceeds ${MAX_METADATA_BYTES} bytes`);
    }
  }
  const tokens = tokenize(`${d.title ?? ""} ${d.content}`);
  const tfJson = JSON.stringify(termFrequencies(tokens));
  return { tfJson, metadataJson, urlHost: extractHost(d.url) };
}

// ─── Public API: indexing ───────────────────────────────────────

export function addDocument(namespace: string, doc: SearchDocument): void {
  if (!namespace || typeof namespace !== "string") {
    throw new Error("addDocument: namespace is required");
  }
  const { tfJson, metadataJson, urlHost } = validateDocument(doc);
  ensureSchema();
  const db = getDb();
  db.prepare(
    "INSERT OR REPLACE INTO search_documents (namespace, doc_id, url, url_host, title, content, content_len, tf_json, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    namespace,
    doc.doc_id,
    doc.url ?? null,
    urlHost,
    doc.title ?? null,
    doc.content,
    Buffer.byteLength(doc.content, "utf8"),
    tfJson,
    metadataJson,
    new Date().toISOString(),
  );
}

/** Batch add. Transactional — a malformed doc aborts the whole batch. */
export function addDocuments(namespace: string, docs: SearchDocument[]): number {
  if (!Array.isArray(docs) || docs.length === 0) {
    throw new Error("addDocuments: docs[] must be a non-empty array");
  }
  ensureSchema();
  const db = getDb();
  const tx = db.transaction((rows: SearchDocument[]) => {
    for (const d of rows) addDocument(namespace, d);
  });
  tx(docs);
  return docs.length;
}

export function deleteSearchNamespace(namespace: string): number {
  if (!namespace || typeof namespace !== "string") {
    throw new Error("deleteSearchNamespace: namespace is required");
  }
  ensureSchema();
  const db = getDb();
  return db.prepare("DELETE FROM search_documents WHERE namespace = ?").run(namespace).changes;
}

export function deleteDocument(namespace: string, doc_id: string): boolean {
  if (!namespace || typeof namespace !== "string") {
    throw new Error("deleteDocument: namespace is required");
  }
  if (!doc_id || typeof doc_id !== "string") {
    throw new Error("deleteDocument: doc_id is required");
  }
  ensureSchema();
  const db = getDb();
  return db
    .prepare("DELETE FROM search_documents WHERE namespace = ? AND doc_id = ?")
    .run(namespace, doc_id).changes > 0;
}

export function countSearchDocuments(namespace: string): number {
  ensureSchema();
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM search_documents WHERE namespace = ?")
    .get(namespace) as { c: number } | undefined;
  return row?.c ?? 0;
}

// ─── BM25 search ────────────────────────────────────────────────

// BM25 hyperparameters — k1 controls term-frequency saturation, b
// controls length normalization. The wikipedia "Okapi BM25" defaults
// are the right starting point and almost never need tuning until
// you have real users complaining.
const BM25_K1 = 1.5;
const BM25_B = 0.75;
const SNIPPET_RADIUS_CHARS = 80;
const SNIPPET_MAX_CHARS = 240;

interface InternalDocRow {
  doc_id: string;
  url: string | null;
  title: string | null;
  content: string;
  content_len: number;
  tf_json: string;
  metadata: string | null;
}

function makeSnippet(content: string, queryTokens: string[]): string {
  if (queryTokens.length === 0) return content.slice(0, SNIPPET_MAX_CHARS);
  const lowered = content.toLowerCase();
  let bestIdx = -1;
  for (const t of queryTokens) {
    const idx = lowered.indexOf(t);
    if (idx >= 0 && (bestIdx < 0 || idx < bestIdx)) bestIdx = idx;
  }
  if (bestIdx < 0) return content.slice(0, SNIPPET_MAX_CHARS);
  const start = Math.max(0, bestIdx - SNIPPET_RADIUS_CHARS);
  const end = Math.min(content.length, start + SNIPPET_MAX_CHARS);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < content.length ? "…" : "";
  return prefix + content.slice(start, end) + suffix;
}

export function searchDocuments(namespace: string, opts: SearchOptions): SearchHit[] {
  if (!namespace || typeof namespace !== "string") {
    throw new Error("searchDocuments: namespace is required");
  }
  if (!opts || typeof opts !== "object") {
    throw new Error("searchDocuments: options object required");
  }
  if (typeof opts.query !== "string" || opts.query.length === 0) {
    throw new Error("searchDocuments: query must be a non-empty string");
  }
  if (opts.query.length > MAX_QUERY_CHARS) {
    throw new Error(`searchDocuments: query exceeds ${MAX_QUERY_CHARS} chars`);
  }
  const rawMax = opts.max_results ?? DEFAULT_MAX_RESULTS;
  if (!Number.isFinite(rawMax) || rawMax <= 0) {
    throw new Error("searchDocuments: max_results must be a positive number");
  }
  const max_results = Math.min(Math.floor(rawMax), HARD_MAX_RESULTS);
  if (opts.site !== undefined) {
    if (typeof opts.site !== "string" || opts.site.length === 0) {
      throw new Error("searchDocuments: site must be a non-empty string when provided");
    }
  }

  const queryTokens = Array.from(new Set(tokenize(opts.query)));
  if (queryTokens.length === 0) return [];

  ensureSchema();
  const db = getDb();

  const rows = (opts.site
    ? db
        .prepare(
          "SELECT doc_id, url, title, content, content_len, tf_json, metadata FROM search_documents WHERE namespace = ? AND url_host = ?",
        )
        .all(namespace, opts.site.toLowerCase())
    : db
        .prepare(
          "SELECT doc_id, url, title, content, content_len, tf_json, metadata FROM search_documents WHERE namespace = ?",
        )
        .all(namespace)) as InternalDocRow[];

  if (rows.length === 0) return [];

  // Pre-compute corpus stats (avgdl + per-token document-frequency)
  // across just the rows we're scoring against. Filtering by site
  // means df comes from the filtered subcorpus, which is what users
  // expect when restricting to a domain.
  const totalDocs = rows.length;
  let totalLen = 0;
  const dfMap = new Map<string, number>();
  const docTfMaps: Array<Record<string, number>> = [];
  for (const r of rows) {
    totalLen += r.content_len;
    let tf: Record<string, number>;
    try {
      tf = JSON.parse(r.tf_json) as Record<string, number>;
    } catch {
      tf = {};
    }
    docTfMaps.push(tf);
    for (const q of queryTokens) {
      if (tf[q] && tf[q] > 0) dfMap.set(q, (dfMap.get(q) ?? 0) + 1);
    }
  }
  const avgdl = totalDocs > 0 ? totalLen / totalDocs : 0;

  const hits: SearchHit[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const tf = docTfMaps[i];
    let score = 0;
    for (const q of queryTokens) {
      const f = tf[q] ?? 0;
      if (f === 0) continue;
      const df = dfMap.get(q) ?? 0;
      // Okapi BM25 IDF — the "+1" inside the log keeps it non-negative
      // even when df > N/2 (common for short corpora).
      const idf = Math.log(((totalDocs - df + 0.5) / (df + 0.5)) + 1);
      const docLen = r.content_len || 1;
      const denom = f + BM25_K1 * (1 - BM25_B + BM25_B * (docLen / (avgdl || 1)));
      score += idf * ((f * (BM25_K1 + 1)) / denom);
    }
    if (score <= 0) continue;
    let meta: Record<string, unknown> | null = null;
    if (r.metadata) {
      try {
        meta = JSON.parse(r.metadata) as Record<string, unknown>;
      } catch {
        meta = null;
      }
    }
    hits.push({
      doc_id: r.doc_id,
      url: r.url,
      title: r.title,
      snippet: makeSnippet(r.content, queryTokens),
      score,
      metadata: meta,
    });
  }
  hits.sort((a, b) => (b.score - a.score) || (a.doc_id < b.doc_id ? -1 : a.doc_id > b.doc_id ? 1 : 0));
  return hits.slice(0, max_results);
}

// ─── Namespace scoping ──────────────────────────────────────────

export function scopeSearchNamespace(
  account_id: string,
  raw_namespace: string | undefined,
): string {
  if (!account_id || typeof account_id !== "string") {
    throw new Error("scopeSearchNamespace: account_id is required");
  }
  const ns = raw_namespace && raw_namespace.length > 0 ? raw_namespace : "default";
  if (ns.length > 200) {
    throw new Error("scopeSearchNamespace: namespace exceeds 200 chars");
  }
  if (ns.includes("..") || ns.includes("/") || ns.includes("\\")) {
    throw new Error("scopeSearchNamespace: namespace must not contain '..', '/', or '\\'");
  }
  return `acct:${account_id}:${ns}`;
}

// ─── Engineer tier (E3): Answer Engine ──────────────────────────
//
// A DETERMINISTIC extractive answer over the account's own BM25 corpus: a lexical
// rerank by query-term coverage, then assemble the best sentence from each top
// hit into a grounded answer carrying [n] citation spans. Refuses when the best
// span covers too few of the query terms — no LLM, no hallucinated confidence.
// True BM25⊕vector fusion + a cross-encoder is E4 (needs pgvector).

export interface AnswerCitation {
  n: number;
  doc_id: string;
  title: string | null;
  url: string | null;
  span: string;
  score: number;
}

export interface AnswerResult {
  answer: string;
  citations: AnswerCitation[];
  refused: boolean;
  reason: string;
  reranked: SearchHit[];
}

/** Best sentence in `text` by distinct-query-token coverage (ties → first). */
function bestSpan(text: string, queryTokens: Set<string>): { span: string; coverage: number } {
  const sentences = text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  const candidates = sentences.length > 0 ? sentences : [text.trim()];
  let best = candidates[0] ?? "";
  let bestCov = -1;
  for (const s of candidates) {
    const toks = new Set(tokenize(s));
    let hit = 0;
    for (const q of queryTokens) if (toks.has(q)) hit++;
    const cov = queryTokens.size > 0 ? hit / queryTokens.size : 0;
    if (cov > bestCov) { bestCov = cov; best = s; }
  }
  return { span: best, coverage: Math.max(0, bestCov) };
}

/**
 * Build a grounded extractive answer from ranked BM25 hits. Reranks by
 * BM25-score × (1 + best-span coverage) so broadly on-topic hits beat
 * single-term spikes; refuses when even the top hit's best span covers fewer
 * than `min_coverage` of the query's distinct terms.
 */
export function answerFromHits(
  query: string,
  hits: SearchHit[],
  opts?: { max_citations?: number; min_coverage?: number },
): AnswerResult {
  const maxCit = Math.max(1, Math.min(opts?.max_citations ?? 3, 10));
  const minCov = opts?.min_coverage ?? 0.5;
  const queryTokens = new Set(tokenize(query));

  const scored = hits.map(h => {
    const { coverage } = bestSpan(`${h.title ?? ""} ${h.snippet}`, queryTokens);
    // Coverage-primary rerank: how many distinct query terms the hit addresses,
    // scaled by a log of the BM25 magnitude — so a high-frequency single-term
    // spike can't outrank a hit that actually covers the question. Non-finite
    // scores (only reachable via a direct caller, not MCP) coerce to 0.
    const score = Number.isFinite(h.score) ? Math.max(0, h.score) : 0;
    return { h, coverage, rerank: coverage * (1 + Math.log(1 + score)) };
  });
  scored.sort((a, b) => (b.rerank - a.rerank) || (a.h.doc_id < b.h.doc_id ? -1 : a.h.doc_id > b.h.doc_id ? 1 : 0));
  const reranked = scored.map(s => s.h);
  const maxCoverage = scored.reduce((m, s) => Math.max(m, s.coverage), 0);

  if (scored.length === 0 || maxCoverage < minCov) {
    return {
      answer: "",
      citations: [],
      refused: true,
      reason:
        scored.length === 0
          ? "No document in your indexed corpus matches the query."
          : `Insufficient evidence: the best match covers only ${Math.round(maxCoverage * 100)}% of the query terms (need ${Math.round(minCov * 100)}%). Index more sources or rephrase.`,
      reranked,
    };
  }

  const citations: AnswerCitation[] = scored.slice(0, maxCit).map((s, i) => {
    const { span } = bestSpan(s.h.snippet, queryTokens);
    return { n: i + 1, doc_id: s.h.doc_id, title: s.h.title, url: s.h.url, span, score: Math.round(s.rerank * 1000) / 1000 };
  });
  const answer = citations.map(c => `${c.span} [${c.n}]`).join(" ");
  return { answer, citations, refused: false, reason: "", reranked };
}
