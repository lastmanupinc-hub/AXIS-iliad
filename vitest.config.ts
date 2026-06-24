import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.{ts,tsx}"],
    environment: "node",
    pool: "threads",
    // The Postgres-backed suite (Phase 6 of the Neon migration) shares one test
    // database, so test files must not run concurrently (they truncate tables
    // between tests). Within a file, tests already run sequentially.
    fileParallelism: false,
    maxWorkers: process.env.CI ? 4 : undefined,
    hookTimeout: 300_000,
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
