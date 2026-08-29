import { randomUUID } from "node:crypto";
import { sql } from "./pg.js";

// ─── @axis/closer persistence ────────────────────────────────────
//
// Storage for the revenue pipeline. See packages/closer/README.md for the
// design; the one rule that matters here is that this layer stores FACTS ONLY.
//
// There is no stage column and no next_action column, and there must never be
// one. Stage is a fold over closer_events and next_action is a function of that
// fold (packages/closer). If either were persisted, a write path could set them
// inconsistently with the events and the pipeline would start lying — which is
// precisely the CRM failure mode this exists to avoid.
//
// This module intentionally does NOT import @axis/closer. Persistence stays a
// dumb fact store; all derivation lives in the engine, which the API layer
// composes. That keeps the engine free of I/O and this free of policy.

/** Row shape as stored. `facts` and `payload` are JSON strings (see pg-schema). */
export interface ProspectRow {
  prospect_id: string;
  legal_name: string;
  website: string | null;
  source_id: string;
  facts: string;
  created_at: string;
}

export interface EventRow {
  seq: string | number;
  prospect_id: string;
  type: string;
  at: string;
  payload: string;
  actor: string | null;
}

/** Hydrated shapes — JSON parsed, matching @axis/closer's Prospect/CloserEvent. */
export interface StoredProspect {
  prospect_id: string;
  legal_name: string;
  website?: string;
  source_id: string;
  facts: Record<string, unknown>;
  created_at: string;
}

export interface StoredEvent {
  seq: number;
  prospect_id: string;
  type: string;
  at: string;
  payload?: Record<string, unknown>;
  actor?: string;
}

/**
 * Parse a JSON column defensively. A single malformed row must not take down a
 * whole queue read — the alternative (throwing) means one bad ingest blocks the
 * salesperson's entire morning.
 */
function parseJson(raw: string | null | undefined, where: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    console.warn(`[closer-store] malformed JSON in ${where} — treating as {}`);
    return {};
  }
}

function hydrateProspect(r: ProspectRow): StoredProspect {
  return {
    prospect_id: r.prospect_id,
    legal_name: r.legal_name,
    website: r.website ?? undefined,
    source_id: r.source_id,
    facts: parseJson(r.facts, `closer_prospects.facts (${r.prospect_id})`),
    created_at: r.created_at,
  };
}

function hydrateEvent(r: EventRow): StoredEvent {
  return {
    seq: typeof r.seq === "string" ? Number(r.seq) : r.seq,
    prospect_id: r.prospect_id,
    type: r.type,
    at: r.at,
    payload: parseJson(r.payload, `closer_events.payload (seq ${r.seq})`),
    actor: r.actor ?? undefined,
  };
}

// ─── Prospects ───────────────────────────────────────────────────

export interface CreateProspectInput {
  legal_name: string;
  website?: string;
  source_id: string;
  facts?: Record<string, unknown>;
}

/**
 * Create a prospect and its opening `identified` event atomically.
 *
 * Atomic because a prospect with no events would derive to IDENTIFIED with no
 * provenance — invisible to any audit of "where did this come from?". The two
 * writes are one fact.
 *
 * Dedup: if the website already exists we return the existing prospect rather
 * than erroring or inserting a twin. Ingesting the same company from two public
 * sources is the normal case, not an exception, and a duplicate would mean
 * contacting them twice.
 */
export async function createProspect(input: CreateProspectInput): Promise<StoredProspect> {
  const now = new Date().toISOString();

  if (input.website) {
    const existing = await sql.one<ProspectRow>(
      `SELECT * FROM closer_prospects WHERE lower(website) = lower(?)`,
      [input.website],
    );
    if (existing) return hydrateProspect(existing);
  }

  const prospect_id = `prs_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const facts = JSON.stringify(input.facts ?? {});

  return await sql.tx(async (client) => {
    const res = await client.query<ProspectRow>(
      `INSERT INTO closer_prospects (prospect_id, legal_name, website, source_id, facts, created_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [prospect_id, input.legal_name, input.website ?? null, input.source_id, facts, now],
    );
    await client.query(
      `INSERT INTO closer_events (prospect_id, type, at, payload, actor)
       VALUES ($1, 'identified', $2, $3, $4)`,
      [prospect_id, now, JSON.stringify({ source_id: input.source_id }), input.source_id],
    );
    return hydrateProspect(res.rows[0]!);
  });
}

export async function getProspect(prospect_id: string): Promise<StoredProspect | undefined> {
  const r = await sql.one<ProspectRow>(
    `SELECT * FROM closer_prospects WHERE prospect_id = ?`,
    [prospect_id],
  );
  return r ? hydrateProspect(r) : undefined;
}

