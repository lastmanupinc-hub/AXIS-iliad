// ─── Dispute lifecycle — API half (WO-08) ────────────────────────
//
// Bridges the pure engines in @axis/agentic-compliance (dispute state
// machine, CE 3.0 assembler, representment builder, dispute clients) to the
// persistence layer (@axis/snapshots dispute-store) and the two surfaces
// that expose them:
//   1. Stripe webhook branches (charge.dispute.* + radar.early_fraud_warning
//      .created) — called from stripe.ts's verified dispatch chain.
//   2. The metered `assemble_representment` MCP tool.
//
// HONESTY SPLIT (keep intact): the dispute lifecycle is LIVE on the Stripe
// rail only. VROL/RDR/CDRN (Verifi/Ethoca) ships as integration-ready code
// gated behind AXIS_ENABLE_VROL + acquirer credentials and never fakes a
// submission. CE 3.0 assembly makes no promise about issuer outcomes —
// AXIS does not publish win-rate estimates.

import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import {
  assembleCe3,
  buildStripeRepresentment,
  makeStripeDisputeClient,
  nextDisputeState,
  isTerminal,
  DISPUTE_TRANSITIONS,
  type Ce3Result,
  type DisputeClient,
  type DisputeEvent,
  type DisputeRecord,
  type DisputeState,
  type DisputeRail,
  type EvidenceInputs,
  type StripeRepresentmentEvidence,
  type Txn,
} from "@axis/agentic-compliance";
import {
  upsertDispute,
  getDispute,
  logDisputeTransition,
  trackEvent,
  type StoredDisputeRecord,
} from "@axis/snapshots";
import { resolveAuth } from "./billing.js";
import { authorizeMcpToolCredits, captureMcpToolCredits } from "./mcp-runtime.js";
import { log } from "./logger.js";

// ─── Stripe object → DisputeRecord mapping ─────────────────────────

/** Stripe `dispute.status` vocabulary → AXIS's internal DisputeState. */
export function mapStripeDisputeStatus(status: string | undefined): DisputeState {
  switch (status) {
    case "under_review":
      return "under_review";
    case "won":
      return "won";
    case "lost":
      return "lost";
    case "charge_refunded":
      return "accepted";
    case "warning_closed":
      return "warning_closed";
    case "needs_response":
    case "warning_needs_response":
    case "warning_under_review":
    default:
      return "needs_response";
  }
}

function tsToIso(ts: unknown): string | null {
  if (typeof ts !== "number" || ts === 0) return null;
  return new Date(ts * 1000).toISOString();
}

/** Map a `charge.dispute.*` webhook object to a DisputeRecord. */
export function stripeDisputeToRecord(obj: Record<string, unknown>): DisputeRecord {
  const nowIso = new Date().toISOString();
  const evidenceDetails = obj.evidence_details as { due_by?: number } | undefined;
  const metadata = obj.metadata as { account_id?: string } | undefined;
  const charge = obj.charge;
  return {
    id: String(obj.id ?? ""),
    rail: "stripe",
    chargeId: typeof charge === "string" ? charge : ((charge as { id?: string } | undefined)?.id ?? null),
    accountId: typeof metadata?.account_id === "string" ? metadata.account_id : null,
    reasonCode: typeof obj.reason === "string" ? obj.reason : "unknown",
    amountMinor: typeof obj.amount === "number" ? obj.amount : 0,
    currency: typeof obj.currency === "string" ? obj.currency : "usd",
    state: mapStripeDisputeStatus(typeof obj.status === "string" ? obj.status : undefined),
    dueBy: evidenceDetails?.due_by ? tsToIso(evidenceDetails.due_by) : null,
    createdAt: tsToIso(obj.created) ?? nowIso,
    updatedAt: nowIso,
    representmentId: null,
  };
}

/** Narrow a stored (structural) record back onto the compliance types. */
function toComplianceRecord(stored: StoredDisputeRecord): DisputeRecord {
  return {
    ...stored,
    rail: stored.rail as DisputeRail,
    state: stored.state as DisputeState,
  };
}

