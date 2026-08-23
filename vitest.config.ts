import { defineConfig } from "vitest/config";

// infra_01 lever 3 (2026-08-23): the suite used to be one project with
// `fileParallelism: false` applied to EVERY file, because the Postgres-backed
// tests share one test database and truncating/resetting it concurrently
// would corrupt other tests' state. That blanket rule was serializing ~334 of
// ~466 test files for no reason of their own — only apps/api,
// packages/snapshots, and ONE file elsewhere ever touch the shared DB
// (verified by grepping for real resetTestDb() calls, not assumed from
// package names — a handful of generator-core fixtures contain the STRING
// "db.query()" as fake source content fed to the analyzer under test, which
// is not a real DB call and would have produced a false positive here).
//
// Split into three projects. "db" keeps the original safety property
// (serialized, same shared database). "pure" runs with real cross-file
// parallelism. "integration" is its own lane for the 3 files that spawn
// real Docker builds / real git+npm child processes (apps/cli's
// deploy-verify, release-operator, automation-verifier) — MEASURED
// 2026-08-23: running these alongside 3 other concurrent "pure" workers
// produced real, non-flaky-looking failures (two 60-120s Docker-build
// timeouts, one real "build_failed" instead of "tagged") that vanished
// (8/8 passed) the moment the same 2 files ran without that concurrent
// load. Not a bug in the split's classification — a real resource-
// contention cost of parallelism specifically for tests heavy enough to
// compete for the machine's CPU/IO with everything else running. Giving
// them their own serialized lane removes that cost the same way the "db"
// project already removes the analogous cost for Postgres.
//
// Explicit allowlists on all three, deliberately not a broad glob-with-
// exclude: a broad include would default a brand-new DB-touching or
// integration-heavy file into the parallel project (silent, hard-to-
// diagnose flakiness — the exact failure mode this split exists to
// remove). An explicit allowlist instead defaults a forgotten new file
// into NONE of the three (loud — a wrong total test count, and
// vitest-project-coverage.test.ts below fails by name). See that test for
// the completeness + classification guards that keep these lists honest
// as the suite grows.
const DB_PROJECT_INCLUDE = [
  "apps/api/src/**/*.test.{ts,tsx}",
  "packages/snapshots/src/**/*.test.ts",
  // The one exception outside apps/api and packages/snapshots: calls
  // resetTestDb() in its own beforeAll (verified, not assumed).
  "packages/generator-core/src/pipeline.test.ts",
];

/**
 * Real Docker builds / real git+npm child processes — heavy enough that
 * running them alongside other concurrent workers produces spurious
 * timeouts under load (measured, see the projects comment above). Glob
 * covers the whole tree under apps/cli/src, so a future
 * `<anything>.integration.test.ts` anywhere in there inherits this lane
 * automatically instead of needing a new named entry.
 */
const INTEGRATION_PROJECT_INCLUDE = ["apps/cli/src/**/*.integration.test.ts"];

const PURE_PROJECT_INCLUDE = [
  "packages/generator-core/src/**/*.test.ts",
  "packages/context-engine/src/**/*.test.ts",
  "packages/repo-parser/src/**/*.test.ts",
  "packages/ap2/src/**/*.test.ts",
  "packages/iliad-md/src/**/*.test.ts",
  "packages/agentic-compliance/src/**/*.test.ts",
  "packages/sdk/src/**/*.test.ts",
  "packages/paid-client/src/**/*.test.ts",
  "apps/web/src/**/*.test.{ts,tsx}",
  "apps/cli/src/**/*.test.ts",
];
const PURE_PROJECT_EXCLUDE = [
  "packages/generator-core/src/pipeline.test.ts",
  ...INTEGRATION_PROJECT_INCLUDE,
];

export {
  DB_PROJECT_INCLUDE,
  INTEGRATION_PROJECT_INCLUDE,
  PURE_PROJECT_INCLUDE,
  PURE_PROJECT_EXCLUDE,
};

export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
    environment: "node",
    pool: "threads",
    projects: [
      {
        extends: true,
        test: {
          name: "db",
          include: DB_PROJECT_INCLUDE,
          // The Postgres-backed suite shares one test database, so these
          // files must not run concurrently (they reset shared tables
          // between tests). Within a file, tests already run sequentially.
          fileParallelism: false,
          maxWorkers: process.env.CI ? 4 : undefined,
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: INTEGRATION_PROJECT_INCLUDE,
          // No shared database, but real Docker builds / real git+npm child
          // processes are heavy enough to compete for the machine's CPU/IO
          // with whatever else is running — serialized so they get it
          // uncontested, same reasoning as "db", different resource. Each
          // file's own per-test timeout overrides (60-120s) are unchanged by
          // this; only scheduling changes.
          fileParallelism: false,
        },
      },
      {
        extends: true,
        test: {
          name: "pure",
          include: PURE_PROJECT_INCLUDE,
          exclude: PURE_PROJECT_EXCLUDE,
          // No shared mutable state between these files — real cross-file
          // parallelism is safe (vitest's own default; stated explicitly so
          // a future reader doesn't mistake the omission for an oversight).
          fileParallelism: true,
          // MEASURED 2026-08-23: uncapped (vitest's own CPU-count default, 7
          // workers on this 8-core machine) failed 7/225 apps/web files with
          // "Timeout waiting for worker to respond" — a worker never even
          // started, not a real assertion failure. Every one of those 7 files
          // passed cleanly (70/70 tests) re-run in isolation seconds later,
          // confirming worker-pool contention, not a regression from this
          // split (same "false failure that passes isolated" signature this
          // candidate's own DB-side lever already documented). Capped at 4 —
          // still a 4x floor over the old fileParallelism:false (1-at-a-time)
          // baseline, and leaves headroom on a shared/contended machine
          // instead of chasing the uncapped default's last, flakiest bit of
          // speed.
          maxWorkers: 4,
        },
      },
    ],
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
