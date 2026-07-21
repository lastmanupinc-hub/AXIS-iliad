import type { IncomingMessage, ServerResponse } from "node:http";
import { Receipt } from "mppx";
import { chargeMpp } from "./mpp.js";
import { consumeFreeCall, recordPaidCall, recordSettledPayment, recordCompensationOwed, recordPaymentFunnelEvent } from "@axis/snapshots";
import type { PaymentProvider } from "@axis/snapshots";
import { log, getRequestId, ErrorCode } from "./logger.js";
import { randomUUID } from "node:crypto";
import { readIdempotencyKey } from "./mcp-runtime.js";
import {
  paidWalletMode,
  debitPaidWallet,
  getPaidWallet,
  isPaidConfigured,
  PaidError,
  walletDebitIdempotencyKey,
  type PaidWalletMode,
  type InsufficientCreditsBody,
} from "./paid-client.js";

/** Everything a cash settlement needs except the amount (which the caller derives). */
export interface SettleOptions {
  currency: string;
  decimals: number;
  description?: string;
  meta?: Record<string, string>;
}

/**
 * $1 = 1 Fabric Credit. FC is an integer, so sub-dollar overages round UP to 1 FC —
 * this is a KNOWN overcharge at the cent level (a 50-cent overage debits a full $1 of
 * FC) and is exactly why `enforce` stays gated behind a flag until PAI'D supports
 * fractional FC; `shadow` mode logs the cents-vs-FC drift so it stays auditable.
 */
export function centsToFabricCredits(cents: number): number {
  if (cents <= 0) return 0;
  return Math.max(1, Math.ceil(cents / 100));
}

/**
 * Collect the per-call cash overage through PAI'D's Fabric-Credit wallet
 * (debit -> PAI'D's own Stripe -> founder settlement) instead of mppx-direct.
 *
 *   read    -> read + log the wallet balance; never debits; returns null (caller
 *              falls through to chargeMpp — mppx remains the money rail).
 *   shadow  -> compute + log the FC debit that WOULD run; never debits; returns
 *              null (caller falls through to chargeMpp — behaviour unchanged).
 *   enforce -> debits the wallet.
 *                success              -> { status: 200 } (mppx is NOT called)
 *                402 insufficient     -> writes a top-up challenge to `res`,
 *                                        returns { status: 402 } (mppx is NOT called)
 *                a real 4xx (not 402) -> DEFINITE non-debit rejection (H2.6): PAI'D
 *                                        validated and rejected the request before any
 *                                        wallet mutation — zero chance the debit landed.
 *                                        Falls through to mppx exactly as pre-H2.3
 *                                        (no double-charge risk, nothing was debited).
 *                                        Returns null.
 *                anything else         -> AMBIGUOUS (H2.3/H0.2): a timeout, network
 *                (5xx, 504, network)     failure, or PAI'D 5xx can surface after PAI'D
 *                                        already committed the debit, so this does NOT
 *                                        fall back to mppx (that would risk charging a
 *                                        second rail for one call). Instead: record a
 *                                        `compensation_ledger` row (wallet_rail_ambiguous)
 *                                        and write a 402 to `res`; returns { status: 402 }
 *                                        (mppx is NOT called, no work runs on this call).
 */
/**
 * MTL structural guard (fail-closed allowlist, not a denylist): the PAI'D
 * Fabric-Credit wallet is a stored-value balance PAI'D itself holds — fine
 * for the owner's own entities (self-custody), but exactly the custody
 * pattern that makes a THIRD-PARTY account's funds a money-transmission
 * question (see [[paid-mtl-risk-finding]]). Iliad has no existing concept of
 * "this account is one of the owner's own LLCs" to check against, so this
 * does NOT invent one — it requires the owner to explicitly allowlist
 * account_ids via PAID_WALLET_OWNER_ACCOUNT_IDS (comma-separated). Unset or
 * empty means the allowlist is empty: EVERY account is refused, including in
 * a future where PAID_WALLET_MODE is accidentally left on "enforce" for
 * everyone — fail closed, not fail open.
 */
export function isOwnerEntityAccount(accountId: string): boolean {
  const raw = process.env.PAID_WALLET_OWNER_ACCOUNT_IDS ?? "";
  const allowlist = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return allowlist.includes(accountId);
}

