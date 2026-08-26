// ─── pitch — the compose pass: inference with a citation oracle ──────────────
//
// The deterministic generator (generators-pitch.ts) refuses to invent what a
// repo cannot testify to, so its owner-input slots ship as labeled
// placeholders. The Avatar Foundry dogfood (2026-08-26) proved that honest
// and useless: ~70% of the deck was a form. The owner's correction is now
// doctrine — DRAFT-OVER-ASK: "I would rather a user say that's not accurate
// and explain than ask them a question." This module is that doctrine's
// runtime half: for each investor question, an LLM drafts bullets FROM the
// snapshot's own documents, and a DETERMINISTIC CITATION ORACLE verifies
// every draft before it can touch a slide:
//
//   1. the cited file must exist in the snapshot,
//   2. the cited fact must actually appear in that file (whitespace-
//      normalized substring),
//   3. every number in the bullet must appear in the cited fact or file —
//      an invented number is dropped, never rendered,
//
// Same architecture as Living Architecture's propose (LLM) → verify (fact
// oracle) → render pass, and the same graceful degradation: no local model
// configured ⇒ the original deck is returned untouched with a labeled
// report, never a crash and never silent fabrication. Verified bullets are
// tagged "[inferred]" — the deck's credibility typography — so a reader can
// correct a wrong inference in seconds instead of authoring from a blank.

import type { CompletionFn, CompletionLike } from "./living-architecture.js";

export interface ComposeSourceFile {
  path: string;
  content: string;
}

interface ComposeSlide {
  n: number;
  title: string;
  bullets: string[];
  speaker_notes: string;
  art: string;
  provenance?: string;
  owner_inputs?: string[];
}

export interface ComposeDeck {
  project: string | null;
  slides: ComposeSlide[];
  [key: string]: unknown;
}

export interface QuestionReport {
  key: string;
  slide: number;
  proposed: number;
  kept: number;
  dropped: number;
  drop_reasons: string[];
}

export type ComposeDegradedReason = "not_configured" | "completion_threw" | "malformed_response";

export interface ComposeReport {
  configured: boolean;
  degraded_reason?: ComposeDegradedReason;
  questions: QuestionReport[];
  kept_total: number;
  dropped_total: number;
}

export interface ComposeResult {
  deck: ComposeDeck;
  report: ComposeReport;
}

interface DraftBullet {
  bullet: string;
  file: string;
  fact: string;
}

/** The six investor questions, each targeting the evidence-skeleton slide
 * whose owner-input slot it fills. Slide numbers match generators-pitch.ts's
 * buildSlides() order (v2). */
const QUESTIONS: Array<{ key: string; slide: number; ask: string }> = [
  { key: "thesis", slide: 1, ask: "The investment thesis: the two or three things an investor must believe to want to own this, grounded in what the documents show the product demonstrably is or does." },
  { key: "problem", slide: 2, ask: "The customer pain this product removes, and how the customer copes today — stated concretely enough that an investor can retell it. Use only pain the documents themselves describe or quantify." },
  { key: "traction", slide: 4, ask: "Evidence of momentum and working software: releases, live deployments, maturity ledgers, velocity — never adoption or revenue unless a document states it. If documents state there is no revenue, say so plainly as a strength of candor." },
  { key: "model", slide: 5, ask: "Who pays, for what, at what price — only prices and plans that appear verbatim in the documents. Never derive or estimate a price." },
  { key: "market", slide: 6, ask: "The bottom-up market case: who the buyer is and what one customer is worth, using only buyer segments and per-customer figures the documents name. Never a top-down market size." },
  { key: "team", slide: 7, ask: "What the documents prove about who builds this — shipped scope, cadence, process. The repo testifies to output, not identity; do not invent names, bios, or credentials." },
];

const MAX_BULLETS_PER_QUESTION = 4;
const MAX_BULLET_CHARS = 320;
const MAX_DOC_FILES = 14;
const MAX_DOC_CHARS = 6_000;

