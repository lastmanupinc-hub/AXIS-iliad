// config.ts — single source for API origins and public-surface counts (WO-F5).
//
// Every page that names a base URL or a global catalog count (programs /
// artifacts / MCP tools / endpoints) must import it from here — never inline
// the literal. apps/api/src/count-honesty.test.ts reads this file and fails CI
// if the pinned counts drift from apps/api/src/counts.ts (which derives them
// from @axis/generator-core's REGISTRY), or if a divergent API host appears
// anywhere in apps/web/src.
//
// The counts are pinned rather than imported because importing the API package
// (or @axis/generator-core) from the web bundle would drag the whole generator
// registry into the browser build.

/**
 * Canonical production API origin. Same-site with the web origin
 * (iliad.trustfabric.ai) so the HttpOnly axis_session cookie rides on API
 * calls (SameSite=Lax). A Render custom domain on the same service as the
 * legacy *.onrender.com host — always use this one.
 */
export const PROD_API_BASE = "https://api.iliad.trustfabric.ai";

const isLocalHost =
  typeof window === "undefined" ||
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

/**
 * Base for fetch() calls: explicit env override, else same-origin ("") in
 * local dev (Vite proxy), else the production origin.
 */
export const API_BASE: string = import.meta.env.VITE_API_URL ?? (isLocalHost ? "" : PROD_API_BASE);

/**
 * Absolute origin for user-facing copy — MCP config snippets, curl examples,
 * system prompts. Unlike API_BASE it is never "" (an empty base would render
 * broken snippets in local dev).
 */
export const DOCS_API_BASE: string = import.meta.env.VITE_API_URL || PROD_API_BASE;

// ─── Public-surface counts ──────────────────────────────────────
// Mirrors of apps/api/src/counts.ts — guarded against it by count-honesty.

/** Distinct programs in the catalog (= TOTAL_PROGRAMS). */
export const PROGRAM_COUNT = 21;

/**
 * Programs that have a free tier. The free tier is ARTIFACT-level as of
 * 2026-08-25 — every program ships free artifacts and withholds the rest — so
 * this is now the full program count, not a count of wholly-free programs.
 * Guarded by count-honesty.test.ts against FREE_GENERATORS.
 */
export const FREE_PROGRAM_COUNT = 21;

/**
 * Programs that are free in FULL (no withheld artifacts) — the original three.
 * Kept as a distinct constant because anonymous `POST /v1/analyze` callers who
 * want a complete program (rather than each program's free subset) still want
 * exactly these. Every OTHER program is now partially free too.
 */
export const FREE_PROGRAM_NAMES = ["search", "skills", "debug"] as const;

/** Programs with artifacts behind payment (derived — never pin separately). */
export const PRO_PROGRAM_COUNT = PROGRAM_COUNT - FREE_PROGRAM_NAMES.length;

/** Generated artifacts per full run (= TOTAL_GENERATORS). */
export const ARTIFACT_COUNT = 152; // +3 app_41: .vale.ini + styles/AXIS/ForbiddenPatterns.yml + styles/AXIS/PreferredTerms.yml (brand)

/**
 * Artifacts available with no payment, across ALL 21 programs — mirrors
 * FREE_GENERATORS in packages/generator-core/src/program-manifest.ts, which
 * apps/web can't import directly (it's a Node-only package). Guarded against
 * drift by count-honesty.test.ts in apps/api (H-Phase-A cycle 16 —
 * ExamplesPage.tsx previously hand-typed 12/89 here, both wrong, plus a
 * reference to a file that doesn't exist).
 */
export const FREE_FILE_COUNT = 47;

/**
 * Human-webapp-facing tool count — MCP_TOOL_COUNT (apps/api/src/counts.ts)
 * MINUS the estate-flagged planned-capability stubs (est_02/est_03), which
 * this comment used to (incorrectly) claim were equal. Guarded by
 * count-honesty.test.ts's nonEstateToolCount() against the real registry.
 */
export const TOOL_COUNT = 39; // +1: delete_snapshot (Glama coherence review, 2026-08-25)

/** REST endpoints on the API surface (= ENDPOINT_COUNT). */
export const ENDPOINT_COUNT = 186;
