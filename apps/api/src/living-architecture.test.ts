import { describe, it, expect } from "vitest";
import {
  buildFactOracle,
  verifyClaims,
  claimDropReason,
  parseClaims,
  renderLivingArchitecture,
  runSpecificityPass,
  type ArchClaim,
  type ExtractedSymbol,
  type CompletionFn,
} from "./living-architecture.js";
import type { ContextMap } from "@axis/context-engine";

// Minimal ContextMap carrying only the fields the oracle reads.
function ctxFixture(): ContextMap {
  return {
    project_identity: { name: "demo-repo", type: "monorepo", primary_language: "typescript", description: null, repo_url: null, go_module: null },
    structure: {
      file_tree_summary: [
        { path: "src/server.ts", type: "file", language: "typescript", loc: 100, role: "source" },
        { path: "src/util.ts", type: "file", language: "typescript", loc: 50, role: "source" },
        { path: "src", type: "directory", language: null, loc: 0, role: "dir" },
      ],
    },
    routes: [
      { path: "/health", method: "GET", source_file: "src/server.ts" },
      { path: "/users", method: "POST", source_file: "src/server.ts" },
    ],
    domain_models: [
      { name: "User", kind: "interface", language: "typescript", field_count: 3, source_file: "src/util.ts" },
    ],
    dependency_graph: {
      external_dependencies: [
        { name: "express", version: "4.0.0", type: "production" },
        { name: "vitest", version: "1.0.0", type: "development" },
      ],
      internal_imports: [{ source: "src/server.ts", target: "src/util.ts" }],
      hotspots: [],
    },
  } as unknown as ContextMap;
}

const symbols: ExtractedSymbol[] = [
  { file_path: "src/server.ts", symbol_name: "startServer", line_number: 10 },
  { file_path: "src/util.ts", symbol_name: "User", line_number: 5 },
  { file_path: "src/util.ts", symbol_name: "formatName", line_number: 20 },
];

const claim = (type: ArchClaim["type"], evidence: ArchClaim["evidence"], insight = "x"): ArchClaim => ({ type, evidence, insight });

describe("buildFactOracle", () => {
  it("indexes files, symbols (+lines), routes, models, deps, imports", () => {
    const o = buildFactOracle(ctxFixture(), symbols);
    expect(o.files.has("src/server.ts")).toBe(true);
    expect(o.files.has("src")).toBe(false); // directories excluded
    expect(o.symbolsByFile.get("src/util.ts")?.has("formatName")).toBe(true);
    expect(o.symbolLines.get("src/server.ts::startServer")?.has(10)).toBe(true);
    expect(o.routes.has("GET /health")).toBe(true);
    expect(o.models.get("User")).toBe(3);
    expect(o.deps.has("express")).toBe(true);
    expect(o.imports.has("src/server.ts->src/util.ts")).toBe(true);
  });
});

