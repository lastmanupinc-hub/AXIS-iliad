import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { once } from "node:events";
import type { Server } from "node:http";
import JSZip from "jszip";
import {
  resetTestDb,
  createAccount,
  createApiKey,
  createSnapshot,
  saveGeneratorResult,
  enableProgram,
} from "@axis/snapshots";
import { Router, createApp } from "./router.js";
import { handlePitchCompose } from "./pitch-compose-handler.js";
import { handlePitchRender } from "./pitch-render-handler.js";
import type { CompletionFn } from "./living-architecture.js";

let server: Server;
let TEST_PORT: number;

interface Res {
  status: number;
  headers: Record<string, string | string[]>;
  buffer: Buffer;
  json: unknown;
}

async function post(path: string, body: unknown, authKey?: string): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(payload)),
    };
    if (authKey) headers["Authorization"] = `Bearer ${authKey}`;
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: TEST_PORT, path, method: "POST", headers },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const buffer = Buffer.concat(chunks);
          let json: unknown;
          try { json = JSON.parse(buffer.toString("utf-8")); } catch { json = undefined; }
          const h: Record<string, string | string[]> = {};
          for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) h[k] = v;
          resolve({ status: res.statusCode ?? 0, headers: h, buffer, json });
        });
      },
    );
    r.on("error", reject);
    r.write(payload);
    r.end();
  });
}

const DECK_FIXTURE = {
  project: "Compose Co",
  slides: [
    { n: 1, title: "Compose Co", bullets: ['"one-liner"', "OWNER INPUT REQUIRED — the investment thesis."], speaker_notes: "n1", art: "title", provenance: "mixed", owner_inputs: ["investment_thesis"] },
    { n: 5, title: "Business model", bullets: ["OWNER INPUT REQUIRED — pricing."], speaker_notes: "n5", art: "model", provenance: "owner_input", owner_inputs: ["pricing_model"] },
  ],
};

const SOURCE_FILES = [
  { path: "README.md", content: "Compose Co plans start at $19/mo for indie developers.", size: 55 },
  { path: "src/index.ts", content: "export {};", size: 10 },
];

async function makeSnapshot(accountId: string, withDeck = true, withSource = true): Promise<string> {
  const snap = await createSnapshot(
    { input_method: "api_submission", manifest: { project_name: `pitch-compose-test-${Math.random()}`, project_type: "library", frameworks: [], goals: [], requested_outputs: [] }, files: withSource ? SOURCE_FILES : [] },
    accountId,
  );
  if (withDeck) {
    await saveGeneratorResult(snap.snapshot_id, {
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      generated_at: "2026-01-01T00:00:00Z",
      files: [{ path: "pitch-deck.json", content: JSON.stringify(DECK_FIXTURE), content_type: "application/json", program: "pitch", description: "test" }],
      skipped: [],
    });
  }
  return snap.snapshot_id;
}

// A completion whose drafts cite the REAL fixture README — so the citation
// oracle genuinely verifies them, end to end.
const goodCompletion: CompletionFn = () =>
  Promise.resolve({ text: JSON.stringify([{ bullet: "Plans start at $19/mo", file: "README.md", fact: "plans start at $19/mo" }]) });

beforeAll(async () => {
  await resetTestDb();
  const router = new Router();
  router.post("/v1/pitch/compose", (req, res) => handlePitchCompose(req, res));
  router.post("/v1/pitch/compose-injected", (req, res) => handlePitchCompose(req, res, goodCompletion));
  router.post("/v1/pitch/render", handlePitchRender);
  server = createApp(router, 0);
  if (!server.listening) await once(server, "listening");
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  TEST_PORT = addr.port;
});

