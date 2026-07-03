import { describe, it, expect } from "vitest";
import { displayRoutes, type Route } from "./route-utils.js";

const r = (method: string, path: string, source_file: string): Route => ({ method, path, source_file });

describe("displayRoutes — dedup + noise-source suppression", () => {
  it("dedupes by method+path and never collides distinct routes (JSON key)", () => {
    const out = displayRoutes([
      r("GET /a", "b", "src/x.ts"),
      r("GET", "/a b", "src/y.ts"),
    ]);
    expect(out).toHaveLength(2); // must NOT collapse to one
  });

  it("upgrades a test attribution to a real source file, keeping one row", () => {
    const out = displayRoutes([
      r("GET", "/health", "src/server.test.ts"),
      r("GET", "/health", "src/server.ts"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].source_file).toBe("src/server.ts");
  });

  it("drops noise-only sources — tests, benchmarks, and README/markdown examples — when real routes exist", () => {
    const out = displayRoutes([
      r("GET", "/real", "src/server.ts"),
      r("POST", "/__mock", "src/x.test.ts"),
      r("POST", "/v1/my-tool", "packages/mpp/README.md"),
      r("GET", "/bench", "packages/repo-parser/src/perf.bench.ts"),
      r("GET", "/doc", "docs/api.md"),
    ]);
    expect(out.map((x) => x.path)).toEqual(["/real"]);
  });

  it("prefers a real source over a README attribution for the SAME route", () => {
    const out = displayRoutes([
      r("POST", "/v1/tool", "packages/mpp/README.md"),
      r("POST", "/v1/tool", "apps/api/src/server.ts"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].source_file).toBe("apps/api/src/server.ts");
  });

  it("falls back to noise routes when there is nothing else (documented-only API)", () => {
    const input = [r("GET", "/only-in-readme", "README.md")];
    expect(displayRoutes(input)).toEqual(input);
  });

  it("is order-preserving and deterministic", () => {
    const input = [
      r("GET", "/a", "src/a.ts"),
      r("GET", "/b", "src/b.ts"),
      r("GET", "/a", "src/a.test.ts"),
    ];
    const out = displayRoutes(input);
    expect(out.map((x) => x.path)).toEqual(["/a", "/b"]);
    expect(displayRoutes(input)).toEqual(out);
  });
});
