// ─── app_21_closer_release_operator: decide + tag a release ─────
//
// generateCloserReleaseWorkflow (packages/generator-core/src/generators-closer.ts)
// already emits a COMPLETE .github/workflows/release.yml: push a `v*` tag and
// the user's own CI builds, publishes to npm/Docker, verifies the attestation
// bundle, and creates the GitHub Release via softprops/action-gh-release. This
// module does NOT duplicate any of that — it answers the question that
// workflow leaves entirely manual: what should the NEXT version number be,
// and what does the changelog say? `axis release` analyzes conventional
// commits since the last tag, computes the correct semver bump, and (only
// with --execute) creates the local tag that workflow already triggers off
// of.
//
// Safety, matching this codebase's established local-only philosophy
// (app_10's verify-deploy, app_20's hosted-MCP scoping): dry-run by default;
// --execute updates package.json + CHANGELOG.md, commits, and creates the
// git tag locally — but NEVER pushes. Pushing is the point where the
// generated CI workflow fires a REAL npm publish / GitHub Release, so an
// explicit, separate `git push --follow-tags` is left as a manual final step
// the user runs themselves, not something this tool does on their behalf.
//
// No new dependency: conventional-changelog (named in the original
// candidate) would need to be reachable from the CLI's module graph, which
// apps/cli/build.mjs forbids for any real npm package (the same constraint
// that shaped app_03's verify-harness.ts and app_12's color-contrast.ts) —
// conventional-commit parsing is a small enough regex + a few rules to not
// need a library anyway.

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

export interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export type RunCmd = (cmd: string, args: string[], cwd?: string) => RunResult;

export interface ConventionalCommit {
  hash: string;
  type: string;
  scope: string | null;
  breaking: boolean;
  subject: string;
}

const HEADER_RE = /^(\w+)(\(([^)]+)\))?(!)?:\s*(.+)$/;

/** Parses a commit's subject/body into a conventional-commit shape, or null if the subject doesn't match `type(scope)!: subject`. */
export function parseConventionalCommit(hash: string, subject: string, body: string): ConventionalCommit | null {
  const m = subject.match(HEADER_RE);
  if (!m) return null;
  const [, type, , scope, bang, rest] = m;
  return {
    hash,
    type: type.toLowerCase(),
    scope: scope ?? null,
    breaking: Boolean(bang) || /BREAKING[ -]CHANGE:/.test(body),
    subject: rest,
  };
}

export type VersionBump = "major" | "minor" | "patch" | "none";

/** Highest-priority bump implied by a set of commits: any breaking change wins outright, else feat > fix/perf > none. */
export function determineBump(commits: ConventionalCommit[]): VersionBump {
  let bump: VersionBump = "none";
  for (const c of commits) {
    if (c.breaking) return "major";
    if (c.type === "feat" && bump !== "minor") bump = "minor";
    else if ((c.type === "fix" || c.type === "perf") && bump === "none") bump = "patch";
  }
  return bump;
}

/** Applies a bump to a semver string (leading "v" tolerated), resetting lower components per semver rules. */
export function applyBump(version: string, bump: VersionBump): string {
  const parts = version.replace(/^v/, "").split(".").map((n) => parseInt(n, 10));
  const [major, minor, patch] = [parts[0] || 0, parts[1] || 0, parts[2] || 0];
  switch (bump) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    case "none":
      return `${major}.${minor}.${patch}`;
  }
}

/** Markdown changelog section for one release, grouped breaking/features/fixes — conventional-changelog's own output shape, hand-rolled. */
export function buildChangelogSection(version: string, isoDate: string, commits: ConventionalCommit[]): string {
  const breaking = commits.filter((c) => c.breaking);
  const feats = commits.filter((c) => c.type === "feat" && !c.breaking);
  const fixes = commits.filter((c) => (c.type === "fix" || c.type === "perf") && !c.breaking);

  const lines: string[] = [`## ${version} (${isoDate})`, ""];
  const section = (title: string, list: ConventionalCommit[]) => {
    if (list.length === 0) return;
    lines.push(`### ${title}`, "");
    for (const c of list) lines.push(`- ${c.scope ? `**${c.scope}:** ` : ""}${c.subject} (${c.hash.slice(0, 7)})`);
    lines.push("");
  };
  section("⚠ BREAKING CHANGES", breaking);
  section("Features", feats);
  section("Bug Fixes", fixes);
  return `${lines.join("\n").trimEnd()}\n`;
}

