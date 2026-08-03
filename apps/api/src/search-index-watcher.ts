// ─── app_22_search_always_current: search program's Watch step ──
//
// Today, a repo's full-text/symbol search index (packages/snapshots'
// search-store.ts, pgvector-backed) only gets populated when a snapshot is
// analyzed and someone explicitly calls POST /v1/search/index afterward —
// it goes stale the moment the repo's code changes again. This closes that
// gap for "search"-subscribed repos: on every push, re-fetch and
// re-index (both full-text content and code symbols), so freshness never
// lags more than one merge behind, matching the free tier's "vending
// machine" promise (docs/saas-strategy/APPLICATION_BUILD_STRATEGY.md #10).
//
// Deliberately scoped to the Watch step only — indexSnapshotContent/
// indexSymbols/searchSnapshotContent already exist and are already wired
// into real REST handlers (POST /v1/search/index, /query); this does not
// add a new MCP tool surface on top of them (that's the main hub's paid/
// metered dispatch path — a separate, more sensitive change than an
// isolated Watch consumer). No new dependency: reuses the existing
// pgvector-backed search-store.ts exactly as it already exists.

import { fetchGitHubRepo, createSnapshot, indexSnapshotContent, indexSymbols, setLatestSnapshot } from "@axis/snapshots";
import type { SnapshotManifest, FileEntry, WatchJobPayload } from "@axis/snapshots";

export const SEARCH_INDEX_PRODUCT_ID = "search";

export interface SearchIndexSyncDeps {
  token: string | undefined;
  fetchRepo: (url: string, token: string) => Promise<{ files: FileEntry[] }>;
}

export type SearchIndexSyncStatus = "not_search_product" | "no_token" | "indexed";

export interface SearchIndexSyncResult {
  status: SearchIndexSyncStatus;
  snapshot_id?: string;
  indexed_files?: number;
  indexed_lines?: number;
  indexed_symbols?: number;
}

/** Re-fetches and re-indexes a "search"-subscribed repo on push. Pure orchestration over injected deps so it's testable without GitHub. */
export async function processSearchIndexSync(payload: WatchJobPayload, deps: SearchIndexSyncDeps): Promise<SearchIndexSyncResult> {
  if (payload.product_id !== SEARCH_INDEX_PRODUCT_ID) return { status: "not_search_product" };
  if (!deps.token) return { status: "no_token" };

  const fr = await deps.fetchRepo(`https://github.com/${payload.repo_full_name}`, deps.token);
  const manifest: SnapshotManifest = {
    project_name: payload.repo_full_name,
    project_type: "github_repository",
    frameworks: [],
    goals: ["Keep the search index current"],
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
export function defaultSearchIndexSyncDeps(): SearchIndexSyncDeps {
  return { token: process.env.GITHUB_TOKEN, fetchRepo: (url, token) => fetchGitHubRepo(url, token) };
}
