/**
 * Tests for:
 *   - Budget negotiation (mpp.ts: getPricingTier, negotiatePrice, build402NegotiationBody, parseAgentBudget, resolveAgentMode)
 *   - Probe classification (mcp-server.ts: classifyProbe, captureIntent, getIntentLog)
 *   - Evidence scoring (handlers.ts: computePurchasingReadinessEvidence)
 *   - Probe-aware probe-intent endpoint (handlers.ts: handleProbeIntent with probe_class)
 *   - Budget-aware /for-agents endpoint (handlers.ts: handleForAgents with budget_negotiation)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, type Server } from "node:http";
import type { IncomingMessage } from "node:http";
import { openMemoryDb, closeDb } from "@axis/snapshots";
import { Router } from "./router.js";
import {
  getPricingTier,
  negotiatePrice,
  build402NegotiationBody,
  parseAgentBudget,
  resolveAgentMode,
} from "./mpp.js";
import {
  classifyProbe,
  captureIntent,
  getIntentLog,
} from "./mcp-server.js";
import {
  computePurchasingReadinessEvidence,
  handleForAgents,
  handleProbeIntent,
} from "./handlers.js";

// ─── HTTP helper ─────────────────────────────────────────────────

const TEST_PORT = 44519;
let server: Server;

async function postReq(
  path: string,
  body: unknown,
  extraHeaders?: Record<string, string>,
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const r = require("node:http").request(
      {
        hostname: "127.0.0.1",
        port: TEST_PORT,
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
          ...extraHeaders,
        },
      },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers as Record<string, string | string[] | undefined>,
            body: Buffer.concat(chunks).toString("utf-8"),
          });
        });
      },
    );
    r.on("error", reject);
    r.end(data);
  });
}

async function getReq(
  path: string,
  extraHeaders?: Record<string, string>,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const r = require("node:http").request(
      {
        hostname: "127.0.0.1",
        port: TEST_PORT,
        path,
        method: "GET",
        headers: extraHeaders,
      },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf-8"),
          });
        });
      },
    );
    r.on("error", reject);
    r.end();
  });
}

// ─── Server setup ─────────────────────────────────────────────────

beforeAll(async () => {
  openMemoryDb();
  const router = new Router();
  router.get("/for-agents", handleForAgents);
  router.post("/probe-intent", handleProbeIntent);
  server = createServer((r, res) => router.handle(r, res));
  await new Promise<void>(resolve => server.listen(TEST_PORT, resolve));
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close(err => (err ? reject(err) : resolve())),
  );
  closeDb();
});

// ═════════════════════════════════════════════════════════════════
// BUDGET NEGOTIATION — getPricingTier
// ═════════════════════════════════════════════════════════════════

describe("getPricingTier", () => {
  it("returns correct tier for prepare_for_agentic_purchasing", () => {
    const tier = getPricingTier("prepare_for_agentic_purchasing");
    expect(tier.tool).toBe("prepare_for_agentic_purchasing");
    expect(tier.standard_cents).toBe(50);
    expect(tier.lite_cents).toBe(25);
  });

  it("returns correct tier for analyze_repo", () => {
    const tier = getPricingTier("analyze_repo");
    expect(tier.standard_cents).toBe(50);
    expect(tier.lite_cents).toBe(15);
  });

  it("returns correct tier for analyze_files", () => {
    const tier = getPricingTier("analyze_files");
    expect(tier.standard_cents).toBe(50);
    expect(tier.lite_cents).toBe(15);
  });

  it("returns correct tier for improve_my_agent_with_axis", () => {
    const tier = getPricingTier("improve_my_agent_with_axis");
    expect(tier.standard_cents).toBe(50);
    expect(tier.lite_cents).toBe(20);
  });

  it("returns default tier for unknown tool", () => {
    const tier = getPricingTier("random_tool_xyz");
    expect(tier.tool).toBe("default");
    expect(tier.standard_cents).toBe(50);
    expect(tier.lite_cents).toBe(25);
  });

  it("all tiers have lite_cents <= standard_cents", () => {
    for (const tool of ["prepare_for_agentic_purchasing", "analyze_repo", "analyze_files", "improve_my_agent_with_axis", "default"]) {
      const tier = getPricingTier(tool);
      expect(tier.lite_cents).toBeLessThanOrEqual(tier.standard_cents);
    }
  });

  it("all tiers have non-empty lite_description", () => {
    for (const tool of ["prepare_for_agentic_purchasing", "analyze_repo", "improve_my_agent_with_axis"]) {
      const tier = getPricingTier(tool);
      expect(tier.lite_description.length).toBeGreaterThan(0);
    }
  });
});

// ═════════════════════════════════════════════════════════════════
// BUDGET NEGOTIATION — negotiatePrice
// ═════════════════════════════════════════════════════════════════

describe("negotiatePrice", () => {
  it("returns standard pricing when no budget_per_run_cents set", () => {
    const result = negotiatePrice({}, "analyze_repo");
    expect(result.amount_cents).toBe(50);
    expect(result.mode).toBe("standard");
    expect(result.accepted).toBe(true);
  });

  it("returns standard when budget >= standard price", () => {
    const result = negotiatePrice({ budget_per_run_cents: 100 }, "analyze_repo");
    expect(result.amount_cents).toBe(50);
    expect(result.mode).toBe("standard");
    expect(result.accepted).toBe(true);
  });

  it("returns standard when budget exactly equals standard price", () => {
    const result = negotiatePrice({ budget_per_run_cents: 50 }, "analyze_repo");
    expect(result.amount_cents).toBe(50);
    expect(result.mode).toBe("standard");
    expect(result.accepted).toBe(true);
  });

  it("returns lite when budget is between lite and standard", () => {
    const result = negotiatePrice({ budget_per_run_cents: 30 }, "analyze_repo");
    expect(result.amount_cents).toBe(15);
    expect(result.mode).toBe("lite");
    expect(result.accepted).toBe(true);
  });

  it("returns lite exactly at lite price", () => {
    const result = negotiatePrice({ budget_per_run_cents: 15 }, "analyze_repo");
    expect(result.amount_cents).toBe(15);
    expect(result.mode).toBe("lite");
    expect(result.accepted).toBe(true);
  });

  it("rejects when budget below lite price", () => {
    const result = negotiatePrice({ budget_per_run_cents: 5 }, "analyze_repo");
    expect(result.accepted).toBe(false);
    expect(result.mode).toBe("lite");
    expect(result.amount_cents).toBe(15);
    expect(result.reason).toContain("Minimum price");
  });

  it("rejects zero budget", () => {
    const result = negotiatePrice({ budget_per_run_cents: 0 }, "analyze_repo");
    expect(result.accepted).toBe(false);
  });

  it("uses tool-specific lite pricing for prepare_for_agentic_purchasing", () => {
    const result = negotiatePrice({ budget_per_run_cents: 30 }, "prepare_for_agentic_purchasing");
    expect(result.amount_cents).toBe(25);
    expect(result.mode).toBe("lite");
    expect(result.accepted).toBe(true);
  });

  it("uses default pricing for unknown tool", () => {
    const result = negotiatePrice({ budget_per_run_cents: 30 }, "some_unknown_tool");
    expect(result.amount_cents).toBe(25);
    expect(result.mode).toBe("lite");
    expect(result.accepted).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════
// BUDGET NEGOTIATION — build402NegotiationBody
// ═════════════════════════════════════════════════════════════════

describe("build402NegotiationBody", () => {
  it("returns pricing tiers for tool without budget", () => {
    const body = build402NegotiationBody("analyze_repo");
    expect(body.pricing).toBeDefined();
    const pricing = body.pricing as Record<string, unknown>;
    const standard = pricing.standard as Record<string, unknown>;
    const lite = pricing.lite as Record<string, unknown>;
    expect(standard.amount_cents).toBe(50);
    expect(lite.amount_cents).toBe(15);
  });

  it("returns default negotiation when no budget provided", () => {
    const body = build402NegotiationBody("analyze_repo");
    const negotiation = body.negotiation as Record<string, unknown>;
    expect(negotiation.amount_cents).toBe(50);
    expect(negotiation.mode).toBe("standard");
    expect(negotiation.accepted).toBe(true);
  });

  it("returns negotiated result when budget provided", () => {
    const body = build402NegotiationBody("analyze_repo", { budget_per_run_cents: 20 });
    const negotiation = body.negotiation as Record<string, unknown>;
    expect(negotiation.amount_cents).toBe(15);
    expect(negotiation.mode).toBe("lite");
    expect(negotiation.accepted).toBe(true);
  });

  it("returns rejection when budget too low", () => {
    const body = build402NegotiationBody("analyze_repo", { budget_per_run_cents: 5 });
    const negotiation = body.negotiation as Record<string, unknown>;
    expect(negotiation.accepted).toBe(false);
  });

  it("includes actions with accept, counter, switch_lite, get_free", () => {
    const body = build402NegotiationBody("analyze_repo");
    const actions = body.actions as Record<string, string>;
    expect(actions.accept).toBeDefined();
    expect(actions.counter).toBeDefined();
    expect(actions.switch_lite).toBeDefined();
    expect(actions.get_free).toBeDefined();
  });

  it("includes free_alternatives array", () => {
    const body = build402NegotiationBody("analyze_repo");
    const free = body.free_alternatives as string[];
    expect(Array.isArray(free)).toBe(true);
    expect(free.length).toBeGreaterThan(0);
    expect(free.some(f => f.includes("list_programs"))).toBe(true);
    expect(free.some(f => f.includes("search_and_discover_tools"))).toBe(true);
    expect(free.some(f => f.includes("probe-intent"))).toBe(true);
  });

  it("switch_lite action contains dollar amount", () => {
    const body = build402NegotiationBody("prepare_for_agentic_purchasing");
    const actions = body.actions as Record<string, string>;
    expect(actions.switch_lite).toContain("$0.25");
  });

  it("includes compliance_value with CE 3.0 and win probability", () => {
    const body = build402NegotiationBody("prepare_for_agentic_purchasing");
    const cv = body.compliance_value as Record<string, unknown>;
    expect(cv).toBeDefined();
    expect(cv.what_you_get).toContain("Visa-grade");
    const includes = cv.includes as string[];
    expect(includes.some(s => s.includes("CE 3.0"))).toBe(true);
    expect(includes.some(s => s.includes("Win probability"))).toBe(true);
    expect(includes.some(s => s.includes("Lighter SCA"))).toBe(true);
    expect(includes.some(s => s.includes("TAP"))).toBe(true);
    const vs = cv.vs_visa_ic_pilot as Record<string, Record<string, unknown>>;
    expect(vs.axis.api_calls).toBe(0);
    expect(vs.axis.latency_ms).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════
// BUDGET NEGOTIATION — parseAgentBudget
// ═════════════════════════════════════════════════════════════════

describe("parseAgentBudget", () => {
  function makeReq(headers: Record<string, string | string[] | undefined>): IncomingMessage {
    return { headers } as unknown as IncomingMessage;
  }

  it("returns undefined when header missing", () => {
    expect(parseAgentBudget(makeReq({}))).toBeUndefined();
  });

  it("returns undefined for non-string header", () => {
    expect(parseAgentBudget(makeReq({ "x-agent-budget": undefined }))).toBeUndefined();
  });

  it("returns undefined for invalid JSON", () => {
    expect(parseAgentBudget(makeReq({ "x-agent-budget": "not{json" }))).toBeUndefined();
  });

  it("parses budget_per_run_cents", () => {
    const budget = parseAgentBudget(makeReq({ "x-agent-budget": '{"budget_per_run_cents":25}' }));
    expect(budget).toBeDefined();
    expect(budget!.budget_per_run_cents).toBe(25);
  });

  it("floors budget_per_run_cents to integer", () => {
    const budget = parseAgentBudget(makeReq({ "x-agent-budget": '{"budget_per_run_cents":25.7}' }));
    expect(budget!.budget_per_run_cents).toBe(25);
  });

  it("rejects negative budget_per_run_cents", () => {
    const budget = parseAgentBudget(makeReq({ "x-agent-budget": '{"budget_per_run_cents":-5}' }));
    expect(budget).toBeDefined();
    expect(budget!.budget_per_run_cents).toBeUndefined();
  });

  it("parses valid spending_window values", () => {
    for (const window of ["per_call", "hourly", "daily", "monthly"]) {
      const budget = parseAgentBudget(makeReq({ "x-agent-budget": `{"spending_window":"${window}"}` }));
      expect(budget!.spending_window).toBe(window);
    }
  });

  it("rejects invalid spending_window", () => {
    const budget = parseAgentBudget(makeReq({ "x-agent-budget": '{"spending_window":"weekly"}' }));
    expect(budget!.spending_window).toBeUndefined();
  });

  it("parses max_monthly_cents", () => {
    const budget = parseAgentBudget(makeReq({ "x-agent-budget": '{"max_monthly_cents":5000}' }));
    expect(budget!.max_monthly_cents).toBe(5000);
  });

  it("rejects negative max_monthly_cents", () => {
    const budget = parseAgentBudget(makeReq({ "x-agent-budget": '{"max_monthly_cents":-100}' }));
    expect(budget!.max_monthly_cents).toBeUndefined();
  });

  it("parses wallet_id up to 200 chars", () => {
    const budget = parseAgentBudget(makeReq({ "x-agent-budget": '{"wallet_id":"org_abc123"}' }));
    expect(budget!.wallet_id).toBe("org_abc123");
  });

  it("rejects wallet_id over 200 chars", () => {
    const longId = "a".repeat(201);
    const budget = parseAgentBudget(makeReq({ "x-agent-budget": `{"wallet_id":"${longId}"}` }));
    expect(budget!.wallet_id).toBeUndefined();
  });

  it("parses agent_type up to 100 chars", () => {
    const budget = parseAgentBudget(makeReq({ "x-agent-budget": '{"agent_type":"claude"}' }));
    expect(budget!.agent_type).toBe("claude");
  });

  it("rejects agent_type over 100 chars", () => {
    const longType = "x".repeat(101);
    const budget = parseAgentBudget(makeReq({ "x-agent-budget": `{"agent_type":"${longType}"}` }));
    expect(budget!.agent_type).toBeUndefined();
  });

  it("accepts budget_per_run_cents of 0 (zero budget)", () => {
    const budget = parseAgentBudget(makeReq({ "x-agent-budget": '{"budget_per_run_cents":0}' }));
    expect(budget!.budget_per_run_cents).toBe(0);
  });

  it("parses combined fields", () => {
    const header = JSON.stringify({
      budget_per_run_cents: 25,
      spending_window: "per_call",
      max_monthly_cents: 1000,
      wallet_id: "org_test",
      agent_type: "cursor",
    });
    const budget = parseAgentBudget(makeReq({ "x-agent-budget": header }));
    expect(budget!.budget_per_run_cents).toBe(25);
    expect(budget!.spending_window).toBe("per_call");
    expect(budget!.max_monthly_cents).toBe(1000);
    expect(budget!.wallet_id).toBe("org_test");
    expect(budget!.agent_type).toBe("cursor");
  });
});

// ═════════════════════════════════════════════════════════════════
// BUDGET NEGOTIATION — resolveAgentMode
// ═════════════════════════════════════════════════════════════════

describe("resolveAgentMode", () => {
  function makeReq(headers: Record<string, string | string[] | undefined>): IncomingMessage {
    return { headers } as unknown as IncomingMessage;
  }

  it("returns standard when no header", () => {
    expect(resolveAgentMode(makeReq({}))).toBe("standard");
  });

  it("returns lite when header is lite", () => {
    expect(resolveAgentMode(makeReq({ "x-agent-mode": "lite" }))).toBe("lite");
  });

  it("returns standard when header is standard", () => {
    expect(resolveAgentMode(makeReq({ "x-agent-mode": "standard" }))).toBe("standard");
  });

  it("returns standard for invalid mode value", () => {
    expect(resolveAgentMode(makeReq({ "x-agent-mode": "ultra" }))).toBe("standard");
  });

  it("returns standard for empty string", () => {
    expect(resolveAgentMode(makeReq({ "x-agent-mode": "" }))).toBe("standard");
  });
});

// ═════════════════════════════════════════════════════════════════
// PROBE CLASSIFICATION — classifyProbe
// ═════════════════════════════════════════════════════════════════

describe("classifyProbe", () => {
  it("classifies Chiark as quality-agent", () => {
    expect(classifyProbe("Chiark/1.0")).toBe("quality-agent");
  });

  it("classifies quality-index as quality-agent", () => {
    expect(classifyProbe("quality-index-bot/2.1")).toBe("quality-agent");
  });

  it("classifies qci-agent as quality-agent", () => {
    expect(classifyProbe("qci-agent")).toBe("quality-agent");
  });

  it("classifies Smithery as registry-crawler", () => {
    expect(classifyProbe("Smithery-Crawler/1.0")).toBe("registry-crawler");
  });

  it("classifies Glama as registry-crawler", () => {
    expect(classifyProbe("Glama-Bot/2.0")).toBe("registry-crawler");
  });

  it("classifies mcp-registry as registry-crawler", () => {
    expect(classifyProbe("mcp-registry-scanner")).toBe("registry-crawler");
  });

  it("classifies AWS as registry-crawler", () => {
    expect(classifyProbe("aws-sdk-nodejs/3.0")).toBe("registry-crawler");
  });

  it("classifies Amazon as registry-crawler", () => {
    expect(classifyProbe("Amazon CloudFront")).toBe("registry-crawler");
  });

  it("classifies purchasing-agent as purchasing-agent", () => {
    expect(classifyProbe("purchasing-agent/1.0")).toBe("purchasing-agent");
  });

  it("classifies 402.ad as purchasing-agent", () => {
    expect(classifyProbe("402.ad-crawler")).toBe("purchasing-agent");
  });

  it("classifies commerce-bot as purchasing-agent", () => {
    expect(classifyProbe("commerce-bot/1.2")).toBe("purchasing-agent");
  });

  it("classifies Cursor as dev-tool", () => {
    expect(classifyProbe("Cursor/0.40")).toBe("dev-tool");
  });

  it("classifies Copilot as dev-tool", () => {
    expect(classifyProbe("GitHub-Copilot")).toBe("dev-tool");
  });

  it("classifies Claude as dev-tool", () => {
    expect(classifyProbe("Claude-Desktop/1.0")).toBe("dev-tool");
  });

  it("classifies Windsurf as dev-tool", () => {
    expect(classifyProbe("Windsurf-IDE")).toBe("dev-tool");
  });

  it("classifies Cline as dev-tool", () => {
    expect(classifyProbe("Cline-Agent/1.0")).toBe("dev-tool");
  });

  it("classifies Continue as dev-tool", () => {
    expect(classifyProbe("Continue-Extension")).toBe("dev-tool");
  });

  it("classifies Aider as dev-tool", () => {
    expect(classifyProbe("Aider/0.50.1")).toBe("dev-tool");
  });

  it("returns unknown for unrecognized user-agent", () => {
    expect(classifyProbe("Mozilla/5.0")).toBe("unknown");
  });

  it("returns unknown for empty string", () => {
    expect(classifyProbe("")).toBe("unknown");
  });

  it("is case-insensitive", () => {
    expect(classifyProbe("CHIARK")).toBe("quality-agent");
    expect(classifyProbe("SMITHERY")).toBe("registry-crawler");
    expect(classifyProbe("CURSOR")).toBe("dev-tool");
  });
});

// ═════════════════════════════════════════════════════════════════
// PROBE CLASSIFICATION — captureIntent / getIntentLog
// ═════════════════════════════════════════════════════════════════

describe("captureIntent + getIntentLog", () => {
  it("captures an intent entry", () => {
    const before = getIntentLog().length;
    captureIntent("test_tool", "test intent", "Cursor/1.0");
    const after = getIntentLog().length;
    expect(after).toBe(before + 1);
  });

  it("captured entry has correct fields", () => {
    captureIntent("analyze_repo", "analyze my code", "Claude-Desktop/1.0");
    const log = getIntentLog();
    const last = log[log.length - 1];
    expect(last.tool).toBe("analyze_repo");
    expect(last.intent).toBe("analyze my code");
    expect(last.probe_class).toBe("dev-tool");
    expect(last.user_agent).toBe("Claude-Desktop/1.0");
    expect(typeof last.timestamp).toBe("string");
  });

  it("classifies probe correctly in captured entry", () => {
    captureIntent("probe_intent", "testing", "Smithery-Crawler");
    const log = getIntentLog();
    const last = log[log.length - 1];
    expect(last.probe_class).toBe("registry-crawler");
  });

  it("handles null intent", () => {
    captureIntent("list_programs", null, "Mozilla/5.0");
    const log = getIntentLog();
    const last = log[log.length - 1];
    expect(last.intent).toBeNull();
    expect(last.probe_class).toBe("unknown");
  });

  it("returns a copy of the log (immutable)", () => {
    const log1 = getIntentLog();
    captureIntent("test_mutation", "x", "Agent/1.0");
    const log2 = getIntentLog();
    expect(log2.length).toBe(log1.length + 1);
    // Mutating log1 should not affect log2
    log1.push({ tool: "fake", intent: "fake", probe_class: "unknown", user_agent: "", timestamp: "" });
    expect(getIntentLog().length).toBe(log2.length);
  });
});

// ═════════════════════════════════════════════════════════════════
// EVIDENCE SCORING — computePurchasingReadinessEvidence
// ═════════════════════════════════════════════════════════════════

describe("computePurchasingReadinessEvidence", () => {
  it("returns empty artifacts_found when no paths match", () => {
    const result = computePurchasingReadinessEvidence([]);
    expect(result.evidence.length).toBeGreaterThan(0);
    for (const e of result.evidence) {
      expect(e.found).toBe(false);
    }
    for (const cat of Object.values(result.category_scores)) {
      expect(cat.earned).toBe(0);
      expect(cat.artifacts_found).toHaveLength(0);
    }
  });

  it("detects AGENTS.md in onboarding_docs", () => {
    const result = computePurchasingReadinessEvidence(["AGENTS.md"]);
    const onboarding = result.category_scores.onboarding_docs;
    expect(onboarding).toBeDefined();
    expect(onboarding.earned).toBeGreaterThan(0);
    expect(onboarding.artifacts_found).toContain("AGENTS.md");
  });

  it("detects CLAUDE.md in onboarding_docs", () => {
    const result = computePurchasingReadinessEvidence(["CLAUDE.md"]);
    const onboarding = result.category_scores.onboarding_docs;
    expect(onboarding.artifacts_found).toContain("CLAUDE.md");
  });

  it("detects .cursorrules in onboarding_docs", () => {
    const result = computePurchasingReadinessEvidence([".cursorrules"]);
    const onboarding = result.category_scores.onboarding_docs;
    expect(onboarding.artifacts_found).toContain(".cursorrules");
  });

  it("detects agent-purchasing-playbook in commerce_artifacts", () => {
    const result = computePurchasingReadinessEvidence(["agent-purchasing-playbook.md"]);
    const commerce = result.category_scores.commerce_artifacts;
    expect(commerce.earned).toBeGreaterThan(0);
    expect(commerce.artifacts_found).toContain("Agent purchasing playbook");
  });

  it("detects mcp-config in mcp_configs", () => {
    const result = computePurchasingReadinessEvidence(["mcp-config.json"]);
    const mcp = result.category_scores.mcp_configs;
    expect(mcp.earned).toBeGreaterThan(0);
    expect(mcp.artifacts_found).toContain("MCP configuration");
  });

  it("detects negotiation-rules in compliance_checklist", () => {
    const result = computePurchasingReadinessEvidence(["negotiation-rules.md"]);
    const compliance = result.category_scores.compliance_checklist;
    expect(compliance.earned).toBeGreaterThan(0);
  });

  it("detects negotiation-rules in negotiation_playbook", () => {
    const result = computePurchasingReadinessEvidence(["negotiation-rules.md"]);
    const neg = result.category_scores.negotiation_playbook;
    expect(neg.earned).toBeGreaterThan(0);
  });

  it("detects debug-playbook in debug_playbook", () => {
    const result = computePurchasingReadinessEvidence(["debug-playbook.md"]);
    const dbg = result.category_scores.debug_playbook;
    expect(dbg.earned).toBeGreaterThan(0);
  });

  it("detects optimization-rules in optimization_rules", () => {
    const result = computePurchasingReadinessEvidence(["optimization-rules.md"]);
    const opt = result.category_scores.optimization_rules;
    expect(opt.earned).toBeGreaterThan(0);
  });

  it("multiple artifacts increase artifacts_found but not earned weight beyond cap", () => {
    const result = computePurchasingReadinessEvidence([
      "AGENTS.md", "CLAUDE.md", ".cursorrules",
    ]);
    const onboarding = result.category_scores.onboarding_docs;
    expect(onboarding.artifacts_found).toHaveLength(3);
    // Weight is still the same regardless of how many sub-checks match
    expect(onboarding.earned).toBe(onboarding.weight);
  });

  it("evidence array contains entries for all sub-checks", () => {
    const result = computePurchasingReadinessEvidence(["AGENTS.md"]);
    // Should have entries from all categories
    const categories = new Set(result.evidence.map(e => e.category));
    expect(categories.has("commerce_artifacts")).toBe(true);
    expect(categories.has("mcp_configs")).toBe(true);
    expect(categories.has("onboarding_docs")).toBe(true);
    expect(categories.has("debug_playbook")).toBe(true);
    expect(categories.has("optimization_rules")).toBe(true);
  });

  it("detects full artifact suite", () => {
    const paths = [
      "agent-purchasing-playbook.md",
      "commerce-registry.json",
      "product-schema.json",
      "checkout-flow.md",
      "mcp-config.json",
      "capability-registry.json",
      "mcp-playbook.md",
      "negotiation-rules.md",
      "debug-playbook.md",
      "optimization-rules.md",
      "AGENTS.md",
      "CLAUDE.md",
      ".cursorrules",
    ];
    const result = computePurchasingReadinessEvidence(paths);
    for (const cat of Object.values(result.category_scores)) {
      expect(cat.earned).toBe(cat.weight);
      expect(cat.artifacts_found.length).toBeGreaterThan(0);
    }
  });
});

// ═════════════════════════════════════════════════════════════════
// PROBE-AWARE ENDPOINTS — POST /probe-intent returns probe_class
// ═════════════════════════════════════════════════════════════════

describe("POST /probe-intent — probe classification", () => {
  it("returns probe_class in response", async () => {
    const r = await postReq("/probe-intent", { description: "test purchasing readiness" }, {
      "User-Agent": "Chiark/1.0",
    });
    expect(r.status).toBe(200);
    const data = JSON.parse(r.body);
    expect(data.probe_class).toBe("quality-agent");
  });

  it("classifies registry crawler correctly", async () => {
    const r = await postReq("/probe-intent", { description: "listing available tools" }, {
      "User-Agent": "Smithery-Crawler/2.0",
    });
    expect(r.status).toBe(200);
    const data = JSON.parse(r.body);
    expect(data.probe_class).toBe("registry-crawler");
  });

  it("classifies dev tools correctly", async () => {
    const r = await postReq("/probe-intent", { description: "analyze my code" }, {
      "User-Agent": "Cursor/0.40.1",
    });
    expect(r.status).toBe(200);
    const data = JSON.parse(r.body);
    expect(data.probe_class).toBe("dev-tool");
  });

  it("returns unknown for standard browser", async () => {
    const r = await postReq("/probe-intent", { description: "what does AXIS do" }, {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    });
    expect(r.status).toBe(200);
    const data = JSON.parse(r.body);
    expect(data.probe_class).toBe("unknown");
  });

  it("still returns recommendations alongside probe_class", async () => {
    const r = await postReq("/probe-intent", { description: "purchasing compliance" }, {
      "User-Agent": "purchasing-agent/1.0",
    });
    expect(r.status).toBe(200);
    const data = JSON.parse(r.body);
    expect(data.probe_class).toBe("purchasing-agent");
    expect(Array.isArray(data.recommendations)).toBe(true);
    expect(data.recommendations.length).toBeGreaterThan(0);
    expect(data.call_next).toBeDefined();
  });
});

// ═════════════════════════════════════════════════════════════════
// /for-agents — budget_negotiation section
// ═════════════════════════════════════════════════════════════════

describe("GET /for-agents — budget negotiation", () => {
  it("includes budget_negotiation in payment section", async () => {
    const r = await getReq("/for-agents");
    expect(r.status).toBe(200);
    const data = JSON.parse(r.body);
    expect(data.payment).toBeDefined();
    const payment = data.payment as Record<string, unknown>;
    expect(payment.budget_negotiation).toBeDefined();
  });

  it("budget_negotiation has header, schema, modes", async () => {
    const r = await getReq("/for-agents");
    const data = JSON.parse(r.body);
    const bn = (data.payment as Record<string, unknown>).budget_negotiation as Record<string, unknown>;
    expect(bn.header).toBe("X-Agent-Budget");
    expect(bn.schema).toBeDefined();
    expect(bn.modes).toBeDefined();
    const modes = bn.modes as Record<string, unknown>;
    expect(modes.standard).toBeDefined();
    expect(modes.lite).toBeDefined();
  });

  it("budget_negotiation includes mode_header", async () => {
    const r = await getReq("/for-agents");
    const data = JSON.parse(r.body);
    const bn = (data.payment as Record<string, unknown>).budget_negotiation as Record<string, unknown>;
    expect(typeof bn.mode_header).toBe("string");
    expect(String(bn.mode_header)).toContain("X-Agent-Mode");
  });

  it("budget_negotiation includes example curl", async () => {
    const r = await getReq("/for-agents");
    const data = JSON.parse(r.body);
    const bn = (data.payment as Record<string, unknown>).budget_negotiation as Record<string, unknown>;
    expect(typeof bn.example).toBe("string");
    expect(String(bn.example)).toContain("X-Agent-Budget");
  });
});
