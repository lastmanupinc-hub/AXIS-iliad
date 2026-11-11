/**
 * Email verification (AXIS Launch taskgate T106; red-team finding I-02, 2026-11-10).
 *
 * POST /v1/accounts used to mint a key for any syntactically valid address, and that key could spend the free
 * allowance toward paid upstreams at once. Now an account starts unverified: it holds its key, reads its own data
 * and runs the free tools, but every metered call (REST generator routes and metered MCP tools) is refused until the
 * address is confirmed through the link in the mail this module sends. Accounts a social sign-in creates are verified
 * at creation (the provider attested the identity), and the migration that added the column marked every account
 * that already existed as verified (pg-schema.ts v49).
 *
 * The link carries a stateless token: `v1.<account_id>.<expiry>.<hmac>`, the HMAC over account id, expiry and the
 * address as stored, keyed by AXIS_EMAIL_VERIFY_SECRET (else AXIS_TOKEN_KEY). Changing the address invalidates
 * outstanding links; verifying twice is harmless (markAccountEmailVerified is idempotent).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { sendJSON, sendError } from "./router.js";
import { ErrorCode, log } from "./logger.js";
import { resolveAuth, requireAuth } from "./billing.js";
import { readEmailConfigFromEnv, sendTransactionalEmail } from "./email.js";
import { publicUrl } from "./public-base.js";
import { toolErr } from "./mcp-runtime.js";
import { getAccount, markAccountEmailVerified, type Account } from "@axis/snapshots";

export const VERIFICATION_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** A second verification mail for the same account waits this long. */
export const RESEND_INTERVAL_MS = 5 * 60 * 1000;
export const RESEND_PATH = "POST /v1/account/verification";

type RouteHandler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => Promise<void>;

let warnedDevSecret = false;

/** The HMAC key. Production refuses to run without a real secret; development falls back to a public one. */
export function verificationSecret(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const raw = env.AXIS_EMAIL_VERIFY_SECRET || env.AXIS_TOKEN_KEY;
  if (raw && raw.length >= 32) return createHash("sha256").update("axis-email-verify:" + raw).digest();
  if (env.NODE_ENV === "production") return null;
  if (!warnedDevSecret) {
    warnedDevSecret = true;
    console.warn("[email-verification] AXIS_EMAIL_VERIFY_SECRET / AXIS_TOKEN_KEY unset or shorter than 32 chars — signing verification links with the public dev key (development only).");
  }
  return createHash("sha256").update("axis-dev-email-verify").digest();
}

export function isEmailVerified(account: Pick<Account, "email_verified_at"> | null | undefined): boolean {
  return Boolean(account?.email_verified_at);
}

function signature(secret: Buffer, accountId: string, exp: number, email: string): string {
  return createHmac("sha256", secret).update(`${accountId}\n${exp}\n${email}`).digest("hex");
}

/** The token the verification link carries. Null when no secret is configured (production without one). */
export function buildVerificationToken(
  account: Pick<Account, "account_id" | "email">,
  now: number = Date.now(),
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const secret = verificationSecret(env);
  if (!secret) return null;
  const exp = Math.floor((now + VERIFICATION_LINK_TTL_MS) / 1000);
  return `v1.${account.account_id}.${exp}.${signature(secret, account.account_id, exp, account.email)}`;
}

export type TokenCheck =
  | { ok: true; account: Account }
  | { ok: false; reason: "malformed" | "expired" | "invalid" | "unconfigured" };

