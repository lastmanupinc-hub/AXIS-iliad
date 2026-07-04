import { describe, it, expect } from "vitest";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import { generateFintechMcpSurfacePackage, generateCapabilityRegistry } from "./generators-mcp.js";

const profile = {} as RepoProfile;
const files: SourceFile[] = [];

function ctxWith(over: Partial<ContextMap> = {}): ContextMap {
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "app", type: "app", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 5, total_directories: 2, total_loc: 1000, file_tree_summary: [] as ContextMap["structure"]["file_tree_summary"], top_level_layout: [] },
    detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: ["pnpm"], ci_platform: null, deployment_target: null },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [], routes: [], domain_models: [], sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.5 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
    ...over,
  } as ContextMap;
}
function hintsFor(names: string[]): string {
  const deps = names.map((name) => ({ name, version: "1.0.0" })) as ContextMap["dependency_graph"]["external_dependencies"];
  return generateFintechMcpSurfacePackage(ctxWith({ dependency_graph: { external_dependencies: deps, internal_imports: [], hotspots: [] } }), profile, files).content;
}

// The POLISH keyword swap (dropping bare "checkout"/"unit"/"treasury") removed
// false positives but INITIALLY also lost true positives: the real Checkout.com
// SDK ships as `checkout-sdk-node` and Unit as `@unit-finance/*`, neither of
// which the `checkout.com` substring matched. HARDEN-2 restored them with the
// `checkout-sdk` / `unit-finance` package ids. This pins BOTH directions so a
// future keyword edit can't silently regress either.
describe("HARDEN-2: fintech detection catches real SDKs without generic false positives", () => {
  it("detects the real provider packages the POLISH swap had dropped", () => {
    expect(hintsFor(["checkout-sdk-node"])).toContain("checkout-sdk-node"); // unscoped Checkout.com
    expect(hintsFor(["@checkout.com/checkout-sdk-node"])).toContain("@checkout.com/checkout-sdk-node");
    expect(hintsFor(["@unit-finance/unit-node-sdk"])).toContain("@unit-finance/unit-node-sdk"); // Unit
    expect(hintsFor(["modern-treasury"])).toContain("modern-treasury");
    expect(hintsFor(["stripe"])).toContain("stripe");
  });

  it("still ignores the generic names that motivated the swap", () => {
    // unit-test libs, cart checkouts, and aws-treasury must NOT be called fintech.
    const c = hintsFor(["unit-test-runner", "checkout-cart", "aws-treasury", "react", "vitest"]);
    expect(c).toContain("none directly detected");
  });
});

// The POLISH availability gate (`hasJsPkgMgr || buildTools.length>0`) over-corrected:
// detectPackageManagers only adds `npm` when a lockfile exists and detectBuildTools
// never emits `tsc`, so a lockfile-less tsc-only JS repo flipped build/dev/install
// from a correct `true` to a wrong `false` (F1). Keying off buildTools also left a
// Go/Rust repo with a Makefile falsely reporting `npm run build` available (F3).
// HARDEN-2 re-gates on `hasJsPkgMgr || isJsProject` (JS/TS primary language),
// dropping the unreliable buildTools term. This pins both edges.
describe("HARDEN-2: capability availability keys off a real JS/Node signal, not buildTools", () => {
  function avail(over: { primary_language: string; package_managers?: string[]; build_tools?: string[] }) {
    const reg = JSON.parse(generateCapabilityRegistry(ctxWith({
      project_identity: { name: "app", type: "app", primary_language: over.primary_language, description: null, repo_url: null, go_module: null },
      detection: { languages: [], frameworks: [], build_tools: over.build_tools ?? [], test_frameworks: [], package_managers: over.package_managers ?? [], ci_platform: null, deployment_target: null },
    }), files).content) as { capabilities: Array<{ id: string; available: boolean }> };
    return Object.fromEntries(reg.capabilities.map((c) => [c.id, c.available]));
  }

  it("F1: a lockfile-less tsc-only TypeScript repo can still build/dev/install", () => {
    const c = avail({ primary_language: "TypeScript" }); // no pkg managers, no build tools
    expect(c.build).toBe(true);
    expect(c.dev).toBe(true);
    expect(c.install).toBe(true);
  });

  it("F3: a Go repo with a Makefile does NOT report an npm build/dev as available", () => {
    const c = avail({ primary_language: "Go", build_tools: ["make", "go_modules"] });
    expect(c.build).toBe(false);
    expect(c.dev).toBe(false);
    expect(c.install).toBe(false);
  });
});
