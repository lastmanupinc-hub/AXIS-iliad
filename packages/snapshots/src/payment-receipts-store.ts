// Payment receipts — the H1 cash-settlement record (WO-19 revenue-mrr-tracker).
//
// Persists the real card/USDC settlements that `settleOverageCash` collects on
// the shared mppx rail (Stripe SPT or Tempo USDC), so that money is captured
// distinctly from plan-credit overage metering (`usage_credit_ledger`). This
// is the table that lets the funding-doc "$0 MRR" figure become a live,
// code-derived receipt instead of a founder-attested estimate: it reads a
// true $0 until the first dollar actually settles, then ticks up on its own.
import { randomUUID } from "node:crypto";
import { sql } from "./pg.js";

// "paid_fc" = the PAI'D Fabric-Credit wallet rail (enforce mode): a successful
// FC debit is settled cash (PAI'D -> its Stripe -> founder settlement), kept
// distinct from the two mppx rails so revenue-by-rail stays auditable (H0.3).
export type PaymentProvider = "stripe" | "tempo" | "paid_fc";

export interface PaymentReceipt {
  id: string;
  account_id: string;
  tool: string;
  amount_cents: number;
  currency: string;
  provider: PaymentProvider;
  external_receipt: string | null;
  created_at: string;
}

export interface SettledRevenue {
  all_time_cents: number;
  trailing_30d_cents: number;
  by_tool: Array<{ tool: string; cents: number }>;
  first_at: string | null;
}

const DAY_MS = 86_400_000;

/** Record one settled cash payment (called from `settleOverageCash` on a mppx/PAI'D 200). */
export async function recordSettledPayment(p: {
  account_id: string;
  tool: string;
  amount_cents: number;
  currency: string;
  provider: PaymentProvider;
  external_receipt?: string;
}): Promise<void> {
  await sql.run(
    `INSERT INTO payment_receipts
      (id, account_id, tool, amount_cents, currency, provider, external_receipt, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      p.account_id,
      p.tool,
      p.amount_cents,
      p.currency,
      p.provider,
      p.external_receipt ?? null,
      new Date().toISOString(),
    ],
  );
}

/**
 * All-time + trailing-30-day settled cash revenue, grouped by tool, plus the
 * first-ever settlement timestamp. `now` is injectable (defaults to the real
 * clock) so callers that need a fully deterministic snapshot — e.g.
 * `getGrowthSnapshot`, which threads its own injected `now` through here —
 * get a stable trailing-30d window instead of one pinned to the wall clock.
 */
export async function getSettledRevenue(now: Date = new Date()): Promise<SettledRevenue> {
  const since30d = new Date(now.getTime() - 30 * DAY_MS).toISOString();

  // pg COUNT/SUM return strings/bigints — coerced with Number() at the read site.
  const totals = await sql.one<{ total: string | number; first_at: string | null }>(
    `SELECT COALESCE(SUM(amount_cents), 0) as total, MIN(created_at) as first_at FROM payment_receipts`,
  );
  const trailing = await sql.one<{ total: string | number }>(
    `SELECT COALESCE(SUM(amount_cents), 0) as total FROM payment_receipts WHERE created_at >= ?`,
    [since30d],
  );
  const byTool = await sql.many<{ tool: string; cents: string | number }>(
    `SELECT tool, COALESCE(SUM(amount_cents), 0) as cents FROM payment_receipts GROUP BY tool ORDER BY tool`,
  );

  return {
    all_time_cents: Number(totals?.total ?? 0),
    trailing_30d_cents: Number(trailing?.total ?? 0),
    by_tool: byTool.map((r) => ({ tool: r.tool, cents: Number(r.cents) })),
    first_at: totals?.first_at ?? null,
  };
}
