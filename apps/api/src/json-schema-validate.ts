// ─── E8 Constrained Inference: JSON-schema validator ────────────
//
// iliad_llm_inference's engineer mode constrains decoding to a JSON schema (via
// node-llama-cpp's grammar) AND validates the output against the same schema —
// this module is the deterministic "guaranteed-valid" verifier (the grammar is
// best-effort + model-dependent; this is the guarantee). Pure, dependency-free.
// A practical subset of JSON Schema draft 2020-12: type, required, properties,
// additionalProperties, enum, const, items, min/maxItems, minimum/maximum,
// min/maxLength. (No `pattern` — a caller-supplied regex is a ReDoS surface.)

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const MAX_DEPTH = 64;

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v; // "string" | "number" | "boolean" | "object" | "undefined"
}

function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function validate(value: unknown, schema: unknown, path: string, errors: string[], depth: number): void {
  if (depth > MAX_DEPTH) {
    errors.push(`${path}: schema nesting exceeds ${MAX_DEPTH}`);
    return;
  }
  // A boolean/absent schema accepts anything (JSON Schema `true`).
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return;
  const s = schema as Record<string, unknown>;

  if ("const" in s && !eq(value, s.const)) {
    errors.push(`${path}: must equal const`);
  }
  if (Array.isArray(s.enum) && !s.enum.some((e) => eq(e, value))) {
    errors.push(`${path}: not one of the allowed enum values`);
  }

  const t = typeOf(value);
  if (s.type !== undefined) {
    const types = Array.isArray(s.type) ? s.type : [s.type];
    const ok = types.some((tt) => tt === t || (tt === "integer" && t === "number" && Number.isInteger(value as number)));
    if (!ok) {
      errors.push(`${path}: expected type ${types.join("|")}, got ${t}`);
      return; // type mismatch — further keyword checks are meaningless
    }
  }

  if (t === "string") {
    const str = value as string;
    if (typeof s.minLength === "number" && str.length < s.minLength) errors.push(`${path}: shorter than minLength ${s.minLength}`);
    if (typeof s.maxLength === "number" && str.length > s.maxLength) errors.push(`${path}: longer than maxLength ${s.maxLength}`);
  } else if (t === "number") {
    const n = value as number;
    if (!Number.isFinite(n)) errors.push(`${path}: must be a finite number`); // reject NaN/Infinity
    if (typeof s.minimum === "number" && n < s.minimum) errors.push(`${path}: below minimum ${s.minimum}`);
    if (typeof s.maximum === "number" && n > s.maximum) errors.push(`${path}: above maximum ${s.maximum}`);
  } else if (t === "array") {
    const arr = value as unknown[];
    if (typeof s.minItems === "number" && arr.length < s.minItems) errors.push(`${path}: fewer than minItems ${s.minItems}`);
    if (typeof s.maxItems === "number" && arr.length > s.maxItems) errors.push(`${path}: more than maxItems ${s.maxItems}`);
    if (s.items && typeof s.items === "object") {
      arr.forEach((item, i) => validate(item, s.items, `${path}[${i}]`, errors, depth + 1));
    }
  } else if (t === "object") {
    const obj = value as Record<string, unknown>;
    // OWN-property semantics throughout — `key in obj` would walk the prototype
    // chain, so a model emitting {"__proto__":…} or a schema requiring
    // "constructor"/"toString" would falsely pass (a valid:true on invalid data).
    const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
    if (Array.isArray(s.required)) {
      for (const key of s.required) {
        if (typeof key === "string" && !has(obj, key)) errors.push(`${path}.${key}: required property missing`);
      }
    }
    const props = s.properties && typeof s.properties === "object" ? (s.properties as Record<string, unknown>) : {};
    for (const [key, sub] of Object.entries(props)) {
      if (has(obj, key)) validate(obj[key], sub, `${path}.${key}`, errors, depth + 1);
    }
    if (s.additionalProperties === false) {
      for (const key of Object.keys(obj)) {
        if (!has(props, key)) errors.push(`${path}.${key}: additional property not allowed`);
      }
    }
  }
}

/** Validate `value` against a (subset) JSON Schema. Pure; never throws. */
export function validateAgainstSchema(value: unknown, schema: unknown): ValidationResult {
  const errors: string[] = [];
  validate(value, schema, "$", errors, 0);
  return { valid: errors.length === 0, errors };
}

/**
 * Extract + parse the first JSON object/array from model text. With grammar
 * constraint the whole output is JSON, but this is defensive for the fallback /
 * unconstrained path. Returns undefined if nothing parses. Never throws.
 */
export function parseJsonOutput(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    /* not bare JSON — try to slice a span */
  }
  const firstObj = text.indexOf("{");
  const firstArr = text.indexOf("[");
  const start = firstObj === -1 ? firstArr : firstArr === -1 ? firstObj : Math.min(firstObj, firstArr);
  if (start === -1) return undefined;
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  const end = text.lastIndexOf(close);
  if (end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

/**
 * Parse + validate model output against a schema in one step — the engineer-mode
 * "guaranteed-valid" check. parsed=undefined + valid=false when the text isn't
 * parseable JSON.
 */
export function validateStructuredOutput(text: string, schema: unknown): { parsed: unknown; valid: boolean; errors: string[] } {
  const parsed = parseJsonOutput(text);
  if (parsed === undefined) {
    return { parsed: undefined, valid: false, errors: ["model output did not contain parseable JSON"] };
  }
  const { valid, errors } = validateAgainstSchema(parsed, schema);
  return { parsed, valid, errors };
}

/** Shallow well-formedness check on a caller-supplied schema (object with a
 *  recognized shape). Rejects obviously-bad schemas before constraining a decode. */
export function isUsableSchema(schema: unknown): boolean {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return false;
  const s = schema as Record<string, unknown>;
  // Must declare at least a type, properties, enum, const, or items to be useful.
  return (
    s.type !== undefined ||
    s.properties !== undefined ||
    s.enum !== undefined ||
    "const" in s ||
    s.items !== undefined
  );
}
