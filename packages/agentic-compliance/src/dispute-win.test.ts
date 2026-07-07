import { describe, it, expect } from "vitest";
import {
  scoreWinProbability,
  WIN_PROB_COEFFICIENTS,
  WIN_PROB_MODEL_VERSION,
  type EvidenceState,
} from "./dispute-win.js";

const FULL_EVIDENCE: EvidenceState = {
  ce3Eligible: true,
  matchingDataElements: 5,
  priorUndisputedTransactions: 10,
  hasDeliveryProof: true,
  hasAvsMatch: true,
  hasCvvMatch: true,
  has3dsAuthenticated: true,
  hasSignedMandate: true,
  hasCustomerCommunication: true,
};

const BOOLEAN_FIELDS = [
  "ce3Eligible",
  "hasDeliveryProof",
  "hasAvsMatch",
  "hasCvvMatch",
  "has3dsAuthenticated",
  "hasSignedMandate",
  "hasCustomerCommunication",
] as const;

const REASON_CODES = Object.keys(WIN_PROB_COEFFICIENTS);

describe("scoreWinProbability — DETERMINISM", () => {
  it("returns a deep-equal result for the same input across calls", () => {
    const first = scoreWinProbability("10.4", FULL_EVIDENCE);
    const second = scoreWinProbability("10.4", FULL_EVIDENCE);
    expect(second).toEqual(first);
  });

  it("returns a fixed, deterministic probability literal for full 10.4 evidence", () => {
    const score = scoreWinProbability("10.4", FULL_EVIDENCE);
    expect(score.probability).toBeCloseTo(0.9988, 4);
  });
});

describe("scoreWinProbability — MONOTONICITY", () => {
  it("never lowers probability when a boolean factor flips false -> true, from a zero baseline, for every reason code", () => {
    for (const reasonCode of REASON_CODES) {
      for (const field of BOOLEAN_FIELDS) {
        const withoutFactor = scoreWinProbability(reasonCode, { [field]: false });
        const withFactor = scoreWinProbability(reasonCode, { [field]: true });
        expect(withFactor.probability).toBeGreaterThanOrEqual(withoutFactor.probability);
      }
    }
  });

  it("never lowers probability when a boolean factor flips false -> true, from a fully-saturated baseline, for every reason code", () => {
    for (const reasonCode of REASON_CODES) {
      for (const field of BOOLEAN_FIELDS) {
        const baseline = { ...FULL_EVIDENCE, [field]: false };
        const withoutFactor = scoreWinProbability(reasonCode, baseline);
        const withFactor = scoreWinProbability(reasonCode, { ...baseline, [field]: true });
        expect(withFactor.probability).toBeGreaterThanOrEqual(withoutFactor.probability);
      }
    }
  });

  it("never lowers probability as matchingDataElements increases 0..5, for every reason code", () => {
    for (const reasonCode of REASON_CODES) {
      let previous = -Infinity;
      for (let count = 0; count <= 5; count++) {
        const { probability } = scoreWinProbability(reasonCode, { matchingDataElements: count });
        expect(probability).toBeGreaterThanOrEqual(previous);
        previous = probability;
      }
    }
  });

  it("never lowers probability as priorUndisputedTransactions increases 0..10, for every reason code", () => {
    for (const reasonCode of REASON_CODES) {
      let previous = -Infinity;
      for (let count = 0; count <= 10; count++) {
        const { probability } = scoreWinProbability(reasonCode, { priorUndisputedTransactions: count });
        expect(probability).toBeGreaterThanOrEqual(previous);
        previous = probability;
      }
    }
  });
});

