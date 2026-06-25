import type { ContextMap } from "@axis/context-engine";
import { runCompletion, isLlmConfigured } from "./llm-inference.js";
import { validateStructuredOutput } from "./json-schema-validate.js";
import type { DesignVerdict } from "./package-quality.js";

// json-schema-constrained shape for the AI design verdict (E8 constrained decoding).
export const DESIGN_JUDGE_SCHEMA = {
  type: "object",
  required: ["design_score", "tailored", "rationale"],
  properties: {
    design_score: { type: "number", minimum: 0, maximum: 100 },
    tailored: { type: "boolean" },
    rationale: { type: "string", maxLength: 700 },
    top_improvement: { type: "string", maxLength: 300 },
  },
} as const;

/**
 * The AI DESIGN JUDGE (engineer mode) — a frontier model reads the package + the
 * repo's facts and judges whether it's GENUINELY DESIGNED for THIS repo vs.
 * mechanically template-filled. This is the judgment deterministic rules can't make.
 * json-schema-constrained (E8), temp 0 + fixed seed → reproducible. Returns null when
 * the model isn't configured OR the response can't be validated/parsed (the report then
 * notes design wasn't AI-assessed) — it never throws or fabricates a verdict.
 */
export async function llmDesignVerdict(
  ctx: ContextMap,
  files: Array<{ path: string; content: string; content_type?: string }>,
): Promise<DesignVerdict | null> {
  if (!(await isLlmConfigured())) return null;
  const facts = {
    project: ctx.project_identity?.name ?? "",
    type: ctx.project_identity?.type ?? "",
    frameworks: (ctx.detection?.frameworks ?? [])
      .map((f) => (typeof f === "string" ? f : (f as { name?: string }).name))
      .filter(Boolean)
      .slice(0, 6),
    models: (ctx.domain_models ?? []).slice(0, 10).map((m) => m.name),
    routes: (ctx.routes ?? []).slice(0, 8).map((r) => `${r.method} ${r.path}`),
    patterns: ctx.architecture_signals?.patterns_detected ?? [],
  };
  const sample = files
    .filter((f) => /\.(md|mdx|txt)$/i.test(f.path) && f.content.length >= 200)
    .slice(0, 6)
    .map((f) => `### ${f.path}\n${f.content.slice(0, 500)}`)
    .join("\n\n")
    .slice(0, 4000);
  const res = await runCompletion({
    system:
      "You are AXIS's AI quality judge. Decide whether this generated development package is GENUINELY DESIGNED for THIS specific repo's needs, or merely mechanically template-filled with its facts. Listing the repo's models/routes in tables + generic advice is NOT well-designed (low score, tailored=false). Repo-specific architectural insight, guidance that depends on the repo's actual structure, and need-targeted recommendations ARE well-designed (high score). Judge ONLY from the provided facts + sample; never invent. Return JSON {design_score, tailored, rationale, top_improvement}.",
    prompt: `Repo facts:\n${JSON.stringify(facts)}\n\nPackage sample:\n${sample}`,
    temperature: 0,
    seed: 11,
    max_tokens: 450,
    json_schema: DESIGN_JUDGE_SCHEMA,
  });
  if ("_not_configured" in res) return null;
  const parsed = validateStructuredOutput(res.text, DESIGN_JUDGE_SCHEMA);
  const p = parsed.parsed as Partial<DesignVerdict> | null;
  if (!parsed.valid || !p || typeof p.design_score !== "number" || typeof p.tailored !== "boolean" || typeof p.rationale !== "string")
    return null;
  return {
    design_score: Math.max(0, Math.min(100, Math.round(p.design_score))),
    tailored: p.tailored,
    rationale: p.rationale,
    top_improvement: typeof p.top_improvement === "string" ? p.top_improvement : undefined,
  };
}
