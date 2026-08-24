// ─── app_44_algorithmic_rendered_collections: algorithmic program's Watch → Apply loop ──
//
// docs/saas-strategy/APPLICATION_BUILD_STRATEGY.md #20 — "A: ship the
// rendered outputs (sharp/canvas), parameter matrix exercised, not code the
// user must run. V: every variation in the matrix renders without error. W:
// optional (lowest priority; still the least stack-shaped snack — earns its
// keep as rendered output or not at all). Accepts when: the collection
// exists as images." generateVariationMatrix (generators-algorithmic.ts)
// already derives a real parameter matrix from the repo's own metrics
// (language palette, architecture score, hotspot count) with a `thumbnail`
// path per variation — nobody ever wrote the pixels at that path. This does.
//
// SAFETY: unlike app_41's vale watcher, every render input here comes from
// generateVariationMatrix's own AXIS-derived numbers (colors, seeds, counts)
// — never third-party PR content. Same safety argument canvas-diagram-
// watcher.ts's own header makes for D2: no arbitrary-code-execution surface
// to worry about. Both @napi-rs/canvas and sharp run IN-PROCESS (no
// subprocess, no temp files, no shell) — a narrower surface than either
// app_32's Sentry REST calls or app_41's vale subprocess.
//
// Layout note: generateVariationMatrix's own variation loop only ever
// iterates `layoutVariants.slice(0, 3)` (grid/radial/force-directed) even
// though up to 5 layout names are DECLARED possible in `layoutVariants` —
// treemap and component-tree never appear in a real variation. Only the 3
// that can actually occur are implemented as real algorithms; an
// unrecognized layout name falls back to grid rather than throwing (still
// real rendered output, just not that layout's own algorithm).

import { createCanvas } from "@napi-rs/canvas";
import sharp from "sharp";
import { fetchGitHubRepo, createSnapshot } from "@axis/snapshots";
import type { SnapshotManifest, FileEntry, WatchJobPayload } from "@axis/snapshots";
import { buildContextMap } from "@axis/context-engine";
import { generateVariationMatrix } from "@axis/generator-core";
import {
  openApplyPullRequest,
  applyBranchName,
  type ApplyFile,
  type OpenApplyPrParams,
  type OpenApplyPrResult,
} from "./github-pr.js";

const ALGORITHMIC_PRODUCT_ID = "algorithmic";
export const VARIATION_MATRIX_PATH = "variation-matrix.json";
export const THUMBNAILS_DIR = "thumbnails/";
export const CONTACT_SHEET_PATH = "thumbnails/collection-contact-sheet.png";

const THUMB_WIDTH = 320;
const THUMB_HEIGHT = 180;
const CONTACT_SHEET_COLS = 4;
/** A single repo's matrix is small by construction (2 colors × 2 complexities × 3 layouts today) — this bounds a maximally weird future matrix from forcing an unbounded render batch. */
const MAX_VARIATIONS = 100;

// ─── deterministic seeded RNG ─────────────────────────────────────

/** mulberry32 — deterministic from a numeric seed, no external dependency. Same seed -> same sequence, always (proven by a dedicated test). */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── layout algorithms ─────────────────────────────────────────────
// Each returns element positions for one of the 3 layouts a real variation
// can actually carry (see file header). Pure and deterministic given the
// same rng — grid/radial don't even need it (no randomness in their math).

export interface RenderPoint {
  x: number;
  y: number;
  radius: number;
}

function layoutGrid(count: number, width: number, height: number): RenderPoint[] {
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const cellW = width / cols;
  const cellH = height / rows;
  const points: RenderPoint[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    points.push({ x: (col + 0.5) * cellW, y: (row + 0.5) * cellH, radius: Math.max(2, Math.min(cellW, cellH) * 0.3) });
  }
  return points;
}

function layoutRadial(count: number, width: number, height: number): RenderPoint[] {
  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.min(width, height) * 0.42;
  const points: RenderPoint[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const ringRadius = maxRadius * (0.3 + 0.7 * ((i % 3) / 3));
    points.push({
      x: cx + Math.cos(angle) * ringRadius,
      y: cy + Math.sin(angle) * ringRadius,
      radius: Math.max(2, maxRadius * 0.06),
    });
  }
  return points;
}

