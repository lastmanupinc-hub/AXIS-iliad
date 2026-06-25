// ─── AXIS Package Quality Judge ─────────────────────────────────
//
// Enforces that each repo's generated development package is (1) backed by a
// VALID assessment, (2) UNIQUELY designed for THAT repo (grounded in its own
// facts, not boilerplate), and (3) covers the repo's DETECTED needs.
//
// This module is the deterministic, pure backbone — scores are a function of the
// ContextMap + the generated files only (no clock, no randomness, no LLM), so
// they're reproducible and un-gameable by prompt. The handler layers an optional
// json-schema-constrained LLM "refine" pass on top for qualitative nuance + a
// written rationale, and runs a repair loop that appends the augmentation
// artifacts below to lift weak dimensions. begin.yaml-compliant (structured).

import type { ContextMap } from "@axis/context-engine";

export interface QualityFile {
  path: string;
  content: string;
  content_type?: string;
}

export interface QualityArtifact {
  path: string;
  content: string;
  content_type: string;
}

export interface DimensionScore {
  score: number; // 0-100
  passed: boolean; // >= the dimension floor
  evidence: string[];
}

export interface QualityVerdict {
  grade: "A" | "B" | "C" | "D" | "F";
  overall: number; // 0-100
  passed: boolean;
  assessment_validity: DimensionScore;
  unique_design: DimensionScore;
  needs_coverage: DimensionScore;
  detected_needs: string[];
  uncovered_needs: string[];
}

// Dimension + overall floors. A package "passes" only if every dimension clears
// its floor AND the weighted overall clears OVERALL_FLOOR.
export const FLOORS = { assessment: 50, unique: 50, needs: 50, overall: 60 } as const;
// A package is "clearly tailored" once this many distinct DOCS reference the repo's
// distinctive facts in a distributed way (≥2 tailored docs ⇒ score ≥ 67 ⇒ passes).
const UNIQUE_DOC_TARGET = 3;
// Below this length a doc is an inherently-generic config (ci.yml etc.) — exempt
// from the uniqueness measure rather than dragging it down.
const MIN_DOC_CHARS = 300;
// The gate's OWN injected artifacts — excluded from uniqueness scoring so a repair
// fact-dump can never satisfy the metric it's being checked against.
const GATE_ARTIFACTS = new Set(["detected-architecture.md", "needs-remediation.md", "package-quality-report.json"]);

// Generic tokens that aren't repo-distinctive — excluded from fact-terms so a doc
// can't look "grounded" just by saying "src"/"app"/"config".
const GENERIC = new Set([
  "src", "app", "apps", "lib", "libs", "index", "main", "test", "tests", "spec",
  "config", "util", "utils", "common", "core", "api", "web", "dist", "build",
  "node", "modules", "package", "json", "yaml", "yml", "md", "txt", "the", "and",
  "for", "with", "type", "types", "file", "files", "code", "data", "name", "value",
]);

function asName(x: unknown): string | null {
  if (typeof x === "string") return x;
  if (x && typeof x === "object" && typeof (x as { name?: unknown }).name === "string") {
    return (x as { name: string }).name;
  }
  return null;
}

/** Tokenize any string (identifier, path, or prose) the SAME way on both the fact
 *  side and the doc side: split on non-alphanumerics AND camelCase, lowercase, keep
 *  tokens ≥3 chars that aren't generic. Consistent tokenization is what lets a doc
 *  saying "OrderInvoice" match a detected model named OrderInvoice. */
function toTokens(s: string): string[] {
  return s
    .split(/[^A-Za-z0-9]+|(?<=[a-z0-9])(?=[A-Z])/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 3 && !GENERIC.has(t));
}

/**
 * The set of repo-distinctive fact-tokens drawn from the assessment: domain-model
 * names, frameworks/build/test tools, dependency names, route segments, file
 * basenames, architecture patterns, key abstractions. Lowercased single tokens
 * so they can be intersected with a doc's tokens.
 */
