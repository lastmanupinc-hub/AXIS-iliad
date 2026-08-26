// ─── Program Manifest — the single source of truth for programs & counts ──
//
// Owns GENERATOR_PROGRAMS (output-file → program) so BOTH the generation
// dispatcher (generate.ts) and the commerce artifacts (generators-agentic-
// purchasing.ts) derive their program lists and per-program output counts from
// ONE map. Previously the dispatcher owned this map while the product schema and
// commerce registry hand-typed parallel lists that silently drifted (a bundle
// claimed 20 programs but listed 18; superpowers was counted as 5, not 8).
//
// This is a LEAF module: it imports nothing internal, so generate.ts and the
// generators can both depend on it without an import cycle.

export const GENERATOR_PROGRAMS: Record<string, string> = {
  "context-map.json": "search",
  "repo-profile.yaml": "search",
  "architecture-summary.md": "search",
  "dependency-hotspots.md": "search",
  "symbol-index.json": "search",
  "repo-run-stats.json": "search",
  "AGENTS.md": "skills",
  "CLAUDE.md": "skills",
  ".cursorrules": "skills",
  "workflow-pack.md": "skills",
  "policy-pack.md": "skills",
  "model-cascade.md": "skills",
  "debug-playbook.md": "debug",
  "incident-template.md": "debug",
  "tracing-rules.md": "debug",
  "root-cause-checklist.md": "debug",
  "frontend-rules.md": "frontend",
  "component-guidelines.md": "frontend",
  "layout-patterns.md": "frontend",
  "ui-audit.md": "frontend",
  "seo-rules.md": "seo",
  "schema-recommendations.json": "seo",
  "route-priority-map.md": "seo",
  "content-audit.md": "seo",
  "meta-tag-audit.json": "seo",
  "seo-head-tags.html": "seo",
  "pitch-deck.md": "pitch",
  "pitch-deck.json": "pitch",
  "slide-art-prompts.json": "pitch",
  "optimization-rules.md": "optimization",
  "prompt-diff-report.md": "optimization",
  "cost-estimate.json": "optimization",
  "token-budget-plan.md": "optimization",
  "design-tokens.json": "theme",
  "theme.css": "theme",
  "theme-guidelines.md": "theme",
  "component-theme-map.json": "theme",
  "dark-mode-tokens.json": "theme",
  "brand-guidelines.md": "brand",
  "voice-and-tone.md": "brand",
  "content-constraints.md": "brand",
  "messaging-system.yaml": "brand",
  ".vale.ini": "brand",
  "styles/AXIS/ForbiddenPatterns.yml": "brand",
  "styles/AXIS/PreferredTerms.yml": "brand",
  "channel-rulebook.md": "brand",
  "superpower-pack.md": "superpowers",
  "workflow-registry.json": "superpowers",
  "test-generation-rules.md": "superpowers",
  "refactor-checklist.md": "superpowers",
  "automation-pipeline.yaml": "superpowers",
  "verify.sh": "superpowers",
  "verify-full.sh": "superpowers",
  ".githooks/pre-push": "superpowers",
  "redundancy-sweep.mjs": "superpowers",
  "redundancy-sweep-playbook.md": "superpowers",
  "campaign-brief.md": "marketing",
  "funnel-map.md": "marketing",
  "sequence-pack.md": "marketing",
  "cro-playbook.md": "marketing",
  "ab-test-plan.md": "marketing",
  "notebook-summary.md": "notebook",
  "source-map.json": "notebook",
  "study-brief.md": "notebook",
  "research-threads.md": "notebook",
  "citation-index.json": "notebook",
  "obsidian-skill-pack.md": "obsidian",
  "vault-rules.md": "obsidian",
  "graph-prompt-map.json": "obsidian",
  "linking-policy.md": "obsidian",
  "template-pack.md": "obsidian",
  "mcp-config.json": "mcp",
  "mcp-registry-metadata.json": "mcp",
  "protocol-spec.md": "mcp",
  "spec.types.ts": "mcp",
  "mcp/README.md": "mcp",
  "mcp/project-setup.md": "mcp",
  "mcp/build-artifacts.md": "mcp",
  "mcp/package-json.root.template.json": "mcp",
  "mcp/package-json.package.template.json": "mcp",
  "mcp/tsconfig.root.template.json": "mcp",
  "mcp/tsconfig.package.template.json": "mcp",
  "mcp/monorepo-structure.md": "mcp",
  "mcp/core-implementation-artifacts.md": "mcp",
  "mcp/testing-documentation-polish-artifacts.md": "mcp",
  "connector-map.yaml": "mcp",
  "capability-registry.json": "mcp",
  "mcp/fintech-mcp-surface-package.md": "mcp",
  "mcp/fintech-domain-schema.yaml": "mcp",
  "server-manifest.yaml": "mcp",
  "generated-component.tsx": "artifacts",
  "dashboard-widget.tsx": "artifacts",
  "embed-snippet.ts": "artifacts",
  "artifact-spec.md": "artifacts",
  "component-library.json": "artifacts",
  "prd.md": "artifacts",
  "design.md": "artifacts",
  "tasks.md": "artifacts",
  "context.md": "artifacts",
  "index.html": "artifacts",
  "capability-map.yaml": "artifacts",
  "remotion-script.ts": "remotion",
  "scene-plan.md": "remotion",
  "render-config.json": "remotion",
  "asset-checklist.md": "remotion",
  "storyboard.md": "remotion",
  "canvas-spec.json": "canvas",
  "social-pack.md": "canvas",
  "poster-layouts.md": "canvas",
  "asset-guidelines.md": "canvas",
  "architecture-diagram.d2": "canvas",
  "brand-board.md": "canvas",
  "generative-sketch.ts": "algorithmic",
  "parameter-pack.json": "algorithmic",
  "collection-map.md": "algorithmic",
  "export-manifest.yaml": "algorithmic",
  "variation-matrix.json": "algorithmic",
  "agent-purchasing-playbook.md": "agentic-purchasing",
  "product-schema.json":          "agentic-purchasing",
  "checkout-flow.md":             "agentic-purchasing",
  "negotiation-rules.md":         "agentic-purchasing",
  "commerce-registry.json":       "agentic-purchasing",
  "ap2-interop-samples.json":     "agentic-purchasing",
  "packaging/README.md": "closer",
  "packaging/LICENSE": "closer",
  "Dockerfile": "closer",
  "docker-compose.yml": "closer",
  ".github/workflows/ci.yml": "closer",
  ".github/workflows/release.yml": "closer",
  "packaging/manifests/npm-package.json": "closer",
  "packaging/manifests/unreal.uplugin": "closer",
  "packaging/manifests/vscode-extension.json": "closer",
  "packaging/manifests/dockerhub-repository.md": "closer",
  "packaging/manifests/github-marketplace-listing.md": "closer",
  "packaging/trust-fabric/attestation.json": "closer",
  "packaging/trust-fabric/merkle-proof.json": "closer",
  "packaging-report.md": "closer",
  "DISTRIBUTABLE.md": "closer",
  "Makefile": "closer",
  "deploy/Dockerfile": "deploy",
  "deploy/Dockerfile.dockerignore": "deploy",
  "deploy/docker-compose.dev.yml": "deploy",
  "deploy/render.yaml": "deploy",
  "deploy/deploy.sh": "deploy",
  "deploy/deploy.ps1": "deploy",
  "deploy/vscode-launch.json.template": "deploy",
  "deploy/wrangler.pages.toml": "deploy",
  "deploy/wrangler.containers.toml": "deploy",
  "deploy/worker.ts": "deploy",
  "deploy/deploy-cloudflare.sh": "deploy",
  "deploy/deploy-cloudflare.ps1": "deploy",
  "deploy/deploy-qualification-report.md": "deploy",
};

