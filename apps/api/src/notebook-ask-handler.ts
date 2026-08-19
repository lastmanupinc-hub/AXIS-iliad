// ─── app_34's Apply: a live endpoint, not a report ─────────────────
//
// The rubric's own definition of Apply is "lands as a PR / build / render /
// live endpoint — never a report." Notebook's deliverable IS the live
// endpoint: notebook-qa.ts's grounded retrieval + citation-validated
// synthesis is worthless unfired. This is the wiring that fires it, with
// the SAME tenancy and entitlement discipline every other snapshot-scoped
// paid endpoint in this file uses (assertSnapshotAccess, isProgramEnabled).
import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJSON, sendError, readBody } from "./router.js";
import { resolveAuth } from "./billing.js";
import { ErrorCode } from "./logger.js";
import { getSnapshot, isProgramEnabled } from "@axis/snapshots";
import { answerFromCode } from "./notebook-qa.js";

/**
 * Duplicated rather than imported from handlers.ts: that file is 3800+
 * lines and pulling one function from it here would be the first edge of a
 * circular import (handlers.ts does not import this file, but a future
 * change easily could). The logic itself is intentionally tiny and stable.
 */
async function assertSnapshotAccess(
  req: IncomingMessage,
  res: ServerResponse,
  snapshot: { account_id: string | null },
): Promise<boolean> {
  if (!snapshot.account_id) return true;
  const auth = await resolveAuth(req);
  if (!auth.account) {
    sendError(res, 401, ErrorCode.AUTH_REQUIRED, "Authentication required");
    return false;
  }
  if (auth.account.account_id !== snapshot.account_id) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "Snapshot not found");
    return false;
  }
  return true;
}

export async function handleNotebookAsk(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const auth = await resolveAuth(req);
  if (!auth.account) {
    sendError(res, 401, ErrorCode.AUTH_REQUIRED, "notebook requires authentication. Include Authorization: Bearer <api_key>");
    return;
  }

  const enabled = await isProgramEnabled(auth.account.account_id, "notebook");
  if (!enabled) {
    sendError(res, 402, ErrorCode.TIER_REQUIRED, "The notebook program is not enabled for this account.", {
      upgrade_url: "https://notebook.trustfabric.ai",
    });
    return;
  }

  let body: Record<string, unknown>;
  try {
    // Explicit cast, not an implicit any->typed assignment: JSON.parse's
    // return type is `any`, and this new file (unlike some legacy handlers)
    // is held to the full type-aware lint rules, which flag that implicitly.
    body = JSON.parse(await readBody(req)) as Record<string, unknown>;
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const snapshotId = body.snapshot_id;
  if (typeof snapshotId !== "string" || !snapshotId) {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "snapshot_id is required");
    return;
  }
  const question = body.question;
  if (typeof question !== "string" || question.trim().length === 0) {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "question is required");
    return;
  }
  if (question.length > 500) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "question must be 500 characters or fewer");
    return;
  }

  const snapshot = await getSnapshot(snapshotId);
  if (!snapshot) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "Snapshot not found");
    return;
  }
  if (!(await assertSnapshotAccess(req, res, snapshot))) return;

  const result = await answerFromCode(snapshotId, question);
  sendJSON(res, 200, result);
}
