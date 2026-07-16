// x402 onboarding program, Phase 0 (visibility) — the challenge/probe-settlement
// side of the payment funnel. Real (non-zero) settled cash is already fully
// captured by payment-receipts-store.ts; this file intentionally does not
// duplicate that. It records the two things nothing else persists: every
// x402/MPP challenge actually issued to an agent, and the $0 ping_payment
// probe's forced settlements — so GET /v1/stats can show a real, restart-
// durable challenge -> settlement funnel instead of resetting to zero on
// every deploy.
import { randomUUID } from "node:crypto";
import { sql, peekPool } from "./pg.js";

export type PaymentFunnelEventKind = "challenge" | "settlement";

export interface PaymentFunnelEventInput {
  /** account_id when the caller is authenticated, null for anonymous callers */
  account_id: string | null;
  tool: string;
  kind: PaymentFunnelEventKind;
  /** Non-zero only for a probe's forced settlement in a future real-money mode; ping_payment always passes 0. */
  amount_cents?: number;
}

export interface PaymentFunnelStats {
  x402_challenges_issued: number;
  probe_settlements: number;
}

/**
 * Fire-and-forget telemetry insert for one funnel event (a 402 challenge
 * written to an agent, or a probe's $0 settlement).
 *
 * Uses peekPool() so it NEVER lazily opens the pool — if no pool is open it is
 * a silent no-op, matching recordMcpUsage. Callers on the hot request path
 * must still wrap this in try/catch: funnel telemetry must never break or
 * slow a real payment/challenge response.
 */
export async function recordPaymentFunnelEvent(input: PaymentFunnelEventInput): Promise<void> {
  if (!peekPool()) return;
  await sql.run(
    `INSERT INTO payment_funnel_events (event_id, account_id, tool, kind, amount_cents, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      input.account_id,
      input.tool,
      input.kind,
      input.amount_cents ?? 0,
      new Date().toISOString(),
    ],
  );
}

/** All-time counts for the x402 onboarding funnel (challenges issued, $0 probe settlements). */
export async function getPaymentFunnelStats(): Promise<PaymentFunnelStats> {
  // pg COUNT(*) returns a string/bigint — Number() coerces.
  const count = async (kind: PaymentFunnelEventKind): Promise<number> =>
    Number((await sql.one<{ c: string | number }>(
      `SELECT COUNT(*) c FROM payment_funnel_events WHERE kind = ?`,
      [kind],
    ))?.c ?? 0);
  return {
    x402_challenges_issued: await count("challenge"),
    probe_settlements: await count("settlement"),
  };
}
