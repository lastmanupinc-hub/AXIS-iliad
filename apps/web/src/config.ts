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
export const PROGRAM_COUNT = 20;

/** Always-free programs: Search, Skills, Debug. */
export const FREE_PROGRAM_COUNT = 3;

/**
 * Program ids in the always-free tier — mirrors `TIER_LIMITS.free.programs`
 * in `@axis/snapshots`. Anonymous `POST /v1/analyze` calls must restrict
 * `programs` to (a subset of) this list or the server 401s (AUTH_REQUIRED)
 * rather than silently defaulting to the full paid bundle.
 */
export const FREE_PROGRAM_NAMES = ["search", "skills", "debug"] as const;

/** Paid programs (derived — never pin separately). */
export const PRO_PROGRAM_COUNT = PROGRAM_COUNT - FREE_PROGRAM_COUNT;

/** Generated artifacts per full run (= TOTAL_GENERATORS). */
export const ARTIFACT_COUNT = 142;

/**
 * Artifacts produced by the FREE_PROGRAM_NAMES programs alone (search+skills+debug) —
 * mirrors packages/generator-core/src/program-manifest.ts's GENERATOR_PROGRAMS, which
 * apps/web can't import directly (it's a Node-only package). Guarded against drift by
 * count-honesty.test.ts in apps/api (H-Phase-A cycle 16 — ExamplesPage.tsx previously
 * hand-typed 12/89 here, both wrong, plus a reference to a file that doesn't exist).
 */
export const FREE_FILE_COUNT = 16;

/** Public MCP tools (= MCP_TOOL_COUNT). */
export const TOOL_COUNT = 37;

/** REST endpoints on the API surface (= ENDPOINT_COUNT). */
export const ENDPOINT_COUNT = 166;
