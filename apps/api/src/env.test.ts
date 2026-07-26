import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  validateEnv,
  requireValidEnv,
  generateEnvExample,
  ENV_SPEC,
  type ValidationResult,
} from "./env.js";

const SRC_DIR = dirname(fileURLToPath(import.meta.url));

// ─── validateEnv ────────────────────────────────────────────────

describe("validateEnv", () => {
  it("returns valid with all defaults when env is empty", () => {
    const result = validateEnv({});
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.resolved.PORT).toBe("4000");
    expect(result.resolved.NODE_ENV).toBe("development");
    expect(result.resolved.LOG_LEVEL).toBe("info");
  });

  it("resolves explicitly set values", () => {
    const result = validateEnv({ PORT: "8080", NODE_ENV: "production" });
    expect(result.valid).toBe(true);
    expect(result.resolved.PORT).toBe("8080");
    expect(result.resolved.NODE_ENV).toBe("production");
  });

  it("rejects non-numeric PORT", () => {
    const result = validateEnv({ PORT: "abc" });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].key).toBe("PORT");
    expect(result.errors[0].message).toContain("valid number");
  });

  it("rejects negative number values", () => {
    const result = validateEnv({ RATE_LIMIT_WINDOW_MS: "-1000" });
    expect(result.valid).toBe(false);
    expect(result.errors[0].key).toBe("RATE_LIMIT_WINDOW_MS");
    expect(result.errors[0].message).toContain("non-negative");
  });

  it("rejects Infinity for number fields", () => {
    const result = validateEnv({ PORT: "Infinity" });
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain("valid number");
  });

  it("accepts zero for number fields", () => {
    const result = validateEnv({ PORT: "0" });
    expect(result.valid).toBe(true);
    expect(result.resolved.PORT).toBe("0");
  });

  it("treats empty string same as missing", () => {
    const result = validateEnv({ PORT: "" });
    expect(result.valid).toBe(true);
    expect(result.resolved.PORT).toBe("4000"); // gets default
  });

  it("applies defaults for all optional vars", () => {
    const result = validateEnv({});
    const optionalSpecs = ENV_SPEC.filter((s) => !s.required);
    for (const spec of optionalSpecs) {
      expect(result.resolved[spec.key]).toBe(spec.default ?? "");
    }
  });

  it("collects multiple errors at once", () => {
    const result = validateEnv({
      PORT: "notANumber",
      RATE_LIMIT_WINDOW_MS: "also-not",
      SHUTDOWN_TIMEOUT_MS: "-5",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
    const keys = result.errors.map((e) => e.key);
    expect(keys).toContain("PORT");
    expect(keys).toContain("RATE_LIMIT_WINDOW_MS");
    expect(keys).toContain("SHUTDOWN_TIMEOUT_MS");
  });

  it("all spec entries have key, type, and description", () => {
    for (const spec of ENV_SPEC) {
      expect(spec.key).toBeTruthy();
      expect(["string", "number", "boolean"]).toContain(spec.type);
      expect(spec.description.length).toBeGreaterThan(0);
    }
  });
});

// ─── requireValidEnv ────────────────────────────────────────────

describe("requireValidEnv", () => {
  it("returns resolved map on valid env", () => {
    const resolved = requireValidEnv({ PORT: "3000" });
    expect(resolved.PORT).toBe("3000");
    expect(resolved.NODE_ENV).toBe("development");
  });

  it("throws on invalid env", () => {
    expect(() => requireValidEnv({ PORT: "xyz" })).toThrow(
      "Environment validation failed",
    );
  });

  it("throw message contains all error details", () => {
    try {
      requireValidEnv({ PORT: "bad", RATE_LIMIT_WINDOW_MS: "nope" });
      expect.unreachable("should have thrown");
    } catch (e: unknown) {
      const msg = (e as Error).message;
      expect(msg).toContain("PORT");
      expect(msg).toContain("RATE_LIMIT_WINDOW_MS");
    }
  });
});

// ─── generateEnvExample ─────────────────────────────────────────

describe("generateEnvExample", () => {
  it("generates a string with all spec keys", () => {
    const example = generateEnvExample();
    for (const spec of ENV_SPEC) {
      expect(example).toContain(spec.key);
    }
  });

  it("includes descriptions as comments", () => {
    const example = generateEnvExample();
    for (const spec of ENV_SPEC) {
      expect(example).toContain(`# ${spec.description}`);
    }
  });

  it("includes default values", () => {
    const example = generateEnvExample();
    expect(example).toContain("PORT=4000");
    expect(example).toContain("NODE_ENV=development");
  });

  it("starts with header comment", () => {
    const example = generateEnvExample();
    expect(example.startsWith("#")).toBe(true);
    expect(example).toContain("Axis' Iliad");
  });
});

// ─── Branch coverage: boolean and required paths ────────────────

