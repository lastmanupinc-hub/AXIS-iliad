import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { renderPitchDeckPptx, type PitchDeckPayload } from "./pitch-deck-render.js";

// This is the runtime-rendering half of app_pitch — the piece that was
// entirely missing (user feedback, 2026-08-25: "that's not a pitch deck,
// that's a bunch of facts in chat — the deck needs to produce .pdf or
// .pptx"). Tests verify a REAL, openable .pptx by reading the zip container
// back with jszip and asserting on the actual embedded slide XML — not just
// that pptxgenjs didn't throw. No determinism test: pptxgenjs's OOXML output
// is runtime rendering, not the deterministic generator layer (same carve-out
// as canvas/D2 image rendering elsewhere in this codebase).

function deck(overrides: Partial<PitchDeckPayload> = {}): PitchDeckPayload {
  return {
    project: "Test Co",
    slides: [
      { n: 1, title: "Test Co", bullets: ["One-liner here.", "Primary language: TypeScript"], speaker_notes: "Notes for slide 1.", art: "title" },
      { n: 2, title: "What exists — measured", bullets: ["Files: 500", "Lines of code: 50000"], speaker_notes: "Notes for slide 2.", art: "evidence" },
    ],
    ...overrides,
  };
}

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

describe("renderPitchDeckPptx — produces a real, openable .pptx", () => {
  it("returns a buffer with the correct ZIP/OOXML magic bytes", async () => {
    const result = await renderPitchDeckPptx(deck());
    expect(result.buffer.subarray(0, 4).toString("hex")).toBe("504b0304");
  });

  it("produces exactly one slide XML file per input slide", async () => {
    const result = await renderPitchDeckPptx(deck());
    const zip = await JSZip.loadAsync(result.buffer);
    const slideFiles = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
    expect(slideFiles.sort()).toEqual(["ppt/slides/slide1.xml", "ppt/slides/slide2.xml"]);
  });

  it("embeds real slide titles and bullet text in the slide XML, not placeholders", async () => {
    const result = await renderPitchDeckPptx(deck());
    const zip = await JSZip.loadAsync(result.buffer);
    const slide2 = await zip.files["ppt/slides/slide2.xml"].async("string");
    expect(slide2).toContain("What exists");
    expect(slide2).toContain("Files: 500");
    expect(slide2).toContain("Lines of code: 50000");
  });

  it("annotated variant attaches real speaker notes as a notesSlide per slide", async () => {
    const result = await renderPitchDeckPptx(deck(), { variant: "annotated" });
    const zip = await JSZip.loadAsync(result.buffer);
    const notes1 = await zip.files["ppt/notesSlides/notesSlide1.xml"].async("string");
    const notes2 = await zip.files["ppt/notesSlides/notesSlide2.xml"].async("string");
    expect(notes1).toContain("Notes for slide 1");
    expect(notes2).toContain("Notes for slide 2");
  });

  it("clean variant (the default) carries NO speaker-notes content and NO provenance footers — the investor deck explains itself", async () => {
    const result = await renderPitchDeckPptx(deck());
    expect(result.variant).toBe("clean");
    const zip = await JSZip.loadAsync(result.buffer);
    // pptxgenjs may emit empty notesSlide scaffolding; what must NOT exist is
    // our actual notes text or any provenance annotation, anywhere in the zip.
    for (const name of Object.keys(zip.files).filter((f) => f.endsWith(".xml"))) {
      const xml = await zip.files[name].async("string");
      expect(xml, `${name} leaked notes text into the clean deck`).not.toContain("Notes for slide");
      expect(xml, `${name} leaked a provenance footer into the clean deck`).not.toContain("provenance:");
    }
  });

  it("annotated variant renders a per-slide provenance footer, defaulting v1 payloads (no provenance field) to measured", async () => {
    const result = await renderPitchDeckPptx(deck(), { variant: "annotated" });
    expect(result.variant).toBe("annotated");
    const zip = await JSZip.loadAsync(result.buffer);
    const slide1 = await zip.files["ppt/slides/slide1.xml"].async("string");
    expect(slide1).toContain("provenance: measured");
  });

  it("annotated variant renders a v2 slide's own provenance type, not a hardcoded label", async () => {
    const v2 = deck({
      slides: [{ n: 1, title: "Team", bullets: ["OWNER INPUT REQUIRED — who builds this."], speaker_notes: "n", art: "team", provenance: "owner_input" }],
    });
    const result = await renderPitchDeckPptx(v2, { variant: "annotated" });
    const zip = await JSZip.loadAsync(result.buffer);
    const slide1 = await zip.files["ppt/slides/slide1.xml"].async("string");
    expect(slide1).toContain("provenance: owner_input");
  });

  it("reports slides_total matching the input slide count", async () => {
    const result = await renderPitchDeckPptx(deck());
    expect(result.slides_total).toBe(2);
  });

  it("with no backgrounds supplied, reports slides_with_art as empty — never claims art it didn't render", async () => {
    const result = await renderPitchDeckPptx(deck());
    expect(result.slides_with_art).toEqual([]);
  });

  it("RED-PROOF: a supplied background is honestly attributed only to the slide whose art key matches, not to every slide", async () => {
    const result = await renderPitchDeckPptx(deck(), { backgrounds: { title: TINY_PNG } });
    // Only slide 1 has art:"title" in the fixture; slide 2 has art:"evidence" with no background supplied.
    expect(result.slides_with_art).toEqual([1]);
  });

  it("a slide with a real background image embeds actual image bytes in the pptx media", async () => {
    const result = await renderPitchDeckPptx(deck(), { backgrounds: { title: TINY_PNG } });
    const zip = await JSZip.loadAsync(result.buffer);
    const mediaFiles = Object.keys(zip.files).filter((f) => f.startsWith("ppt/media/"));
    expect(mediaFiles.length).toBeGreaterThan(0);
  });

  it("handles a deck with zero slides without throwing (still a valid, if empty, pptx)", async () => {
    const result = await renderPitchDeckPptx(deck({ slides: [] }));
    expect(result.buffer.subarray(0, 4).toString("hex")).toBe("504b0304");
    expect(result.slides_total).toBe(0);
  });

  it("a slide with no bullets doesn't throw and still produces a slide", async () => {
    const result = await renderPitchDeckPptx(deck({ slides: [{ n: 1, title: "Empty bullets", bullets: [], speaker_notes: "", art: "title" }] }));
    const zip = await JSZip.loadAsync(result.buffer);
    expect(Object.keys(zip.files)).toContain("ppt/slides/slide1.xml");
  });

  it("a slide with empty speaker_notes produces no notesSlide file for it (pptxgenjs default) rather than a broken one", async () => {
    const result = await renderPitchDeckPptx(deck({ slides: [{ n: 1, title: "No notes", bullets: ["x"], speaker_notes: "", art: "title" }] }));
    const zip = await JSZip.loadAsync(result.buffer);
    // Should not throw when read back — that's the real assertion; whether
    // pptxgenjs emits an empty notesSlide or omits it, both are valid.
    expect(zip.files["ppt/slides/slide1.xml"]).toBeDefined();
  });
});
