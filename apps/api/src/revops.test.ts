import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import { resetTestDb } from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleCreateAccount } from "./billing.js";
import {
  handleCreateProspect,
  handleEnrichProspect,
  handleAppendEvent,
  handleGetProspect,
  handleTodayQueue,
  handleFunnel,
} from "./revops.js";
import { resetRateLimits } from "./rate-limiter.js";

let server: Server;
let testPort = 0;

interface Res {
  status: number;
  data: Record<string, unknown>;
}

async function req(method: string, path: string, body?: unknown, authKey?: string): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authKey) headers["Authorization"] = `Bearer ${authKey}`;
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: testPort, path, method, headers },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: unknown;
          try {
            data = JSON.parse(raw);
          } catch {
            data = raw;
          }
          resolve({ status: res.statusCode ?? 0, data: data as Record<string, unknown> });
        });
      },
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

let adminKey: string;
let regularKey: string;

beforeAll(async () => {
  await resetTestDb();
  resetRateLimits();
  const router = new Router();
  router.post("/v1/accounts", handleCreateAccount);
  router.post("/v1/revops/prospects", handleCreateProspect);
  router.post("/v1/revops/prospects/:prospect_id/events", handleAppendEvent);
  router.patch("/v1/revops/prospects/:prospect_id", handleEnrichProspect);
  router.get("/v1/revops/prospects/:prospect_id", handleGetProspect);
  router.get("/v1/revops/today", handleTodayQueue);
  router.get("/v1/revops/funnel", handleFunnel);
  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;

  const admin = await req("POST", "/v1/accounts", { name: "RevOps Admin", email: "revops-admin@test.com" });
  adminKey = (admin.data as any).api_key.raw_key;
  process.env.ADMIN_API_KEY = adminKey;

  const regular = await req("POST", "/v1/accounts", { name: "Regular", email: "revops-regular@test.com" });
  regularKey = (regular.data as any).api_key.raw_key;
});