export async function settleOverageViaPaidWallet(
  req: IncomingMessage,
  res: ServerResponse,
  accountId: string,
  overageCents: number,
  opts: SettleOptions,
  mode: Exclude<PaidWalletMode, "off">,
): Promise<{ status: 402 | 200 } | null> {
  const amountFc = centsToFabricCredits(overageCents);
  const tool = opts.meta?.tool ?? "default";

  if (!isOwnerEntityAccount(accountId)) {
    // Structural, not policy: this fires regardless of mode (read/shadow/enforce)
    // so the FC rail's diagnostics never even LOOK at a non-owner account's
    // wallet, and enforce can never debit one. Falls through to mppx-direct,
    // exactly as if PAID_WALLET_MODE were "off" for this specific caller.
    log("info", "paid_wallet_non_owner_account_refused", { accountId, tool, mode });
    return null;
  }

  if (mode === "read") {
    try {
      const wallet = await getPaidWallet(accountId);
      log("info", "paid_wallet_read", { accountId, tool, overageCents, amountFc, balanceFc: wallet.balance_fc });
    } catch (err) {
      log("warn", "paid_wallet_read_failed", {
        accountId,
        tool,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return null;
  }

  if (mode === "shadow") {
    // Compute + log what enforce WOULD debit; mppx still runs (no behaviour change).
    log("info", "paid_wallet_shadow_debit", { accountId, tool, overageCents, amountFc });
    return null;
  }

  // mode === "enforce"
  // Per-INVOCATION key: every distinct billable call is a distinct charge, so a
  // deduping rail must never collapse two of them. (checkoutIdempotencyKey's
  // 120s bucket is for human checkout double-submits — on this metered rail it
  // both dropped the second call in a window AND re-keyed late retries; H0.1.)
  //
  // H2.6 (red-team fix, WAVE-0 findings #2+#5): a bare randomUUID() per
  // invocation means a CLIENT RETRY of the exact same logical call — after our
  // own 15s abort, or after the ambiguous-failure 402 that abort produces —
  // mints a brand-new key and becomes a genuine SECOND debit on this same
  // rail (H2.3 only stops the debit from ALSO falling through to a different
  // rail; it does nothing about a retry hitting this same code path again).
  // When the caller supplied their own Idempotency-Key, derive a STABLE debit
  // key from it (same caller key -> same debit key, every time) so PAI'D's own
  // idempotency handling can dedupe a genuine retry. No caller key -> no
  // stable identity to key off; fall back to a fresh key (the residual retry
  // risk is inherent to a call that never opted into idempotent semantics).
  const callerIdempotencyKey = readIdempotencyKey(req);
  const idempotencyKey = callerIdempotencyKey
    ? walletDebitIdempotencyKey(accountId, tool, callerIdempotencyKey)
    : randomUUID();
  try {
    await debitPaidWallet(accountId, {
      amountFc,
      productCode: "iliad_agentic_call",
      reason: opts.description ?? "AXIS per-call overage",
      referenceType: "iliad_agentic",
      referenceId: tool,
      idempotencyKey,
    });
    return { status: 200 };
  } catch (err) {
    if (err instanceof PaidError && err.status === 402) {
      let body: InsufficientCreditsBody;
      try {
        body = JSON.parse(err.body) as InsufficientCreditsBody;
      } catch {
        body = { error: "insufficient_credits", balance_fc: 0, required_fc: amountFc, shortfall_fc: amountFc };
      }
      res.writeHead(402, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ...body,
        error: "insufficient_credits",
        // H2.5: additive canonical fields — topup_url is kept as-is (an
        // existing, distinct API surface), error_code/message/upgrade_url/
        // request_id are NEW so this response carries the same envelope
        // every other payment-required surface does.
        error_code: ErrorCode.INSUFFICIENT_CREDITS,
        message: "Insufficient Fabric-Credit balance for this call.",
        topup_url: "/v1/credits/topup",
        upgrade_url: "https://iliad.trustfabric.ai/billing",
        request_id: getRequestId(res),
      }));
      return { status: 402 };
    }
    // H2.6 (red-team fix, WAVE-0 finding #3): a real 4xx from PAI'D (NOT 402)
    // means PAI'D validated the request and rejected it BEFORE any wallet
    // mutation could occur — a malformed request, an auth/config problem, an
    // unknown developer_id. There is ZERO possibility this debit landed.
    // Recording it as "ambiguous" would mint a genuine, spendable
    // compensation credit for a call that provably cost the customer
    // nothing — a free-credit farming vector (send malformed requests,
    // collect compensation). Safe to fall through to the mppx rail exactly
    // as the pre-H2.3 code did for this subset: no debit happened, so no
    // double-charge risk. Distinct from a 5xx (PAI'D's OWN processing may
    // have failed AFTER committing the debit) or a 504/network failure (we
    // never learned what happened at all) — those stay genuinely ambiguous below.
    if (err instanceof PaidError && err.status >= 400 && err.status < 500) {
      log("warn", "paid_wallet_enforce_rejected", {
        accountId,
        tool,
        status: err.status,
        error: err.message,
      });
      return null;
    }
    // H2.3 (closes H0.2): every OTHER failure is AMBIGUOUS, not "PAI'D is down."
    // A 504 (our own 15s abort) or a network error can surface AFTER PAI'D has
    // already committed the debit — we just never saw the response. Falling
    // through to chargeMpp here would then charge a SECOND rail for the same
    // call. Per WO-20 doctrine, ambiguous outcomes do NOT fall through: record
    // the full amount as owed (worst case the debit never landed and the
    // customer is made whole for nothing — cheap; the alternative is a real
    // double charge) and fail the call closed. No work runs on this call.
    log("warn", "paid_wallet_enforce_ambiguous", {
      accountId,
      tool,
      error: err instanceof Error ? err.message : String(err),
    });
    const entry = await recordCompensationOwed({
      account_id: accountId,
      tool,
      amount_cents: overageCents,
      reason: "wallet_rail_ambiguous",
    });
    res.writeHead(402, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: "wallet_settlement_unconfirmed",
      error_code: ErrorCode.SETTLEMENT_UNCONFIRMED,
      message: "Payment status for this call could not be confirmed on the Fabric-Credit rail. To avoid a duplicate charge, this call was not completed and no work was performed — retrying may incur a separate charge if the original debit landed. A compensation entry was recorded and will be credited automatically once reconciled.",
      compensation_entry_id: entry.entry_id,
      topup_url: "/v1/credits/topup",
      upgrade_url: "https://iliad.trustfabric.ai/billing",
      request_id: getRequestId(res),
    }));
    return { status: 402 };
  }
}

