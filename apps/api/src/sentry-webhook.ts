// ─── app_32: Sentry incident webhook — the debug program's W trigger ────────
//
// docs/saas-strategy/APPLICATION_BUILD_STRATEGY.md #8 says W: "incident
// webhook" — push-triggered, mirroring github-webhook.ts, NOT a poller
// (nothing in this codebase schedules jobs; see the watcher's scope note).
//
// Multi-tenant verification, per-connection secrets: a Sentry webhook names
// only the PROJECT, not the AXIS account, and every user's Sentry integration
// signs with its own secret — there is no global secret to verify against
// (contrast GITHUB_WEBHOOK_SECRET, where one App serves all accounts). So the
// body is parsed FIRST (taking no action), the project's candidate
// connections are loaded, and the signature is verified against each
// candidate's own stored secret. Only verified candidates trigger anything;
// connections with no stored secret can never trigger (fail closed). Parsing
// before verification is safe because parsing is the only thing that happens
// pre-verification — no state changes, no information returned that varies
// by whether a project exists (unverified requests get one uniform 401).

import type { IncomingMessage, ServerResponse } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { readBody, sendJSON, sendError } from "./router.js";
import { log, ErrorCode } from "./logger.js";
import {
  getSentryConnectionsForProject,
  getRepoSubscription,
  enqueueWatchJob,
  type SentryConnectionSecrets,
} from "@axis/snapshots";

