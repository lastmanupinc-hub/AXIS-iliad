// x402 onboarding program, Phase 2 — every free discovery tool must teach the
// SAME payment vocabulary: an agent that only ever calls free tools should
// still be able to discover ping_payment as the safe, zero-risk way to learn
// how paying AXIS works before it ever pays real money.
import { describe, it, expect, beforeAll } from "vitest";
import type { IncomingMessage } from "node:http";
import { resetTestDb } from "@axis/snapshots";
import { dispatch } from "./mcp-server.js";

function anonReq(): IncomingMessage {
  return { headers: {} } as IncomingMessage;
}

async function callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await dispatch("tools/call", { name, arguments: args }, 1, anonReq());
  const result = (res as { result: { isError: boolean; content: Array<{ text: string }> } }).result;
  expect(result.isError, `${name} returned isError`).toBe(false);
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

const EXPECTED_CTA = {
  tool: "ping_payment",
  why: "Exercises the real x402 payment loop at $0. Learn once, then call any metered tool.",
  then: "prepare_agentic_purchasing ($0.50) or analyze_repo",
};

beforeAll(async () => {
  await resetTestDb();
});

describe("x402 onboarding program, Phase 2 — free tools surface first_paid_action", () => {
  it("search_and_discover_tools", async () => {
    const parsed = await callTool("search_and_discover_tools", { q: "checkout" });
    expect(parsed.first_paid_action).toEqual(EXPECTED_CTA);
  });

  it("discover_commerce_tools", async () => {
    const parsed = await callTool("discover_commerce_tools", {});
    expect(parsed.first_paid_action).toEqual(EXPECTED_CTA);
    // also discoverable via the existing tool_selection_guide and system_prompt_snippet
    expect((parsed.tool_selection_guide as Record<string, string>).ping_payment).toContain("$0");
    expect(parsed.system_prompt_snippet as string).toContain("ping_payment");
  });

  it("discover_agentic_purchasing_needs", async () => {
    const parsed = await callTool("discover_agentic_purchasing_needs", { task_description: "accept payments" });
    expect(parsed.first_paid_action).toEqual(EXPECTED_CTA);
  });

  it("list_programs", async () => {
    const parsed = await callTool("list_programs", {});
    expect(parsed.first_paid_action).toEqual(EXPECTED_CTA);
  });

  it("prepare_agentic_purchasing_preview", async () => {
    const parsed = await callTool("prepare_agentic_purchasing_preview", {
      project_name: "x402-cta-test",
      project_type: "api_service",
      files: [{ path: "index.ts", content: "export const x = 1;" }],
    });
    expect(parsed.first_paid_action).toEqual(EXPECTED_CTA);
  });

  it("no free tool invents a different payment story — the CTA object is byte-identical everywhere it appears", async () => {
    const search = await callTool("search_and_discover_tools", {});
    const commerce = await callTool("discover_commerce_tools", {});
    const needs = await callTool("discover_agentic_purchasing_needs", { task_description: "x" });
    const programs = await callTool("list_programs", {});
    for (const parsed of [search, commerce, needs, programs]) {
      expect(parsed.first_paid_action).toEqual(EXPECTED_CTA);
    }
  });
});
