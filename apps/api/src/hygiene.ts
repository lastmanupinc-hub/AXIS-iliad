// ─── iliad_hygiene — content-based workspace hygiene engine ─────────────────
//
// A deterministic, dependency-free port of the PowerShell workspace-hygiene
// engine, adapted to the MCP's inline-file model: it analyzes a `files:
// [{path, content}]` payload (no live git/filesystem), grades the workspace
// A–F across a closed set of dimensions, and (in fix mode) emits a concrete
// remediation plan. Pure functions, no I/O — the MCP handler wires auth/meter.
//
// Rules that require a live repo (git worktrees, go build/vet, git check-ignore,
// git grep) are intentionally OUT of scope here and reported as repo-only; the
// content-analyzable rules below are universal across any repo.

import { createHash } from "node:crypto";

export interface HygieneFile {
  path: string;
  content: string;
  size: number;
}

export type Severity = "low" | "medium" | "high";
export type Policy = "open" | "deferred" | "rotated";
export type Grade = "A" | "B" | "C" | "D" | "F";

export interface HygieneFinding {
  id: string;
  ruleId: string;
  severity: Severity;
  path: string;
  message: string;
  policy: Policy;
  recommendedAction: string;
}

export interface HygieneDimension {
  id: string;
  grade: Grade;
  detail: string;
}

export interface HygieneReport {
  grade: Grade;
  reasons: string[];
  dimensions: HygieneDimension[];
  counts: { high: number; medium: number; low: number; deferredByPolicy: number };
  findings: HygieneFinding[];
  scanned: { files: number; bytes: number };
  repo_only_rules: string[];
}

export interface RemediationStep {
  ruleId: string;
  severity: Severity;
  target: string;
  action: string;
}

export interface RemediationPlan {
  ordered_steps: RemediationStep[];
  gitignore_additions: string[];
  summary: string;
}

const LETTER_RANK: Record<Grade, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };
const minGrade = (a: Grade, b: Grade): Grade => (LETTER_RANK[a] <= LETTER_RANK[b] ? a : b);

// ─── config (overridable per call) ──────────────────────────────────────────
export interface HygieneConfig {
  maxFileBytes: number;
  coverageA: number;
  coverageB: number;
  coverageC: number;
  todoDebtThreshold: number;
  // A separate test suite this large (test files / source files) is treated as
  // evidence of testing even when names don't mirror modules 1:1, so the weak
  // filename proxy can't crater the grade. Set to Infinity to disable the floor.
  coverageRatioFloor: number;
}
export const DEFAULT_CONFIG: HygieneConfig = {
  maxFileBytes: 524_288, // 512 KiB — a tracked source file over this is a blob smell
  coverageA: 80,
  coverageB: 60,
  coverageC: 40,
  todoDebtThreshold: 25,
  coverageRatioFloor: 0.5,
};

