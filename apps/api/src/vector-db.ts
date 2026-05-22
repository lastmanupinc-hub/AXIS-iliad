// ─── iliad_vector_database — SQLite-backed vector store ─────────
//
// MVP for the AXIS-owned vector capability. Uses the existing
// @axis/snapshots SQLite database (no new dependency) with a
// dedicated `vectors` table. Each row stores a single (namespace, id)
// vector as a Float32 BLOB plus optional JSON metadata. Cosine
// similarity is computed in JS at query time over all rows in the
// namespace — fast enough (~sub-ms) for ≤10k vectors per namespace.
//
// Future upgrade path: replace this module with a LanceDB-on-R2
// implementation. The exported function signatures stay stable; only
// internals change. Until then, accounts get persistent vectors with
// per-namespace isolation that's enforced at the schema level.

import { getDb } from "@axis/snapshots";

export interface VectorRecord {
  id: string;
  vector: number[];
  metadata?: Record<string, unknown>;
}

export interface VectorMatch {
  id: string;
  score: number;
  metadata: Record<string, unknown> | null;
}

export interface QueryOptions {
  vector: number[];
  top_k?: number;
  /** Filter rows by exact-match metadata equality. Keys not present in stored metadata never match. */
  filter?: Record<string, unknown>;
}

let initialized = false;

/**
 * Lazily create the `vectors` table the first time any function in this
 * module touches the database. Using `CREATE TABLE IF NOT EXISTS` matches
 * the pattern @axis/snapshots uses elsewhere, and keeps this feature
 * additive — no schema-version bump in the shared package.
 */
