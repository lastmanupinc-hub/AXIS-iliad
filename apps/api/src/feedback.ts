// ─── Customer feedback / support tickets ─────────────────────────
//
// One public endpoint (POST /v1/feedback) behind the web feedback page AND
// callable directly by agents. Both audiences matter here: a human hitting a
// rough edge and an agent whose tool call behaved unexpectedly are reporting
// the same class of information, so they get the same structured intake
// rather than a human-only contact form.
//
// Delivery is email to the support inbox — deliberately no new table. During
// beta the inbox IS the queue, and a durable store would be a second source
// of truth to keep in sync for no present benefit. What protects against loss
// is that a failed send is reported honestly to the caller (never a silent
// "thanks!") and logged at error level with the full payload, so nothing is
// unrecoverable.

import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { sendJSON, sendError, readBody } from "./router.js";
import { ErrorCode, log, getRequestId } from "./logger.js";
import { getClientIp } from "./rate-limiter.js";
import { aggregateIpPrefix } from "./ip-prefix.js";
import { readEmailConfigFromEnv, sendTransactionalEmail } from "./email.js";
import { resolveAuth } from "./billing.js";

/**
 * Where tickets land. Overridable per deployment, but the default is the
 * estate's standardized, live support inbox — the same address the Help,
 * Plans, Q&A, Terms and Usage pages already publish, so a customer never
 * sees two different "contact us" addresses.
 */
export function supportInbox(): string {
  return process.env.SUPPORT_EMAIL ?? "support@jonathanarvay.com";
}

export const FEEDBACK_CATEGORIES = ["bug", "feature", "praise", "question", "other"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export interface FeedbackInput {
  message: string;
  email: string | null;
  category: FeedbackCategory;
  rating: number | null;
  page: string | null;
}

export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 5000;

/** Same basic sanity check email.ts uses — not a full RFC validator. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ValidationOutcome =
  | { ok: true; value: FeedbackInput }
  | { ok: false; field: string; error: string };

/**
 * Validate and normalize a submission. Pure, so the rules are testable
 * without a server. Only `message` is required: demanding an email address
 * would cost real reports from people who just want to flag something and
 * move on, and an anonymous bug report is still a bug report.
 */
export function validateFeedback(raw: Record<string, unknown>): ValidationOutcome {
  const message = typeof raw.message === "string" ? raw.message.trim() : "";
  if (!message) {
    return { ok: false, field: "message", error: "message is required" };
  }
  if (message.length < MESSAGE_MIN) {
    return { ok: false, field: "message", error: `message must be at least ${MESSAGE_MIN} characters` };
  }
  if (message.length > MESSAGE_MAX) {
    return { ok: false, field: "message", error: `message must be ${MESSAGE_MAX} characters or fewer` };
  }

  let email: string | null = null;
  if (raw.email !== undefined && raw.email !== null && raw.email !== "") {
    if (typeof raw.email !== "string" || !EMAIL_RE.test(raw.email.trim())) {
      return { ok: false, field: "email", error: "email is not a valid address" };
    }
    email = raw.email.trim();
  }

  let category: FeedbackCategory = "other";
  if (raw.category !== undefined && raw.category !== null && raw.category !== "") {
    if (typeof raw.category !== "string" || !FEEDBACK_CATEGORIES.includes(raw.category as FeedbackCategory)) {
      return { ok: false, field: "category", error: `category must be one of: ${FEEDBACK_CATEGORIES.join(", ")}` };
    }
    category = raw.category as FeedbackCategory;
  }

  let rating: number | null = null;
  if (raw.rating !== undefined && raw.rating !== null && raw.rating !== "") {
    const n = typeof raw.rating === "number" ? raw.rating : Number(raw.rating);
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      return { ok: false, field: "rating", error: "rating must be an integer from 1 to 5" };
    }
    rating = n;
  }

  const page = typeof raw.page === "string" && raw.page.trim() ? raw.page.trim().slice(0, 200) : null;

  return { ok: true, value: { message, email, category, rating, page } };
}

