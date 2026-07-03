import type { ContextMap } from "@axis/context-engine";

export type Route = ContextMap["routes"][number];

/**
 * A "noise" attribution — a file that MENTIONS a route but doesn't define the
 * app's real API surface: tests/mocks, benchmarks, and documentation examples
 * (README / other markdown). Dogfooding surfaced a Route Map where a `POST
 * /v1/my-tool` example in mpp/README.md and a `/users` benchmark route sat
 * alongside production endpoints. Matched case-insensitively.
 */
function isNoiseSource(sourceFile: string): boolean {
  return /\.(test|spec|bench)\.|(^|\/)readme|\.md$/i.test(sourceFile);
}

/**
 * Collapse a raw route list for DISPLAY in a generated artifact.
 *
 * The parser emits routes as per-mention rows: the same `METHOD PATH` appears
 * once per file that references it (source AND test files AND README examples),
 * so a real repo yields hundreds of rows that are ~70% test/mock/example noise
 * and exact duplicates. This dedupes by (method, path), upgrades a noise
 * attribution to a real source file when one exists, and drops noise-only rows
 * when any real route remains.
 *
 * Pure + deterministic: first-seen order is preserved (the parser's file-walk
 * order, itself deterministic), and the noise→real upgrade never reorders.
 */
export function displayRoutes(routes: readonly Route[]): Route[] {
  const seen = new Map<string, Route>();
  for (const r of routes) {
    // JSON-encode the [method, path] pair so two distinct routes can never
    // collide into one key — a plain `${method} ${path}` join would map both
    // {method:"GET /a", path:"b"} and {method:"GET", path:"/a b"} to "GET /a b".
    const key = JSON.stringify([r.method, r.path]);
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, r);
    } else if (isNoiseSource(existing.source_file) && !isNoiseSource(r.source_file)) {
      seen.set(key, r);
    }
  }
  const deduped = [...seen.values()];
  const real = deduped.filter((r) => !isNoiseSource(r.source_file));
  return real.length > 0 ? real : deduped;
}
