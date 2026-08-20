import { describe, it, expect } from "vitest";
import type { FileEntry, WatchJobPayload } from "@axis/snapshots";
import { processObsidianVaultSync, VAULT_DIR, type ObsidianVaultDeps } from "./obsidian-vault-watcher.js";
import type { ApplyFile, OpenApplyPrParams, OpenApplyPrResult } from "./github-pr.js";

const REPO_FILES: FileEntry[] = [
  { path: "src/index.ts", content: 'import { connectDb } from "./db";\nexport function main() { return connectDb(); }', size: 90 },
  { path: "src/db.ts", content: "export function connectDb() { return {}; }", size: 45 },
  { path: "src/isolated.ts", content: "export const noop = () => {};", size: 30 },
];

function payload(over?: Partial<WatchJobPayload>): WatchJobPayload {
  return {
    account_id: "acct-1",
    product_id: "obsidian",
    repo_full_name: "o/r",
    event_type: "push",
    ref: "refs/heads/main",
    ...over,
  };
}

let lastPrParams: OpenApplyPrParams | undefined;

function makeDeps(files: FileEntry[], opts?: { token?: string; opened?: boolean }): ObsidianVaultDeps {
  const token = opts && "token" in opts ? opts.token : "t";
  lastPrParams = undefined;
  return {
    token,
    fetchRepo: async () => ({ files }),
    openPr: async (params: OpenApplyPrParams): Promise<OpenApplyPrResult> => {
      lastPrParams = params;
      return { opened: opts?.opened ?? true, pr_url: "https://github.com/o/r/pull/1", pr_number: 1 };
    },
  };
}

describe("processObsidianVaultSync", () => {
  it("ignores watch jobs for any product other than obsidian, without ever fetching the repo", async () => {
    let fetched = false;
    const deps: ObsidianVaultDeps = { token: "t", fetchRepo: async () => { fetched = true; return { files: REPO_FILES }; }, openPr: async () => ({ opened: true, pr_url: "x", pr_number: 1 }) };
    const out = await processObsidianVaultSync(payload({ product_id: "theme" }), deps);
    expect(out).toEqual({ status: "not_obsidian_product" });
    expect(fetched).toBe(false);
  });

  it("does nothing without a token", async () => {
    const deps = makeDeps(REPO_FILES, { token: undefined });
    expect(await processObsidianVaultSync(payload(), deps)).toEqual({ status: "no_token" });
  });

  it("opens a PR containing real notes derived from the repo's own import graph", async () => {
    const deps = makeDeps(REPO_FILES);
    const result = await processObsidianVaultSync(payload(), deps);
    expect(result.status).toBe("pr_opened");
    expect(result.applied?.every((p) => p.startsWith(`${VAULT_DIR}/`))).toBe(true);
    // isolated.ts has no import edges — must not get a note (an unlinked note is worse than none).
    expect(result.applied?.some((p) => p.includes("isolated"))).toBe(false);
    // A real cross-reference: index.ts imports db.ts, so index.ts's note must
    // link to db.ts's — not the source code, the WIKILINK the graph produces.
    const indexNote = lastPrParams?.files.find((f: ApplyFile) => f.path.includes("src-index-ts"));
    expect(indexNote?.content).toContain("db-ts");
  });

  it("excludes the vault's OWN prior output from its regeneration input — app_11/24/31's lesson", async () => {
    const withStalePriorVault: FileEntry[] = [
      ...REPO_FILES,
      { path: `${VAULT_DIR}/stale-note.md`, content: "[[nonexistent]]", size: 20 },
    ];
    const deps = makeDeps(withStalePriorVault);
    const result = await processObsidianVaultSync(payload(), deps);
    // The stale prior vault note (with its broken link) must not poison the
    // regenerated set — if it were fed back in, the fail-closed guard below
    // would trip on ITS broken link, not a real one.
    expect(result.status).toBe("pr_opened");
  });

  it("is idempotent — unchanged notes produce no PR", async () => {
    const first = makeDeps(REPO_FILES);
    const firstResult = await processObsidianVaultSync(payload(), first);
    expect(firstResult.status).toBe("pr_opened");

    const repoWithVault = [...REPO_FILES, ...(lastPrParams!.files as ApplyFile[])];
    const second = makeDeps(repoWithVault);
    const secondResult = await processObsidianVaultSync(payload(), second);
    expect(secondResult.status).toBe("no_changes");
  });

  it("respects the PR-open outcome (skipped vs opened) rather than assuming success", async () => {
    const deps = makeDeps(REPO_FILES, { opened: false });
    const result = await processObsidianVaultSync(payload(), deps);
    expect(result.status).toBe("pr_skipped");
  });
});
