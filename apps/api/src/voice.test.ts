import { describe, it, expect, beforeEach } from "vitest";
import { derivePersonaFromBrand, isVoiceConfigured, synthesizeSpeech, transcribeAudio } from "./voice.js";

beforeEach(() => {
  delete process.env.AXIS_VOICE_ENABLED;
  delete process.env.AXIS_VOICE_MODULE;
});

describe("derivePersonaFromBrand", () => {
  it("defaults to US female af_heart at 1.0 with no tone cues", () => {
    const p = derivePersonaFromBrand("Our brand is a company.");
    expect(p).toMatchObject({ locale: "us", gender: "female", voice: "af_heart", speed: 1.0, tone_tags: [] });
  });

  it("is deterministic", () => {
    expect(derivePersonaFromBrand("energetic and playful brand")).toEqual(derivePersonaFromBrand("energetic and playful brand"));
  });

  it("speeds up for energetic tone, slows for calm", () => {
    expect(derivePersonaFromBrand("an energetic, lively voice").speed).toBeGreaterThan(1.0);
    expect(derivePersonaFromBrand("a calm, soothing tone").speed).toBeLessThan(1.0);
  });

  it("picks British voices for a British brand", () => {
    const p = derivePersonaFromBrand("A British heritage brand from London.");
    expect(p.locale).toBe("gb");
    expect(p.voice.startsWith("b")).toBe(true);
  });

  it("uses a more-neutral voice slot for professional/authoritative tone", () => {
    expect(derivePersonaFromBrand("a professional, authoritative, formal brand").voice).toBe("af_nova");
  });

  it("does NOT match 'formal' inside 'informal' (word-boundary)", () => {
    expect(derivePersonaFromBrand("a casual, informal brand").tone_tags).not.toContain("formal");
  });

  it("honors explicit locale + gender overrides", () => {
    const p = derivePersonaFromBrand("energetic", { locale: "gb", gender: "male" });
    expect(p.locale).toBe("gb");
    expect(p.voice.startsWith("bm_")).toBe(true);
  });

  it("sorts tone_tags and clamps speed to [0.7, 1.3]", () => {
    const p = derivePersonaFromBrand("energetic lively playful upbeat friendly");
    expect(p.speed).toBeLessThanOrEqual(1.3);
    expect([...p.tone_tags]).toEqual([...p.tone_tags].sort());
  });
});

describe("owned TTS/STT gating", () => {
  it("isVoiceConfigured is false by default (operator opt-in)", async () => {
    expect(await isVoiceConfigured()).toBe(false);
  });

  it("synthesize/transcribe return a structured _not_configured envelope when disabled", async () => {
    const s = await synthesizeSpeech("hi", { voice: "af_heart", speed: 1 });
    const t = await transcribeAudio("AAAA");
    expect((s as { _not_configured?: boolean })._not_configured).toBe(true);
    expect((t as { _not_configured?: boolean })._not_configured).toBe(true);
  });
});