/**
 * Decode the `Payment-Receipt` header mppx set on `res` (via `chargeMpp`) into the
 * fields `recordSettledPayment` needs. Node's `writeHead(status, headers)` populates
 * the same header store `getHeader` reads, so this works even though the response
 * has already been sent by the time `chargeMpp` returns. Defensive by design — a
 * missing/malformed header (e.g. an older mppx build, or a test double `res`) must
 * never block the settlement record from landing; it just falls back to "stripe"
 * with no external reference rather than throwing.
 */
function parsePaymentReceipt(res: ServerResponse): { provider: PaymentProvider; external_receipt?: string } {
  try {
    const header = res.getHeader?.("Payment-Receipt");
    const value = Array.isArray(header) ? header[0] : header;
    if (typeof value === "string" && value.length > 0) {
      const receipt = Receipt.deserialize(value);
      return {
        provider: receipt.method === "tempo" ? "tempo" : "stripe",
        external_receipt: receipt.reference,
      };
    }
  } catch {
    // Malformed/absent header — fall through to the default below.
  }
  return { provider: "stripe" };
}

/**
 * Settle a cash overage on the shared payment rail (Stripe SPT / Tempo USDC via mppx,
 * or — when `PAID_WALLET_MODE=enforce` — PAI'D's Fabric-Credit wallet).
 *
 * This is the single collection tail shared by BOTH surfaces:
 *   - the REST cashier (`chargeWithDiscounts` in handlers.ts), and
 *   - the MCP in-band settlement gate (H1) on the tool-call surface.
 * Extracting it is what lets the agent-facing MCP surface actually *collect* payment,
 * not just meter-and-reject with a 402 it can't fulfil.
 *
 *   overage <= 0          -> { status: 200 }   nothing owed
 *   5th-call-free hit      -> { status: 200 }   referral free call consumed
 *   PAID_WALLET_MODE=enforce and PAI'D configured:
 *     wallet debit 200      -> { status: 200 }   paid via PAI'D; mppx NOT called
 *     wallet 402            -> { status: 402 }   PAI'D top-up challenge; mppx NOT called
 *     wallet ambiguous err  -> { status: 402 }   H2.3: compensation_ledger row written
 *                                                (wallet_rail_ambiguous); mppx NOT called —
 *                                                never fall through to a second rail on an
 *                                                unconfirmed debit.
 *   (read/shadow, or enforce w/ PAI'D not configured, fall through below)
 *   chargeMpp 402          -> { status: 402 }   x402 challenge written to `res` (res ended)
 *   chargeMpp 200          -> { status: 200 }   paid; Payment-Receipt on `res`; paid call recorded;
 *                                                a row is persisted to `payment_receipts` (WO-19) so
 *                                                this real cash settlement is captured distinctly
 *                                                from plan-credit overage metering.
 *   MPP not configured     -> null             no STRIPE_SECRET_KEY — caller falls back
 */
