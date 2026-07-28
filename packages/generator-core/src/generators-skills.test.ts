import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import { generateAgentsMD, generateClaudeMD, generatePolicyPack, generateModelCascade, displayRoutes } from "./generators-skills.js";

// Functional/quality coverage for the skills generators (POLISH, Program 2).
// Grounded in dogfooding the generators against the Iliad repo itself.

function mkCtx(o: Partial<ContextMap> = {}): ContextMap {
  return {
    version: "1.0.0",
    snapshot_id: "s",
    project_id: "p",
    generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "acme", type: "monorepo", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 50, total_directories: 10, total_loc: 5000, file_tree_summary: [], top_level_layout: [] },
    detection: { languages: ["TypeScript"], frameworks: [{ name: "React", version: "19.0.0" }] as ContextMap["detection"]["frameworks"], build_tools: ["vite"], test_frameworks: ["vitest"], package_managers: ["pnpm"], ci_platform: null, deployment_target: null },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [],
    routes: [],
    domain_models: [],
    sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
    ...o,
  } as ContextMap;
}

describe("generateAgentsMD — route deduplication (POLISH)", () => {
  it("collapses duplicate method+path routes into a single line", () => {
    const ctx = mkCtx({
      routes: [
        { method: "POST", path: "/purchase", source_file: "apps/api/src/commerce.ts" },
        { method: "POST", path: "/purchase", source_file: "apps/api/src/commerce.ts" },
        { method: "GET", path: "/health", source_file: "apps/api/src/server.ts" },
      ] as ContextMap["routes"],
    });
    const out = generateAgentsMD(ctx).content;
    const purchaseLines = out.split("\n").filter((l) => l.includes("`POST /purchase`"));
    expect(purchaseLines.length).toBe(1);
  });

  it("prefers a non-test source file when the same route appears in both", () => {
    const ctx = mkCtx({
      routes: [
        { method: "GET", path: "/x", source_file: "apps/api/src/server.test.ts" },
        { method: "GET", path: "/x", source_file: "apps/api/src/server.ts" },
      ] as ContextMap["routes"],
    });
    const out = generateAgentsMD(ctx).content;
    const line = out.split("\n").find((l) => l.includes("`GET /x`"));
    expect(line).toContain("apps/api/src/server.ts");
    expect(line).not.toContain(".test.");
  });

  it("keeps a route that only exists in a test file (no non-test alternative)", () => {
    const ctx = mkCtx({
      routes: [{ method: "GET", path: "/only", source_file: "x.test.ts" }] as ContextMap["routes"],
    });
    const out = generateAgentsMD(ctx).content;
    expect(out).toContain("`GET /only`");
  });

  it("suppresses a test-ONLY route when real (non-test) routes coexist (HARDEN-2 regression)", () => {
    // A mock endpoint defined only in an integration test must not be presented
    // to agents as production API surface alongside the real routes.
    const ctx = mkCtx({
      routes: [
        { method: "GET", path: "/users", source_file: "apps/api/src/server.ts" },
        { method: "GET", path: "/mock-fixture", source_file: "apps/api/src/server.test.ts" },
      ] as ContextMap["routes"],
    });
    const out = generateAgentsMD(ctx).content;
    expect(out).toContain("`GET /users`");
    expect(out).not.toContain("/mock-fixture");
  });

  it("caps the displayed routes at 50 DISTINCT routes and notes the remainder", () => {
    const routes = Array.from({ length: 60 }, (_, i) => ({ method: "GET", path: `/r${i}`, source_file: "s.ts" }));
    const ctx = mkCtx({ routes: routes as ContextMap["routes"] });
    const out = generateAgentsMD(ctx).content;
    const shown = out.split("\n").filter((l) => /^- `GET \/r\d+`/.test(l)).length;
    expect(shown).toBe(50);
    expect(out).toMatch(/…\s*10 more/);
  });
});

