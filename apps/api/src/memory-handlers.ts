// ─── Project Memory REST surface ────────────────────────────────
//
// Per-project, server-side memory: decisions, conventions, evidence, goals
// written during work and read back into generation by a later weave.
// Append-only in v1 — corrections are new "decision" entries, not edits.

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Account } from "@axis/snapshots";
import {
  addMemoryEntry,
  listMemoryEntries,
  countMemoryEntries,
  getMemoryProject,
  trackEvent,
  resolveStage,
  MEMORY_KINDS,
  MEMORY_CONTENT_MAX,
  MEMORY_SOURCE_MAX,
  MEMORY_PROJECT_CAP,
  type MemoryKind,
} from "@axis/snapshots";
import { sendJSON, sendError, readBody } from "./router.js";
import { ErrorCode } from "./logger.js";
import { resolveAuth } from "./billing.js";

function isMemoryKind(v: unknown): v is MemoryKind {
  return typeof v === "string" && (MEMORY_KINDS as readonly string[]).includes(v);
}

/** Shared auth ladder: 401 unauthenticated → 404 unknown project → 403 anonymous
 *  project → 404 owner mismatch (no-leak, mirrors assertSnapshotAccess). Returns
 *  the resolved owning account, or null having already sent the error response. */
async function resolveMemoryOwner(req: IncomingMessage, res: ServerResponse, project_id: string): Promise<Account | null> {
  const auth = await resolveAuth(req);
  if (!auth.account) {
    sendError(res, 401, ErrorCode.AUTH_REQUIRED, "Authentication required");
    return null;
  }

  const project = await getMemoryProject(project_id);
  if (!project) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "Project not found");
    return null;
  }
  if (project.account_id === null) {
    sendError(res, 403, ErrorCode.FORBIDDEN, "Memory requires an account-owned project — re-analyze while authenticated to claim it.");
    return null;
  }
  if (project.account_id !== auth.account.account_id) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "Project not found");
    return null;
  }

  return auth.account;
}

/** GET /v1/projects/:project_id/memory?kind=&limit= */
export async function handleListMemory(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const { project_id } = params;
  const account = await resolveMemoryOwner(req, res, project_id);
  if (!account) return;

  /* v8 ignore next — req.url always present in tests */
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  const kindParam = url.searchParams.get("kind");
  let kind: MemoryKind | undefined;
  if (kindParam !== null) {
    if (!isMemoryKind(kindParam)) {
      sendError(res, 400, ErrorCode.INVALID_FORMAT, `kind must be one of: ${MEMORY_KINDS.join(", ")}`);
      return;
    }
    kind = kindParam;
  }

  const limitParam = url.searchParams.get("limit");
  let limit = 50;
  if (limitParam !== null) {
    const n = Number(limitParam);
    if (!Number.isInteger(n) || n < 1) {
      sendError(res, 400, ErrorCode.INVALID_FORMAT, "limit must be a positive integer");
      return;
    }
    limit = Math.min(n, 200);
  }

  const [entries, total] = await Promise.all([
    listMemoryEntries(project_id, { kind, limit }),
    countMemoryEntries(project_id),
  ]);

  sendJSON(res, 200, { project_id, entries, count: entries.length, total });
}

/** POST /v1/projects/:project_id/memory  {kind, content, source?} */
export async function handleAddMemory(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const { project_id } = params;
  const account = await resolveMemoryOwner(req, res, project_id);
  if (!account) return;

  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "Invalid JSON body");
    return;
  }

  if (!isMemoryKind(body.kind)) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, `kind must be one of: ${MEMORY_KINDS.join(", ")}`);
    return;
  }
  const kind = body.kind;

  const content = body.content;
  if (typeof content !== "string" || content.length === 0) {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "content is required");
    return;
  }
  if (content.length > MEMORY_CONTENT_MAX) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, `content must be at most ${MEMORY_CONTENT_MAX} characters`);
    return;
  }

  let source = "";
  if (body.source !== undefined) {
    if (typeof body.source !== "string" || body.source.length > MEMORY_SOURCE_MAX) {
      sendError(res, 400, ErrorCode.INVALID_FORMAT, `source must be a string of at most ${MEMORY_SOURCE_MAX} characters`);
      return;
    }
    source = body.source;
  }

  // Count-then-insert is intentionally unlocked: a couple of entries landing past
  // the cap under concurrent writers is an acceptable race for an append-only,
  // non-monetary log — not worth a transaction/advisory lock here.
  const existing = await countMemoryEntries(project_id);
  if (existing >= MEMORY_PROJECT_CAP) {
    sendError(res, 409, ErrorCode.CONFLICT, `Project memory is capped at ${MEMORY_PROJECT_CAP} entries (append-only — record a correction as a new decision entry instead).`);
    return;
  }

  const entry = await addMemoryEntry(project_id, account.account_id, kind, content, source);
  try {
    const stage = await resolveStage(account.account_id);
    await trackEvent(account.account_id, "memory_written", stage, { project_id, kind });
  } catch {
    // Best-effort KPI — never fail the request on analytics, even if resolveStage itself rejects.
  }

  sendJSON(res, 201, { entry, total: existing + 1 });
}
