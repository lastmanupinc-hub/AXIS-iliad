import { describe, expect, it } from "vitest";
import {
  DISPUTE_TRANSITIONS,
  DisputeTransitionError,
  isTerminal,
  nextDisputeState,
} from "./dispute-state-machine.js";
import type { DisputeEvent, DisputeState } from "./types.js";

const ALL_STATES: DisputeState[] = [
  "needs_response",
  "evidence_assembling",
  "evidence_submitted",
  "under_review",
  "won",
  "lost",
  "accepted",
  "warning_closed",
];

const ALL_EVENTS: DisputeEvent[] = [
  "dispute_opened",
  "evidence_ready",
  "evidence_submitted",
  "provider_won",
  "provider_lost",
  "operator_accepted",
  "warning_closed",
];

describe("DISPUTE_TRANSITIONS / nextDisputeState", () => {
  it("has an entry for every DisputeState", () => {
    for (const state of ALL_STATES) {
      expect(DISPUTE_TRANSITIONS).toHaveProperty(state);
    }
  });

  it("yields the mapped target for every legal (state, event) pair in the table", () => {
    for (const state of ALL_STATES) {
      const edges = DISPUTE_TRANSITIONS[state];
      for (const [event, target] of Object.entries(edges) as [DisputeEvent, DisputeState][]) {
        expect(nextDisputeState(state, event)).toBe(target);
      }
    }
  });

  it("throws DisputeTransitionError for every (state, event) pair absent from the table", () => {
    for (const state of ALL_STATES) {
      const edges = DISPUTE_TRANSITIONS[state];
      for (const event of ALL_EVENTS) {
        if (event in edges) continue;
        expect(() => nextDisputeState(state, event)).toThrow(DisputeTransitionError);
      }
    }
  });

  it("is deterministic — repeated calls with the same input yield the same output", () => {
    const results = new Set<string>();
    for (let i = 0; i < 5; i++) {
      results.add(nextDisputeState("needs_response", "evidence_ready"));
    }
    expect(results.size).toBe(1);
    expect(results.has("evidence_assembling")).toBe(true);
  });

  it("throws on every event fired against a terminal state", () => {
    for (const state of ["won", "lost", "accepted", "warning_closed"] as DisputeState[]) {
      for (const event of ALL_EVENTS) {
        expect(() => nextDisputeState(state, event)).toThrow(DisputeTransitionError);
      }
    }
  });

  it("DisputeTransitionError carries the offending state and event", () => {
    try {
      nextDisputeState("won", "dispute_opened");
      throw new Error("expected nextDisputeState to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(DisputeTransitionError);
      const e = err as DisputeTransitionError;
      expect(e.state).toBe("won");
      expect(e.event).toBe("dispute_opened");
    }
  });
});

describe("isTerminal", () => {
  it("is true for exactly won, lost, accepted, warning_closed", () => {
    const expectedTerminal = new Set(["won", "lost", "accepted", "warning_closed"]);
    for (const state of ALL_STATES) {
      expect(isTerminal(state)).toBe(expectedTerminal.has(state));
    }
  });
});
