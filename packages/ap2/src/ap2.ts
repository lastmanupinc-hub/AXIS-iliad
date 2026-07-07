// ─── AP2 Intent / Cart / Payment mandates ─────────────────────────
//
// Scope honesty (see README.md): these codecs are conformant to OUR
// TypeScript encoding of the public AP2 mandate schema, verified against
// self-authored frozen golden vectors — NOT certified against AP2's official
// conformance suite or a live counterparty. "Interoperability" here means
// "produces and verifies well-formed, cryptographically-signed messages
// matching this modeled schema," not "certified network interoperability."

import type { KeyObject } from "node:crypto";
import { canonicalize } from "./canonical.js";
import { signDetached, verifyDetached, type DetachedJws } from "./jws.js";
import {
  type MoneyAmount,
  type ValidationIssue,
  type ValidationResult,
  type CartItem,
  pushIssue,
  isNonEmptyString,
  isIsoTimestamp,
  validateMoneyAmount,
  moneyValuesEqual,
  sumCartItems,
} from "./types.js";

export interface IntentMandate {
  kind: "intent";
  version: "ap2/1";
  id: string;
  user_id: string;
  description: string;
  constraints: { max_amount: MoneyAmount; allowed_merchants?: string[] };
  created_at: string;
  expires_at: string;
}

export interface CartMandate {
  kind: "cart";
  version: "ap2/1";
  id: string;
  intent_ref: string;
  merchant_id: string;
  items: CartItem[];
  total: MoneyAmount;
  created_at: string;
}

export interface PaymentMandate {
  kind: "payment";
  version: "ap2/1";
  id: string;
  cart_ref: string;
  method: { type: "card" | "bank" | "token"; token_ref?: string };
  amount: MoneyAmount;
  created_at: string;
}

export type Mandate = IntentMandate | CartMandate | PaymentMandate;

export interface SignedMandate<M extends Mandate = Mandate> {
  mandate: M;
  jws: DetachedJws;
  public_key: string;
}

/** Optional cross-reference context — lets validateMandate check a CartMandate's
 *  `intent_ref` against the IntentMandate it claims to descend from. Structural
 *  checks (required fields/enums/shapes/cart total) work without it. */
export interface MandateValidationContext {
  intent?: IntentMandate;
}

export class Ap2DecodeError extends Error {
  issues: ValidationIssue[];
  constructor(message: string, issues: ValidationIssue[] = []) {
    super(message);
    this.name = "Ap2DecodeError";
    this.issues = issues;
  }
}

function validateIntent(m: Record<string, unknown>, issues: ValidationIssue[]): void {
  if (!isNonEmptyString(m.user_id)) pushIssue(issues, "user_id", "must be a non-empty string");
  if (typeof m.description !== "string") pushIssue(issues, "description", "must be a string");
  if (typeof m.constraints !== "object" || m.constraints === null || Array.isArray(m.constraints)) {
    pushIssue(issues, "constraints", "must be an object with { max_amount }");
  } else {
    const c = m.constraints as Record<string, unknown>;
    validateMoneyAmount(c.max_amount, "constraints.max_amount", issues);
    if (c.allowed_merchants !== undefined) {
      if (!Array.isArray(c.allowed_merchants) || c.allowed_merchants.some((x) => typeof x !== "string")) {
        pushIssue(issues, "constraints.allowed_merchants", "must be an array of strings when present");
      }
    }
  }
  if (!isIsoTimestamp(m.expires_at)) pushIssue(issues, "expires_at", "must be an ISO 8601 timestamp");
}

