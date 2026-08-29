import { describe, it, expect } from "vitest";
import {
  deriveState,
  evaluate,
  funnel,
  funnelSummary,
  nextAction,
  qualify,
  score,
  todayQueue,
  type RevOpsEvent,
  type ProspectRecord,
  type Prospect,
} from "./index.js";

const NOW = new Date("2026-03-10T12:00:00.000Z");

let seq = 0;
function ev(
  prospect_id: string,
  type: RevOpsEvent["type"],
  at: string,
  payload?: Record<string, unknown>,
): RevOpsEvent {
  return { seq: ++seq, prospect_id, type, at, payload };
}

function prospect(id: string, facts: Prospect["facts"] = {}): Prospect {
  return {
    prospect_id: id,
    legal_name: `Merchant ${id}`,
    source_id: "test",
    facts,
    created_at: "2026-03-01T00:00:00.000Z",
  };
}

// ─── Stage derivation ────────────────────────────────────────────────────

describe("deriveState", () => {
  it("a bare prospect with no events is IDENTIFIED", () => {
    expect(deriveState([]).stage).toBe("IDENTIFIED");
  });

  it("takes the FURTHEST stage reached, not the last event written", () => {
    // Events deliberately out of pipeline order: a meeting was booked, and
    // only afterwards did someone log the enrichment. Stage must not regress.
    const e = [
      ev("p1", "identified", "2026-03-01T00:00:00Z"),
      ev("p1", "meeting_booked", "2026-03-05T00:00:00Z"),
      ev("p1", "enriched", "2026-03-06T00:00:00Z"),
    ];
    expect(deriveState(e).stage).toBe("MEETING");
  });

  it("skipped steps do not block a later stage (deal closed offline)", () => {
    // No contact/reply/meeting ever logged — it happened at a conference.
    // Requiring the full chain is how funnels start lying.
    const e = [
      ev("p2", "identified", "2026-03-01T00:00:00Z"),
      ev("p2", "agreement_signed", "2026-03-08T00:00:00Z"),
    ];
    expect(deriveState(e).stage).toBe("ONBOARDING");
  });

  it("counts contact attempts and tracks the last touch", () => {
    const e = [
      ev("p3", "contacted", "2026-03-01T00:00:00Z"),
      ev("p3", "contacted", "2026-03-04T00:00:00Z"),
    ];
    const s = deriveState(e);
    expect(s.contact_attempts).toBe(2);
    expect(s.last_contacted_at).toBe("2026-03-04T00:00:00Z");
  });

  it("opt-out forces DISQUALIFIED and is never cleared by reopen", () => {
    const e = [
      ev("p4", "contacted", "2026-03-01T00:00:00Z"),
      ev("p4", "replied", "2026-03-02T00:00:00Z", { sentiment: "negative", opt_out: true }),
      ev("p4", "reopened", "2026-03-03T00:00:00Z"),
    ];
    const s = deriveState(e);
    expect(s.state).toBe("DISQUALIFIED");
    expect(s.opt_out).toBe(true);
  });

  it("reopen clears a loss but a snooze holds until its date", () => {
    const lost = [
      ev("p5", "lost", "2026-03-01T00:00:00Z"),
      ev("p5", "reopened", "2026-03-02T00:00:00Z"),
    ];
    expect(deriveState(lost).state).toBe("IDENTIFIED");

    const snoozed = [ev("p6", "snoozed", "2026-03-01T00:00:00Z", { until: "2026-04-01T00:00:00Z" })];
    expect(deriveState(snoozed).state).toBe("DORMANT");
  });
});

// ─── Qualification: unknown must not mean disqualified ───────────────────

