import { describe, it, expect, beforeAll } from "vitest";
import { resetTestDb, searchSnapshotContent, getRepoSubscription, subscribeRepo, getSymbolStats, createAccount } from "@axis/snapshots";
import type { FileEntry, WatchJobPayload } from "@axis/snapshots";
import { processNotebookReindex, type NotebookReindexSyncDeps } from "./notebook-reindex-watcher.js";
import { answerFromCode } from "./notebook-qa.js";

const REPO_FILES: FileEntry[] = [
  { path: "src/payments.ts", content: "export function chargeCustomer(amount: number) { return process(amount); }", size: 80 },
  { path: "src/utils.ts", content: "export const noop = () => {};", size: 30 },
];

function payload(over?: Partial<WatchJobPayload>): WatchJobPayload {
  return {
    account_id: "acct-1",
    product_id: "notebook",
    repo_full_name: "o/r",
    event_type: "push",
    ref: "refs/heads/main",
    ...over,
  };
}

function makeDeps(files: FileEntry[], opts?: { token?: string }): NotebookReindexSyncDeps {
  const token = opts && "token" in opts ? opts.token : "t";
  return { token, fetchRepo: async () => ({ files }) };
}

describe("processNotebookReindex", () => {
  beforeAll(async () => {
    await resetTestDb();
  });

  it("ignores watch jobs for any product other than notebook, without ever fetching the repo", async () => {
    let fetched = false;
    const deps: NotebookReindexSyncDeps = { token: "t", fetchRepo: async () => { fetched = true; return { files: REPO_FILES }; } };
    const out = await processNotebookReindex(payload({ product_id: "search" }), deps);
    expect(out).toEqual({ status: "not_notebook_product" });
    expect(fetched).toBe(false);
  });

  it("does nothing without a token", async () => {
    const deps = makeDeps(REPO_FILES, { token: undefined });
    expect(await processNotebookReindex(payload(), deps)).toEqual({ status: "no_token" });
  });

  it("indexes real content, and a real citation-grounded question against it finds the real answer (round-trip proof)", async () => {
    const account = await createAccount("notebook-content", "notebook-content@test.com", "paid");
    await subscribeRepo(account.account_id, "notebook", "o/r-content");
    const deps = makeDeps(REPO_FILES);
    const result = await processNotebookReindex(payload({ account_id: account.account_id, repo_full_name: "o/r-content" }), deps);

    expect(result.status).toBe("indexed");
    expect(result.indexed_files).toBe(2);
    expect(result.snapshot_id).toBeTruthy();

    // Real proof, one layer beyond search-index-watcher's own: not just that
    // the row is retrievable, but that notebook-qa's citation-grounded
    // answer function (the actual consumer of this index) finds it.
    const matches = await searchSnapshotContent(result.snapshot_id!, "process");
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].file_path).toBe("src/payments.ts");

    const answer = await answerFromCode(result.snapshot_id!, "process");
    expect(answer.citations.length).toBeGreaterThan(0);
    expect(answer.citations[0].file_path).toBe("src/payments.ts");
  });

  it("indexes real code symbols alongside content", async () => {
    const account = await createAccount("notebook-symbols", "notebook-symbols@test.com", "paid");
    await subscribeRepo(account.account_id, "notebook", "o/r-symbols");
    const deps = makeDeps(REPO_FILES);
    const result = await processNotebookReindex(payload({ account_id: account.account_id, repo_full_name: "o/r-symbols" }), deps);

    expect(result.indexed_symbols).toBeGreaterThan(0);
    const stats = await getSymbolStats(result.snapshot_id!);
    expect(stats.symbol_count).toBe(result.indexed_symbols);
  });

  it("records the synced snapshot as the subscription's latest, readable back via getRepoSubscription", async () => {
    const account = await createAccount("notebook-latest", "notebook-latest@test.com", "paid");
    await subscribeRepo(account.account_id, "notebook", "o/r-latest");
    const deps = makeDeps(REPO_FILES);
    const result = await processNotebookReindex(payload({ account_id: account.account_id, repo_full_name: "o/r-latest" }), deps);

    const sub = await getRepoSubscription(account.account_id, "notebook", "o/r-latest");
    expect(sub?.latest_snapshot_id).toBe(result.snapshot_id);
  });

  it("re-syncing (a second push) re-indexes against a NEW snapshot, and citations follow the new content", async () => {
    const account = await createAccount("notebook-resync", "notebook-resync@test.com", "paid");
    await subscribeRepo(account.account_id, "notebook", "o/r-resync");
    const first = await processNotebookReindex(payload({ account_id: account.account_id, repo_full_name: "o/r-resync" }), makeDeps(REPO_FILES));

    const updatedFiles: FileEntry[] = [{ path: "src/payments.ts", content: "export function totallyDifferentFunction() {}", size: 40 }];
    const second = await processNotebookReindex(payload({ account_id: account.account_id, repo_full_name: "o/r-resync" }), makeDeps(updatedFiles));

    expect(second.snapshot_id).not.toBe(first.snapshot_id);
    const sub = await getRepoSubscription(account.account_id, "notebook", "o/r-resync");
    expect(sub?.latest_snapshot_id).toBe(second.snapshot_id);

    const answer = await answerFromCode(second.snapshot_id!, "totallyDifferentFunction");
    expect(answer.citations.length).toBeGreaterThan(0);
  });
});
