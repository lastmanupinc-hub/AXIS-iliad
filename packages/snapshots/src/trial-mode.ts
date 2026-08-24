// ─── Free Trial Mode ────────────────────────────────────────────
//
// A temporary, owner-triggered window where every AXIS Iliad program and MCP
// tool is free to call — no payment gate, anywhere, for anyone. Start is
// explicit (the owner sets AXIS_FREE_TRIAL_STARTED_AT once, e.g. in Render);
// end is fully automatic (a fixed 7-day duration from that timestamp, no
// redeploy or manual flag flip required to turn billing back on).
//
// This is the ONLY state a trial carries — there is no per-account "is this
// account in the trial" field anywhere in the accounts schema, and none is
// needed: every gate this trial waives is checked globally (the same way for
// a brand-new anonymous account as for a two-year-old suite subscriber), so a
// single global time window is sufficient and avoids inventing per-account
// state that would need its own migration, backfill, and cleanup story.
//
// Fails toward NORMAL BILLING, never toward accidental free access: an
// absent or malformed AXIS_FREE_TRIAL_STARTED_AT resolves to "trial off,"
// not "trial on." A parsing bug here must never give away money.

const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export interface TrialWindow {
  startedAt: Date;
  endsAt: Date;
}

/**
 * Reads AXIS_FREE_TRIAL_STARTED_AT and resolves the 7-day window it opens.
 * Returns null when the env var is unset OR fails to parse as a valid date —
 * callers must treat null identically to "no trial has ever been configured."
 */
export function getTrialWindow(): TrialWindow | null {
  const raw = process.env.AXIS_FREE_TRIAL_STARTED_AT;
  if (!raw) return null;
  const startedAt = new Date(raw);
  if (Number.isNaN(startedAt.getTime())) return null;
  return { startedAt, endsAt: new Date(startedAt.getTime() + TRIAL_DURATION_MS) };
}

/**
 * True iff the free trial is active right now (or at the supplied instant —
 * tests pin exact boundary instants via `now` rather than waiting real days).
 * Inclusive of startedAt, exclusive of endsAt: a call at the exact start
 * instant is in-trial; a call at the exact end instant is not.
 */
export function isFreeTrialActive(now: number = Date.now()): boolean {
  const w = getTrialWindow();
  if (!w) return false;
  return now >= w.startedAt.getTime() && now < w.endsAt.getTime();
}
