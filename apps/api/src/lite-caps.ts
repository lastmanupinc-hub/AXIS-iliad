/**
 * lite-caps.ts — central lite-mode cap enforcement for MCP tool calls.
 *
 * Revenue-leak fix: a caller sending `X-Agent-Mode: lite` pays the lite price
 * (priceForMode), so it must GET lite behavior — before this module, lite
 * callers received full standard behavior at the discounted price.
 *
 * This table is the ENFORCEMENT COUNTERPART of the `lite_description` contract
 * copy in @axis/mpp's PRICING_TIERS: every cap promised there for the pure
 * input-transform tools is enforced here, and the contract test in
 * lite-caps.test.ts pins the two together — a copy edit that changes a number
 * without changing enforcement (or an enforcement change that silently breaks
 * the promised number) fails CI.
 *
 * Scope: only the tools whose lite limits are pure INPUT transforms
 * (clamp / truncate / force / reject on the tool args). Lite limits that are
 * runtime behavior (vector-database per-namespace vector counts,
 * document-parsing byte caps, speech-to-text audio duration, the REST-path
 * crawl cap) are enforced inline in their handlers, not here.
 *
 * Pure function, no I/O. Transforms write to a COPY of the caller's args
 * (nested objects along a transformed path are copied too); the caller's
 * object is never mutated. For standard/engineer mode — and for tools with no
 * table entry — the args pass through untouched (same reference).
 */

import type { AgentMode } from "./mpp.js";

// ─── Promised caps (single source for the table AND the contract test) ─
//
// Each value restates a number promised by the corresponding tool's
// lite_description in @axis/mpp PRICING_TIERS. lite-caps.test.ts parses those
// descriptions and asserts they equal these constants, in both directions.
export const LITE_CAPS = {
  /** iliad_object_storage: "signed URL with 1h TTL cap" */
  OBJECT_STORAGE_MAX_TTL_SECONDS: 3600,
  /** iliad_vector_database: "top_k capped at 10" */
  VECTOR_QUERY_MAX_TOP_K: 10,
  /** iliad_transactional_email: "single recipient" */
  EMAIL_MAX_RECIPIENTS: 1,
  /** iliad_analytics: "capture batches above 50 are rejected" */
  ANALYTICS_CAPTURE_MAX_BATCH: 50,
  /** iliad_analytics: "query limit capped at 25" */
  ANALYTICS_QUERY_MAX_LIMIT: 25,
  /** iliad_llm_inference: "max_tokens capped at 256" */
  LLM_MAX_TOKENS: 256,
  /** iliad_llm_inference: "temperature locked at 0" */
  LLM_TEMPERATURE: 0,
  /** iliad_code_sandbox: "timeout_seconds capped at 10" */
  SANDBOX_MAX_TIMEOUT_SECONDS: 10,
  /** iliad_text_to_speech: "text capped at 500 chars" */
  TTS_MAX_TEXT_CHARS: 500,
  /** iliad_text_to_speech: "format locked to wav" */
  TTS_FORMAT: "wav",
  /** iliad_web_search: "max_results capped at 10" */
  WEB_SEARCH_MAX_RESULTS: 10,
  /** iliad_web_research_crawl: "crawl up to 5 pages" */
  CRAWL_MAX_PAGES: 5,
} as const;

type LiteRule =
  | {
      kind: "clamp";
      /** Arg location; length 1 (top-level) or 2 (one level nested). */
      path: readonly string[];
      max: number;
      /**
       * Also write the cap when the arg is ABSENT. Needed where the handler's
       * default for a missing arg exceeds the lite cap (llm max_tokens
       * defaults to 512, sandbox timeout to 30s, crawl limit to 10 pages,
       * analytics query limit to 100 rows) — without the fill, simply
       * omitting the arg would deliver standard-sized output at the lite
       * price. A nested fill only applies when the parent object exists, so a
       * missing parent still raises the handler's own validation error.
       */
      fillAbsent?: boolean;
    }
  | { kind: "truncate"; path: readonly string[]; maxChars: number }
  | { kind: "force"; path: readonly string[]; value: unknown }
  | { kind: "reject"; when: (args: Record<string, unknown>) => boolean; message: string };

