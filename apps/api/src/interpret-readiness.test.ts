import { describe, it, expect } from "vitest";
import { interpretReadiness } from "./handlers.js";

// DB-free guard for the shared readiness interpreter used by the REST +
// probe/prepare MCP tools. The score reflects AXIS artifact COVERAGE, so the label
// must describe coverage tiers — never assert a repo is "production-ready" (the
// same over-claim removed from the commerce-registry generator in Program 18).
describe("interpretReadiness — honest coverage labels", () => {
  it("maps score tiers to coverage labels + readiness risk (thresholds 80/50)", () => {
    expect(interpretReadiness(100)).toEqual({ interpretation: "strong-coverage", risk_level: "low" });
    expect(interpretReadiness(80)).toEqual({ interpretation: "strong-coverage", risk_level: "low" });
    expect(interpretReadiness(79)).toEqual({ interpretation: "partial-coverage", risk_level: "medium" });
    expect(interpretReadiness(50)).toEqual({ interpretation: "partial-coverage", risk_level: "medium" });
    expect(interpretReadiness(49)).toEqual({ interpretation: "minimal-coverage", risk_level: "high" });
    expect(interpretReadiness(0)).toEqual({ interpretation: "minimal-coverage", risk_level: "high" });
  });

  it("never emits a production/certification verdict at any score", () => {
    for (let s = 0; s <= 100; s += 5) {
      expect(["production-ready", "partially-ready", "needs-work", "needs-hardening"])
        .not.toContain(interpretReadiness(s).interpretation);
    }
  });
});
