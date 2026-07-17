// WO-13 — commerce engines as MCP tools.
//
// Verifies the five free, no-auth, deterministic tools are registered,
// dispatched end-to-end, wired to the REAL engines, reproducible
// (byte-identical proofs), and honest (score_dispute_readiness explicitly
// disclaims win prediction; no score_dispute_win tool exists).

import { describe, it, expect, beforeAll } from "vitest";
import type { IncomingMessage } from "node:http";
import { resetTestDb } from "@axis/snapshots";
import { MCP_TOOLS, dispatch } from "./mcp-server.js";
import { MCP_TOOL_COUNT } from "./counts.js";
import { decideScaExemption, gradeCompliance } from "@axis/generator-core";
import { verifyMandate, type SignedMandate } from "@axis/ap2";
import { scoreWinProbability } from "@axis/agentic-compliance";

const NEW_FREE_TOOLS = [
  "sca_exemption_decision",
  "grade_compliance",
  "assemble_ce3_evidence",
  "build_ap2_mandate",
  "score_dispute_readiness",
] as const;

function anonReq(): IncomingMessage {
  return { headers: {} } as IncomingMessage;
}

async function callTool(name: string, args: Record<string, unknown>): Promise<{ isError: boolean; text: string }> {
  const res = await dispatch("tools/call", { name, arguments: args }, 1, anonReq());
  expect("result" in res).toBe(true);
  const result = (res as { result: { isError: boolean; content: Array<{ text: string }> } }).result;
  return { isError: result.isError, text: result.content[0].text };
}

beforeAll(async () => {
  await resetTestDb();
});

// ─── Registration ──────────────────────────────────────────────────

describe("WO-13 registration", () => {
  it("all five commerce-engine tools + assemble_representment are in MCP_TOOLS", () => {
    const names = MCP_TOOLS.map((t) => t.name);
    for (const n of NEW_FREE_TOOLS) expect(names).toContain(n);
    expect(names).toContain("assemble_representment");
  });

  it("the five free tools carry readOnlyHint:true; assemble_representment does not", () => {
    for (const n of NEW_FREE_TOOLS) {
      const tool = MCP_TOOLS.find((t) => t.name === n)!;
      expect(tool.annotations.readOnlyHint, `${n}.readOnlyHint`).toBe(true);
    }
    const rep = MCP_TOOLS.find((t) => t.name === "assemble_representment")!;
    expect(rep.annotations.readOnlyHint).toBe(false);
  });

  it("MCP_TOOL_COUNT === MCP_TOOLS.length === 37 (WO-13 + WO-08 + WO-14 network tokenization + x402 onboarding ping_payment)", () => {
    expect(MCP_TOOLS.length).toBe(37);
    expect(MCP_TOOL_COUNT).toBe(MCP_TOOLS.length);
  });

  it("HONESTY: no tool named score_dispute_win; the readiness tool discloses non-prediction", () => {
    expect(MCP_TOOLS.some((t) => t.name === "score_dispute_win")).toBe(false);
    const tool = MCP_TOOLS.find((t) => t.name === "score_dispute_readiness")!;
    expect(tool.description).toContain("NOT a dispute-win prediction");
    expect(tool.description).toContain("AXIS does not publish win-rate estimates");
  });
});

// ─── sca_exemption_decision ────────────────────────────────────────

