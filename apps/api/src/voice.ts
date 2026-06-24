// ─── E10 Voice engineer layer: persona-from-brand + diarization ──
//
// The deterministic, dependency-free engineer upgrades for AXIS's existing
// owned voice tools (iliad_text_to_speech = Piper, iliad_speech_to_text). No new
// model, no new dep — these compose on top of the audio those tools already do.
//
//   • derivePersonaFromBrand — turns a brand / voice-and-tone artifact into a
//     concrete TTS persona (Piper voice slug + sentence pacing + rationale).
//     Only the generator suite can map a brand artifact to a consistent voice.
//   • diarizeSegments — groups a transcript's segments into speaker TURNS using
//     inter-segment pause gaps. Honest scope: pause-based turn segmentation, not
//     acoustic speaker identification (that needs a Python+GPU model).

export interface VoicePersona {
  voice: string; // Piper voice slug, e.g. "en_US-amy-medium"
  sentence_silence: number; // seconds of pause between sentences
  locale: "us" | "gb";
  gender: "female" | "male";
  tone_tags: string[];
  rationale: string;
}

// Well-known Piper (MIT) voice slugs by locale + gender. The operator must have
// the chosen voice installed (AXIS_PIPER_VOICE_DIR); otherwise synthesis returns
// its usual _not_configured envelope. This only *recommends* a slug.
const VOICE_CATALOG: Record<"us" | "gb", Record<"female" | "male", string[]>> = {
  us: { female: ["en_US-amy-medium", "en_US-kristin-medium", "en_US-lessac-medium"], male: ["en_US-ryan-high", "en_US-joe-medium"] },
  gb: { female: ["en_GB-alba-medium", "en_GB-jenny_dioco-medium"], male: ["en_GB-alan-medium", "en_GB-northern_english_male-medium"] },
};

// Tone descriptor → sentence-pause delta (seconds) + voice-slot bias
// (0 = first/warmest, higher = later/more-neutral voice in the bucket).
const TONE_LEXICON: Record<string, { silence: number; slot: number }> = {
  energetic: { silence: -0.1, slot: 0 },
  lively: { silence: -0.08, slot: 0 },
  playful: { silence: -0.06, slot: 0 },
  upbeat: { silence: -0.06, slot: 0 },
  friendly: { silence: -0.02, slot: 0 },
  warm: { silence: 0.0, slot: 0 },
  conversational: { silence: 0.0, slot: 1 },
  professional: { silence: 0.05, slot: 2 },
  authoritative: { silence: 0.08, slot: 2 },
  formal: { silence: 0.08, slot: 2 },
  calm: { silence: 0.15, slot: 1 },
  soothing: { silence: 0.2, slot: 0 },
  serious: { silence: 0.12, slot: 2 },
  luxurious: { silence: 0.12, slot: 1 },
};

function clampSilence(s: number): number {
  return Math.round(Math.max(0.0, Math.min(1.0, s)) * 100) / 100;
}

/**
 * Derive a deterministic TTS persona from a brand / voice-and-tone artifact.
 * Same input → same persona. Caller may override locale/gender; otherwise both
 * are inferred (defaults: us / female).
 */
export function derivePersonaFromBrand(
  brandText: string,
  opts?: { locale?: "us" | "gb"; gender?: "female" | "male" },
): VoicePersona {
  const text = (brandText ?? "").toLowerCase();

  const locale: "us" | "gb" =
    opts?.locale ?? (/\b(british|uk|en-gb|england|london)\b/.test(text) ? "gb" : "us");
  const gender: "female" | "male" =
    opts?.gender ?? (/\bmale voice\b|\b(masculine|man's)\b/.test(text) ? "male" : "female");

  const tone_tags: string[] = [];
  let silenceDelta = 0;
  let slot = 0;
  for (const tag of Object.keys(TONE_LEXICON).sort()) {
    // Word-boundary match so "informal" doesn't trip "formal". Tags are fixed
    // alphanumerics → regex-safe.
    if (new RegExp(`\\b${tag}\\b`).test(text)) {
      tone_tags.push(tag);
      silenceDelta += TONE_LEXICON[tag].silence;
      slot = Math.max(slot, TONE_LEXICON[tag].slot);
    }
  }

  const bucket = VOICE_CATALOG[locale][gender];
  const voice = bucket[Math.min(slot, bucket.length - 1)];
  const sentence_silence = clampSilence(0.2 + silenceDelta);
  const rationale =
    tone_tags.length > 0
      ? `Matched tone ${tone_tags.join(", ")} → ${locale.toUpperCase()} ${gender} voice "${voice}", ${sentence_silence}s sentence pause.`
      : `No explicit tone cues; default ${locale.toUpperCase()} ${gender} voice "${voice}", ${sentence_silence}s sentence pause.`;

  return { voice, sentence_silence, locale, gender, tone_tags, rationale };
}

// ─── STT diarization (pause-based turn segmentation) ───

export interface DiarSegment {
  start: number;
  end: number;
  text: string;
}

export interface SpeakerTurn {
  speaker: string;
  start: number;
  end: number;
  text: string;
}

/**
 * Group transcript segments into speaker TURNS by inter-segment pause gaps: a
 * silence longer than `gap_seconds` starts a new turn and alternates the speaker
 * label. Deterministic. NOTE: this is pause-based turn segmentation, NOT acoustic
 * speaker identification — it can't tell two speakers apart without a pause, and
 * over-splits a single speaker who pauses. Honest, dependency-free heuristic.
 */
export function diarizeSegments(segments: DiarSegment[], opts?: { gap_seconds?: number; max_speakers?: number }): SpeakerTurn[] {
  const gap = Math.max(0, opts?.gap_seconds ?? 0.75);
  const maxSpeakers = Math.max(1, Math.floor(opts?.max_speakers ?? 2));
  const turns: SpeakerTurn[] = [];
  let speakerIdx = 0;
  let prevEnd: number | null = null;

  for (const seg of segments) {
    const newTurn = prevEnd !== null && seg.start - prevEnd > gap;
    if (newTurn) speakerIdx = (speakerIdx + 1) % maxSpeakers;
    const label = `speaker_${speakerIdx + 1}`;
    const last = turns[turns.length - 1];
    if (last && last.speaker === label && !newTurn) {
      last.end = seg.end;
      last.text = `${last.text} ${seg.text}`.trim();
    } else {
      turns.push({ speaker: label, start: seg.start, end: seg.end, text: seg.text.trim() });
    }
    prevEnd = seg.end;
  }
  return turns;
}
