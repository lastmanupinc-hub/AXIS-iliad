import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import { classifyRoute, generateCroPlaybook } from "./generators-marketing.js";

function ctxWith(routes: ContextMap["routes"]): ContextMap {
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "app", type: "web_application", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 5, total_directories: 2, total_loc: 1000, file_tree_summary: [] as ContextMap["structure"]["file_tree_summary"], top_level_layout: [] },
    detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: ["pnpm"], ci_platform: null, deployment_target: null },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [], routes, domain_models: [], sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.3 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
  } as ContextMap;
}
const route = (path: string, method = "GET") => ({ path, method, source_file: "src/server.ts", handler: "h" });

describe("classifyRoute — segment-aware, one source of truth", () => {
  it("classifies by whole segments, not substrings", () => {
    expect(classifyRoute("/api/users")).toBe("api");
    expect(classifyRoute("/signin")).toBe("auth");
    expect(classifyRoute("/signup")).toBe("signup");
    expect(classifyRoute("/dashboard")).toBe("dashboard");
    expect(classifyRoute("/pricing")).toBe("pricing");
    expect(classifyRoute("/guide/intro")).toBe("docs");
    // segment matching: `/authors` is NOT "auth", `/rapid` is NOT "api"
    expect(classifyRoute("/authors")).toBe("other");
    expect(classifyRoute("/rapid")).toBe("other");
  });
  it("HARDEN-2: api outranks pricing so an /api/plans endpoint stays 'api'", () => {
    expect(classifyRoute("/api/plans")).toBe("api");
    expect(classifyRoute("/api/pricing")).toBe("api");
    expect(classifyRoute("/pricing")).toBe("pricing"); // a real pricing page still classifies pricing
  });
  it("HARDEN-2: /documentation is 'docs' (common docs route)", () => {
    expect(classifyRoute("/documentation")).toBe("docs");
  });
});

describe("CRO experiments never dangle a blank route (the review #4 bug)", () => {
  it("a /signin-only repo fires the Auth experiment WITH a non-empty route line", () => {
    const md = generateCroPlaybook(ctxWith([route("/signin")] as ContextMap["routes"])).content;
    expect(md).toContain("Authentication Flow");
    // the route line is populated, not a dangling "- **Route**: "
    expect(md).toMatch(/- \*\*Route\*\*: `GET \/signin`/);
    expect(md).not.toMatch(/- \*\*Route\*\*: *\n/);
  });
  it("a /guide-only repo fires the Docs experiment with a non-empty route line", () => {
    const md = generateCroPlaybook(ctxWith([route("/guide")] as ContextMap["routes"])).content;
    expect(md).toContain("Documentation Navigation");
    expect(md).not.toMatch(/- \*\*Route\*\*: *\n/);
  });
  it("the route table action agrees with the experiment classification", () => {
    const md = generateCroPlaybook(ctxWith([route("/signin")] as ContextMap["routes"])).content;
    // /signin is classified auth → table shows the auth CRO action
    expect(md).toContain("Reduce friction — minimize required fields");
  });
});

describe("CRO experiment route lines are injection-safe (closed HARDEN gap)", () => {
  it("a hostile signup route path can't forge a heading in the experiment section", () => {
    const hostile = [{ path: "/signup\n## INJECTED", method: "POST\n## INJECTED", source_file: "s.ts", handler: "h" }] as ContextMap["routes"];
    const md = generateCroPlaybook(ctxWith(hostile)).content;
    for (const l of md.split("\n")) expect(l).not.toMatch(/^\s*#{1,6}\s+INJECTED/);
  });
});