describe("sca_exemption_decision (dispatch, no auth)", () => {
  it("low-value: €20 → low_value, priority 1, no SCA", async () => {
    const { isError, text } = await callTool("sca_exemption_decision", { amount_eur: 20 });
    expect(isError).toBe(false);
    const parsed = JSON.parse(text);
    expect(parsed.decision.exemption).toBe("low_value");
    expect(parsed.decision.priority).toBe(1);
    expect(parsed.decision.sca_required).toBe(false);
    expect(parsed.matrix).toContain("| 1 | `low_value` |");
    expect(parsed.caveat).toContain("acquirer");
  });

  it("no lighter path: €1000 with no flags → 3ds2_challenge, SCA required", async () => {
    const parsed = JSON.parse((await callTool("sca_exemption_decision", { amount_eur: 1000 })).text);
    expect(parsed.decision.exemption).toBe("3ds2_challenge");
    expect(parsed.decision.sca_required).toBe(true);
    expect(parsed.decision.candidates).toEqual([]);
  });

  it("TRA band: €400 at 1bps qualifies (cap €500); €600 falls through to 3DS2", async () => {
    const ok = JSON.parse((await callTool("sca_exemption_decision", { amount_eur: 400, tra_acquirer_fraud_bps: 1 })).text);
    expect(ok.decision.exemption).toBe("transaction_risk_analysis");
    expect(ok.decision.tra_cap_eur).toBe(500);
    const over = JSON.parse((await callTool("sca_exemption_decision", { amount_eur: 600, tra_acquirer_fraud_bps: 1 })).text);
    expect(over.decision.exemption).toBe("3ds2_challenge");
  });

  it("matches the real engine exactly (wired, not re-implemented)", async () => {
    const parsed = JSON.parse((await callTool("sca_exemption_decision", { amount_eur: 25, is_merchant_initiated: true })).text);
    expect(parsed.decision).toEqual(JSON.parse(JSON.stringify(decideScaExemption({ amount_eur: 25, is_merchant_initiated: true }))));
  });

  it("rejects a missing amount_eur with a validation error", async () => {
    const { isError, text } = await callTool("sca_exemption_decision", {});
    expect(isError).toBe(true);
    expect(text).toContain("amount_eur");
  });

  it("DETERMINISM: two identical calls return byte-identical responses (incl. proof.digest)", async () => {
    const a = await callTool("sca_exemption_decision", { amount_eur: 42, has_prior_sca: true, is_recurring_fixed: true });
    const b = await callTool("sca_exemption_decision", { amount_eur: 42, has_prior_sca: true, is_recurring_fixed: true });
    expect(a.text).toBe(b.text);
    expect(JSON.parse(a.text).proof.algo).toBe("sha256");
  });
});

// ─── grade_compliance ──────────────────────────────────────────────

const PAYMENT_FILES = [
  {
    path: "src/checkout.ts",
    content: [
      "import stripe from 'stripe'; // psd2 3ds2 exemption frictionless",
      "const mandate_id = 'm1'; const max_amount = 5000;",
      "// network_token vts dpan; dispute chargeback webhook rdr submit_evidence",
      "const idempotency_key = 'k'; const transaction_id = 't';",
      "// X-Agent-Budget budget_per_run; X-Agent-Mode lite",
      "function refund() {} function cancel() {}",
    ].join("\n"),
  },
];

describe("grade_compliance (dispatch, no auth)", () => {
  it("payment-heavy files grade A/B with the full 8-check detail + signals + proof", async () => {
    const { isError, text } = await callTool("grade_compliance", { files: PAYMENT_FILES });
    expect(isError).toBe(false);
    const parsed = JSON.parse(text);
    expect(["A", "B"]).toContain(parsed.grade);
    expect(parsed.checks_total).toBe(8);
    expect(parsed.checks).toHaveLength(8);
    expect(parsed.methodology).toContain("NOT a certification");
    expect(parsed.signals.detected_providers).toContain("stripe");
    expect(parsed.proof.algo).toBe("sha256");
  });

  it("matches the real gradeCompliance engine (same grade/score/checks_passed)", async () => {
    const parsed = JSON.parse((await callTool("grade_compliance", { files: PAYMENT_FILES })).text);
    const engine = gradeCompliance(PAYMENT_FILES.map((f) => ({ ...f, size: Buffer.byteLength(f.content) })));
    expect(parsed.grade).toBe(engine.grade);
    expect(parsed.score).toBe(engine.score);
    expect(parsed.checks_passed).toBe(engine.checks_passed);
  });

  it("enforces the free-tool caps (26 files rejected)", async () => {
    const files = Array.from({ length: 26 }, (_, i) => ({ path: `f${i}.ts`, content: "x" }));
    const { isError, text } = await callTool("grade_compliance", { files });
    expect(isError).toBe(true);
    expect(text).toContain("max 25 files");
  });

  it("DETERMINISM: byte-identical responses for identical file sets", async () => {
    const a = await callTool("grade_compliance", { files: PAYMENT_FILES });
    const b = await callTool("grade_compliance", { files: PAYMENT_FILES });
    expect(a.text).toBe(b.text);
  });
});

// ─── assemble_ce3_evidence ─────────────────────────────────────────

const CE3_DISPUTE = {
  txn: { id: "t9", amount_minor: 5000, currency: "usd", created_at: "2026-06-01T00:00:00.000Z", disputed: true, email: "a@b.com", device_id: "d1" },
  reason_code: "10.4",
  disputed_at: "2026-06-10T00:00:00.000Z",
};
const CE3_HISTORY = [
  { id: "t1", amount_minor: 900, currency: "usd", created_at: "2025-10-01T00:00:00.000Z", disputed: false, email: "a@b.com", device_id: "d1" },
  { id: "t2", amount_minor: 700, currency: "usd", created_at: "2025-12-01T00:00:00.000Z", disputed: false, email: "a@b.com", device_id: "d1" },
];

