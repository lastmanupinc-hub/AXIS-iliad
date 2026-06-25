// ─── AXIS Package Quality Judge — deterministic FLOORS ──────────
//
// The "AI quality judge" has two layers:
//   • THIS module — deterministic, pure FLOORS every package must clear as a
//     baseline: a VALID assessment, GROUNDING in the repo's own facts (not pure
//     boilerplate), and coverage of DETECTED needs. Reproducible; no LLM, no clock.
//   • The LLM DESIGN JUDGE (handler, engineer mode) — a frontier model reads the
//     package + assessment and judges whether it's GENUINELY DESIGNED for this repo
//     vs. mechanically template-filled. Deterministic rules can NOT make that call
//     (AXIS's generators legitimately weave repo facts into prose, so no rule
//     separates "designed" from "tailored template-fill" — proven empirically), so
//     design quality is the model's judgment; these floors only catch egregious
//     failures and feed the judge. begin.yaml-compliant (structured).

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

/** The LLM design judge's structured verdict (engineer mode); null when no model. */
export interface DesignVerdict {
  design_score: number; // 0-100, the model's judgment of genuine design quality
  tailored: boolean; // genuinely designed for THIS repo vs mechanical template-fill
  rationale: string;
  top_improvement?: string;
}

export interface QualityVerdict {
  grade: "A" | "B" | "C" | "D" | "F";
  overall: number; // 0-100 (deterministic floors only)
  passed: boolean; // all floors clear
  assessment_validity: DimensionScore;
  grounding: DimensionScore;
  needs_coverage: DimensionScore;
  detected_needs: string[];
  uncovered_needs: string[];
}

// Floors. The deterministic verdict "passes" only if every floor clears AND the
// weighted overall clears OVERALL. (Design quality is judged separately by the LLM.)
export const FLOORS = { assessment: 50, grounding: 50, needs: 50, overall: 60 } as const;
// A package is "grounded" once this many distinct DOCS reference the repo's facts.
const GROUNDING_DOC_TARGET = 3;
// Below this length a doc is an inherently-generic config (ci.yml etc.) — exempt.
const MIN_DOC_CHARS = 300;
// The gate's OWN injected artifacts — excluded from grounding + needs scoring so an
// appended artifact can never self-satisfy the metric it's being checked against.
const GATE_ARTIFACTS = new Set(["needs-remediation.md", "package-quality-report.json"]);

// Generic tokens that aren't repo-distinctive.
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

/** Split on non-alphanumerics AND camelCase, lowercase, keep ≥3-char non-generic tokens. */
function toTokens(s: string): string[] {
  return s
    .split(/[^A-Za-z0-9]+|(?<=[a-z0-9])(?=[A-Z])/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 3 && !GENERIC.has(t));
}

/** Broad fact set (incl. frameworks/deps/files) — used where a permissive match helps. */
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
  add(ctx.project_identity?.name ?? null);
  return terms;
}

/**
 * Repo-DISTINCTIVE facts for the GROUNDING floor: domain-model names, route paths,
 * SQL tables, entry points, risk-scored hotspot files. Excludes frameworks/language
 * (any boilerplate names them), the project name (which leaks via hotspot paths like
 * `lib/express.js`), and ai_context.key_abstractions (AXIS taxonomy labels like
 * "project_directory", not repo facts).
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
  // Strip the project-name tokens that leak in via hotspot/entry paths.
  for (const t of toTokens(ctx.project_identity?.name ?? "")) terms.delete(t);
  return terms;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** FLOOR: is the assessment real + grounded, vs degenerate/shallow? */
export function scoreAssessmentValidity(ctx: ContextMap): DimensionScore {
  const frameworks = (ctx.detection?.frameworks ?? []).length;
  const models = (ctx.domain_models ?? []).length;
  const routes = (ctx.routes ?? []).length;
  const files = ctx.structure?.total_files ?? 0;
  const deps = (ctx.dependency_graph?.external_dependencies ?? []).length;
  const sep = ctx.architecture_signals?.separation_score ?? 0;

  let score = 0;
  if (frameworks > 0) score += 25;
  if (models + routes > 0) score += 30;
  if (deps > 0) score += 15;
  if (files >= 5) score += 15;
  score += clamp(sep * 100) * 0.15;

  const evidence = [`frameworks=${frameworks}`, `domain_models=${models}`, `routes=${routes}`, `external_deps=${deps}`, `files=${files}`, `separation_score=${sep.toFixed(2)}`];
  const degenerate = files >= 5 && frameworks === 0 && models + routes === 0;
  const finalScore = degenerate ? Math.min(score, 30) : clamp(score);
  if (degenerate) evidence.push("degenerate: multi-file repo with no detected frameworks/models/routes");
  return { score: finalScore, passed: finalScore >= FLOORS.assessment, evidence };
}