function ensureSchema(): void {
  if (initialized) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS vectors (
      namespace   TEXT NOT NULL,
      id          TEXT NOT NULL,
      vector      BLOB NOT NULL,
      dimensions  INTEGER NOT NULL,
      metadata    TEXT,
      created_at  TEXT NOT NULL,
      PRIMARY KEY (namespace, id)
    );
    CREATE INDEX IF NOT EXISTS idx_vectors_namespace ON vectors(namespace);
  `);
  initialized = true;
}

/** Test-only helper. Clears all rows + resets the lazy-init flag. */
export function resetVectorDbForTests(): void {
  const db = getDb();
  // Drop and recreate so dimension mismatches across test files don't bleed.
  db.exec("DROP TABLE IF EXISTS vectors;");
  initialized = false;
}

// ─── Vector encoding ────────────────────────────────────────────

function encodeVector(v: number[]): Buffer {
  const f = new Float32Array(v);
  return Buffer.from(f.buffer, f.byteOffset, f.byteLength);
}

function decodeVector(b: Buffer): number[] {
  const f = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
  return Array.from(f);
}

// ─── Cosine similarity ──────────────────────────────────────────

/**
 * Cosine similarity in [-1, 1]. Pre-computed magnitudes would marginally
 * speed up scans, but the gain is dominated by the dot product itself
 * at any realistic dimension count.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`cosineSimilarity: dimension mismatch (${a.length} vs ${b.length})`);
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Insert or replace vectors in a namespace. Existing rows with the same
 * (namespace, id) are overwritten. Returns the number of rows actually
 * written.
 */
export function upsertVectors(namespace: string, records: VectorRecord[]): number {
  if (!namespace || typeof namespace !== "string") {
    throw new Error("upsertVectors: namespace is required");
  }
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("upsertVectors: records[] must be a non-empty array");
  }
  ensureSchema();
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    "INSERT OR REPLACE INTO vectors (namespace, id, vector, dimensions, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  );

  // Single transaction so partial inserts don't leave a half-written
  // batch on disk. Throws on the first malformed record.
  let dim = 0;
  const tx = db.transaction((rows: VectorRecord[]) => {
    for (const r of rows) {
      if (!r.id || typeof r.id !== "string") {
        throw new Error("upsertVectors: each record requires a string `id`");
      }
      if (!Array.isArray(r.vector) || r.vector.length === 0) {
        throw new Error(`upsertVectors: record ${r.id} has an empty vector`);
      }
      if (dim === 0) {
        dim = r.vector.length;
      } else if (r.vector.length !== dim) {
        throw new Error(
          `upsertVectors: dimension mismatch in batch (${r.vector.length} vs ${dim})`,
        );
      }
      for (const v of r.vector) {
        if (!Number.isFinite(v)) {
          throw new Error(`upsertVectors: record ${r.id} contains a non-finite value`);
        }
      }
      stmt.run(
        namespace,
        r.id,
        encodeVector(r.vector),
        r.vector.length,
        r.metadata ? JSON.stringify(r.metadata) : null,
        now,
      );
    }
  });

  tx(records);
  return records.length;
}

/**
 * Return the top-k nearest neighbours by cosine similarity. Filters
 * accept a flat key→value map and require exact match against
 * deserialised metadata. Missing keys are treated as non-matches.
 */
export function queryVectors(namespace: string, opts: QueryOptions): VectorMatch[] {
  if (!namespace || typeof namespace !== "string") {
    throw new Error("queryVectors: namespace is required");
  }
  const top_k = opts.top_k ?? 10;
  if (!Number.isFinite(top_k) || top_k <= 0) {
    throw new Error("queryVectors: top_k must be a positive number");
  }
  if (!Array.isArray(opts.vector) || opts.vector.length === 0) {
    throw new Error("queryVectors: vector is required");
  }
  ensureSchema();
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT id, vector, dimensions, metadata FROM vectors WHERE namespace = ?",
    )
    .all(namespace) as Array<{ id: string; vector: Buffer; dimensions: number; metadata: string | null }>;

  const candidates: VectorMatch[] = [];
  for (const row of rows) {
    if (row.dimensions !== opts.vector.length) continue;
    const stored = decodeVector(row.vector);
    const meta = row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : null;
    if (opts.filter) {
      let ok = true;
      for (const [k, expected] of Object.entries(opts.filter)) {
        if (meta === null || meta[k] !== expected) { ok = false; break; }
      }
      if (!ok) continue;
    }
    candidates.push({
      id: row.id,
      score: cosineSimilarity(opts.vector, stored),
      metadata: meta,
    });
  }
  // Stable sort by score desc, then by id asc as tiebreaker so output is deterministic.
  candidates.sort((a, b) => (b.score - a.score) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return candidates.slice(0, Math.floor(top_k));
}

/** Drop every vector in a namespace. Returns the number of rows removed. */
export function deleteNamespace(namespace: string): number {
  if (!namespace || typeof namespace !== "string") {
    throw new Error("deleteNamespace: namespace is required");
  }
  ensureSchema();
  const db = getDb();
  const r = db.prepare("DELETE FROM vectors WHERE namespace = ?").run(namespace);
  return r.changes;
}

/** Count vectors in a namespace. Useful for the upsert response. */
export function countVectors(namespace: string): number {
  ensureSchema();
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM vectors WHERE namespace = ?")
    .get(namespace) as { c: number } | undefined;
  return row?.c ?? 0;
}

// ─── Namespace scoping ──────────────────────────────────────────

/**
 * Prefix a caller-supplied namespace with the account ID so accounts cannot
 * read each other's vectors. Mirrors scopeAccountKey() in object-storage.ts
 * — same defence-in-depth approach.
 */
export function scopeNamespace(account_id: string, raw_namespace: string | undefined): string {
  if (!account_id || typeof account_id !== "string") {
    throw new Error("scopeNamespace: account_id is required");
  }
  const ns = raw_namespace && raw_namespace.length > 0 ? raw_namespace : "default";
  if (ns.length > 200) {
    throw new Error("scopeNamespace: namespace exceeds 200 chars");
  }
  if (ns.includes("..") || ns.includes("/") || ns.includes("\\")) {
    throw new Error("scopeNamespace: namespace must not contain '..', '/', or '\\'");
  }
  return `acct:${account_id}:${ns}`;
}
