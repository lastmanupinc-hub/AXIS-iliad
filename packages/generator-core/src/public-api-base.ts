// ─── Iliad's public API origin — the one literal ─────────────────
//
// The live API is the Fly app axis-api-iliad behind its custom domain. It moved
// off Render on 2026-08-31; the Render host is suspended and answers "Service
// Suspended", so no surface may name it again.
//
// Every Node-side URL Iliad hands out is built on this value:
//   - apps/api/src/public-base.ts: PUBLIC_API_BASE = env PUBLIC_API_BASE, else this
//   - apps/cli/src/status.ts:      DEFAULT_API_URL
//   - buildEstateManifest():       this_property.api_base and mcp.url
// The web bundle (apps/web/src/config.ts PROD_API_BASE) and the published SDK
// (packages/sdk DEFAULT_BASE) ship on their own and keep their own copy;
// apps/api/src/public-base.test.ts pins both equal to this one.

/** Iliad's live public API origin: no trailing slash, no path. */
export const DEFAULT_PUBLIC_API_BASE = "https://api.iliad.trustfabric.ai";