// ─── State-machine walking ─────────────────────────────────────────

/**
 * Shortest legal event path from `from` to `to` through DISPUTE_TRANSITIONS
 * (BFS with stable, table-declared edge order — deterministic). Returns []
 * when already there, null when no legal path exists (e.g. out of a terminal
 * state). Self-loop edges (dispute_opened) are skipped so a path can never
 * spin in place.
 */
export function findEventPath(from: DisputeState, to: DisputeState): DisputeEvent[] | null {
  if (from === to) return [];
  const queue: Array<{ state: DisputeState; path: DisputeEvent[] }> = [{ state: from, path: [] }];
  const seen = new Set<DisputeState>([from]);
  while (queue.length > 0) {
    const { state, path } = queue.shift()!;
    for (const [event, next] of Object.entries(DISPUTE_TRANSITIONS[state]) as Array<[DisputeEvent, DisputeState]>) {
      if (seen.has(next)) continue;
      const nextPath = [...path, event];
      if (next === to) return nextPath;
      seen.add(next);
      queue.push({ state: next, path: nextPath });
    }
  }
  return null;
}

/**
 * Drive a stored dispute to `target` by applying each legal edge through
 * nextDisputeState (the pure transition function) and logging every hop in
 * the transition ledger. When no legal path exists the state is left
 * untouched (logged) — the machine, not the webhook payload, owns legality.
 * Returns the final state.
 */
export async function advanceDisputeState(
  record: StoredDisputeRecord,
  target: DisputeState,
  atIso: string,
): Promise<DisputeState> {
  let current = record.state as DisputeState;
  const path = findEventPath(current, target);
  if (path === null) {
    log("warn", "dispute_illegal_transition", { dispute_id: record.id, from: current, to: target });
    return current;
  }
  for (const event of path) {
    const next = nextDisputeState(current, event);
    await logDisputeTransition(record.id, { from: current, to: next, at: atIso, event });
    current = next;
  }
  if (current !== record.state) {
    await upsertDispute({ ...record, state: current, updatedAt: atIso });
  }
  return current;
}

// ─── Webhook branch handlers (called from stripe.ts) ───────────────

async function trackDisputeEvent(
  accountId: string | null,
  eventType: "dispute_opened" | "dispute_closed" | "early_fraud_warning",
  metadata: Record<string, unknown>,
): Promise<void> {
  if (!accountId) return;
  try {
    await trackEvent(accountId, eventType, "churn_risk", metadata);
  } catch {
    // Telemetry is best-effort — an unattributable account id must never
    // bounce the webhook (Stripe retries on non-2xx).
  }
}

/** charge.dispute.created → persist as needs_response (idempotent on retry). */
export async function handleDisputeCreated(obj: Record<string, unknown>): Promise<void> {
  const rec = stripeDisputeToRecord(obj);
  if (!rec.id) return;
  const existing = await getDispute(rec.id);
  if (existing) {
    // At-least-once delivery: a duplicate created event is a no-op
    // (the state machine's dispute_opened self-loop, not an error).
    return;
  }
  await upsertDispute({ ...rec, state: "needs_response" });
  await trackDisputeEvent(rec.accountId, "dispute_opened", {
    dispute_id: rec.id,
    reason_code: rec.reasonCode,
    amount_minor: rec.amountMinor,
    currency: rec.currency,
    due_by: rec.dueBy,
  });
}

/** charge.dispute.updated → walk the state machine toward the new status. */
export async function handleDisputeUpdated(obj: Record<string, unknown>): Promise<void> {
  const rec = stripeDisputeToRecord(obj);
  if (!rec.id) return;
  const existing = await getDispute(rec.id);
  if (!existing) {
    // Out-of-order delivery: updated before created. Persist what we know.
    await upsertDispute(rec);
    return;
  }
  // Refresh mutable metadata (deadline, amount) without touching state...
  await upsertDispute({ ...existing, dueBy: rec.dueBy ?? existing.dueBy, amountMinor: rec.amountMinor || existing.amountMinor, updatedAt: rec.updatedAt });
  // ...then let the state machine walk to the mapped target state.
  const refreshed = await getDispute(rec.id);
  if (refreshed) await advanceDisputeState(refreshed, rec.state, rec.updatedAt);
}

