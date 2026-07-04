import { isApiRoute } from "./route-utils.js";

// Path-segment matching for SEO route classification.
//
// The SEO generators classify routes (index vs noindex, schema type, crawl
// priority) by testing the path for keywords. Doing that with bare substrings
// is silently WRONG: `path.includes("auth")` matches `/authors` (a real,
// indexable blog author page → wrongly de-indexed and Disallow'd in robots.txt),
// `"account"` matches `/accounting` (a revenue page), `"plan"` matches
// `/explanation`, `"signin"` matches `/assigning`. Match whole path SEGMENTS
// instead — split on `/`, `-`, `_` — so `auth` matches the `/auth` segment but
// never `/authors`.

/** Lowercased path segments, split on `/`, `-`, and `_`. */
export function pathSegments(path: string): string[] {
  return path.toLowerCase().split(/[/\-_]+/).filter(Boolean);
}

/** True if any path SEGMENT exactly equals one of the tokens (segment-aware, not substring). */
export function pathHasSegment(path: string, tokens: readonly string[]): boolean {
  const segs = pathSegments(path);
  return segs.some((seg) => tokens.includes(seg));
}

// One shared noindex vocabulary. Before, each SEO generator hand-rolled its own
// list, so the same route was indexed by one file and noindex'd by another
// (contradictory directives shipped together). Auth/account/internal segments.
export const NOINDEX_SEGMENTS: readonly string[] = [
  "api", "v1", "graphql", "_next",
  "login", "signin", "logout", "oauth", "signup", "register", "auth",
  "dashboard", "account", "settings", "profile",
];

/** Whether a route should be excluded from the sitemap / marked noindex — the ONE decision all SEO generators share. */
export function isNoindexRoute(path: string, method: string): boolean {
  // isApiRoute() catches the non-page endpoint SHAPES the segment list can't —
  // `/mcp`, `/.well-known/*`, and static/data files (`*.json`, `*.txt`, `*.xml`,
  // `favicon.ico`, …). Without it, /robots.txt & /sitemap.xml were emitted as
  // indexable "Standard page" and /llms.txt got a full <title>/canonical/OG audit.
  return method !== "GET" || isApiRoute(path) || pathHasSegment(path, NOINDEX_SEGMENTS);
}
