import { describe, it, expect, beforeEach } from "vitest";
import { resetTestDb } from "./pg-test.js";
import {
  appendEvent,
  countProspects,
  createProspect,
  enrichProspect,
  getProspect,
  listEvents,
  loadPipeline,
} from "./revops-store.js";

// Exercises migration v47 against real Postgres — the tables, the dedup index,
// and the identity `seq` column all have to actually exist for these to pass.

beforeEach(async () => {
  await resetTestDb();
});

describe("closer-store: prospects", () => {
  it("creates a prospect and its opening identified event atomically", async () => {
    const p = await createProspect({
      legal_name: "Acme CBD Co",
      website: "https://acmecbd.example",
      source_id: "seed",
    });

    expect(p.prospect_id).toMatch(/^prs_/);
    expect(p.legal_name).toBe("Acme CBD Co");

    // The opening event is what gives an ingested row provenance.
    const events = await listEvents(p.prospect_id);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("identified");
    expect(events[0]!.payload?.source_id).toBe("seed");
  });

  it("dedups on website instead of creating a twin prospect", async () => {
    const a = await createProspect({
      legal_name: "Vape Direct",
      website: "https://vapedirect.example",
      source_id: "source-a",
    });
    // Same company, different public source, different casing.
    const b = await createProspect({
      legal_name: "Vape Direct LLC",
      website: "https://VAPEDIRECT.example",
      source_id: "source-b",
    });

    expect(b.prospect_id).toBe(a.prospect_id);
    expect(await countProspects()).toBe(1);
  });

  it("allows multiple prospects with no website (partial index)", async () => {
    await createProspect({ legal_name: "No Site One", source_id: "s" });
    await createProspect({ legal_name: "No Site Two", source_id: "s" });
    expect(await countProspects()).toBe(2);
  });

  it("merges facts shallowly and records an enriched event", async () => {
    const p = await createProspect({
      legal_name: "Nutra Labs",
      source_id: "seed",
      facts: { vertical: "nutraceutical" },
    });

    const updated = await enrichProspect(p.prospect_id, { est_monthly_volume: 5_000_000 }, "enricher");
    expect(updated?.facts.vertical).toBe("nutraceutical"); // preserved
    expect(updated?.facts.est_monthly_volume).toBe(5_000_000); // added

    const types = (await listEvents(p.prospect_id)).map((e) => e.type);
    expect(types).toEqual(["identified", "enriched"]);
  });

  it("last-writer-wins on a conflicting fact key", async () => {
    const p = await createProspect({
      legal_name: "Shifty Vertical",
      source_id: "seed",
      facts: { vertical: "unknown" },
    });
    const updated = await enrichProspect(p.prospect_id, { vertical: "cbd" });
    expect(updated?.facts.vertical).toBe("cbd");
  });

  it("enriching a missing prospect returns undefined rather than throwing", async () => {
    expect(await enrichProspect("prs_nope", { vertical: "cbd" })).toBeUndefined();
  });
});

describe("closer-store: events", () => {
  it("assigns monotonically increasing seq — the fold's ordering key", async () => {
    const p = await createProspect({ legal_name: "Seq Co", source_id: "seed" });

    // Deliberately write with timestamps OUT of order. seq must still be
    // monotonic, because deriveState() sorts by seq precisely so that skewed
    // or colliding clocks across ingesters cannot reorder history.
    await appendEvent(p.prospect_id, "contacted", {}, "op", "2026-03-05T00:00:00.000Z");
    await appendEvent(p.prospect_id, "replied", {}, "op", "2026-03-01T00:00:00.000Z");

    const events = await listEvents(p.prospect_id);
    expect(events.map((e) => e.type)).toEqual(["identified", "contacted", "replied"]);
    const seqs = events.map((e) => e.seq);
    expect(seqs[0]!).toBeLessThan(seqs[1]!);
    expect(seqs[1]!).toBeLessThan(seqs[2]!);
    expect(seqs.every((s) => typeof s === "number")).toBe(true); // BIGINT → number
  });

  it("round-trips a payload", async () => {
    const p = await createProspect({ legal_name: "Payload Co", source_id: "seed" });
    await appendEvent(p.prospect_id, "signal", { kind: "processor_terminated", evidence_url: "https://x.example" });

    const sig = (await listEvents(p.prospect_id)).find((e) => e.type === "signal");
    expect(sig?.payload?.kind).toBe("processor_terminated");
    expect(sig?.payload?.evidence_url).toBe("https://x.example");
  });
});

describe("closer-store: loadPipeline", () => {
  it("loads prospects with their events joined, without N+1", async () => {
    const a = await createProspect({ legal_name: "A Co", website: "https://a.example", source_id: "s" });
    const b = await createProspect({ legal_name: "B Co", website: "https://b.example", source_id: "s" });
    await appendEvent(a.prospect_id, "qualified", { reasons: ["high-risk"] });
    await appendEvent(b.prospect_id, "contacted", {});
    await appendEvent(b.prospect_id, "replied", { sentiment: "positive" });

    const { records, truncated } = await loadPipeline();
    expect(truncated).toBe(false);
    expect(records).toHaveLength(2);

    const byId = new Map(records.map((r) => [r.prospect.prospect_id, r]));
    expect(byId.get(a.prospect_id)!.events.map((e) => e.type)).toEqual(["identified", "qualified"]);
    expect(byId.get(b.prospect_id)!.events.map((e) => e.type)).toEqual([
      "identified",
      "contacted",
      "replied",
    ]);
  });

  it("reports truncation rather than silently returning a short funnel", async () => {
    for (let i = 0; i < 3; i++) {
      await createProspect({ legal_name: `Bulk ${i}`, website: `https://bulk${i}.example`, source_id: "s" });
    }
    const { records, truncated } = await loadPipeline(2);
    expect(records).toHaveLength(2);
    // A silently-truncated funnel is a WRONG funnel — the flag is the contract.
    expect(truncated).toBe(true);
  });

  it("returns an empty set cleanly when there are no prospects", async () => {
    const { records, truncated } = await loadPipeline();
    expect(records).toEqual([]);
    expect(truncated).toBe(false);
  });
});
