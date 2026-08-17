// frontend → real components, inferred from ONE source (app_31).
//
// OWNER DECISION 2026-08-17, verbatim: "LLM infered form single source".
// Components are inferred FROM the repo's own generated design-token contract —
// not free-form. That is what reconciles generation with this repo's
// byte-determinism law, and it is the same split design-judge.ts already uses:
//
//   packages/generator-core  deterministic, zero-runtime-dep, byte-identical.
//                            It produces the CONTRACT (design-tokens.json).
//   apps/api (here)          the LLM surface. Never imported by a generator.
//
// The determinism law is honoured three ways, in descending order of strength:
//
//   1. VERIFICATION IS DETERMINISTIC AND BINDING. Whatever the model returns is
//      checked by code, not vibes: every colour it emits must already exist in
//      the contract, and the component must survive the frontend program's OWN
//      auditor (analyzeUiSurface). Fail either and the component is WITHHELD.
//      Same discipline as seo-apply-watcher refusing to PR invalid JSON-LD and
//      `axis verify-automations` withholding a workflow whose steps fail — the
//      generator is not trusted merely because it is ours.
//   2. temperature 0 + a fixed seed + json-schema-constrained decoding, so the
//      same contract and request reproduce the same component.
//   3. Unconfigured degrades to null, never to a fabricated component.
//
// The point of (1) is that even a WRONG model cannot ship an invented colour or
// an inaccessible control. That is the defensible claim: not "an LLM wrote your
// component" but "your design system provably constrains what it could write."
import type { ContextMap } from "@axis/context-engine";
import { generateDesignTokens, analyzeUiSurface, type UiFinding } from "@axis/generator-core";
import { runCompletion, isLlmConfigured } from "./llm-inference.js";
import { validateStructuredOutput } from "./json-schema-validate.js";

export interface SourceFileLike {
  path: string;
  content: string;
  content_type?: string;
}

/** The single source: the repo's own generated token contract, plus how it styles. */
export interface ComponentContract {
  /** Every colour the component is allowed to use, flattened to lowercase hex. */
  palette: string[];
  /** Spacing scale keys (e.g. "4" → 1rem), for prompt grounding. */
  spacing: string[];
  /** Font-size scale keys. */
  font_sizes: string[];
  /** "tailwind" | "css-modules" | "styled-components" | "sass" | "plain-css". */
  styling: string;
  /** Detected UI framework name, lowercased, or "react" when undetectable. */
  framework: string;
  /** File extension the component should be written as. */
  extension: ".tsx" | ".jsx";
}

/** Flatten the token JSON's nested colour groups into a hex allowlist. */
function collectHexes(node: unknown, out: Set<string>): void {
  if (typeof node === "string") {
    const m = node.trim().toLowerCase();
    if (/^#[0-9a-f]{3,8}$/.test(m)) out.add(m);
    return;
  }
  if (node && typeof node === "object") {
    for (const v of Object.values(node as Record<string, unknown>)) collectHexes(v, out);
  }
}

/**
 * Build the contract from the REAL generated artifact, not a re-derivation.
 *
 * generateDesignTokens is what the theme program actually ships to the customer,
 * so grounding on its output means a generated component cannot drift from the
 * tokens they were sold. Re-deriving the palette here would create exactly the
 * second source this design exists to avoid.
 */
export function buildComponentContract(ctx: ContextMap, files?: SourceFileLike[]): ComponentContract {
  const tokenFile = generateDesignTokens(ctx, files as never);
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(tokenFile.content) as Record<string, unknown>;
  } catch {
    parsed = {};
  }

  const hexes = new Set<string>();
  collectHexes(parsed.colors ?? {}, hexes);

  const spacing = Object.keys((parsed.spacing as Record<string, unknown>) ?? {});
  const typography = (parsed.typography as Record<string, unknown>) ?? {};
  const font_sizes = Object.keys((typography.font_sizes as Record<string, unknown>) ?? {});

  const styling =
    typeof parsed.styling_approach === "string"
      ? parsed.styling_approach
      : typeof (parsed.styling as Record<string, unknown>)?.approach === "string"
        ? String((parsed.styling as Record<string, unknown>).approach)
        : "plain-css";

  const fwList = (ctx.detection?.frameworks ?? []) as Array<string | { name?: string }>;
  const names = fwList.map((f) => (typeof f === "string" ? f : (f?.name ?? ""))).filter(Boolean).map((s) => s.toLowerCase());
  const framework = names.find((n) => /react|next|preact|solid/.test(n)) ?? names[0] ?? "react";
  const usesTs = (files ?? []).some((f) => /\.tsx?$/.test(f.path));

  return {
    palette: [...hexes].sort(),
    spacing: spacing.sort(),
    font_sizes: font_sizes.sort(),
    styling,
    framework,
    extension: usesTs ? ".tsx" : ".jsx",
  };
}