// Secret patterns (deterministic). Each entry: provider label + regex.
const SECRET_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "Stripe live secret key", re: /sk_live_[0-9a-zA-Z]{16,}/ },
  { label: "Stripe webhook secret", re: /whsec_[0-9a-zA-Z]{16,}/ },
  { label: "Stripe restricted key", re: /rk_live_[0-9a-zA-Z]{16,}/ },
  { label: "AWS access key id", re: /AKIA[0-9A-Z]{16}/ },
  { label: "GitHub token", re: /gh[pousr]_[0-9a-zA-Z]{36,}/ },
  { label: "Google API key", re: /AIza[0-9A-Za-z_\-]{35}/ },
  { label: "Slack token", re: /xox[baprs]-[0-9a-zA-Z\-]{10,}/ },
  { label: "Private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
];
// low-entropy placeholder tokens that are NOT real secrets (case-insensitive)
const PLACEHOLDER_MARKERS = [
  "xxxx", "abcdef1234", "0000", "example", "changeme", "redacted",
  "your_", "placeholder", "dummy", "<", "nnnn", "1234567890",
];
// path globs (suffix/segment match) allowed to contain secret-shaped strings
const SECRET_ALLOW = [/_test\.[a-z]+$/i, /\.test\.[a-z]+$/i, /\.spec\.[a-z]+$/i, /(^|\/)tests?\//i, /(^|\/)testdata\//i, /(^|\/)docs?\//i, /\.md$/i, /(^|\/)fixtures?\//i];

// Env-template suffixes that are MEANT to be committed (they document the env
// shape and conventionally hold only placeholders). Real secrets that slip into
// them are still caught independently by detectSecrets(); this only stops the
// gitignore-gap rule from flagging a deliberate template as a "secrets file".
const ENV_TEMPLATE = /(^|\/)\.env\.(?:example|sample|template|dist|defaults|local\.example)$/i;

// paths that SHOULD be gitignored if present (build/scratch/secret artifacts).
// `except` carves out files that legitimately match `re` but should not be flagged.
const SHOULD_IGNORE: Array<{ re: RegExp; why: string; gi: string; secret?: boolean; except?: RegExp }> = [
  { re: /(^|\/)node_modules\//, why: "dependency dir", gi: "node_modules/" },
  { re: /(^|\/)dist\//, why: "build output", gi: "dist/" },
  { re: /(^|\/)build\//, why: "build output", gi: "build/" },
  { re: /(^|\/)coverage\//, why: "coverage output", gi: "coverage/" },
  { re: /(^|\/)__pycache__\//, why: "python cache", gi: "__pycache__/" },
  { re: /(^|\/)\.next\//, why: "next build cache", gi: ".next/" },
  { re: /\.log$/, why: "log file", gi: "*.log" },
  { re: /\.DS_Store$/, why: "macOS metadata", gi: ".DS_Store" },
  { re: /(^|\/)\.env(\.[a-z.]+)?$/, why: "environment / secrets file", gi: ".env", secret: true, except: ENV_TEMPLATE },
];

// Stub markers signal UNFINISHED work, not merely the presence of a keyword.
// A bare `raise NotImplementedError("unsupported kind")` / abstract-method raise
// is finished, intentional control flow — flagging it on keyword presence alone
// produced false positives on input-rejection guards, tombstones, and even other
// stub-detectors that merely mention the word. So each marker now requires an
// explicit "to-be-done" intent (TODO/FIXME) or a language idiom that is only ever
// a stub. Scanned over CODE files only (see detectStubs) so data/markup that
// describes gaps (YAML/HTML/MD) is never mistaken for code.
const STUB_MARKERS: RegExp[] = [
  /\b(?:TODO|FIXME)\b[^\n]*?\bimplement/i,                                 // "TODO: implement X"
  /(?:throw\s+new\s+Error|panic)\s*\(\s*[`'"][^`'"\n]*not\s*implement/i,   // throw new Error("not implemented") / panic("not implemented")
  /\braise\s+NotImplementedError\s*\(\s*[`'"]\s*(?:TODO|FIXME)\b/i,        // raise NotImplementedError("TODO: ...")
  /\b(?:unimplemented|todo)!\s*\(\s*\)/,                                   // Rust unimplemented!() / todo!()
  /\bpanic\(\s*[`'"]TODO/i,                                                // Go panic("TODO...")
  /Example\s+refactored/i,                                                 // generator scaffold left-behind marker
];

const TODO_RE = /\b(TODO|FIXME|HACK|XXX)\b/g;

const isAllowedSecretPath = (p: string) => SECRET_ALLOW.some(re => re.test(p));
const hasPlaceholder = (tok: string) => {
  const low = tok.toLowerCase();
  return PLACEHOLDER_MARKERS.some(m => low.includes(m));
};

// crude but deterministic .gitignore matcher: handles `dir/`, `*.ext`, exact, and
// bare-name-anywhere patterns. Good enough to detect obvious gaps from content.
function gitignoreCovers(patterns: string[], path: string): boolean {
  for (const raw of patterns) {
    const pat = raw.trim();
    if (!pat || pat.startsWith("#")) continue;
    const p = pat.replace(/^\//, "");
    if (p.endsWith("/")) {
      const dir = p.slice(0, -1);
      if (path === dir || path.startsWith(dir + "/") || path.includes("/" + dir + "/")) return true;
    } else if (p.startsWith("*.")) {
      if (path.endsWith(p.slice(1))) return true;
    } else {
      const base = path.split("/").pop() ?? path;
      if (path === p || base === p || path.endsWith("/" + p)) return true;
    }
  }
  return false;
}

// ─── detectors ──────────────────────────────────────────────────────────────

function detectSecrets(files: HygieneFile[]): HygieneFinding[] {
  const out: HygieneFinding[] = [];
  for (const f of files) {
    if (isAllowedSecretPath(f.path)) continue;
    for (const { label, re } of SECRET_PATTERNS) {
      const g = new RegExp(re.source, "g");
      const seen = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = g.exec(f.content)) !== null) {
        const tok = m[0];
        if (hasPlaceholder(tok) || seen.has(tok)) continue;
        seen.add(tok);
        out.push({
          id: `secret-${f.path}-${seen.size}`,
          ruleId: "secret_scan",
          severity: "high",
          path: f.path,
          policy: "open",
          message: `Possible committed ${label} in tracked file (e.g. ${tok.slice(0, 8)}...REDACTED)`,
          recommendedAction: "ROTATE the credential now, remove from the file, add the source to .gitignore, scrub history",
        });
      }
    }
  }
  return out;
}

function detectLargeFiles(files: HygieneFile[], cfg: HygieneConfig): HygieneFinding[] {
  return files
    .filter(f => f.size > cfg.maxFileBytes && !/\.(lock|snap)$/.test(f.path))
    .map(f => ({
      id: `large-${f.path}`,
      ruleId: "large_files",
      severity: "medium" as Severity,
      path: f.path,
      policy: "open" as Policy,
      message: `Tracked file ${(f.size / 1024).toFixed(0)} KiB exceeds ${(cfg.maxFileBytes / 1024).toFixed(0)} KiB cap`,
      recommendedAction: "split, vendor out, gitignore if generated, or move to git-lfs",
    }));
}

function detectGitignoreGaps(files: HygieneFile[]): HygieneFinding[] {
  const gi = files.find(f => f.path === ".gitignore");
  const patterns = gi ? gi.content.split(/\r?\n/) : [];
  const out: HygieneFinding[] = [];
  const flagged = new Set<string>();
  for (const f of files) {
    for (const rule of SHOULD_IGNORE) {
      if (!rule.re.test(f.path)) continue;
      if (rule.except && rule.except.test(f.path)) continue; // committed-by-design (e.g. .env.example)
      if (gitignoreCovers(patterns, f.path)) continue;
      if (flagged.has(rule.gi)) continue; // one finding per pattern, not per file
      flagged.add(rule.gi);
      out.push({
        id: `gi-gap-${rule.gi}`,
        ruleId: "gitignore_gaps",
        severity: rule.secret ? "high" : "medium",
        path: f.path,
        policy: "open",
        message: `${rule.why} present but not gitignored (pattern '${rule.gi}' missing)`,
        recommendedAction: rule.secret
          ? `add '${rule.gi}' to .gitignore AND rotate any secrets it held`
          : `add '${rule.gi}' to .gitignore`,
      });
    }
  }
  return out;
}

function detectStubs(files: HygieneFile[]): HygieneFinding[] {
  const out: HygieneFinding[] = [];
  for (const f of files) {
    if (!SRC_EXT.test(f.path)) continue;        // code only — data/markup describing gaps is not a stub
    if (isAllowedSecretPath(f.path)) continue;  // skip tests/docs
    const hit = STUB_MARKERS.find(re => re.test(f.content));
    if (hit) {
      out.push({
        id: `stub-${f.path}`,
        ruleId: "stub_detection",
        severity: "medium",
        path: f.path,
        policy: "open",
        message: `Stub/placeholder marker found (production code should return real results)`,
        recommendedAction: "implement the stubbed path or remove the dead scaffold",
      });
    }
  }
  return out;
}

function detectDuplicates(files: HygieneFile[]): HygieneFinding[] {
  const byHash = new Map<string, string[]>();
  for (const f of files) {
    if (f.content.trim() === "") continue;
    const h = createHash("sha1").update(f.content).digest("hex");
    const arr = byHash.get(h) ?? [];
    arr.push(f.path);
    byHash.set(h, arr);
  }
  const out: HygieneFinding[] = [];
  for (const [, paths] of [...byHash.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (paths.length > 1) {
      const sorted = [...paths].sort();
      // code dupes should be imported; identical assets/data should just be pruned
      const allCode = sorted.every(p => SRC_EXT.test(p));
      out.push({
        id: `dup-${sorted[0]}`,
        ruleId: "duplicate_content",
        severity: "low",
        path: sorted.join(", "),
        policy: "open",
        message: `${paths.length} files have byte-identical content`,
        recommendedAction: allCode
          ? "dedupe into a single module and import it"
          : "keep one canonical copy and remove the redundant duplicates",
      });
    }
  }
  return out;
}

const SRC_EXT = /\.(ts|tsx|js|jsx|go|py|rb|java|cs|rs)$/;
const isTestPeer = (p: string) => /(\.test\.|\.spec\.|_test\.)/.test(p) || /(^|\/)tests?\//.test(p);

// Recover the source basename a test file most likely exercises, across the
// common conventions, so a separate tests/ tree counts — not only co-located
// peers. foo.test.ts->foo, foo_test.go->foo, test_foo.py->foo, tests/foo.py->foo.
function testedBaseName(testPath: string): string | null {
  const base = (testPath.split("/").pop() ?? testPath).toLowerCase();
  let m: RegExpMatchArray | null;
  if ((m = base.match(/^(.+?)\.(?:test|spec)\.[a-z]+$/))) return m[1];
  if ((m = base.match(/^(.+?)_test\.[a-z]+$/))) return m[1];
  if ((m = base.match(/^test_(.+?)\.[a-z]+$/))) return m[1];
  if ((m = base.match(/^(.+?)\.[a-z]+$/))) return m[1];
  return null;
}

function detectCoverage(files: HygieneFile[], cfg: HygieneConfig): { finding: HygieneFinding; pct: number; floored: boolean } {
  const paths = new Set(files.map(f => f.path));
  const sources = files.filter(f => SRC_EXT.test(f.path) && !isTestPeer(f.path));
  const testFiles = files.filter(f => SRC_EXT.test(f.path) && isTestPeer(f.path));

  // names of source modules that a test (anywhere in the tree) appears to cover
  const tested = new Set<string>();
  for (const t of testFiles) {
    const n = testedBaseName(t.path);
    if (n) tested.add(n);
  }

  const missing: string[] = [];
  for (const s of sources) {
    const ext = (s.path.match(SRC_EXT) ?? [""])[0];
    const noExt = s.path.replace(SRC_EXT, "");
    const sbase = (noExt.split("/").pop() ?? noExt).toLowerCase();
    const coLocated = [`${noExt}.test${ext}`, `${noExt}.spec${ext}`, `${noExt}_test${ext}`].some(c => paths.has(c));
    if (coLocated || tested.has(sbase)) continue;
    missing.push(s.path);
  }
  const total = sources.length;
  const covered = total - missing.length;
  const pct = total > 0 ? Math.round((1000 * covered) / total) / 10 : 100;

  // A substantial separate suite is evidence of testing even when descriptive
  // test names don't map 1:1 to modules. Don't let the filename proxy dominate.
  const ratio = total > 0 ? testFiles.length / total : 0;
  const floored = ratio >= cfg.coverageRatioFloor;

  const finding: HygieneFinding = {
    id: "test-coverage",
    ruleId: "test_peer_coverage",
    severity: "low",
    path: "(repo)",
    // when floored, the suite is deemed sufficient → not an open finding
    policy: missing.length > 0 && !floored ? "open" : "rotated",
    message:
      `Source test-peer coverage: ${covered}/${total} = ${pct}% ` +
      `(test files: ${testFiles.length}, test/src ratio: ${ratio.toFixed(2)})` +
      (floored ? ` — substantial suite present, coverage dimension floored to B` : "") +
      (missing.length && !floored ? `. Missing peers: ${missing.slice(0, 15).join(", ")}${missing.length > 15 ? " ..." : ""}` : ""),
    recommendedAction: "add a co-located *.test/_test peer or a matching test_<name> for the uncovered sources",
  };
  return { finding, pct, floored };
}

function detectTodoDebt(files: HygieneFile[], cfg: HygieneConfig): { finding: HygieneFinding | null; count: number } {
  let count = 0;
  for (const f of files) {
    if (isAllowedSecretPath(f.path)) continue;
    const m = f.content.match(TODO_RE);
    if (m) count += m.length;
  }
  if (count <= cfg.todoDebtThreshold) return { finding: null, count };
  return {
    count,
    finding: {
      id: "todo-debt",
      ruleId: "todo_debt",
      severity: "low",
      path: "(repo)",
      policy: "open",
      message: `${count} TODO/FIXME/HACK/XXX markers (threshold ${cfg.todoDebtThreshold})`,
      recommendedAction: "triage the backlog markers into tracked issues or resolve them",
    },
  };
}

// ─── grade engine ─────────────────────────────────────────────────────────────

function gradeReport(findings: HygieneFinding[], coveragePct: number, coverageFloored: boolean, cfg: HygieneConfig): {
  grade: Grade; reasons: string[]; dimensions: HygieneDimension[];
} {
  const openOf = (rule: string) => findings.filter(f => f.ruleId === rule && f.policy === "open").length;
  const highSecretFileGap = findings.filter(f => f.ruleId === "gitignore_gaps" && f.severity === "high" && f.policy === "open").length;
  const dims: HygieneDimension[] = [];
  const push = (id: string, grade: Grade, detail: string) => dims.push({ id, grade, detail });

  // Per-dimension report card (informative detail; the overall grade below is
  // computed from open-finding severity, not a brittle min of these letters).
  push("secrets", openOf("secret_scan") === 0 && highSecretFileGap === 0 ? "A" : "F", `${openOf("secret_scan")} secrets`);
  push("gitignore_clean", openOf("gitignore_gaps") === 0 ? "A" : "C", `${openOf("gitignore_gaps")} gaps`);
  push("large_files", openOf("large_files") === 0 ? "A" : "B", `${openOf("large_files")} oversized`);
  push("stubs", openOf("stub_detection") === 0 ? "A" : "C", `${openOf("stub_detection")} stubs`);
  push("duplicates", openOf("duplicate_content") === 0 ? "A" : "B", `${openOf("duplicate_content")} dup sets`);
  push("todo_debt", openOf("todo_debt") === 0 ? "A" : "B", `${openOf("todo_debt") ? "over threshold" : "ok"}`);

  let covLetter: Grade = "A";
  if (coveragePct >= cfg.coverageA) covLetter = "A";
  else if (coveragePct >= cfg.coverageB) covLetter = "B";
  else if (coveragePct >= cfg.coverageC) covLetter = "C";
  else covLetter = "D";
  if (coverageFloored && LETTER_RANK[covLetter] < LETTER_RANK["B"]) covLetter = "B";
  push("test_peer_coverage", covLetter, `coverage=${coveragePct}%${coverageFloored ? " (suite-floored)" : ""}`);

  // Overall = severity-weighted, so one minor finding can't crater the grade and
  // a single FALSE finding can't force an F. Only a genuine committed secret (a
  // live token, or a non-template secret FILE) is F-worthy.
  const open = findings.filter(f => f.policy === "open");
  const realSecret = openOf("secret_scan") > 0 || highSecretFileGap > 0;
  const highOther = open.filter(f => f.severity === "high" && f.ruleId !== "secret_scan" && f.ruleId !== "gitignore_gaps").length;
  const med = open.filter(f => f.severity === "medium").length;
  const low = open.filter(f => f.severity === "low").length;

  let overall: Grade;
  if (realSecret) overall = "F";
  else if (highOther > 0) overall = "D";
  else if (med >= 4) overall = "C";
  else if (med >= 1) overall = "B";
  else if (low >= 1) overall = "B";
  else overall = "A";

  const reasons: string[] = [];
  for (const d of dims) {
    if (LETTER_RANK[d.grade] < 5) reasons.push(`${d.id}=${d.grade} (${d.detail})`);
  }
  return { grade: overall, reasons, dimensions: dims };
}

// ─── public API ───────────────────────────────────────────────────────────────

export const REPO_ONLY_RULES = [
  "worktree_pruning (needs live .git)",
  "build_vet_health (needs toolchain)",
  "governance_source_of_truth (needs repo conventions/config)",
  "duplicate_handlers (needs route-registration analysis)",
  "roi_queue_coherence (needs project queue files + config)",
];

export function runHygieneScan(files: HygieneFile[], config?: Partial<HygieneConfig>): HygieneReport {
  const cfg = { ...DEFAULT_CONFIG, ...(config ?? {}) };
  const findings: HygieneFinding[] = [];
  findings.push(...detectSecrets(files));
  findings.push(...detectGitignoreGaps(files));
  findings.push(...detectLargeFiles(files, cfg));
  findings.push(...detectStubs(files));
  findings.push(...detectDuplicates(files));
  const cov = detectCoverage(files, cfg);
  findings.push(cov.finding);
  const todo = detectTodoDebt(files, cfg);
  if (todo.finding) findings.push(todo.finding);

  const { grade, reasons, dimensions } = gradeReport(findings, cov.pct, cov.floored, cfg);
  const counts = {
    high: findings.filter(f => f.severity === "high" && f.policy === "open").length,
    medium: findings.filter(f => f.severity === "medium" && f.policy === "open").length,
    low: findings.filter(f => f.severity === "low" && f.policy === "open").length,
    deferredByPolicy: findings.filter(f => f.policy === "deferred").length,
  };
  return {
    grade,
    reasons,
    dimensions,
    counts,
    findings,
    scanned: { files: files.length, bytes: files.reduce((n, f) => n + f.size, 0) },
    repo_only_rules: REPO_ONLY_RULES,
  };
}

const SEV_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

export function buildRemediationPlan(report: HygieneReport): RemediationPlan {
  const open = report.findings.filter(f => f.policy === "open");
  const ordered_steps: RemediationStep[] = [...open]
    .sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || a.ruleId.localeCompare(b.ruleId))
    .map(f => ({ ruleId: f.ruleId, severity: f.severity, target: f.path, action: f.recommendedAction }));
  const gitignore_additions = [
    ...new Set(
      open
        .filter(f => f.ruleId === "gitignore_gaps")
        .map(f => {
          const m = f.message.match(/pattern '([^']+)' missing/);
          return m ? m[1] : null;
        })
        .filter((x): x is string => !!x),
    ),
  ].sort();
  const high = open.filter(f => f.severity === "high").length;
  const summary =
    `${ordered_steps.length} remediation step(s): ` +
    `${high} high-severity first (secrets/secret-files — rotate immediately), then ` +
    `${open.filter(f => f.severity === "medium").length} medium, ` +
    `${open.filter(f => f.severity === "low").length} low. ` +
    (gitignore_additions.length ? `Apply ${gitignore_additions.length} .gitignore line(s).` : "");
  return { ordered_steps, gitignore_additions, summary };
}
