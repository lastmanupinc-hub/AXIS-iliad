import type { ContextMap } from "@axis/context-engine";

export type Route = ContextMap["routes"][number];

/**
 * Collapse a raw route list for DISPLAY in a generated artifact.
 *
 * The parser emits routes as per-mention rows: the same `METHOD PATH` appears
 * once per file that references it (source AND test files AND README examples),
 * so a real repo yields hundreds of rows that are ~70% test/mock/example noise
 * and exact duplicates. This dedupes by (method, path), prefers a non-test
 * source-file attribution, and drops test-only rows when any real route exists.
 *
 * Pure + deterministic: first-seen order is preserved (the parser's file-walk
 * order, itself deterministic), and the test→non-test upgrade never reorders.
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
    } else if (existing.source_file.includes(".test.") && !r.source_file.includes(".test.")) {
      seen.set(key, r);
    }
  }
  const deduped = [...seen.values()];
  const nonTest = deduped.filter((r) => !r.source_file.includes(".test."));
  return nonTest.length > 0 ? nonTest : deduped;
}
