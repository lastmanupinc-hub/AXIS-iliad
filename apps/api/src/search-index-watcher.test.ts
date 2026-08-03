import { describe, it, expect, beforeAll } from "vitest";
import { resetTestDb, searchSnapshotContent, getRepoSubscription, subscribeRepo, getSymbolStats, createAccount } from "@axis/snapshots";
import type { FileEntry, WatchJobPayload } from "@axis/snapshots";
import { processSearchIndexSync, type SearchIndexSyncDeps } from "./search-index-watcher.js";

const REPO_FILES: FileEntry[] = [
  { path: "src/index.ts", content: 'export function calculateShippingCost(weight: number) { return weight * 2.5; }', size: 80 },
  { path: "src/utils.ts", content: "export const noop = () => {};", size: 30 },
];

function payload(over?: Partial<WatchJobPayload>): WatchJobPayload {
  return {
    account_id: "acct-1",
    product_id: "search",
    repo_full_name: "o/r",
    event_type: "push",
    ref: "refs/heads/main",
    ...over,
  };
}

function makeDeps(files: FileEntry[], opts?: { token?: string }): SearchIndexSyncDeps {
  const token = opts && "token" in opts ? opts.token : "t";
  return { token, fetchRepo: async () => ({ files }) };
}

describe("processSearchIndexSync", () => {
  beforeAll(async () => {
    await resetTestDb();
  });

  it("ignores watch jobs for any product other than search, without ever fetching the repo", async () => {
    let fetched = false;
    const deps: SearchIndexSyncDeps = { token: "t", fetchRepo: async () => { fetched = true; return { files: REPO_FILES }; } };
    const out = await processSearchIndexSync(payload({ product_id: "theme" }), deps);
    expect(out).toEqual({ status: "not_search_product" });
    expect(fetched).toBe(false);
  });

  it("does nothing without a token", async () => {
    const deps = makeDeps(REPO_FILES, { token: undefined });
    expect(await processSearchIndexSync(payload(), deps)).toEqual({ status: "no_token" });
  });

  it("indexes the real content — a real full-text search against the synced snapshot finds the real match (round-trip proof)", async () => {
    const account = await createAccount("search-content", "search-content@test.com", "paid");
    await subscribeRepo(account.account_id, "search", "o/r-content");
    const deps = makeDeps(REPO_FILES);
    const result = await processSearchIndexSync(payload({ account_id: account.account_id, repo_full_name: "o/r-content" }), deps);

    expect(result.status).toBe("indexed");
    expect(result.indexed_files).toBe(2);
    expect(result.snapshot_id).toBeTruthy();

    // Real proof: a real full-text search against the real indexed snapshot finds the real line.
    // "weight" is a real, separately-tokenized word in the fixture content —
    // unlike "shipping cost", which never matches: Postgres full-text search
    // tokenizes the camelCase identifier calculateShippingCost as ONE lexeme,
    // not the separate words "shipping"/"cost" (confirmed by first trying the
    // camelCase-implied query and getting zero matches).
    const matches = await searchSnapshotContent(result.snapshot_id!, "weight");
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].file_path).toBe("src/index.ts");
    expect(matches[0].content).toContain("calculateShippingCost");
  });

  it("indexes real code symbols alongside content", async () => {
    const account = await createAccount("search-symbols", "search-symbols@test.com", "paid");
    await subscribeRepo(account.account_id, "search", "o/r-symbols");
    const deps = makeDeps(REPO_FILES);
    const result = await processSearchIndexSync(payload({ account_id: account.account_id, repo_full_name: "o/r-symbols" }), deps);

    expect(result.indexed_symbols).toBeGreaterThan(0);
    const stats = await getSymbolStats(result.snapshot_id!);
    expect(stats.symbol_count).toBe(result.indexed_symbols);
  });

  it("records the synced snapshot as the subscription's latest, readable back via getRepoSubscription", async () => {
    const account = await createAccount("search-latest", "search-latest@test.com", "paid");
    await subscribeRepo(account.account_id, "search", "o/r-latest");
    const deps = makeDeps(REPO_FILES);
    const result = await processSearchIndexSync(payload({ account_id: account.account_id, repo_full_name: "o/r-latest" }), deps);

    const sub = await getRepoSubscription(account.account_id, "search", "o/r-latest");
    expect(sub?.latest_snapshot_id).toBe(result.snapshot_id);
  });

  it("re-syncing (a second push) re-indexes against a NEW snapshot, not the old one", async () => {
    const account = await createAccount("search-resync", "search-resync@test.com", "paid");
    await subscribeRepo(account.account_id, "search", "o/r-resync");
    const first = await processSearchIndexSync(payload({ account_id: account.account_id, repo_full_name: "o/r-resync" }), makeDeps(REPO_FILES));

    const updatedFiles: FileEntry[] = [{ path: "src/index.ts", content: "export function totallyDifferentFunction() {}", size: 40 }];
    const second = await processSearchIndexSync(payload({ account_id: account.account_id, repo_full_name: "o/r-resync" }), makeDeps(updatedFiles));

    expect(second.snapshot_id).not.toBe(first.snapshot_id);
    const sub = await getRepoSubscription(account.account_id, "search", "o/r-resync");
    expect(sub?.latest_snapshot_id).toBe(second.snapshot_id);

    // Real proof: searching the NEW snapshot finds the new content, not the old.
    const matches = await searchSnapshotContent(second.snapshot_id!, "totallyDifferentFunction");
    expect(matches.length).toBeGreaterThan(0);
  });
});
