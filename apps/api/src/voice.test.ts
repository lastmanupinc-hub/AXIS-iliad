import { describe, it, expect } from "vitest";
import { derivePersonaFromBrand, diarizeSegments } from "./voice.js";

describe("derivePersonaFromBrand", () => {
  it("defaults to a US female Piper voice with a 0.2s pause and no tone cues", () => {
    const p = derivePersonaFromBrand("Our brand is a company.");
    expect(p).toMatchObject({ locale: "us", gender: "female", voice: "en_US-amy-medium", sentence_silence: 0.2, tone_tags: [] });
  });

  it("is deterministic", () => {
    expect(derivePersonaFromBrand("energetic playful brand")).toEqual(derivePersonaFromBrand("energetic playful brand"));
  });

  it("shortens pauses for energetic, lengthens for soothing", () => {
    expect(derivePersonaFromBrand("an energetic lively voice").sentence_silence).toBeLessThan(0.2);
    expect(derivePersonaFromBrand("a calm, soothing tone").sentence_silence).toBeGreaterThan(0.2);
  });

  it("picks British voices for a British brand", () => {
    const p = derivePersonaFromBrand("A British heritage brand from London.");
    expect(p.locale).toBe("gb");
    expect(p.voice.startsWith("en_GB-")).toBe(true);
  });

  it("uses a more-neutral voice slot for professional/authoritative tone", () => {
    expect(derivePersonaFromBrand("a professional, authoritative, formal brand").voice).toBe("en_US-lessac-medium");
  });

  it("does NOT match 'formal' inside 'informal' (word-boundary)", () => {
    expect(derivePersonaFromBrand("a casual, informal brand").tone_tags).not.toContain("formal");
  });

  it("honors explicit locale + gender overrides", () => {
    expect(derivePersonaFromBrand("energetic", { locale: "gb", gender: "male" }).voice).toBe("en_GB-alan-medium");
  });

  it("clamps sentence_silence to [0, 1] and sorts tone_tags", () => {
    const p = derivePersonaFromBrand("soothing calm serious authoritative formal professional luxurious");
    expect(p.sentence_silence).toBeLessThanOrEqual(1.0);
    expect([...p.tone_tags]).toEqual([...p.tone_tags].sort());
  });
});

describe("diarizeSegments", () => {
  const seg = (start: number, end: number, text: string) => ({ start, end, text });

  it("merges small-gap segments into one speaker turn", () => {
    const turns = diarizeSegments([seg(0, 1, "hello"), seg(1.1, 2, "there")], { gap_seconds: 0.75 });
    expect(turns.length).toBe(1);
    expect(turns[0]).toMatchObject({ speaker: "speaker_1", text: "hello there", end: 2 });
  });

  it("starts a new alternating turn after a long pause", () => {
    const turns = diarizeSegments([seg(0, 1, "hi"), seg(3, 4, "hey")], { gap_seconds: 0.75 });
    expect(turns.map((t) => t.speaker)).toEqual(["speaker_1", "speaker_2"]);
  });

  it("is deterministic and handles empty input", () => {
    expect(diarizeSegments([])).toEqual([]);
    expect(diarizeSegments([seg(0, 1, "a"), seg(2, 3, "b")])).toEqual(diarizeSegments([seg(0, 1, "a"), seg(2, 3, "b")]));
  });

  it("respects max_speakers", () => {
    const turns = diarizeSegments([seg(0, 1, "a"), seg(3, 4, "b"), seg(6, 7, "c")], { gap_seconds: 0.75, max_speakers: 1 });
    expect(new Set(turns.map((t) => t.speaker))).toEqual(new Set(["speaker_1"]));
  });
});