function layoutForceDirected(count: number, width: number, height: number, rng: () => number): RenderPoint[] {
  const points: RenderPoint[] = Array.from({ length: count }, () => ({
    x: rng() * width,
    y: rng() * height,
    radius: 4 + rng() * 8,
  }));
  // A few deterministic relaxation passes — pure repulsion, no external
  // forces, same shape as generative-sketch.ts's own simulate() but bounded
  // to a fixed pass count (a real watcher can't animate indefinitely).
  for (let pass = 0; pass < 20; pass++) {
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dx = points[j].x - points[i].x;
        const dy = points[j].y - points[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 1;
        const minDist = points[i].radius + points[j].radius + 10;
        if (dist < minDist) {
          const push = (minDist - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          points[i].x -= nx * push;
          points[i].y -= ny * push;
          points[j].x += nx * push;
          points[j].y += ny * push;
        }
      }
    }
  }
  for (const p of points) {
    p.x = Math.max(p.radius, Math.min(width - p.radius, p.x));
    p.y = Math.max(p.radius, Math.min(height - p.radius, p.y));
  }
  return points;
}

/** Exported so a test can prove each named layout produces a genuinely different point arrangement, not one generic renderer ignoring the `layout` param. */
export function layoutFor(layout: string, count: number, width: number, height: number, rng: () => number): RenderPoint[] {
  switch (layout) {
    case "grid":
      return layoutGrid(count, width, height);
    case "radial":
      return layoutRadial(count, width, height);
    case "force-directed":
      return layoutForceDirected(count, width, height, rng);
    default:
      // Named, not silently wrong: an unrecognized layout name (treemap /
      // component-tree — declared possible, never actually generated, see
      // file header) falls back to grid rather than throwing. A fallback
      // rendering still satisfies "every variation renders without error";
      // it just isn't that layout's own algorithm.
      return layoutGrid(count, width, height);
  }
}

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return { r: 100, g: 116, b: 139 }; // AXIS's own neutral fallback (slate-500) — never throw on an unexpected color string
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// ─── the renderer ───────────────────────────────────────────────────

export interface VariationParams {
  primary_hue: string;
  complexity: number;
  element_count: number;
  layout: string;
  seed: number;
}

export interface Variation {
  id: string;
  thumbnail: string;
  params: VariationParams;
}

/** Real @napi-rs/canvas render — pure given the same input (only force-directed's layout actually consumes the seeded rng). */
export function realRenderVariation(v: Variation, width = THUMB_WIDTH, height = THUMB_HEIGHT): Buffer {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgb(15, 23, 42)"; // AXIS's own dark background, matching generative-sketch.ts's palette
  ctx.fillRect(0, 0, width, height);

  const rng = seededRng(v.params.seed);
  // Found on adversarial review: Math.max/Math.min propagate NaN through
  // unchanged (unlike seededRng's `seed >>> 0`, which safely maps NaN to 0
  // via ToUint32) — an explicit finite check keeps this clamp NaN-safe too.
  const roundedCount = Math.round(v.params.element_count);
  const count = Number.isFinite(roundedCount) ? Math.max(1, Math.min(200, roundedCount)) : 1;
  const points = layoutFor(v.params.layout, count, width, height, rng);
  const { r, g, b } = parseHexColor(v.params.primary_hue);
  const alpha = 0.4 + v.params.complexity * 0.5;

  // force-directed is the only layout whose points cluster — proximity
  // edges are a REAL visual difference driven by its own point positions,
  // not decoration layered onto every layout alike.
  if (v.params.layout === "force-directed") {
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.3})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dx = points[j].x - points[i].x;
        const dy = points[j].y - points[i].y;
        if (Math.sqrt(dx * dx + dy * dy) < width * 0.15) {
          ctx.beginPath();
          ctx.moveTo(points[i].x, points[i].y);
          ctx.lineTo(points[j].x, points[j].y);
          ctx.stroke();
        }
      }
    }
  }

  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
  for (const p of points) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas.toBuffer("image/png");
}