function validateCart(m: Record<string, unknown>, issues: ValidationIssue[], ctx?: MandateValidationContext): void {
  if (!isNonEmptyString(m.intent_ref)) pushIssue(issues, "intent_ref", "must be a non-empty string");
  if (!isNonEmptyString(m.merchant_id)) pushIssue(issues, "merchant_id", "must be a non-empty string");

  const items = m.items;
  if (!Array.isArray(items) || items.length === 0) {
    pushIssue(issues, "items", "must be a non-empty array of cart items");
  } else {
    items.forEach((raw, i) => {
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        pushIssue(issues, `items[${i}]`, "must be an object");
        return;
      }
      const item = raw as Record<string, unknown>;
      if (!isNonEmptyString(item.sku)) pushIssue(issues, `items[${i}].sku`, "must be a non-empty string");
      if (!isNonEmptyString(item.name)) pushIssue(issues, `items[${i}].name`, "must be a non-empty string");
      if (typeof item.quantity !== "number" || !Number.isInteger(item.quantity) || item.quantity <= 0) {
        pushIssue(issues, `items[${i}].quantity`, "must be a positive integer");
      }
      validateMoneyAmount(item.unit_price, `items[${i}].unit_price`, issues);
    });
  }

  validateMoneyAmount(m.total, "total", issues);

  // Only attempt the arithmetic cross-check once every input it needs is
  // individually well-formed — otherwise sumCartItems() throws on garbage
  // (e.g. a non-integer quantity already reported above) and we'd double-report.
  if (
    issues.length === 0 &&
    Array.isArray(items) &&
    items.length > 0 &&
    typeof m.total === "object" &&
    m.total !== null
  ) {
    const total = m.total as MoneyAmount;
    let sum: string;
    try {
      sum = sumCartItems(items as CartItem[]);
    } catch (err) {
      pushIssue(issues, "items", `could not compute cart total: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    if (!moneyValuesEqual(sum, total.value)) {
      pushIssue(issues, "total.value", `total (${total.value}) does not equal sum(items.unit_price * quantity) (${sum})`);
    }
  }

  if (ctx?.intent && isNonEmptyString(m.intent_ref) && m.intent_ref !== ctx.intent.id) {
    pushIssue(issues, "intent_ref", `does not match the linked IntentMandate id "${ctx.intent.id}" (cross-reference failure)`);
  }
}

function validatePayment(m: Record<string, unknown>, issues: ValidationIssue[]): void {
  if (!isNonEmptyString(m.cart_ref)) pushIssue(issues, "cart_ref", "must be a non-empty string");
  const method = m.method;
  if (typeof method !== "object" || method === null || Array.isArray(method)) {
    pushIssue(issues, "method", "must be an object with { type }");
  } else {
    const mm = method as Record<string, unknown>;
    if (mm.type !== "card" && mm.type !== "bank" && mm.type !== "token") {
      pushIssue(issues, "method.type", 'must be one of "card" | "bank" | "token"');
    }
    if (mm.token_ref !== undefined && typeof mm.token_ref !== "string") {
      pushIssue(issues, "method.token_ref", "must be a string when present");
    }
  }
  validateMoneyAmount(m.amount, "amount", issues);
}

/**
 * Structural + cross-reference validation for a Mandate of unknown shape.
 * Checks: kind/version discriminants, required fields, enums, MoneyAmount
 * shapes, and — for a cart — that `total` equals the exact decimal sum of
 * `items[].unit_price * quantity`. Pass `ctx.intent` to additionally check a
 * CartMandate's `intent_ref` against the IntentMandate it claims to descend
 * from (cross-reference validation) — omitted, that check is skipped.
 * Never throws; always returns a ValidationResult.
 */
export function validateMandate(m: unknown, ctx?: MandateValidationContext): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (typeof m !== "object" || m === null || Array.isArray(m)) {
    return { valid: false, issues: [{ path: "", message: "mandate must be an object" }] };
  }
  const obj = m as Record<string, unknown>;

  if (obj.kind !== "intent" && obj.kind !== "cart" && obj.kind !== "payment") {
    pushIssue(issues, "kind", 'must be one of "intent" | "cart" | "payment"');
  }
  if (obj.version !== "ap2/1") {
    pushIssue(issues, "version", 'must be exactly "ap2/1"');
  }
  if (!isNonEmptyString(obj.id)) {
    pushIssue(issues, "id", "must be a non-empty string");
  }
  if (!isIsoTimestamp(obj.created_at)) {
    pushIssue(issues, "created_at", "must be an ISO 8601 timestamp");
  }

  switch (obj.kind) {
    case "intent":
      validateIntent(obj, issues);
      break;
    case "cart":
      validateCart(obj, issues, ctx);
      break;
    case "payment":
      validatePayment(obj, issues);
      break;
    default:
      // Unknown/missing kind already reported above; no per-kind checks to run.
      break;
  }

  return { valid: issues.length === 0, issues };
}

/** = canonicalize(m) — the exact wire bytes for this mandate. */
export function encodeMandate(m: Mandate): string {
  return canonicalize(m);
}

/** Parse + validate. Throws Ap2DecodeError on malformed JSON OR a
 *  structurally invalid mandate (never returns a mandate that fails
 *  validateMandate). */
export function decodeMandate(json: string): Mandate {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new Ap2DecodeError(`Ap2DecodeError: invalid JSON (${err instanceof Error ? err.message : String(err)})`);
  }
  const result = validateMandate(parsed);
  if (!result.valid) {
    throw new Ap2DecodeError(
      `Ap2DecodeError: mandate failed validation (${result.issues.length} issue(s): ${result.issues.map((i) => `${i.path || "<root>"}: ${i.message}`).join("; ")})`,
      result.issues,
    );
  }
  return parsed as Mandate;
}

/** Sign `m` with a detached JWS (EdDSA/Ed25519), embedding `pubSpkiB64` as the
 *  message's `public_key` field (see jws.ts for the trust-model caveat). */
export function signMandate<M extends Mandate>(m: M, priv: KeyObject, pubSpkiB64: string): SignedMandate<M> {
  return { mandate: m, jws: signDetached(m, priv), public_key: pubSpkiB64 };
}

/**
 * Verify a SignedMandate: structural validation of `s.mandate` AND detached-JWS
 * signature verification using `s.public_key`. Only proves the mandate is
 * INTERNALLY consistent (see jws.ts's trust-model note) — pin a known-good key
 * out of band to trust a specific signer's identity. Never throws.
 */
export function verifyMandate(s: SignedMandate, ctx?: MandateValidationContext): ValidationResult {
  const structural = validateMandate(s.mandate, ctx);
  if (!structural.valid) return structural;
  if (!verifyDetached(s.mandate, s.jws, s.public_key)) {
    return { valid: false, issues: [{ path: "jws", message: "detached JWS signature verification failed" }] };
  }
  return { valid: true, issues: [] };
}
