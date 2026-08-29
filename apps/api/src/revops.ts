// ─── /v1/revops/* — the revenue operating system's HTTP surface ──────────
//
// Iliad hosts revops so every AXIS program calls ONE pipeline; PAI'D
// (high-risk merchant acquisition) is client #1.
//
// This module is a thin composition layer and nothing more:
//
//   @axis/snapshots revops-store   facts in/out of Postgres  (no derivation)
//   @axis/revops                   derivation               (no I/O)
//   this file                      auth, validation, JSON
//
// Keeping those three apart is what lets the engine stay deterministic and
// unit-testable while the store stays a dumb fact log.
//
// ACCESS: every route is ADMIN-ONLY (requireAdmin), not merely authenticated.
// The pipeline holds prospect PII (named decision makers, work emails) plus
// commercial intelligence about who we are targeting and why. A normal Iliad
// account — including any free-tier signup — must never be able to read our
// merchant prospect list. Auth-required-but-not-admin would leak both.

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  appendEvent,
  createProspect,
  enrichProspect,
  getProspect,
  listEvents,
  loadPipeline,
  type ProspectWithEvents,
} from "@axis/snapshots";
import {
  evaluate,
  funnel,
  funnelSummary,
  qualify,
  todayQueue,
  type RevOpsEvent,
  type Prospect,
  type ProspectRecord,
  type ProspectFacts,
} from "@axis/revops";
import { requireAdmin } from "./admin.js";
import { readBody, sendError, sendJSON } from "./router.js";
import { ErrorCode } from "./logger.js";

/**
 * Event types a caller may append. Deliberately excludes anything that would
 * let a caller set a stage directly — there is no such event in the engine and
 * there must not be one here either (see packages/revops/src/types.ts).
 *
 * `identified` and `enriched` are also excluded: those are written by
 * createProspect/enrichProspect, which keep the fact and the row in one
 * transaction. Allowing a bare `identified` append would create an event with
 * no matching state change.
 */
const APPENDABLE_EVENTS = new Set([
  "qualified",
  "disqualified",
  "decision_maker_found",
  "contact_verified",
  "signal",
  "contacted",
  "replied",
  "meeting_booked",
  "meeting_held",
  "proposal_sent",
  "agreement_signed",
  "went_live",
  "first_revenue",
  "lost",
  "snoozed",
  "reopened",
]);

/** Map stored rows onto the engine's shapes. The store is intentionally
 *  loosely typed (JSON columns); this is the single conversion point. */
function toRecord(r: ProspectWithEvents): ProspectRecord {
  const prospect: Prospect = {
    prospect_id: r.prospect.prospect_id,
    legal_name: r.prospect.legal_name,
    website: r.prospect.website,
    source_id: r.prospect.source_id,
    facts: r.prospect.facts as ProspectFacts,
    created_at: r.prospect.created_at,
  };
  const events: RevOpsEvent[] = r.events.map((e) => ({
    seq: e.seq,
    prospect_id: e.prospect_id,
    type: e.type as RevOpsEvent["type"],
    at: e.at,
    payload: e.payload,
    actor: e.actor,
  }));
  return { prospect, events };
}

async function parseBody(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<Record<string, unknown> | null> {
  const raw = await readBody(req);
  try {
    const parsed = JSON.parse(raw || "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      sendError(res, 400, ErrorCode.INVALID_JSON, "Body must be a JSON object");
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return null;
  }
}

// ─── POST /v1/revops/prospects — ingest ──────────────────────────────────

export async function handleCreateProspect(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!(await requireAdmin(req, res))) return;
  const body = await parseBody(req, res);
  if (!body) return;

  const legal_name = typeof body.legal_name === "string" ? body.legal_name.trim() : "";
  const source_id = typeof body.source_id === "string" ? body.source_id.trim() : "";
  if (!legal_name || !source_id) {
    // source_id is required, not optional: an un-attributed prospect cannot be
    // audited back to how we obtained it, which for public-source ingestion is
    // the one thing we must always be able to answer.
    sendError(res, 400, ErrorCode.MISSING_FIELD, "legal_name and source_id are required");
    return;
  }

  const website = typeof body.website === "string" && body.website.trim() ? body.website.trim() : undefined;
  const facts =
    body.facts && typeof body.facts === "object" && !Array.isArray(body.facts)
      ? (body.facts as Record<string, unknown>)
      : undefined;

  const prospect = await createProspect({ legal_name, website, source_id, facts });
  // 200 not 201: createProspect dedups on website, so this is "here is the
  // prospect for this company", which may be one that already existed.
  sendJSON(res, 200, { prospect });
}

// ─── PATCH /v1/revops/prospects/:id — enrich ─────────────────────────────

export async function handleEnrichProspect(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const prospect_id = params.prospect_id ?? "";
  if (!(await requireAdmin(req, res))) return;
  const body = await parseBody(req, res);
  if (!body) return;

  const facts =
    body.facts && typeof body.facts === "object" && !Array.isArray(body.facts)
      ? (body.facts as Record<string, unknown>)
      : null;
  if (!facts) {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "facts object is required");
    return;
  }

  const actor = typeof body.actor === "string" ? body.actor : undefined;
  const updated = await enrichProspect(prospect_id, facts, actor);
  if (!updated) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "Prospect not found");
    return;
  }
  sendJSON(res, 200, { prospect: updated });
}