// Reject messages mirror the engineer-gate error style in mcp-tool-impls.ts:
// name the tool, state the lite limit, and say exactly which header unlocks it.
const LITE_RULES: Record<string, readonly LiteRule[]> = {
  iliad_object_storage: [
    // Absent ttl_seconds defaults to 3600 in the handler — already at the cap.
    { kind: "clamp", path: ["ttl_seconds"], max: LITE_CAPS.OBJECT_STORAGE_MAX_TTL_SECONDS },
  ],
  iliad_vector_database: [
    // Absent query.top_k defaults to 10 in the handler — already at the cap.
    // (The 1k-vectors-per-namespace half of this tool's lite promise is
    // runtime state, enforced inline in the handler, not an input transform.)
    { kind: "clamp", path: ["query", "top_k"], max: LITE_CAPS.VECTOR_QUERY_MAX_TOP_K },
  ],
  iliad_embeddings: [
    {
      kind: "reject",
      when: (args) => Array.isArray(args.input),
      message:
        "iliad_embeddings: lite mode accepts a single string `input` only — array batches are a standard-mode feature. Send X-Agent-Mode: standard for batches (up to 2048 strings).",
    },
  ],
  iliad_transactional_email: [
    {
      kind: "reject",
      when: (args) => Array.isArray(args.to) && args.to.length > LITE_CAPS.EMAIL_MAX_RECIPIENTS,
      message:
        "iliad_transactional_email: lite mode sends to a single recipient only. Send X-Agent-Mode: standard for up to 50 recipients.",
    },
    {
      kind: "reject",
      when: (args) => args.body_html !== undefined,
      message:
        "iliad_transactional_email: lite mode is plaintext-only — use `body_text` and drop `body_html`. Send X-Agent-Mode: standard for HTML bodies.",
    },
  ],
  iliad_analytics: [
    {
      kind: "reject",
      when: (args) =>
        Array.isArray(args.events) && args.events.length > LITE_CAPS.ANALYTICS_CAPTURE_MAX_BATCH,
      message: `iliad_analytics: lite mode rejects capture batches above ${LITE_CAPS.ANALYTICS_CAPTURE_MAX_BATCH} events. Send X-Agent-Mode: standard for batches up to 500.`,
    },
    // Absent query.limit defaults to 100 rows in the query engine (> 25).
    {
      kind: "clamp",
      path: ["query", "limit"],
      max: LITE_CAPS.ANALYTICS_QUERY_MAX_LIMIT,
      fillAbsent: true,
    },
  ],
  iliad_llm_inference: [
    // Absent max_tokens defaults to 512 in the model runner (> 256).
    { kind: "clamp", path: ["max_tokens"], max: LITE_CAPS.LLM_MAX_TOKENS, fillAbsent: true },
    // "temperature locked at 0" — forced regardless of what was sent.
    { kind: "force", path: ["temperature"], value: LITE_CAPS.LLM_TEMPERATURE },
  ],
  iliad_code_sandbox: [
    {
      kind: "reject",
      when: (args) => args.language === "node",
      message:
        "iliad_code_sandbox: lite mode runs python/bash only (no node). Send X-Agent-Mode: standard to run node code.",
    },
    // Absent timeout_seconds defaults to 30s in the sandbox (> 10).
    {
      kind: "clamp",
      path: ["timeout_seconds"],
      max: LITE_CAPS.SANDBOX_MAX_TIMEOUT_SECONDS,
      fillAbsent: true,
    },
  ],
  iliad_text_to_speech: [
    { kind: "truncate", path: ["text"], maxChars: LITE_CAPS.TTS_MAX_TEXT_CHARS },
    // "format locked to wav" — forced regardless of what was sent.
    { kind: "force", path: ["format"], value: LITE_CAPS.TTS_FORMAT },
  ],
  iliad_web_search: [
    // Absent max_results defaults to 10 in the search engine — already at the cap.
    { kind: "clamp", path: ["max_results"], max: LITE_CAPS.WEB_SEARCH_MAX_RESULTS },
  ],
  iliad_web_research_crawl: [
    // Absent limit defaults to 10 pages in the handler (> 5). MCP path only —
    // the REST crawl endpoint enforces its own cap inline.
    { kind: "clamp", path: ["limit"], max: LITE_CAPS.CRAWL_MAX_PAGES, fillAbsent: true },
  ],
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Read args[path[0]][path[1]]…; undefined when any parent isn't a plain object. */
function readPath(args: Record<string, unknown>, path: readonly string[]): unknown {
  let cur: unknown = args;
  for (const key of path) {
    if (!isPlainObject(cur)) return undefined;
    cur = cur[key];
  }
  return cur;
}

/**
 * Write `value` at `path` inside `out` (already a shallow copy of the caller's
 * args), copying each nested parent object on the way down so the caller's
 * nested objects are never mutated either.
 */
function writePath(out: Record<string, unknown>, path: readonly string[], value: unknown): void {
  let cur = out;
  for (let i = 0; i < path.length - 1; i++) {
    const parent = cur[path[i]];
    // Callers guarantee the parent exists (clamp fills are parent-gated), but
    // stay safe if a future rule writes through a missing parent.
    const copy: Record<string, unknown> = isPlainObject(parent) ? { ...parent } : {};
    cur[path[i]] = copy;
    cur = copy;
  }
  cur[path[path.length - 1]] = value;
}

/**
 * Enforce the lite-mode caps for `tool` on `args`.
 *
 * - mode !== "lite", or no table entry: `{ args }` unchanged (same reference).
 * - lite + a reject rule matches: `{ args, rejection }` — the caller must
 *   return `rejection` as an isError tool result WITHOUT charging or running.
 * - lite otherwise: `{ args }` is a transformed COPY (clamps/forces applied);
 *   the caller's object is never mutated.
 */
export function applyLiteCaps(
  tool: string,
  mode: AgentMode,
  args: Record<string, unknown>,
): { args: Record<string, unknown>; rejection?: string } {
  if (mode !== "lite") return { args };
  const rules = LITE_RULES[tool];
  if (!rules) return { args };

  // All rejects first — a rejected call must never look half-transformed.
  for (const rule of rules) {
    if (rule.kind === "reject" && rule.when(args)) {
      return { args, rejection: rule.message };
    }
  }

  // Transforms write to a copy; the caller's args object is never mutated.
  const out: Record<string, unknown> = { ...args };
  for (const rule of rules) {
    if (rule.kind === "clamp") {
      const current = readPath(out, rule.path);
      if (current === undefined) {
        // Fill only where the handler's absent-arg default exceeds the cap,
        // and never conjure a missing parent object — its absence is the
        // handler's own validation error to raise.
        const parentExists =
          rule.path.length === 1 || isPlainObject(readPath(out, rule.path.slice(0, -1)));
        if (rule.fillAbsent && parentExists) writePath(out, rule.path, rule.max);
      } else if (typeof current === "number" && Number.isFinite(current) && current > rule.max) {
        writePath(out, rule.path, rule.max);
      }
      // Non-numeric / non-finite / at-or-below-cap values pass through: the
      // handler's own validation owns those (lite must never LOOSEN it).
    } else if (rule.kind === "truncate") {
      const current = readPath(out, rule.path);
      if (typeof current === "string" && current.length > rule.maxChars) {
        writePath(out, rule.path, current.slice(0, rule.maxChars));
      }
    } else if (rule.kind === "force") {
      writePath(out, rule.path, rule.value);
    }
  }
  return { args: out };
}
