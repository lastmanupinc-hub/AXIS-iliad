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
 * tool we advertise in tools/list also appears in MCP_TOOL_COUNT. The
 * count drops when a capability is delegated to a sibling AXIS process
 * (e.g. image_generation → AXIS Foundry) — Iliad does not mint a tool
 * for capabilities it doesn't own. It stays flat when a planned-stub is
 * promoted to an owned implementation.
 */
import { TOTAL_GENERATORS, TOTAL_PROGRAMS } from "@axis/generator-core";

export const ARTIFACT_COUNT = TOTAL_GENERATORS;
export const PROGRAM_COUNT = TOTAL_PROGRAMS;
export const MCP_TOOL_COUNT = 37;
export const ENDPOINT_COUNT = 156;

/** API/server version. Single source — keep in lockstep with apps/api/package.json. */
export const API_VERSION = "0.5.3";