// ─── POST /v1/revops/prospects/:id/events — append a fact ────────────────

export async function handleAppendEvent(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const prospect_id = params.prospect_id ?? "";
  if (!(await requireAdmin(req, res))) return;
  const body = await parseBody(req, res);
  if (!body) return;

  const type = typeof body.type === "string" ? body.type : "";
  if (!APPENDABLE_EVENTS.has(type)) {
    sendError(
      res,
      400,
      ErrorCode.INVALID_FORMAT,
      `Unsupported event type "${type}". Allowed: ${[...APPENDABLE_EVENTS].sort().join(", ")}`,
    );
    return;
  }

  if (!(await getProspect(prospect_id))) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "Prospect not found");
    return;
  }

  const payload =
    body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
      ? (body.payload as Record<string, unknown>)
      : undefined;
  const actor = typeof body.actor === "string" ? body.actor : undefined;
  const at = typeof body.at === "string" ? body.at : undefined;

  const event = await appendEvent(prospect_id, type, payload, actor, at);

  // Return the RESULTING state so the caller sees what their fact did — the
  // whole point of derived stages is that appending one fact moves the
  // pipeline, and the response makes that visible instead of requiring a
  // second round trip to discover it.
  const events = await listEvents(prospect_id);
  const stored = await getProspect(prospect_id);
  const record = toRecord({ prospect: stored!, events });
  const evaluated = evaluate(record, new Date());

  sendJSON(res, 201, {
    event,
    state: evaluated.state.state,
    stage: evaluated.state.stage,
    next_action: evaluated.next,
  });
}

// ─── GET /v1/revops/prospects/:id ────────────────────────────────────────

export async function handleGetProspect(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const prospect_id = params.prospect_id ?? "";
  if (!(await requireAdmin(req, res))) return;

  const stored = await getProspect(prospect_id);
  if (!stored) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "Prospect not found");
    return;
  }
  const events = await listEvents(prospect_id);
  const evaluated = evaluate(toRecord({ prospect: stored, events }), new Date());

  sendJSON(res, 200, {
    prospect: stored,
    events,
    state: evaluated.state.state,
    stage: evaluated.state.stage,
    score: evaluated.score.score,
    score_reasons: evaluated.score.reasons,
    hot: evaluated.score.hot,
    next_action: evaluated.next,
    // Qualification is recomputed on read too — a rules change reclassifies
    // every prospect immediately, with no backfill job.
    qualification: qualify(stored.facts as ProspectFacts),
  });
}

// ─── GET /v1/revops/today — THE PRODUCT ──────────────────────────────────

export async function handleTodayQueue(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!(await requireAdmin(req, res))) return;

  const url = new URL(req.url ?? "/", "http://localhost");
  const limitRaw = Number(url.searchParams.get("limit") ?? "10");
  // Capped at 50: a human works ~10 real touches a day, and handing them 200
  // is the same as handing them nothing.
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, Math.trunc(limitRaw))) : 10;

  const { records, truncated } = await loadPipeline();
  const now = new Date();
  const queue = todayQueue(records.map(toRecord), now, { limit });

  sendJSON(res, 200, {
    generated_at: now.toISOString(),
    count: queue.length,
    // Surfaced, never hidden: a truncated load means the queue may be missing
    // work, and a silently-short queue is worse than a slow one.
    truncated,
    queue: queue.map((q) => ({
      prospect_id: q.prospect.prospect_id,
      legal_name: q.prospect.legal_name,
      website: q.prospect.website,
      stage: q.state.stage,
      score: q.score.score,
      hot: q.score.hot,
      action: q.next.action,
      reason: q.next.reason,
      due_at: q.next.due_at,
      priority: q.next.priority,
      decision_maker: (q.prospect.facts as ProspectFacts).decision_maker,
    })),
  });
}

// ─── GET /v1/revops/funnel ───────────────────────────────────────────────

export async function handleFunnel(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!(await requireAdmin(req, res))) return;

  const { records, truncated } = await loadPipeline();
  const now = new Date();
  const f = funnel(records.map(toRecord), now);

  sendJSON(res, 200, {
    generated_at: now.toISOString(),
    truncated,
    ...f,
    // The same text the CLI and any dashboard print, computed in one place so
    // three surfaces can never disagree about the numbers.
    summary: funnelSummary(f),
  });
}
