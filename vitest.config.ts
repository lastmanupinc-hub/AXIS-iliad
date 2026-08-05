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
      // RAISED 2026-08-05 from 60/60/50/60, which had become decorative.
      //
      // Measured on CI run 30967855150 (full suite, both Node versions agreeing
      // exactly): statements 89.44, branches 79.12, functions 87.89, lines 90.88.
      // Against thresholds of 60/60/50/60 that is ~29 points of slack on every
      // metric — the gate would not have failed until roughly a THIRD of the
      // suite stopped running. A gate that cannot detect the regression it
      // exists to catch is worse than no gate: it reports "coverage enforced"
      // in every CI run while enforcing nothing.
      //
      // Set ~5 points below measured actual. That is deliberately not tight:
      // the failure mode worth catching is "a chunk of the suite silently
      // stopped running" (a broken glob, a skipped file, an import that throws
      // at collection), not a percentage point of ordinary churn. Tightening
      // further would trade real signal for false failures on normal work.
      //
      // These are a floor to RAISE as coverage rises, not a target to code to.
      // If a change legitimately lowers coverage, lower the number in the same
      // commit with the reason — do not silently widen the gap again.
      thresholds: {
        lines: 85,
        functions: 82,
        branches: 74,
        statements: 84,
      },
    },
  },
});
