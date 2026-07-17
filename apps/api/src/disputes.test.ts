// WO-08 — dispute lifecycle, API half.
//
// Covers: the four new Stripe webhook branches (signature-verified fixtures →
// dispute-store rows + state-machine transitions + funnel telemetry), the
// event-path walker, and the metered assemble_representment tool (CE 3.0 →
// Stripe evidence hash → optional mocked submission; authorize/capture
// metering; access control). No live network calls anywhere — the dispute
// client is injected as a mock.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import type { IncomingMessage } from "node:http";
import {
  resetTestDb,
  createAccount,
  createApiKey,
  upsertDispute,
  getDispute,
  listDisputeTransitions,
  getUsageCreditSummary,
  sql,
  type StoredDisputeRecord,
} from "@axis/snapshots";
import type { DisputeClient, StripeRepresentmentEvidence } from "@axis/agentic-compliance";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleStripeWebhook } from "./stripe.js";
import {
  findEventPath,
  handleAssembleRepresentment,
  runAssembleRepresentment,
  mapStripeDisputeStatus,
} from "./disputes.js";
import { resetRateLimits } from "./rate-limiter.js";

let server: Server;
let testPort = 0;
const WEBHOOK_SECRET = "test_webhook_secret_disputes";

// ─── HTTP helper ────────────────────────────────────────────────

async function postWebhook(payload: string, sig?: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (sig) headers["stripe-signature"] = sig;
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: testPort, path: "/v1/webhooks/stripe", method: "POST", headers },
      (res: IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          let data: Record<string, unknown> = {};
          try { data = JSON.parse(Buffer.concat(chunks).toString("utf-8")); } catch { /* raw */ }
          resolve({ status: res.statusCode ?? 0, data });
        });
      },
    );
    r.on("error", reject);
    r.write(payload);
    r.end();
  });
}

function sign(payload: string, ts: number = Math.floor(Date.now() / 1000)): string {
  const hmac = createHmac("sha256", WEBHOOK_SECRET).update(`${ts}.${payload}`).digest("hex");
  return `t=${ts},v1=${hmac}`;
}

function disputeEvent(
  type: "charge.dispute.created" | "charge.dispute.updated" | "charge.dispute.closed",
  overrides: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    type,
    data: {
      object: {
        id: "dp_wh_1",
        object: "dispute",
        charge: "ch_wh_1",
        amount: 5000,
        currency: "usd",
        reason: "fraudulent",
        status: "needs_response",
        created: 1751846400, // 2025-07-07T00:00:00Z
        evidence_details: { due_by: 1752969600 }, // 2025-07-20T00:00:00Z
        metadata: {},
        ...overrides,
      },
    },
  });
}

// ─── Fixtures ───────────────────────────────────────────────────

function storedDispute(overrides: Partial<StoredDisputeRecord> = {}): StoredDisputeRecord {
  const now = "2026-06-10T00:00:00.000Z";
  return {
    id: "dp_local_1",
    rail: "stripe",
    chargeId: "ch_local_1",
    accountId: null,
    reasonCode: "10.4",
    amountMinor: 5000,
    currency: "usd",
    state: "needs_response",
    dueBy: "2026-06-24T00:00:00.000Z",
    createdAt: now,
    updatedAt: now,
    representmentId: null,
    ...overrides,
  };
}

const CE3_HISTORY = [
  { id: "t1", amount_minor: 900, currency: "usd", created_at: "2025-10-01T00:00:00.000Z", disputed: false, email: "a@b.com", device_id: "d1" },
  { id: "t2", amount_minor: 700, currency: "usd", created_at: "2025-12-01T00:00:00.000Z", disputed: false, email: "a@b.com", device_id: "d1" },
];

function mockClient(): { client: DisputeClient; calls: Array<{ disputeId: string; evidence: StripeRepresentmentEvidence; submit: boolean }> } {
  const calls: Array<{ disputeId: string; evidence: StripeRepresentmentEvidence; submit: boolean }> = [];
  const client: DisputeClient = {
    rail: "stripe",
    async fetchDispute() {
      throw new Error("not used in this test");
    },
    async submitEvidence(disputeId, evidence, submit) {
      calls.push({ disputeId, evidence, submit });
      return { ok: true, state: "evidence_submitted" };
    },
  };
  return { client, calls };
}

// ─── Setup ──────────────────────────────────────────────────────

