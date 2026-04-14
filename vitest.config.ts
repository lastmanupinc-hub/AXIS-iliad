import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.{ts,tsx}"],
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
