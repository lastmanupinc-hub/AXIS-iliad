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
import { handlePitchRender } from "./pitch-render-handler.js";

let server: Server;
let TEST_PORT: number;

interface Res {
  status: number;
  headers: Record<string, string | string[]>;
  buffer: Buffer;
  json: unknown;
}

/** Unlike mcp-server.test.ts's post() helper, this preserves the response as
 * a raw Buffer — required to verify the binary .pptx path; JSON.parse on
 * binary bytes would corrupt them. Falls back to a parsed `json` field for
 * the error-response tests, which ARE JSON. */
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

const PITCH_DECK_FIXTURE = {
  project: "Test Co",
  honesty_contract: "test",
  slides: [
    { n: 1, title: "Test Co", bullets: ["A one-liner.", "Primary language: TypeScript"], speaker_notes: "Notes 1.", art: "title" },
    { n: 2, title: "What exists — measured", bullets: ["Files: 100"], speaker_notes: "Notes 2.", art: "evidence" },
  ],
  claims_audit: [],
  facts: [],
};

async function makeSnapshotWithDeck(accountId: string | undefined, withDeck = true): Promise<string> {
  const snap = await createSnapshot(
    { input_method: "api_submission", manifest: { project_name: `pitch-render-test-${Math.random()}`, project_type: "library", frameworks: [], goals: [], requested_outputs: [] }, files: [] },
    accountId,
  );
  if (withDeck) {
    await saveGeneratorResult(snap.snapshot_id, {
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      generated_at: "2026-01-01T00:00:00Z",
      files: [{ path: "pitch-deck.json", content: JSON.stringify(PITCH_DECK_FIXTURE), content_type: "application/json", program: "pitch", description: "test" }],
      skipped: [],
    });
  }
  return snap.snapshot_id;
}

