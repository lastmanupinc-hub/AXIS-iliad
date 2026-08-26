import { describe, it, expect } from "vitest";
import { composePitchDeck, draftDropReason, parseDrafts, selectEvidenceFiles, type ComposeDeck, type ComposeSourceFile } from "./pitch-compose.js";
import type { CompletionFn } from "./living-architecture.js";

// The compose pass exists under the draft-over-ask doctrine (owner directive,
// 2026-08-26): fill owner-input slots with citation-verified inference so a
// user corrects a labeled draft instead of answering a form. These tests are
// the oracle's red-proofs — the whole reason inferred content is allowed on a
// slide is that these can never pass for an invented claim.

const FILES: ComposeSourceFile[] = [
  { path: "README.md", content: "# Acme\n\nAcme validates 3D assets with 38 validation rules before export.\nPlans start at $19/mo for indie developers.\n" },
  { path: "docs/PRICING.md", content: "Indie $19/mo. Studio $59/mo. Enterprise $399/mo.\n" },
];

function deckFixture(): ComposeDeck {
  return {
    project: "Acme",
    slides: [
      { n: 1, title: "Acme", bullets: ['"one-liner"', "Primary language: TypeScript", "OWNER INPUT REQUIRED — the investment thesis."], speaker_notes: "", art: "title", provenance: "mixed", owner_inputs: ["investment_thesis"] },
      { n: 2, title: "The problem", bullets: ["OWNER INPUT REQUIRED — the customer pain.", "OWNER INPUT REQUIRED — how they cope today."], speaker_notes: "", art: "problem", provenance: "owner_input", owner_inputs: ["problem_statement", "current_alternatives"] },
      { n: 3, title: "The solution — measured", bullets: ["Files: 12"], speaker_notes: "", art: "solution", provenance: "measured" },
      { n: 4, title: "Traction — attested, never invented", bullets: ["OWNER INPUT REQUIRED — usage, revenue."], speaker_notes: "", art: "traction", provenance: "mixed", owner_inputs: ["traction_metrics"] },
      { n: 5, title: "Business model", bullets: ["No payment integration detected in the codebase — monetization is not yet wired.", "OWNER INPUT REQUIRED — pricing."], speaker_notes: "", art: "model", provenance: "mixed", owner_inputs: ["pricing_model"] },
      { n: 6, title: "Market — bottom-up only", bullets: ["POLICY — no top-down TAM appears on this deck.", "OWNER INPUT REQUIRED — the bottom-up case."], speaker_notes: "", art: "market", provenance: "owner_input", owner_inputs: ["bottom_up_market"] },
      { n: 7, title: "Team", bullets: ["OWNER INPUT REQUIRED — who builds this."], speaker_notes: "", art: "team", provenance: "owner_input", owner_inputs: ["team"] },
      { n: 8, title: "The honest audit — docs vs. code, gaps included", bullets: ["Test files found: 0"], speaker_notes: "", art: "truth", provenance: "measured" },
      { n: 9, title: "The ask", bullets: ["No tests — a verification harness is the first credible milestone.", "OWNER INPUT REQUIRED — amount, runway."], speaker_notes: "", art: "ask", provenance: "mixed", owner_inputs: ["raise_amount"] },
    ],
  };
}

const draft = (bullet: string, file = "docs/PRICING.md", fact = "Indie $19/mo. Studio $59/mo.") => ({ bullet, file, fact });

/** A completion that answers every question with the same drafts. */
const completionWith = (drafts: unknown[]): CompletionFn => () => Promise.resolve({ text: JSON.stringify(drafts) });

describe("draftDropReason — the citation oracle", () => {
  it("keeps a draft whose cited fact really exists in the cited file", () => {
    expect(draftDropReason(draft("Plans run $19-$399/mo", "docs/PRICING.md", "Indie $19/mo. Studio $59/mo. Enterprise $399/mo."), FILES)).toBeNull();
  });

  it("RED-PROOF: drops a citation to a file not in the snapshot", () => {
    expect(draftDropReason(draft("Anything", "docs/GHOST.md", "whatever"), FILES)).toMatch(/not in snapshot/);
  });

  it("RED-PROOF: drops a fact that does not appear in the cited file", () => {
    expect(draftDropReason(draft("Anything", "README.md", "Revenue reached one million dollars"), FILES)).toMatch(/not found/);
  });

  it("RED-PROOF: drops an invented number — a digit in the bullet absent from both fact and file", () => {
    // "$25/mo" appears nowhere in the evidence; the model made it up.
    expect(draftDropReason(draft("Plans start at $25/mo", "docs/PRICING.md", "Indie $19/mo. Studio $59/mo."), FILES)).toMatch(/number 25/);
  });

  it("accepts a number that appears in the file even when outside the quoted fact", () => {
    // 399 is in PRICING.md though the quoted fact stops at Studio.
    expect(draftDropReason(draft("Top plan is $399/mo", "docs/PRICING.md", "Indie $19/mo. Studio $59/mo."), FILES)).toBeNull();
  });

  it("survives whitespace differences between the quote and the file", () => {
    expect(draftDropReason(draft("38 rules gate export", "README.md", "38   validation rules before export"), FILES)).toBeNull();
  });
});

