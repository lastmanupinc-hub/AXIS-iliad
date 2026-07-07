// ─── RFC 8785 JSON Canonicalization Scheme (JCS) — scoped ─────────
//
// Full JCS requires ECMAScript "shortest round-trip" serialization of ANY
// IEEE-754 double, which is genuinely hard to get byte-perfect. This domain
// sidesteps that entirely: money is represented as decimal STRINGS
// (MoneyAmount.value), and every other numeric field in the AP2/TAP/UCP
// message shapes (quantity, priority, etc.) is an INTEGER. So this
// canonicalizer implements JCS's actual invariants — sorted object keys
// (by UTF-16 code unit, matching JS's default string sort), standard JSON
// string escaping, and no insignificant whitespace — restricted to strings,
// integers, booleans, null, arrays, and objects. Anything outside that
// (non-integer numbers, NaN, Infinity, undefined) throws rather than
// silently emitting a byte sequence that isn't actually canonical.

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** JSON.stringify already produces RFC 8259-compliant string escaping; JCS
 *  doesn't require anything beyond that for the string case. */
function encodeString(s: string): string {
  return JSON.stringify(s);
}

function encodeNumber(n: number): string {
  if (!Number.isFinite(n)) {
    throw new Error("canonicalize: non-finite numbers (NaN/Infinity) are not canonicalizable");
  }
  if (!Number.isInteger(n)) {
    throw new Error(
      "canonicalize: non-integer numbers are out of scope for this canonicalizer — represent money as a MoneyAmount decimal string, not a float",
    );
  }
  // Integers round-trip exactly through toString() with no exponent notation
  // and no trailing ".0" — and -0 normalizes to "0" (Number.prototype.toString
  // already does this in V8, but Object.is keeps the intent explicit).
  return Object.is(n, -0) ? "0" : n.toString(10);
}

function canon(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) {
    throw new Error("canonicalize: undefined is not representable in canonical JSON");
  }
  const t = typeof value;
  if (t === "boolean") return value ? "true" : "false";
  if (t === "string") return encodeString(value as string);
  if (t === "number") return encodeNumber(value as number);
  if (Array.isArray(value)) {
    return "[" + value.map((v) => canon(v)).join(",") + "]";
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return (
      "{" +
      keys.map((k) => `${encodeString(k)}:${canon(value[k])}`).join(",") +
      "}"
    );
  }
  throw new Error(`canonicalize: unsupported value type "${t}"`);
}

/**
 * Produce stable, byte-identical canonical JSON for a value — sorted object
 * keys at every depth, standard string escaping, no whitespace. Same logical
 * object (any key order, any clone) always canonicalizes to the same bytes.
 * Throws on undefined, NaN, Infinity, non-integer numbers, functions, and
 * other values with no canonical JSON representation in this domain's scope.
 */
export function canonicalize(value: unknown): string {
  return canon(value);
}