describe("qualify", () => {
  it("passes a high-risk vertical clearing the volume floor", () => {
    const r = qualify({ vertical: "cbd", est_monthly_volume: 5_000_000 });
    expect(r.qualified).toBe(true);
    expect(r.disqualified).toBe(false);
  });

  it("missing facts are NOT a disqualification — they mean 'enrich first'", () => {
    const r = qualify({});
    expect(r.qualified).toBe(false);
    expect(r.disqualified).toBe(false); // the important half
  });

  it("an excluded jurisdiction is a hard disqualifier", () => {
    const r = qualify({ vertical: "cbd", est_monthly_volume: 5_000_000, country: "KP" });
    expect(r.disqualified).toBe(true);
  });

  it("a low-risk vertical is unqualified but not disqualified", () => {
    const r = qualify({ vertical: "bookstore", est_monthly_volume: 5_000_000 });
    expect(r.qualified).toBe(false);
    expect(r.disqualified).toBe(false);
  });

  it("under the volume floor is unqualified, not disqualified", () => {
    const r = qualify({ vertical: "cbd", est_monthly_volume: 100 });
    expect(r.qualified).toBe(false);
    expect(r.disqualified).toBe(false);
  });
});

// ─── Scoring: decay and explainability ───────────────────────────────────

describe("score", () => {
  it("a fresh termination signal scores high and marks the prospect hot", () => {
    const e = [ev("s1", "signal", "2026-03-09T00:00:00Z", { kind: "processor_terminated" })];
    const r = score({ vertical: "cbd", est_monthly_volume: 10_000_000 }, e, NOW);
    expect(r.hot).toBe(true);
    expect(r.score).toBeGreaterThan(50);
  });

  it("signals decay to nothing past the half-life", () => {
    const stale = [ev("s2", "signal", "2025-11-01T00:00:00Z", { kind: "processor_terminated" })];
    const r = score({}, stale, NOW);
    expect(r.score).toBe(0);
    expect(r.hot).toBe(false);
  });

  it("always explains itself", () => {
    const e = [ev("s3", "signal", "2026-03-09T00:00:00Z", { kind: "checkout_down" })];
    const r = score({ vertical: "cbd" }, e, NOW);
    expect(r.reasons.length).toBeGreaterThan(0);
    expect(r.reasons.join(" ")).toContain("checkout_down");
  });

  it("is capped at 100 so the number stays interpretable", () => {
    const many = [
      ev("s4", "signal", "2026-03-10T00:00:00Z", { kind: "processor_terminated" }),
      ev("s4", "signal", "2026-03-10T00:00:00Z", { kind: "checkout_down" }),
      ev("s4", "signal", "2026-03-10T00:00:00Z", { kind: "payment_pain_public" }),
      ev("s4", "signal", "2026-03-10T00:00:00Z", { kind: "inbound_interest" }),
    ];
    const r = score({ vertical: "cbd", est_monthly_volume: 99_000_000 }, many, NOW);
    expect(r.score).toBe(100);
  });
});

// ─── Next action: the product ────────────────────────────────────────────