/** Real sharp composite — a grid mosaic of every rendered thumbnail into one collection-overview image. sharp's actual, scoped role here: compositing, not drawing. */
export async function realBuildContactSheet(pngs: Buffer[], cols = CONTACT_SHEET_COLS): Promise<Buffer> {
  if (pngs.length === 0) throw new Error("realBuildContactSheet: no images to composite");
  const rows = Math.ceil(pngs.length / cols);
  const width = cols * THUMB_WIDTH;
  const height = rows * THUMB_HEIGHT;
  const composites = pngs.map((png, i) => ({
    input: png,
    left: (i % cols) * THUMB_WIDTH,
    top: Math.floor(i / cols) * THUMB_HEIGHT,
  }));
  return sharp({ create: { width, height, channels: 4, background: { r: 15, g: 23, b: 42, alpha: 1 } } })
    .composite(composites)
    .png()
    .toBuffer();
}

// ─── V: every variation renders without error ────────────────────

export interface RenderedVariation {
  id: string;
  thumbnail: string;
  png: Buffer;
}
export interface FailedVariation {
  id: string;
  error: string;
}
export interface RenderAllResult {
  rendered: RenderedVariation[];
  failed: FailedVariation[];
}

/**
 * V, verbatim: "every variation in the matrix renders without error."
 * Attempts EVERY variation — one throwing never aborts the batch, so a
 * single bad variation doesn't hide whether every OTHER one is fine (same
 * discipline as app_33's per-provider try/catch). The CALLER decides what
 * "renders without error" means for shipping — see processAlgorithmicRender:
 * any failure blocks the PR outright, because a partial collection is not
 * "the collection exists as images."
 */