describe("displayRoutes (shared helper, DEVELOP)", () => {
  it("collapses duplicates by method+path and preserves first-seen order", () => {
    const r = displayRoutes([
      { method: "GET", path: "/a", source_file: "s.ts" },
      { method: "POST", path: "/a", source_file: "s.ts" },
      { method: "GET", path: "/a", source_file: "s.ts" },
    ] as ContextMap["routes"]);
    expect(r.map((x) => `${x.method} ${x.path}`)).toEqual(["GET /a", "POST /a"]);
  });

  it("upgrades a test-file attribution to a non-test source for the same route", () => {
    const r = displayRoutes([
      { method: "GET", path: "/a", source_file: "a.test.ts" },
      { method: "GET", path: "/a", source_file: "a.ts" },
    ] as ContextMap["routes"]);
    expect(r).toHaveLength(1);
    expect(r[0]!.source_file).toBe("a.ts");
  });

  it("does NOT collide two distinct routes whose method+path concatenate ambiguously", () => {
    // Under a `${method} ${path}` space-join both of these key to "GET /a b";
    // the JSON-encoded key keeps them distinct so neither is silently dropped.
    const r = displayRoutes([
      { method: "GET /a", path: "b", source_file: "s.ts" },
      { method: "GET", path: "/a b", source_file: "s.ts" },
    ] as ContextMap["routes"]);
    expect(r).toHaveLength(2);
  });

  it("is a pure identity-preserving no-op on already-unique non-test input", () => {
    const input = [
      { method: "GET", path: "/a", source_file: "s.ts" },
      { method: "GET", path: "/b", source_file: "s.ts" },
    ] as ContextMap["routes"];
    expect(displayRoutes(input)).toEqual(input);
  });

  it("drops test-only routes when non-test routes exist, but keeps them as a fallback", () => {
    const withReal = displayRoutes([
      { method: "GET", path: "/real", source_file: "server.ts" },
      { method: "GET", path: "/mock", source_file: "server.test.ts" },
    ] as ContextMap["routes"]);
    expect(withReal.map((r) => r.path)).toEqual(["/real"]);

    const allTest = displayRoutes([
      { method: "GET", path: "/mock", source_file: "server.test.ts" },
    ] as ContextMap["routes"]);
    expect(allTest.map((r) => r.path)).toEqual(["/mock"]);
  });
});

describe("generateClaudeMD — API Surface section (DEVELOP)", () => {
  it("emits a deduped API Surface section when routes exist", () => {
    const ctx = mkCtx({
      routes: [
        { method: "POST", path: "/purchase", source_file: "commerce.ts" },
        { method: "POST", path: "/purchase", source_file: "commerce.ts" },
        { method: "GET", path: "/health", source_file: "server.ts" },
      ] as ContextMap["routes"],
    });
    const out = generateClaudeMD(ctx).content;
    expect(out).toContain("## API Surface");
    expect(out.split("\n").filter((l) => l.includes("`POST /purchase`"))).toHaveLength(1);
    expect(out).toContain("`GET /health`");
  });

  it("omits the API Surface section entirely when there are no routes", () => {
    const out = generateClaudeMD(mkCtx({ routes: [] as ContextMap["routes"] })).content;
    expect(out).not.toContain("## API Surface");
  });

  it("caps the API Surface at 40 distinct routes and notes the remainder", () => {
    const routes = Array.from({ length: 55 }, (_, i) => ({ method: "GET", path: `/r${i}`, source_file: "s.ts" }));
    const out = generateClaudeMD(mkCtx({ routes: routes as ContextMap["routes"] })).content;
    const shown = out.split("\n").filter((l) => /^- `GET \/r\d+`/.test(l)).length;
    expect(shown).toBe(40);
    expect(out).toMatch(/…\s*15 more/);
  });
});

describe("generateClaudeMD — honest language rules (POLISH)", () => {
  it("emits the TypeScript-strict Do-NOT for a TypeScript project", () => {
    const out = generateClaudeMD(mkCtx({ project_identity: { name: "a", type: "app", primary_language: "TypeScript", description: null, repo_url: null, go_module: null } })).content;
    expect(out).toContain("Do not bypass TypeScript strict mode");
  });

  it("does NOT emit the TypeScript-strict Do-NOT for a non-TypeScript project", () => {
    for (const lang of ["Python", "Rust", "Go", "Ruby", "JSON"]) {
      const out = generateClaudeMD(mkCtx({ project_identity: { name: "a", type: "app", primary_language: lang, description: null, repo_url: null, go_module: null } })).content;
      expect(out, `lang=${lang}`).not.toContain("Do not bypass TypeScript strict mode");
    }
  });
});