/** Sentry signs the raw body with HMAC-SHA256(secret) hex in `sentry-hook-signature`. */
export function verifySentrySignature(rawBody: string, sigHeader: string | undefined, secret: string): boolean {
  if (!sigHeader || sigHeader.trim().length === 0) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  try {
    const a = Buffer.from(sigHeader.trim(), "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Pull (issue_id, project_slug) out of a Sentry webhook body. Sentry's
 * payloads vary by integration type and event; this covers the issue-alert
 * and issue-lifecycle shapes and returns null rather than guessing when
 * neither field can be found — an unextractable payload is answered
 * handled:false, never enqueued.
 */
/**
 * Coerce an untrusted webhook field to a string ONLY when it is genuinely a
 * primitive. Bare `String(unknown)` silently produced "[object Object]" for a
 * nested object, which would then flow onward as a real issue_id/project_slug
 * and match nothing — a garbage identifier is worse than no identifier.
 * (This is what @typescript-eslint/no-base-to-string was flagging.)
 */
function primitiveToString(v: unknown): string | undefined {
  if (typeof v === "string") return v || undefined;
  if (typeof v === "number" || typeof v === "bigint" || typeof v === "boolean") return String(v);
  return undefined;
}

export function extractSentryIncidentRef(body: unknown): { issue_id: string; project_slug: string } | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const data = typeof b.data === "object" && b.data !== null ? (b.data as Record<string, unknown>) : undefined;

  // Shape 1: issue lifecycle — data.issue.{id, project.slug}
  const issue = data && typeof data.issue === "object" && data.issue !== null ? (data.issue as Record<string, unknown>) : undefined;
  if (issue && issue.id != null) {
    const project = typeof issue.project === "object" && issue.project !== null ? (issue.project as Record<string, unknown>) : undefined;
    const slug = project ? primitiveToString(project.slug) : undefined;
    const issueId = primitiveToString(issue.id);
    if (slug && issueId) return { issue_id: issueId, project_slug: slug };
  }

  // Shape 2: event alert — data.event.{issue_id, project_slug | project}
  const event = data && typeof data.event === "object" && data.event !== null ? (data.event as Record<string, unknown>) : undefined;
  if (event && event.issue_id != null) {
    const slug = primitiveToString(event.project_slug) ?? primitiveToString(event.project);
    const issueId = primitiveToString(event.issue_id);
    if (slug && issueId) return { issue_id: issueId, project_slug: slug };
  }

  return null;
}

export interface SentryWebhookDeps {
  getConnectionsForProject: (project_slug: string) => Promise<SentryConnectionSecrets[]>;
  getSubscription: (
    account_id: string,
    product_id: string,
    repo_full_name: string,
    // `unknown` already includes undefined — `unknown | undefined` collapses
    // to `unknown` and only obscured that "absent" is a real outcome here.
  ) => Promise<unknown>;
  enqueue: (payload: {
    account_id: string;
    product_id: string;
    repo_full_name: string;
    event_type: string;
    ref: string;
    sentry_issue_id: string;
  }) => Promise<string | null>;
}

export interface SentryWebhookOutcome {
  http_status: number;
  body: { handled: boolean; enqueued?: number; reason?: string; error?: string };
}

export async function processSentryWebhook(
  rawBody: string,
  sigHeader: string | undefined,
  deps: SentryWebhookDeps,
): Promise<SentryWebhookOutcome> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { http_status: 400, body: { handled: false, error: "invalid JSON" } };
  }

  const ref = extractSentryIncidentRef(parsed);
  if (!ref) {
    // Installation pings, comment events, etc. — acknowledged, not actioned.
    return { http_status: 200, body: { handled: false, reason: "no incident reference in payload" } };
  }

  const candidates = await deps.getConnectionsForProject(ref.project_slug);
  const verified = candidates.filter(
    (c) => c.webhook_secret !== null && verifySentrySignature(rawBody, sigHeader, c.webhook_secret),
  );
  if (verified.length === 0) {
    // Uniform 401 whether the project is unknown or the signature is wrong —
    // never leak which Sentry projects have connections here.
    return { http_status: 401, body: { handled: false, error: "signature verification failed" } };
  }

  let enqueued = 0;
  for (const conn of verified) {
    try {
      // Only accounts that actually subscribed the repo to the debug product
      // get a job — a stored token alone is consent to READ Sentry, not a
      // subscription to the watch mechanic.
      const sub = await deps.getSubscription(conn.account_id, "debug", conn.repo_full_name);
      if (!sub) continue;
      await deps.enqueue({
        account_id: conn.account_id,
        product_id: "debug",
        repo_full_name: conn.repo_full_name,
        event_type: "sentry_incident",
        // No git ref on an incident — empty string falls back to the default
        // branch in the watcher's branchFromRef, same convention as manual runs.
        ref: "",
        sentry_issue_id: ref.issue_id,
      });
      enqueued++;
    } catch (err) {
      // Fail-open per github-webhook.ts: an enqueue failure must never block
      // the webhook's ack — Sentry would retry and re-fire everything else.
      log("error", "sentry-webhook.enqueue_failed", {
        project: ref.project_slug,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  log("info", "sentry-webhook.processed", { project: ref.project_slug, verified: verified.length, enqueued });
  return { http_status: 200, body: { handled: true, enqueued } };
}

export function defaultSentryWebhookDeps(): SentryWebhookDeps {
  return {
    getConnectionsForProject: (slug) => getSentryConnectionsForProject(slug),
    getSubscription: (account_id, product_id, repo) => getRepoSubscription(account_id, product_id, repo),
    enqueue: (payload) => enqueueWatchJob(payload),
  };
}

export async function handleSentryWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const rawBody = await readBody(req);
  const sigHeader = req.headers["sentry-hook-signature"];
  const outcome = await processSentryWebhook(
    rawBody,
    typeof sigHeader === "string" ? sigHeader : undefined,
    defaultSentryWebhookDeps(),
  );
  if (outcome.http_status === 401) {
    sendError(res, 401, ErrorCode.INVALID_KEY, outcome.body.error ?? "unauthorized");
    return;
  }
  if (outcome.http_status === 400) {
    sendError(res, 400, ErrorCode.INVALID_JSON, outcome.body.error ?? "invalid body");
    return;
  }
  sendJSON(res, outcome.http_status, outcome.body);
}
