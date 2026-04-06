import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJSON, sendError } from "./router.js";
import { ErrorCode } from "./logger.js";
import {
  listGenerationVersions,
  getGenerationVersion,
  diffGenerationVersions,
} from "@axis/snapshots";

/** GET /v1/snapshots/:snapshot_id/versions — list generation versions */
export async function handleListVersions(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const { snapshot_id } = params;
  const versions = listGenerationVersions(snapshot_id);

  sendJSON(res, 200, { snapshot_id, versions, count: versions.length });
}

/** GET /v1/snapshots/:snapshot_id/versions/:version_number — get specific version */
export async function handleGetVersion(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const { snapshot_id, version_number } = params;
  const vNum = parseInt(version_number, 10);

  if (isNaN(vNum) || vNum < 1) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "version_number must be a positive integer");
    return;
  }

  const version = getGenerationVersion(snapshot_id, vNum);
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

  const diff = diffGenerationVersions(snapshot_id, oldV, newV);
  if (!diff) {
    sendError(res, 404, ErrorCode.NOT_FOUND, `One or both versions not found for snapshot ${snapshot_id}`);
    return;
  }

  sendJSON(res, 200, { diff });
}