describe("validateEnv edge branches", () => {
  it("validates boolean-type spec entry (valid)", () => {
    // Temporarily add a boolean spec to exercise the boolean branch
    const original = [...ENV_SPEC];
    ENV_SPEC.push({
      key: "VERBOSE",
      required: false,
      type: "boolean",
      default: "false",
      description: "Enable verbose logging",
    });
    try {
      const result = validateEnv({ VERBOSE: "true" });
      expect(result.valid).toBe(true);
      expect(result.resolved.VERBOSE).toBe("true");
    } finally {
      ENV_SPEC.length = original.length;
    }
  });

  it("rejects invalid boolean-type value", () => {
    const original = [...ENV_SPEC];
    ENV_SPEC.push({
      key: "VERBOSE",
      required: false,
      type: "boolean",
      default: "false",
      description: "Enable verbose logging",
    });
    try {
      const result = validateEnv({ VERBOSE: "yes" });
      expect(result.valid).toBe(false);
      expect(result.errors[0].key).toBe("VERBOSE");
    } finally {
      ENV_SPEC.length = original.length;
    }
  });

  it("errors on missing required var", () => {
    const original = [...ENV_SPEC];
    ENV_SPEC.push({
      key: "API_SECRET",
      required: true,
      type: "string",
      description: "Secret key for API",
    });
    try {
      const result = validateEnv({});
      expect(result.valid).toBe(false);
      expect(result.errors[0].key).toBe("API_SECRET");
      expect(result.errors[0].message).toContain("Required");
    } finally {
      ENV_SPEC.length = original.length;
    }
  });

  it("errors on required var set to empty string", () => {
    const original = [...ENV_SPEC];
    ENV_SPEC.push({
      key: "API_SECRET",
      required: true,
      type: "string",
      description: "Secret key for API",
    });
    try {
      const result = validateEnv({ API_SECRET: "" });
      expect(result.valid).toBe(false);
      expect(result.errors[0].key).toBe("API_SECRET");
    } finally {
      ENV_SPEC.length = original.length;
    }
  });

  it("generateEnvExample: includes '(required)' marker for required spec", () => {
    const original = [...ENV_SPEC];
    ENV_SPEC.push({
      key: "API_SECRET",
      required: true,
      type: "string",
      description: "Secret key for API",
    });
    try {
      const example = generateEnvExample();
      expect(example).toContain("(required)");
      expect(example).toContain("API_SECRET=");
    } finally {
      ENV_SPEC.length = original.length;
    }
  });

  it("optional spec with no default uses empty string", () => {
    const original = [...ENV_SPEC];
    ENV_SPEC.push({
      key: "OPTIONAL_NODEF",
      required: false,
      type: "string",
      description: "Optional with no default",
    });
    try {
      const result = validateEnv({});
      expect(result.valid).toBe(true);
      expect(result.resolved.OPTIONAL_NODEF).toBe("");
    } finally {
      ENV_SPEC.length = original.length;
    }
  });
});

// ─── ENV_SPEC coverage (R3.2) ───────────────────────────────────
// 34 vars were consumed via process.env in this directory but never
// declared in ENV_SPEC -- validateEnv and the generated .env.example both
// understated the real config surface. Scans every non-test .ts file in
// this directory for `process.env.KEY` reads and asserts each bare key
// (not one embedded inside a string literal -- several files emit sample
// .env/code snippets for CUSTOMERS as JS strings, e.g. commerce-integration.ts's
// AP2_MANDATE_SECRET/PAID_API_KEY snippets, which are not axis-iliad's own
// env reads) appears in ENV_SPEC.

/** Bare (non-string-literal) process.env.KEY reads across apps/api/src's
 *  non-test source. A quote appearing before "process.env." on the same
 *  line with no matching close-quote between them marks a match as
 *  "inside a string literal" (this codebase's generators emit sample env/
 *  code snippets as JS strings) and excludes it. */
function consumedEnvKeys(): Set<string> {
  const keys = new Set<string>();
  for (const file of readdirSync(SRC_DIR)) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
    const lines = readFileSync(join(SRC_DIR, file), "utf-8").split("\n");
    for (const line of lines) {
      for (const m of line.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
        const before = line.slice(0, m.index);
        const inString = (before.match(/"/g)?.length ?? 0) % 2 === 1;
        if (!inString) keys.add(m[1]);
      }
    }
  }
  return keys;
}

describe("ENV_SPEC coverage", () => {
  it("declares every process.env key actually read in apps/api/src", () => {
    const declared = new Set(ENV_SPEC.map((e) => e.key));
    const consumed = consumedEnvKeys();
    expect(consumed.size, "env-key scanner found nothing -- likely a broken regex, not a clean codebase").toBeGreaterThan(50);
    const missing = [...consumed].filter((k) => !declared.has(k)).sort();
    expect(missing).toEqual([]);
  });
});
