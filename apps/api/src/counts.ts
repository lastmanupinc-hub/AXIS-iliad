/**
 * Canonical counts — import these instead of hardcoding numbers in strings.
 *
 * ARTIFACT_COUNT and PROGRAM_COUNT are derived from @axis/generator-core's
 * REGISTRY, so they cannot drift when generators are added or removed.
 *
 * MCP_TOOL_COUNT and ENDPOINT_COUNT are pinned manually because deriving
 * them in production would create import cycles (mcp-server.ts and server.ts
 * both already import from counts.ts). counts-consistency.test.ts asserts both
 * equal the live values — MCP_TOOL_COUNT against the imported MCP_TOOLS array,
 * and ENDPOINT_COUNT against the routes parsed out of server.ts (read as a file
 * at test time, which sidesteps the import cycle) — so CI fails on drift.
 *
 * ENDPOINT_COUNT is every router.METHOD("path") registration in server.ts
 * EXCEPT pure protocol infrastructure: /.well-known/* discovery manifests
 * (RFC 8615) and /oauth/* authorization-server endpoints (RFC 8414). Everything
 * else — including the MCP transport surface and the portal bridge — counts.
 *
 * Catalog honesty under the revised policy is build-not-redact: every
 * tool we advertise in tools/list also appears in MCP_TOOL_COUNT. It stays
 * flat when a planned-stub is promoted to an owned implementation.
 *
 * ESTATE DOCTRINE (revised 2026-08-22, est_02 — see
 * docs/ESTATE_FEDERATION_STRATEGY.md): this comment used to say, as an
 * absolute rule, "the count drops when a capability is delegated to a
 * sibling AXIS process — Iliad does not mint a tool for capabilities it
 * doesn't own." That is no longer universally true. Owner directive:
 * sibling AXIS properties (PAI'D, Foundry, Launch, TrustFabric) become
 * callable through the Iliad MCP as ESTATE-FLAGGED proxy tools
 * (McpToolCatalogEntry.estate, apps/api/src/mcp-tool-impls.ts) — Iliad
 * mints the tool, but it stays visibly marked as a relay to a sibling
 * rather than a claim of owned capability, and it counts toward
 * MCP_TOOL_COUNT like any other real tool (catalog honesty applies
 * regardless of who ultimately serves the call). image_generation → AXIS
 * Foundry (via the sibling_owned status, not an estate proxy) is still true
 * as a concrete example of a capability with NO Iliad-hosted tool of any
 * kind. est_03 (2026-08-22) shipped the first 5 real estate-flagged
 * entries — Foundry Wave-1 PLANNED_CAPABILITIES stubs (mcp-tools.ts) —
 * proving the mechanism est_02 wired; MCP_TOOL_COUNT counts them, and the
 * human-webapp-facing derived non-estate count (apps/web/src/config.ts's
 * TOOL_COUNT — see count-honesty.test.ts's nonEstateToolCount()) does not.
 */
import { TOTAL_GENERATORS, TOTAL_PROGRAMS } from "@axis/generator-core";

export const ARTIFACT_COUNT = TOTAL_GENERATORS;
export const PROGRAM_COUNT = TOTAL_PROGRAMS;
export const MCP_TOOL_COUNT = 43;
export const ENDPOINT_COUNT = 178; // +2 admin-page-reachability fix: POST + DELETE /v1/admin/session (HttpOnly admin-elevation cookie login/logout)

/** API/server version. Single source — keep in lockstep with apps/api/package.json. */
export const API_VERSION = "0.5.3";
