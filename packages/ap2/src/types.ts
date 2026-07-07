// ─── Shared wire types for AP2 / TAP / UCP ────────────────────────

/** ISO 4217 currency + a DECIMAL STRING value — never a float. Keeping money
 *  as a string is what lets canonical.ts sidestep full RFC 8785 float
 *  serialization (see canonical.ts's header comment). */
export interface MoneyAmount {
  currency: string;
  value: string;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface CartItem {
  sku: string;
  name: string;
  quantity: number;
  unit_price: MoneyAmount;
}

// ─── Shared validation helpers (used by ap2.ts / tap.ts / ucp.ts) ─

const ISO4217_RE = /^[A-Z]{3}$/;
const DECIMAL_RE = /^-?\d+(\.\d+)?$/;
// Loose ISO8601 check — enough to reject "not a date" without pulling in a
// date library; Date.parse handles the real calendar-validity heavy lifting.
const ISO8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function pushIssue(issues: ValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

export function isIsoTimestamp(v: unknown): v is string {
  return typeof v === "string" && ISO8601_RE.test(v) && !Number.isNaN(Date.parse(v));
}

/** Validate a MoneyAmount's shape (does NOT check it against other amounts). */
export function validateMoneyAmount(v: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    pushIssue(issues, path, "must be an object with { currency, value }");
    return;
  }
  const m = v as Record<string, unknown>;
  if (typeof m.currency !== "string" || !ISO4217_RE.test(m.currency)) {
    pushIssue(issues, `${path}.currency`, "must be a 3-letter uppercase ISO 4217 currency code");
  }
  if (typeof m.value !== "string" || !DECIMAL_RE.test(m.value)) {
    pushIssue(issues, `${path}.value`, "must be a decimal string (e.g. \"12.34\"), not a number");
  }
}

// ─── Exact decimal-string arithmetic (BigInt-scaled, no floats) ───

function decimalScale(v: string): number {
  const i = v.indexOf(".");
  return i === -1 ? 0 : v.length - i - 1;
}

function toScaledBigInt(v: string, scale: number): bigint {
  const neg = v.startsWith("-");
  const unsigned = neg ? v.slice(1) : v;
  const [intPart, fracPart = ""] = unsigned.split(".");
  const paddedFrac = (fracPart + "0".repeat(scale)).slice(0, scale);
  const digits = `${intPart || "0"}${paddedFrac}`;
  const n = BigInt(digits);
  return neg ? -n : n;
}

/**
 * Exact equality of two decimal-string MoneyAmounts' `value`s, independent of
 * trailing-zero formatting ("5" === "5.00"). Does NOT compare currency.
 */
export function moneyValuesEqual(a: string, b: string): boolean {
  if (!DECIMAL_RE.test(a) || !DECIMAL_RE.test(b)) return false;
  const scale = Math.max(decimalScale(a), decimalScale(b));
  return toScaledBigInt(a, scale) === toScaledBigInt(b, scale);
}

/**
 * Sum `quantity * unit_price.value` across cart items as EXACT decimal
 * arithmetic (BigInt-scaled — never floats), returned as a decimal string at
 * the same scale as the widest input. Throws if any quantity is not a
 * non-negative integer or any unit_price.value isn't a valid decimal string.
 */
export function sumCartItems(items: CartItem[]): string {
  const scale = Math.max(2, ...items.map((i) => decimalScale(i.unit_price.value)));
  let total = 0n;
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 0) {
      throw new Error(`sumCartItems: quantity must be a non-negative integer (got ${item.quantity})`);
    }
    if (!DECIMAL_RE.test(item.unit_price.value)) {
      throw new Error(`sumCartItems: invalid unit_price.value "${item.unit_price.value}"`);
    }
    total += toScaledBigInt(item.unit_price.value, scale) * BigInt(item.quantity);
  }
  const negative = total < 0n;
  const digits = (negative ? -total : total).toString().padStart(scale + 1, "0");
  const intPart = digits.slice(0, digits.length - scale) || "0";
  const fracPart = scale > 0 ? "." + digits.slice(digits.length - scale) : "";
  return `${negative ? "-" : ""}${intPart}${fracPart}`;
}
