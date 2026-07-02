import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
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

  it("ENDPOINT_COUNT equals the live server.ts route count (excluding /.well-known + /oauth infra)", () => {
    // Derive from server.ts by parsing it as a FILE (importing it here would create the
    // very cycle counts.ts documents). Count every router.METHOD("path") registration
    // except pure protocol infrastructure: /.well-known/* discovery manifests (RFC 8615)
    // and /oauth/* authorization-server endpoints (RFC 8414). Any newly (un)registered
    // product route now drifts this count and fails CI until ENDPOINT_COUNT is updated —
    // the guard counts.ts has always claimed but never actually had.
    const serverSrc = readFileSync(new URL("./server.ts", import.meta.url), "utf-8");
    let derived = 0;
    for (const m of serverSrc.matchAll(/router\.(get|post|put|delete|patch)\("([^"]+)"/g)) {
      const path = m[2];
      if (path.startsWith("/.well-known/") || path.startsWith("/oauth/")) continue;
      derived++;
    }
    // Floor guards against a broken regex silently reporting zero and "passing".
    expect(derived, "route parser found nothing in server.ts").toBeGreaterThan(100);
    expect(ENDPOINT_COUNT).toBe(derived);
  });
});