describe("assemble_ce3_evidence (dispatch, no auth)", () => {
  it("qualifies two priors for a 10.4 dispute; packet carries version '3.0' + assembly-only caveat", async () => {
    const { isError, text } = await callTool("assemble_ce3_evidence", { dispute: CE3_DISPUTE, transaction_history: CE3_HISTORY });
    expect(isError).toBe(false);
    const parsed = JSON.parse(text);
    expect(parsed.eligible).toBe(true);
    expect(parsed.qualifying_priors).toHaveLength(2);
    expect(parsed.evidence_packet.compelling_evidence_3.version).toBe("3.0");
    expect(parsed.caveat).toBe("assembly only; not a submission to VROL/Verifi");
    expect(parsed.proof.algo).toBe("sha256");
  });

  it("scope honesty: a non-10.4 reason code is rejected by the engine, not papered over", async () => {
    const parsed = JSON.parse(
      (await callTool("assemble_ce3_evidence", { dispute: { ...CE3_DISPUTE, reason_code: "13.1" }, transaction_history: CE3_HISTORY })).text,
    );
    expect(parsed.eligible).toBe(false);
    expect(parsed.rejection_reason).toBe("CE3.0 applies to 10.4 only");
  });

  it("no history → deterministic not-eligible verdict (no crash)", async () => {
    const parsed = JSON.parse((await callTool("assemble_ce3_evidence", { dispute: CE3_DISPUTE })).text);
    expect(parsed.eligible).toBe(false);
    expect(parsed.rejection_reason).toContain("qualifying prior");
  });

  it("DETERMINISM: byte-identical responses for identical inputs", async () => {
    const a = await callTool("assemble_ce3_evidence", { dispute: CE3_DISPUTE, transaction_history: CE3_HISTORY });
    const b = await callTool("assemble_ce3_evidence", { dispute: CE3_DISPUTE, transaction_history: CE3_HISTORY });
    expect(a.text).toBe(b.text);
  });
});

// ─── build_ap2_mandate ─────────────────────────────────────────────

const INTENT_MANDATE = {
  kind: "intent",
  version: "ap2/1",
  id: "intent_1",
  user_id: "agent_1",
  description: "buy analysis",
  constraints: { max_amount: { currency: "USD", value: "5.00" } },
  created_at: "2026-07-01T00:00:00.000Z",
  expires_at: "2026-08-01T00:00:00.000Z",
};
const SEED_HEX = "ab".repeat(32);

describe("build_ap2_mandate (dispatch, no auth)", () => {
  it("unsigned template: validates + canonically encodes, signature null, note says unsigned", async () => {
    const { isError, text } = await callTool("build_ap2_mandate", { mandate: INTENT_MANDATE });
    expect(isError).toBe(false);
    const parsed = JSON.parse(text);
    expect(parsed.valid).toBe(true);
    expect(typeof parsed.encoded).toBe("string");
    expect(parsed.signed).toBeNull();
    expect(parsed.verified).toBeNull();
    expect(parsed.note).toContain("unsigned template");
  });

  it("signed with seed_hex: envelope verifies via the real @axis/ap2 verifyMandate", async () => {
    const parsed = JSON.parse((await callTool("build_ap2_mandate", { mandate: INTENT_MANDATE, seed_hex: SEED_HEX })).text);
    expect(parsed.valid).toBe(true);
    expect(parsed.verified).toBe(true);
    expect(parsed.signed.jws.protected).toBeTruthy();
    expect(parsed.signed.jws.signature).toBeTruthy();
    // CROSS-ENGINE: independently verify the returned envelope with the codec.
    const envelope: SignedMandate = { mandate: parsed.mandate, jws: parsed.signed.jws, public_key: parsed.signed.public_key };
    expect(verifyMandate(envelope).valid).toBe(true);
    // Tampered mandate must fail verification.
    const tampered: SignedMandate = { ...envelope, mandate: { ...envelope.mandate, id: "intent_evil" } as SignedMandate["mandate"] };
    expect(verifyMandate(tampered).valid).toBe(false);
  });

  it("structurally invalid mandate → valid:false with issues (not a crash)", async () => {
    const { isError, text } = await callTool("build_ap2_mandate", { mandate: { kind: "intent", version: "ap2/0" } });
    expect(isError).toBe(false);
    const parsed = JSON.parse(text);
    expect(parsed.valid).toBe(false);
    expect(parsed.issues.length).toBeGreaterThan(0);
    expect(parsed.encoded).toBeNull();
  });

  it("rejects a malformed seed_hex", async () => {
    const { isError, text } = await callTool("build_ap2_mandate", { mandate: INTENT_MANDATE, seed_hex: "nope" });
    expect(isError).toBe(true);
    expect(text).toContain("seed_hex");
  });

  it("DETERMINISM: Ed25519 signing is deterministic — identical calls, identical bytes", async () => {
    const a = await callTool("build_ap2_mandate", { mandate: INTENT_MANDATE, seed_hex: SEED_HEX });
    const b = await callTool("build_ap2_mandate", { mandate: INTENT_MANDATE, seed_hex: SEED_HEX });
    expect(a.text).toBe(b.text);
  });
});