describe("nextAction", () => {
  it("an un-enriched prospect is told to enrich", () => {
    const p = prospect("n1");
    const a = nextAction(p, deriveState([]), 0, NOW);
    expect(a.action).toBe("enrich");
  });

  it("a fully-prepared prospect is told to contact, due immediately", () => {
    const p = prospect("n2", { vertical: "cbd", est_monthly_volume: 5_000_000 });
    const e = [
      ev("n2", "qualified", "2026-03-02T00:00:00Z"),
      ev("n2", "decision_maker_found", "2026-03-03T00:00:00Z"),
      ev("n2", "contact_verified", "2026-03-04T00:00:00Z"),
    ];
    const a = nextAction(p, deriveState(e), 50, NOW);
    expect(a.action).toBe("contact");
    expect(a.due_now).toBe(true);
  });

  it("schedules a follow-up on cadence rather than immediately", () => {
    const p = prospect("n3", { vertical: "cbd" });
    // Contacted 1 day ago; the first follow-up gap is 3 days, so not due yet.
    const e = [ev("n3", "contacted", "2026-03-09T12:00:00Z")];
    const a = nextAction(p, deriveState(e), 40, NOW);
    expect(a.action).toBe("follow_up");
    expect(a.due_now).toBe(false);
    expect(a.due_at).toBe("2026-03-12T12:00:00.000Z");
  });

  it("a follow-up whose gap has elapsed is due", () => {
    const p = prospect("n4", { vertical: "cbd" });
    const e = [ev("n4", "contacted", "2026-03-01T12:00:00Z")];
    const a = nextAction(p, deriveState(e), 40, NOW);
    expect(a.action).toBe("follow_up");
    expect(a.due_now).toBe(true);
  });

  it("stops after max attempts instead of nagging forever", () => {
    const p = prospect("n5", { vertical: "cbd" });
    const e = [
      ev("n5", "contacted", "2026-03-01T00:00:00Z"),
      ev("n5", "contacted", "2026-03-04T00:00:00Z"),
      ev("n5", "contacted", "2026-03-08T00:00:00Z"),
    ];
    const a = nextAction(p, deriveState(e), 40, NOW);
    expect(a.action).toBe("nothing");
    expect(a.reason).toContain("3 attempts");
  });

  it("a reply outranks everything and asks for a meeting", () => {
    const p = prospect("n6", { vertical: "cbd" });
    const e = [
      ev("n6", "contacted", "2026-03-01T00:00:00Z"),
      ev("n6", "replied", "2026-03-09T00:00:00Z", { sentiment: "positive" }),
    ];
    const a = nextAction(p, deriveState(e), 40, NOW);
    expect(a.action).toBe("book_meeting");
    expect(a.due_now).toBe(true);
  });

  it("LIVE is not treated as won — it still asks for first revenue", () => {
    const p = prospect("n7", { vertical: "cbd" });
    const e = [ev("n7", "went_live", "2026-03-01T00:00:00Z")];
    const a = nextAction(p, deriveState(e), 40, NOW);
    expect(a.action).toBe("confirm_first_revenue");
  });

  it("an opted-out prospect produces no action", () => {
    const p = prospect("n8", { vertical: "cbd" });
    const e = [ev("n8", "replied", "2026-03-01T00:00:00Z", { sentiment: "negative", opt_out: true })];
    const a = nextAction(p, deriveState(e), 90, NOW);
    expect(a.action).toBe("nothing");
  });
});

// ─── The queue and the funnel ────────────────────────────────────────────

describe("todayQueue", () => {
  it("returns only work that is actually due, ranked, and capped", () => {
    const records: ProspectRecord[] = [
      // due: ready to contact
      {
        prospect: prospect("q1", { vertical: "cbd", est_monthly_volume: 9_000_000 }),
        events: [
          ev("q1", "qualified", "2026-03-02T00:00:00Z"),
          ev("q1", "decision_maker_found", "2026-03-02T00:00:00Z"),
          ev("q1", "contact_verified", "2026-03-02T00:00:00Z"),
        ],
      },
      // NOT due: contacted yesterday, follow-up is 3 days out
      {
        prospect: prospect("q2", { vertical: "cbd" }),
        events: [ev("q2", "contacted", "2026-03-09T12:00:00Z")],
      },
      // not due: opted out
      {
        prospect: prospect("q3", { vertical: "cbd" }),
        events: [ev("q3", "replied", "2026-03-01T00:00:00Z", { opt_out: true, sentiment: "negative" })],
      },
    ];
    const q = todayQueue(records, NOW);
    expect(q.map((x) => x.prospect.prospect_id)).toEqual(["q1"]);
  });

  it("ranks an engaged reply above a cold ready-to-contact", () => {
    const records: ProspectRecord[] = [
      {
        prospect: prospect("r1", { vertical: "cbd" }),
        events: [
          ev("r1", "qualified", "2026-03-02T00:00:00Z"),
          ev("r1", "decision_maker_found", "2026-03-02T00:00:00Z"),
          ev("r1", "contact_verified", "2026-03-02T00:00:00Z"),
        ],
      },
      {
        prospect: prospect("r2", { vertical: "cbd" }),
        events: [
          ev("r2", "contacted", "2026-03-01T00:00:00Z"),
          ev("r2", "replied", "2026-03-09T00:00:00Z", { sentiment: "positive" }),
        ],
      },
    ];
    const q = todayQueue(records, NOW);
    expect(q[0]!.prospect.prospect_id).toBe("r2");
  });

  it("respects the limit so a human gets a workable list", () => {
    const records: ProspectRecord[] = Array.from({ length: 50 }, (_, i) => ({
      prospect: prospect(`bulk${i}`, { vertical: "cbd" }),
      events: [
        ev(`bulk${i}`, "qualified", "2026-03-02T00:00:00Z"),
        ev(`bulk${i}`, "decision_maker_found", "2026-03-02T00:00:00Z"),
        ev(`bulk${i}`, "contact_verified", "2026-03-02T00:00:00Z"),
      ],
    }));
    expect(todayQueue(records, NOW, { limit: 8 })).toHaveLength(8);
  });
});

