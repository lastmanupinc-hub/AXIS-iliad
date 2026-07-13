import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";

// ─── Request context (WeakMap — no leaks) ───────────────────────

const REQUEST_IDS = new WeakMap<ServerResponse, string>();
const REQUEST_STARTS = new WeakMap<ServerResponse, number>();

export function initRequest(res: ServerResponse): string {
  const id = randomUUID();
  REQUEST_IDS.set(res, id);
  REQUEST_STARTS.set(res, Date.now());
  return id;
}

export function getRequestId(res: ServerResponse): string | undefined {
  return REQUEST_IDS.get(res);
}

export function getRequestStart(res: ServerResponse): number | undefined {
  return REQUEST_STARTS.get(res);
}

// ─── Structured error codes ────────────────────────────────────

export const ErrorCode = {
  // 400
  INVALID_JSON: "INVALID_JSON",
  MISSING_FIELD: "MISSING_FIELD",
  INVALID_FORMAT: "INVALID_FORMAT",
  FILE_INVALID: "FILE_INVALID",
  PATH_TRAVERSAL: "PATH_TRAVERSAL",
  INVALID_PROGRAM: "INVALID_PROGRAM",

  // 401
  AUTH_REQUIRED: "AUTH_REQUIRED",
  INVALID_KEY: "INVALID_KEY",

  // 403
  TIER_REQUIRED: "TIER_REQUIRED",
  FORBIDDEN: "FORBIDDEN",

  // 404
  NOT_FOUND: "NOT_FOUND",
  CONTEXT_PENDING: "CONTEXT_PENDING",

  // 409
  CONFLICT: "CONFLICT",

  // 413
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  BODY_TOO_LARGE: "BODY_TOO_LARGE",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  FILE_COUNT_EXCEEDED: "FILE_COUNT_EXCEEDED",

  // 422
  UNPROCESSABLE: "UNPROCESSABLE",

  // 402
  PAYMENT_REQUIRED: "PAYMENT_REQUIRED",
  // H2.5: previously-uncatalogued 402 slugs already live on the wire as the
  // `error` string (cashier.ts, versions.ts) — these give them a matching,
  // stable `error_code` without changing the human-readable `error` value.
  INSUFFICIENT_CREDITS: "INSUFFICIENT_CREDITS",
  SETTLEMENT_UNCONFIRMED: "SETTLEMENT_UNCONFIRMED",
  PERSISTENCE_CREDITS_REQUIRED: "PERSISTENCE_CREDITS_REQUIRED",

  // 429
  RATE_LIMITED: "RATE_LIMITED",
  QUOTA_EXCEEDED: "QUOTA_EXCEEDED",
  SEAT_LIMIT: "SEAT_LIMIT",

  // 408
  TIMEOUT: "TIMEOUT",

  // 500
  INTERNAL_ERROR: "INTERNAL_ERROR",
  PROCESS_FAILED: "PROCESS_FAILED",

  // 502
  UPSTREAM_ERROR: "UPSTREAM_ERROR",
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

// ─── Error-code catalog (H4.2) ──────────────────────────────────
//
// Single source of truth for agent-facing error-code documentation — consumed
// by GET /v1/error-codes (handlers.ts), which /llms.txt and the web DocsPage
// both render from, instead of each hand-maintaining its own copy. Kept
// literally adjacent to ErrorCode so a new code can't be added without also
// documenting it (logging.test.ts asserts 1:1 coverage).
//
// `retryable` is deliberately NOT a claim about a wire field — no REST
// response in this API ships a `retryable` boolean today. It's editorial
// guidance for an agent deciding whether to retry, derived from HTTP-status
// convention and each code's real call sites.

export interface ErrorCodeCatalogEntry {
  code: ErrorCodeValue;
  /** Every HTTP status this code has been observed paired with (usually one; a few genuinely vary by call site). */
  statuses: number[];
  retryable: "yes" | "no" | "depends";
  retry_guidance: string;
  description: string;
}

export const ERROR_CODE_CATALOG: readonly ErrorCodeCatalogEntry[] = [
  { code: ErrorCode.INVALID_JSON, statuses: [400], retryable: "no",
    retry_guidance: "Fix the request body so it's valid JSON, then resend.",
    description: "The request body could not be parsed as JSON." },
  { code: ErrorCode.MISSING_FIELD, statuses: [400], retryable: "no",
    retry_guidance: "Add the missing required field and resend.",
    description: "A required field was absent from the request." },
  { code: ErrorCode.INVALID_FORMAT, statuses: [400], retryable: "no",
    retry_guidance: "Correct the field's format (see the message for specifics) and resend.",
    description: "A field was present but malformed or out of range." },
  { code: ErrorCode.FILE_INVALID, statuses: [400], retryable: "no",
    retry_guidance: "Fix the file object — every entry needs path and content — and resend.",
    description: "An uploaded file object is missing path or content." },
  { code: ErrorCode.PATH_TRAVERSAL, statuses: [400], retryable: "no",
    retry_guidance: "Use a file path relative to the project root with no .. segments.",
    description: "A file path attempted to escape the analysis sandbox." },
  { code: ErrorCode.INVALID_PROGRAM, statuses: [400], retryable: "no",
    retry_guidance: "Use one of the documented program names.",
    description: "An unknown program name was passed to an entitlement or toggle call." },
  { code: ErrorCode.AUTH_REQUIRED, statuses: [401], retryable: "no",
    retry_guidance: "Add Authorization: Bearer <api_key> and resend.",
    description: "No Authorization header was present." },
  { code: ErrorCode.INVALID_KEY, statuses: [401], retryable: "no",
    retry_guidance: "The API key is invalid or was revoked — get a new one via POST /v1/accounts or the account's key settings.",
    description: "The supplied API key doesn't match a live account." },
  { code: ErrorCode.TIER_REQUIRED, statuses: [402, 403], retryable: "no",
    retry_guidance: "Upgrade tier (see checkout_url/upgrade_url in the response) or use a free-tier program instead.",
    description: "The account's tier can't access this program or feature. Paid-program calls return 402 (payable in the same call); other entitlement gates return 403." },
  { code: ErrorCode.FORBIDDEN, statuses: [403], retryable: "no",
    retry_guidance: "This resource isn't available to the authenticated account — verify you're using the right account or key.",
    description: "Authenticated, but not entitled to this specific resource." },
  { code: ErrorCode.NOT_FOUND, statuses: [404], retryable: "no",
    retry_guidance: "Check the ID or path — the resource doesn't exist, or isn't owned by this account.",
    description: "The requested resource doesn't exist, or belongs to a different account." },
  { code: ErrorCode.CONTEXT_PENDING, statuses: [404], retryable: "yes",
    retry_guidance: "Wait a moment and retry — the snapshot exists but its context map hasn't finished generating.",
    description: "A snapshot was found but context generation hasn't been run yet." },
  { code: ErrorCode.CONFLICT, statuses: [409], retryable: "no",
    retry_guidance: "Resolve the conflict described in the message (e.g. use a different email) and resend.",
    description: "The request conflicts with existing state." },
  { code: ErrorCode.PAYLOAD_TOO_LARGE, statuses: [], retryable: "no",
    retry_guidance: "Reserved — not currently produced by any endpoint. If encountered, treat like FILE_TOO_LARGE/BODY_TOO_LARGE.",
    description: "Defined for future use; the current request-body-size condition uses BODY_TOO_LARGE instead." },
  { code: ErrorCode.BODY_TOO_LARGE, statuses: [413], retryable: "no",
    retry_guidance: "Reduce the request body below 50 MB and resend.",
    description: "The raw request body exceeded the server's size ceiling." },
  { code: ErrorCode.FILE_TOO_LARGE, statuses: [413], retryable: "no",
    retry_guidance: "Reduce the file size to fit the account's tier cap.",
    description: "A single submitted file exceeded the tier's byte cap." },
  { code: ErrorCode.FILE_COUNT_EXCEEDED, statuses: [413], retryable: "no",
    retry_guidance: "Submit fewer files, or upgrade tier for a higher file-count cap.",
    description: "Too many files were submitted for the account's tier." },
  { code: ErrorCode.UNPROCESSABLE, statuses: [422], retryable: "no",
    retry_guidance: "The input was well-formed but unusable (e.g. no source files found) — fix the content and resend.",
    description: "Semantically invalid input that passed basic validation." },
  { code: ErrorCode.PAYMENT_REQUIRED, statuses: [402], retryable: "no",
    retry_guidance: "Provide payment (see the response's checkout_url/price fields) to complete this entitlement change.",
    description: "A self-serve entitlement change (account creation, upgrade, credit purchase) needs payment at a non-free tier." },
  { code: ErrorCode.INSUFFICIENT_CREDITS, statuses: [402], retryable: "depends",
    retry_guidance: "Top up the account's credit balance, then retry.",
    description: "The account's credit balance is too low to cover this call." },
  { code: ErrorCode.SETTLEMENT_UNCONFIRMED, statuses: [402], retryable: "depends",
    retry_guidance: "Check whether the original charge landed before retrying — a naive retry can double-charge.",
    description: "Payment settlement couldn't be confirmed; a compensation entry was recorded in case the original charge succeeds asynchronously." },
  { code: ErrorCode.PERSISTENCE_CREDITS_REQUIRED, statuses: [402], retryable: "depends",
    retry_guidance: "Purchase more persistence credits (version-diffing operations), then retry.",
    description: "The account exhausted its persistence-operation credits." },
  { code: ErrorCode.RATE_LIMITED, statuses: [429], retryable: "yes",
    retry_guidance: "Wait for the window named in retry_after (or the Retry-After header, when present) before retrying.",
    description: "Either the per-IP anti-abuse throttle fired, or an upstream rate limit (e.g. GitHub's) was passed through." },
  { code: ErrorCode.QUOTA_EXCEEDED, statuses: [429], retryable: "yes",
    retry_guidance: "Wait for the monthly quota to reset, or upgrade tier for a higher quota.",
    description: "The account's monthly snapshot or resource quota was reached." },
  { code: ErrorCode.SEAT_LIMIT, statuses: [429], retryable: "no",
    retry_guidance: "Remove a seat or upgrade tier for a higher seat cap.",
    description: "The team's seat count exceeds what the tier allows." },
  { code: ErrorCode.TIMEOUT, statuses: [408], retryable: "yes",
    retry_guidance: "Retry the request; if it keeps timing out, reduce the payload size.",
    description: "The request exceeded the server's timeout budget." },
  { code: ErrorCode.INTERNAL_ERROR, statuses: [500, 502, 503], retryable: "depends",
    retry_guidance: "500/502: retry later, or contact support if it persists. 503: the integration usually isn't provisioned yet on the server — retrying won't help until that changes.",
    description: "Catch-all server error. 503 sites are typically an unconfigured integration rather than a crash." },
  { code: ErrorCode.PROCESS_FAILED, statuses: [500], retryable: "depends",
    retry_guidance: "Retry once; if it fails again with the same input, the input likely triggered a real bug worth reporting.",
    description: "The internal generation or processing pipeline threw." },
  { code: ErrorCode.UPSTREAM_ERROR, statuses: [502], retryable: "yes",
    retry_guidance: "Retry after a short delay — a third-party dependency (e.g. GitHub, the payment processor) failed or rejected the call.",
    description: "A third-party dependency failed or rejected the request." },
];

// ─── Structured logging ────────────────────────────────────────

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getMinLevel(): LogLevel {
  const env = (process.env.LOG_LEVEL ?? "info").toLowerCase() as LogLevel;
  return LOG_LEVEL_PRIORITY[env] !== undefined ? env : "info";
}

export function shouldEmitRuntimeLogs(): boolean {
  return process.env.VITEST !== "true" || process.env.AXIS_ENABLE_TEST_LOGS === "1";
}

export function log(
  level: LogLevel,
  message: string,
  data?: Record<string, unknown>,
): void {
  if (!shouldEmitRuntimeLogs()) return;
  if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[getMinLevel()]) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    msg: message,
    ...data,
  };
  const line = JSON.stringify(entry) + "\n";
  if (level === "error") {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
}