afterAll(async () => {
  delete process.env.ADMIN_API_KEY;
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

beforeEach(async () => {
  resetRateLimits();
});

// ─── Access control ──────────────────────────────────────────────────────
// The pipeline holds prospect PII and targeting intelligence. A merely
// authenticated account must never see it — these are the tests that keep
// "admin-only" from silently degrading to "logged-in-only" in a refactor.

describe("revops routes: access control", () => {
  it("rejects an unauthenticated caller", async () => {
    expect((await req("GET", "/v1/revops/today")).status).toBe(401);
  });

  it("rejects a REGULAR authenticated account on every route", async () => {
    const paths: [string, string][] = [
      ["GET", "/v1/revops/today"],
      ["GET", "/v1/revops/funnel"],
      ["GET", "/v1/revops/prospects/prs_whatever"],
    ];
    for (const [method, path] of paths) {
      const r = await req(method, path, undefined, regularKey);
      expect(r.status, `${method} ${path} must not be readable by a non-admin`).toBe(403);
    }
    const post = await req(
      "POST",
      "/v1/revops/prospects",
      { legal_name: "Sneaky", source_id: "x" },
      regularKey,
    );
    expect(post.status).toBe(403);
  });
});

// ─── Ingest + derive ─────────────────────────────────────────────────────

describe("revops routes: prospects", () => {
  it("creates a prospect and derives IDENTIFIED with a next action", async () => {
    const r = await req(
      "POST",
      "/v1/revops/prospects",
      { legal_name: "Acme CBD", website: "https://acme-cbd.example", source_id: "public-registry" },
      adminKey,
    );
    expect(r.status).toBe(200);
    const id = (r.data as any).prospect.prospect_id as string;

    const got = await req("GET", `/v1/revops/prospects/${id}`, undefined, adminKey);
    expect(got.status).toBe(200);
    expect((got.data as any).stage).toBe("IDENTIFIED");
    // Un-enriched: the engine should be asking for enrichment, not contact.
    expect((got.data as any).next_action.action).toBe("enrich");
  });

  it("requires legal_name and source_id (provenance is not optional)", async () => {
    const r = await req("POST", "/v1/revops/prospects", { legal_name: "No Source" }, adminKey);
    expect(r.status).toBe(400);
  });

  it("enriches facts and reflects them in qualification on the next read", async () => {
    const created = await req(
      "POST",
      "/v1/revops/prospects",
      { legal_name: "Nutra Co", website: "https://nutra.example", source_id: "seed" },
      adminKey,
    );
    const id = (created.data as any).prospect.prospect_id as string;

    await req(
      "PATCH",
      `/v1/revops/prospects/${id}`,
      { facts: { vertical: "cbd", est_monthly_volume: 8_000_000 } },
      adminKey,
    );

    const got = await req("GET", `/v1/revops/prospects/${id}`, undefined, adminKey);
    // Qualification is recomputed on read — no backfill job needed.
    expect((got.data as any).qualification.qualified).toBe(true);
  });

  it("404s an unknown prospect", async () => {
    const r = await req("GET", "/v1/revops/prospects/prs_missing", undefined, adminKey);
    expect(r.status).toBe(404);
  });
});

// ─── The core property, over HTTP ────────────────────────────────────────

describe("revops routes: events move the pipeline", () => {
  it("appending one fact advances the stage — no stage is ever sent", async () => {
    const created = await req(
      "POST",
      "/v1/revops/prospects",
      { legal_name: "Move Co", website: "https://move.example", source_id: "seed" },
      adminKey,
    );
    const id = (created.data as any).prospect.prospect_id as string;

    const qualified = await req(
      "POST",
      `/v1/revops/prospects/${id}/events`,
      { type: "qualified", payload: { reasons: ["high-risk vertical"] } },
      adminKey,
    );
    expect(qualified.status).toBe(201);
    // The response shows what the fact did, so the caller needs no second call.
    expect((qualified.data as any).stage).toBe("QUALIFIED");
    expect((qualified.data as any).next_action.action).toBe("find_decision_maker");

    await req("POST", `/v1/revops/prospects/${id}/events`, { type: "decision_maker_found" }, adminKey);
    const verified = await req(
      "POST",
      `/v1/revops/prospects/${id}/events`,
      { type: "contact_verified" },
      adminKey,
    );
    expect((verified.data as any).stage).toBe("READY_TO_CONTACT");
    expect((verified.data as any).next_action.action).toBe("contact");
  });

  it("refuses an unknown event type rather than storing garbage", async () => {
    const created = await req(
      "POST",
      "/v1/revops/prospects",
      { legal_name: "Bad Event Co", website: "https://bad.example", source_id: "seed" },
      adminKey,
    );
    const id = (created.data as any).prospect.prospect_id as string;
    const r = await req("POST", `/v1/revops/prospects/${id}/events`, { type: "set_stage" }, adminKey);
    // "set_stage" must never be appendable — it would reintroduce hand-set state.
    expect(r.status).toBe(400);
  });

  it("honors opt-out by removing the prospect from all future work", async () => {
    const created = await req(
      "POST",
      "/v1/revops/prospects",
      { legal_name: "Optout Co", website: "https://optout.example", source_id: "seed" },
      adminKey,
    );
    const id = (created.data as any).prospect.prospect_id as string;
    await req("POST", `/v1/revops/prospects/${id}/events`, { type: "contacted" }, adminKey);
    const r = await req(
      "POST",
      `/v1/revops/prospects/${id}/events`,
      { type: "replied", payload: { sentiment: "negative", opt_out: true } },
      adminKey,
    );
    expect((r.data as any).state).toBe("DISQUALIFIED");
    expect((r.data as any).next_action.action).toBe("nothing");
  });
});

// ─── Queue + funnel ──────────────────────────────────────────────────────

describe("revops routes: today queue and funnel", () => {
  it("returns only due work, and the funnel counts it", async () => {
    // One prospect fully prepared -> due now.
    const ready = await req(
      "POST",
      "/v1/revops/prospects",
      {
        legal_name: "Ready Co",
        website: "https://ready.example",
        source_id: "seed",
        facts: { vertical: "cbd", est_monthly_volume: 9_000_000 },
      },
      adminKey,
    );
    const readyId = (ready.data as any).prospect.prospect_id as string;
    for (const type of ["qualified", "decision_maker_found", "contact_verified"]) {
      await req("POST", `/v1/revops/prospects/${readyId}/events`, { type }, adminKey);
    }

    const queue = await req("GET", "/v1/revops/today", undefined, adminKey);
    expect(queue.status).toBe(200);
    const ids = (queue.data as any).queue.map((q: { prospect_id: string }) => q.prospect_id);
    expect(ids).toContain(readyId);

    const entry = (queue.data as any).queue.find((q: any) => q.prospect_id === readyId);
    expect(entry.action).toBe("contact");
    // The queue must be explainable — a reason is always present.
    expect(entry.reason).toBeTruthy();

    const f = await req("GET", "/v1/revops/funnel", undefined, adminKey);
    expect(f.status).toBe(200);
    expect((f.data as any).reached.READY_TO_CONTACT).toBeGreaterThanOrEqual(1);
    expect(typeof (f.data as any).summary).toBe("string");
    expect((f.data as any).summary).toContain("identified");
    // Truncation is surfaced, never silent — a short funnel is a wrong funnel.
    expect((f.data as any).truncated).toBe(false);
  });

  it("caps the queue so a human gets a workable list", async () => {
    const r = await req("GET", "/v1/revops/today?limit=2", undefined, adminKey);
    expect(r.status).toBe(200);
    expect((r.data as any).queue.length).toBeLessThanOrEqual(2);
  });
});