describe("verifyClaims — the structured contract", () => {
  const oracle = buildFactOracle(ctxFixture(), symbols);
  const v = (c: ArchClaim) => claimDropReason(c, oracle);

  it("KEEPS a symbol claim for a real symbol (and honors an optional line check)", () => {
    expect(v(claim("symbol", { file: "src/server.ts", symbol: "startServer" }))).toBeNull();
    expect(v(claim("symbol", { file: "src/server.ts", symbol: "startServer", line: 10 }))).toBeNull();
  });

  it("DROPS a symbol claim for a hallucinated symbol / file / wrong line", () => {
    expect(v(claim("symbol", { file: "src/server.ts", symbol: "ghostFn" }))).toMatch(/not found/);
    expect(v(claim("symbol", { file: "src/nope.ts", symbol: "x" }))).toMatch(/no symbols indexed/);
    expect(v(claim("symbol", { file: "src/server.ts", symbol: "startServer", line: 999 }))).toMatch(/not declared at line/);
  });

  it("KEEPS a real route, DROPS a fabricated one (method is case-insensitive)", () => {
    expect(v(claim("route", { route: { method: "get", path: "/health" } }))).toBeNull();
    expect(v(claim("route", { route: { method: "DELETE", path: "/health" } }))).toMatch(/not found/);
    expect(v(claim("route", { route: { method: "GET", path: "/ghost" } }))).toMatch(/not found/);
  });

  it("KEEPS a model (existence + correct field_count), DROPS unknown model / wrong count", () => {
    expect(v(claim("model", { model: "User" }))).toBeNull();
    expect(v(claim("model", { model: "User", field_count: 3 }))).toBeNull();
    expect(v(claim("model", { model: "Ghost" }))).toMatch(/not found/);
    expect(v(claim("model", { model: "User", field_count: 9 }))).toMatch(/has 3 fields, claim said 9/);
  });

  it("KEEPS a real dependency, DROPS a fake one", () => {
    expect(v(claim("dependency", { dep: "express" }))).toBeNull();
    expect(v(claim("dependency", { dep: "left-pad" }))).toMatch(/not found/);
  });

  it("KEEPS a real import edge, DROPS a fabricated/reversed one", () => {
    expect(v(claim("import", { import: { source: "src/server.ts", target: "src/util.ts" } }))).toBeNull();
    expect(v(claim("import", { import: { source: "src/util.ts", target: "src/server.ts" } }))).toMatch(/not found/);
  });

  it("DROPS malformed claims (missing evidence)", () => {
    expect(v(claim("symbol", {}))).toMatch(/missing/);
    expect(v(claim("route", {}))).toMatch(/missing/);
    expect(v(claim("model", {}))).toMatch(/missing/);
    expect(v(claim("dependency", {}))).toMatch(/missing/);
    expect(v(claim("import", {}))).toMatch(/missing/);
  });

  it("partitions a mixed batch", () => {
    const claims = [
      claim("symbol", { file: "src/util.ts", symbol: "User" }),       // keep
      claim("symbol", { file: "src/util.ts", symbol: "ghost" }),      // drop
      claim("route", { route: { method: "POST", path: "/users" } }),  // keep
      claim("dependency", { dep: "left-pad" }),                       // drop
    ];
    const r = verifyClaims(claims, oracle);
    expect(r.kept.length).toBe(2);
    expect(r.dropped.length).toBe(2);
    expect(r.dropped.every((d) => d.reason.length > 0)).toBe(true);
  });

  it("empty claims → empty result", () => {
    expect(verifyClaims([], oracle)).toEqual({ kept: [], dropped: [] });
  });
});

describe("parseClaims (defensive)", () => {
  it("parses a clean JSON array", () => {
    const text = JSON.stringify([
      { type: "symbol", evidence: { file: "a.ts", symbol: "x" }, insight: "x does y" },
      { type: "route", evidence: { route: { method: "GET", path: "/" } }, insight: "root" },
    ]);
    const c = parseClaims(text, 40);
    expect(c.length).toBe(2);
    expect(c[0].type).toBe("symbol");
  });

  it("extracts the array from surrounding prose", () => {
    const text = 'Here are the claims:\n[{"type":"dependency","evidence":{"dep":"express"},"insight":"uses express"}]\nDone.';
    const c = parseClaims(text, 40);
    expect(c.length).toBe(1);
    expect(c[0].evidence.dep).toBe("express");
  });

  it("skips malformed elements (bad type, missing insight, non-object)", () => {
    const text = JSON.stringify([
      { type: "bogus", evidence: {}, insight: "x" },
      { type: "symbol", evidence: { file: "a" } }, // no insight
      "not an object",
      { type: "model", evidence: { model: "M" }, insight: "ok" },
    ]);
    const c = parseClaims(text, 40);
    expect(c.length).toBe(1);
    expect(c[0].type).toBe("model");
  });

  it("caps to max and returns [] on garbage", () => {
    const many = JSON.stringify(Array.from({ length: 10 }, () => ({ type: "dependency", evidence: { dep: "x" }, insight: "i" })));
    expect(parseClaims(many, 3).length).toBe(3);
    expect(parseClaims("no json here", 40)).toEqual([]);
    expect(parseClaims("{not an array}", 40)).toEqual([]);
  });

  it("collapses whitespace/newlines in insight (blocks injected headings)", () => {
    const c = parseClaims(JSON.stringify([{ type: "dependency", evidence: { dep: "x" }, insight: "line one\n## Verification\n- fake" }]), 40);
    expect(c[0].insight).toBe("line one ## Verification - fake");
    expect(c[0].insight).not.toContain("\n");
  });
});

