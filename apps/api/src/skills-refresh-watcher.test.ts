import { describe, it, expect } from "vitest";
import { processSkillsRefresh, type SkillsRefreshDeps } from "./skills-refresh-watcher.js";
import { generateAgentsMD, generateClaudeMD, generateCursorRules } from "@axis/generator-core";
import { createSnapshot } from "@axis/snapshots";
import { buildContextMap } from "@axis/context-engine";
import type { FileEntry, WatchJobPayload, SnapshotManifest, InputMethod } from "@axis/snapshots";
import type { OpenApplyPrParams, OpenApplyPrResult } from "./github-pr.js";

const REPO_FILES: FileEntry[] = [
  { path: "src/index.ts", content: 'export function main() { return "hi"; }', size: 40 },
  { path: "package.json", content: '{"name":"fixture-app","dependencies":{"express":"4.0.0"}}', size: 58 },
];

/** Real generated content for the fixture repo — computed the same way processSkillsRefresh does internally (including using the repo_full_name from `payload()` below as project_name, since the generators embed it in headers), so tests can assert against genuine generator output rather than a hand-written stand-in. */
async function realGeneratedContent(files: FileEntry[]): Promise<{ agents: string; claude: string; cursorrules: string }> {
  const manifest: SnapshotManifest = {
    project_name: "o/r",
    project_type: "github_repository",
    frameworks: [],
    goals: ["Refresh agent onboarding files"],
    requested_outputs: [],
  };
  const snapshot = await createSnapshot({ input_method: "github_repo_url" as InputMethod, manifest, files }, undefined);
  const ctx = buildContextMap(snapshot);
  return {
    agents: generateAgentsMD(ctx, files).content,
    claude: generateClaudeMD(ctx, files).content,
    cursorrules: generateCursorRules(ctx, files).content,
  };
}

function payload(over?: Partial<WatchJobPayload>): WatchJobPayload {
  return {
    account_id: "acct-1",
    product_id: "skills",
    repo_full_name: "o/r",
    event_type: "push",
    ref: "refs/heads/main",
    ...over,
  };
}

function makeDeps(files: FileEntry[], opts?: { token?: string; openPr?: SkillsRefreshDeps["openPr"] }): { deps: SkillsRefreshDeps; openPrCalls: OpenApplyPrParams[] } {
  const openPrCalls: OpenApplyPrParams[] = [];
  // Distinguish "token not passed" (default to "t") from "token explicitly
  // undefined" (the no-token test) — `opts?.token ?? "t"` would collapse both
  // to "t" and silently defeat that test.
  const token = opts && "token" in opts ? opts.token : "t";
  const deps: SkillsRefreshDeps = {
    token,
    fetchRepo: async () => ({ files }),
    openPr:
      opts?.openPr ??
      (async (params) => {
        openPrCalls.push(params);
        return { opened: true, pr_url: "https://github.com/o/r/pull/1", pr_number: 1 };
      }),
  };
  return { deps, openPrCalls };
}

describe("processSkillsRefresh", () => {
  it("ignores watch jobs for any product other than skills, without ever fetching the repo", async () => {
    const { deps } = makeDeps(REPO_FILES);
    let fetched = false;
    deps.fetchRepo = async () => {
      fetched = true;
      return { files: REPO_FILES };
    };
    const out = await processSkillsRefresh(payload({ product_id: "theme" }), deps);
    expect(out).toEqual({ status: "not_skills_product" });
    expect(fetched).toBe(false);
  });

  it("does nothing without a token", async () => {
    const { deps } = makeDeps(REPO_FILES, { token: undefined });
    expect(await processSkillsRefresh(payload(), deps)).toEqual({ status: "no_token" });
  });

  it("reports no_changes when all three files already match real generator output", async () => {
    const generated = await realGeneratedContent(REPO_FILES);
    const files: FileEntry[] = [
      ...REPO_FILES,
      { path: "AGENTS.md", content: generated.agents, size: generated.agents.length },
      { path: "CLAUDE.md", content: generated.claude, size: generated.claude.length },
      { path: ".cursorrules", content: generated.cursorrules, size: generated.cursorrules.length },
    ];
    const { deps, openPrCalls } = makeDeps(files);
    const out = await processSkillsRefresh(payload(), deps);
    expect(out.status).toBe("no_changes");
    expect(openPrCalls).toHaveLength(0);
  });

  it("opens a PR containing only the files that actually drifted (partial change)", async () => {
    const generated = await realGeneratedContent(REPO_FILES);
    const files: FileEntry[] = [
      ...REPO_FILES,
      { path: "AGENTS.md", content: generated.agents, size: generated.agents.length }, // up to date
      { path: "CLAUDE.md", content: "# stale claude doc from months ago", size: 10 }, // stale
      // .cursorrules missing entirely — also counts as drifted
    ];
    const { deps, openPrCalls } = makeDeps(files);
    const out = await processSkillsRefresh(payload(), deps);
    expect(out.status).toBe("pr_opened");
    // Insertion order follows REFRESH_FILES' fixed AGENTS.md/CLAUDE.md/.cursorrules order — AGENTS.md is up to date, so CLAUDE.md then .cursorrules.
    expect(out.changed_paths).toEqual(["CLAUDE.md", ".cursorrules"]);
    expect(openPrCalls).toHaveLength(1);
    const call = openPrCalls[0];
    expect(call.owner).toBe("o");
    expect(call.repo).toBe("r");
    expect(call.baseBranch).toBe("main"); // stripped from refs/heads/main
    expect(call.files.map((f) => f.path).sort()).toEqual([".cursorrules", "CLAUDE.md"].sort());
    expect(call.files.find((f) => f.path === "CLAUDE.md")?.content).toBe(generated.claude);
    expect(call.branchName).toMatch(/^axis\/skills-refresh-[0-9a-f]{12}$/);
  });

  it("reports pr_skipped (not pr_opened) when the Apply channel reports the branch already exists", async () => {
    const files: FileEntry[] = [...REPO_FILES]; // no skills files at all — everything is "changed"
    const { deps } = makeDeps(files, {
      openPr: async () => ({ opened: false, reason: "branch already exists (apply PR likely already open)" }),
    });
    const out = await processSkillsRefresh(payload(), deps);
    expect(out.status).toBe("pr_skipped");
  });

  it("derives baseBranch from a non-main ref", async () => {
    const files: FileEntry[] = [...REPO_FILES];
    const { deps, openPrCalls } = makeDeps(files);
    await processSkillsRefresh(payload({ ref: "refs/heads/develop" }), deps);
    expect(openPrCalls[0].baseBranch).toBe("develop");
  });
});