/** Doc-shaped files worth mining: top-level markdown/yaml plus README anywhere. */
export function selectEvidenceFiles(files: ComposeSourceFile[]): ComposeSourceFile[] {
  const docLike = files.filter((f) => {
    const p = f.path.toLowerCase();
    if (!/\.(md|ya?ml)$/.test(p)) return false;
    if (/(^|\/)node_modules\//.test(p)) return false;
    return /(^|\/)readme\.md$/.test(p) || !p.includes("/") || /^docs\//.test(p);
  });
  // READMEs first (the claims-audit precedent: the self-description carries
  // the densest investor-relevant prose), then by path for determinism.
  docLike.sort((a, b) => {
    const ar = /(^|\/)readme\.md$/i.test(a.path) ? 0 : 1;
    const br = /(^|\/)readme\.md$/i.test(b.path) ? 0 : 1;
    return ar - br || a.path.localeCompare(b.path);
  });
  return docLike.slice(0, MAX_DOC_FILES).map((f) => ({ path: f.path, content: f.content.slice(0, MAX_DOC_CHARS) }));
}

function buildPrompt(question: { ask: string }, evidence: ComposeSourceFile[]): string {
  const docs = evidence.map((f) => `=== FILE: ${f.path} ===\n${f.content}`).join("\n\n");
  return [
    `QUESTION: ${question.ask}`,
    "",
    "Answer as a JSON array of at most 4 objects, each:",
    '{"bullet":"one investor-readable clause","file":"path of the source document","fact":"the verbatim sentence or line from that file the bullet rests on"}',
    "",
    "HARD RULES: every bullet must rest on a fact copied VERBATIM from one of the documents below; the file field must be one of the paths shown; any number in a bullet must appear in its fact. If the documents cannot answer, return [].",
    "",
    docs,
  ].join("\n");
}

const SYSTEM_PROMPT =
  "You draft investor-deck bullets strictly from supplied documents. You never invent facts, numbers, names, or prices. Output only the JSON array, no prose.";

export function parseDrafts(text: string): DraftBullet[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: DraftBullet[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const d = item as Record<string, unknown>;
    if (typeof d.bullet !== "string" || typeof d.file !== "string" || typeof d.fact !== "string") continue;
    if (!d.bullet.trim() || !d.fact.trim()) continue;
    out.push({ bullet: d.bullet.trim(), file: d.file.trim(), fact: d.fact.trim() });
    if (out.length >= MAX_BULLETS_PER_QUESTION) break;
  }
  return out;
}

const normalize = (s: string): string => s.replace(/\s+/g, " ").trim().toLowerCase();

/** The citation oracle — deterministic, and the whole reason inferred content
 * is allowed on a slide at all. Returns null when the draft survives, else the
 * drop reason. */
export function draftDropReason(draft: DraftBullet, files: ComposeSourceFile[]): string | null {
  if (draft.bullet.length > MAX_BULLET_CHARS) return "bullet exceeds length cap";
  const cited = files.find((f) => f.path === draft.file);
  if (!cited) return `cited file ${draft.file} not in snapshot`;
  const haystack = normalize(cited.content);
  if (!haystack.includes(normalize(draft.fact))) return `cited fact not found in ${draft.file}`;
  // No invented numbers: every digit-run in the bullet must appear in the
  // cited fact or, failing that, anywhere in the cited file.
  const numbers = draft.bullet.match(/\d[\d,.]*/g) ?? [];
  const factNorm = normalize(draft.fact);
  for (const n of numbers) {
    const needle = n.toLowerCase();
    if (!factNorm.includes(needle) && !haystack.includes(needle)) {
      return `number ${n} appears in neither the cited fact nor ${draft.file}`;
    }
  }
  return null;
}

const OWNER_INPUT_PREFIX = "OWNER INPUT REQUIRED";

/**
 * Run the compose pass. Pure given its inputs: `completion` is injected
 * (runCompletion in production, a fake in tests). Never throws on completion
 * failure — degrades to the original deck with a labeled report.
 */
export async function composePitchDeck(
  deck: ComposeDeck,
  files: ComposeSourceFile[],
  completion: CompletionFn,
): Promise<ComposeResult> {
  const evidence = selectEvidenceFiles(files);
  const questions: QuestionReport[] = [];
  const slides = deck.slides.map((s) => ({ ...s, bullets: [...s.bullets], owner_inputs: s.owner_inputs ? [...s.owner_inputs] : undefined }));
  let keptTotal = 0;
  let droppedTotal = 0;
  let degraded: ComposeDegradedReason | undefined;

  for (const q of QUESTIONS) {
    const slide = slides.find((s) => s.n === q.slide);
    if (!slide) continue;
    let res: CompletionLike;
    try {
      res = await completion({ prompt: buildPrompt(q, evidence), system: SYSTEM_PROMPT, temperature: 0, max_tokens: 1024 });
    } catch {
      degraded = "completion_threw";
      break;
    }
    if (!res || res._not_configured === true) {
      degraded = "not_configured";
      break;
    }
    if (typeof res.text !== "string") {
      degraded = "malformed_response";
      break;
    }
    const drafts = parseDrafts(res.text);
    const kept: string[] = [];
    const dropReasons: string[] = [];
    for (const d of drafts) {
      const reason = draftDropReason(d, files);
      if (reason) dropReasons.push(reason);
      else kept.push(`${d.bullet} [inferred: ${d.file}]`);
    }
    questions.push({ key: q.key, slide: q.slide, proposed: drafts.length, kept: kept.length, dropped: dropReasons.length, drop_reasons: dropReasons });
    keptTotal += kept.length;
    droppedTotal += dropReasons.length;

    if (kept.length > 0) {
      // Draft-over-ask: verified inference REPLACES the placeholder bullets;
      // measured bullets on the slide are never touched. A slide whose
      // question produced nothing keeps its placeholder — a labeled gap
      // beats a silent one.
      slide.bullets = [...slide.bullets.filter((b) => !b.startsWith(OWNER_INPUT_PREFIX)), ...kept];
      slide.provenance = slide.bullets.some((b) => !b.includes("[inferred")) ? "mixed" : "inferred";
    }
  }

  if (degraded) {
    return {
      deck,
      report: { configured: false, degraded_reason: degraded, questions, kept_total: keptTotal, dropped_total: droppedTotal },
    };
  }

  const composed: ComposeDeck = {
    ...deck,
    slides,
    composed: true,
    compose_contract:
      "Bullets tagged [inferred: <file>] were drafted by a local model and verified by a deterministic citation oracle: the cited file exists in the snapshot, contains the cited fact, and every number in the bullet appears in the evidence. Wrong inferences are for the owner to correct — draft-over-ask.",
  };
  return {
    deck: composed,
    report: { configured: true, questions, kept_total: keptTotal, dropped_total: droppedTotal },
  };
}