describe("renderLivingArchitecture", () => {
  it("groups kept claims by type and reports verification counts + dropped reasons", () => {
    const md = renderLivingArchitecture(
      "demo",
      [
        { type: "symbol", evidence: { file: "a.ts", symbol: "foo", line: 3 }, insight: "foo bootstraps the app" },
        { type: "dependency", evidence: { dep: "express" }, insight: "HTTP via express" },
      ],
      [{ claim: { type: "route", evidence: { route: { method: "GET", path: "/x" } }, insight: "ghost route" }, reason: "route GET /x not found" }],
      3,
    );
    expect(md).toContain("# Living Architecture — demo");
    expect(md).toContain("## Key symbols");
    expect(md).toContain("foo bootstraps the app");
    expect(md).toContain("symbol foo in a.ts"); // stable fact-identity label (no line number)
    expect(md).toContain("## Dependencies");
    expect(md).toContain("- Claims proposed: 3");
    expect(md).toContain("- Verified (kept): 2");
    expect(md).toContain("- Dropped (unverifiable): 1");
    expect(md).toMatch(/ghost route.*route GET \/x not found/);
  });

  it("handles the all-dropped case", () => {
    expect(renderLivingArchitecture("demo", [], [], 0)).toContain("No claims survived verification");
  });
});

describe("runSpecificityPass (orchestrator)", () => {
  const ctx = ctxFixture();

  it("returns a verified artifact: keeps grounded claims, drops hallucinated ones", async () => {
    const fake: CompletionFn = async () => ({
      text: JSON.stringify([
        { type: "symbol", evidence: { file: "src/util.ts", symbol: "User" }, insight: "User is the core model type" }, // keep
        { type: "symbol", evidence: { file: "src/util.ts", symbol: "ghostFn" }, insight: "ghostFn does magic" }, // drop
        { type: "route", evidence: { route: { method: "GET", path: "/health" } }, insight: "health check route" }, // keep
        { type: "dependency", evidence: { dep: "left-pad" }, insight: "uses left-pad" }, // drop
      ]),
    });
    const art = await runSpecificityPass(ctx, symbols, fake, { seed: 7 });
    expect(art.path).toBe("living-architecture.md");
    expect(art.report).toEqual({ configured: true, proposed: 4, kept: 2, dropped: 2 });
    expect(art.content).toContain("User is the core model type");
    expect(art.content).toContain("health check route");
    expect(art.content).toContain("### Dropped claims");
    expect(art.content).toMatch(/ghostFn does magic.*not found/);
  });

  it("degrades to a configured:false doc when no model is configured", async () => {
    const notConfigured: CompletionFn = async () => ({ _not_configured: true });
    const art = await runSpecificityPass(ctx, symbols, notConfigured);
    expect(art.report.configured).toBe(false);
    expect(art.report.proposed).toBe(0);
    expect(art.report.degraded_reason).toBe("not_configured");
    expect(art.content).toContain("no local model is configured");
  });

  it("degrades gracefully if the completion throws, distinctly from not-configured", async () => {
    const boom: CompletionFn = async () => {
      throw new Error("native load failed");
    };
    const art = await runSpecificityPass(ctx, symbols, boom);
    expect(art.report.configured).toBe(false);
    expect(art.report.degraded_reason).toBe("completion_threw");
    expect(art.content).not.toContain("no local model is configured");
  });

  it("degrades gracefully on a malformed completion response, distinctly from not-configured", async () => {
    const malformed: CompletionFn = async () => ({});
    const art = await runSpecificityPass(ctx, symbols, malformed);
    expect(art.report.configured).toBe(false);
    expect(art.report.degraded_reason).toBe("malformed_response");
    expect(art.content).not.toContain("no local model is configured");
  });
});