/** charge.dispute.closed → drive to won | lost | accepted | warning_closed. */
export async function handleDisputeClosed(obj: Record<string, unknown>): Promise<void> {
  const rec = stripeDisputeToRecord(obj);
  if (!rec.id) return;
  const existing = await getDispute(rec.id);
  const target = rec.state;
  let finalState: DisputeState = target;
  if (!existing) {
    await upsertDispute(rec);
  } else {
    finalState = await advanceDisputeState(existing, target, rec.updatedAt);
  }
  if (isTerminal(finalState)) {
    await trackDisputeEvent(rec.accountId ?? existing?.accountId ?? null, "dispute_closed", {
      dispute_id: rec.id,
      outcome: finalState,
      reason_code: rec.reasonCode,
    });
  }
}

/** radar.early_fraud_warning.created → pre-dispute telemetry (no DisputeRecord). */
export async function handleEarlyFraudWarning(obj: Record<string, unknown>): Promise<void> {
  const metadata = obj.metadata as { account_id?: string } | undefined;
  const accountId = typeof metadata?.account_id === "string" ? metadata.account_id : null;
  const fraudType = typeof obj.fraud_type === "string" ? obj.fraud_type : "unknown";
  const chargeId = typeof obj.charge === "string" ? obj.charge : null;
  log("info", "early_fraud_warning", { efw_id: obj.id, charge_id: chargeId, fraud_type: fraudType });
  await trackDisputeEvent(accountId, "early_fraud_warning", {
    efw_id: obj.id ?? null,
    charge_id: chargeId,
    fraud_type: fraudType,
    actionable: obj.actionable === true,
  });
}

// ─── assemble_representment (metered MCP tool) ─────────────────────

const MAX_TXN_HISTORY = 500;

const REPRESENTMENT_DISCLAIMER =
  "CE 3.0 assembly + Stripe representment evidence only. Dispute lifecycle is live on the Stripe rail; " +
  "VROL/RDR/CDRN is integration-ready code gated on acquirer (Verifi/Ethoca) provisioning (AXIS_ENABLE_VROL). " +
  "Assembling or submitting evidence makes no promise about issuer outcomes — AXIS does not publish win-rate estimates.";

export interface AssembleRepresentmentArgs {
  dispute_id: string;
  /** Data elements of the disputed transaction (email/ip/device/shipping/login). */
  disputed_txn?: Partial<Txn>;
  /** Candidate prior transactions for CE 3.0 qualification (max 500). */
  transaction_history?: Txn[];
  evidence_inputs?: EvidenceInputs;
  /** true → submit the built evidence to Stripe (requires STRIPE_SECRET_KEY). */
  submit?: boolean;
}

export interface AssembleRepresentmentResult {
  dispute: StoredDisputeRecord;
  evidence: StripeRepresentmentEvidence;
  ce3: Ce3Result;
  ce3_eligible: boolean;
  submitted: boolean;
  submit_note?: string;
  disclaimer: string;
}

export interface AssembleRepresentmentDeps {
  /** Injectable dispute client (tests). Default: live Stripe client when STRIPE_SECRET_KEY is set. */
  client?: DisputeClient | null;
  now?: () => string;
}

/**
 * Core assembly: load the caller's dispute, qualify CE 3.0 priors from the
 * supplied history, build the Stripe `evidence` hash, optionally submit it
 * through the dispute client, and walk the dispute's state machine
 * (needs_response → evidence_assembling → evidence_submitted) with a full
 * transition ledger. Deterministic given the same record + inputs (aside
 * from timestamps).
 */
