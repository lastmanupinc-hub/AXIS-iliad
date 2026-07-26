// Affected-package CI detection — pure decision logic. The real acceptance
// proof is a real CI run narrowing correctly (see .github/workflows/ci.yml);
// this is durable regression coverage for the logic underneath it, using
// injected fake git/pnpm functions so it needs neither a real git repo nor a
// real pnpm install to run.
import { describe, it, expect, vi } from "vitest";
import {
  isSafeRootFile,
  needsFullRegression,
  parseAffectedPackagePaths,
  resolveAffected,
  buildPnpmFilter,
} from "../../../scripts/ci-affected.mjs";

describe("isSafeRootFile / needsFullRegression", () => {
  it("treats root-level markdown and docs/ as safe", () => {
    expect(isSafeRootFile("README.md")).toBe(true);
    expect(isSafeRootFile("SONNET5_REMEDIATION_PLAYBOOK.md")).toBe(true);
    expect(isSafeRootFile("docs/archive/e2e_ui_audit.yaml")).toBe(true);
  });

  it("treats known zero-runtime-effect root files as safe", () => {
    expect(isSafeRootFile("eslint-suppressions.json")).toBe(true);
    expect(isSafeRootFile(".prettierrc.json")).toBe(true);
    expect(isSafeRootFile(".gitignore")).toBe(true);
    expect(isSafeRootFile(".dockerignore")).toBe(true);
    expect(isSafeRootFile("LICENSE")).toBe(true);
  });

  it("does not treat root-level config/scripts/workflows as safe", () => {
    expect(isSafeRootFile("pnpm-lock.yaml")).toBe(false);
    expect(isSafeRootFile("tsconfig.base.json")).toBe(false);
    expect(isSafeRootFile("package.json")).toBe(false);
    expect(isSafeRootFile(".github/workflows/ci.yml")).toBe(false);
    expect(isSafeRootFile("scripts/ci-affected.mjs")).toBe(false);
  });

  it("needsFullRegression is false when every change is under apps/*|packages/*", () => {
    expect(needsFullRegression(["apps/api/src/handlers.ts", "packages/snapshots/src/store.ts"])).toBe(false);
  });

  it("needsFullRegression is false for a docs-only change mixed with package changes", () => {
    expect(needsFullRegression(["PRIVACY_POLICY.md", "apps/api/src/handlers.ts"])).toBe(false);
  });

  it("needsFullRegression is true for a single root-level non-doc file, even alongside package changes", () => {
    expect(needsFullRegression(["pnpm-lock.yaml", "apps/api/src/handlers.ts"])).toBe(true);
    expect(needsFullRegression([".github/workflows/ci.yml"])).toBe(true);
    expect(needsFullRegression(["scripts/check-artifact-freshness.ts"])).toBe(true);
  });
});

describe("parseAffectedPackagePaths", () => {
  const repoRoot = "/repo";

  it("extracts repo-relative dirs, sorted, excluding the workspace root", () => {
    const json = JSON.stringify([
      { name: "axis-iliad", path: "/repo" },
      { name: "@axis/api", path: "/repo/apps/api" },
      { name: "@axis/snapshots", path: "/repo/packages/snapshots" },
    ]);
    expect(parseAffectedPackagePaths(json, repoRoot)).toEqual(["apps/api", "packages/snapshots"]);
  });

  it("normalizes Windows backslash paths to POSIX", () => {
    const json = JSON.stringify([{ name: "@axis/api", path: "C:\\repo\\apps\\api" }]);
    expect(parseAffectedPackagePaths(json, "C:\\repo")).toEqual(["apps/api"]);
  });

  it("returns an empty list when only the workspace root is affected", () => {
    const json = JSON.stringify([{ name: "axis-iliad", path: "/repo" }]);
    expect(parseAffectedPackagePaths(json, repoRoot)).toEqual([]);
  });
});

