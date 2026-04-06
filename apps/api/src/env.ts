// ─── Environment variable validation ────────────────────────────
//
// Call validateEnv() at startup to fail fast on missing/invalid config.
// Each variable declares: required | optional, type, default, description.

export interface EnvSpec {
  key: string;
  required: boolean;
  type: "string" | "number" | "boolean";
  default?: string;
  description: string;
}

export const ENV_SPEC: EnvSpec[] = [
  { key: "PORT", required: false, type: "number", default: "4000", description: "HTTP listen port" },
  { key: "NODE_ENV", required: false, type: "string", default: "development", description: "Runtime environment (development | production | test)" },
  { key: "DATABASE_PATH", required: false, type: "string", default: "./axis.db", description: "SQLite database file path" },
  { key: "LOG_LEVEL", required: false, type: "string", default: "info", description: "Log verbosity (debug | info | warn | error)" },
  { key: "CORS_ORIGIN", required: false, type: "string", default: "*", description: "Allowed CORS origin" },
  { key: "RATE_LIMIT_WINDOW_MS", required: false, type: "number", default: "60000", description: "Rate limit sliding window in ms" },
  { key: "RATE_LIMIT_MAX_REQUESTS", required: false, type: "number", default: "60", description: "Max requests per window (anonymous)" },
  { key: "RATE_LIMIT_MAX_AUTHENTICATED", required: false, type: "number", default: "120", description: "Max requests per window (authenticated)" },
  { key: "SHUTDOWN_TIMEOUT_MS", required: false, type: "number", default: "10000", description: "Graceful shutdown drain timeout in ms" },
  { key: "REQUEST_TIMEOUT_MS", required: false, type: "number", default: "30000", description: "Per-request timeout in ms (0 = no limit)" },
  { key: "MAX_BODY_BYTES", required: false, type: "number", default: "52428800", description: "Maximum request body size in bytes (default 50MB)" },
];

export interface ValidationError {
  key: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  resolved: Record<string, string>;
}

/**
 * Validate all environment variables against the spec.
 * Returns resolved values (with defaults applied) and any errors.
 */
export function validateEnv(
  env: Record<string, string | undefined> = process.env,
): ValidationResult {
  const errors: ValidationError[] = [];
  const resolved: Record<string, string> = {};

  for (const spec of ENV_SPEC) {
    const raw = env[spec.key];

    if (raw === undefined || raw === "") {
      if (spec.required) {
        errors.push({ key: spec.key, message: `Required environment variable ${spec.key} is not set. ${spec.description}` });
        continue;
      }
      // Apply default
      resolved[spec.key] = spec.default ?? "";
      continue;
    }

    // Type validation
    if (spec.type === "number") {
      const num = Number(raw);
      if (isNaN(num) || !isFinite(num)) {
        errors.push({ key: spec.key, message: `${spec.key} must be a valid number, got "${raw}"` });
        continue;
      }
      if (num < 0) {
        errors.push({ key: spec.key, message: `${spec.key} must be non-negative, got ${num}` });
        continue;
      }
    }

    if (spec.type === "boolean") {
      if (!["true", "false", "1", "0"].includes(raw.toLowerCase())) {
        errors.push({ key: spec.key, message: `${spec.key} must be true/false/1/0, got "${raw}"` });
        continue;
      }
    }

    resolved[spec.key] = raw;
  }

  return { valid: errors.length === 0, errors, resolved };
}

/**
 * Validate and throw on errors. For use at server startup.
 */
export function requireValidEnv(
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const result = validateEnv(env);
  if (!result.valid) {
    const messages = result.errors.map((e) => `  - ${e.message}`).join("\n");
    throw new Error(`Environment validation failed:\n${messages}`);
  }
  return result.resolved;
}

/**
 * Generate a .env.example string from the spec.
 */
export function generateEnvExample(): string {
  const lines: string[] = [
    "# ─── Axis Toolbox API — Environment Variables ───────────────",
    "# Copy this file to .env and customize as needed.",
    "",
  ];

  for (const spec of ENV_SPEC) {
    lines.push(`# ${spec.description}`);
    /* v8 ignore next — V8 quirk: both required/optional ternary paths tested */
    const marker = spec.required ? "(required)" : `(default: ${spec.default ?? '""'})`;
    lines.push(`# ${marker}`);
    lines.push(`${spec.key}=${spec.default ?? ""}`);
    lines.push("");
  }

  return lines.join("\n");
}