export async function handleAssembleRepresentment(
  accountId: string,
  args: AssembleRepresentmentArgs,
  deps: AssembleRepresentmentDeps = {},
): Promise<AssembleRepresentmentResult> {
  const nowIso = (deps.now ?? (() => new Date().toISOString()))();
  if (typeof args.dispute_id !== "string" || !args.dispute_id.trim()) {
    throw new Error("dispute_id is required (the provider dispute id, e.g. Stripe dp_...)");
  }
  const disputeId = args.dispute_id.trim();

  const stored = await getDispute(disputeId);
  // Access rule: the caller may reach their own disputes and may claim
  // unattributed (webhook-ingested, account_id NULL) ones; anything else is
  // indistinguishable from nonexistent.
  if (!stored || (stored.accountId !== null && stored.accountId !== accountId)) {
    throw new Error(`Dispute not found: ${disputeId}`);
  }

  const history = Array.isArray(args.transaction_history)
    ? args.transaction_history.slice(0, MAX_TXN_HISTORY)
    : [];

  const record = toComplianceRecord(stored);
  const disputedTxn: Txn = {
    id: record.chargeId ?? record.id,
    amount_minor: record.amountMinor,
    currency: record.currency,
    created_at: record.createdAt,
    disputed: true,
    ...(args.disputed_txn ?? {}),
  };
  const ce3 = assembleCe3(
    { txn: disputedTxn, reason_code: record.reasonCode, disputed_at: record.createdAt },
    history,
  );

  const evidence = buildStripeRepresentment(record, ce3, args.evidence_inputs ?? {});
  const representmentId = `rep_${createHash("sha256").update(JSON.stringify(evidence)).digest("hex").slice(0, 16)}`;

  let submitted = false;
  let submitNote: string | undefined;
  let working: StoredDisputeRecord = { ...stored, accountId: stored.accountId ?? accountId, representmentId };

  // Evidence is assembled — walk needs_response → evidence_assembling.
  await upsertDispute({ ...working, updatedAt: nowIso });
  const afterAssembly = await advanceDisputeState(working, "evidence_assembling", nowIso);
  working = { ...working, state: afterAssembly, updatedAt: nowIso };

  if (args.submit === true) {
    const client =
      deps.client !== undefined
        ? deps.client
        : process.env.STRIPE_SECRET_KEY
          ? makeStripeDisputeClient({ apiKey: process.env.STRIPE_SECRET_KEY })
          : null;
    if (!client) {
      submitNote = "submit skipped: no dispute client configured (STRIPE_SECRET_KEY unset)";
    } else {
      const res = await client.submitEvidence(disputeId, evidence, true);
      if (res.ok) {
        submitted = true;
        const afterSubmit = await advanceDisputeState(working, "evidence_submitted", nowIso);
        working = { ...working, state: afterSubmit, updatedAt: nowIso };
      }
    }
  }

  const finalStored = (await getDispute(disputeId)) ?? working;
  return {
    dispute: finalStored,
    evidence,
    ce3,
    ce3_eligible: ce3.eligible,
    submitted,
    ...(submitNote ? { submit_note: submitNote } : {}),
    disclaimer: REPRESENTMENT_DISCLAIMER,
  };
}

/** MCP entrypoint — auth + authorize/capture metering around the core. */
export async function runAssembleRepresentment(
  args: Record<string, unknown>,
  req: IncomingMessage,
  deps: AssembleRepresentmentDeps = {},
): Promise<string> {
  const auth = await resolveAuth(req);
  if (auth.anonymous || !auth.account) {
    throw new Error("Authentication required: assemble_representment needs Authorization: Bearer <api_key>.");
  }
  // Authorize (no debit) → do the work → capture on success, so a failed
  // assembly or submission never charges the caller.
  const charge = await authorizeMcpToolCredits(req, auth.account, "assemble_representment");
  const result = await handleAssembleRepresentment(
    auth.account.account_id,
    args as unknown as AssembleRepresentmentArgs,
    deps,
  );
  await captureMcpToolCredits(auth.account, charge);
  return JSON.stringify(result, null, 2);
}
