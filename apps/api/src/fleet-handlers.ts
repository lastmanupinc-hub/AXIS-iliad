// ─── Fleet REST surface ──────────────────────────────────────────
//
// Cross-project intelligence for accounts with >=2 analyzed projects (E6,
// Pillar 4 — breadth). Paid/suite only: the strategy prices the relationship,
// not the transaction. Read-only, compute-on-demand — nothing persisted.

import type { IncomingMessage, ServerResponse } from "node:http";
import type { ContextMap } from "@axis/context-engine";
import {
  listProjectsByAccount,
  getProjectSnapshots,
  getContextMap,
  listMemoryEntries,
  trackEvent,
  resolveStage,
} from "@axis/snapshots";
import { buildFleetReport, FLEET_MIN_PROJECTS, FLEET_MAX_PROJECTS, type FleetProjectInput } from "@axis/generator-core";
import { sendJSON, sendError } from "./router.js";
import { ErrorCode } from "./logger.js";
import { requireAuth } from "./billing.js";

/** Walk a project's snapshots newest-first and return the first resolvable ContextMap. */
async function resolveLatestContext(project_id: string): Promise<ContextMap | undefined> {
  const snapshots = await getProjectSnapshots(project_id);
  for (let i = snapshots.length - 1; i >= 0; i--) {
    const ctx = await getContextMap(snapshots[i].snapshot_id);
    if (ctx) return ctx as ContextMap;
  }
  return undefined;
}

/** GET /v1/account/fleet */
export async function handleGetFleet(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (ctx.account!.tier === "free") {
    sendError(res, 403, ErrorCode.TIER_REQUIRED, "Fleet intelligence requires a paid plan — it computes cross-project reports over your whole portfolio.");
    return;
  }

  const account_id = ctx.account!.account_id;
  const projectRows = await listProjectsByAccount(account_id);

  const eligible: FleetProjectInput[] = [];
  for (const proj of projectRows) {
    if (eligible.length >= FLEET_MAX_PROJECTS) break;
    try {
      const projectCtx = await resolveLatestContext(proj.project_id);
      if (!projectCtx) continue;
      const decisions = await listMemoryEntries(proj.project_id, { kind: "decision", limit: 5 });
      eligible.push({
        project_name: proj.project_name,
        ctx: projectCtx,
        memory_decisions: decisions.map((d) => d.content),
      });
    } catch {
      // Fail-open per project — one project's load error must never fail the whole request.
    }
  }

  if (eligible.length < FLEET_MIN_PROJECTS) {
    sendJSON(res, 200, {
      ready: false,
      project_count: projectRows.length,
      eligible_projects: eligible.length,
      reason: `Fleet reports need at least ${FLEET_MIN_PROJECTS} analyzed projects; this account has ${eligible.length} with a completed analysis.`,
    });
    return;
  }

  const files = buildFleetReport(eligible)!;
  try {
    const stage = await resolveStage(account_id);
    await trackEvent(account_id, "fleet_viewed", stage, { projects: eligible.map((p) => p.project_name) });
  } catch {
    // Best-effort KPI — never fail the request on analytics.
  }

  sendJSON(res, 200, {
    ready: true,
    project_count: projectRows.length,
    eligible_projects: eligible.length,
    projects: eligible.map((p) => p.project_name),
    files,
  });
}
