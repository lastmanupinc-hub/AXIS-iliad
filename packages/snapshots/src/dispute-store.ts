// ─── Dispute Store (WO-08 dispute-lifecycle) ────────────────────
//
// CRUD for rail-agnostic DisputeRecords plus an append-only transition
// ledger. Mirrors stripe-store.ts. The strongly-typed state machine lives
// in @axis/agentic-compliance (dispute-state-machine.ts); this store is
// deliberately structural (plain strings) so @axis/snapshots does not grow
// a dependency on the compliance package — the API layer's types narrow
// onto these shapes.

import { sql } from "./pg.js";

/** Structural mirror of @axis/agentic-compliance's DisputeRecord. */
export interface StoredDisputeRecord {
  /** Provider dispute id, e.g. Stripe "dp_...". */
  id: string;
  /** "stripe" | "vrol" | "rdr" | "cdrn". */
  rail: string;
  chargeId: string | null;
  accountId: string | null;
  /** Network reason code, e.g. "10.4". */
  reasonCode: string;
  amountMinor: number;
  currency: string;
  /** DisputeState from the compliance state machine, stored as text. */
  state: string;
  /** ISO evidence-submission deadline, if known. */
  dueBy: string | null;
  createdAt: string;
  updatedAt: string;
  representmentId: string | null;
}

/** Structural mirror of @axis/agentic-compliance's DisputeTransition. */
export interface StoredDisputeTransition {
  from: string;
  to: string;
  at: string;
  event: string;
}

interface DisputeRow {
  id: string;
  rail: string;
  charge_id: string | null;
  account_id: string | null;
  reason_code: string;
  amount_minor: number;
  currency: string;
  state: string;
  due_by: string | null;
  created_at: string;
  updated_at: string;
  representment_id: string | null;
}

function rowToRecord(row: DisputeRow): StoredDisputeRecord {
  return {
    id: row.id,
    rail: row.rail,
    chargeId: row.charge_id,
    accountId: row.account_id,
    reasonCode: row.reason_code,
    amountMinor: row.amount_minor,
    currency: row.currency,
    state: row.state,
    dueBy: row.due_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    representmentId: row.representment_id,
  };
}

export async function upsertDispute(rec: StoredDisputeRecord): Promise<void> {
  await sql.run(
    `
    INSERT INTO disputes
      (id, rail, charge_id, account_id, reason_code, amount_minor, currency,
       state, due_by, created_at, updated_at, representment_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      rail = excluded.rail,
      charge_id = excluded.charge_id,
      account_id = COALESCE(excluded.account_id, disputes.account_id),
      reason_code = excluded.reason_code,
      amount_minor = excluded.amount_minor,
      currency = excluded.currency,
      state = excluded.state,
      due_by = COALESCE(excluded.due_by, disputes.due_by),
      updated_at = excluded.updated_at,
      representment_id = COALESCE(excluded.representment_id, disputes.representment_id)
  `,
    [
      rec.id,
      rec.rail,
      rec.chargeId,
      rec.accountId,
      rec.reasonCode,
      rec.amountMinor,
      rec.currency,
      rec.state,
      rec.dueBy,
      rec.createdAt,
      rec.updatedAt,
      rec.representmentId,
    ],
  );
}

export async function getDispute(id: string): Promise<StoredDisputeRecord | null> {
  const row = await sql.one<DisputeRow>("SELECT * FROM disputes WHERE id = ?", [id]);
  return row ? rowToRecord(row) : null;
}

export async function listDisputesByAccount(accountId: string): Promise<StoredDisputeRecord[]> {
  const rows = await sql.many<DisputeRow>(
    "SELECT * FROM disputes WHERE account_id = ? ORDER BY created_at DESC, id",
    [accountId],
  );
  return rows.map(rowToRecord);
}

export async function logDisputeTransition(id: string, t: StoredDisputeTransition): Promise<void> {
  await sql.run(
    "INSERT INTO dispute_transitions (dispute_id, from_state, to_state, event, at) VALUES (?, ?, ?, ?, ?)",
    [id, t.from, t.to, t.event, t.at],
  );
}

export async function listDisputeTransitions(id: string): Promise<StoredDisputeTransition[]> {
  const rows = await sql.many<{ from_state: string; to_state: string; event: string; at: string }>(
    "SELECT from_state, to_state, event, at FROM dispute_transitions WHERE dispute_id = ? ORDER BY seq",
    [id],
  );
  return rows.map((r) => ({ from: r.from_state, to: r.to_state, event: r.event, at: r.at }));
}
