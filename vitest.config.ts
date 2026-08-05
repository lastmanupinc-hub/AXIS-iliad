import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    environment: "node",
    pool: "threads",
    // The Postgres-backed suite (Phase 6 of the Neon migration) shares one test
    // database, so test files must not run concurrently (they truncate tables
    // between tests). Within a file, tests already run sequentially.
    fileParallelism: false,
    maxWorkers: process.env.CI ? 4 : undefined,
    hookTimeout: 300_000,
    // 30s, not vitest's 5s default. That default is calibrated for pure unit
    // tests; this suite is Postgres-backed, and `hookTimeout` above was already
    // raised to 300s for exactly that reason — leaving testTimeout at the unit
    // default was an asymmetry, not a decision.
    //
    // MEASURED 2026-08-05, which is what turned this from "flaky" into a bug:
    // billing-edge-cases' quota tests do 199-200 SEQUENTIAL awaited
    // recordUsage() round-trips, and on an idle machine with a local Postgres
    // they take 4790ms and 4330ms — 96% of a 5000ms budget. They were not
    // failing at random; they were guaranteed to fail the moment anything got
    // slightly slower. CI on Node 20 with --coverage instrumentation is exactly
    // that, so 14 tests timed out there while Node 22 passed.
    //
    // The better fix is to stop doing 200 sequential round-trips where one
    // batched insert would do, but that changes what those tests exercise
    // (recordUsage is the API under test), so it is a separate decision — see
    // docs/OPEN_WORK_STRATEGY.md. This gives the suite a budget appropriate to
    // what it actually does; a genuinely hung test still fails, just at 30s.
    testTimeout: 30_000,
    environmentOptions: {
      happyDom: {},
    },
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/*.bench.ts",
        "**/*.d.ts",
        "**/node_modules/**",
        "**/dist/**",
      ],
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage",
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
  },
});