afterAll(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

describe("POST /v1/pitch/compose", () => {
  it("returns 401 without auth", async () => {
    const r = await post("/v1/pitch/compose", { snapshot_id: "x" });
    expect(r.status).toBe(401);
  });

  it("returns 404 (not 403) for another account's snapshot — never leaks existence", async () => {
    const owner = await createAccount("Compose Owner", `compose-owner-${Math.random()}@test.com`, "paid");
    const stranger = await createAccount("Compose Stranger", `compose-stranger-${Math.random()}@test.com`, "paid");
    const strangerKey = (await createApiKey(stranger.account_id, "k")).rawKey;
    const snapshotId = await makeSnapshot(owner.account_id);
    const r = await post("/v1/pitch/compose", { snapshot_id: snapshotId }, strangerKey);
    expect(r.status).toBe(404);
  });

  it("returns 402 when the pitch program is not enabled", async () => {
    const account = await createAccount("Compose NoPitch", `compose-nopitch-${Math.random()}@test.com`, "paid");
    const key = (await createApiKey(account.account_id, "k")).rawKey;
    const snapshotId = await makeSnapshot(account.account_id);
    const r = await post("/v1/pitch/compose", { snapshot_id: snapshotId }, key);
    expect(r.status).toBe(402);
  });

  it("returns 200 composed:false with a labeled reason when no local model is configured — never an error, never fabrication", async () => {
    const prev = process.env.AXIS_LLM_MODEL_PATH;
    process.env.AXIS_LLM_MODEL_PATH = "Z:/definitely/not/a/model.gguf";
    try {
      const account = await createAccount("Compose NoModel", `compose-nomodel-${Math.random()}@test.com`, "paid");
      const key = (await createApiKey(account.account_id, "k")).rawKey;
      await enableProgram(account.account_id, "pitch");
      const snapshotId = await makeSnapshot(account.account_id);
      const r = await post("/v1/pitch/compose", { snapshot_id: snapshotId }, key);
      expect(r.status).toBe(200);
      const j = r.json as { composed: boolean; report: { configured: boolean; degraded_reason?: string } };
      expect(j.composed).toBe(false);
      expect(j.report.degraded_reason).toBe("not_configured");
    } finally {
      if (prev === undefined) delete process.env.AXIS_LLM_MODEL_PATH;
      else process.env.AXIS_LLM_MODEL_PATH = prev;
    }
  });

  it("RED-PROOF end-to-end: compose persists the inference-filled deck, and render artifact:\"composed\" ships it as a real .pptx with the [inferred] bullet embedded", async () => {
    const account = await createAccount("Compose E2E", `compose-e2e-${Math.random()}@test.com`, "paid");
    const key = (await createApiKey(account.account_id, "k")).rawKey;
    await enableProgram(account.account_id, "pitch");
    const snapshotId = await makeSnapshot(account.account_id);

    const c = await post("/v1/pitch/compose-injected", { snapshot_id: snapshotId }, key);
    expect(c.status).toBe(200);
    const cj = c.json as { composed: boolean; artifact: string; report: { kept_total: number } };
    expect(cj.composed).toBe(true);
    expect(cj.artifact).toBe("pitch-deck-composed.json");
    expect(cj.report.kept_total).toBeGreaterThan(0);

    const r = await post("/v1/pitch/render", { snapshot_id: snapshotId, artifact: "composed" }, key);
    expect(r.status).toBe(200);
    expect(r.buffer.subarray(0, 4).toString("hex")).toBe("504b0304");
    const zip = await JSZip.loadAsync(r.buffer);
    const allXml = await Promise.all(
      Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).map((f) => zip.files[f].async("string")),
    );
    const joined = allXml.join("");
    expect(joined).toContain("Plans start at $19/mo");
    expect(joined).toContain("[inferred: README.md]");
    // The placeholder the inference replaced must be GONE from the rendered deck.
    expect(joined).not.toContain("OWNER INPUT REQUIRED — pricing");
  });

  it("render artifact:\"composed\" without a prior compose returns 404 with the compose hint", async () => {
    const account = await createAccount("Compose NoComposed", `compose-nocomposed-${Math.random()}@test.com`, "paid");
    const key = (await createApiKey(account.account_id, "k")).rawKey;
    await enableProgram(account.account_id, "pitch");
    const snapshotId = await makeSnapshot(account.account_id);
    const r = await post("/v1/pitch/render", { snapshot_id: snapshotId, artifact: "composed" }, key);
    expect(r.status).toBe(404);
    expect((r.json as { error?: string } | undefined)?.error).toMatch(/pitch\/compose/);
  });

  it("render rejects an unknown artifact selector with 400", async () => {
    const account = await createAccount("Compose BadArtifact", `compose-badartifact-${Math.random()}@test.com`, "paid");
    const key = (await createApiKey(account.account_id, "k")).rawKey;
    await enableProgram(account.account_id, "pitch");
    const snapshotId = await makeSnapshot(account.account_id);
    const r = await post("/v1/pitch/render", { snapshot_id: snapshotId, artifact: "handwritten" }, key);
    expect(r.status).toBe(400);
  });
});