describe("resolveAffected", () => {
  const repoRoot = "/repo";

  it("reports full for an empty base ref, without calling git or pnpm", () => {
    const changedFilesFn = vi.fn();
    const affectedJsonFn = vi.fn();
    const result = resolveAffected("", { changedFilesFn, affectedJsonFn, repoRoot });
    expect(result.full).toBe(true);
    expect(changedFilesFn).not.toHaveBeenCalled();
    expect(affectedJsonFn).not.toHaveBeenCalled();
  });

  it("reports full for an all-zeros base ref (new-branch push)", () => {
    const result = resolveAffected("0000000000000000000000000000000000000000", {
      changedFilesFn: vi.fn(),
      affectedJsonFn: vi.fn(),
      repoRoot,
    });
    expect(result.full).toBe(true);
  });

  it("fails safe to full when git diff throws", () => {
    const result = resolveAffected("abc123", {
      changedFilesFn: () => { throw new Error("fatal: bad revision 'abc123'"); },
      affectedJsonFn: vi.fn(),
      repoRoot,
    });
    expect(result.full).toBe(true);
    expect(result.reason).toContain("git diff failed");
  });

  it("reports narrow with zero packages when nothing changed", () => {
    const result = resolveAffected("abc123", {
      changedFilesFn: () => [],
      affectedJsonFn: vi.fn(),
      repoRoot,
    });
    expect(result).toMatchObject({ full: false, packages: [] });
  });

  it("reports full, WITHOUT calling pnpm, when a root-level non-doc file changed", () => {
    const affectedJsonFn = vi.fn();
    const result = resolveAffected("abc123", {
      changedFilesFn: () => ["pnpm-lock.yaml", "apps/api/src/handlers.ts"],
      affectedJsonFn,
      repoRoot,
    });
    expect(result.full).toBe(true);
    expect(affectedJsonFn).not.toHaveBeenCalled();
  });

  it("reports narrow with the pnpm-derived package list for an ordinary code change", () => {
    const json = JSON.stringify([
      { name: "axis-iliad", path: repoRoot },
      { name: "@axis/api", path: `${repoRoot}/apps/api` },
      { name: "@axis/snapshots", path: `${repoRoot}/packages/snapshots` },
    ]);
    const result = resolveAffected("abc123", {
      changedFilesFn: () => ["packages/snapshots/src/store.ts", "PRIVACY_POLICY.md"],
      affectedJsonFn: () => json,
      repoRoot,
    });
    expect(result).toMatchObject({ full: false, packages: ["apps/api", "packages/snapshots"] });
  });

  it("fails safe to full when the pnpm filter command throws", () => {
    const result = resolveAffected("abc123", {
      changedFilesFn: () => ["apps/api/src/handlers.ts"],
      affectedJsonFn: () => { throw new Error("command not found: pnpm"); },
      repoRoot,
    });
    expect(result.full).toBe(true);
    expect(result.reason).toContain("pnpm --filter failed");
  });

  it("fails safe to full when pnpm's output is not valid JSON", () => {
    const result = resolveAffected("abc123", {
      changedFilesFn: () => ["apps/api/src/handlers.ts"],
      affectedJsonFn: () => "not json",
      repoRoot,
    });
    expect(result.full).toBe(true);
    expect(result.reason).toContain("could not parse pnpm output");
  });
});

describe("buildPnpmFilter", () => {
  it("is empty when full", () => {
    expect(buildPnpmFilter({ full: true, base: "abc123", packages: ["apps/api"] })).toBe("");
  });

  it("is empty when narrow but nothing is affected", () => {
    expect(buildPnpmFilter({ full: false, base: "abc123", packages: [] })).toBe("");
  });

  it("reuses the exact base ref already used to compute the package list", () => {
    expect(buildPnpmFilter({ full: false, base: "abc123", packages: ["apps/api"] })).toBe('--filter "...[abc123]"');
  });
});