beforeAll(async () => {
  await resetTestDb();
  resetRateLimits();
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  const router = new Router();
  router.post("/v1/webhooks/stripe", handleStripeWebhook);
  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

beforeEach(() => {
  resetRateLimits();
});

// ─── State machine walking ──────────────────────────────────────

describe("findEventPath (BFS over DISPUTE_TRANSITIONS)", () => {
  it("already there → empty path", () => {
    expect(findEventPath("needs_response", "needs_response")).toEqual([]);
  });

  it("needs_response → under_review walks the evidence pipeline", () => {
    expect(findEventPath("needs_response", "under_review")).toEqual([
      "evidence_ready",
      "evidence_submitted",
      "evidence_submitted",
    ]);
  });

  it("needs_response → won goes through review", () => {
    expect(findEventPath("needs_response", "won")).toEqual([
      "evidence_ready",
      "evidence_submitted",
      "evidence_submitted",
      "provider_won",
    ]);
  });

  it("terminal states have no outgoing paths", () => {
    expect(findEventPath("won", "needs_response")).toBeNull();
    expect(findEventPath("accepted", "under_review")).toBeNull();
  });

  it("mapStripeDisputeStatus covers the Stripe vocabulary", () => {
    expect(mapStripeDisputeStatus("needs_response")).toBe("needs_response");
    expect(mapStripeDisputeStatus("under_review")).toBe("under_review");
    expect(mapStripeDisputeStatus("won")).toBe("won");
    expect(mapStripeDisputeStatus("lost")).toBe("lost");
    expect(mapStripeDisputeStatus("charge_refunded")).toBe("accepted");
    expect(mapStripeDisputeStatus("warning_closed")).toBe("warning_closed");
    expect(mapStripeDisputeStatus(undefined)).toBe("needs_response");
  });
});

// ─── Webhook branches ───────────────────────────────────────────

describe("POST /v1/webhooks/stripe — charge.dispute.* + radar EFW", () => {
  it("rejects an unsigned dispute event", async () => {
    const r = await postWebhook(disputeEvent("charge.dispute.created"));
    expect(r.status).toBe(401);
  });

  it("charge.dispute.created persists a needs_response DisputeRecord with dueBy", async () => {
    const payload = disputeEvent("charge.dispute.created");
    const r = await postWebhook(payload, sign(payload));
    expect(r.status).toBe(200);
    expect(r.data.handled).toBe(true);
    const rec = await getDispute("dp_wh_1");
    expect(rec).not.toBeNull();
    expect(rec!.state).toBe("needs_response");
    expect(rec!.reasonCode).toBe("fraudulent");
    expect(rec!.amountMinor).toBe(5000);
    expect(rec!.dueBy).toBe(new Date(1752969600 * 1000).toISOString());
    expect(rec!.chargeId).toBe("ch_wh_1");
  });

  it("a duplicate created event is idempotent (at-least-once delivery)", async () => {
    const payload = disputeEvent("charge.dispute.created");
    await postWebhook(payload, sign(payload));
    const again = await postWebhook(payload, sign(payload));
    expect(again.status).toBe(200);
    const rec = await getDispute("dp_wh_1");
    expect(rec!.state).toBe("needs_response");
  });

  it("created + metadata.account_id also tracks a dispute_opened funnel event", async () => {
    const acc = await createAccount("Dispute Merchant", "dispute-merchant@test.com", "free");
    const payload = disputeEvent("charge.dispute.created", { id: "dp_wh_acct", metadata: { account_id: acc.account_id } });
    await postWebhook(payload, sign(payload));
    const row = await sql.one<{ event_type: string; stage: string }>(
      "SELECT event_type, stage FROM funnel_events WHERE account_id = ? AND event_type = 'dispute_opened'",
      [acc.account_id],
    );
    expect(row?.event_type).toBe("dispute_opened");
  });

  it("charge.dispute.updated → under_review walks the state machine and logs every hop", async () => {
    const created = disputeEvent("charge.dispute.created", { id: "dp_wh_2" });
    await postWebhook(created, sign(created));
    const updated = disputeEvent("charge.dispute.updated", { id: "dp_wh_2", status: "under_review" });
    const r = await postWebhook(updated, sign(updated));
    expect(r.status).toBe(200);
    const rec = await getDispute("dp_wh_2");
    expect(rec!.state).toBe("under_review");
    const hops = await listDisputeTransitions("dp_wh_2");
    expect(hops.map((h) => `${h.from}-${h.event}->${h.to}`)).toEqual([
      "needs_response-evidence_ready->evidence_assembling",
      "evidence_assembling-evidence_submitted->evidence_submitted",
      "evidence_submitted-evidence_submitted->under_review",
    ]);
  });

  it("charge.dispute.closed status won drives the record to won", async () => {
    const created = disputeEvent("charge.dispute.created", { id: "dp_wh_3" });
    await postWebhook(created, sign(created));
    const closed = disputeEvent("charge.dispute.closed", { id: "dp_wh_3", status: "won" });
    const r = await postWebhook(closed, sign(closed));
    expect(r.status).toBe(200);
    expect((await getDispute("dp_wh_3"))!.state).toBe("won");
  });

  it("charge.dispute.closed status lost drives the record to lost", async () => {
    const created = disputeEvent("charge.dispute.created", { id: "dp_wh_4" });
    await postWebhook(created, sign(created));
    const closed = disputeEvent("charge.dispute.closed", { id: "dp_wh_4", status: "lost" });
    await postWebhook(closed, sign(closed));
    expect((await getDispute("dp_wh_4"))!.state).toBe("lost");
  });

  it("radar.early_fraud_warning.created tracks an early_fraud_warning funnel event", async () => {
    const acc = await createAccount("EFW Merchant", "efw-merchant@test.com", "free");
    const payload = JSON.stringify({
      type: "radar.early_fraud_warning.created",
      data: {
        object: {
          id: "issfr_1",
          object: "radar.early_fraud_warning",
          charge: "ch_efw_1",
          fraud_type: "made_with_stolen_card",
          actionable: true,
          created: 1751846400,
          metadata: { account_id: acc.account_id },
        },
      },
    });
    const r = await postWebhook(payload, sign(payload));
    expect(r.status).toBe(200);
    expect(r.data.handled).toBe(true);
    const row = await sql.one<{ metadata: string }>(
      "SELECT metadata FROM funnel_events WHERE account_id = ? AND event_type = 'early_fraud_warning'",
      [acc.account_id],
    );
    expect(row).not.toBeNull();
    expect(JSON.parse(row!.metadata).fraud_type).toBe("made_with_stolen_card");
  });

  it("an unattributable EFW (no account metadata) still returns 200 without a funnel row", async () => {
    const payload = JSON.stringify({
      type: "radar.early_fraud_warning.created",
      data: { object: { id: "issfr_2", charge: "ch_efw_2", fraud_type: "fraudulent" } },
    });
    const r = await postWebhook(payload, sign(payload));
    expect(r.status).toBe(200);
  });
});

// ─── assemble_representment core ────────────────────────────────

describe("handleAssembleRepresentment", () => {
  it("assembles CE 3.0 + Stripe evidence, walks to evidence_assembling, and never submits by default", async () => {
    const acc = await createAccount("Rep Merchant", "rep-merchant@test.com", "free");
    await upsertDispute(storedDispute({ id: "dp_rep_1", accountId: acc.account_id }));
    const { client, calls } = mockClient();

    const result = await handleAssembleRepresentment(acc.account_id, {
      dispute_id: "dp_rep_1",
      disputed_txn: { email: "a@b.com", device_id: "d1" },
      transaction_history: CE3_HISTORY,
      evidence_inputs: { customerEmail: "a@b.com", productDescription: "Pro plan", threeDsAuthenticated: true },
    }, { client });

    expect(result.ce3_eligible).toBe(true);
    expect(result.ce3.qualifying_priors).toHaveLength(2);
    expect(result.evidence.uncategorized_text).toContain("Compelling Evidence 3.0");
    expect(result.evidence.uncategorized_text).toContain("3-D Secure authenticated");
    expect(result.evidence.customer_email_address).toBe("a@b.com");
    expect(result.evidence.product_description).toBe("Pro plan");
    expect(result.submitted).toBe(false);
    expect(calls).toHaveLength(0); // no submission requested → zero client calls
    expect(result.dispute.state).toBe("evidence_assembling");
    expect(result.dispute.representmentId).toMatch(/^rep_[0-9a-f]{16}$/);
    expect(result.disclaimer).toContain("AXIS does not publish win-rate estimates");
    const hops = await listDisputeTransitions("dp_rep_1");
    expect(hops[0]).toMatchObject({ from: "needs_response", to: "evidence_assembling", event: "evidence_ready" });
  });

  it("submit=true submits the built evidence through the injected client and advances to evidence_submitted", async () => {
    const acc = await createAccount("Rep Submitter", "rep-submitter@test.com", "free");
    await upsertDispute(storedDispute({ id: "dp_rep_2", accountId: acc.account_id }));
    const { client, calls } = mockClient();

    const result = await handleAssembleRepresentment(acc.account_id, {
      dispute_id: "dp_rep_2",
      transaction_history: CE3_HISTORY,
      evidence_inputs: { customerEmail: "a@b.com" },
      submit: true,
    }, { client });

    expect(result.submitted).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].disputeId).toBe("dp_rep_2");
    expect(calls[0].submit).toBe(true);
    expect(calls[0].evidence).toEqual(result.evidence);
    expect(result.dispute.state).toBe("evidence_submitted");
    const hops = await listDisputeTransitions("dp_rep_2");
    expect(hops.map((h) => h.event)).toEqual(["evidence_ready", "evidence_submitted"]);
  });

  it("submit=true without any configured client returns submitted:false with a note (no fake submission)", async () => {
    const acc = await createAccount("Rep NoStripe", "rep-nostripe@test.com", "free");
    await upsertDispute(storedDispute({ id: "dp_rep_3", accountId: acc.account_id }));
    const result = await handleAssembleRepresentment(acc.account_id, {
      dispute_id: "dp_rep_3",
      submit: true,
    }, { client: null });
    expect(result.submitted).toBe(false);
    expect(result.submit_note).toContain("submit skipped");
  });

  it("a non-eligible CE 3.0 packet still yields usable evidence (deterministic, no crash)", async () => {
    const acc = await createAccount("Rep NoCe3", "rep-noce3@test.com", "free");
    await upsertDispute(storedDispute({ id: "dp_rep_4", accountId: acc.account_id, reasonCode: "13.1" }));
    const result = await handleAssembleRepresentment(acc.account_id, {
      dispute_id: "dp_rep_4",
      transaction_history: CE3_HISTORY,
      evidence_inputs: { customerEmail: "a@b.com" },
    }, { client: null });
    expect(result.ce3_eligible).toBe(false);
    expect(result.evidence.uncategorized_text).toContain("no qualifying prior undisputed transactions");
    expect(result.evidence.customer_email_address).toBe("a@b.com");
  });

  it("another account's dispute is indistinguishable from nonexistent", async () => {
    const owner = await createAccount("Rep Owner", "rep-owner@test.com", "free");
    const intruder = await createAccount("Rep Intruder", "rep-intruder@test.com", "free");
    await upsertDispute(storedDispute({ id: "dp_rep_5", accountId: owner.account_id }));
    await expect(
      handleAssembleRepresentment(intruder.account_id, { dispute_id: "dp_rep_5" }, { client: null }),
    ).rejects.toThrow("Dispute not found");
    await expect(
      handleAssembleRepresentment(intruder.account_id, { dispute_id: "dp_missing" }, { client: null }),
    ).rejects.toThrow("Dispute not found");
  });

  it("an unattributed (webhook-ingested) dispute is claimed by the assembling account", async () => {
    const acc = await createAccount("Rep Claimer", "rep-claimer@test.com", "free");
    await upsertDispute(storedDispute({ id: "dp_rep_6", accountId: null }));
    const result = await handleAssembleRepresentment(acc.account_id, { dispute_id: "dp_rep_6" }, { client: null });
    expect(result.dispute.accountId).toBe(acc.account_id);
  });
});

