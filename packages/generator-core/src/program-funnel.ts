// ─── Program Funnel — "what to run next" through Iliad's programs ────
//
// Every analysis ships one deterministic artifact — recommended-next-programs.md —
// that turns a single run into a natural workflow: you ran program X, so here are
// the next programs that compound its value (and the ones this repo most needs).
// Woven in at the generation surface (like appendAutonomyLoop / appendQualityArtifacts)
// so it works across the CLI, the API, and the MCP path without touching a generator.
//
// Pure + deterministic: same programs-run + same analysis ⇒ byte-identical output.

import type { ContextMap } from "@axis/context-engine";
import type { GeneratorResult, GeneratedFile } from "./types.js";

const FUNNEL_PROGRAM = "skills"; // attributed to the always-present context program

/** One-line value prop per program (agent-consumable; a touch of go-to-market shine). */
const PROGRAM_VALUE: Record<string, string> = {
  skills: "AI-agent context files (AGENTS.md, CLAUDE.md, .cursorrules) so any agent lands oriented.",
  debug: "Deterministic failure-surface scan — surface silent, money-losing errors *before* they ship.",
  optimization: "Prompt + context-window efficiency and a token budget, grounded in your real files.",
  frontend: "Frontend audit — accessibility, performance, and structure, with concrete fixes.",
  seo: "SEO analysis + the exact on-page fixes, ranked by impact.",
  theme: "A design-token system extracted from your UI — one source of truth for styling agents.",
  brand: "Brand guidelines an agent can apply consistently across every surface.",
  superpowers: "Capability packs that give an agent leverage over this specific codebase.",
  marketing: "Go-to-market copy grounded in what your product actually does.",
  notebook: "A study brief + reading path so a new engineer (or agent) ramps in minutes.",
  obsidian: "A linked knowledge-base vault of the codebase — navigable, taggable, agent-ready.",
  mcp: "Expose this analysis as a live MCP server your agents can *call* — one deterministic command.",
  artifacts: "A packaged, portable artifact bundle — the whole analysis, ready to ship.",
  remotion: "Programmatic video from the analysis — a launch clip generated from real signals.",
  canvas: "Visual diagrams of the architecture, generated from the dependency graph.",
  algorithmic: "Algorithmic complexity + hotspot analysis of the paths that matter.",
  "agentic-purchasing": "An agent-ready commerce playbook — let AI agents discover and *buy* your capabilities.",
  closer: "Sales-closer content that turns the analysis into a deal.",
  deploy: "Deploy configs wired to your stack — from repo to running service.",
  github: "GitHub-native analysis + the automation to keep it fresh on every push.",
};

/** Curated adjacency: run a program → the programs that compound it. Deterministic order. */
const NEXT_PROGRAMS: Record<string, string[]> = {
  skills: ["debug", "optimization", "mcp"],
  debug: ["optimization", "mcp", "agentic-purchasing"],
  optimization: ["mcp", "debug", "agentic-purchasing"],
  frontend: ["seo", "theme", "brand"],
  seo: ["marketing", "frontend", "brand"],
  theme: ["brand", "frontend", "canvas"],
  brand: ["theme", "marketing", "canvas"],
  marketing: ["closer", "agentic-purchasing", "brand"],
  notebook: ["obsidian", "optimization", "mcp"],
  obsidian: ["notebook", "mcp", "optimization"],
  mcp: ["agentic-purchasing", "artifacts", "deploy"],
  "agentic-purchasing": ["mcp", "marketing", "closer"],
  artifacts: ["mcp", "deploy", "agentic-purchasing"],
  superpowers: ["skills", "mcp", "debug"],
  algorithmic: ["optimization", "debug", "mcp"],
  canvas: ["brand", "remotion", "marketing"],
  remotion: ["marketing", "brand", "closer"],
  closer: ["agentic-purchasing", "marketing", "mcp"],
  deploy: ["mcp", "debug", "github"],
  github: ["debug", "deploy", "mcp"],
};

// Repo-grounded boosts: nudge toward the programs this codebase most needs.
const FRONTEND_BOOST = ["frontend", "seo", "theme"];
const BACKEND_BOOST = ["debug", "optimization", "mcp"];
// The high-value "moat" programs — the sensible default when adjacency is exhausted.
const DEFAULT_NEXT = ["mcp", "agentic-purchasing", "debug", "optimization"];