/** Check a token against the account it names, as that account is stored now. Reads only. */
export async function checkVerificationToken(
  token: string | null | undefined,
  now: number = Date.now(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<TokenCheck> {
  if (typeof token !== "string" || token.length > 200) return { ok: false, reason: "malformed" };
  const m = /^v1\.([0-9a-f-]{36})\.(\d{1,12})\.([0-9a-f]{64})$/.exec(token);
  if (!m) return { ok: false, reason: "malformed" };
  const secret = verificationSecret(env);
  if (!secret) return { ok: false, reason: "unconfigured" };
  const [, accountId, expRaw, sig] = m;
  const exp = Number(expRaw);
  const account = await getAccount(accountId);
  if (!account) return { ok: false, reason: "invalid" };
  const expected = signature(secret, accountId, exp, account.email);
  if (!timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(sig, "hex"))) return { ok: false, reason: "invalid" };
  if (exp * 1000 < now) return { ok: false, reason: "expired" };
  return { ok: true, account };
}

export function verificationLink(token: string): string {
  return publicUrl(`/v1/account/verify?token=${encodeURIComponent(token)}`);
}

export interface SendOutcome {
  sent: boolean;
  reason?: "unconfigured" | "no_secret" | "failed";
}

/**
 * Send the verification mail through Resend. Never throws: an unconfigured mailer or a failed send is logged and
 * reported in the outcome so the signup response can say so, and the account creation it rides on never fails.
 */
export async function sendVerificationEmail(
  account: Pick<Account, "account_id" | "name" | "email">,
  opts: { fetchImpl?: typeof fetch; now?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<SendOutcome> {
  const env = opts.env ?? process.env;
  const token = buildVerificationToken(account, opts.now, env);
  if (!token) {
    log("error", "email_verification_no_secret", { message: "AXIS_EMAIL_VERIFY_SECRET / AXIS_TOKEN_KEY is not set; verification links cannot be signed" });
    return { sent: false, reason: "no_secret" };
  }
  const config = readEmailConfigFromEnv(env);
  if (!config) {
    log("warn", "email_verification_unconfigured", { message: "RESEND_API_KEY / RESEND_FROM_ADDRESS unset; no verification mail was sent" });
    return { sent: false, reason: "unconfigured" };
  }
  const link = verificationLink(token);
  const name = account.name || "there";
  const text = [
    `Hi ${name},`,
    "",
    "Confirm this address to switch on your Axis' Iliad account's metered tools:",
    "",
    link,
    "",
    "The link works for 7 days. Until you confirm, your API key still reads your account and runs the free tools; metered calls answer \"confirm your email address\" and " + RESEND_PATH + " sends a new link.",
    "",
    "If you did not create this account, ignore this message.",
    "",
    "— Axis' Iliad",
  ].join("\n");
  const html = [
    `<p>Hi ${escapeHtml(name)},</p>`,
    "<p>Confirm this address to switch on your Axis' Iliad account's metered tools:</p>",
    `<p><a href="${escapeHtml(link)}">Confirm my email address</a></p>`,
    `<p style="color:#555">The link works for 7 days. Until you confirm, your API key still reads your account and runs the free tools; metered calls answer "confirm your email address" and <code>${RESEND_PATH}</code> sends a new link.</p>`,
    "<p style=\"color:#555\">If you did not create this account, ignore this message.</p>",
    "<p>— Axis' Iliad</p>",
  ].join("\n");
  try {
    await sendTransactionalEmail(
      { to: account.email, subject: "Confirm your email address for Axis' Iliad", body_text: text, body_html: html },
      config,
      opts.fetchImpl ?? fetch,
    );
    return { sent: true };
  } catch (err) {
    log("warn", "email_verification_send_failed", { account_id: account.account_id, error: err instanceof Error ? err.message : String(err) });
    return { sent: false, reason: "failed" };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

/** The 403 an unverified account gets from a spending route. */
export function sendEmailUnverified(res: ServerResponse, account: Pick<Account, "email">): void {
  sendError(
    res, 403, ErrorCode.EMAIL_UNVERIFIED,
    `Confirm your email address first: a link was sent to ${account.email}. ${RESEND_PATH} sends a new one.`,
    { email_verification: { verified: false, email: account.email, resend: RESEND_PATH } },
  );
}

/** The MCP tool result an unverified account gets from a metered tool: an isError result, no charge, no claim. */
export function mcpEmailUnverifiedResult(account: Pick<Account, "email">): Record<string, unknown> {
  return {
    ...toolErr(`Confirm your email address first: a link was sent to ${account.email}. ${RESEND_PATH} (with the same API key) sends a new one. Free tools keep working meanwhile.`),
    _error: { code: "auth", retryable: true },
    _email_verification_required: { email: account.email, resend: RESEND_PATH },
  };
}

/**
 * Wrap a spending route: an authenticated but unverified account is refused with 403 before the handler runs;
 * anonymous or invalid-key callers fall through to the handler's own 401.
 */
export function requireVerifiedEmail(handler: RouteHandler): RouteHandler {
  return async (req, res, params) => {
    const auth = await resolveAuth(req);
    if (auth.account && !isEmailVerified(auth.account)) {
      sendEmailUnverified(res, auth.account);
      return;
    }
    return handler(req, res, params);
  };
}

function wantsHtml(req: IncomingMessage): boolean {
  const accept = String(req.headers.accept ?? "");
  return accept.includes("text/html") && !accept.includes("application/json");
}

function htmlPage(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} — Axis' Iliad</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:36rem;margin:4rem auto;padding:0 1rem;color:#1a1a1a}h1{font-size:1.4rem}code{background:#f2f2f2;padding:.1em .3em}</style></head><body><h1>${escapeHtml(title)}</h1><p>${body}</p></body></html>`;
}

/** GET /v1/account/verify?token=... — the link in the mail. No auth: the token is the proof. */
export async function handleVerifyEmail(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const check = await checkVerificationToken(url.searchParams.get("token"));
  const html = wantsHtml(req);
  if (!check.ok) {
    const messages = {
      malformed: "The verification link is malformed. Copy the whole link from the mail, or request a new one.",
      expired: "This verification link has expired. Request a new one with " + RESEND_PATH + " (using your API key).",
      invalid: "This verification link is no longer valid (the address changed, or the account does not exist). Request a new one with " + RESEND_PATH + ".",
      unconfigured: "Email verification is not configured on this server.",
    } as const;
    const status = check.reason === "unconfigured" ? 503 : 400;
    if (html) {
      res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(htmlPage("That link did not work", escapeHtml(messages[check.reason])));
      return;
    }
    sendError(res, status, check.reason === "unconfigured" ? ErrorCode.INTERNAL_ERROR : ErrorCode.INVALID_FORMAT, messages[check.reason], { reason: check.reason });
    return;
  }
  const outcome = await markAccountEmailVerified(check.account.account_id);
  const status = outcome === "already" ? "already_verified" : "verified";
  if (outcome === "verified") log("info", "email_verified", { account_id: check.account.account_id });
  if (html) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(htmlPage("Your email address is confirmed", `${escapeHtml(check.account.email)} is confirmed. Your API key can now use every tool. You can close this tab.`));
    return;
  }
  sendJSON(res, 200, { status, email: check.account.email });
}

const lastSent = new Map<string, number>();

/** For tests: forget when verification mails were last sent. */
export function resetVerificationThrottle(): void {
  lastSent.clear();
}

/** POST /v1/account/verification — send the link again (authenticated; one every five minutes per account). */
export async function handleResendVerification(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const ctx = await requireAuth(req, res);
  if (!ctx?.account) return;
  const account = ctx.account;
  if (isEmailVerified(account)) {
    sendJSON(res, 200, { status: "already_verified", email: account.email });
    return;
  }
  const now = Date.now();
  const last = lastSent.get(account.account_id) ?? 0;
  if (now - last < RESEND_INTERVAL_MS) {
    const retryAfter = Math.ceil((RESEND_INTERVAL_MS - (now - last)) / 1000);
    res.setHeader("Retry-After", String(retryAfter));
    sendError(res, 429, ErrorCode.RATE_LIMITED, `A verification mail was sent recently; try again in ${retryAfter} seconds.`, { retry_after_seconds: retryAfter });
    return;
  }
  const outcome = await sendVerificationEmail(account);
  if (!outcome.sent) {
    sendError(res, 503, ErrorCode.INTERNAL_ERROR, "The verification mail could not be sent; try again later.", { reason: outcome.reason });
    return;
  }
  lastSent.set(account.account_id, now);
  sendJSON(res, 202, { status: "sent", email: account.email, expires_in_seconds: Math.floor(VERIFICATION_LINK_TTL_MS / 1000) });
}