export const COMPONENT_SCHEMA = {
  type: "object",
  required: ["component_name", "code"],
  properties: {
    component_name: { type: "string", maxLength: 64 },
    code: { type: "string", maxLength: 8000 },
    notes: { type: "string", maxLength: 400 },
  },
} as const;

export interface GeneratedComponent {
  component_name: string;
  code: string;
  notes?: string;
}

export type WithheldReason = "not_configured" | "unparseable" | "invented_colors" | "audit_failed";

export interface ComponentResult {
  status: "generated" | "withheld";
  reason?: WithheldReason;
  component?: GeneratedComponent;
  path?: string;
  /** Colours the model used that the contract does not contain. Always [] on success. */
  invented_colors?: string[];
  /** Findings from the program's own auditor. Always [] on success. */
  findings?: UiFinding[];
}

/** Hex colours appearing anywhere in generated code. */
export function extractHexes(code: string): string[] {
  const out = new Set<string>();
  for (const m of code.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) out.add(m[0].toLowerCase());
  return [...out].sort();
}

/**
 * Deterministic gate. Runs with or without an LLM and is the reason this feature
 * is safe: it is what actually enforces "single source".
 *
 * A colour the contract never defined is the exact failure mode of asking a model
 * for UI — it produces something plausible and off-brand. Here that is a hard
 * withhold, not a warning, because a component shipped with an invented colour
 * silently breaks the design system the customer bought.
 */
export function verifyGeneratedComponent(
  component: GeneratedComponent,
  contract: ComponentContract,
): { ok: boolean; reason?: WithheldReason; invented_colors: string[]; findings: UiFinding[] } {
  const allowed = new Set(contract.palette.map((c) => c.toLowerCase()));
  const invented = extractHexes(component.code).filter((h) => !allowed.has(h));

  const path = `AxisGenerated/${component.component_name}${contract.extension}`;
  const findings = analyzeUiSurface([
    { path, content: component.code, content_type: "text/plain" } as never,
  ]);

  if (invented.length > 0) return { ok: false, reason: "invented_colors", invented_colors: invented, findings };
  if (findings.length > 0) return { ok: false, reason: "audit_failed", invented_colors: [], findings };
  return { ok: true, invented_colors: [], findings: [] };
}

/**
 * Infer a component from the contract, then prove it before returning it.
 *
 * Returns status "withheld" rather than throwing, so a caller (the apply
 * watcher) can log an honest reason and open no PR — never a half-good
 * component with a note attached.
 */
export async function generateVerifiedComponent(
  ctx: ContextMap,
  request: string,
  files?: SourceFileLike[],
): Promise<ComponentResult> {
  if (!(await isLlmConfigured())) return { status: "withheld", reason: "not_configured" };

  const contract = buildComponentContract(ctx, files);
  const res = await runCompletion({
    system:
      "You are AXIS's frontend component generator. Write ONE self-contained " +
      `${contract.framework} component. HARD CONSTRAINTS: use ONLY colours from the ` +
      "provided palette — never invent a hex value; every interactive element must be a " +
      "real <button>/<a> (never a div with onClick) and every <img> must have alt text; " +
      "never use dangerouslySetInnerHTML or innerHTML; never use the TypeScript `any` " +
      "type. Return JSON {component_name, code, notes}.",
    prompt:
      `Design contract (the ONLY source of truth):\n${JSON.stringify({
        palette: contract.palette,
        spacing: contract.spacing,
        font_sizes: contract.font_sizes,
        styling: contract.styling,
        framework: contract.framework,
      })}\n\nComponent requested: ${request}`,
    temperature: 0,
    seed: 17,
    max_tokens: 1200,
    json_schema: COMPONENT_SCHEMA,
  });
  if ("_not_configured" in res) return { status: "withheld", reason: "not_configured" };

  const parsed = validateStructuredOutput(res.text, COMPONENT_SCHEMA);
  const p = parsed.parsed as Partial<GeneratedComponent> | null;
  if (!parsed.valid || !p || typeof p.component_name !== "string" || typeof p.code !== "string" || !p.code.trim()) {
    return { status: "withheld", reason: "unparseable" };
  }

  const component: GeneratedComponent = {
    component_name: p.component_name.replace(/[^A-Za-z0-9_]/g, "").slice(0, 64) || "AxisComponent",
    code: p.code,
    notes: typeof p.notes === "string" ? p.notes : undefined,
  };

  const v = verifyGeneratedComponent(component, contract);
  if (!v.ok) {
    return {
      status: "withheld",
      reason: v.reason,
      invented_colors: v.invented_colors,
      findings: v.findings,
    };
  }
  return {
    status: "generated",
    component,
    path: `${component.component_name}${contract.extension}`,
    invented_colors: [],
    findings: [],
  };
}
