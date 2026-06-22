/**
 * Canonical counts — import these instead of hardcoding numbers in strings.
 *
 * ARTIFACT_COUNT and PROGRAM_COUNT are derived from @axis/generator-core's
 * REGISTRY, so they cannot drift when generators are added or removed.
 *
 * MCP_TOOL_COUNT and ENDPOINT_COUNT are pinned manually because deriving
 * them would create import cycles (mcp-server.ts and server.ts both
 * already import from counts.ts). counts.consistency.test asserts both
 * equal the live values, so CI fails on drift.
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
export const MCP_TOOL_COUNT = 28;
export const ENDPOINT_COUNT = 143;

/** API/server version. Single source — keep in lockstep with apps/api/package.json. */
export const API_VERSION = "0.5.3";