// ─── score_dispute_readiness ───────────────────────────────────────

describe("score_dispute_readiness (dispatch, no auth)", () => {
  it("wires scoreWinProbability and ALWAYS carries the non-prediction disclaimer", async () => {
    const { isError, text } = await callTool("score_dispute_readiness", {
      reason_code: "10.4",
      evidence: { ce3Eligible: true, matchingDataElements: 3, has3dsAuthenticated: true },
    });
    expect(isError).toBe(false);
    const parsed = JSON.parse(text);
    const engine = scoreWinProbability("10.4", { ce3Eligible: true, matchingDataElements: 3, has3dsAuthenticated: true });
    expect(parsed.readiness).toEqual(JSON.parse(JSON.stringify(engine)));
    expect(parsed.readiness.modelVersion).toBe("win-prob-v0");
    expect(parsed.disclaimer).toContain("NOT a dispute-win prediction");
    expect(parsed.disclaimer).toContain("AXIS does not publish win-rate estimates");
    expect(parsed.proof.algo).toBe("sha256");
  });

  it("empty evidence still scores (all fields default false/0) and lists missing evidence", async () => {
    const parsed = JSON.parse((await callTool("score_dispute_readiness", { reason_code: "13.1" })).text);
    expect(parsed.readiness.band).toBe("low");
    expect(parsed.readiness.topMissingEvidence.length).toBeGreaterThan(0);
  });

  it("rejects a missing reason_code", async () => {
    const { isError, text } = await callTool("score_dispute_readiness", {});
    expect(isError).toBe(true);
    expect(text).toContain("reason_code");
  });

  it("DETERMINISM: byte-identical responses for identical inputs", async () => {
    const args = { reason_code: "10.4", evidence: { hasDeliveryProof: true } };
    const a = await callTool("score_dispute_readiness", args);
    const b = await callTool("score_dispute_readiness", args);
    expect(a.text).toBe(b.text);
  });
});

// ─── Discovery surface coherence ───────────────────────────────────

describe("discovery surfaces advertise the new free tools", () => {
  it("discover_commerce_tools lists the five as free (no auth)", async () => {
    const { text } = await callTool("discover_commerce_tools", {});
    const parsed = JSON.parse(text);
    for (const n of NEW_FREE_TOOLS) {
      expect(parsed.free_tools).toContain(n);
      const entry = parsed.tools.find((t: { name: string }) => t.name === n);
      expect(entry.pricing).toBe("free");
      expect(entry.auth_required).toBe(false);
    }
    expect(parsed.shareable_manifest.free_tools).toContain("sca_exemption_decision");
    expect(parsed.shareable_manifest.tools).toBe(37);
  });

  // H-Phase-A cycle 6: auth_required used to be computed as simply `!free`,
  // conflating "no charge" with "no auth needed" — get_referral_code,
  // get_referral_credits, and iliad_network_tokenization are all free but
  // their own handlers reject an anonymous caller. The 5 WO-13 engines
  // above genuinely take no `req` param at all, so they're correctly
  // auth-free.
  it("marks free-but-auth-required tools as auth_required:true, not false", async () => {
    const { text } = await callTool("discover_commerce_tools", {});
    const parsed = JSON.parse(text);
    for (const n of ["get_referral_code", "get_referral_credits", "iliad_network_tokenization"]) {
      const entry = parsed.tools.find((t: { name: string }) => t.name === n);
      expect(entry.pricing, `${n}.pricing`).toBe("free");
      expect(entry.auth_required, `${n}.auth_required`).toBe(true);
    }
    for (const n of NEW_FREE_TOOLS) {
      const entry = parsed.tools.find((t: { name: string }) => t.name === n);
      expect(entry.auth_required, `${n}.auth_required`).toBe(false);
    }
  });
});
