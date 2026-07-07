// ─── UCP (Universal Commerce Protocol) settlement messages ────────
//
// Scope honesty: UCP, like TAP, has no public wire schema this package can
// conform against — this message shape is MODELED from public descriptions of
// card-network / ACH / SEPA settlement instructions. Encode/decode/validate/
// sign/verify are real; "UCP interoperability" here means "produces and
// verifies well-formed signed messages matching this modeled shape," not
// certified conformance to an official UCP specification.

import type { KeyObject } from "node:crypto";
import { canonicalize } from "./canonical.js";
import { signDetached, verifyDetached, type DetachedJws } from "./jws.js";
import {
  type MoneyAmount,
  type ValidationIssue,
  type ValidationResult,
  pushIssue,
  isNonEmptyString,
  isIsoTimestamp,
  validateMoneyAmount,
} from "./types.js";

export type ClearingSystem = "VISA_NET" | "MASTERCARD_CLEARING" | "ACH" | "SEPA_SCT";
const CLEARING_SYSTEMS: readonly ClearingSystem[] = ["VISA_NET", "MASTERCARD_CLEARING", "ACH", "SEPA_SCT"];

export type SettlementFinality = "pending" | "final";
const SETTLEMENT_FINALITIES: readonly SettlementFinality[] = ["pending", "final"];

export interface UcpSettlementMessage {
  kind: "ucp.settlement";
  version: "ucp/1";
  settlement_id: string;
  payment_ref: string;
  clearing_system: ClearingSystem;
  amount: MoneyAmount;
  value_date: string;
  settlement_finality: SettlementFinality;
}

export interface SignedUcpMessage {
  message: UcpSettlementMessage;
  jws: DetachedJws;
  public_key: string;
}

export class UcpDecodeError extends Error {
  issues: ValidationIssue[];
  constructor(message: string, issues: ValidationIssue[] = []) {
    super(message);
    this.name = "UcpDecodeError";
    this.issues = issues;
  }
}

// value_date is a calendar date (no time component) — YYYY-MM-DD.
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateUcpMessage(m: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (typeof m !== "object" || m === null || Array.isArray(m)) {
    return { valid: false, issues: [{ path: "", message: "message must be an object" }] };
  }
  const obj = m as Record<string, unknown>;

  if (obj.kind !== "ucp.settlement") pushIssue(issues, "kind", 'must be exactly "ucp.settlement"');
  if (obj.version !== "ucp/1") pushIssue(issues, "version", 'must be exactly "ucp/1"');
  if (!isNonEmptyString(obj.settlement_id)) pushIssue(issues, "settlement_id", "must be a non-empty string");
  if (!isNonEmptyString(obj.payment_ref)) pushIssue(issues, "payment_ref", "must be a non-empty string");
  if (!CLEARING_SYSTEMS.includes(obj.clearing_system as ClearingSystem)) {
    pushIssue(issues, "clearing_system", `must be one of ${CLEARING_SYSTEMS.map((c) => `"${c}"`).join(" | ")}`);
  }
  validateMoneyAmount(obj.amount, "amount", issues);
  if (typeof obj.value_date !== "string" || !DATE_ONLY_RE.test(obj.value_date) || Number.isNaN(Date.parse(obj.value_date))) {
    pushIssue(issues, "value_date", "must be a YYYY-MM-DD calendar date");
  }
  if (!SETTLEMENT_FINALITIES.includes(obj.settlement_finality as SettlementFinality)) {
    pushIssue(issues, "settlement_finality", `must be one of ${SETTLEMENT_FINALITIES.map((f) => `"${f}"`).join(" | ")}`);
  }

  return { valid: issues.length === 0, issues };
}

export function encodeUcpMessage(m: UcpSettlementMessage): string {
  return canonicalize(m);
}

export function decodeUcpMessage(json: string): UcpSettlementMessage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new UcpDecodeError(`UcpDecodeError: invalid JSON (${err instanceof Error ? err.message : String(err)})`);
  }
  const result = validateUcpMessage(parsed);
  if (!result.valid) {
    throw new UcpDecodeError(
      `UcpDecodeError: message failed validation (${result.issues.length} issue(s): ${result.issues.map((i) => `${i.path || "<root>"}: ${i.message}`).join("; ")})`,
      result.issues,
    );
  }
  return parsed as UcpSettlementMessage;
}

export function signUcpMessage(m: UcpSettlementMessage, priv: KeyObject, pubSpkiB64: string): SignedUcpMessage {
  return { message: m, jws: signDetached(m, priv), public_key: pubSpkiB64 };
}

export function verifyUcpMessage(s: SignedUcpMessage): ValidationResult {
  const structural = validateUcpMessage(s.message);
  if (!structural.valid) return structural;
  if (!verifyDetached(s.message, s.jws, s.public_key)) {
    return { valid: false, issues: [{ path: "jws", message: "detached JWS signature verification failed" }] };
  }
  return { valid: true, issues: [] };
}
