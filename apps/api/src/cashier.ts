import type { IncomingMessage, ServerResponse } from "node:http";
import { chargeMpp } from "./mpp.js";
import { consumeFreeCall, recordPaidCall } from "@axis/snapshots";

/** Everything a cash settlement needs except the amount (which the caller derives). */
export interface SettleOptions {
  currency: string;
  decimals: number;
  description?: string;
  meta?: Record<string, string>;
}

/**
 * Settle a cash overage on the shared payment rail (Stripe SPT / Tempo USDC via mppx).
 *
 * This is the single collection tail shared by BOTH surfaces:
 *   - the REST cashier (`chargeWithDiscounts` in handlers.ts), and
 *   - the MCP in-band settlement gate (H1) on the tool-call surface.
 * Extracting it is what lets the agent-facing MCP surface actually *collect* payment,
 * not just meter-and-reject with a 402 it can't fulfil.
 *
 *   overage <= 0        -> { status: 200 }   nothing owed
 *   5th-call-free hit    -> { status: 200 }   referral free call consumed
 *   chargeMpp 402        -> { status: 402 }   x402 challenge written to `res` (res ended)
 *   chargeMpp 200        -> { status: 200 }   paid; Payment-Receipt on `res`; paid call recorded
 *   MPP not configured   -> null             no STRIPE_SECRET_KEY — caller falls back
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
  const result = await chargeMpp(req, res, { ...opts, amount: String(overageCents) });
  if (result && result.status === 200) {
    await recordPaidCall(accountId);
  }
  return result;
}
