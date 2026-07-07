// ─── TAP (Token Action Protocol) token-lifecycle messages ─────────
//
// Scope honesty: TAP has no public wire schema this package can conform
// against — this message shape is MODELED from public descriptions of
// network-tokenization lifecycles (Visa VTS / Mastercard MDES provision /
// activate / suspend / resume / delete). Encode/decode/validate/sign/verify
// are real; "TAP interoperability" here means "produces and verifies
// well-formed signed messages matching this modeled shape," not certified
// conformance to an official TAP specification.

import type { KeyObject } from "node:crypto";
import { canonicalize } from "./canonical.js";
import { signDetached, verifyDetached, type DetachedJws } from "./jws.js";
import { type ValidationIssue, type ValidationResult, pushIssue, isNonEmptyString, isIsoTimestamp } from "./types.js";

export type TapEvent = "provision" | "activate" | "suspend" | "resume" | "delete";
const TAP_EVENTS: readonly TapEvent[] = ["provision", "activate", "suspend", "resume", "delete"];

export interface TapTokenMessage {
  kind: "tap.token";
  version: "tap/1";
  token_id: string;
  event: TapEvent;
  token_requestor_id: string;
  dpan_last4: string;
  mandate_ref?: string;
  occurred_at: string;
}

export interface SignedTapMessage {
  message: TapTokenMessage;
  jws: DetachedJws;
  public_key: string;
}

export class TapDecodeError extends Error {
  issues: ValidationIssue[];
  constructor(message: string, issues: ValidationIssue[] = []) {
    super(message);
    this.name = "TapDecodeError";
    this.issues = issues;
  }
}

const DPAN_LAST4_RE = /^\d{4}$/;

export function validateTapMessage(m: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (typeof m !== "object" || m === null || Array.isArray(m)) {
    return { valid: false, issues: [{ path: "", message: "message must be an object" }] };
  }
  const obj = m as Record<string, unknown>;

  if (obj.kind !== "tap.token") pushIssue(issues, "kind", 'must be exactly "tap.token"');
  if (obj.version !== "tap/1") pushIssue(issues, "version", 'must be exactly "tap/1"');
  if (!isNonEmptyString(obj.token_id)) pushIssue(issues, "token_id", "must be a non-empty string");
  if (!TAP_EVENTS.includes(obj.event as TapEvent)) {
    pushIssue(issues, "event", `must be one of ${TAP_EVENTS.map((e) => `"${e}"`).join(" | ")}`);
  }
  if (!isNonEmptyString(obj.token_requestor_id)) pushIssue(issues, "token_requestor_id", "must be a non-empty string");
  if (typeof obj.dpan_last4 !== "string" || !DPAN_LAST4_RE.test(obj.dpan_last4)) {
    pushIssue(issues, "dpan_last4", "must be a 4-digit string");
  }
  if (obj.mandate_ref !== undefined && typeof obj.mandate_ref !== "string") {
    pushIssue(issues, "mandate_ref", "must be a string when present");
  }
  if (!isIsoTimestamp(obj.occurred_at)) pushIssue(issues, "occurred_at", "must be an ISO 8601 timestamp");

  return { valid: issues.length === 0, issues };
}

export function encodeTapMessage(m: TapTokenMessage): string {
  return canonicalize(m);
}

export function decodeTapMessage(json: string): TapTokenMessage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new TapDecodeError(`TapDecodeError: invalid JSON (${err instanceof Error ? err.message : String(err)})`);
  }
  const result = validateTapMessage(parsed);
  if (!result.valid) {
    throw new TapDecodeError(
      `TapDecodeError: message failed validation (${result.issues.length} issue(s): ${result.issues.map((i) => `${i.path || "<root>"}: ${i.message}`).join("; ")})`,
      result.issues,
    );
  }
  return parsed as TapTokenMessage;
}

export function signTapMessage(m: TapTokenMessage, priv: KeyObject, pubSpkiB64: string): SignedTapMessage {
  return { message: m, jws: signDetached(m, priv), public_key: pubSpkiB64 };
}

export function verifyTapMessage(s: SignedTapMessage): ValidationResult {
  const structural = validateTapMessage(s.message);
  if (!structural.valid) return structural;
  if (!verifyDetached(s.message, s.jws, s.public_key)) {
    return { valid: false, issues: [{ path: "jws", message: "detached JWS signature verification failed" }] };
  }
  return { valid: true, issues: [] };
}