/**
 * Merge new facts into a prospect and record the `enriched` event.
 *
 * Shallow merge, last-writer-wins per key: enrichment arrives incrementally
 * from different sources and a deep merge would silently interleave
 * contradictory values from two providers with no way to tell which won.
 */
export async function enrichProspect(
  prospect_id: string,
  facts: Record<string, unknown>,
  actor?: string,
): Promise<StoredProspect | undefined> {
  const current = await getProspect(prospect_id);
  if (!current) return undefined;

  const merged = { ...current.facts, ...facts };
  const now = new Date().toISOString();

  return await sql.tx(async (client) => {
    const res = await client.query<ProspectRow>(
      `UPDATE closer_prospects SET facts = $1 WHERE prospect_id = $2 RETURNING *`,
      [JSON.stringify(merged), prospect_id],
    );
    await client.query(
      `INSERT INTO closer_events (prospect_id, type, at, payload, actor)
       VALUES ($1, 'enriched', $2, $3, $4)`,
      [prospect_id, now, JSON.stringify({ keys: Object.keys(facts) }), actor ?? null],
    );
    return hydrateProspect(res.rows[0]!);
  });
}

// ─── Events ──────────────────────────────────────────────────────

/**
 * Append a fact. The ONLY write path for pipeline movement.
 *
 * Note what this does not accept: a stage. Callers cannot move a prospect;
 * they can only record that something happened, and the stage follows.
 */
export async function appendEvent(
  prospect_id: string,
  type: string,
  payload?: Record<string, unknown>,
  actor?: string,
  at?: string,
): Promise<StoredEvent> {
  const res = await sql.one<EventRow>(
    `INSERT INTO closer_events (prospect_id, type, at, payload, actor)
     VALUES (?, ?, ?, ?, ?) RETURNING *`,
    [prospect_id, type, at ?? new Date().toISOString(), JSON.stringify(payload ?? {}), actor ?? null],
  );
  return hydrateEvent(res!);
}

export async function listEvents(prospect_id: string): Promise<StoredEvent[]> {
  const rows = await sql.many<EventRow>(
    `SELECT * FROM closer_events WHERE prospect_id = ? ORDER BY seq ASC`,
    [prospect_id],
  );
  return rows.map(hydrateEvent);
}

// ─── Bulk read for the queue / funnel ────────────────────────────

export interface ProspectWithEvents {
  prospect: StoredProspect;
  events: StoredEvent[];
}

/**
 * Load prospects + their full event logs for pipeline evaluation.
 *
 * Two queries, not N+1: one for prospects, one for all their events, joined in
 * memory. The queue is read on every page load, so an N+1 here would be felt
 * immediately at even a few hundred prospects.
 *
 * `limit` is a real bound rather than a default page size — funnel math needs
 * the whole set to be honest, and a silently truncated funnel is a wrong
 * funnel. Callers that want everything should pass a limit above their count
 * and check `truncated`.
 */
export async function loadPipeline(
  limit = 5000,
): Promise<{ records: ProspectWithEvents[]; truncated: boolean }> {
  const prospects = await sql.many<ProspectRow>(
    `SELECT * FROM closer_prospects ORDER BY created_at ASC LIMIT ?`,
    [limit + 1],
  );
  const truncated = prospects.length > limit;
  const page = truncated ? prospects.slice(0, limit) : prospects;
  if (page.length === 0) return { records: [], truncated: false };

  const ids = page.map((p) => p.prospect_id);
  const placeholders = ids.map(() => "?").join(", ");
  const events = await sql.many<EventRow>(
    `SELECT * FROM closer_events WHERE prospect_id IN (${placeholders}) ORDER BY prospect_id, seq ASC`,
    ids,
  );

  const byProspect = new Map<string, StoredEvent[]>();
  for (const e of events) {
    const hydrated = hydrateEvent(e);
    const list = byProspect.get(hydrated.prospect_id);
    if (list) list.push(hydrated);
    else byProspect.set(hydrated.prospect_id, [hydrated]);
  }

  return {
    records: page.map((p) => ({
      prospect: hydrateProspect(p),
      events: byProspect.get(p.prospect_id) ?? [],
    })),
    truncated,
  };
}

/** Count prospects — cheap enough to call alongside a truncated load. */
export async function countProspects(): Promise<number> {
  const r = await sql.one<{ n: string }>(`SELECT COUNT(*) AS n FROM closer_prospects`);
  return r ? Number(r.n) : 0;
}
