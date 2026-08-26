/**
 * Tests for POST /v1/prepare-for-agentic-purchasing,
 * computePurchasingReadinessScore, PURCHASING_PROGRAMS,
 * and the prepare_agentic_purchasing MCP tool dispatch.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { resetTestDb, createAccount, createApiKey, getUsageCreditSummary } from "@axis/snapshots";
import { Router } from "./router.js";
import {
  handlePreparePurchasing,
  handleGetGeneratedFiles,
  handleGetGeneratedFile,
  computePurchasingReadinessScore,
  PURCHASING_PROGRAMS,
  PURCHASING_READINESS_WEIGHTS,
} from "./handlers.js";
import { MCP_TOOLS, dispatch } from "./mcp-server.js";
import { MCP_TOOL_COUNT } from "./counts.js";
import { runPreparePurchasing } from "./mcp-tool-impls.js";

// ─── HTTP helper ─────────────────────────────────────────────────

async function req(
  method: string,
  path: string,
  body?: unknown,
  authKey?: string,
  extraHeaders?: Record<string, string>,
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
          ...(authKey ? { "Authorization": `Bearer ${authKey}` } : {}),
          ...(extraHeaders ?? {}),
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

let server: Server;
let TEST_PORT: number;
let suiteApiKey: string;

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
  await resetTestDb();
  const suiteAccount = await createAccount("suite-test", "suite@test.local", "suite");
  const suiteKey = await createApiKey(suiteAccount.account_id);
  suiteApiKey = suiteKey.rawKey;
  const router = new Router();
  router.post("/v1/prepare-for-agentic-purchasing", handlePreparePurchasing);
  router.get("/v1/projects/:project_id/generated-files", handleGetGeneratedFiles);
  router.get("/v1/projects/:project_id/generated-files/:file_path*", handleGetGeneratedFile);
  server = createServer((r, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    router.handle(r, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  TEST_PORT = addr.port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

// ─── computePurchasingReadinessScore — pure function ────────────

describe("computePurchasingReadinessScore", () => {
  it("returns 0 for empty paths", async () => {
    const { score, gaps, strengths } = computePurchasingReadinessScore([]);
    expect(score).toBe(0);
    expect(strengths).toEqual([]);
    expect(gaps.length).toBeGreaterThan(0);
  });

  it("awards commerce_artifacts points for agent-purchasing-playbook.md", async () => {
    const { score, strengths } = computePurchasingReadinessScore(["agent-purchasing-playbook.md"]);
    expect(score).toBeGreaterThanOrEqual(PURCHASING_READINESS_WEIGHTS.commerce_artifacts);
    expect(strengths).toContain("commerce artifacts");
  });

  it("awards commerce_artifacts points for commerce-registry.json", async () => {
    const { score } = computePurchasingReadinessScore(["commerce-registry.json"]);
    expect(score).toBeGreaterThanOrEqual(PURCHASING_READINESS_WEIGHTS.commerce_artifacts);
  });

  it("awards commerce_artifacts points for product-schema.json", async () => {
    const { score } = computePurchasingReadinessScore(["product-schema.json"]);
    expect(score).toBeGreaterThanOrEqual(PURCHASING_READINESS_WEIGHTS.commerce_artifacts);
  });

  it("awards commerce_artifacts points for checkout-flow.md", async () => {
    const { score } = computePurchasingReadinessScore(["checkout-flow.md"]);
    expect(score).toBeGreaterThanOrEqual(PURCHASING_READINESS_WEIGHTS.commerce_artifacts);
  });

  it("awards mcp_configs points for mcp-config.json", async () => {
    const { score, strengths } = computePurchasingReadinessScore(["mcp-config.json"]);
    expect(score).toBeGreaterThanOrEqual(PURCHASING_READINESS_WEIGHTS.mcp_configs);
    expect(strengths).toContain("mcp configs");
  });

  it("awards mcp_configs points for capability-registry", async () => {
    const { strengths } = computePurchasingReadinessScore(["capability-registry.json"]);
    expect(strengths).toContain("mcp configs");
  });

  it("awards mcp_configs points for mcp-playbook.md", async () => {
    const { strengths } = computePurchasingReadinessScore(["mcp-playbook.md"]);
    expect(strengths).toContain("mcp configs");
  });

  it("awards compliance_checklist points for negotiation-rules.md", async () => {
    const { score, strengths } = computePurchasingReadinessScore(["negotiation-rules.md"]);
    // compliance_checklist (15) + negotiation_playbook (15) both match
    expect(score).toBeGreaterThanOrEqual(
      PURCHASING_READINESS_WEIGHTS.compliance_checklist + PURCHASING_READINESS_WEIGHTS.negotiation_playbook
    );
    expect(strengths).toContain("compliance checklist");
    expect(strengths).toContain("negotiation playbook");
  });

  it("awards debug_playbook points for .ai/debug-playbook.md", async () => {
    const { strengths } = computePurchasingReadinessScore([".ai/debug-playbook.md"]);
    expect(strengths).toContain("debug playbook");
  });

  it("awards optimization_rules points for .ai/optimization-rules.md", async () => {
    const { strengths } = computePurchasingReadinessScore([".ai/optimization-rules.md"]);
    expect(strengths).toContain("optimization rules");
  });

  it("awards onboarding_docs points for AGENTS.md", async () => {
    const { strengths } = computePurchasingReadinessScore(["AGENTS.md"]);
    expect(strengths).toContain("onboarding docs");
  });

  it("awards onboarding_docs points for CLAUDE.md", async () => {
    const { strengths } = computePurchasingReadinessScore(["CLAUDE.md"]);
    expect(strengths).toContain("onboarding docs");
  });

  it("awards onboarding_docs points for .cursorrules", async () => {
    const { strengths } = computePurchasingReadinessScore([".cursorrules"]);
    expect(strengths).toContain("onboarding docs");
  });

  it("does NOT award onboarding_docs for a partial match (sub/AGENTS.md)", async () => {
    // only exact path matches count for onboarding_docs
    const { strengths } = computePurchasingReadinessScore(["sub/AGENTS.md"]);
    expect(strengths).not.toContain("onboarding docs");
  });

  it("caps at 100 for full artifact set", async () => {
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

  it("is deterministic — same input same output", async () => {
    const paths = ["agent-purchasing-playbook.md", "mcp-config.json", "AGENTS.md"];
    const a = computePurchasingReadinessScore(paths);
    const b = computePurchasingReadinessScore(paths);
    expect(a).toEqual(b);
  });

  it("gaps + strengths cover all 7 categories", async () => {
    const { gaps, strengths } = computePurchasingReadinessScore([]);
    expect(gaps.length + strengths.length).toBe(7);
  });
});

// ─── PURCHASING_PROGRAMS constant ───────────────────────────────

describe("PURCHASING_PROGRAMS", () => {
  it("includes agentic-purchasing", async () => {
    expect(PURCHASING_PROGRAMS).toContain("agentic-purchasing");
  });

  it("includes debug", async () => {
    expect(PURCHASING_PROGRAMS).toContain("debug");
  });

  it("includes mcp", async () => {
    expect(PURCHASING_PROGRAMS).toContain("mcp");
  });

  it("includes optimization", async () => {
    expect(PURCHASING_PROGRAMS).toContain("optimization");
  });

  it("has at least 8 programs", async () => {
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
    const r = await req("POST", "/v1/prepare-for-agentic-purchasing", validBody, suiteApiKey);
    expect(r.status).toBe(201);
    result = r.data as Record<string, unknown>;
  });

  it("returns snapshot_id and project_id", async () => {
    expect(typeof result.snapshot_id).toBe("string");
    expect(typeof result.project_id).toBe("string");
    expect(result.status).toBe("ready");
  });

  it("returns purchasing_readiness_score as a number 0–100", async () => {
    const score = result.purchasing_readiness_score as number;
    expect(typeof score).toBe("number");
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("returns upgrade_offer with readiness conversion messaging", async () => {
    const offer = result.upgrade_offer as Record<string, unknown>;
    // Honest framing (c03feee): the REST message sells artifact COVERAGE, never
    // "ready for autonomous spending" — code readiness is a separate content-based block.
    expect(String(offer.agent_conversion_message)).toContain("artifact coverage");
    // H-Phase-A cycle 9: PAI'D's checkout is a one-time charge (no recurring
    // billing exists yet) — Pro costs $99 once, never phrased as "$99/month".
    expect(String(offer.plan)).toContain("$99");
    expect(String(offer.plan)).not.toContain("$99/month");
    expect(String(offer.plan)).toContain("one-time");
  });

  it("returns score_breakdown with strengths, gaps, max_score, interpretation", () => {
    const bd = result.score_breakdown as Record<string, unknown>;
    expect(Array.isArray(bd.strengths)).toBe(true);
    expect(Array.isArray(bd.gaps)).toBe(true);
    expect(bd.max_score).toBe(100);
    expect(["strong-coverage", "partial-coverage", "minimal-coverage"]).toContain(bd.interpretation);
  });

  it("replaces the incentives pitch with a neutral referral_program facts object", async () => {
    expect(result.incentives).toBeUndefined();
    const referral = result.referral_program as Record<string, unknown>;
    expect(referral).toBeDefined();
    expect(typeof referral.referral_token).toBe("string");
    expect(typeof referral.earned_credits_millicents).toBe("number");
    expect(typeof referral.lifetime_referrals).toBe("number");
    expect(referral.share_instruction).toBeUndefined();
    const raw = JSON.stringify(result);
    expect(raw).not.toContain("Pass this referral_token to other agents");
    expect(raw).not.toContain("Share-to-Earn");
  });

  it("returns programs_executed array", async () => {
    expect(Array.isArray(result.programs_executed)).toBe(true);
    expect((result.programs_executed as string[]).length).toBeGreaterThan(0);
  });

  it("returns artifact_count > 0", async () => {
    expect(typeof result.artifact_count).toBe("number");
    expect(result.artifact_count as number).toBeGreaterThan(0);
  });

  it("returns purchasing_artifacts array", async () => {
    expect(Array.isArray(result.purchasing_artifacts)).toBe(true);
    const items = result.purchasing_artifacts as Array<Record<string, unknown>>;
    if (items.length > 0) {
      expect(typeof items[0].path).toBe("string");
      expect(typeof items[0].content).toBe("string");
    }
  });

  it("returns all_artifacts array with path, program, description", async () => {
    const all = result.all_artifacts as Array<Record<string, unknown>>;
    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBeGreaterThan(0);
    expect(typeof all[0].path).toBe("string");
    expect(typeof all[0].program).toBe("string");
    expect(typeof all[0].description).toBe("string");
  });

  it("returns how_to_call_axis_again section", async () => {
    const how = result.how_to_call_axis_again as Record<string, unknown>;
    expect(typeof how.note).toBe("string");
    expect(how.rest_endpoint).toBeDefined();
    expect(how.mcp_tool).toBeDefined();
    expect(how.retrieve_artifact).toBeDefined();
  });

  it("how_to_call_axis_again.rest_endpoint has correct path", async () => {
    const how = result.how_to_call_axis_again as Record<string, unknown>;
    const endpoint = how.rest_endpoint as Record<string, unknown>;
    expect(endpoint.path).toBe("/v1/prepare-for-agentic-purchasing");
    expect(endpoint.method).toBe("POST");
  });

  it("how_to_call_axis_again.mcp_tool has correct name", async () => {
    const how = result.how_to_call_axis_again as Record<string, unknown>;
    const tool = how.mcp_tool as Record<string, unknown>;
    expect(tool.name).toBe("prepare_agentic_purchasing");
  });

  it("how_to_call_axis_again.retrieve_artifact contains snapshot_id", async () => {
    const how = result.how_to_call_axis_again as Record<string, unknown>;
    const ra = how.retrieve_artifact as Record<string, unknown>;
    expect(ra.snapshot_id).toBe(result.snapshot_id);
  });

  it("is deterministic — same input produces same artifact paths", async () => {
    const r2 = await req("POST", "/v1/prepare-for-agentic-purchasing", validBody, suiteApiKey);
    expect(r2.status).toBe(201);
    const r2result = r2.data as Record<string, unknown>;
    const paths1 = (result.all_artifacts as Array<{ path: string }>).map(f => f.path).sort();
    const paths2 = (r2result.all_artifacts as Array<{ path: string }>).map(f => f.path).sort();
    expect(paths1).toEqual(paths2);
  });
});

// ─── Lite mode withholds the artifact bundle (H-Phase-A cycle 2) ────
//
// lite_description promises "purchasing readiness score + top 3 gaps only
// (no full artifact bundle)". The MCP twin (runPreparePurchasing) had this
// fixed in cycle 1; this REST endpoint used X-Agent-Mode only to decide
// complianceDepth's LABEL, but three separate leaks meant the actual
// response still carried the full bundle regardless: (1) the top-level
// `gaps` field was never sliced, (2) an unconditional `evidence,` key after
// `...complianceSection` silently overwrote the section's own mode-gated
// evidence exclusion, (3) purchasing_artifacts/all_artifacts had no
// complianceDepth check at all.
describe("POST /v1/prepare-for-agentic-purchasing — lite mode withholds the bundle", () => {
  it("gaps is sliced to top 3, evidence/artifacts are withheld, score/strengths still returned", async () => {
    const r = await req(
      "POST",
      "/v1/prepare-for-agentic-purchasing",
      validBody,
      suiteApiKey,
      { "X-Agent-Mode": "lite" },
    );
    expect(r.status).toBe(201);
    const lite = r.data as Record<string, unknown>;
    expect(typeof lite.purchasing_readiness_score).toBe("number");
    const bd = lite.score_breakdown as Record<string, unknown>;
    expect(bd.compliance_depth).toBe("summary");
    expect(Array.isArray(bd.gaps)).toBe(true);
    expect((bd.gaps as unknown[]).length).toBeLessThanOrEqual(3);
    // The evidence-override bug: this key must be ABSENT (or explicitly
    // undefined), not silently re-added by a later spread/key collision.
    expect(bd.evidence).toBeUndefined();
    expect(bd.evidence_summary).toBeUndefined();
    expect(typeof bd.top_gaps).toBe("object");
    expect(lite.purchasing_artifacts).toBeUndefined();
    expect(lite.all_artifacts).toBeUndefined();
    expect(typeof lite.artifacts_note).toBe("string");
    // artifact_count (a bare number, not content) is legitimate lite metadata.
    expect(typeof lite.artifact_count).toBe("number");
    expect((lite.artifact_count as number)).toBeGreaterThan(0);
  });

  it("standard mode (no header) still returns full gaps, evidence, and the artifact bundle", async () => {
    const r = await req("POST", "/v1/prepare-for-agentic-purchasing", validBody, suiteApiKey);
    expect(r.status).toBe(201);
    const std = r.data as Record<string, unknown>;
    const bd = std.score_breakdown as Record<string, unknown>;
    expect(bd.compliance_depth).toBe("full");
    expect(bd.evidence).toBeDefined();
    expect(std.purchasing_artifacts).toBeDefined();
    expect(std.all_artifacts).toBeDefined();
    expect(std.artifacts_note).toBeUndefined();
  });
});

// ─── Lite mode's withheld bundle is not retrievable after the fact
// (H-Phase-A cycle 3) ────────────────────────────────────────────
//
// The response-layer redaction above (cycle 2) is not enough on its own:
// GET /v1/projects/:id/generated-files(/:file_path) checks ONLY project
// ownership, with no mode/charge/entitlement awareness at all — so a lite
// caller could previously fetch the exact pro-program bundle this same call's
// own response just withheld, by simply reading the snapshot back afterward.
// The fix persists only the free-program files' full content when lite mode
// applies, so these endpoints have nothing pro-tier left to serve.
describe("lite mode's withheld bundle cannot be retrieved via generated-files afterward", () => {
  it("pro-program files (e.g. agentic-purchasing) are absent from generated-files and 404 individually", async () => {
    const r = await req(
      "POST",
      "/v1/prepare-for-agentic-purchasing",
      validBody,
      suiteApiKey,
      { "X-Agent-Mode": "lite" },
    );
    expect(r.status).toBe(201);
    const lite = r.data as Record<string, unknown>;
    const projectId = lite.project_id as string;

    const listing = await req("GET", `/v1/projects/${projectId}/generated-files`, undefined, suiteApiKey);
    expect(listing.status).toBe(200);
    const listData = listing.data as { files: Array<{ path: string; program: string }> };
    expect(listData.files.some(f => f.program === "agentic-purchasing")).toBe(false);
    // Free programs (search/skills/debug) remain — proves this isn't just an
    // empty bundle, only the pro-tier content was stripped.
    expect(listData.files.some(f => f.program === "debug")).toBe(true);

    const single = await req(
      "GET",
      `/v1/projects/${projectId}/generated-files/agent-purchasing-playbook.md`,
      undefined,
      suiteApiKey,
    );
    expect(single.status).toBe(404);
  });

  it("standard mode's full bundle IS retrievable afterward (contrast case)", async () => {
    const r = await req("POST", "/v1/prepare-for-agentic-purchasing", validBody, suiteApiKey);
    expect(r.status).toBe(201);
    const std = r.data as Record<string, unknown>;
    const projectId = std.project_id as string;

    const listing = await req("GET", `/v1/projects/${projectId}/generated-files`, undefined, suiteApiKey);
    expect(listing.status).toBe(200);
    const listData = listing.data as { files: Array<{ path: string; program: string }> };
    expect(listData.files.some(f => f.program === "agentic-purchasing")).toBe(true);
  });
});

// ─── MCP_TOOLS — prepare_agentic_purchasing schema ──────────────

describe("MCP_TOOLS — prepare_agentic_purchasing", () => {
  const tool = MCP_TOOLS.find(t => t.name === "prepare_agentic_purchasing");

  it("is registered in MCP_TOOLS", async () => {
    expect(tool).toBeDefined();
  });

  it("has a non-empty description", async () => {
    expect(typeof tool?.description).toBe("string");
    expect(tool!.description.length).toBeGreaterThan(20);
  });

  it("requires project_name, project_type, frameworks, goals, files", async () => {
    expect(tool?.inputSchema.required).toContain("project_name");
    expect(tool?.inputSchema.required).toContain("project_type");
    expect(tool?.inputSchema.required).toContain("frameworks");
    expect(tool?.inputSchema.required).toContain("goals");
    expect(tool?.inputSchema.required).toContain("files");
  });

  it("has focus as optional enum property", async () => {
    const focusProp = (tool?.inputSchema.properties as Record<string, unknown>)?.focus as Record<string, unknown>;
    expect(focusProp?.enum).toContain("full");
    expect(focusProp?.enum).toContain("purchasing");
    expect(focusProp?.enum).toContain("security");
    expect(focusProp?.enum).toContain("optimization");
  });

  it("has focus_areas as optional array property with compliance areas", async () => {
    const props = tool?.inputSchema.properties as Record<string, Record<string, unknown>>;
    const fa = props?.focus_areas;
    expect(fa?.type).toBe("array");
    const items = fa?.items as Record<string, unknown>;
    expect(items?.enum).toContain("sca");
    expect(items?.enum).toContain("dispute");
    expect(items?.enum).toContain("mandate");
    expect(items?.enum).toContain("tap");
    expect(items?.enum).toContain("tokenization");
  });

  it("has budget_per_run_cents as optional number property", async () => {
    const props = tool?.inputSchema.properties as Record<string, Record<string, unknown>>;
    const bpc = props?.budget_per_run_cents;
    expect(bpc?.type).toBe("number");
  });

  it("has spending_window as optional enum property", async () => {
    const props = tool?.inputSchema.properties as Record<string, Record<string, unknown>>;
    const sw = props?.spending_window;
    expect(sw?.enum).toContain("per_call");
    expect(sw?.enum).toContain("monthly");
  });

  it("description mentions CE 3.0 and dispute capabilities", async () => {
    expect(tool!.description).toContain("CE 3.0");
    expect(tool!.description).toContain("dispute");
  });

  // DERIVED, not pinned. This assertion hardcoded 43 and went red the moment
  // delete_snapshot was added (commit a75ef56, the Glama coherence review),
  // which bumped counts.ts to 44 but could not know about this literal.
  // counts-consistency.test.ts already guards MCP_TOOL_COUNT against the live
  // MCP_TOOLS array, so deferring to it here keeps one source of truth and
  // stops this test from breaking on every legitimate tool addition.
  it("MCP_TOOLS array contains the full advertised catalog (build-not-redact; image_generation delegated to AXIS Foundry sibling)", async () => {
    expect(MCP_TOOLS.length).toBe(MCP_TOOL_COUNT);
  });
});

// ─── dispatch — prepare_agentic_purchasing auth gate ────────────

describe("dispatch — prepare_agentic_purchasing auth gate", () => {
  it("returns isError=true when no auth provided", async () => {
    const fakeReq = { headers: {} } as import("node:http").IncomingMessage;
    const result = await dispatch(
      "tools/call",
      {
        name: "prepare_agentic_purchasing",
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
        name: "prepare_agentic_purchasing",
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

// ─── MCP twin: lite mode's withheld bundle is not retrievable via
// get_snapshot/get_artifact afterward (H-Phase-A cycle 3) ────────
//
// Same vulnerability as the REST twin above: get_snapshot/get_artifact check
// ONLY snapshot ownership, with no mode/charge/entitlement awareness — so a
// lite MCP caller could previously fetch the pro-program bundle its own
// prepare_agentic_purchasing response just withheld.
describe("dispatch — lite mode's withheld bundle cannot be retrieved via get_snapshot/get_artifact", () => {
  function fakeReq(extraHeaders: Record<string, string> = {}) {
    return {
      headers: { authorization: `Bearer ${suiteApiKey}`, ...extraHeaders },
    } as unknown as import("node:http").IncomingMessage;
  }

  it("get_snapshot's artifact listing excludes pro programs; get_artifact 404s a pro-program path", async () => {
    const prepResult = await dispatch(
      "tools/call",
      {
        name: "prepare_agentic_purchasing",
        arguments: {
          project_name: "mcp-lite-retrieval-test",
          project_type: "web_application",
          frameworks: ["react"],
          goals: ["enable purchasing agents"],
          files: minFiles,
        },
      },
      1,
      fakeReq({ "x-agent-mode": "lite" }),
    );
    const prepText = (prepResult as { result: { content: Array<{ text: string }> } }).result.content[0].text;
    const prep = JSON.parse(prepText) as { snapshot_id: string };
    expect(typeof prep.snapshot_id).toBe("string");

    const snapResult = await dispatch(
      "tools/call",
      { name: "get_snapshot", arguments: { snapshot_id: prep.snapshot_id } },
      2,
      fakeReq(),
    );
    const snapText = (snapResult as { result: { content: Array<{ text: string }> } }).result.content[0].text;
    const snap = JSON.parse(snapText) as { artifacts: Array<{ program: string }> };
    expect(snap.artifacts.some(a => a.program === "agentic-purchasing")).toBe(false);
    expect(snap.artifacts.some(a => a.program === "debug")).toBe(true);

    const artifactResult = await dispatch(
      "tools/call",
      { name: "get_artifact", arguments: { snapshot_id: prep.snapshot_id, path: "agent-purchasing-playbook.md" } },
      3,
      fakeReq(),
    );
    expect((artifactResult as { result: { isError: boolean } }).result.isError).toBe(true);
  });
});

// ─── H-Phase-A cycle 16: entitlement gate no longer hard-blocks a fresh
// paid-tier account that has no program_entitlements row ────────────────
describe("runPreparePurchasing — entitlement gate matches REST parity", () => {
  function reqWithKey(rawKey: string): import("node:http").IncomingMessage {
    return { headers: { authorization: `Bearer ${rawKey}` } } as unknown as import("node:http").IncomingMessage;
  }

  it("a fresh 'paid' account with NO program_entitlements row still succeeds (matches the REST twin, doesn't hard-block on an unset entitlement)", async () => {
    const acc = await createAccount("Prep Paid Fresh", "prep-paid-fresh@test.local", "paid");
    const { rawKey } = await createApiKey(acc.account_id, "test");
    const before = await getUsageCreditSummary(acc.account_id, "paid");
    const text = await runPreparePurchasing(
      {
        project_name: "prep-paid-fresh",
        project_type: "web_application",
        frameworks: ["react"],
        goals: ["enable purchasing agents"],
        files: minFiles,
      },
      reqWithKey(rawKey),
    );
    const after = await getUsageCreditSummary(acc.account_id, "paid");
    expect(after.included_credits_used).toBeGreaterThan(before.included_credits_used);
    const parsed = JSON.parse(text) as { snapshot_id: string };
    expect(typeof parsed.snapshot_id).toBe("string");
  });

  it("a genuinely free-tier account is still rejected before any charge", async () => {
    const acc = await createAccount("Prep Free", "prep-free@test.local", "free");
    const { rawKey } = await createApiKey(acc.account_id, "test");
    const before = await getUsageCreditSummary(acc.account_id, "free");
    await expect(
      runPreparePurchasing(
        {
          project_name: "prep-free",
          project_type: "web_application",
          frameworks: ["react"],
          goals: ["enable purchasing agents"],
          files: minFiles,
        },
        reqWithKey(rawKey),
      ),
    ).rejects.toThrow("prepare_agentic_purchasing requires");
    const after = await getUsageCreditSummary(acc.account_id, "free");
    expect(after.included_credits_used).toBe(before.included_credits_used);
  });
});