export interface RawCommit {
  hash: string;
  subject: string;
  body: string;
}

/** The last annotated/lightweight tag reachable from HEAD, or null in a repo with no tags yet. */
export function getLastTag(run: RunCmd, cwd: string): string | null {
  const r = run("git", ["-C", cwd, "describe", "--tags", "--abbrev=0"]);
  return r.status === 0 ? r.stdout.trim() || null : null;
}

const FIELD_SEP = "\x1f";
const RECORD_SEP = "\x1e";

/** Commits between `sinceTag` (exclusive) and HEAD, oldest first — the range a fresh release would cover. */
export function getCommitsSince(run: RunCmd, cwd: string, sinceTag: string | null): RawCommit[] {
  const range = sinceTag ? `${sinceTag}..HEAD` : "HEAD";
  const r = run("git", ["-C", cwd, "log", "--reverse", range, `--pretty=format:%H${FIELD_SEP}%s${FIELD_SEP}%b${RECORD_SEP}`]);
  if (r.status !== 0 || !r.stdout.trim()) return [];
  return r.stdout
    .split(RECORD_SEP)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash, subject, body] = record.split(FIELD_SEP);
      return { hash, subject: subject ?? "", body: body ?? "" };
    });
}

export interface ReleasePreview {
  currentVersion: string;
  lastTag: string | null;
  commits: ConventionalCommit[];
  skippedCommits: number;
  bump: VersionBump;
  nextVersion: string;
  changelog: string;
}

/** Pure: turns raw commit log entries into the full release decision (version + changelog). No git/fs side effects. */
export function computeReleasePreview(currentVersion: string, lastTag: string | null, rawCommits: RawCommit[], isoDate: string): ReleasePreview {
  const parsed = rawCommits.map((c) => parseConventionalCommit(c.hash, c.subject, c.body));
  const commits = parsed.filter((c): c is ConventionalCommit => c !== null);
  const bump = determineBump(commits);
  const nextVersion = applyBump(currentVersion, bump);
  return {
    currentVersion,
    lastTag,
    commits,
    skippedCommits: parsed.length - commits.length,
    bump,
    nextVersion,
    changelog: buildChangelogSection(nextVersion, isoDate, commits),
  };
}

function detectInstallCommand(cwd: string): { pm: string; build: string[] } {
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return { pm: "pnpm", build: ["run", "build", "--if-present"] };
  if (existsSync(join(cwd, "yarn.lock"))) return { pm: "yarn", build: ["build", "--if-present"] };
  if (existsSync(join(cwd, "bun.lockb"))) return { pm: "bun", build: ["run", "build", "--if-present"] };
  return { pm: "npm", build: ["run", "build", "--if-present"] };
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function walkFiles(dir: string, base: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walkFiles(full, base, out);
    else out.push(relative(base, full).split("\\").join("/"));
  }
  return out;
}

export interface ChecksumResult {
  distDir: string;
  checksums: Record<string, string>;
}

/** Runs the real build (package-manager-aware) and hashes every file it produced under dist/ — a real pre-flight integrity check before tagging, not a placeholder. Returns null if there's no dist/ output to check (e.g. a non-buildable project). */
export function runBuildAndChecksum(run: RunCmd, cwd: string): { ok: true; result: ChecksumResult | null } | { ok: false; log: string } {
  const { pm, build } = detectInstallCommand(cwd);
  // cwd MUST be passed explicitly: unlike the git calls elsewhere in this
  // file (which pass `-C cwd` as an actual git argument), a bare npm/pnpm/
  // yarn/bun invocation has no equivalent flag and would otherwise inherit
  // the CALLING process's cwd — which, run from inside axis-iliad's own
  // repo, silently built THIS ENTIRE MONOREPO instead of the target
  // project. Caught by release-operator.integration.test.ts running a real
  // build against a real fixture repo, not assumed correct from a mock.
  const built = run(pm, build, cwd);
  if (built.status !== 0) {
    return { ok: false, log: `${built.stdout}${built.stderr}` };
  }
  const distDir = join(cwd, "dist");
  if (!existsSync(distDir)) return { ok: true, result: null };
  const checksums: Record<string, string> = {};
  for (const file of walkFiles(distDir, distDir)) {
    checksums[file] = sha256File(join(distDir, file));
  }
  return { ok: true, result: { distDir, checksums } };
}

