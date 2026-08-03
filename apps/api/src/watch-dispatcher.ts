// ─── Watch queue dispatcher ──────────────────────────────────────
//
// A single registerWatchWorker() registration for the whole process, fanning
// out by payload.product_id to each program's processor. Deliberately NOT one
// registerWatchWorker() call per program: pg-boss's work() sets up a
// competing-consumer subscription per call, and two calls on the SAME queue
// name would have jobs delivered to whichever subscription happens to pick
// them up — a "theme" job could land on the "skills" worker's subscription
// and never reach the handler that actually checks product_id === "theme".
// One dispatcher, one subscription, no ambiguity about which job goes where.

import { registerWatchWorker } from "@axis/snapshots";
import type { WatchJobPayload } from "@axis/snapshots";
import { processSkillsRefresh, defaultSkillsRefreshDeps } from "./skills-refresh-watcher.js";
import { processThemeTokenSync, defaultThemeTokenSyncDeps } from "./theme-token-sync-watcher.js";
import { processMcpHostedSync, defaultMcpHostedSyncDeps } from "./mcp-hosted.js";
import { processSearchIndexSync, defaultSearchIndexSyncDeps } from "./search-index-watcher.js";
import { processCanvasDiagramSync, defaultCanvasDiagramSyncDeps } from "./canvas-diagram-watcher.js";
import { log } from "./logger.js";

async function dispatchWatchJob(payload: WatchJobPayload): Promise<void> {
  const skills = await processSkillsRefresh(payload, defaultSkillsRefreshDeps());
  if (skills.status !== "not_skills_product") {
    log("info", "watch-dispatcher.processed", { repo: payload.repo_full_name, product_id: payload.product_id, handler: "skills", status: skills.status });
    return;
  }

  const theme = await processThemeTokenSync(payload, defaultThemeTokenSyncDeps());
  if (theme.status !== "not_theme_product") {
    log("info", "watch-dispatcher.processed", { repo: payload.repo_full_name, product_id: payload.product_id, handler: "theme", status: theme.status });
    return;
  }

  const mcp = await processMcpHostedSync(payload, defaultMcpHostedSyncDeps());
  if (mcp.status !== "not_mcp_product") {
    log("info", "watch-dispatcher.processed", { repo: payload.repo_full_name, product_id: payload.product_id, handler: "mcp", status: mcp.status });
    return;
  }

  const search = await processSearchIndexSync(payload, defaultSearchIndexSyncDeps());
  if (search.status !== "not_search_product") {
    log("info", "watch-dispatcher.processed", { repo: payload.repo_full_name, product_id: payload.product_id, handler: "search", status: search.status });
    return;
  }

  const canvas = await processCanvasDiagramSync(payload, defaultCanvasDiagramSyncDeps());
  if (canvas.status !== "not_canvas_product") {
    log("info", "watch-dispatcher.processed", { repo: payload.repo_full_name, product_id: payload.product_id, handler: "canvas", status: canvas.status });
    return;
  }

  // No registered handler claimed this product_id — a subscription exists
  // with no processor yet (or a stale/typo'd product_id on the row).
  log("info", "watch-dispatcher.unhandled", { repo: payload.repo_full_name, product_id: payload.product_id });
}

/** Registers the single watch-queue worker for this process — call once at server startup. */
export async function startWatchDispatcher(): Promise<string> {
  return registerWatchWorker(dispatchWatchJob);
}
