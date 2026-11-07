/**
 * @vitest-environment happy-dom
 */

// A purchase is counted from the account's own record, once, never from the checkout's return URL (AXIS Launch
// taskgate T201, decisions.md 2026-11-05). These pin: no marker sends nothing; a success marker waits for the account
// to show a fresh succeeded purchase and sends purchase_completed once; the same purchase is never counted twice; an
// old purchase behind a revisited return URL counts nothing; a cancel marker counts nothing; the marker is scrubbed.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getLastPurchase = vi.fn<() => Promise<{ purchase_id: string; kind: "plan" | "credits"; succeeded_at: string } | null>>();
const sendKeyEvent = vi.fn<(name: string) => Promise<void>>(() => Promise.resolve());

vi.mock("./api.ts", () => ({ getLastPurchase: () => getLastPurchase() }));
vi.mock("./keyEvents.ts", () => ({ sendKeyEvent: (name: string) => sendKeyEvent(name) }));

import { countPurchaseOnReturn, takeReturnMarker } from "./purchaseReturn.ts";

const NOW = Date.parse("2026-11-06T15:00:00Z");
const fresh = { purchase_id: "p1", kind: "plan" as const, succeeded_at: "2026-11-06T14:59:30Z" };
const opts = { tries: 3, everyMs: 0, now: () => NOW };

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  getLastPurchase.mockReset();
  sendKeyEvent.mockClear();
});

afterEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("takeReturnMarker", () => {
  it("is false, and leaves the URL alone, when no success marker is present", () => {
    window.history.replaceState({}, "", "/?paid_checkout=cancel&x=1");
    expect(takeReturnMarker()).toBe(false);
    expect(window.location.search).toBe("?paid_checkout=cancel&x=1");
  });

  it("scrubs the plan and credit-pack markers and keeps the rest of the URL", () => {
    window.history.replaceState({}, "", "/account?topup=success&pack=pack_1&tab=usage#top");
    expect(takeReturnMarker()).toBe(true);
    expect(window.location.pathname + window.location.search + window.location.hash).toBe("/account?tab=usage#top");
  });
});

describe("countPurchaseOnReturn", () => {
  it("counts nothing without a success marker and never asks the account", async () => {
    expect(await countPurchaseOnReturn(opts)).toBe(false);
    expect(getLastPurchase).not.toHaveBeenCalled();
    expect(sendKeyEvent).not.toHaveBeenCalled();
  });

  it("waits for the account to show the purchase, then sends purchase_completed once", async () => {
    window.history.replaceState({}, "", "/?paid_checkout=success");
    getLastPurchase.mockResolvedValueOnce(null).mockResolvedValueOnce(fresh);
    expect(await countPurchaseOnReturn(opts)).toBe(true);
    expect(getLastPurchase).toHaveBeenCalledTimes(2);
    expect(sendKeyEvent).toHaveBeenCalledTimes(1);
    expect(sendKeyEvent).toHaveBeenCalledWith("purchase_completed");
    expect(window.location.search).toBe("");
  });

  it("never counts the same purchase twice, even from a revisited return URL", async () => {
    window.history.replaceState({}, "", "/?paid_checkout=success");
    getLastPurchase.mockResolvedValue(fresh);
    expect(await countPurchaseOnReturn(opts)).toBe(true);
    window.history.replaceState({}, "", "/?paid_checkout=success");
    expect(await countPurchaseOnReturn(opts)).toBe(false);
    expect(sendKeyEvent).toHaveBeenCalledTimes(1);
  });

  it("counts nothing when the account's last purchase is old (a stale return URL) or never lands", async () => {
    window.history.replaceState({}, "", "/?paid_checkout=success");
    getLastPurchase.mockResolvedValue({ ...fresh, purchase_id: "old", succeeded_at: "2026-11-01T10:00:00Z" });
    expect(await countPurchaseOnReturn(opts)).toBe(false);
    window.history.replaceState({}, "", "/account?topup=success");
    getLastPurchase.mockResolvedValue(null);
    expect(await countPurchaseOnReturn(opts)).toBe(false);
    expect(sendKeyEvent).not.toHaveBeenCalled();
  });

  it("counts nothing when the account cannot be read", async () => {
    window.history.replaceState({}, "", "/?paid_checkout=success");
    getLastPurchase.mockRejectedValue(new Error("401"));
    expect(await countPurchaseOnReturn(opts)).toBe(false);
    expect(sendKeyEvent).not.toHaveBeenCalled();
  });
});
