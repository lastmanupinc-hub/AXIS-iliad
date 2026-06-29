import { describe, it, expect } from "vitest";
import { evalErrorRate, decideFire } from "./alerting.js";

const T = { errorRatePct: 5, minSample: 20 };

describe("evalErrorRate", () => {
  it("is not breached below the min sample, even at a high rate", () => {
    const r = evalErrorRate({ requestCount: 0, errorCount: 0 }, { requestCount: 10, errorCount: 10 }, T);
    expect(r.sample).toBe(10);
    expect(r.errorRatePct).toBe(100);
    expect(r.breached).toBe(false); // 10 < minSample 20
  });

  it("breaches above the threshold with enough sample", () => {
    const r = evalErrorRate({ requestCount: 0, errorCount: 0 }, { requestCount: 100, errorCount: 10 }, T);
    expect(r.sample).toBe(100);
    expect(r.errors).toBe(10);
    expect(r.errorRatePct).toBe(10);
    expect(r.breached).toBe(true);
  });

  it("does not breach when the rate is under the threshold", () => {
    const r = evalErrorRate({ requestCount: 0, errorCount: 0 }, { requestCount: 100, errorCount: 2 }, T);
    expect(r.errorRatePct).toBe(2);
    expect(r.breached).toBe(false);
  });

  it("returns 0% (not breached) when no requests landed in the window", () => {
    const r = evalErrorRate({ requestCount: 50, errorCount: 1 }, { requestCount: 50, errorCount: 1 }, T);
    expect(r.sample).toBe(0);
    expect(r.errorRatePct).toBe(0);
    expect(r.breached).toBe(false);
  });

  it("clamps to 0 if the counters reset (curr < prev)", () => {
    const r = evalErrorRate({ requestCount: 100, errorCount: 5 }, { requestCount: 10, errorCount: 0 }, T);
    expect(r.sample).toBe(0);
    expect(r.errors).toBe(0);
    expect(r.breached).toBe(false);
  });
});

describe("decideFire (debounce)", () => {
  const reAlert = 900_000;

  it("fires when entering breach", () => {
    const d = decideFire(true, { breaching: false, lastAlertAt: 0 }, 1000, reAlert);
    expect(d.fire).toBe(true);
    expect(d.next).toEqual({ breaching: true, lastAlertAt: 1000 });
  });

  it("does not re-fire within the re-alert window", () => {
    const d = decideFire(true, { breaching: true, lastAlertAt: 1000 }, 1000 + reAlert - 1, reAlert);
    expect(d.fire).toBe(false);
    expect(d.next.lastAlertAt).toBe(1000); // unchanged
  });

  it("re-fires once the re-alert window elapses", () => {
    const d = decideFire(true, { breaching: true, lastAlertAt: 1000 }, 1000 + reAlert, reAlert);
    expect(d.fire).toBe(true);
    expect(d.next.lastAlertAt).toBe(1000 + reAlert);
  });

  it("emits a resolved notice when the breach clears", () => {
    const d = decideFire(false, { breaching: true, lastAlertAt: 1000 }, 5000, reAlert);
    expect(d.fire).toBe(false);
    expect(d.resolved).toBe(true);
    expect(d.next.breaching).toBe(false);
  });

  it("stays quiet when never breaching", () => {
    const d = decideFire(false, { breaching: false, lastAlertAt: 0 }, 5000, reAlert);
    expect(d.fire).toBe(false);
    expect(d.resolved).toBe(false);
  });
});
