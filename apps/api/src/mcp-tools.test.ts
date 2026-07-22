import { describe, it, expect } from "vitest";
import { MCP_TOOLS, getMcpToolBazaarInfo } from "./mcp-tools.js";

describe("getMcpToolBazaarInfo", () => {
  it("returns the REAL registered inputSchema for a real tool — never a fabricated one", () => {
    const realTool = MCP_TOOLS.find((t) => t.name === "analyze_repo")!;
    const info = getMcpToolBazaarInfo("analyze_repo");
    expect(info).toBeDefined();
    expect(info!.toolName).toBe("analyze_repo");
    expect(info!.description).toBe(realTool.description);
    expect(info!.inputSchema).toEqual(realTool.inputSchema);
    // Not a copy that could drift silently — the same object reference.
    expect(info!.inputSchema).toBe(realTool.inputSchema);
  });

  it("returns undefined for a tool name that isn't in MCP_TOOLS — callers must omit the bazaar block, never fabricate one", () => {
    expect(getMcpToolBazaarInfo("not_a_real_tool")).toBeUndefined();
    expect(getMcpToolBazaarInfo("")).toBeUndefined();
  });

  it("every entry in MCP_TOOLS resolves through this lookup by its own name", () => {
    // Guards against the lookup logic silently missing entries (e.g. a future
    // MCP_TOOLS refactor that stops using a flat `name` field).
    for (const tool of MCP_TOOLS) {
      const info = getMcpToolBazaarInfo(tool.name);
      expect(info, `expected a bazaar lookup hit for ${tool.name}`).toBeDefined();
      expect(info!.inputSchema).toBe(tool.inputSchema);
    }
  });

  it("carries a first example's input/output when the tool has one, and omits them when it doesn't", () => {
    const withExamples = MCP_TOOLS.find((t) => "examples" in t && (t.examples as unknown[])?.length > 0);
    expect(withExamples, "expected at least one MCP_TOOLS entry with examples to exist for this test to be meaningful").toBeDefined();
    const info = getMcpToolBazaarInfo(withExamples!.name);
    expect(info!.example).toBeDefined();
  });
});