/** Distinct programs in canonical (insertion) order — length is the program count. */
export const PROGRAM_ORDER: readonly string[] = Array.from(new Set(Object.values(GENERATOR_PROGRAMS)));

/** program → number of output artifacts it emits (derived, cannot drift). */
export const PROGRAM_OUTPUT_COUNTS: Readonly<Record<string, number>> = (() => {
  const counts: Record<string, number> = {};
  for (const program of Object.values(GENERATOR_PROGRAMS)) counts[program] = (counts[program] ?? 0) + 1;
  return counts;
})();

/** Total outputs for a bundle of programs (0 for any unknown program slug). */
export function bundleOutputs(programs: readonly string[]): number {
  return programs.reduce((sum, p) => sum + (PROGRAM_OUTPUT_COUNTS[p] ?? 0), 0);
}

// ─── Free tier — which ARTIFACTS are free, not which PROGRAMS ─────────────
//
// Replaces the old program-level free tier (search/skills/debug wholly free,
// the other 18 programs wholly invisible until paid). Every program now ships
// a genuinely useful free artifact, and every paid response names what it
// withheld — a caller can only answer "would you pay for more?" if they can
// see what "more" is.
//
// Keyed by OUTPUT PATH deliberately. REGISTRY keys ≡ GENERATOR_PROGRAMS keys ≡
// the emitted GeneratedFile.path (generate.ts resolves ALIASES to canonical
// paths BEFORE dispatch), so one predicate serves both "filter the outputs a
// caller requested" and "filter the files we just generated". A `tier` field on
// GENERATOR_PROGRAMS' values would instead break the six Object.values/entries
// call sites that assume a string, and a `tier` on GeneratedFile would trip
// validateGeneratedFile and touch ~152 generator functions.
//
// This is a SEPARATE AXIS from TIER_LIMITS.free.programs, which stays exactly
// as it is: that list is also the entitlement catalog read by isProgramEnabled,
// so widening it would silently grant free accounts every program.
//
// Selection rule — "hero asset free, depth paid": the free pick is the single
// most immediately useful artifact of each program (the thing a caller came
// for), not a stub and not merely the rules document. search/skills/debug keep
// ALL their artifacts free — they are the proven funnel and a published claim,
// and clawing back existing free value is the one move that loses the users we
// have. context-map.json / repo-profile.yaml / architecture-summary.md are
// force-added to every run by generate.ts; all three are `search`, so they are
// free by construction rather than by special case.
export const FREE_GENERATORS: ReadonlySet<string> = new Set<string>([
  // ── search (6/6 free) ──
  "context-map.json",
  "repo-profile.yaml",
  "architecture-summary.md",
  "dependency-hotspots.md",
  "symbol-index.json",
  "repo-run-stats.json",
  // ── skills (6/6 free) ──
  "AGENTS.md",
  "CLAUDE.md",
  ".cursorrules",
  "workflow-pack.md",
  "policy-pack.md",
  "model-cascade.md",
  // ── debug (4/4 free) ──
  "debug-playbook.md",
  "incident-template.md",
  "tracing-rules.md",
  "root-cause-checklist.md",
  // ── mcp (3/19) ──
  "mcp-config.json",
  "mcp/README.md",
  "protocol-spec.md",
  // ── closer (3/16) ──
  "Dockerfile",
  "packaging/README.md",
  "DISTRIBUTABLE.md",
  // ── deploy (3/13) ──
  "deploy/Dockerfile",
  "deploy/render.yaml",
  "deploy/docker-compose.dev.yml",
  // ── artifacts (3/11) ──
  "artifact-spec.md",
  "prd.md",
  "design.md",
  // ── superpowers (2/10) ──
  "superpower-pack.md",
  "refactor-checklist.md",
  // ── brand (2/8) ──
  "brand-guidelines.md",
  "voice-and-tone.md",
  // ── seo (2/6) ──
  "seo-rules.md",
  "meta-tag-audit.json",
  // ── canvas (2/6) ──
  "brand-board.md",
  "asset-guidelines.md",
  // ── agentic-purchasing (2/6) ──
  "agent-purchasing-playbook.md",
  "checkout-flow.md",
  // ── theme (1/5) ──
  "design-tokens.json",
  // ── marketing (1/5) ──
  "campaign-brief.md",
  // ── notebook (1/5) ──
  "notebook-summary.md",
  // ── obsidian (1/5) ──
  "obsidian-skill-pack.md",
  // ── remotion (1/5) ──
  "storyboard.md",
  // ── algorithmic (1/5) ──
  "generative-sketch.ts",
  // ── frontend (1/4) ──
  "frontend-rules.md",
  // ── optimization (1/4) ──
  "optimization-rules.md",
  // ── pitch (1/3) ──
  "pitch-deck.md",
]);