beforeAll(async () => {
  await resetTestDb();
  const router = new Router();
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

describe("POST /v1/pitch/render", () => {
  it("returns 401 without auth", async () => {
    const r = await post("/v1/pitch/render", { snapshot_id: "does-not-matter" });
    expect(r.status).toBe(401);
  });

  it("returns 400 when snapshot_id is missing", async () => {
    const account = await createAccount("Pitch Render A", `pitch-render-a-${Math.random()}@test.com`, "paid");
    const key = (await createApiKey(account.account_id, "k")).rawKey;
    const r = await post("/v1/pitch/render", {}, key);
    expect(r.status).toBe(400);
  });

  it("returns 404 for a nonexistent snapshot", async () => {
    const account = await createAccount("Pitch Render B", `pitch-render-b-${Math.random()}@test.com`, "paid");
    const key = (await createApiKey(account.account_id, "k")).rawKey;
    const r = await post("/v1/pitch/render", { snapshot_id: "nonexistent-id" }, key);
    expect(r.status).toBe(404);
  });

  it("returns 404 (not 403) when a DIFFERENT account's key is used — never leaks existence", async () => {
    const owner = await createAccount("Pitch Render Owner", `pitch-render-owner-${Math.random()}@test.com`, "paid");
    const stranger = await createAccount("Pitch Render Stranger", `pitch-render-stranger-${Math.random()}@test.com`, "paid");
    const strangerKey = (await createApiKey(stranger.account_id, "k")).rawKey;
    const snapshotId = await makeSnapshotWithDeck(owner.account_id);
    const r = await post("/v1/pitch/render", { snapshot_id: snapshotId }, strangerKey);
    expect(r.status).toBe(404);
  });

  it("returns 402 when the pitch program is not enabled on the account", async () => {
    const account = await createAccount("Pitch Render C", `pitch-render-c-${Math.random()}@test.com`, "paid");
    const key = (await createApiKey(account.account_id, "k")).rawKey;
    const snapshotId = await makeSnapshotWithDeck(account.account_id);
    const r = await post("/v1/pitch/render", { snapshot_id: snapshotId }, key);
    expect(r.status).toBe(402);
  });

  it("returns 404 when pitch is enabled but no pitch-deck.json artifact exists on the snapshot", async () => {
    const account = await createAccount("Pitch Render D", `pitch-render-d-${Math.random()}@test.com`, "paid");
    const key = (await createApiKey(account.account_id, "k")).rawKey;
    await enableProgram(account.account_id, "pitch");
    const snapshotId = await makeSnapshotWithDeck(account.account_id, false);
    const r = await post("/v1/pitch/render", { snapshot_id: snapshotId }, key);
    expect(r.status).toBe(404);
  });

  it("RED-PROOF end-to-end: returns a real, openable .pptx with the actual slide content embedded", async () => {
    const account = await createAccount("Pitch Render E", `pitch-render-e-${Math.random()}@test.com`, "paid");
    const key = (await createApiKey(account.account_id, "k")).rawKey;
    await enableProgram(account.account_id, "pitch");
    const snapshotId = await makeSnapshotWithDeck(account.account_id);

    const r = await post("/v1/pitch/render", { snapshot_id: snapshotId }, key);
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toBe("application/vnd.openxmlformats-officedocument.presentationml.presentation");
    expect(r.buffer.subarray(0, 4).toString("hex")).toBe("504b0304");

    const zip = await JSZip.loadAsync(r.buffer);
    const slide2 = await zip.files["ppt/slides/slide2.xml"].async("string");
    expect(slide2).toContain("What exists");
    expect(slide2).toContain("Files: 100");
    expect(r.headers["x-axis-slides-total"]).toBe("2");
    // render_backgrounds defaulted false — no xAI call attempted, so no slide gets real art.
    expect(r.headers["x-axis-slides-with-art"]).toBe("");
    // variant defaulted "clean" — the investor deck, and the header says which document this is.
    expect(r.headers["x-axis-variant"]).toBe("clean");
    // Clean deck: the fixture's speaker-notes text must not appear anywhere in the file.
    for (const name of Object.keys(zip.files).filter((f) => f.endsWith(".xml"))) {
      const xml = await zip.files[name].async("string");
      expect(xml, `${name} leaked notes into the clean deck`).not.toContain("Notes 1.");
    }
  });

  it('variant:"annotated" produces the diligence copy — speaker notes present, header echoes the variant, filename marks the document', async () => {
    const account = await createAccount("Pitch Render G", `pitch-render-g-${Math.random()}@test.com`, "paid");
    const key = (await createApiKey(account.account_id, "k")).rawKey;
    await enableProgram(account.account_id, "pitch");
    const snapshotId = await makeSnapshotWithDeck(account.account_id);

    const r = await post("/v1/pitch/render", { snapshot_id: snapshotId, variant: "annotated" }, key);
    expect(r.status).toBe(200);
    expect(r.headers["x-axis-variant"]).toBe("annotated");
    expect(String(r.headers["content-disposition"])).toContain("-annotated.pptx");
    const zip = await JSZip.loadAsync(r.buffer);
    const notes1 = await zip.files["ppt/notesSlides/notesSlide1.xml"].async("string");
    expect(notes1).toContain("Notes 1.");
  });

  it("rejects an unrecognized variant with 400 — sending the wrong document to an investor is the failure this parameter prevents", async () => {
    const account = await createAccount("Pitch Render H", `pitch-render-h-${Math.random()}@test.com`, "paid");
    const key = (await createApiKey(account.account_id, "k")).rawKey;
    await enableProgram(account.account_id, "pitch");
    const snapshotId = await makeSnapshotWithDeck(account.account_id);
    const r = await post("/v1/pitch/render", { snapshot_id: snapshotId, variant: "draft" }, key);
    expect(r.status).toBe(400);
    expect((r.json as { error?: string } | undefined)?.error).toMatch(/clean.*annotated/i);
    // An explicit null is a caller mistake, not a request for the default.
    const rNull = await post("/v1/pitch/render", { snapshot_id: snapshotId, variant: null }, key);
    expect(rNull.status).toBe(400);
  });

  it("returns 500 with a clear message when the stored pitch-deck.json is corrupted, rather than crashing opaquely", async () => {
    const account = await createAccount("Pitch Render F", `pitch-render-f-${Math.random()}@test.com`, "paid");
    const key = (await createApiKey(account.account_id, "k")).rawKey;
    await enableProgram(account.account_id, "pitch");
    const snap = await createSnapshot(
      { input_method: "api_submission", manifest: { project_name: `pitch-render-corrupt-${Math.random()}`, project_type: "library", frameworks: [], goals: [], requested_outputs: [] }, files: [] },
      account.account_id,
    );
    await saveGeneratorResult(snap.snapshot_id, {
      snapshot_id: snap.snapshot_id, project_id: snap.project_id, generated_at: "2026-01-01T00:00:00Z",
      files: [{ path: "pitch-deck.json", content: "{ not valid json", content_type: "application/json", program: "pitch", description: "test" }],
      skipped: [],
    });
    const r = await post("/v1/pitch/render", { snapshot_id: snap.snapshot_id }, key);
    expect(r.status).toBe(500);
    expect((r.json as { error?: string } | undefined)?.error).toMatch(/not valid JSON/i);
  });
});
