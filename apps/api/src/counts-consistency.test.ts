import { describe, it, expect } from "vitest";
import {
  ARTIFACT_COUNT,
  PROGRAM_COUNT,
  MCP_TOOL_COUNT,
  MCP_TOOL_COUNT_INCLUDING_PLANNED,
  ENDPOINT_COUNT,
} from "./counts.js";
import { MCP_TOOLS, PLANNED_CAPABILITY_NAMES } from "./mcp-server.js";
import { listAvailableGenerators } from "@axis/generator-core";

describe("counts.ts consistency", () => {
  it("ARTIFACT_COUNT equals the live generator registry size", () => {
    expect(ARTIFACT_COUNT).toBe(listAvailableGenerators().length);
  });

  it("PROGRAM_COUNT equals the distinct generator-program count", () => {
    const programs = new Set(listAvailableGenerators().map(g => g.program));
    expect(PROGRAM_COUNT).toBe(programs.size);
  });

  it("MCP_TOOL_COUNT equals the public tools/list size (planned stubs excluded)", () => {
    // Public count = MCP_TOOLS length minus the planned-capability stubs that
    // tools/list hides by default. Drives the "honest catalog" surface area
    // we publish to MCP registries.
    const publicTools = MCP_TOOLS.filter(t => !PLANNED_CAPABILITY_NAMES.has(t.name));
    expect(MCP_TOOL_COUNT).toBe(publicTools.length);
  });

  it("MCP_TOOL_COUNT_INCLUDING_PLANNED equals the live MCP_TOOLS array length", () => {
    expect(MCP_TOOL_COUNT_INCLUDING_PLANNED).toBe(MCP_TOOLS.length);
  });

  it("MCP_TOOL_COUNT is strictly less than MCP_TOOL_COUNT_INCLUDING_PLANNED while planned stubs exist", () => {
    expect(MCP_TOOL_COUNT).toBeLessThanOrEqual(MCP_TOOL_COUNT_INCLUDING_PLANNED);
    if (PLANNED_CAPABILITY_NAMES.size > 0) {
      expect(MCP_TOOL_COUNT).toBeLessThan(MCP_TOOL_COUNT_INCLUDING_PLANNED);
    }
  });

  it("ENDPOINT_COUNT is a positive integer", () => {
    expect(Number.isInteger(ENDPOINT_COUNT)).toBe(true);
    expect(ENDPOINT_COUNT).toBeGreaterThan(0);
  });
});
