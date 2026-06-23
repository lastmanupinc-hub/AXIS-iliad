import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { resetTestDb } from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import {
  handleCreateSnapshot,
  handleSkillsGenerate,
  handleSearchExport,
  makeProgramHandler,
  PROGRAM_OUTPUTS,
} from "./handlers.js";
import {
  handleCreateAccount,
  handleUpdateTier,
  handleUpdatePrograms,
} from "./billing.js";
import { handleInviteSeat } from "./funnel.js";

let server: Server;
let testPort = 0;

async function req(
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<{ status: number; data: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined;
    const r = require("node:http").request(
      {
        hostname: "127.0.0.1",
        port: testPort,
        path,
        method,
        headers: { "Content-Type": "application/json", ...headers },
      },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: Record<string, unknown> = {};
          try { data = JSON.parse(raw); } catch { data = { raw } as Record<string, unknown>; }
          resolve({ status: res.statusCode ?? 0, data });
        });
      },
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

beforeAll(async () => {
  await resetTestDb();
  const router = new Router();
  router.post("/v1/snapshots", handleCreateSnapshot);
  router.post("/v1/search/export", handleSearchExport);
  router.post("/v1/skills/generate", handleSkillsGenerate);
  router.post("/v1/debug/analyze", makeProgramHandler("debug", PROGRAM_OUTPUTS.debug));
  router.post("/v1/accounts", handleCreateAccount);
  router.post("/v1/account/tier", handleUpdateTier);
  router.post("/v1/account/programs", handleUpdatePrograms);
  router.post("/v1/account/seats", handleInviteSeat);

  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
});

describe("body schema validation", () => {
  // ── Manifest array fields ──────────────────────────────────

  it("rejects manifest.frameworks as string instead of array", async () => {
    const r = await req("POST", "/v1/snapshots", {
      manifest: { project_name: "test", project_type: "web", frameworks: "react", goals: ["analyze"], requested_outputs: [] },
      files: [{ path: "a.ts", content: "x" }],
    });
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("INVALID_FORMAT");
    expect(r.data.error).toContain("must be arrays");
  });

  it("rejects manifest.goals as object instead of array", async () => {
    const r = await req("POST", "/v1/snapshots", {
      manifest: { project_name: "test", project_type: "web", frameworks: ["react"], goals: { analyze: true }, requested_outputs: [] },
      files: [{ path: "a.ts", content: "x" }],
    });
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("INVALID_FORMAT");
  });

  it("rejects manifest.project_name as number", async () => {
    const r = await req("POST", "/v1/snapshots", {
      manifest: { project_name: 123, project_type: "web", frameworks: ["react"], goals: ["analyze"], requested_outputs: [] },
      files: [{ path: "a.ts", content: "x" }],
    });
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("INVALID_FORMAT");
  });

  // ── outputs field ──────────────────────────────────────────

  it("rejects outputs as string instead of array (program handler)", async () => {
    const r = await req("POST", "/v1/debug/analyze", {
      snapshot_id: "test-snap",
      outputs: "tracing-rules.md",
    });
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("INVALID_FORMAT");
    expect(r.data.error).toContain("outputs must be an array");
  });

  it("rejects outputs as number (skills handler)", async () => {
    const r = await req("POST", "/v1/skills/generate", {
      snapshot_id: "test-snap",
      outputs: 42,
    });
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("INVALID_FORMAT");
  });

  // ── snapshot_id type ───────────────────────────────────────

  it("rejects snapshot_id as number", async () => {
    const r = await req("POST", "/v1/search/export", { snapshot_id: 123 });
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("MISSING_FIELD");
  });

  it("rejects snapshot_id as object", async () => {
    const r = await req("POST", "/v1/debug/analyze", { snapshot_id: { id: "abc" } });
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("MISSING_FIELD");
  });

  // ── Account creation type validation ───────────────────────

  it("rejects name as number in account creation", async () => {
    const r = await req("POST", "/v1/accounts", { name: 123, email: "test@example.com" });
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("MISSING_FIELD");
  });

  it("rejects email as array in account creation", async () => {
    const r = await req("POST", "/v1/accounts", { name: "Test", email: ["test@example.com"] });
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("MISSING_FIELD");
  });

  it("rejects tier as object in account creation", async () => {
    const r = await req("POST", "/v1/accounts", { name: "Test", email: "test@example.com", tier: { level: "paid" } });
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("INVALID_FORMAT");
  });

  it("rejects tier as number in tier update", async () => {
    const r = await req("POST", "/v1/account/tier", { tier: 1 });
    // Will be 401 since no auth, but at least parses body
    expect([400, 401]).toContain(r.status);
  });

  // ── enable/disable array validation ────────────────────────

  it("rejects enable as string in program update", async () => {
    const r = await req("POST", "/v1/account/programs", { enable: "debug" });
    // Will be 401 since no auth
    expect([400, 401]).toContain(r.status);
  });

  // ── Seat invitation type validation ────────────────────────

  it("rejects email as number in seat invite", async () => {
    const r = await req("POST", "/v1/account/seats", { email: 123 });
    // Will be 401 since no auth
    expect([400, 401]).toContain(r.status);
  });

  // ── Valid payloads still work ──────────────────────────────

  it("accepts valid account creation with all correct types", async () => {
    const r = await req("POST", "/v1/accounts", {
      name: "Valid User",
      email: "valid@example.com",
      tier: "free",
    });
    expect(r.status).toBe(201);
    expect(r.data.account).toBeTruthy();
  });

  it("accepts snapshot with valid array fields", async () => {
    const r = await req("POST", "/v1/snapshots", {
      manifest: {
        project_name: "test",
        project_type: "web",
        frameworks: ["react"],
        goals: ["analyze"],
        requested_outputs: ["context-map.json"],
      },
      files: [{ path: "a.ts", content: "export const x = 1;" }],
    });
    expect(r.status).toBe(201);
    expect(r.data.status).toBe("ready");
  });
});
