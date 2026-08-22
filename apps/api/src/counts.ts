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
 * Foundry is STILL true as a concrete example today (zero estate-flagged
 * tools exist yet — est_02 wires the mechanism; est_03/04/05 build the
 * first stubs and proxies), but is no longer stated as a platform-wide
 * absolute.
 */
import { TOTAL_GENERATORS, TOTAL_PROGRAMS } from "@axis/generator-core";

export const ARTIFACT_COUNT = TOTAL_GENERATORS;
export const PROGRAM_COUNT = TOTAL_PROGRAMS;
export const MCP_TOOL_COUNT = 38;
export const ENDPOINT_COUNT = 168;

/** API/server version. Single source — keep in lockstep with apps/api/package.json. */
export const API_VERSION = "0.5.3";