export interface ReleaseExecuteResult {
  status: "tagged" | "build_failed" | "nothing_to_release";
  version?: string;
  tag?: string;
  buildLog?: string;
  checksums?: Record<string, string>;
}

/**
 * Performs the release, up to and including creating the local git tag —
 * never pushes (see module header). Writes package.json's version and
 * prepends CHANGELOG.md, then commits both plus any checksum manifest.
 */
export function executeRelease(run: RunCmd, cwd: string, preview: ReleasePreview): ReleaseExecuteResult {
  if (preview.bump === "none") return { status: "nothing_to_release" };

  const built = runBuildAndChecksum(run, cwd);
  if (!built.ok) return { status: "build_failed", buildLog: built.log };

  const pkgPath = join(cwd, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
  pkg.version = preview.nextVersion;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf-8");

  const changelogPath = join(cwd, "CHANGELOG.md");
  const existing = existsSync(changelogPath) ? readFileSync(changelogPath, "utf-8") : "";
  writeFileSync(changelogPath, `${preview.changelog}\n${existing}`, "utf-8");

  const filesToCommit = ["package.json", "CHANGELOG.md"];
  if (built.result) {
    const checksumPath = join(cwd, "RELEASE_CHECKSUMS.txt");
    const lines = Object.entries(built.result.checksums)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, hash]) => `${hash}  ${path}`);
    writeFileSync(checksumPath, `${lines.join("\n")}\n`, "utf-8");
    filesToCommit.push("RELEASE_CHECKSUMS.txt");
  }

  const tag = `v${preview.nextVersion}`;
  run("git", ["-C", cwd, "add", ...filesToCommit]);
  run("git", ["-C", cwd, "commit", "-m", `chore(release): ${tag}`]);
  run("git", ["-C", cwd, "tag", "-a", tag, "-m", tag]);

  return { status: "tagged", version: preview.nextVersion, tag, checksums: built.result?.checksums };
}

/** Upper bound on any single shelled-out command (build, git). If it's still running past this, something is genuinely stuck (e.g. npm's own update-notifier reaching out over a slow/proxied network) — treated as a failure, never left to hang. */
const DEFAULT_RUN_CMD_TIMEOUT_MS = 60_000;

export function realRunCmd(timeoutMs: number = DEFAULT_RUN_CMD_TIMEOUT_MS): RunCmd {
  return (cmd, args, cwd) => {
    // npm/pnpm/yarn/bun are .cmd shims on Windows — spawnSync can't resolve
    // them without a shell (real ENOENT, caught by release-operator.integration.test.ts
    // against an actual Windows spawnSync call, not assumed). git.exe needs no
    // shell but tolerates one fine, so this applies uniformly rather than
    // branching per command. Every arg passed through this file is either a
    // fixed literal or a version string this tool itself computed (never
    // arbitrary user input), so shell interpretation carries no injection risk.
    //
    // `timeout` is a real backstop, kept even after finding the actual cause
    // of an early 200+-second "hang" during development (it wasn't a hang:
    // runBuildAndChecksum's build invocation was missing `cwd`, so it built
    // this ENTIRE monorepo instead of the tiny fixture repo under test — a
    // real multi-minute `pnpm -r build`, not a stall). spawnSync blocks the
    // whole thread synchronously, so nothing calling this can ever preempt a
    // genuinely stuck child process except the child's own timeout.
    const r = spawnSync(cmd, args, {
      encoding: "utf-8",
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs,
      cwd,
      env: {
        ...process.env,
        NO_UPDATE_NOTIFIER: "1",
        NPM_CONFIG_UPDATE_NOTIFIER: "false",
        NPM_CONFIG_FUND: "false",
        NPM_CONFIG_AUDIT: "false",
      },
    });
    return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? (r.error ? r.error.message : "") };
  };
}
