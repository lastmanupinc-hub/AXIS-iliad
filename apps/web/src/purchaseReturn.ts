// A purchase is counted when the account confirms it, never from the return URL alone (AXIS Launch taskgate T201,
// decisions.md 2026-11-05). PAI'D's hosted checkout sends the buyer back to /?paid_checkout=success (a plan) or
// /account?topup=success (a credit pack); the plan or credits land through the webhook, a moment later. This module
// scrubs the return marker, then asks GET /v1/account until its last_purchase is a succeeded purchase this browser
// has not counted, and sends purchase_completed for it once. A cancelled checkout, a forged marker or a purchase that
// never lands sends nothing.

import { getLastPurchase, type LastPurchase } from "./api.ts";
import { sendKeyEvent } from "./keyEvents.ts";

const COUNTED_KEY = "axis_counted_purchases";
const RETURN_MARKERS: Array<[string, string]> = [["paid_checkout", "success"], ["topup", "success"]];

/** The return markers the current URL carries, removed from it; true when the page is a checkout's success return. */
export function takeReturnMarker(loc: Location = window.location, hist: History = window.history): boolean {
  const params = new URLSearchParams(loc.search);
  const hit = RETURN_MARKERS.some(([k, v]) => params.get(k) === v);
  if (!hit) return false;
  for (const [k] of RETURN_MARKERS) params.delete(k);
  params.delete("pack");
  const q = params.toString();
  hist.replaceState({}, "", loc.pathname + (q ? `?${q}` : "") + loc.hash);
  return true;
}

function counted(): string[] {
  try {
    const raw = localStorage.getItem(COUNTED_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function remember(id: string): void {
  try {
    localStorage.setItem(COUNTED_KEY, JSON.stringify([...counted().slice(-19), id]));
  } catch {
    /* storage refused: the purchase is still counted once in this tab */
  }
}

async function lastPurchase(): Promise<LastPurchase | null> {
  try {
    return await getLastPurchase();
  } catch {
    return null;
  }
}

/**
 * On a checkout's success return: wait for the account to show the purchase (the webhook may be a few seconds behind
 * the redirect), then count it once. `tries` x `everyMs` bounds the wait; the purchase must have succeeded within
 * `freshMs` so an old purchase is never counted from a revisited return URL. Resolves true when it counted.
 */
export async function countPurchaseOnReturn(opts: { tries?: number; everyMs?: number; freshMs?: number; now?: () => number } = {}): Promise<boolean> {
  const { tries = 12, everyMs = 2500, freshMs = 30 * 60_000, now = () => Date.now() } = opts;
  if (!takeReturnMarker()) return false;
  const seen = new Set(counted());
  for (let i = 0; i < tries; i++) {
    const p = await lastPurchase();
    if (p && p.succeeded_at && !seen.has(p.purchase_id)) {
      const at = Date.parse(p.succeeded_at);
      if (Number.isFinite(at) && now() - at <= freshMs) {
        remember(p.purchase_id);
        await sendKeyEvent("purchase_completed");
        return true;
      }
    }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, everyMs));
  }
  return false;
}