describe("scoreWinProbability — PER-REASON-CODE OPTIMIZATION", () => {
  it("ce3Eligible raises probability more for 10.4 (CE-3.0-scoped) than for 13.x", () => {
    const delta104 =
      scoreWinProbability("10.4", { ce3Eligible: true }).probability -
      scoreWinProbability("10.4", { ce3Eligible: false }).probability;
    const delta13x =
      scoreWinProbability("13.x", { ce3Eligible: true }).probability -
      scoreWinProbability("13.x", { ce3Eligible: false }).probability;

    expect(delta13x).toBeCloseTo(0, 4);
    expect(delta104).toBeGreaterThan(delta13x);
  });

  it("hasDeliveryProof is the single top-weighted factor for 13.x", () => {
    const weights = WIN_PROB_COEFFICIENTS["13.x"].weights;
    const maxField = (Object.keys(weights) as (keyof typeof weights)[]).reduce((best, field) =>
      weights[field] > weights[best] ? field : best,
    );
    expect(maxField).toBe("hasDeliveryProof");
  });

  it("has3dsAuthenticated alone pushes every 10.x fraud reason code to band 'high'", () => {
    for (const reasonCode of ["10.1", "10.2", "10.3", "10.4"]) {
      const score = scoreWinProbability(reasonCode, { has3dsAuthenticated: true });
      expect(score.band).toBe("high");
      expect(score.probability).toBeGreaterThanOrEqual(0.67);
    }
  });
});

describe("scoreWinProbability — ACTIONS", () => {
  it("recommends 'represent' once probability >= 0.67", () => {
    const score = scoreWinProbability("10.4", { has3dsAuthenticated: true });
    expect(score.probability).toBeGreaterThanOrEqual(0.67);
    expect(score.recommendedAction).toBe("represent");
  });

  it("recommends 'gather' (not 'accept') when probability is low but evidence is still missing", () => {
    const score = scoreWinProbability("10.4", {});
    expect(score.probability).toBeLessThan(0.34);
    expect(score.topMissingEvidence.length).toBeGreaterThan(0);
    expect(score.recommendedAction).toBe("gather");
  });

  it("topMissingEvidence excludes present factors and zero-weight factors, ordered by that reason code's weights desc", () => {
    const score = scoreWinProbability("13.x", { hasDeliveryProof: true });
    expect(score.topMissingEvidence).not.toContain("hasDeliveryProof"); // present
    expect(score.topMissingEvidence).not.toContain("ce3Eligible"); // zero-weight for 13.x
    const weights = WIN_PROB_COEFFICIENTS["13.x"].weights;
    const weightsOfMissing = score.topMissingEvidence.map((f) => weights[f as keyof typeof weights]);
    const sorted = [...weightsOfMissing].sort((a, b) => b - a);
    expect(weightsOfMissing).toEqual(sorted);
  });
});

describe("scoreWinProbability — HONESTY", () => {
  it("stamps every result with the current model version", () => {
    for (const reasonCode of [...REASON_CODES, "unknown-code"]) {
      expect(scoreWinProbability(reasonCode, FULL_EVIDENCE).modelVersion).toBe(WIN_PROB_MODEL_VERSION);
    }
  });

  it("always returns a probability within [0, 1]", () => {
    for (const reasonCode of [...REASON_CODES, "unknown-code"]) {
      const { probability } = scoreWinProbability(reasonCode, FULL_EVIDENCE);
      expect(probability).toBeGreaterThanOrEqual(0);
      expect(probability).toBeLessThanOrEqual(1);
    }
  });

  it("falls back to WIN_PROB_COEFFICIENTS.default for an unrecognized reason code, without throwing", () => {
    expect(() => scoreWinProbability("not-a-real-reason-code", { has3dsAuthenticated: true })).not.toThrow();
    const unknown = scoreWinProbability("not-a-real-reason-code", { has3dsAuthenticated: true });
    const defaultFamily = scoreWinProbability("default", { has3dsAuthenticated: true });
    expect(unknown.probability).toBe(defaultFamily.probability);
  });

  it("resolves '13.N' and '12.N' reason codes to their wildcard family", () => {
    const wildcard13 = scoreWinProbability("13.x", { hasDeliveryProof: true });
    const specific13 = scoreWinProbability("13.3", { hasDeliveryProof: true });
    expect(specific13.probability).toBe(wildcard13.probability);

    const wildcard12 = scoreWinProbability("12.x", { hasSignedMandate: true });
    const specific12 = scoreWinProbability("12.6", { hasSignedMandate: true });
    expect(specific12.probability).toBe(wildcard12.probability);
  });
});