// ─── Abuse throttle ──────────────────────────────────────────────
//
// Separate from (and much tighter than) the router's general per-window
// limiter, and namespaced so a burst of submissions can't consume a caller's
// ordinary API budget. Keyed on the aggregated network prefix for the same
// reason the general limiter is: keying on the exact address lets anyone with
// an IPv6 allocation rotate a fresh quota per request.

interface SubmissionWindow {
  count: number;
  resetAt: number;
}
const submissions = new Map<string, SubmissionWindow>();
const SUBMISSION_WINDOW_MS = 60 * 60_000; // 1 hour

function maxSubmissionsPerWindow(): number {
  const n = parseInt(process.env.FEEDBACK_MAX_PER_HOUR ?? "5", 10);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

/** True if this network prefix may submit again this window. */
export function allowSubmission(ip: string): boolean {
  const key = aggregateIpPrefix(ip);
  const now = Date.now();
  let entry = submissions.get(key);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + SUBMISSION_WINDOW_MS };
    submissions.set(key, entry);
  }
  entry.count++;
  return entry.count <= maxSubmissionsPerWindow();
}

/** Test-only: clear throttle state between cases. */
export function resetSubmissionWindows(): void {
  submissions.clear();
}

// ─── Email composition ───────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface TicketContext {
  ticket_id: string;
  account_id: string | null;
  tier: string | null;
  user_agent: string | null;
  request_id: string | null;
  submitted_at: string;
}

export function buildTicketSubject(input: FeedbackInput, ticketId: string): string {
  const stars = input.rating ? ` ${input.rating}/5` : "";
  return `[AXIS Iliad ${input.category}${stars}] ${ticketId}`;
}

/**
 * Plain-text body. Every ticket carries the context needed to act on it
 * without a round-trip — who sent it (when known), what tier they're on, what
 * page they were on, and the request id that ties back to server logs.
 */
export function buildTicketText(input: FeedbackInput, ctx: TicketContext): string {
  const lines = [
    `Category:   ${input.category}`,
    `Rating:     ${input.rating !== null ? `${input.rating}/5` : "(not given)"}`,
    `From:       ${input.email ?? "(anonymous — no reply address given)"}`,
    `Account:    ${ctx.account_id ?? "(not signed in)"}`,
    `Tier:       ${ctx.tier ?? "(anonymous)"}`,
    `Page:       ${input.page ?? "(not reported)"}`,
    `Ticket:     ${ctx.ticket_id}`,
    `Request id: ${ctx.request_id ?? "(none)"}`,
    `Submitted:  ${ctx.submitted_at}`,
    `User agent: ${ctx.user_agent ?? "(none)"}`,
    "",
    "─".repeat(60),
    "",
    input.message,
    "",
  ];
  if (!input.email) {
    lines.push("NOTE: no reply address was supplied — this ticket cannot be answered directly.");
  }
  return lines.join("\n");
}

