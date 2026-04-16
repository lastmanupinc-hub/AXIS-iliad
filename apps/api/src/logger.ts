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
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  FILE_COUNT_EXCEEDED: "FILE_COUNT_EXCEEDED",

  // 422
  UNPROCESSABLE: "UNPROCESSABLE",

  // 402
  PAYMENT_REQUIRED: "PAYMENT_REQUIRED",

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
