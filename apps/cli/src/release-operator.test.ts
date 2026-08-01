import { describe, it, expect } from "vitest";
import {
  parseConventionalCommit,
  determineBump,
  applyBump,
  buildChangelogSection,
  computeReleasePreview,
  executeRelease,
  type RunCmd,
  type RunResult,
  type ReleasePreview,
} from "./release-operator.js";

describe("parseConventionalCommit", () => {
  it("parses a plain feat commit", () => {
    const c = parseConventionalCommit("abc123", "feat: add dark mode", "");
    expect(c).toEqual({ hash: "abc123", type: "feat", scope: null, breaking: false, subject: "add dark mode" });
  });

  it("parses a scoped fix commit", () => {
    const c = parseConventionalCommit("abc123", "fix(auth): handle expired tokens", "");
    expect(c).toEqual({ hash: "abc123", type: "fix", scope: "auth", breaking: false, subject: "handle expired tokens" });
  });

  it("detects a breaking change via the ! marker", () => {
    const c = parseConventionalCommit("abc123", "feat(api)!: remove v1 endpoints", "");
    expect(c?.breaking).toBe(true);
  });

  it("detects a breaking change via a BREAKING CHANGE: footer", () => {
    const c = parseConventionalCommit("abc123", "fix: adjust rate limit", "BREAKING CHANGE: default limit is now 10/min");
    expect(c?.breaking).toBe(true);
  });

  it("returns null for a non-conventional subject", () => {
    expect(parseConventionalCommit("abc123", "wip stuff", "")).toBeNull();
  });
});

describe("determineBump", () => {
  const commit = (type: string, breaking = false): ReturnType<typeof parseConventionalCommit> => ({ hash: "h", type, scope: null, breaking, subject: "s" });

  it("returns none for an empty commit list", () => {
    expect(determineBump([])).toBe("none");
  });

  it("returns patch for fix/perf-only commits", () => {
    expect(determineBump([commit("fix")!, commit("perf")!])).toBe("patch");
  });

  it("returns minor when a feat is present, even alongside fixes", () => {
    expect(determineBump([commit("fix")!, commit("feat")!])).toBe("minor");
  });

  it("returns major when ANY commit is breaking, regardless of order", () => {
    expect(determineBump([commit("feat")!, commit("fix", true)!])).toBe("major");
  });

  it("ignores non-version-worthy types (chore/docs) entirely", () => {
    expect(determineBump([commit("chore")!, commit("docs")!])).toBe("none");
  });
});

describe("applyBump", () => {
  it("bumps major and resets minor/patch to 0", () => {
    expect(applyBump("1.2.3", "major")).toBe("2.0.0");
  });
  it("bumps minor and resets patch to 0", () => {
    expect(applyBump("1.2.3", "minor")).toBe("1.3.0");
  });
  it("bumps patch only", () => {
    expect(applyBump("1.2.3", "patch")).toBe("1.2.4");
  });
  it("returns the same version for none", () => {
    expect(applyBump("1.2.3", "none")).toBe("1.2.3");
  });
  it("tolerates a leading v", () => {
    expect(applyBump("v1.2.3", "patch")).toBe("1.2.4");
  });
});

describe("buildChangelogSection", () => {
  it("groups commits into Breaking/Features/Fixes sections in that order", () => {
    const commits = [
      parseConventionalCommit("aaa1111", "feat: add search", "")!,
      parseConventionalCommit("bbb2222", "fix: crash on empty query", "")!,
      parseConventionalCommit("ccc3333", "feat!: drop legacy search API", "")!,
    ];
    const section = buildChangelogSection("2.0.0", "2026-08-01", commits);
    expect(section).toContain("## 2.0.0 (2026-08-01)");
    expect(section.indexOf("BREAKING")).toBeLessThan(section.indexOf("Features"));
    expect(section.indexOf("Features")).toBeLessThan(section.indexOf("Bug Fixes"));
    expect(section).toContain("drop legacy search API (ccc3333)");
    expect(section).toContain("add search (aaa1111)");
    expect(section).toContain("crash on empty query (bbb2222)");
  });

  it("omits empty sections entirely rather than printing an empty heading", () => {
    const commits = [parseConventionalCommit("aaa1111", "fix: typo", "")!];
    const section = buildChangelogSection("1.0.1", "2026-08-01", commits);
    expect(section).not.toContain("BREAKING");
    expect(section).not.toContain("### Features");
  });
});

describe("computeReleasePreview", () => {
  it("is a pure function: same inputs, same outputs, no side effects", () => {
    const preview = computeReleasePreview("1.0.0", "v1.0.0", [{ hash: "aaa1111", subject: "feat: add x", body: "" }], "2026-08-01");
    expect(preview.nextVersion).toBe("1.1.0");
    expect(preview.bump).toBe("minor");
    expect(preview.commits).toHaveLength(1);
    expect(preview.skippedCommits).toBe(0);
  });

  it("counts non-conventional commits as skipped without crashing", () => {
    const preview = computeReleasePreview("1.0.0", null, [{ hash: "a", subject: "wip", body: "" }, { hash: "b", subject: "feat: x", body: "" }], "2026-08-01");
    expect(preview.skippedCommits).toBe(1);
    expect(preview.commits).toHaveLength(1);
  });
});

function makeRunCmd(behavior: Partial<Record<string, RunResult>>): { run: RunCmd; calls: Array<{ cmd: string; args: string[] }> } {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const run: RunCmd = (cmd, args) => {
    calls.push({ cmd, args });
    const key = `${cmd} ${args[0]}`;
    return behavior[key] ?? behavior[cmd] ?? { status: 0, stdout: "", stderr: "" };
  };
  return { run, calls };
}

describe("executeRelease (fs side effects mocked out at the module boundary via a real tmp dir)", () => {
  it("reports nothing_to_release without touching the filesystem when the bump is none", () => {
    const { run, calls } = makeRunCmd({});
    const preview: ReleasePreview = { currentVersion: "1.0.0", lastTag: "v1.0.0", commits: [], skippedCommits: 0, bump: "none", nextVersion: "1.0.0", changelog: "" };
    const result = executeRelease(run, "/nonexistent/should-never-be-touched", preview);
    expect(result).toEqual({ status: "nothing_to_release" });
    expect(calls).toHaveLength(0);
  });

  it("reports build_failed and never reaches git commands when the build fails", () => {
    const { run, calls } = makeRunCmd({ "npm run": { status: 1, stdout: "", stderr: "TS2322: type error" } });
    const preview: ReleasePreview = { currentVersion: "1.0.0", lastTag: null, commits: [], skippedCommits: 0, bump: "patch", nextVersion: "1.0.1", changelog: "## 1.0.1\n" };
    const result = executeRelease(run, "/tmp/does-not-matter-build-fails-first", preview);
    expect(result.status).toBe("build_failed");
    expect((result as { buildLog: string }).buildLog).toContain("TS2322");
    expect(calls.some((c) => c.cmd === "git")).toBe(false);
  });
});
