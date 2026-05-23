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
 * MCP_TOOL_COUNT is the **public** count — the number of tools that
 * `tools/list` returns by default (planned-capability stubs hidden).
 * MCP_TOOL_COUNT_INCLUDING_PLANNED is the full catalog including the
 * 12 roadmap stubs visible only via `?include_planned=true`.
 */
import { TOTAL_GENERATORS, TOTAL_PROGRAMS } from "@axis/generator-core";

export const ARTIFACT_COUNT = TOTAL_GENERATORS;
export const PROGRAM_COUNT = TOTAL_PROGRAMS;
export const MCP_TOOL_COUNT = 19;
export const MCP_TOOL_COUNT_INCLUDING_PLANNED = 27;
export const ENDPOINT_COUNT = 143;
