/**
 * Tests for POST /v1/prepare-for-agentic-purchasing,
 * computePurchasingReadinessScore, PURCHASING_PROGRAMS,
 * and the prepare_for_agentic_purchasing MCP tool dispatch.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { openMemoryDb, closeDb } from "@axis/snapshots";
import { Router } from "./router.js";
import {
  handlePreparePurchasing,
  computePurchasingReadinessScore,
  PURCHASING_PROGRAMS,
  PURCHASING_READINESS_WEIGHTS,
} from "./handlers.js";
import { MCP_TOOLS, dispatch } from "./mcp-server.js";

// ─── HTTP helper ─────────────────────────────────────────────────

async function req(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const r = require("node:http").request(
      {
        hostname: "127.0.0.1",
        port: TEST_PORT,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: unknown;
          try { data = JSON.parse(raw); } catch { data = raw; }
          resolve({ status: res.statusCode ?? 0, data });
        });
      },
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

const TEST_PORT = 44516;
let server: Server;

const minFiles = [
  { path: "package.json", content: '{"name":"commerce-test","dependencies":{"react":"18.0.0"}}' },
  { path: "src/index.ts", content: 'export const checkout = () => null;' },
  { path: "README.md", content: "# Commerce Test\nA checkout flow." },
];

const validBody = {
  project_name: "test-commerce",
  project_type: "web_application",
  frameworks: ["react"],
  goals: ["enable purchasing agents"],
  files: minFiles,
};

beforeAll(async () => {
  openMemoryDb();
  const router = new Router();
  router.post("/v1/prepare-for-agentic-purchasing", handlePreparePurchasing);
  server = createServer((r, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    router.handle(r, res);
  });
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  closeDb();
});

// ─── computePurchasingReadinessScore — pure function ────────────

describe("computePurchasingReadinessScore", () => {
  it("returns 0 for empty paths", () => {
    const { score, gaps, strengths } = computePurchasingReadinessScore([]);
    expect(score).toBe(0);
    expect(strengths).toEqual([]);
    expect(gaps.length).toBeGreaterThan(0);
  });

  it("awards commerce_artifacts points for agent-purchasing-playbook.md", () => {
    const { score, strengths } = computePurchasingReadinessScore(["agent-purchasing-playbook.md"]);
    expect(score).toBeGreaterThanOrEqual(PURCHASING_READINESS_WEIGHTS.commerce_artifacts);
    expect(strengths).toContain("commerce artifacts");
  });

  it("awards commerce_artifacts points for commerce-registry.json", () => {
    const { score } = computePurchasingReadinessScore(["commerce-registry.json"]);
    expect(score).toBeGreaterThanOrEqual(PURCHASING_READINESS_WEIGHTS.commerce_artifacts);
  });

  it("awards commerce_artifacts points for product-schema.json", () => {
    const { score } = computePurchasingReadinessScore(["product-schema.json"]);
    expect(score).toBeGreaterThanOrEqual(PURCHASING_READINESS_WEIGHTS.commerce_artifacts);
  });

  it("awards commerce_artifacts points for checkout-flow.md", () => {
    const { score } = computePurchasingReadinessScore(["checkout-flow.md"]);
    expect(score).toBeGreaterThanOrEqual(PURCHASING_READINESS_WEIGHTS.commerce_artifacts);
  });

  it("awards mcp_configs points for mcp-config.json", () => {
    const { score, strengths } = computePurchasingReadinessScore(["mcp-config.json"]);
    expect(score).toBeGreaterThanOrEqual(PURCHASING_READINESS_WEIGHTS.mcp_configs);
    expect(strengths).toContain("mcp configs");
  });

  it("awards mcp_configs points for capability-registry", () => {
    const { strengths } = computePurchasingReadinessScore(["capability-registry.json"]);
    expect(strengths).toContain("mcp configs");
  });

  it("awards mcp_configs points for mcp-playbook.md", () => {
    const { strengths } = computePurchasingReadinessScore(["mcp-playbook.md"]);
    expect(strengths).toContain("mcp configs");
  });

  it("awards compliance_checklist points for negotiation-rules.md", () => {
    const { score, strengths } = computePurchasingReadinessScore(["negotiation-rules.md"]);
    // compliance_checklist (15) + negotiation_playbook (15) both match
    expect(score).toBeGreaterThanOrEqual(
      PURCHASING_READINESS_WEIGHTS.compliance_checklist + PURCHASING_READINESS_WEIGHTS.negotiation_playbook
    );
    expect(strengths).toContain("compliance checklist");
    expect(strengths).toContain("negotiation playbook");
  });

  it("awards debug_playbook points for .ai/debug-playbook.md", () => {
    const { strengths } = computePurchasingReadinessScore([".ai/debug-playbook.md"]);
    expect(strengths).toContain("debug playbook");
  });

  it("awards optimization_rules points for .ai/optimization-rules.md", () => {
    const { strengths } = computePurchasingReadinessScore([".ai/optimization-rules.md"]);
    expect(strengths).toContain("optimization rules");
  });

  it("awards onboarding_docs points for AGENTS.md", () => {
    const { strengths } = computePurchasingReadinessScore(["AGENTS.md"]);
    expect(strengths).toContain("onboarding docs");
  });

  it("awards onboarding_docs points for CLAUDE.md", () => {
    const { strengths } = computePurchasingReadinessScore(["CLAUDE.md"]);
    expect(strengths).toContain("onboarding docs");
  });

  it("awards onboarding_docs points for .cursorrules", () => {
    const { strengths } = computePurchasingReadinessScore([".cursorrules"]);
    expect(strengths).toContain("onboarding docs");
  });

  it("does NOT award onboarding_docs for a partial match (sub/AGENTS.md)", () => {
    // only exact path matches count for onboarding_docs
    const { strengths } = computePurchasingReadinessScore(["sub/AGENTS.md"]);
    expect(strengths).not.toContain("onboarding docs");
  });

  it("caps at 100 for full artifact set", () => {
    const fullSet = [
      "agent-purchasing-playbook.md",
      "mcp-config.json",
      "negotiation-rules.md",
      ".ai/debug-playbook.md",
      ".ai/optimization-rules.md",
      "AGENTS.md",
    ];
    const { score } = computePurchasingReadinessScore(fullSet);
    expect(score).toBe(100);
  });

  it("is deterministic — same input same output", () => {
    const paths = ["agent-purchasing-playbook.md", "mcp-config.json", "AGENTS.md"];
    const a = computePurchasingReadinessScore(paths);
    const b = computePurchasingReadinessScore(paths);
    expect(a).toEqual(b);
  });

  it("gaps + strengths cover all 7 categories", () => {
    const { gaps, strengths } = computePurchasingReadinessScore([]);
    expect(gaps.length + strengths.length).toBe(7);
  });
});

// ─── PURCHASING_PROGRAMS constant ───────────────────────────────

describe("PURCHASING_PROGRAMS", () => {
  it("includes agentic-purchasing", () => {
    expect(PURCHASING_PROGRAMS).toContain("agentic-purchasing");
  });

  it("includes debug", () => {
    expect(PURCHASING_PROGRAMS).toContain("debug");
  });

  it("includes mcp", () => {
    expect(PURCHASING_PROGRAMS).toContain("mcp");
  });

  it("includes optimization", () => {
    expect(PURCHASING_PROGRAMS).toContain("optimization");
  });

  it("has at least 8 programs", () => {
    expect(PURCHASING_PROGRAMS.length).toBeGreaterThanOrEqual(8);
  });
});

// ─── POST /v1/prepare-for-agentic-purchasing — validation ───────

describe("POST /v1/prepare-for-agentic-purchasing — validation", () => {
  it("rejects missing project_name", async () => {
    const r = await req("POST", "/v1/prepare-for-agentic-purchasing", {
      ...validBody, project_name: "",
    });
    expect(r.status).toBe(400);
    expect((r.data as Record<string, unknown>).error_code).toBe("MISSING_FIELD");
  });

  it("rejects missing project_type", async () => {
    const r = await req("POST", "/v1/prepare-for-agentic-purchasing", {
      ...validBody, project_type: "",
    });
    expect(r.status).toBe(400);
    expect((r.data as Record<string, unknown>).error_code).toBe("MISSING_FIELD");
  });

  it("rejects non-array frameworks", async () => {
    const r = await req("POST", "/v1/prepare-for-agentic-purchasing", {
      ...validBody, frameworks: "react",
    });
    expect(r.status).toBe(400);
    expect((r.data as Record<string, unknown>).error_code).toBe("MISSING_FIELD");
  });

  it("rejects non-array goals", async () => {
    const r = await req("POST", "/v1/prepare-for-agentic-purchasing", {
      ...validBody, goals: "purchasing",
    });
    expect(r.status).toBe(400);
    expect((r.data as Record<string, unknown>).error_code).toBe("MISSING_FIELD");
  });

  it("rejects empty files array", async () => {
    const r = await req("POST", "/v1/prepare-for-agentic-purchasing", {
      ...validBody, files: [],
    });
    expect(r.status).toBe(400);
    expect((r.data as Record<string, unknown>).error_code).toBe("MISSING_FIELD");
  });

  it("rejects file missing content", async () => {
    const r = await req("POST", "/v1/prepare-for-agentic-purchasing", {
      ...validBody,
      files: [{ path: "index.ts" }],
    });
    expect(r.status).toBe(400);
    expect((r.data as Record<string, unknown>).error_code).toBe("FILE_INVALID");
  });

  it("rejects path traversal", async () => {
    const r = await req("POST", "/v1/prepare-for-agentic-purchasing", {
      ...validBody,
      files: [{ path: "../../etc/passwd", content: "root" }],
    });
    expect(r.status).toBe(400);
    expect((r.data as Record<string, unknown>).error_code).toBe("PATH_TRAVERSAL");
  });
});

// ─── POST /v1/prepare-for-agentic-purchasing — success ──────────

describe("POST /v1/prepare-for-agentic-purchasing — success", () => {
  let result: Record<string, unknown>;

  beforeAll(async () => {
    const r = await req("POST", "/v1/prepare-for-agentic-purchasing", validBody);
    expect(r.status).toBe(201);
    result = r.data as Record<string, unknown>;
  });

  it("returns snapshot_id and project_id", () => {
    expect(typeof result.snapshot_id).toBe("string");
    expect(typeof result.project_id).toBe("string");
    expect(result.status).toBe("ready");
  });

  it("returns purchasing_readiness_score as a number 0–100", () => {
    const score = result.purchasing_readiness_score as number;
    expect(typeof score).toBe("number");
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("returns score_breakdown with strengths, gaps, max_score, interpretation", () => {
    const bd = result.score_breakdown as Record<string, unknown>;
    expect(Array.isArray(bd.strengths)).toBe(true);
    expect(Array.isArray(bd.gaps)).toBe(true);
    expect(bd.max_score).toBe(100);
    expect(["production-ready", "partially-ready", "needs-work"]).toContain(bd.interpretation);
  });

  it("returns programs_executed array", () => {
    expect(Array.isArray(result.programs_executed)).toBe(true);
    expect((result.programs_executed as string[]).length).toBeGreaterThan(0);
  });

  it("returns artifact_count > 0", () => {
    expect(typeof result.artifact_count).toBe("number");
    expect(result.artifact_count as number).toBeGreaterThan(0);
  });

  it("returns purchasing_artifacts array", () => {
    expect(Array.isArray(result.purchasing_artifacts)).toBe(true);
    const items = result.purchasing_artifacts as Array<Record<string, unknown>>;
    if (items.length > 0) {
      expect(typeof items[0].path).toBe("string");
      expect(typeof items[0].content).toBe("string");
    }
  });

  it("returns all_artifacts array with path, program, description", () => {
    const all = result.all_artifacts as Array<Record<string, unknown>>;
    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBeGreaterThan(0);
    expect(typeof all[0].path).toBe("string");
    expect(typeof all[0].program).toBe("string");
    expect(typeof all[0].description).toBe("string");
  });

  it("returns how_to_call_axis_again section", () => {
    const how = result.how_to_call_axis_again as Record<string, unknown>;
    expect(typeof how.note).toBe("string");
    expect(how.rest_endpoint).toBeDefined();
    expect(how.mcp_tool).toBeDefined();
    expect(how.retrieve_artifact).toBeDefined();
  });

  it("how_to_call_axis_again.rest_endpoint has correct path", () => {
    const how = result.how_to_call_axis_again as Record<string, unknown>;
    const endpoint = how.rest_endpoint as Record<string, unknown>;
    expect(endpoint.path).toBe("/v1/prepare-for-agentic-purchasing");
    expect(endpoint.method).toBe("POST");
  });

  it("how_to_call_axis_again.mcp_tool has correct name", () => {
    const how = result.how_to_call_axis_again as Record<string, unknown>;
    const tool = how.mcp_tool as Record<string, unknown>;
    expect(tool.name).toBe("prepare_for_agentic_purchasing");
  });

  it("how_to_call_axis_again.retrieve_artifact contains snapshot_id", () => {
    const how = result.how_to_call_axis_again as Record<string, unknown>;
    const ra = how.retrieve_artifact as Record<string, unknown>;
    expect(ra.snapshot_id).toBe(result.snapshot_id);
  });

  it("is deterministic — same input produces same artifact paths", async () => {
    const r2 = await req("POST", "/v1/prepare-for-agentic-purchasing", validBody);
    expect(r2.status).toBe(201);
    const r2result = r2.data as Record<string, unknown>;
    const paths1 = (result.all_artifacts as Array<{ path: string }>).map(f => f.path).sort();
    const paths2 = (r2result.all_artifacts as Array<{ path: string }>).map(f => f.path).sort();
    expect(paths1).toEqual(paths2);
  });
});

// ─── MCP_TOOLS — prepare_for_agentic_purchasing schema ──────────

describe("MCP_TOOLS — prepare_for_agentic_purchasing", () => {
  const tool = MCP_TOOLS.find(t => t.name === "prepare_for_agentic_purchasing");

  it("is registered in MCP_TOOLS", () => {
    expect(tool).toBeDefined();
  });

  it("has a non-empty description", () => {
    expect(typeof tool?.description).toBe("string");
    expect(tool!.description.length).toBeGreaterThan(20);
  });

  it("requires project_name, project_type, frameworks, goals, files", () => {
    expect(tool?.inputSchema.required).toContain("project_name");
    expect(tool?.inputSchema.required).toContain("project_type");
    expect(tool?.inputSchema.required).toContain("frameworks");
    expect(tool?.inputSchema.required).toContain("goals");
    expect(tool?.inputSchema.required).toContain("files");
  });

  it("has focus as optional enum property", () => {
    const focusProp = (tool?.inputSchema.properties as Record<string, unknown>)?.focus as Record<string, unknown>;
    expect(focusProp?.enum).toContain("full");
    expect(focusProp?.enum).toContain("purchasing");
    expect(focusProp?.enum).toContain("security");
    expect(focusProp?.enum).toContain("optimization");
  });

  it("lists 6 total MCP tools", () => {
    expect(MCP_TOOLS.length).toBe(6);
  });
});

// ─── dispatch — prepare_for_agentic_purchasing auth gate ────────

describe("dispatch — prepare_for_agentic_purchasing auth gate", () => {
  it("returns isError=true when no auth provided", async () => {
    const fakeReq = { headers: {} } as import("node:http").IncomingMessage;
    const result = await dispatch(
      "tools/call",
      {
        name: "prepare_for_agentic_purchasing",
        arguments: {
          project_name: "test",
          project_type: "web_application",
          frameworks: [],
          goals: [],
          files: [{ path: "i.ts", content: "x" }],
        },
      },
      1,
      fakeReq,
    );
    expect("result" in result).toBe(true);
    const r = (result as { result: { isError: boolean } }).result;
    expect(r.isError).toBe(true);
  });

  it("returns isError=true for missing project_name", async () => {
    const fakeReq = { headers: {} } as import("node:http").IncomingMessage;
    const result = await dispatch(
      "tools/call",
      {
        name: "prepare_for_agentic_purchasing",
        arguments: {
          project_name: "",
          project_type: "web_application",
          frameworks: [],
          goals: [],
          files: [{ path: "i.ts", content: "x" }],
        },
      },
      1,
      fakeReq,
    );
    expect("result" in result).toBe(true);
    const r = (result as { result: { isError: boolean } }).result;
    expect(r.isError).toBe(true);
  });
});
