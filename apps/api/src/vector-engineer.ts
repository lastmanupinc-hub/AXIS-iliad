// ─── E4 Managed Memory: engineer-tier retrieval post-processing ──
//
// iliad_vector_database's engineer upgrade — "managed forgetting". Deterministic,
// dependency-free transforms over query/upsert results that the pgvector ANN path
// (vector-db.ts) feeds:
//   • applyRecencyDecay — down-weight matches by age (exponential half-life), so
//     stale memories fade unless re-reinforced.
//   • reciprocalRankFusion — fuse the dense (vector) ranking with a sparse
//     (keyword/metadata) ranking via RRF, for hybrid retrieval.
//   • semanticDedup — collapse near-duplicate vectors at upsert time so the store
//     doesn't accumulate redundant memories.
//
// Pure functions. No DB, no clock (the caller passes `now`), no randomness.

export interface DecayInput {
  id: string;
  score: number; // base similarity, typically cosine in [-1, 1]
  created_at_ms: number; // epoch millis the vector was written
  metadata?: Record<string, unknown> | null;
}

export interface DecayedMatch {
  id: string;
  score: number; // decayed score
  base_score: number; // pre-decay similarity
  age_days: number;
  metadata: Record<string, unknown> | null;
}

const MS_PER_DAY = 86_400_000;

/**
 * Down-weight each match by an exponential half-life: decayed = base * 2^(-age/half_life).
 * A match `half_life_days` old keeps half its score; twice that, a quarter; etc.
 * `now_ms` is supplied by the caller (no wall-clock here → deterministic + testable).
 * Re-sorted by decayed score desc, id asc as a stable tiebreak.
 */
export function applyRecencyDecay(
  matches: DecayInput[],
  opts: { now_ms: number; half_life_days: number },
): DecayedMatch[] {
  const halfLife = Number.isFinite(opts.half_life_days) && opts.half_life_days > 0 ? opts.half_life_days : 30;
  const now = Number.isFinite(opts.now_ms) ? opts.now_ms : 0;
  const out = matches.map((m) => {
    const created = Number.isFinite(m.created_at_ms) ? m.created_at_ms : now;
    const ageDays = Math.max(0, (now - created) / MS_PER_DAY);
    const factor = Math.pow(2, -ageDays / halfLife);
    return {
      id: m.id,
      score: m.score * factor,
      base_score: m.score,
      age_days: Math.round(ageDays * 1000) / 1000,
      metadata: m.metadata ?? null,
    };
  });
  out.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

export interface FusedItem {
  id: string;
  rrf_score: number;
  ranks: Record<string, number>; // per-list 1-based rank (only lists that contained it)
}

/**
 * Reciprocal Rank Fusion: combine several ranked id-lists into one ranking by
 * summing 1/(k + rank) across the lists an id appears in. `k` (default 60) damps
 * the influence of top ranks — the standard RRF constant. Order-stable: ties
 * break by id asc. Lists are assumed pre-sorted best-first.
 */
export function reciprocalRankFusion(rankings: Record<string, string[]>, k = 60): FusedItem[] {
  const kk = Number.isFinite(k) && k > 0 ? k : 60;
  const acc = new Map<string, { score: number; ranks: Record<string, number> }>();
  for (const [list, ids] of Object.entries(rankings)) {
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const rank = i + 1;
      const entry = acc.get(id) ?? { score: 0, ranks: {} };
      entry.score += 1 / (kk + rank);
      entry.ranks[list] = rank;
      acc.set(id, entry);
    }
  }
  const out: FusedItem[] = [...acc.entries()].map(([id, v]) => ({ id, rrf_score: v.score, ranks: v.ranks }));
  out.sort((a, b) => b.rrf_score - a.rrf_score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

export interface DedupRecord {
  id: string;
  vector: number[];
}

export interface DedupResult {
  kept: string[]; // ids retained
  dropped: Array<{ id: string; duplicate_of: string; similarity: number }>;
}

function l2norm(v: number[]): number {
  let s = 0;
  for (const x of v) s += x * x;
  return Math.sqrt(s);
}

/** Cosine similarity; returns 0 for a zero or dimension-mismatched vector (never NaN). */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
  const na = l2norm(a);
  const nb = l2norm(b);
  if (na === 0 || nb === 0) return 0;
  const c = dot / (na * nb);
  return Number.isFinite(c) ? c : 0;
}

/**
 * Collapse near-duplicate vectors within a batch: walk in input order, keep a
 * vector only if it isn't within `threshold` cosine of an already-kept one. The
 * first occurrence wins; later near-duplicates are reported with what they
 * duplicate. O(n·k) over kept set k — fine for an upsert batch.
 */
export function semanticDedup(records: DedupRecord[], threshold: number): DedupResult {
  const t = Number.isFinite(threshold) ? Math.max(-1, Math.min(1, threshold)) : 0.97;
  const kept: Array<{ id: string; vector: number[] }> = [];
  const dropped: DedupResult["dropped"] = [];
  for (const r of records) {
    let dup: { id: string; similarity: number } | null = null;
    for (const k of kept) {
      const sim = cosine(r.vector, k.vector);
      if (sim >= t && (dup === null || sim > dup.similarity)) dup = { id: k.id, similarity: sim };
    }
    if (dup) dropped.push({ id: r.id, duplicate_of: dup.id, similarity: Math.round(dup.similarity * 1e6) / 1e6 });
    else kept.push({ id: r.id, vector: r.vector });
  }
  return { kept: kept.map((k) => k.id), dropped };
}