export function renderAllVariations(
  variations: Variation[],
  renderOne: (v: Variation) => Buffer,
): RenderAllResult {
  const rendered: RenderedVariation[] = [];
  const failed: FailedVariation[] = [];
  for (const v of variations.slice(0, MAX_VARIATIONS)) {
    // Found on adversarial review: reading v.id/v.thumbnail was previously
    // done INSIDE the try, so a malformed element (v itself null/undefined)
    // threw once there, was caught, then threw AGAIN re-reading v.id in the
    // catch block — a second, unguarded throw that escaped this function
    // entirely, defeating the whole point of per-item isolation ("one
    // throwing never aborts the batch"). Derived defensively BEFORE the try
    // instead, so id/thumbnail can never themselves be a source of failure.
    const id = typeof v?.id === "string" ? v.id : "unknown";
    const thumbnail = typeof v?.thumbnail === "string" ? v.thumbnail : `${THUMBNAILS_DIR}${id}.png`;
    try {
      rendered.push({ id, thumbnail, png: renderOne(v) });
    } catch (err) {
      failed.push({ id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { rendered, failed };
}

// ─── The processor ──────────────────────────────────────────────

export interface AlgorithmicRenderDeps {
  token: string | undefined;
  fetchRepo: (url: string, token: string) => Promise<{ files: FileEntry[] }>;
  renderVariation: (v: Variation) => Buffer;
  buildContactSheet: (pngs: Buffer[]) => Promise<Buffer>;
  openPr: (params: OpenApplyPrParams) => Promise<OpenApplyPrResult>;
}

export type AlgorithmicRenderStatus =
  | "not_algorithmic_product"
  | "no_token"
  | "no_changes"
  | "render_failed"
  | "pr_opened"
  | "pr_skipped";

export interface AlgorithmicRenderResult {
  status: AlgorithmicRenderStatus;
  rendered_count?: number;
  failed_variations?: string[];
  pr?: OpenApplyPrResult;
}

export async function processAlgorithmicRender(
  payload: WatchJobPayload,
  deps: AlgorithmicRenderDeps,
): Promise<AlgorithmicRenderResult> {
  if (payload.product_id !== ALGORITHMIC_PRODUCT_ID) return { status: "not_algorithmic_product" };
  if (!deps.token) return { status: "no_token" };

  const fr = await deps.fetchRepo(`https://github.com/${payload.repo_full_name}`, deps.token);
  // Prior renders are this watcher's own output — never let them feed the
  // regeneration input (the app_11/24/35/32/33 lesson).
  const sourceFiles = fr.files.filter((f) => f.path !== VARIATION_MATRIX_PATH && !f.path.startsWith(THUMBNAILS_DIR));

  const manifest: SnapshotManifest = {
    project_name: payload.repo_full_name,
    project_type: "github_repository",
    frameworks: [],
    goals: ["Render the algorithmic collection"],
    requested_outputs: [],
  };
  const snapshot = await createSnapshot({ input_method: "github_repo_url", manifest, files: sourceFiles }, undefined);
  const ctx = buildContextMap(snapshot);
  const matrixFile = generateVariationMatrix(ctx, sourceFiles);

  const existingMatrix = fr.files.find((f) => f.path === VARIATION_MATRIX_PATH)?.content;
  if (existingMatrix === matrixFile.content) return { status: "no_changes" };

  const parsed = JSON.parse(matrixFile.content) as { variations: Variation[] };
  const { rendered, failed } = renderAllVariations(parsed.variations, deps.renderVariation);

  // V gate: a partial collection is not "the collection exists as images" —
  // any failure blocks the PR outright, named rather than shipped silently thin.
  if (failed.length > 0) {
    return { status: "render_failed", rendered_count: rendered.length, failed_variations: failed.map((f) => f.id) };
  }

  const contactSheet = await deps.buildContactSheet(rendered.map((r) => r.png));

  const { owner, repo } = splitRepo(payload.repo_full_name);
  const files: ApplyFile[] = [
    { path: VARIATION_MATRIX_PATH, content: matrixFile.content },
    ...rendered.map((r) => ({ path: r.thumbnail, content: r.png.toString("base64"), encoding: "base64" as const })),
    { path: CONTACT_SHEET_PATH, content: contactSheet.toString("base64"), encoding: "base64" as const },
  ];
  const pr = await deps.openPr({
    owner,
    repo,
    token: deps.token,
    baseBranch: branchFromRef(payload.ref),
    branchName: applyBranchName("algorithmic-collection", matrixFile.content),
    files,
    title: "AXIS: render algorithmic collection",
    body: buildPrBody(rendered.length),
  });
  return { status: pr.opened ? "pr_opened" : "pr_skipped", rendered_count: rendered.length, pr };
}

function branchFromRef(ref: string): string {
  return ref.replace(/^refs\/heads\//, "") || "main";
}

function splitRepo(fullName: string): { owner: string; repo: string } {
  const i = fullName.indexOf("/");
  return { owner: fullName.slice(0, i), repo: fullName.slice(i + 1) };
}

function buildPrBody(count: number): string {
  return [
    "AXIS rendered this repository's algorithmic collection — every variation in the parameter matrix, as real images.",
    "",
    `- \`${VARIATION_MATRIX_PATH}\` — the parameter matrix this collection was rendered from`,
    `- \`${THUMBNAILS_DIR}var_*.png\` — ${count} rendered variation${count === 1 ? "" : "s"}, one per matrix entry`,
    `- \`${CONTACT_SHEET_PATH}\` — a single overview image of the whole collection`,
    "",
    "Every render is deterministic (seeded from the matrix's own seed values) — the same repo state always renders the same pixels.",
    "",
    "— Generated by AXIS Algorithmic (watch mechanic, app_44).",
  ].join("\n");
}

export function defaultAlgorithmicRenderDeps(): AlgorithmicRenderDeps {
  return {
    token: process.env.GITHUB_TOKEN,
    fetchRepo: (url, token) => fetchGitHubRepo(url, token),
    renderVariation: realRenderVariation,
    buildContactSheet: realBuildContactSheet,
    openPr: (params) => openApplyPullRequest(fetch, params),
  };
}
