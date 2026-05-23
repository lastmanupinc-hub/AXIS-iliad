import { describe, it, expect } from "vitest";
import { ARTIFACT_COUNT, PROGRAM_COUNT, MCP_TOOL_COUNT, ENDPOINT_COUNT } from "./counts.js";
import { MCP_TOOLS } from "./mcp-server.js";
import { listAvailableGenerators } from "@axis/generator-core";

describe("counts.ts consistency", () => {
  it("ARTIFACT_COUNT equals the live generator registry size", () => {
    expect(ARTIFACT_COUNT).toBe(listAvailableGenerators().length);
  });

  it("PROGRAM_COUNT equals the distinct generator-program count", () => {
    const programs = new Set(listAvailableGenerators().map(g => g.program));
    expect(PROGRAM_COUNT).toBe(programs.size);
  });

  it("MCP_TOOL_COUNT equals the live MCP_TOOLS array length", () => {
    expect(MCP_TOOL_COUNT).toBe(MCP_TOOLS.length);
  });

  it("ENDPOINT_COUNT is a positive integer", () => {
    expect(Number.isInteger(ENDPOINT_COUNT)).toBe(true);
    expect(ENDPOINT_COUNT).toBeGreaterThan(0);
  });
});