export function repoFactTerms(ctx: ContextMap): Set<string> {
  const terms = new Set<string>();
  const add = (s: string | null) => {
    if (!s) return;
    for (const t of toTokens(s)) terms.add(t);
  };
  const d = ctx.detection;
  for (const f of d.frameworks ?? []) add(asName(f));
  for (const l of d.languages ?? []) add(asName(l));
  for (const b of d.build_tools ?? []) add(b);
  for (const t of d.test_frameworks ?? []) add(t);
  for (const p of d.package_managers ?? []) add(p);
  for (const m of ctx.domain_models ?? []) add(m.name);
  for (const dep of ctx.dependency_graph?.external_dependencies ?? []) add(asName(dep));
  for (const r of ctx.routes ?? []) add(r.path);
  for (const e of ctx.entry_points ?? []) add(e.path);
  for (const f of ctx.structure?.file_tree_summary ?? []) if (f.type === "file") add(f.path);
  for (const p of ctx.architecture_signals?.patterns_detected ?? []) add(p);
  for (const a of ctx.ai_context?.key_abstractions ?? []) add(a);
  add(ctx.project_identity?.name ?? null);
  return terms;
}

/**
 * The repo-DISTINCTIVE facts — domain-model names, route segments, risk-scored
 * hotspot files, entry points, SQL tables, key abstractions. Deliberately EXCLUDES
 * frameworks / language / project name (any boilerplate trivially names "React" or
 * the project), so referencing THESE is real evidence of tailoring, not an echo.
 */