describe("generatePolicyPack — type-system rules gated by language (POLISH-2)", () => {
  const policyFor = (lang: string) =>
    generatePolicyPack(mkCtx({ project_identity: { name: "a", type: "app", primary_language: lang, description: null, repo_url: null, go_module: null } })).content;

  it("emits strict_types / no_any_types for a TypeScript project", () => {
    const out = policyFor("TypeScript");
    expect(out).toContain("strict_types: true");
    expect(out).toContain("no_any_types: true");
  });

  it("omits strict_types / no_any_types for non-TypeScript projects (incl. plain JS) but keeps the language-agnostic rules", () => {
    // JavaScript is included: plain JS has no type annotations, so no_any_types
    // is meaningless — and emitting it would contradict AGENTS.md, which gates
    // strict-TS on TypeScript only.
    for (const lang of ["JavaScript", "Python", "Rust", "Go"]) {
      const out = policyFor(lang);
      expect(out, `lang=${lang}`).not.toContain("strict_types: true");
      expect(out, `lang=${lang}`).not.toContain("no_any_types: true");
      // language-agnostic governance still present
      expect(out, `lang=${lang}`).toContain("no_stub_implementations: true");
      expect(out, `lang=${lang}`).toContain("no_placeholder_data: true");
    }
  });

  it("policy-pack and AGENTS.md agree on strict-type guidance for the same JS project (no cross-generator contradiction)", () => {
    const jsCtx = mkCtx({ project_identity: { name: "a", type: "app", primary_language: "JavaScript", description: null, repo_url: null, go_module: null } });
    const policy = generatePolicyPack(jsCtx).content;
    const agents = generateAgentsMD(jsCtx).content;
    // Neither file asserts a TypeScript-strict rule for a JavaScript repo.
    expect(policy).not.toContain("strict_types: true");
    expect(agents).not.toContain("Use strict TypeScript");
  });
});

describe("generateAgentsMD — language honesty consistent with CLAUDE.md (HARDEN-2)", () => {
  const jsCtx = () => mkCtx({ project_identity: { name: "a", type: "app", primary_language: "JavaScript", description: null, repo_url: null, go_module: null } });

  it("does NOT tell a pure-JavaScript repo to 'use strict TypeScript'", () => {
    const out = generateAgentsMD(jsCtx()).content;
    expect(out).not.toContain("Use strict TypeScript");
  });

  it("still emits 'use strict TypeScript' for a TypeScript repo", () => {
    const out = generateAgentsMD(mkCtx()).content; // default is TypeScript
    expect(out).toContain("Use strict TypeScript");
  });

  it("still applies React framework rules to a JavaScript repo (framework rules are language-agnostic)", () => {
    const out = generateAgentsMD(jsCtx()).content; // default frameworks include React
    expect(out).toContain("functional components");
  });
});

describe("generateModelCascade — tier map + delegation contract (H7.1)", () => {
  it("always emits the capability-tier table, delegation contract, cost rule, and honest-limits sections", () => {
    const out = generateModelCascade(mkCtx()).content;
    expect(out).toContain("## Capability tiers");
    expect(out).toContain("| Planner | frontier-class |");
    expect(out).toContain("| Executor | mid-class |");
    expect(out).toContain("| Mechanical | small-class |");
    expect(out).toContain("## Delegation contract");
    expect(out).toContain("## Cost rule");
    expect(out).toContain("## Honest limits");
  });

  it("names no vendor SKU, model name, or price (capability classes only)", () => {
    const out = generateModelCascade(mkCtx()).content.toLowerCase();
    for (const bad of ["gpt", "claude", "gemini", "gpt-4", "sonnet", "opus", "$", "swe-bench"]) {
      expect(out, bad).not.toContain(bad);
    }
  });

  it("maps CI failure triage to Mechanical only when a CI platform is detected", () => {
    const withCi = generateModelCascade(mkCtx({ detection: { ...mkCtx().detection, ci_platform: "github_actions" } })).content;
    expect(withCi).toContain("CI failure triage | Mechanical");

    const withoutCi = generateModelCascade(mkCtx()).content; // default ci_platform: null
    expect(withoutCi).not.toContain("CI failure triage");
  });

  it("maps test-backed implementation to Executor only when test frameworks are detected", () => {
    const withTests = generateModelCascade(mkCtx()).content; // default test_frameworks: ["vitest"]
    expect(withTests).toContain("Test-backed implementation | Executor");

    const withoutTests = generateModelCascade(mkCtx({ detection: { ...mkCtx().detection, test_frameworks: [] } })).content;
    expect(withoutTests).not.toContain("Test-backed implementation | Executor");
  });

  it("maps cross-cutting design + verification to Planner only when an infra architecture pattern is detected", () => {
    const withInfra = generateModelCascade(mkCtx({ architecture_signals: { patterns_detected: ["monorepo"], layer_boundaries: [], separation_score: 0 } })).content;
    expect(withInfra).toContain("Cross-cutting design + adversarial verification | Planner");

    const withoutInfra = generateModelCascade(mkCtx()).content; // default patterns_detected: []
    expect(withoutInfra).not.toContain("Cross-cutting design + adversarial verification");
  });

  it("maps framework/tooling migration to Planner only when more than one framework is detected", () => {
    const multi = generateModelCascade(mkCtx({
      detection: { ...mkCtx().detection, frameworks: [{ name: "React", version: "19.0.0" }, { name: "Vue", version: "3.0.0" }] as ContextMap["detection"]["frameworks"] },
    })).content;
    expect(multi).toContain("Framework/tooling migration | Planner");

    const single = generateModelCascade(mkCtx()).content; // default frameworks: [React] (length 1)
    expect(single).not.toContain("Framework/tooling migration");
  });

  it("maps layer-boundary refactoring to Planner only when the separation score is low (<0.5)", () => {
    const low = generateModelCascade(mkCtx({ architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.2 } })).content;
    expect(low).toContain("Refactoring across layer boundaries | Planner");

    const high = generateModelCascade(mkCtx({ architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.9 } })).content;
    expect(high).not.toContain("Refactoring across layer boundaries");
  });

  it("always emits the two signal-independent task-type rows even when every conditional signal is absent", () => {
    const out = generateModelCascade(mkCtx({
      detection: { languages: [], frameworks: [] as ContextMap["detection"]["frameworks"], build_tools: [], test_frameworks: [], package_managers: [], ci_platform: null, deployment_target: null },
      architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 1 },
    })).content;
    expect(out).toContain("New feature implementation | Executor");
    expect(out).toContain("Formatting, renames, boilerplate | Mechanical");
  });

  it("is deterministic", () => {
    const ctx = mkCtx();
    expect(generateModelCascade(ctx).content).toBe(generateModelCascade(ctx).content);
  });
});