/**
 * FLOOR: is the package GROUNDED in the repo's own facts (not pure generic
 * boilerplate)? Counts substantive docs (gate artifacts + tiny configs excluded)
 * that reference ≥2 distinct distinctive facts. This is a permissive floor — a
 * normal AXIS package (which surfaces the repo's models/routes) passes; a package
 * that ignores the repo entirely fails. It does NOT claim to measure design quality
 * (that's the LLM judge's job): grounding is necessary, not sufficient.
 */
export function scoreGrounding(files: QualityFile[], distinctive: Set<string>): DimensionScore {
  const docs = files.filter(
    (f) =>
      !GATE_ARTIFACTS.has(f.path) &&
      (/\.(md|mdx|txt)$/i.test(f.path) || (f.content_type ?? "").includes("markdown")) &&
      f.content.length >= MIN_DOC_CHARS,
  );
  if (docs.length === 0 || distinctive.size === 0) {
    return { score: 0, passed: false, evidence: [`substantive_docs=${docs.length}`, `distinctive_facts=${distinctive.size}`] };
  }
  let grounded = 0;
  const ungrounded: string[] = [];
  for (const f of docs) {
    let hits = 0;
    for (const t of new Set(toTokens(f.content))) if (distinctive.has(t)) hits++;
    if (hits >= 2) grounded++;
    else ungrounded.push(f.path);
  }
  const target = Math.min(docs.length, GROUNDING_DOC_TARGET);
  const score = clamp((grounded / target) * 100);
  const evidence = [`grounded_docs=${grounded}/${docs.length} (target ${target})`, ...(ungrounded.length ? [`ungrounded: ${ungrounded.slice(0, 8).join(", ")}`] : [])];
  return { score, passed: score >= FLOORS.grounding, evidence };
}

// Detected-need rules: warning/signal → need label + a regex that constitutes coverage.
const NEED_RULES: Array<{ match: RegExp; label: string; covered: RegExp }> = [
  { match: /\btest/i, label: "testing", covered: /\b(test|vitest|jest|mocha|pytest|spec|coverage)\b/i },
  { match: /\bci\b|ci\/cd|pipeline/i, label: "ci_cd", covered: /(\.github\/workflows|github actions|\bci\b|pipeline|workflow)/i },
  { match: /lockfile|lock file/i, label: "lockfile", covered: /(lockfile|lock file|pnpm-lock|package-lock|yarn\.lock|npm ci)/i },
  { match: /dependenc/i, label: "dependency_hygiene", covered: /(dependenc|bundle size|audit|prune|dedupe|cost)/i },
];

/** FLOOR: which DETECTED needs does the package address (via the generator's own files)? */
export function scoreNeedsCoverage(ctx: ContextMap, files: QualityFile[]): { dim: DimensionScore; detected: string[]; uncovered: string[] } {
  const warnings = ctx.ai_context?.warnings ?? [];
  const detected = new Map<string, RegExp>();
  for (const w of warnings) for (const rule of NEED_RULES) if (rule.match.test(w)) detected.set(rule.label, rule.covered);
  if ((ctx.detection?.test_frameworks ?? []).length === 0) detected.set("testing", NEED_RULES.find((x) => x.label === "testing")!.covered);
  if (!ctx.detection?.ci_platform) detected.set("ci_cd", NEED_RULES.find((x) => x.label === "ci_cd")!.covered);

  // Score the GENERATOR's files only — exclude the gate's own injected artifacts so an
  // appended needs-remediation.md (which names "vitest"/"github actions") can't
  // self-satisfy the coverage it's being checked for.
  let haystack = files
    .filter((f) => !GATE_ARTIFACTS.has(f.path))
    .map((f) => f.content)
    .join("\n")
    .toLowerCase();
  // Strip the assessment's OWN warning text before matching. The warnings ("No test
  // files detected", …) are echoed verbatim into context-map.json / architecture-
  // summary.md, so without this the coverage regex matches the RESTATED need, not a
  // remedy — making the floor vacuous (verified: a warnings-only package scored 100,
  // a full real package is unaffected). After stripping, coverage requires guidance the
  // package added BEYOND echoing the gap.
  for (const w of warnings) {
    const lw = w.toLowerCase();
    if (lw) haystack = haystack.split(lw).join(" ");
  }
  const uncovered: string[] = [];
  for (const [label, cov] of detected) if (!cov.test(haystack)) uncovered.push(label);
  const detectedLabels = [...detected.keys()];
  const score = detectedLabels.length === 0 ? 100 : clamp(((detectedLabels.length - uncovered.length) / detectedLabels.length) * 100);
  const evidence = [detectedLabels.length === 0 ? "no detected needs" : `covered ${detectedLabels.length - uncovered.length}/${detectedLabels.length}`, ...(uncovered.length ? [`uncovered: ${uncovered.join(", ")}`] : [])];
  return { dim: { score, passed: score >= FLOORS.needs, evidence }, detected: detectedLabels, uncovered };
}

