import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJSON, sendError } from "./router.js";
import { ErrorCode } from "./logger.js";
import {
  getSnapshot,
  listGenerationVersions,
  getGenerationVersion,
  diffGenerationVersions,
  meterPersistenceOp,
  trackEvent,
  resolveStage,
} from "@axis/snapshots";
import { assertSnapshotAccess, recordUsageBestEffort } from "./handlers.js";
import { resolveAuth } from "./billing.js";
import { buildTrialNotice } from "./trial-notice.js";

/** GET /v1/snapshots/:snapshot_id/versions — list generation versions */
export async function handleListVersions(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const { snapshot_id } = params;
  const snapshot = await getSnapshot(snapshot_id);
  if (!snapshot) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "Snapshot not found");
    return;
  }
  if (!(await assertSnapshotAccess(req, res, snapshot))) return;
  const versions = await listGenerationVersions(snapshot_id);

  sendJSON(res, 200, { snapshot_id, versions, count: versions.length });
}

/** GET /v1/snapshots/:snapshot_id/versions/:version_number — get specific version */
export async function handleGetVersion(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const { snapshot_id, version_number } = params;
  const snapshot = await getSnapshot(snapshot_id);
  if (!snapshot) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "Snapshot not found");
    return;
  }
  if (!(await assertSnapshotAccess(req, res, snapshot))) return;
  const vNum = parseInt(version_number, 10);

  if (isNaN(vNum) || vNum < 1) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "version_number must be a positive integer");
    return;
  }

  const version = await getGenerationVersion(snapshot_id, vNum);
  if (!version) {
    sendError(res, 404, ErrorCode.NOT_FOUND, `Version ${vNum} not found for snapshot ${snapshot_id}`);
    return;
  }

  sendJSON(res, 200, { version });
}

/** GET /v1/snapshots/:snapshot_id/diff?old=N&new=M — diff two versions */
export async function handleDiffVersions(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const { snapshot_id } = params;
  const snapshot = await getSnapshot(snapshot_id);
  if (!snapshot) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "Snapshot not found");
    return;
  }
  if (!(await assertSnapshotAccess(req, res, snapshot))) return;
  /* v8 ignore next — req.url always present in tests */
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  const oldV = parseInt(url.searchParams.get("old") ?? "", 10);
  const newV = parseInt(url.searchParams.get("new") ?? "", 10);

  if (isNaN(oldV) || isNaN(newV) || oldV < 1 || newV < 1) {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "Both 'old' and 'new' query params are required (positive integers)");
    return;
  }

  if (oldV === newV) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "old and new versions must be different");
    return;
  }

  // H-Phase-A cycle 20: validate-first — confirm the diff actually exists
  // BEFORE charging a persistence credit. This used to charge first and
  // only THEN discover a bogus/stale version pair (typo, a version deleted
  // since the client cached it) was a 404 — real credits spent for zero
  // delivered work, with no refund or compensation path. Both version
  // lookups inside diffGenerationVersions are cheap indexed reads (no
  // external calls), so computing the diff first and reusing its result
  // costs nothing extra — matches this codebase's own established
  // validate-first principle (deterministic caps run before money moves).
  // H-Phase-A cycle 20: validate-first — confirm the diff actually exists
  // BEFORE charging a persistence credit. This used to charge first and
  // only THEN discover a bogus/stale version pair (typo, a version deleted
  // since the client cached it) was a 404 — real credits spent for zero
  // delivered work, with no refund or compensation path. Both version
  // lookups inside diffGenerationVersions are cheap indexed reads (no
  // external calls), so computing the diff first and reusing its result
  // costs nothing extra — matches this codebase's own established
  // validate-first principle (deterministic caps run before money moves).
  const diff = await diffGenerationVersions(snapshot_id, oldV, newV);
  if (!diff) {
    sendError(res, 404, ErrorCode.NOT_FOUND, `One or both versions not found for snapshot ${snapshot_id}`);
    return;
  }

  // Economic activation: diffing consumes a persistence credit for paid/suite tiers.
  // Anonymous callers (no resolvable account) keep the pre-existing unmetered behavior.
  const auth = await resolveAuth(req);
  if (auth.account) {
    const meterResult = await meterPersistenceOp(auth.account.account_id, auth.account.tier, "diff_versions", snapshot_id);
    if (!meterResult.ok) {
      // H2.5: error stays the pre-existing "persistence_credits_required" slug
      // (do not rename established API surface) — error_code, message, and
      // upgrade_url are NEW additive fields matching every other
      // payment-required response.
      sendError(res, 402, ErrorCode.PERSISTENCE_CREDITS_REQUIRED, "persistence_credits_required", {
        reason: meterResult.reason,
        message: meterResult.reason,
        upgrade_url: "https://iliad.trustfabric.ai/billing",
      });
      return;
    }
    try {
      const stage = await resolveStage(auth.account.account_id);
      await trackEvent(auth.account.account_id, "persistence_metered", stage, { op: "diff_versions", snapshot_id });
    } catch {
      // Best-effort KPI — never fail the request on analytics, even if resolveStage itself rejects.
    }
    // Closes a real cross-account-analytics gap: this call has its own metering
    // (persistence_credits, above) but never wrote to usage_records, so it was
    // invisible to getRestUsageSummary/getUsageSummary's per-program reporting.
    // No files are generated by a diff, so generators_run/input_files/input_bytes
    // are all 0 — the row exists purely to make "diff_versions" show up as a
    // real, counted program.
    await recordUsageBestEffort(auth.account.account_id, "diff_versions", snapshot_id, 0, 0, 0);
  }

  sendJSON(res, 200, { diff, trial: buildTrialNotice(false) });
}