describe("composePitchDeck — draft-over-ask merge", () => {
  it("replaces OWNER INPUT REQUIRED bullets with verified, [inferred]-tagged drafts and never touches measured bullets", async () => {
    const { deck, report } = await composePitchDeck(deckFixture(), FILES, completionWith([draft("Plans run $19-$399/mo per the pricing doc", "docs/PRICING.md", "Indie $19/mo. Studio $59/mo. Enterprise $399/mo.")]));
    expect(report.configured).toBe(true);
    const model = deck.slides.find((s) => s.n === 5)!;
    expect(model.bullets.some((b) => b.includes("[inferred: docs/PRICING.md]"))).toBe(true);
    expect(model.bullets.some((b) => b.startsWith("OWNER INPUT REQUIRED"))).toBe(false);
    // The measured detection bullet on the same slide survives untouched.
    expect(model.bullets[0]).toContain("No payment integration detected");
    // Untargeted measured slides are byte-identical.
    expect(deck.slides.find((s) => s.n === 3)!.bullets).toEqual(["Files: 12"]);
  });

  it("RED-PROOF: when every draft fails the oracle, the placeholder SURVIVES — a labeled gap beats a fabricated fill", async () => {
    const { deck, report } = await composePitchDeck(deckFixture(), FILES, completionWith([draft("Revenue is $1,000,000", "docs/GHOST.md", "nope")]));
    expect(report.configured).toBe(true);
    expect(report.kept_total).toBe(0);
    expect(report.dropped_total).toBeGreaterThan(0);
    const team = deck.slides.find((s) => s.n === 7)!;
    expect(team.bullets.some((b) => b.startsWith("OWNER INPUT REQUIRED"))).toBe(true);
  });

  it("degrades to the ORIGINAL deck with a labeled reason when no model is configured — nothing invented", async () => {
    const original = deckFixture();
    const notConfigured: CompletionFn = () => Promise.resolve({ _not_configured: true });
    const { deck, report } = await composePitchDeck(original, FILES, notConfigured);
    expect(report.configured).toBe(false);
    expect(report.degraded_reason).toBe("not_configured");
    expect(deck).toBe(original); // the exact same object — untouched
  });

  it("degrades with completion_threw when the model call throws", async () => {
    const thrower: CompletionFn = () => Promise.reject(new Error("boom"));
    const { report } = await composePitchDeck(deckFixture(), FILES, thrower);
    expect(report.configured).toBe(false);
    expect(report.degraded_reason).toBe("completion_threw");
  });

  it("treats unparseable model output as zero drafts for that question, not a crash", async () => {
    const garbage: CompletionFn = () => Promise.resolve({ text: "sorry, as a language model I cannot" });
    const { deck, report } = await composePitchDeck(deckFixture(), FILES, garbage);
    expect(report.configured).toBe(true);
    expect(report.kept_total).toBe(0);
    expect(deck.slides.find((s) => s.n === 2)!.bullets.every((b) => b.startsWith("OWNER INPUT REQUIRED"))).toBe(true);
  });

  it("stamps the composed deck with composed:true and the compose_contract", async () => {
    const { deck } = await composePitchDeck(deckFixture(), FILES, completionWith([draft("Plans run $19/mo", "docs/PRICING.md", "Indie $19/mo.")]));
    expect(deck.composed).toBe(true);
    expect(String(deck.compose_contract)).toContain("citation oracle");
  });
});

describe("parseDrafts / selectEvidenceFiles", () => {
  it("extracts the JSON array from surrounding prose and drops malformed entries", () => {
    const text = 'Here you go:\n[{"bullet":"b","file":"f","fact":"x"},{"bullet":42},{"bullet":"","file":"f","fact":"x"}]\nDone.';
    const out = parseDrafts(text);
    expect(out).toEqual([{ bullet: "b", file: "f", fact: "x" }]);
  });

  it("caps drafts per question", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ bullet: `b${i}`, file: "f", fact: "x" }));
    expect(parseDrafts(JSON.stringify(many)).length).toBe(4);
  });

  it("selects doc-shaped evidence with READMEs first and node_modules excluded", () => {
    const files: ComposeSourceFile[] = [
      { path: "zzz.yaml", content: "a" },
      { path: "node_modules/pkg/README.md", content: "b" },
      { path: "src/index.ts", content: "c" },
      { path: "README.md", content: "d" },
    ];
    const out = selectEvidenceFiles(files);
    expect(out.map((f) => f.path)).toEqual(["README.md", "zzz.yaml"]);
  });
});
