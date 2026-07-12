#!/usr/bin/env node
// H1.4: run the test suite EXACTLY as CI does — same env signal (CI=true, so
// vitest.config.ts caps at 4 workers) and the same coverage flags as
// .github/workflows/ci.yml — so "works locally" and "works in CI" mean the
// same thing, and full-suite behavior stops being folklore.
//
// Usage: pnpm run test:ci-mirror   (or: node scripts/test-ci-mirror.mjs)
// Needs the local Postgres test container: docker start axis-test-pg
import { spawnSync } from "node:child_process";

const env = { ...process.env, CI: "true" };
if (!env.DATABASE_URL) {
  env.DATABASE_URL = "postgres://postgres:postgres@localhost:5433/axis_test";
  console.log("[ci-mirror] DATABASE_URL not set — defaulting to the local axis-test-pg container");
}

// Keep these flags in lockstep with .github/workflows/ci.yml's test step.
const args = [
  "vitest", "run",
  "--coverage",
  "--coverage.provider=v8",
  "--coverage.reporter=text",
  "--coverage.reporter=json-summary",
  "--coverage.reportDir=coverage",
];

const result = spawnSync("npx", args, {
  stdio: "inherit",
  env,
  shell: process.platform === "win32", // npx resolution on Windows needs a shell
});
process.exit(result.status ?? 1);
