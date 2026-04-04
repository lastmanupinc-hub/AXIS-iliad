import { describe, it, expect } from "vitest";
import {
  validateEnv,
  requireValidEnv,
  generateEnvExample,
  ENV_SPEC,
  type ValidationResult,
} from "./env.js";

// ─── validateEnv ────────────────────────────────────────────────

describe("validateEnv", () => {
  it("returns valid with all defaults when env is empty", () => {
    const result = validateEnv({});
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.resolved.PORT).toBe("4000");
    expect(result.resolved.NODE_ENV).toBe("development");
    expect(result.resolved.DATABASE_PATH).toBe("./axis.db");
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
    expect(example).toContain("DATABASE_PATH=./axis.db");
  });

  it("starts with header comment", () => {
    const example = generateEnvExample();
    expect(example.startsWith("#")).toBe(true);
    expect(example).toContain("Axis Toolbox");
  });
});
