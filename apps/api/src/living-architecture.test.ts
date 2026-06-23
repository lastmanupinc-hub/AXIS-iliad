import { describe, it, expect } from "vitest";
import { buildFactOracle, verifyClaims, claimDropReason, type ArchClaim, type ExtractedSymbol } from "./living-architecture.js";
import type { ContextMap } from "@axis/context-engine";

// Minimal ContextMap carrying only the fields the oracle reads.
function ctxFixture(): ContextMap {
  return {
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
