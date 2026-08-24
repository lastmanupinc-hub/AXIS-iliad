// ─── Free trial notice (REST) ───────────────────────────────────
//
// Shared by every REST handler that charges (or normally would charge) for a
// call — makeProgramHandler, and the bespoke handlers with their own gates
// (fleet, seats, notebook ask, diff-versions/persistence, the anonymous
// branch of create-snapshot). MCP has its own equivalent in mcp-server.ts
// (that surface's single dispatch chokepoint makes a local, unexported
// helper the right shape there; REST has no equivalent single chokepoint,
// so this is a small standalone module instead of living inside the
// 4000+-line handlers.ts, importable symmetrically by every handler file
// without any of them depending on each other).
import { isFreeTrialActive, getTrialWindow } from "@axis/snapshots";

export interface TrialNotice {
  active: true;
  ends_at: string;
  message: string;
}

/**
 * The `trial` field to spread into a charged (or normally-charged) REST
 * response while a free trial is active — `undefined` (dropped by
 * `sendJSON`'s `JSON.stringify`) when it isn't, so an unaffected response's
 * shape is byte-identical to before this existed.
 *
 * `hasPerCallPath` picks the wording: true for anything that normally
 * accepts per-call payment at any tier (every makeProgramHandler-routed
 * program, including closer/deploy — REST's version of both DOES accept
 * per-call payment via chargeWithDiscounts, unlike their MCP twins, which
 * hard-require an actual paid plan); false for the handful of REST features
 * with no per-call path at all even outside the trial (fleet, seats,
 * notebook ask, persistence/diff-versions).
 */
export function buildTrialNotice(hasPerCallPath: boolean): TrialNotice | undefined {
  if (!isFreeTrialActive()) return undefined;
  const window = getTrialWindow();
  if (!window) return undefined; // defensive only — isFreeTrialActive() already implies a window exists
  const ends_at = window.endsAt.toISOString();
  const message = hasPerCallPath
    ? `Free during the AXIS trial (ends ${ends_at}). Standard per-call pricing resumes after the trial.`
    : `Free during the AXIS trial (ends ${ends_at}). Normally requires a paid plan (Starter/Pro/Growth) — that requirement resumes after the trial.`;
  return { active: true, ends_at, message };
}
