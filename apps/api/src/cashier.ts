import type { IncomingMessage, ServerResponse } from "node:http";
import { Receipt } from "mppx";
import { chargeMpp } from "./mpp.js";
import { consumeFreeCall, recordPaidCall, recordSettledPayment } from "@axis/snapshots";
import type { PaymentProvider } from "@axis/snapshots";
import { log } from "./logger.js";
import { randomUUID } from "node:crypto";
import {
  paidWalletMode,
  debitPaidWallet,
  getPaidWallet,
  isPaidConfigured,
  PaidError,
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
 *                success            -> { status: 200 } (mppx is NOT called)
 *                402 insufficient   -> writes a top-up challenge to `res`,
 *                                      returns { status: 402 } (mppx is NOT called)
 *                PAI'D unreachable/ -> returns null so the caller falls back to
 *                errored               mppx rather than failing the whole request
 *                                      (PAI'D liveness is an external gate, not
 *                                      something this code can guarantee — see
 *                                      docs/MCP_PAID_ACCESS_DESIGN.md).
 */
export async function settleOverageViaPaidWallet(
  res: ServerResponse,
  accountId: string,
  overageCents: number,
  opts: SettleOptions,
  mode: Exclude<PaidWalletMode, "off">,
): Promise<{ status: 402 | 200 } | null> {
  const amountFc = centsToFabricCredits(overageCents);
  const tool = opts.meta?.tool ?? "default";

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
  // Any client-internal retry of THIS one invocation reuses the key it's handed.
  const idempotencyKey = randomUUID();
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
      res.end(JSON.stringify({ ...body, error: "insufficient_credits", topup_url: "/v1/credits/topup" }));
      return { status: 402 };
    }
    // PAI'D unreachable or an unexpected error (not an economic 402) — fall back to
    // mppx rather than hard-failing a request PAI'D happened to be down for.
    log("warn", "paid_wallet_enforce_failed", {
      accountId,
      tool,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
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
 *   (read/shadow, or enforce w/ PAI'D not configured, fall through below)
 *   chargeMpp 402          -> { status: 402 }   x402 challenge written to `res` (res ended)
 *   chargeMpp 200          -> { status: 200 }   paid; Payment-Receipt on `res`; paid call recorded;
 *                                                a row is persisted to `payment_receipts` (WO-19) so
 *                                                this real cash settlement is captured distinctly
 *                                                from plan-credit overage metering.
 *   MPP not configured     -> null             no STRIPE_SECRET_KEY — caller falls back
 */
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
    const w = await settleOverageViaPaidWallet(res, accountId, overageCents, opts, wm);
    if (wm === "enforce" && w) {
      if (w.status === 200) await recordPaidCall(accountId);
      return w;
    }
    // read/shadow (or enforce w/ wallet call falling back) fall through to chargeMpp.
  }

  const result = await chargeMpp(req, res, { ...opts, amount: String(overageCents) });
  if (result && result.status === 200) {
    await recordPaidCall(accountId);
    const { provider, external_receipt } = parsePaymentReceipt(res);
    await recordSettledPayment({
      account_id: accountId,
      tool: opts.meta?.tool ?? "default",
      amount_cents: overageCents,
      currency: opts.currency,
      provider,
      external_receipt,
    });
  }
  return result;
}