// ─── MCP entrypoint: auth + metering ────────────────────────────

describe("runAssembleRepresentment (metered MCP tool)", () => {
  function reqWithKey(rawKey?: string): IncomingMessage {
    return { headers: rawKey ? { authorization: `Bearer ${rawKey}` } : {} } as IncomingMessage;
  }

  it("requires authentication", async () => {
    await expect(runAssembleRepresentment({ dispute_id: "dp_x" }, reqWithKey())).rejects.toThrow("Authentication required");
  });

  it("meters through authorize/capture: a successful call debits plan credits", async () => {
    const acc = await createAccount("Rep Metered", "rep-metered@test.com", "free");
    const { rawKey } = await createApiKey(acc.account_id, "test");
    await upsertDispute(storedDispute({ id: "dp_rep_7", accountId: acc.account_id }));

    const before = await getUsageCreditSummary(acc.account_id, "free");
    const text = await runAssembleRepresentment(
      { dispute_id: "dp_rep_7", disputed_txn: { email: "a@b.com", device_id: "d1" }, transaction_history: CE3_HISTORY },
      reqWithKey(rawKey),
      { client: null },
    );
    const after = await getUsageCreditSummary(acc.account_id, "free");
    expect(after.included_credits_used).toBeGreaterThan(before.included_credits_used);

    const parsed = JSON.parse(text);
    expect(parsed.ce3_eligible).toBe(true);
    expect(parsed.dispute.state).toBe("evidence_assembling");
    expect(parsed.disclaimer).toContain("VROL/RDR/CDRN");
  });

  it("a failed call (dispute not found) never debits", async () => {
    const acc = await createAccount("Rep Unbilled", "rep-unbilled@test.com", "free");
    const { rawKey } = await createApiKey(acc.account_id, "test");
    const before = await getUsageCreditSummary(acc.account_id, "free");
    await expect(
      runAssembleRepresentment({ dispute_id: "dp_never" }, reqWithKey(rawKey), { client: null }),
    ).rejects.toThrow("Dispute not found");
    const after = await getUsageCreditSummary(acc.account_id, "free");
    expect(after.included_credits_used).toBe(before.included_credits_used);
  });

  // ─── Lite mode never auto-submits (H-Phase-A cycle 1) ─────────────
  //
  // lite_description promises "CE 3.0 qualification + evidence hash only (no
  // auto-submit to the Stripe disputes API)". Before this fix, submit:true
  // reached the real dispute client regardless of X-Agent-Mode.
  function reqWithKeyLite(rawKey: string): IncomingMessage {
    return { headers: { authorization: `Bearer ${rawKey}`, "x-agent-mode": "lite" } } as IncomingMessage;
  }

  it("lite mode ignores submit:true — evidence is still assembled, but never reaches the dispute client", async () => {
    const acc = await createAccount("Rep LiteNoSubmit", "rep-lite-nosubmit@test.com", "free");
    const { rawKey } = await createApiKey(acc.account_id, "test");
    await upsertDispute(storedDispute({ id: "dp_rep_lite_1", accountId: acc.account_id }));
    const { client, calls } = mockClient();

    const text = await runAssembleRepresentment(
      {
        dispute_id: "dp_rep_lite_1",
        transaction_history: CE3_HISTORY,
        evidence_inputs: { customerEmail: "a@b.com" },
        submit: true,
      },
      reqWithKeyLite(rawKey),
      { client },
    );
    const parsed = JSON.parse(text);

    // The real client was configured and would have accepted the call
    // (proven by the standard-mode test below using the same helper) — lite
    // mode must intercept BEFORE the client is ever invoked, not rely on the
    // client being unconfigured.
    expect(calls).toHaveLength(0);
    expect(parsed.submitted).toBe(false);
    expect(parsed.submit_note).toContain("lite mode");
    expect(parsed.submit_note).toContain("never auto-submits");
    // The lite promise's OTHER half ("CE 3.0 qualification + evidence hash
    // only") still works — lite doesn't block assembly, only submission.
    expect(typeof parsed.ce3_eligible).toBe("boolean");
    expect(parsed.evidence).toBeDefined();
    expect(parsed.dispute.state).toBe("evidence_assembling");
  });

  it("standard mode still submits for real when a client is configured (no regression)", async () => {
    const acc = await createAccount("Rep StdSubmit", "rep-std-submit@test.com", "free");
    const { rawKey } = await createApiKey(acc.account_id, "test");
    await upsertDispute(storedDispute({ id: "dp_rep_std_1", accountId: acc.account_id }));
    const { client, calls } = mockClient();

    const text = await runAssembleRepresentment(
      {
        dispute_id: "dp_rep_std_1",
        transaction_history: CE3_HISTORY,
        evidence_inputs: { customerEmail: "a@b.com" },
        submit: true,
      },
      reqWithKey(rawKey),
      { client },
    );
    const parsed = JSON.parse(text);

    expect(calls).toHaveLength(1);
    expect(parsed.submitted).toBe(true);
    expect(parsed.dispute.state).toBe("evidence_submitted");
  });
});