/** Grade the package against the deterministic FLOORS. Pure + deterministic. */
export function gradePackage(ctx: ContextMap, files: QualityFile[]): QualityVerdict {
  const distinctive = distinctiveFactTerms(ctx);
  const av = scoreAssessmentValidity(ctx);
  const g = scoreGrounding(files, distinctive);
  const nc = scoreNeedsCoverage(ctx, files);
  const overall = clamp(av.score * 0.34 + g.score * 0.33 + nc.dim.score * 0.33);
  const grade = overall >= 90 ? "A" : overall >= 75 ? "B" : overall >= 60 ? "C" : overall >= 40 ? "D" : "F";
  const passed = av.passed && g.passed && nc.dim.passed && overall >= FLOORS.overall;
  return { grade, overall, passed, assessment_validity: av, grounding: g, needs_coverage: nc.dim, detected_needs: nc.detected, uncovered_needs: nc.uncovered };
}

/** Repo-tailored remediations for each uncovered detected need (appended as guidance). */
export function buildNeedsRemediationArtifact(ctx: ContextMap, uncovered: string[]): QualityArtifact {
  const fw = (ctx.detection?.frameworks ?? []).map(asName).filter(Boolean).join(", ") || "your stack";
  const REMEDIATIONS: Record<string, string[]> = {
    testing: ["## Testing — no test framework detected", `Add a test suite for ${fw}. Start with the highest-risk modules from the dependency hotspots in the analysis.`, "- Pick a runner that matches the stack (vitest/jest for JS/TS, pytest for Python).", "- Gate CI on the suite; target the entry points and domain-model invariants first."],
    ci_cd: ["## CI/CD — no pipeline detected", "Add a CI workflow (e.g. `.github/workflows/ci.yml`) that installs deps, builds, type-checks, and runs tests on every push/PR."],
    lockfile: ["## Lockfile — none found", "Commit a lockfile (pnpm-lock.yaml / package-lock.json) and install with `--frozen-lockfile` / `npm ci` in CI for reproducible builds."],
    dependency_hygiene: ["## Dependency hygiene — high dependency count", "Audit and prune dependencies; run `pnpm audit`/`npm audit`, dedupe, and track bundle size to keep the surface bounded."],
  };
  const body: string[] = [`# Needs Remediation — ${ctx.project_identity?.name ?? "this repo"}`, "", "Concrete, repo-specific actions for the gaps this analysis detected:", ""];
  for (const need of uncovered) body.push(...(REMEDIATIONS[need] ?? [`## ${need}`, "Detected as a gap; address per your stack."]), "");
  return { path: "needs-remediation.md", content: body.join("\n") + "\n", content_type: "text/markdown" };
}

// ─── Gate orchestration ───

export interface QualityGateOutcome {
  verdict: QualityVerdict;
  initial: QualityVerdict;
  repairArtifacts: QualityArtifact[];
}

/**
 * Grade against the floors; append a concrete needs-remediation.md as GUIDANCE when
 * needs are uncovered (it does NOT lift the score — gate artifacts are excluded from
 * scoring). assessment + grounding are reported honestly; genuine DESIGN lift is the
 * LLM judge's job, not this deterministic layer. Never blocks (repair-then-return).
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

/** Build package-quality-report.json: the deterministic floors + the LLM design verdict. */
export function buildQualityReport(outcome: QualityGateOutcome, design: DesignVerdict | null): QualityArtifact {
  const { verdict, repairArtifacts } = outcome;
  const report = {
    schema: "axis-package-quality/2",
    floors_passed: verdict.passed,
    grade: verdict.grade,
    overall: verdict.overall,
    floors: {
      assessment_validity: verdict.assessment_validity,
      grounding: verdict.grounding,
      needs_coverage: verdict.needs_coverage,
    },
    detected_needs: verdict.detected_needs,
    uncovered_needs: verdict.uncovered_needs,
    appended: repairArtifacts.map((a) => a.path),
    // The headline judgment: an AI design verdict from the engineer-mode LLM judge.
    design: design
      ? { score: design.design_score, tailored: design.tailored, rationale: design.rationale, top_improvement: design.top_improvement ?? null }
      : { assessed: false, note: "Design quality is judged by the engineer-mode AI judge; not assessed on this call." },
  };
  return { path: "package-quality-report.json", content: JSON.stringify(report, null, 2), content_type: "application/json" };
}