export function distinctiveFactTerms(ctx: ContextMap): Set<string> {
  const terms = new Set<string>();
  const add = (s: string | null | undefined) => {
    if (!s) return;
    for (const t of toTokens(s)) terms.add(t);
  };
  for (const m of ctx.domain_models ?? []) add(m.name);
  for (const r of ctx.routes ?? []) add(r.path);
  for (const e of ctx.entry_points ?? []) add(e.path);
  for (const h of ctx.dependency_graph?.hotspots ?? []) add(h.path);
  for (const s of ctx.sql_schema ?? []) add(s.name);
  for (const a of ctx.ai_context?.key_abstractions ?? []) add(a);
  return terms;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Is the assessment real + grounded, vs degenerate/shallow? */
export function scoreAssessmentValidity(ctx: ContextMap): DimensionScore {
  const frameworks = (ctx.detection?.frameworks ?? []).length;
  const models = (ctx.domain_models ?? []).length;
  const routes = (ctx.routes ?? []).length;
  const files = ctx.structure?.total_files ?? 0;
  const deps = (ctx.dependency_graph?.external_dependencies ?? []).length;
  const sep = ctx.architecture_signals?.separation_score ?? 0;

  // Signals: a valid assessment of a non-trivial repo detects real facts.
  let score = 0;
  if (frameworks > 0) score += 25;
  if (models + routes > 0) score += 30; // detected structure (models or routes)
  if (deps > 0) score += 15;
  if (files >= 5) score += 15; // not a degenerate 1-file snapshot
  score += clamp(sep * 100) * 0.15; // architectural separation contributes up to 15

  const evidence = [
    `frameworks=${frameworks}`,
    `domain_models=${models}`,
    `routes=${routes}`,
    `external_deps=${deps}`,
    `files=${files}`,
    `separation_score=${sep.toFixed(2)}`,
  ];
  // Degenerate guard: a multi-file repo with NO detected models/routes/frameworks
  // is a shallow/failed assessment regardless of the additive score.
  const degenerate = files >= 5 && frameworks === 0 && models + routes === 0;
  const finalScore = degenerate ? Math.min(score, 30) : clamp(score);
  if (degenerate) evidence.push("degenerate: multi-file repo with no detected frameworks/models/routes");
  return { score: finalScore, passed: finalScore >= FLOORS.assessment, evidence };
}

/**
 * How uniquely DESIGNED for this repo the package is, vs generic boilerplate.
 * Scores the GENERATOR's substantive docs (gate-injected artifacts + tiny configs
 * excluded) for references to the repo's DISTINCTIVE facts, requiring them
 * DISTRIBUTED — ≥2 distinct facts on ≥2 distinct lines per doc, across ≥2 docs.
 * This defeats (a) generic-name gaming (frameworks/project aren't distinctive),
 * (b) a single fact-stuffing banner line (one line ≠ distributed), and (c) a repair
 * fact-dump satisfying its own check (gate artifacts excluded from the doc set).
 */
export function scoreUniqueDesign(files: QualityFile[], distinctive: Set<string>): DimensionScore {
  const docs = files.filter(
    (f) =>
      !GATE_ARTIFACTS.has(f.path) &&
      (/\.(md|mdx|txt)$/i.test(f.path) || (f.content_type ?? "").includes("markdown")) &&
      f.content.length >= MIN_DOC_CHARS,
  );
  if (docs.length === 0 || distinctive.size === 0) {
    return { score: 0, passed: false, evidence: [`substantive_docs=${docs.length}`, `distinctive_facts=${distinctive.size}`] };
  }
  let tailored = 0;
  const notTailored: string[] = [];
  for (const f of docs) {
    const lines = f.content.split("\n");
    const factLines = new Map<string, Set<number>>(); // distinct fact → line indices
    for (let i = 0; i < lines.length; i++) {
      for (const t of toTokens(lines[i])) {
        if (!distinctive.has(t)) continue;
        let s = factLines.get(t);
        if (!s) {
          s = new Set();
          factLines.set(t, s);
        }
        s.add(i);
      }
    }
    const distinctLines = new Set<number>();
    for (const ls of factLines.values()) for (const ln of ls) distinctLines.add(ln);
    // Tailored = ≥2 distinct distinctive facts spread over ≥2 lines (not a banner).
    if (factLines.size >= 2 && distinctLines.size >= 2) tailored++;
    else notTailored.push(f.path);
  }
  const target = Math.min(docs.length, UNIQUE_DOC_TARGET);
  const score = clamp((tailored / target) * 100);
  const evidence = [
    `tailored_docs=${tailored}/${docs.length} (target ${target})`,
    ...(notTailored.length ? [`not-tailored: ${notTailored.slice(0, 8).join(", ")}`] : []),
  ];
  return { score, passed: score >= FLOORS.unique, evidence };
}

// Detected-need rules: each maps a warning/signal to a need label + a regex that
// constitutes "coverage" in the package content.
const NEED_RULES: Array<{ match: RegExp; label: string; covered: RegExp }> = [
  { match: /\btest/i, label: "testing", covered: /\b(test|vitest|jest|mocha|pytest|spec|coverage)\b/i },
  { match: /\bci\b|ci\/cd|pipeline/i, label: "ci_cd", covered: /(\.github\/workflows|github actions|\bci\b|pipeline|workflow)/i },
  { match: /lockfile|lock file/i, label: "lockfile", covered: /(lockfile|lock file|pnpm-lock|package-lock|yarn\.lock|npm ci)/i },
  { match: /dependenc/i, label: "dependency_hygiene", covered: /(dependenc|bundle size|audit|prune|dedupe|cost)/i },
];

/** Which detected needs does the package address? */
export function scoreNeedsCoverage(ctx: ContextMap, files: QualityFile[]): { dim: DimensionScore; detected: string[]; uncovered: string[] } {
  const warnings = ctx.ai_context?.warnings ?? [];
  const detected = new Map<string, RegExp>(); // label -> coverage regex
  for (const w of warnings) {
    for (const rule of NEED_RULES) if (rule.match.test(w)) detected.set(rule.label, rule.covered);
  }
  // Structural needs even without an explicit warning.
  if ((ctx.detection?.test_frameworks ?? []).length === 0) {
    const r = NEED_RULES.find((x) => x.label === "testing")!;
    detected.set(r.label, r.covered);
  }
  if (!ctx.detection?.ci_platform) {
    const r = NEED_RULES.find((x) => x.label === "ci_cd")!;
    detected.set(r.label, r.covered);
  }

  const haystack = files.map((f) => f.content).join("\n").toLowerCase();
  const uncovered: string[] = [];
  for (const [label, cov] of detected) {
    if (!cov.test(haystack)) uncovered.push(label);
  }
  const detectedLabels = [...detected.keys()];
  const score = detectedLabels.length === 0 ? 100 : clamp(((detectedLabels.length - uncovered.length) / detectedLabels.length) * 100);
  const evidence = [
    detectedLabels.length === 0 ? "no detected needs" : `covered ${detectedLabels.length - uncovered.length}/${detectedLabels.length}`,
    ...(uncovered.length ? [`uncovered: ${uncovered.join(", ")}`] : []),
  ];
  return { dim: { score, passed: score >= FLOORS.needs, evidence }, detected: detectedLabels, uncovered };
}

/** Grade the whole package against the three dimensions. Pure + deterministic. */
export function gradePackage(ctx: ContextMap, files: QualityFile[]): QualityVerdict {
  const distinctive = distinctiveFactTerms(ctx);
  const av = scoreAssessmentValidity(ctx);
  const ud = scoreUniqueDesign(files, distinctive);
  const nc = scoreNeedsCoverage(ctx, files);
  const overall = clamp(av.score * 0.3 + ud.score * 0.4 + nc.dim.score * 0.3);
  const grade = overall >= 90 ? "A" : overall >= 75 ? "B" : overall >= 60 ? "C" : overall >= 40 ? "D" : "F";
  const passed = av.passed && ud.passed && nc.dim.passed && overall >= FLOORS.overall;
  return {
    grade,
    overall,
    passed,
    assessment_validity: av,
    unique_design: ud,
    needs_coverage: nc.dim,
    detected_needs: nc.detected,
    uncovered_needs: nc.uncovered,
  };
}

// ─── Repair augmentation builders (deterministic, inherently grounded) ───

/** A repo-specific architecture brief built purely from detected facts → lifts uniqueness. */
export function buildDetectedArchitectureArtifact(ctx: ContextMap): QualityArtifact {
  const frameworks = (ctx.detection?.frameworks ?? []).map(asName).filter(Boolean) as string[];
  const models = (ctx.domain_models ?? []).slice(0, 25);
  const routes = (ctx.routes ?? []).slice(0, 25);
  const patterns = ctx.architecture_signals?.patterns_detected ?? [];
  const lines: string[] = [
    `# Detected Architecture — ${ctx.project_identity?.name ?? "this repo"}`,
    "",
    "Generated from this repository's own analysis — every item below is a fact",
    "extracted from your code, not a template.",
    "",
    `- **Primary language:** ${ctx.project_identity?.primary_language ?? "unknown"}`,
    `- **Frameworks:** ${frameworks.length ? frameworks.join(", ") : "none detected"}`,
    `- **Architecture patterns:** ${patterns.length ? patterns.join(", ") : "none detected"}`,
    `- **Separation score:** ${(ctx.architecture_signals?.separation_score ?? 0).toFixed(2)}`,
    "",
    `## Domain models (${(ctx.domain_models ?? []).length})`,
    ...(models.length ? models.map((m) => `- \`${m.name}\` (${m.kind}, ${m.field_count} fields) — ${m.source_file}`) : ["- none detected"]),
    "",
    `## Routes (${(ctx.routes ?? []).length})`,
    ...(routes.length ? routes.map((r) => `- \`${r.method} ${r.path}\` — ${r.source_file}`) : ["- none detected"]),
  ];
  return { path: "detected-architecture.md", content: lines.join("\n") + "\n", content_type: "text/markdown" };
}

/** Repo-tailored remediations for each uncovered detected need → lifts needs coverage. */
export function buildNeedsRemediationArtifact(ctx: ContextMap, uncovered: string[]): QualityArtifact {
  const fw = (ctx.detection?.frameworks ?? []).map(asName).filter(Boolean).join(", ") || "your stack";
  const REMEDIATIONS: Record<string, string[]> = {
    testing: [
      "## Testing — no test framework detected",
      `Add a test suite for ${fw}. Start with the highest-risk modules from the dependency hotspots in the analysis.`,
      "- Pick a runner that matches the stack (vitest/jest for JS/TS, pytest for Python).",
      "- Gate CI on the suite; target the entry points and domain-model invariants first.",
    ],
    ci_cd: [
      "## CI/CD — no pipeline detected",
      "Add a CI workflow (e.g. `.github/workflows/ci.yml`) that installs deps, builds, type-checks, and runs tests on every push/PR.",
    ],
    lockfile: [
      "## Lockfile — none found",
      "Commit a lockfile (pnpm-lock.yaml / package-lock.json) and install with `--frozen-lockfile` / `npm ci` in CI for reproducible builds.",
    ],
    dependency_hygiene: [
      "## Dependency hygiene — high dependency count",
      "Audit and prune dependencies; run `pnpm audit`/`npm audit`, dedupe, and track bundle size to keep the surface bounded.",
    ],
  };
  const body: string[] = [
    `# Needs Remediation — ${ctx.project_identity?.name ?? "this repo"}`,
    "",
    "Concrete, repo-specific actions for the gaps this analysis detected:",
    "",
  ];
  for (const need of uncovered) body.push(...(REMEDIATIONS[need] ?? [`## ${need}`, "Detected as a gap; address per your stack."]), "");
  return { path: "needs-remediation.md", content: body.join("\n") + "\n", content_type: "text/markdown" };
}

// ─── Gate orchestration (deterministic; LLM rationale injected by the handler) ───

export interface QualityGateOutcome {
  verdict: QualityVerdict; // final, post-repair
  initial: QualityVerdict; // before repair
  repairArtifacts: QualityArtifact[];
}

/**
 * Grade the package, then REPAIR only what appending content can legitimately fix:
 * NEEDS coverage (a concrete remediation for each detected gap). unique_design and
 * assessment_validity reflect the GENERATOR's output and the repo itself — appending
 * an AXIS-authored fact-dump can't make a boilerplate package "tailored" (and gate
 * artifacts are excluded from the uniqueness score regardless), so they are reported
 * HONESTLY, not fake-repaired. Never blocks (repair-then-return): the returned
 * verdict is the truthful post-repair grade. Genuine uniqueness lift comes from the
 * engineer-mode LLM pass (a frontier model authoring real repo-tailored guidance),
 * not from this deterministic layer.
 */
export function applyQualityGate(ctx: ContextMap, files: QualityFile[]): QualityGateOutcome {
  const initial = gradePackage(ctx, files);
  const working: QualityFile[] = [...files];
  const repairArtifacts: QualityArtifact[] = [];

  if (!initial.needs_coverage.passed && initial.uncovered_needs.length > 0) {
    const art = buildNeedsRemediationArtifact(ctx, initial.uncovered_needs);
    repairArtifacts.push(art);
    working.push(art);
  }

  return { verdict: gradePackage(ctx, working), initial, repairArtifacts };
}

/** Build the package-quality-report.json artifact (+ optional injected LLM rationale). */
export function buildQualityReport(outcome: QualityGateOutcome, rationale: string | null): QualityArtifact {
  const { verdict, initial, repairArtifacts } = outcome;
  const report = {
    schema: "axis-package-quality/1",
    grade: verdict.grade,
    overall: verdict.overall,
    passed: verdict.passed,
    initial_grade: initial.grade,
    initial_overall: initial.overall,
    repaired: repairArtifacts.map((a) => a.path),
    dimensions: {
      assessment_validity: verdict.assessment_validity,
      unique_design: verdict.unique_design,
      needs_coverage: verdict.needs_coverage,
    },
    detected_needs: verdict.detected_needs,
    uncovered_needs: verdict.uncovered_needs,
    rationale: rationale ?? null,
  };
  return { path: "package-quality-report.json", content: JSON.stringify(report, null, 2), content_type: "application/json" };
}