describe("funnel", () => {
  it("counts reached stages cumulatively and excludes terminals", () => {
    const records: ProspectRecord[] = [
      { prospect: prospect("f1"), events: [] }, // IDENTIFIED
      {
        prospect: prospect("f2", { vertical: "cbd" }),
        events: [ev("f2", "qualified", "2026-03-02T00:00:00Z")],
      },
      {
        prospect: prospect("f3", { vertical: "cbd" }),
        events: [
          ev("f3", "qualified", "2026-03-02T00:00:00Z"),
          ev("f3", "decision_maker_found", "2026-03-03T00:00:00Z"),
          ev("f3", "contact_verified", "2026-03-03T00:00:00Z"),
          ev("f3", "contacted", "2026-03-04T00:00:00Z"),
          ev("f3", "replied", "2026-03-09T00:00:00Z", { sentiment: "positive" }),
        ],
      },
      { prospect: prospect("f4"), events: [ev("f4", "disqualified", "2026-03-02T00:00:00Z")] },
    ];
    const f = funnel(records, NOW);

    expect(f.total).toBe(4);
    expect(f.reached.IDENTIFIED).toBe(3); // the disqualified one drops out
    expect(f.reached.QUALIFIED).toBe(2);
    expect(f.reached.ENGAGED).toBe(1);
    expect(f.current.ENGAGED).toBe(1);
    expect(f.terminal.DISQUALIFIED).toBe(1);
  });

  it("renders the founder's funnel shape", () => {
    const f = funnel([{ prospect: prospect("x1"), events: [] }], NOW);
    const out = funnelSummary(f);
    expect(out).toContain("potential merchants identified");
    expect(out).toContain("Today: work these");
  });
});

// ─── The property that makes this not-a-CRM ──────────────────────────────

describe("derived-state invariants", () => {
  it("is idempotent: evaluating twice yields the same answer", () => {
    const rec: ProspectRecord = {
      prospect: prospect("i1", { vertical: "cbd" }),
      events: [ev("i1", "contacted", "2026-03-01T00:00:00Z")],
    };
    const a = evaluate(rec, NOW);
    const b = evaluate(rec, NOW);
    expect(a.next).toEqual(b.next);
    expect(a.state).toEqual(b.state);
  });

  it("appending one fact advances the pipeline with no other write", () => {
    const p = prospect("i2", { vertical: "cbd", est_monthly_volume: 9_000_000 });
    const before: RevOpsEvent[] = [
      ev("i2", "qualified", "2026-03-02T00:00:00Z"),
      ev("i2", "decision_maker_found", "2026-03-02T00:00:00Z"),
      ev("i2", "contact_verified", "2026-03-02T00:00:00Z"),
    ];
    expect(evaluate({ prospect: p, events: before }, NOW).next.action).toBe("contact");

    // One append — no stage field is set anywhere.
    const after = [...before, ev("i2", "contacted", "2026-03-10T00:00:00Z")];
    const next = evaluate({ prospect: p, events: after }, NOW).next;
    expect(next.action).toBe("follow_up");
  });
});
