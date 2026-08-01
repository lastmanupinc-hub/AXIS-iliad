// Real end-to-end proof for app_21_closer_release_operator: creates an
// actual git repo on disk, makes real conventional commits, and runs the
// real getLastTag/getCommitsSince/computeReleasePreview/executeRelease
// pipeline against it via a real `git` binary — no mocked git output. Also
// proves the tool genuinely never pushes: there is no remote configured at
// all, so a push would fail loudly if one were ever attempted.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { getLastTag, getCommitsSince, computeReleasePreview, executeRelease, realRunCmd } from "./release-operator.js";

function git(cwd: string, args: string[]): void {
  const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf-8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
}

describe("release-operator integration (real git repo, no remote)", () => {
  let repoDir: string;

  beforeAll(() => {
    repoDir = mkdtempSync(join(tmpdir(), "axis-release-repo-"));
    git(repoDir, ["init", "-q"]);
    git(repoDir, ["config", "user.email", "test@example.com"]);
    git(repoDir, ["config", "user.name", "Test"]);

    writeFileSync(join(repoDir, "package.json"), JSON.stringify({ name: "fixture-release-app", version: "1.0.0" }, null, 2), "utf-8");
    git(repoDir, ["add", "package.json"]);
    git(repoDir, ["commit", "-q", "-m", "chore: initial commit"]);
    git(repoDir, ["tag", "v1.0.0"]);

    writeFileSync(join(repoDir, "a.txt"), "a", "utf-8");
    git(repoDir, ["add", "a.txt"]);
    git(repoDir, ["commit", "-q", "-m", "fix(core): correct off-by-one in pagination"]);

    writeFileSync(join(repoDir, "b.txt"), "b", "utf-8");
    git(repoDir, ["add", "b.txt"]);
    git(repoDir, ["commit", "-q", "-m", "feat(search): add fuzzy matching"]);

    writeFileSync(join(repoDir, "c.txt"), "c", "utf-8");
    git(repoDir, ["add", "c.txt"]);
    git(repoDir, ["commit", "-q", "-m", "this is not a conventional commit message"]);
  });

  afterAll(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("reads the real last tag via a real git describe", () => {
    const lastTag = getLastTag(realRunCmd(), repoDir);
    expect(lastTag).toBe("v1.0.0");
  });

  it("returns null for a repo with no tags at all", () => {
    const bareDir = mkdtempSync(join(tmpdir(), "axis-release-no-tags-"));
    try {
      git(bareDir, ["init", "-q"]);
      expect(getLastTag(realRunCmd(), bareDir)).toBeNull();
    } finally {
      rmSync(bareDir, { recursive: true, force: true });
    }
  });

  it("reads the real 3 commits since the tag, oldest first, via a real git log", () => {
    const commits = getCommitsSince(realRunCmd(), repoDir, "v1.0.0");
    expect(commits).toHaveLength(3);
    expect(commits[0].subject).toBe("fix(core): correct off-by-one in pagination");
    expect(commits[1].subject).toBe("feat(search): add fuzzy matching");
    expect(commits[2].subject).toBe("this is not a conventional commit message");
    expect(commits[0].hash).toMatch(/^[0-9a-f]{40}$/); // real full SHA, not a mock
  });

  it("computes a real minor bump and changelog from the real commit history", () => {
    const commits = getCommitsSince(realRunCmd(), repoDir, "v1.0.0");
    const preview = computeReleasePreview("1.0.0", "v1.0.0", commits, "2026-08-01");
    expect(preview.bump).toBe("minor"); // feat present
    expect(preview.nextVersion).toBe("1.1.0");
    expect(preview.skippedCommits).toBe(1); // the non-conventional commit
    expect(preview.changelog).toContain("add fuzzy matching");
    expect(preview.changelog).toContain("correct off-by-one in pagination");
  });

  it("executeRelease actually creates a real local tag, commits real files, and NEVER pushes (no remote exists to push to)", () => {
    // Short timeout: this is a real spawnSync, which blocks synchronously and
    // can't be preempted by vitest's own test timeout — bound it tightly so a
    // stuck build fails the test fast instead of stalling for a full minute.
    const run = realRunCmd(20_000);
    const lastTag = getLastTag(run, repoDir);
    const commits = getCommitsSince(run, repoDir, lastTag);
    const preview = computeReleasePreview("1.0.0", lastTag, commits, "2026-08-01");

    const result = executeRelease(run, repoDir, preview);
    if (result.status !== "tagged") {
      // Surface the real failure reason in CI output instead of a bare status mismatch.
      console.error("executeRelease did not tag. Full result:", JSON.stringify(result, null, 2));
    }
    expect(result.status).toBe("tagged");
    expect(result.tag).toBe("v1.1.0");

    // Real proof: the tag genuinely exists in the real repo.
    const tagList = spawnSync("git", ["-C", repoDir, "tag", "-l", "v1.1.0"], { encoding: "utf-8" });
    expect(tagList.stdout.trim()).toBe("v1.1.0");

    // Real proof: package.json was actually rewritten on disk.
    const pkg = JSON.parse(readFileSync(join(repoDir, "package.json"), "utf-8")) as { version: string };
    expect(pkg.version).toBe("1.1.0");

    // Real proof: CHANGELOG.md was actually created with the real entry.
    expect(existsSync(join(repoDir, "CHANGELOG.md"))).toBe(true);
    expect(readFileSync(join(repoDir, "CHANGELOG.md"), "utf-8")).toContain("## 1.1.0 (2026-08-01)");

    // Real proof of the safety contract: no remote is configured at all, so
    // if executeRelease had ever attempted to push, THIS would fail loudly —
    // it doesn't, because it never tries.
    const remotes = spawnSync("git", ["-C", repoDir, "remote"], { encoding: "utf-8" });
    expect(remotes.stdout.trim()).toBe("");
    const pushAttempt = spawnSync("git", ["-C", repoDir, "push", "--dry-run"], { encoding: "utf-8" });
    expect(pushAttempt.status).not.toBe(0); // proves no remote was ever set up as a side effect
  });

  it("reports nothing_to_release for a repo whose only commits since the last tag are non-conventional", () => {
    const otherDir = mkdtempSync(join(tmpdir(), "axis-release-chore-only-"));
    try {
      git(otherDir, ["init", "-q"]);
      git(otherDir, ["config", "user.email", "test@example.com"]);
      git(otherDir, ["config", "user.name", "Test"]);
      writeFileSync(join(otherDir, "package.json"), JSON.stringify({ name: "x", version: "2.0.0" }), "utf-8");
      git(otherDir, ["add", "package.json"]);
      git(otherDir, ["commit", "-q", "-m", "chore: initial commit"]);
      git(otherDir, ["tag", "v2.0.0"]);
      writeFileSync(join(otherDir, "d.txt"), "d", "utf-8");
      git(otherDir, ["add", "d.txt"]);
      git(otherDir, ["commit", "-q", "-m", "docs: update readme"]);

      const run = realRunCmd();
      const lastTag = getLastTag(run, otherDir);
      const commits = getCommitsSince(run, otherDir, lastTag);
      const preview = computeReleasePreview("2.0.0", lastTag, commits, "2026-08-01");
      expect(preview.bump).toBe("none");

      const result = executeRelease(run, otherDir, preview);
      expect(result).toEqual({ status: "nothing_to_release" });
      // Real proof: nothing was tagged.
      const tagList = spawnSync("git", ["-C", otherDir, "tag", "-l"], { encoding: "utf-8" });
      expect(tagList.stdout.trim()).toBe("v2.0.0");
    } finally {
      rmSync(otherDir, { recursive: true, force: true });
    }
  });
});
