// Integration test for POST /v1/notebook/ask against a real Postgres —
// proves the tenancy, entitlement, and validation gates hold end to end,
// not just at the unit level (notebook-qa.test.ts already covers the
// citation-fabrication guard in isolation).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import {
  resetTestDb,
  closeTestDb,
  createAccount,
  createApiKey,
  createSnapshot,
  indexSnapshotContent,
  enableProgram,
} from "@axis/snapshots";
import { Router } from "./router.js";
import { handleNotebookAsk } from "./notebook-ask-handler.js";

async function req(
  method: string,
  path: string,
  body?: unknown,
  authKey?: string,
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
          ...(authKey ? { Authorization: `Bearer ${authKey}` } : {}),
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
let ownerKey = "";
let noEntitlementKey = "";
let strangerKey = "";
let ownedSnapshotId = "";

beforeAll(async () => {
  await resetTestDb();
  const owner = await createAccount("notebook-owner", "notebook-owner@test.local", "paid");
  ownerKey = (await createApiKey(owner.account_id)).rawKey;
  await enableProgram(owner.account_id, "notebook");

  const noEnt = await createAccount("notebook-no-ent", "notebook-no-ent@test.local", "paid");
  noEntitlementKey = (await createApiKey(noEnt.account_id)).rawKey;
  // deliberately NOT enabling notebook for this account

  const stranger = await createAccount("notebook-stranger", "notebook-stranger@test.local", "paid");
  strangerKey = (await createApiKey(stranger.account_id)).rawKey;
  await enableProgram(stranger.account_id, "notebook");

  const snapshot = await createSnapshot(
    {
      input_method: "api_submission",
      manifest: {
        project_name: "notebook-fixture",
        project_type: "web_application",
        frameworks: [],
        goals: ["test"],
        requested_outputs: [],
      },
      files: [{ path: "src/auth.ts", content: "export function authenticate(token) { return verify(token); }", size: 60 }],
    },
    owner.account_id,
  );
  ownedSnapshotId = snapshot.snapshot_id;
  await indexSnapshotContent(ownedSnapshotId, [
    { path: "src/auth.ts", content: "export function authenticate(token) { return verify(token); }" },
  ]);

  const router = new Router();
  router.post("/v1/notebook/ask", handleNotebookAsk);
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
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeTestDb();
});

describe("POST /v1/notebook/ask", () => {
  it("rejects anonymous callers", async () => {
    const r = await req("POST", "/v1/notebook/ask", { snapshot_id: ownedSnapshotId, question: "how does auth work" });
    expect(r.status).toBe(401);
  });

  it("rejects an account without the notebook entitlement", async () => {
    const r = await req(
      "POST",
      "/v1/notebook/ask",
      { snapshot_id: ownedSnapshotId, question: "how does auth work" },
      noEntitlementKey,
    );
    expect(r.status).toBe(402);
    expect((r.data as Record<string, unknown>).error_code).toBe("TIER_REQUIRED");
  });

  it("rejects a caller who does not own the snapshot — cross-tenant IDOR guard", async () => {
    const r = await req(
      "POST",
      "/v1/notebook/ask",
      { snapshot_id: ownedSnapshotId, question: "how does auth work" },
      strangerKey,
    );
    expect(r.status).toBe(404);
  });

  it("rejects a missing question", async () => {
    const r = await req("POST", "/v1/notebook/ask", { snapshot_id: ownedSnapshotId }, ownerKey);
    expect(r.status).toBe(400);
    expect((r.data as Record<string, unknown>).error_code).toBe("MISSING_FIELD");
  });

  it("rejects an unknown snapshot_id", async () => {
    const r = await req("POST", "/v1/notebook/ask", { snapshot_id: "snap-does-not-exist", question: "q" }, ownerKey);
    expect(r.status).toBe(404);
  });

  it("the owner gets a grounded, real answer citing the actual indexed line", async () => {
    const r = await req(
      "POST",
      "/v1/notebook/ask",
      { snapshot_id: ownedSnapshotId, question: "authenticate" },
      ownerKey,
    );
    expect(r.status).toBe(200);
    const data = r.data as { citations: Array<{ file_path: string; line_number: number; content: string }> };
    expect(data.citations.length).toBeGreaterThan(0);
    expect(data.citations[0].file_path).toBe("src/auth.ts");
    expect(data.citations[0].content).toContain("authenticate");
  });

  it("a question with no matches returns an honest empty result, not an error", async () => {
    const r = await req(
      "POST",
      "/v1/notebook/ask",
      { snapshot_id: ownedSnapshotId, question: "quantum blockchain nonsense xyzabc" },
      ownerKey,
    );
    expect(r.status).toBe(200);
    const data = r.data as { citations: unknown[]; answer: unknown };
    expect(data.citations).toEqual([]);
    expect(data.answer).toBeNull();
  });
});
