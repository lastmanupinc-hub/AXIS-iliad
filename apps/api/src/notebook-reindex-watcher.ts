// ─── app_34_notebook_living_kb: notebook program's Watch step ────
//
// notebook-qa.ts answers questions by retrieving from search_index
// (search-store.ts, the same full-text index the "search" product keeps
// fresh) — but search-index-watcher.ts only fires for product_id==="search".
// A repo subscribed to "notebook" alone would never get indexed at all, so
// every citation would be permanently stale from the moment of purchase.
// This is that gap closed for "notebook"-subscribed repos, by product_id
// rather than by assuming the customer also bought search.
//
// Deliberately the SAME functions search-index-watcher.ts already calls —
// indexSnapshotContent/indexSymbols — not a second indexing implementation.
// A notebook-subscribed repo and a search-subscribed repo end up with
// identically-shaped index rows; only the trigger differs.
import { fetchGitHubRepo, createSnapshot, indexSnapshotContent, indexSymbols, setLatestSnapshot } from "@axis/snapshots";
import type { SnapshotManifest, FileEntry, WatchJobPayload } from "@axis/snapshots";

export const NOTEBOOK_PRODUCT_ID = "notebook";

export interface NotebookReindexSyncDeps {
  token: string | undefined;
  fetchRepo: (url: string, token: string) => Promise<{ files: FileEntry[] }>;
}

export type NotebookReindexSyncStatus = "not_notebook_product" | "no_token" | "indexed";

export interface NotebookReindexSyncResult {
  status: NotebookReindexSyncStatus;
  snapshot_id?: string;
  indexed_files?: number;
  indexed_lines?: number;
  indexed_symbols?: number;
}

/** Re-fetches and re-indexes a "notebook"-subscribed repo on push, so citations never lag more than one merge behind. */
export async function processNotebookReindex(
  payload: WatchJobPayload,
  deps: NotebookReindexSyncDeps,
): Promise<NotebookReindexSyncResult> {
  if (payload.product_id !== NOTEBOOK_PRODUCT_ID) return { status: "not_notebook_product" };
  if (!deps.token) return { status: "no_token" };

  const fr = await deps.fetchRepo(`https://github.com/${payload.repo_full_name}`, deps.token);
  const manifest: SnapshotManifest = {
    project_name: payload.repo_full_name,
    project_type: "github_repository",
    frameworks: [],
    goals: ["Keep notebook citations current"],
    requested_outputs: [],
  };
  const snapshot = await createSnapshot({ input_method: "github_repo_url", manifest, files: fr.files }, payload.account_id);
  const contentResult = await indexSnapshotContent(snapshot.snapshot_id, fr.files);
  const symbolResult = await indexSymbols(snapshot.snapshot_id, fr.files);
  await setLatestSnapshot(payload.account_id, payload.product_id, payload.repo_full_name, snapshot.snapshot_id);

  return {
    status: "indexed",
    snapshot_id: snapshot.snapshot_id,
    indexed_files: contentResult.indexed_files,
    indexed_lines: contentResult.indexed_lines,
    indexed_symbols: symbolResult.indexed_symbols,
  };
}

/** Real dependency wiring (GitHub fetch). */
export function defaultNotebookReindexDeps(): NotebookReindexSyncDeps {
  return { token: process.env.GITHUB_TOKEN, fetchRepo: (url, token) => fetchGitHubRepo(url, token) };
}