/** Stable-partition: programs the account has never run (usage === 0) rank ahead of ones it has, each half keeping its relative order. */
function partitionByUsage(ranked: string[], accountUsage: Record<string, number>): string[] {
  const untried = ranked.filter((p) => (accountUsage[p] ?? 0) === 0);
  const tried = ranked.filter((p) => (accountUsage[p] ?? 0) > 0);
  return [...untried, ...tried];
}

/**
 * Recommend up to `limit` programs to run NEXT, given the programs already run and
 * the analyzed repo. Ranks adjacency of what ran, then repo-grounded boosts, then
 * the moat defaults; never recommends a program that already ran. Deterministic.
 * `accountUsage` (program → lifetime run count) is optional: when provided, the
 * candidate list is stable-partitioned so never-run programs surface first. Omitting
 * it reproduces the exact pre-personalization ranking (the determinism guarantee).
 */
export function buildNextPrograms(
  programsRun: Set<string>,
  ctx: ContextMap,
  limit = 3,
  accountUsage?: Record<string, number>,
): string[] {
  const hasFrontend = (ctx.detection?.frameworks ?? []).length > 0 || (ctx.routes ?? []).length > 0;
  const ranked: string[] = [];
  const push = (p: string) => {
    if (p && !programsRun.has(p) && !ranked.includes(p) && PROGRAM_VALUE[p]) ranked.push(p);
  };
  // 1. Adjacency of the programs that ran (stable order by run-program id, then list order).
  for (const p of [...programsRun].sort()) for (const n of NEXT_PROGRAMS[p] ?? []) push(n);
  // 2. Repo-grounded boosts.
  for (const p of hasFrontend ? FRONTEND_BOOST : BACKEND_BOOST) push(p);
  // 3. Moat defaults.
  for (const p of DEFAULT_NEXT) push(p);
  const final = accountUsage ? partitionByUsage(ranked, accountUsage) : ranked;
  return final.slice(0, limit);
}

/** Render the funnel artifact. */
function renderFunnel(programsRun: Set<string>, next: string[], name: string, personalized: boolean): string {
  const ran = [...programsRun].filter((p) => PROGRAM_VALUE[p]).sort();
  const lines: string[] = [];
  lines.push(`# Recommended Next Programs — ${name}`);
  lines.push("");
  lines.push(`> Your analysis is one move in a workflow. These are the programs that compound what you just ran on **${name}** — each is a separate SKU that produces more agent-consumable output from the same snapshot.`);
  lines.push("");
  if (personalized) {
    lines.push("_Ranked for this account: programs you haven't tried yet come first._");
    lines.push("");
  }
  if (ran.length) {
    lines.push(`**Already run:** ${ran.map((p) => `\`${p}\``).join(", ")}`);
    lines.push("");
  }
  lines.push("## Run these next");
  lines.push("");
  for (const p of next) {
    lines.push(`### ▶ \`${p}\``);
    lines.push("");
    lines.push(PROGRAM_VALUE[p]);
    lines.push("");
  }
  lines.push("---");
  lines.push("");
  lines.push("_Each program reuses this snapshot — no re-upload. Point your agent at the MCP server and it can run the next program itself: `analyze_repo` → pick a program → get the artifacts._");
  return lines.join("\n");
}

/**
 * Weave the program funnel into a generation result IN PLACE: append a single
 * recommended-next-programs.md artifact based on which programs are present.
 * Best-effort (a throw is swallowed) and idempotent (skips if already added or if
 * nothing to recommend). Call at the generation surface, before appendAutonomyLoop
 * so the funnel gets sequenced into the loop like any other markdown artifact.
 */
export function appendProgramFunnel(generated: GeneratorResult, ctx: ContextMap, accountUsage?: Record<string, number>): void {
  try {
    if (!generated.files.length) return;
    const path = "recommended-next-programs.md";
    if (generated.files.some((f) => f.path === path)) return;
    const programsRun = new Set(generated.files.map((f) => f.program).filter(Boolean) as string[]);
    const next = buildNextPrograms(programsRun, ctx, 3, accountUsage);
    if (next.length === 0) return;
    const name = ctx.project_identity?.name ?? "this project";
    const file: GeneratedFile = {
      path,
      content: renderFunnel(programsRun, next, name, accountUsage !== undefined),
      content_type: "text/markdown",
      program: FUNNEL_PROGRAM,
      description: "The next Iliad programs to run — a natural workflow through the catalog, grounded in this repo",
    };
    generated.files.push(file);
  } catch {
    // Best-effort; the generated package already succeeded.
  }
}