// The Commands block was a single npm-shaped template with the detected package
// manager interpolated in, so every non-JS ecosystem got instructions that do not
// exist — `pip run build`, `pip run dev`, `cargo run dev`. Found by running the CLI
// against a real FastAPI repo; no fixture caught it because every fixture was npm.
describe("generateClaudeMD — Commands block matches the ecosystem", () => {
  const src = (path: string): SourceFile => ({ path, content: "", size: 0 });
  const forPm = (pm: string, files?: SourceFile[]) =>
    generateClaudeMD(
      mkCtx({
        detection: {
          languages: [],
          frameworks: [] as ContextMap["detection"]["frameworks"],
          build_tools: ["make"],
          test_frameworks: ["pytest"],
          package_managers: [pm],
          ci_platform: null,
          deployment_target: null,
        },
      }),
      files,
    ).content;

  // Enumerated rather than a blanket "<pm> <verb>" rule, because some of those
  // combinations are real: `cargo test` and `cargo run` are correct Rust, while
  // `pip test` and `cargo run dev` are not. The rule has to know the difference.
  it("never emits a command that does not exist in its ecosystem", () => {
    const bogus: Record<string, string[]> = {
      pip: ["pip run build", "pip run dev", "pip test"],
      cargo: ["cargo run build", "cargo run dev", "cargo install-deps"],
      "go modules": ["go modules install", "go modules run build", "go modules test"],
      bundler: ["bundler install", "bundler run build", "bundler test"],
    };
    for (const [pm, forbidden] of Object.entries(bogus)) {
      const out = forPm(pm);
      for (const cmd of forbidden) expect(out, `${pm}: emitted "${cmd}"`).not.toContain(cmd);
    }
  });

  it("uses the install form matching the Python manifest that exists", () => {
    expect(forPm("pip", [src("requirements.txt")])).toContain("pip install -r requirements.txt");
    expect(forPm("pip", [src("pyproject.toml")])).toContain("pip install -e .");
  });

  it("omits Build and Dev for pip rather than inventing them", () => {
    const out = forPm("pip", [src("requirements.txt")]);
    expect(out).toContain("**Test:** `pytest`");
    expect(out).not.toContain("**Build:**");
    expect(out).not.toContain("**Dev:**");
  });

  it("emits real cargo and go commands", () => {
    const rust = forPm("cargo");
    expect(rust).toContain("cargo build");
    expect(rust).toContain("cargo test");
    expect(rust).toContain("cargo run");
    const go = forPm("go modules");
    expect(go).toContain("go mod download");
    expect(go).toContain("go build ./...");
    expect(go).toContain("go test ./...");
  });

  it("leaves the npm family exactly as it was", () => {
    const out = forPm("pnpm");
    expect(out).toContain("pnpm install");
    expect(out).toContain("pnpm run build");
    expect(out).toContain("pnpm test");
    expect(out).toContain("pnpm run dev");
  });
});