/** Free artifact count — derived from FREE_GENERATORS so it cannot drift. */
export const FREE_GENERATOR_COUNT = FREE_GENERATORS.size;

/** program → number of its artifacts that are free (derived, cannot drift). */
export const PROGRAM_FREE_COUNTS: Readonly<Record<string, number>> = (() => {
  const counts: Record<string, number> = {};
  for (const program of Object.values(GENERATOR_PROGRAMS)) counts[program] = counts[program] ?? 0;
  for (const path of FREE_GENERATORS) {
    const program = GENERATOR_PROGRAMS[path];
    if (program) counts[program] = (counts[program] ?? 0) + 1;
  }
  return counts;
})();

/** True when this output path is deliverable without payment. */
export function isFreeGenerator(path: string): boolean {
  return FREE_GENERATORS.has(path);
}

/**
 * True when this path is a REGISTRY artifact — i.e. something the free/paid
 * split actually governs.
 *
 * Several artifacts are appended AFTER generation and are not registry
 * entries: the package-quality report, the program-funnel recommendation, and
 * the autonomy-loop files (begin.yaml / continuation.yaml) that carry the
 * self-propagating "continue the loop" contract. They were always emitted
 * regardless of tier, so they must not be swept into the paid set merely by
 * being absent from FREE_GENERATORS — a free caller would otherwise lose the
 * loop files, and the upsell would advertise artifacts that have no price.
 *
 * Callers gate on `isGatedArtifact(p) && !isFreeGenerator(p)` to mean "paid",
 * rather than on `!isFreeGenerator(p)` alone. Keeping this separate from
 * isFreeGenerator also keeps that predicate strict: a mistyped path stays
 * paid-by-default rather than silently becoming free.
 */
export function isGatedArtifact(path: string): boolean {
  return path in GENERATOR_PROGRAMS;
}

/** True when this artifact requires payment (registry artifact, not free). */
export function isPaidArtifact(path: string): boolean {
  return isGatedArtifact(path) && !FREE_GENERATORS.has(path);
}
