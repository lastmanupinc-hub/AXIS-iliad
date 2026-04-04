import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJSON, readBody } from "./router.js";
import { requireAuth } from "./billing.js";
import {
  inviteSeat,
  acceptSeat,
  revokeSeat,
  getActiveSeats,
  getAllSeats,
  getSeatCount,
  trackEvent,
  getAccountEvents,
  resolveStage,
  generateUpgradePrompt,
  getFunnelMetrics,
  type SeatRole,
  SEAT_LIMITS,
  PLAN_CATALOG,
  PLAN_FEATURES,
} from "@axis/snapshots";

// ─── Plans / Pricing ────────────────────────────────────────────

/** GET /v1/plans — public plan catalog & feature comparison (no auth) */
export async function handleGetPlans(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  sendJSON(res, 200, {
    plans: PLAN_CATALOG,
    features: PLAN_FEATURES,
  });
}

// ─── Seats ──────────────────────────────────────────────────────

/** POST /v1/account/seats — invite a team member (requires auth, paid/suite) */
export async function handleInviteSeat(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  if (ctx.account!.tier === "free") {
    sendJSON(res, 403, { error: "Team seats require Pro or Enterprise tier" });
    return;
  }

  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendJSON(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const email = body.email as string | undefined;
  const role = (body.role as SeatRole) ?? "member";

  if (!email) {
    sendJSON(res, 400, { error: "email is required" });
    return;
  }

  if (!["owner", "admin", "member", "viewer"].includes(role)) {
    sendJSON(res, 400, { error: "role must be owner, admin, member, or viewer" });
    return;
  }

  try {
    const seat = inviteSeat(ctx.account!.account_id, email, role, ctx.account!.account_id);
    sendJSON(res, 201, { seat });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("Seat limit")) {
      const limit = SEAT_LIMITS[ctx.account!.tier];
      sendJSON(res, 429, {
        error: message,
        limit,
        upgrade_hint: ctx.account!.tier === "paid"
          ? "Upgrade to Enterprise Suite for unlimited seats"
          : undefined,
      });
    } else {
      sendJSON(res, 400, { error: message });
    }
  }
}

/** GET /v1/account/seats — list team seats (requires auth) */
export async function handleListSeats(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const includeRevoked = url.searchParams.get("include_revoked") === "true";

  const seats = includeRevoked
    ? getAllSeats(ctx.account!.account_id)
    : getActiveSeats(ctx.account!.account_id);

  const seatCount = getSeatCount(ctx.account!.account_id);
  const seatLimit = SEAT_LIMITS[ctx.account!.tier];

  sendJSON(res, 200, {
    seats: seats.map(s => ({
      seat_id: s.seat_id,
      email: s.email,
      role: s.role,
      accepted: s.accepted_at !== null,
      accepted_at: s.accepted_at,
      revoked_at: s.revoked_at,
      created_at: s.created_at,
    })),
    count: seatCount,
    limit: seatLimit === -1 ? "unlimited" : seatLimit,
    remaining: seatLimit === -1 ? "unlimited" : Math.max(0, seatLimit - seatCount),
  });
}

/** POST /v1/account/seats/:seat_id/accept — accept a seat invitation */
export async function handleAcceptSeat(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const { seat_id } = params;
  const ok = acceptSeat(seat_id);
  if (!ok) {
    sendJSON(res, 404, { error: "Seat invitation not found or already accepted/revoked" });
    return;
  }
  sendJSON(res, 200, { seat_id, accepted: true });
}

/** POST /v1/account/seats/:seat_id/revoke — remove a team member (requires auth) */
export async function handleRevokeSeat(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  const { seat_id } = params;
  const ok = revokeSeat(seat_id);
  if (!ok) {
    sendJSON(res, 404, { error: "Seat not found or already revoked" });
    return;
  }
  sendJSON(res, 200, { seat_id, revoked: true });
}

// ─── Funnel & Upgrade Prompts ───────────────────────────────────

/** GET /v1/account/upgrade-prompt — get contextual upgrade prompt (requires auth) */
export async function handleGetUpgradePrompt(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  const prompt = generateUpgradePrompt(ctx.account!.account_id);
  const stage = resolveStage(ctx.account!.account_id);

  if (!prompt) {
    sendJSON(res, 200, { prompt: null, stage, message: "No upgrade recommended at this time" });
    return;
  }

  // Track that we showed the prompt
  trackEvent(ctx.account!.account_id, "upgrade_prompt_shown", "upgrade_shown", {
    trigger: prompt.trigger,
    recommended_tier: prompt.recommended_tier,
  });

  sendJSON(res, 200, { prompt, stage });
}

/** POST /v1/account/upgrade-prompt/dismiss — dismiss the current prompt */
export async function handleDismissUpgradePrompt(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  const raw = await readBody(req);
  let body: Record<string, unknown> = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { /* empty is fine */ }

  trackEvent(ctx.account!.account_id, "upgrade_prompt_dismissed", resolveStage(ctx.account!.account_id), {
    reason: body.reason ?? "not_specified",
  });

  sendJSON(res, 200, { dismissed: true });
}

/** GET /v1/account/funnel — get funnel stage & event history (requires auth) */
export async function handleGetFunnelStatus(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const limit = parseInt(url.searchParams.get("limit") ?? "20", 10);

  const stage = resolveStage(ctx.account!.account_id);
  const events = getAccountEvents(ctx.account!.account_id, Math.min(limit, 100));

  sendJSON(res, 200, {
    account_id: ctx.account!.account_id,
    tier: ctx.account!.tier,
    stage,
    recent_events: events.map(e => ({
      event_type: e.event_type,
      stage: e.stage,
      metadata: e.metadata,
      created_at: e.created_at,
    })),
  });
}

/** GET /v1/funnel/metrics — aggregate funnel analytics (admin/internal) */
export async function handleGetFunnelMetrics(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // In production, this would require admin auth. For now, public for internal use.
  const metrics = getFunnelMetrics();
  sendJSON(res, 200, { metrics });
}
