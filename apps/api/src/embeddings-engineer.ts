// ─── E12 Domain Embeddings: engineer-tier post-processing ───────
//
// iliad_embeddings' engineer mode makes embeddings work better on the CALLER's
// own data, deterministically + dependency-free, on top of the existing
// embedding pipeline:
//   1. Matryoshka truncation — slice to the most-informative leading dims and
//      L2-renormalize (cheaper/smaller vectors with minimal quality loss).
//   2. Per-corpus adapter — mean-center against the batch ("all-but-the-mean"),
//      which removes the dominant common direction and sharpens retrieval. The
//      fitted mean is returned so the caller can transform future queries the
//      same way.
//
// Pure functions over number[][]. No model, no dependency.

function l2normalize(v: number[]): number[] {
  let sumSq = 0;
  for (const x of v) sumSq += x * x;
  const norm = Math.sqrt(sumSq);
  if (!Number.isFinite(norm) || norm === 0) return v.slice();
  return v.map((x) => x / norm);
}

/** Slice an embedding to its leading `dims` and L2-renormalize (Matryoshka). */
export function matryoshkaTruncate(embedding: number[], dims: number): number[] {
  const d = Math.max(1, Math.min(Math.floor(dims), embedding.length));
  return l2normalize(embedding.slice(0, d));
}

export interface CorpusAdapter {
  mean: number[];
  dims: number;
}

/** Fit a mean-centering adapter to a batch of (same-dimension) embeddings. */
export function fitCorpusAdapter(embeddings: number[][]): CorpusAdapter {
  if (embeddings.length === 0 || embeddings[0].length === 0) return { mean: [], dims: 0 };
  const dims = embeddings[0].length;
  const mean = new Array<number>(dims).fill(0);
  for (const e of embeddings) {
    for (let i = 0; i < dims; i++) mean[i] += e[i] ?? 0;
  }
  for (let i = 0; i < dims; i++) mean[i] /= embeddings.length;
  return { mean, dims };
}

/** Apply a fitted adapter to one embedding: subtract the mean, L2-renormalize. */
export function applyCorpusAdapter(embedding: number[], adapter: CorpusAdapter): number[] {
  if (adapter.dims !== embedding.length) return l2normalize(embedding); // dim mismatch → just normalize
  return l2normalize(embedding.map((x, i) => x - (adapter.mean[i] ?? 0)));
}

export interface EngineerEmbedResult {
  dimensions: number;
  truncated: boolean;
  adapter_applied: boolean;
  embeddings: number[][];
  /** The fitted corpus mean (only when adapter_applied) — apply to future queries. */
  adapter_mean?: number[];
}

/**
 * Engineer-mode post-processing: optional Matryoshka truncation, then optional
 * per-corpus mean-centering. Both deterministic. The output vectors are always
 * L2-normalized. Returns the fitted mean so queries can be aligned later.
 */
export function buildEngineerEmbeddings(
  embeddings: number[][],
  opts: { dimensions?: number; corpus_adapter?: boolean },
): EngineerEmbedResult {
  const fullDims = embeddings[0]?.length ?? 0;
  let out = embeddings;
  let dims = fullDims;
  let truncated = false;

  if (typeof opts.dimensions === "number" && opts.dimensions > 0 && opts.dimensions < fullDims) {
    out = out.map((e) => matryoshkaTruncate(e, opts.dimensions as number));
    dims = Math.floor(opts.dimensions);
    truncated = true;
  } else {
    out = out.map(l2normalize); // normalize even without truncation, for a consistent space
  }

  let adapterMean: number[] | undefined;
  if (opts.corpus_adapter && out.length > 0) {
    const adapter = fitCorpusAdapter(out);
    out = out.map((e) => applyCorpusAdapter(e, adapter));
    adapterMean = adapter.mean;
  }

  return {
    dimensions: dims,
    truncated,
    adapter_applied: Boolean(opts.corpus_adapter) && out.length > 0,
    embeddings: out,
    ...(adapterMean ? { adapter_mean: adapterMean } : {}),
  };
}