/**
 * Best-effort post-charge bookkeeping — call ONLY after a real cash charge has
 * already succeeded (a Stripe/Tempo settlement via mppx, or a PAI'D wallet
 * debit). H-Phase-A cycle 19: recordPaidCall/recordSettledPayment used to run
 * completely unguarded here — a transient DB error on EITHER write propagated
 * straight out of settleOverageCash with no try/catch at any of its 3
 * callers (chargeWithDiscounts, the MCP in-band settlement gate), landing as
 * a raw uncaught 500 on a request whose money had ALREADY moved. Worse than
 * the analogous recordUsage false-fail this loop already closed: that shape
 * at least flips a state field an operator can query; this one is invisible
 * to WO-19's settled-revenue tracker entirely (recordSettledPayment is the
 * ONLY place a real cash settlement is recorded in this system's own DB) and
 * — via the MCP path — happens BEFORE markInbandSettled runs, so it's also
 * structurally invisible to the settled_then_error compensation-ledger
 * producer (that producer only fires once a settlement is marked, which
 * never happens if this throws first). Catch + log loudly (never silently
 * void — recordPaidCall/recordSettledPayment feed real revenue accounting,
 * not disposable analytics) so the caller's already-successful charge result
 * is never lost to a transient DB hiccup, while the gap stays visible in
 * logs for reconciliation.
 */
async function recordSettlementBookkeepingBestEffort(
  accountId: string,
  overageCents: number,
  opts: SettleOptions,
  provider: PaymentProvider,
  external_receipt: string | undefined,
): Promise<void> {
  try {
    await recordPaidCall(accountId);
    await recordSettledPayment({
      account_id: accountId,
      tool: opts.meta?.tool ?? "default",
      amount_cents: overageCents,
      currency: opts.currency,
      provider,
      external_receipt,
    });
  } catch (err) {
    log("error", "settlement_bookkeeping_failed", {
      account_id: accountId,
      tool: opts.meta?.tool ?? "default",
      amount_cents: overageCents,
      provider,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function settleOverageCash(
  req: IncomingMessage,
  res: ServerResponse,
  accountId: string,
  overageCents: number,
  opts: SettleOptions,
): Promise<{ status: 402 | 200 } | null> {
  if (overageCents <= 0) return { status: 200 };
  if (await consumeFreeCall(accountId)) return { status: 200 };

  const wm = paidWalletMode();
  if (wm !== "off" && isPaidConfigured()) {
    const w = await settleOverageViaPaidWallet(req, res, accountId, overageCents, opts, wm);
    if (wm === "enforce" && w) {
      if (w.status === 200) {
        // H0.3: a wallet debit IS settled cash (PAI'D -> its Stripe -> founder
        // settlement) — record the receipt so WO-19's settled-revenue tracker
        // sees the wallet rail. No external reference is available from the
        // debit response today; the per-call idempotency key stays internal.
        await recordSettlementBookkeepingBestEffort(accountId, overageCents, opts, "paid_fc", undefined);
      } else if (w.status === 402) {
        await recordFunnelChallenge(accountId, opts);
      }
      return w;
    }
    // read/shadow (or enforce w/ wallet call falling back) fall through to chargeMpp.
  }

  const result = await chargeMpp(req, res, { ...opts, amount: String(overageCents) });
  if (result && result.status === 200) {
    const { provider, external_receipt } = parsePaymentReceipt(res);
    await recordSettlementBookkeepingBestEffort(accountId, overageCents, opts, provider, external_receipt);
  } else if (result && result.status === 402) {
    await recordFunnelChallenge(accountId, opts);
  }
  return result;
}

/**
 * x402 onboarding program, Phase 0 (visibility): best-effort record of a real
 * 402 challenge actually written to an agent on this rail (mppx or the PAI'D
 * wallet's insufficient/ambiguous branches). Telemetry must never break or
 * slow the request path that's already in flight, so failures are swallowed —
 * mirrors how logMcpCall treats recordMcpUsage.
 */
async function recordFunnelChallenge(accountId: string, opts: SettleOptions): Promise<void> {
  try {
    await recordPaymentFunnelEvent({ account_id: accountId, tool: opts.meta?.tool ?? "default", kind: "challenge" });
  } catch {
    /* funnel telemetry is best-effort */
  }
}
