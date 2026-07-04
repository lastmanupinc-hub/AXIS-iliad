import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import { analyzeUiSurface, generateUiAudit } from "./generators-frontend.js";
import { isApiRoute } from "./route-utils.js";

// ─── DEBUG sweep (Program 4 = Frontend): 8 concrete bugs ────────────────
// A deep-debug pass found the static UI scanner (analyzeUiSurface) and the
// route/score sinks misclassifying backend endpoints as pages, flagging
// commented-out code + JSX prose as real defects, missing multi-line tags,
// and contradicting the summary on styling. These lock the fixes.

function mkCtx(o: Partial<ContextMap> = {}): ContextMap {
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "app", type: "app", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 10, total_directories: 3, total_loc: 1000, file_tree_summary: [], top_level_layout: [] },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [],
    routes: o.routes ?? [],
    domain_models: [], sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.7 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
    ...o,
    detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: ["pnpm"], ci_platform: null, deployment_target: null, ...(o.detection ?? {}) },
  } as ContextMap;
}
const f = (path: string, content: string): SourceFile => ({ path, content, size: content.length });

// ── Bug 1: backend endpoints are not page routes ──
describe("isApiRoute — non-page endpoints don't count as UI pages", () => {
  it("classifies /v1, /mcp, /.well-known, graphql, and data files as API", () => {
    for (const p of ["/v1/foo", "/mcp", "/mcp/tools", "/graphql", "/.well-known/ai-plugin.json", "/data.json", "/sitemap.xml", "/robots.txt"])
      expect(isApiRoute(p), p).toBe(true);
  });
  it("classifies real page routes as NOT API", () => {
    for (const p of ["/", "/dashboard", "/settings/profile", "/blog/hello"])
      expect(isApiRoute(p), p).toBe(false);
  });
  it("route-coverage score does NOT inflate from backend endpoints", () => {
    const apiRoutes = ["/v1/a", "/v1/b", "/v1/c", "/mcp", "/v1/d", "/v1/e", "/v1/f"].map(path => ({ method: "POST", path, source_file: "apps/api/src/server.ts" }));
    const out = generateUiAudit(mkCtx({ routes: apiRoutes })).content;
    // 7 endpoints, all backend → 0 page routes → no +10 (regression: was "+10")
    expect(out).toContain("| Route coverage | 0 |");
  });
  it("route-coverage score DOES award +10 for real pages", () => {
    const pages = ["/", "/a", "/b", "/c", "/d", "/e"].map(path => ({ method: "GET", path, source_file: "apps/web/src/App.tsx" }));
    expect(generateUiAudit(mkCtx({ routes: pages })).content).toContain("| Route coverage | +10 |");
  });
});

// ── Bug 8: styling score reconciles with the summary ──
describe("ui-audit — styling score awards partial credit for CSS (not only Tailwind)", () => {
  it("a CSS/SCSS repo scores +5 styling, not 0 (was contradicting the summary)", () => {
    const out = generateUiAudit(mkCtx({ detection: { languages: [{ name: "CSS", file_count: 4, loc: 200, loc_percent: 100 }] } as ContextMap["detection"] })).content;
    expect(out).toContain("| Styling system | +5 |");
  });
});

// ── Bugs 2–7: the static UI scanner ──
describe("analyzeUiSurface — accurate, low-false-positive static scan", () => {
  it("Bug 4: does NOT flag commented-out code (block comment or trailing //)", () => {
    const found = analyzeUiSurface([f("src/A.tsx", [
      "/*",
      '<img src="old.png">',       // inside block comment
      "const dead = x as any;",    // inside block comment
      "*/",
      "const ok = 1; // <img> and cast as any removed",
    ].join("\n"))]);
    expect(found).toEqual([]);
  });

  it("Bug 5: does NOT flag `: any` in JSX prose, but DOES flag a real annotation", () => {
    const prose = analyzeUiSurface([f("src/B.tsx", "<span>Availability: any status</span>")]);
    expect(prose.filter(x => x.category === "any-type")).toEqual([]);
    const real = analyzeUiSurface([f("src/C.tsx", "function pick(opts: any) { return opts; }")]);
    expect(real.some(x => x.category === "any-type")).toBe(true);
    const generic = analyzeUiSurface([f("src/D.tsx", "const [v, setV] = useState<any>(null);")]);
    expect(generic.some(x => x.category === "any-type")).toBe(true);
  });

  it("Bug 3: does NOT flag a stopPropagation/preventDefault-only onClick", () => {
    const found = analyzeUiSurface([f("src/E.tsx", "<div onClick={(e) => e.stopPropagation()}>x</div>")]);
    expect(found.filter(x => x.category === "click-nonbutton")).toEqual([]);
  });

  it("Bug 2 + 6: catches a multi-line <img> with no alt and a multi-line onClick", () => {
    const img = analyzeUiSurface([f("src/F.tsx", '<img\n  src="photo.jpg"\n/>')]);
    expect(img.some(x => x.category === "missing-alt")).toBe(true);
    const click = analyzeUiSurface([f("src/G.tsx", '<div\n  className="row"\n  onClick={go}\n>x</div>')]);
    expect(click.some(x => x.category === "click-nonbutton")).toBe(true);
  });

  it("Bug 6: `data-alt` / `aria-*` do NOT satisfy the alt requirement", () => {
    const found = analyzeUiSurface([f("src/H.tsx", '<img src="x.png" data-alt="decorative" />')]);
    expect(found.some(x => x.category === "missing-alt")).toBe(true);
    const real = analyzeUiSurface([f("src/I.tsx", '<img src="x.png" alt="A cat" />')]);
    expect(real.filter(x => x.category === "missing-alt")).toEqual([]);
  });

  it("Bug 7: flags <a onClick> with no href + <td onClick>, but not a real <a href>", () => {
    expect(analyzeUiSurface([f("src/J.tsx", "<a onClick={go}>go</a>")]).some(x => x.category === "click-nonbutton")).toBe(true);
    expect(analyzeUiSurface([f("src/K.tsx", "<td onClick={sel}>cell</td>")]).some(x => x.category === "click-nonbutton")).toBe(true);
    expect(analyzeUiSurface([f("src/L.tsx", '<a href="/x" onClick={go}>go</a>')]).filter(x => x.category === "click-nonbutton")).toEqual([]);
  });

  it("still flags a real onClick on a <div> and a dangerouslySetInnerHTML", () => {
    expect(analyzeUiSurface([f("src/M.tsx", "<div onClick={handle}>x</div>")]).some(x => x.category === "click-nonbutton")).toBe(true);
    expect(analyzeUiSurface([f("src/N.tsx", "<div dangerouslySetInnerHTML={{ __html: raw }} />")]).some(x => x.category === "dangerous-html")).toBe(true);
  });
});