export function buildTicketHtml(input: FeedbackInput, ctx: TicketContext): string {
  const row = (k: string, v: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap">${escapeHtml(k)}</td><td style="padding:4px 0"><strong>${escapeHtml(v)}</strong></td></tr>`;
  return [
    `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.5">`,
    `<table style="border-collapse:collapse;margin-bottom:16px">`,
    row("Category", input.category),
    row("Rating", input.rating !== null ? `${input.rating}/5` : "(not given)"),
    row("From", input.email ?? "(anonymous — no reply address given)"),
    row("Account", ctx.account_id ?? "(not signed in)"),
    row("Tier", ctx.tier ?? "(anonymous)"),
    row("Page", input.page ?? "(not reported)"),
    row("Ticket", ctx.ticket_id),
    row("Request id", ctx.request_id ?? "(none)"),
    row("Submitted", ctx.submitted_at),
    `</table>`,
    `<div style="white-space:pre-wrap;border-left:3px solid #ddd;padding-left:12px">${escapeHtml(input.message)}</div>`,
    input.email
      ? ""
      : `<p style="color:#a00;margin-top:16px">No reply address was supplied — this ticket cannot be answered directly.</p>`,
    `</div>`,
  ].join("");
}

// ─── Handler ─────────────────────────────────────────────────────

/**
 * POST /v1/feedback — public (no auth required). Auth is read opportunistically
 * so a signed-in customer's ticket carries their account and tier, but a
 * signed-out visitor is never blocked: the people most likely to hit a
 * blocking bug are exactly the ones who couldn't sign in.
 */
export async function handleFeedback(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const requestId = getRequestId(res) ?? null;

  let raw: string;
  try {
    raw = await readBody(req);
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Request body too large or malformed");
    return;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Body must be valid JSON", {
      expected: { message: "string (required)", email: "string (optional)", category: FEEDBACK_CATEGORIES, rating: "1-5 (optional)" },
    });
    return;
  }

  const outcome = validateFeedback(parsed);
  if (!outcome.ok) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, outcome.error, { field: outcome.field });
    return;
  }
  const input = outcome.value;

  // Throttle AFTER validation so a malformed retry loop doesn't burn a real
  // customer's hourly allowance on requests that were never accepted.
  const ip = getClientIp(req);
  if (!allowSubmission(ip)) {
    log("warn", "feedback_throttled", { request_id: requestId, prefix: aggregateIpPrefix(ip) });
    sendError(res, 429, ErrorCode.RATE_LIMITED, `Too many feedback submissions from this network. Limit is ${maxSubmissionsPerWindow()} per hour.`, {
      retry_after: 3600,
      alternative: `Email ${supportInbox()} directly.`,
    });
    return;
  }

  const auth = await resolveAuth(req);
  const ticketId = `AXIS-${randomUUID().slice(0, 8).toUpperCase()}`;
  const ctx: TicketContext = {
    ticket_id: ticketId,
    account_id: auth.account?.account_id ?? null,
    tier: auth.account?.tier ?? null,
    user_agent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"].slice(0, 300) : null,
    request_id: requestId,
    submitted_at: new Date().toISOString(),
  };

  const config = readEmailConfigFromEnv();
  if (!config) {
    // Honest 503 rather than a fake "thanks!" — the customer needs to know
    // their report did NOT arrive, and gets the direct address as a fallback.
    log("error", "feedback_email_not_configured", { request_id: requestId, ticket_id: ticketId, ...input });
    sendError(res, 503, ErrorCode.INTERNAL_ERROR, "Feedback delivery is not configured on this server. Your message was NOT sent.", {
      fallback_email: supportInbox(),
      ticket_id: ticketId,
    });
    return;
  }

  try {
    await sendTransactionalEmail(
      {
        to: supportInbox(),
        subject: buildTicketSubject(input, ticketId),
        body_text: buildTicketText(input, ctx),
        body_html: buildTicketHtml(input, ctx),
        // Replying in the mail client reaches the customer directly when they
        // gave an address; otherwise Resend falls back to the From: address.
        ...(input.email ? { reply_to: input.email } : {}),
      },
      config,
    );
  } catch (err) {
    // Log the FULL payload at error level: email was the only delivery path,
    // so the log is now the only copy. Losing a customer's report silently is
    // worse than a noisy log line.
    log("error", "feedback_send_failed", {
      request_id: requestId,
      ticket_id: ticketId,
      error: err instanceof Error ? err.message : String(err),
      category: input.category,
      rating: input.rating,
      from_email: input.email,
      message: input.message,
    });
    sendError(res, 502, ErrorCode.UPSTREAM_ERROR, "Could not deliver your feedback right now. Your message was NOT sent — please email us directly.", {
      fallback_email: supportInbox(),
      ticket_id: ticketId,
    });
    return;
  }

  log("info", "feedback_received", {
    request_id: requestId,
    ticket_id: ticketId,
    category: input.category,
    rating: input.rating,
    has_reply_address: input.email !== null,
    account_id: ctx.account_id,
  });

  sendJSON(res, 200, {
    ok: true,
    ticket_id: ticketId,
    message: input.email
      ? "Thanks — your feedback reached the team. We'll reply to the address you gave."
      : "Thanks — your feedback reached the team. You didn't leave an address, so we can't reply directly.",
    beta_notice: "Axis' Iliad is in beta. Reports like yours are what we harden against.",
  });
}
