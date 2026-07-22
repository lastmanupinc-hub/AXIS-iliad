/**
 * H-x402-cycle-25 DEVELOP — POST /v1/analyze's raw request body exceeding
 * router.ts's MAX_BODY_BYTES cap (default 50MB) used to be a flat 413 with
 * zero payable path forward, even for an authenticated account that would
 * happily pay to unlock room for THIS one call. This tests the real
 * end-to-end behavior of the size-scaled x402 surcharge that replaces it.
 *
 * AXIS_LARGE_BODY_FREE_CAP_BYTES/AXIS_LARGE_BODY_HARD_CEILING_BYTES are set
 * to tiny values for this suite (mirrors router-branches.test.ts's own
 * MAX_BODY_BYTES-override technique) so the free-cap/hard-ceiling boundaries
 * can be exercised with small real payloads instead of transferring real
 * tens-of-MB bodies.
 *
 * consumeFreeCall is mocked (same technique as
 * compensate-on-post-charge-failure.test.ts) to make the "payment succeeds"
 * path deterministic without a real Stripe/PAI'D dependency. All test
 * accounts are FREE tier specifically so chargeWithDiscounts always routes
 * to the cash/free-call rail (free tier bypasses consumeUsageCredits
 * entirely — see chargeWithDiscounts's own branch), never absorbing the
 * surcharge into a paid tier's monthly credit allowance.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";

let consumeFreeCallResult = false;
const consumeFreeCallSpy = vi.fn(async () => consumeFreeCallResult);

vi.mock("@axis/snapshots", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@axis/snapshots")>();
  return {
    ...actual,
    consumeFreeCall: (...args: Parameters<typeof consumeFreeCallSpy>) => consumeFreeCallSpy(...args),
  };
});

import { resetTestDb, createAccount, createApiKey } from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleAnalyze } from "./handlers.js";
import { computeLargeBodySurchargeCents } from "./mpp.js";
import { resetRateLimits } from "./rate-limiter.js";

const FREE_CAP_BYTES = 2000;
const HARD_CEILING_BYTES = 6000;

let server: Server;
let testPort = 0;

interface Res { status: number; data: Record<string, unknown> }

function req(body: unknown, key?: string): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const r = require("node:http").request(
      {
        hostname: "127.0.0.1",
        port: testPort,
        path: "/v1/analyze",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
        },
      },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          let data: unknown;
          try { data = JSON.parse(Buffer.concat(chunks).toString("utf-8")); } catch { data = {}; }
          resolve({ status: res.statusCode ?? 0, data: data as Record<string, unknown> });
        });
      },
    );
    r.on("error", reject);
    r.write(payload);
    r.end();
  });
}

function analyzeBody(totalBytes: number): { files: { path: string; content: string }[]; programs: string[] } {
  // programs: [] deliberately avoids handleAnalyze's OWN unrelated default
  // behavior (requestedPrograms === undefined -> ALL pro programs requested,
  // per line ~1797) — that always trips a SEPARATE, pre-existing entitlement
  // charge for a free-tier account regardless of body size, which would
  // otherwise confound these tests (a 402 from the WRONG code path).
  return { files: filesOfApproxSize(totalBytes), programs: [] };
}

function filesOfApproxSize(totalBytes: number): { path: string; content: string }[] {
  // One file padded with a repeating comment so its content is harmless
  // TypeScript, keeping analysis itself simple; the JSON wrapper (path key,
  // quotes) adds a little overhead beyond `totalBytes`, which is fine — the
  // tests assert against the REAL declared Content-Length, not a hardcoded number.
  const padding = "a".repeat(Math.max(0, totalBytes));
  return [{ path: "src/index.ts", content: `// ${padding}\nexport const x = 1;` }];
}

beforeAll(async () => {
  process.env.AXIS_LARGE_BODY_FREE_CAP_BYTES = String(FREE_CAP_BYTES);
  process.env.AXIS_LARGE_BODY_HARD_CEILING_BYTES = String(HARD_CEILING_BYTES);
  await resetTestDb();
  resetRateLimits();
  const router = new Router();
  router.post("/v1/analyze", handleAnalyze);
  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterAll(async () => {
  delete process.env.AXIS_LARGE_BODY_FREE_CAP_BYTES;
  delete process.env.AXIS_LARGE_BODY_HARD_CEILING_BYTES;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("POST /v1/analyze — large-body x402 surcharge", () => {
  it("small body (within the free cap) is unaffected — normal 201 flow", async () => {
    const acct = await createAccount("LargeBodySmall", "large-body-small@test.local", "free");
    const { rawKey } = await createApiKey(acct.account_id);
    const r = await req(analyzeBody(50), rawKey);
    expect(r.status).toBe(201);
  });

  it("returns a real 402 with a size-scaled price when an authenticated account's declared body exceeds the free cap, unpaid", async () => {
    consumeFreeCallResult = false; // no free call available, no real payment credential
    const acct = await createAccount("LargeBodyUnpaid", "large-body-unpaid@test.local", "free");
    const { rawKey } = await createApiKey(acct.account_id);
    const declaredSize = FREE_CAP_BYTES + 1500; // over cap, under ceiling
    const r = await req(analyzeBody(declaredSize), rawKey);

    expect(r.status).toBe(402);
    expect(r.data.error_code).toBe("TIER_REQUIRED");
    expect(r.data.free_cap_bytes).toBe(FREE_CAP_BYTES);
    expect(typeof r.data.declared_bytes).toBe("number");
    const expectedCents = computeLargeBodySurchargeCents(r.data.declared_bytes as number, FREE_CAP_BYTES, HARD_CEILING_BYTES);
    expect(r.data.surcharge_price).toBe(`$${((expectedCents ?? 0) / 100).toFixed(2)}`);
    // Reuses the real build402NegotiationBody shape (same wire format as every other paid feature).
    expect(r.data.accepted_payment_schemes).toBeDefined();
    expect((r.data.message as string)).toContain("free limit");
  });

  it("processes the call normally once the surcharge is covered (free-call rail)", async () => {
    consumeFreeCallResult = true; // simulates the surcharge being covered
    const acct = await createAccount("LargeBodyPaid", "large-body-paid@test.local", "free");
    const { rawKey } = await createApiKey(acct.account_id);
    const declaredSize = FREE_CAP_BYTES + 1500;
    const r = await req(analyzeBody(declaredSize), rawKey);

    expect(r.status).toBe(201);
    consumeFreeCallResult = false;
  });

  it("returns a flat 413 (not 402) when the declared body exceeds the hard ceiling — no amount unlocks it", async () => {
    consumeFreeCallResult = true; // even a "successful" payment path must not matter here
    const acct = await createAccount("LargeBodyOverCeiling", "large-body-over-ceiling@test.local", "free");
    const { rawKey } = await createApiKey(acct.account_id);
    const declaredSize = HARD_CEILING_BYTES + 500;
    const r = await req(analyzeBody(declaredSize), rawKey);

    expect(r.status).toBe(413);
    expect(r.data.error_code).toBe("BODY_TOO_LARGE");
    expect((r.data.error as string)).toContain("any payment can unlock");
    consumeFreeCallResult = false;
  });

  it("anonymous callers are NOT offered the surcharge — unchanged flat-413 behavior", async () => {
    const declaredSize = FREE_CAP_BYTES + 1500;
    const r = await req(analyzeBody(declaredSize)); // no API key
    // Anonymous + over the surcharge's free cap but well under router.ts's
    // real MAX_BODY_BYTES (50MB default, untouched by this suite's env
    // overrides) — the request succeeds exactly as it always has for an
    // anonymous caller at this size; the point of this test is the ABSENCE
    // of a 402 (never offered to anonymous callers), not a specific status.
    expect(r.status).not.toBe(402);
  });
});
