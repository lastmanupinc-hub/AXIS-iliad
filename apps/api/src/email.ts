// ─── iliad_transactional_email — Resend /emails proxy ──────────
//
// AXIS-branded wrapper around Resend's transactional email API. Same
// pattern as iliad_embeddings → OpenAI and iliad_web_research → Firecrawl:
// the agent sends a single MCP call, AXIS handles auth, input
// validation, error normalization, and (eventually) billing.
//
// Decoupled from the template-based pipeline in @axis/snapshots/email-store.ts
// on purpose — that path serves the internal welcome/upgrade/usage-alert
// flows where the From: address and templates are fixed by AXIS. The MCP
// tool serves arbitrary agent-supplied content with a single verified
// From: address per AXIS deployment.

export interface EmailConfig {
  api_key: string;
  from_address: string;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  body_html?: string;
  body_text?: string;
  /** Optional Reply-To header. */
  reply_to?: string;
}

export interface SendEmailResult {
  message_id: string;
  delivered_to: string[];
  from: string;
  subject: string;
}

export type EmailConfigFromEnv = EmailConfig | null;

/** Read Resend config from env. Returns null if either of the two required vars is missing. */
export function readEmailConfigFromEnv(env: NodeJS.ProcessEnv = process.env): EmailConfigFromEnv {
  const api_key = env.RESEND_API_KEY;
  const from_address = env.RESEND_FROM_ADDRESS;
  if (!api_key || !from_address) return null;
  return { api_key, from_address };
}

export const DEFAULT_RESEND_BASE_URL = "https://api.resend.com";

interface ResendSuccessResponse { id: string; }
interface ResendErrorResponse { name?: string; message?: string; statusCode?: number; }

/** RFC 5322 basic sanity — not a full validator, just blocks obvious typos. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRecipients(to: string | string[]): string[] {
  const arr = Array.isArray(to) ? to : [to];
  if (arr.length === 0) throw new Error("sendTransactionalEmail: at least one recipient is required");
  if (arr.length > 50) throw new Error("sendTransactionalEmail: recipient list capped at 50 per call");
  for (let i = 0; i < arr.length; i++) {
    const r = arr[i];
    if (typeof r !== "string" || !EMAIL_RE.test(r)) {
      throw new Error(`sendTransactionalEmail: recipient[${i}] is not a valid email address`);
    }
  }
  return arr;
}

/**
 * POST a transactional email through Resend. Pure function over `fetch` so
 * tests can pass a stub. Caller must supply at least one of body_html /
 * body_text — Resend rejects messages with neither.
 */
export async function sendTransactionalEmail(
  opts: SendEmailOptions,
  config: EmailConfig,
  fetchImpl: typeof fetch = fetch,
  baseUrl: string = DEFAULT_RESEND_BASE_URL,
): Promise<SendEmailResult> {
  if (!config.api_key) throw new Error("sendTransactionalEmail: missing api_key");
  if (!config.from_address) throw new Error("sendTransactionalEmail: missing from_address");
  if (!EMAIL_RE.test(config.from_address)) {
    // Defensive — should never trip because env-validation catches it earlier,
    // but a typo'd RESEND_FROM_ADDRESS produces a confusing Resend 422 otherwise.
    throw new Error("sendTransactionalEmail: RESEND_FROM_ADDRESS is not a valid email address");
  }

  const recipients = validateRecipients(opts.to);
  if (typeof opts.subject !== "string" || opts.subject.length === 0) {
    throw new Error("sendTransactionalEmail: subject is required");
  }
  if (opts.subject.length > 998) {
    // RFC 5322 line-length cap. Resend rejects longer subjects.
    throw new Error("sendTransactionalEmail: subject exceeds 998 chars");
  }
  if (!opts.body_html && !opts.body_text) {
    throw new Error("sendTransactionalEmail: at least one of body_html / body_text is required");
  }
  if (opts.body_html && opts.body_html.length > 1_000_000) {
    throw new Error("sendTransactionalEmail: body_html exceeds 1 MB");
  }
  if (opts.body_text && opts.body_text.length > 1_000_000) {
    throw new Error("sendTransactionalEmail: body_text exceeds 1 MB");
  }
  if (opts.reply_to && !EMAIL_RE.test(opts.reply_to)) {
    throw new Error("sendTransactionalEmail: reply_to is not a valid email address");
  }

  const body: Record<string, unknown> = {
    from: config.from_address,
    to: recipients,
    subject: opts.subject,
  };
  if (opts.body_html) body.html = opts.body_html;
  if (opts.body_text) body.text = opts.body_text;
  if (opts.reply_to) body.reply_to = opts.reply_to;

  const url = `${baseUrl}/emails`;
  let resp: Response;
  try {
    // H8.1 WAIVER: no client-side AbortController/timeout. Tracked as H8.1b.
    resp = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.api_key}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`Email provider unreachable: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`;
    try {
      const errBody = (await resp.json()) as ResendErrorResponse;
      if (errBody?.message) detail = `${resp.status} ${errBody.message}`;
    } catch {
      // Body wasn't JSON; keep bare status.
    }
    throw new Error(`Email provider error: ${detail}`);
  }

  let parsed: ResendSuccessResponse;
  try {
    parsed = (await resp.json()) as ResendSuccessResponse;
  } catch {
    throw new Error("Email provider returned non-JSON response");
  }

  if (!parsed?.id || typeof parsed.id !== "string") {
    throw new Error("Email provider returned no message id");
  }

  return {
    message_id: parsed.id,
    delivered_to: recipients,
    from: config.from_address,
    subject: opts.subject,
  };
}
