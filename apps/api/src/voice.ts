// ─── E10 Voice: persona-from-brand + owned TTS/STT ──────────────
//
// iliad_voice. The headline is the DETERMINISTIC persona engine: it reads a
// brand / voice-and-tone artifact and derives a concrete voice persona (Kokoro
// voice id + speed + locale/gender + rationale) — only the generator suite can
// turn a brand artifact into a consistent owned voice.
//
// Synthesis (Kokoro TTS) and transcription (Whisper STT) are OWNED + in-process
// via ONNX (Apache/MIT, CPU-runnable) but are an OPERATOR-PROVISIONED capability:
// the model runtime is lazy-imported via a computed specifier and gated behind
// AXIS_VOICE_ENABLED, so it adds zero build/CI weight and returns a structured
// _not_configured envelope until an operator opts in (mirrors how
// iliad_llm_inference gates on the model file). Voice CLONING is intentionally
// out of scope here — it needs a Python+GPU service (see the E10 PR notes).

export interface VoicePersona {
  voice: string;
  speed: number;
  locale: "us" | "gb";
  gender: "female" | "male";
  tone_tags: string[];
  rationale: string;
}

// A subset of Kokoro-82M's (Apache-2.0) voice catalog, by locale + gender.
// af_/am_ = American female/male, bf_/bm_ = British female/male.
const VOICE_CATALOG: Record<"us" | "gb", Record<"female" | "male", string[]>> = {
  us: { female: ["af_heart", "af_bella", "af_nova"], male: ["am_michael", "am_adam"] },
  gb: { female: ["bf_emma", "bf_isabella"], male: ["bm_george", "bm_lewis"] },
};

// Tone descriptors → speaking-rate delta + a voice-slot bias (0 = first/warmest
// voice, higher = later/more-neutral voice in the bucket). Deterministic.
const TONE_LEXICON: Record<string, { speed: number; slot: number }> = {
  energetic: { speed: 0.15, slot: 0 },
  lively: { speed: 0.12, slot: 0 },
  playful: { speed: 0.1, slot: 0 },
  upbeat: { speed: 0.1, slot: 0 },
  friendly: { speed: 0.05, slot: 0 },
  warm: { speed: 0.0, slot: 0 },
  conversational: { speed: 0.0, slot: 1 },
  professional: { speed: -0.02, slot: 2 },
  authoritative: { speed: -0.05, slot: 2 },
  formal: { speed: -0.05, slot: 2 },
  calm: { speed: -0.1, slot: 1 },
  soothing: { speed: -0.15, slot: 0 },
  serious: { speed: -0.1, slot: 2 },
  luxurious: { speed: -0.08, slot: 1 },
};

function clampSpeed(s: number): number {
  return Math.round(Math.max(0.7, Math.min(1.3, s)) * 100) / 100;
}

/**
 * Derive a concrete, deterministic voice persona from a brand / voice-and-tone
 * artifact (free text). Same input → same persona. Caller may override locale
 * and gender; otherwise both are inferred from the text (defaults: us / female).
 */
export function derivePersonaFromBrand(
  brandText: string,
  opts?: { locale?: "us" | "gb"; gender?: "female" | "male" },
): VoicePersona {
  const text = (brandText ?? "").toLowerCase();

  // Locale: explicit override, else infer from British/UK signals.
  const locale: "us" | "gb" =
    opts?.locale ?? (/\b(british|uk|en-gb|england|london)\b/.test(text) ? "gb" : "us");

  // Gender: explicit override, else an explicit "male/masculine voice" signal,
  // else default female (af_heart is Kokoro's warmest default).
  const gender: "female" | "male" =
    opts?.gender ?? (/\b(male|masculine|man's)\b.{0,12}voice|\bmale voice\b/.test(text) ? "male" : "female");

  // Collect matched tone tags (sorted for determinism), sum their speed deltas,
  // and take the max slot bias.
  const tone_tags: string[] = [];
  let speedDelta = 0;
  let slot = 0;
  for (const tag of Object.keys(TONE_LEXICON).sort()) {
    // Word-boundary match so "informal" doesn't match "formal", etc. Tags are
    // fixed alphanumerics, so they're regex-safe.
    if (new RegExp(`\\b${tag}\\b`).test(text)) {
      tone_tags.push(tag);
      speedDelta += TONE_LEXICON[tag].speed;
      slot = Math.max(slot, TONE_LEXICON[tag].slot);
    }
  }

  const bucket = VOICE_CATALOG[locale][gender];
  const voice = bucket[Math.min(slot, bucket.length - 1)];
  const speed = clampSpeed(1.0 + speedDelta);

  const rationale =
    tone_tags.length > 0
      ? `Matched tone ${tone_tags.join(", ")} → ${locale.toUpperCase()} ${gender} voice "${voice}" at ${speed}× rate.`
      : `No explicit tone cues; default ${locale.toUpperCase()} ${gender} voice "${voice}" at ${speed}× rate.`;

  return { voice, speed, locale, gender, tone_tags, rationale };
}

// ─── Owned TTS/STT (operator-provisioned, lazy, gated) ───

export interface VoiceNotConfigured {
  _not_configured: true;
  tool: "iliad_voice";
  message: string;
  required_env: string[];
  capability_map_reference: string;
}

export function voiceNotConfigured(detail: string): VoiceNotConfigured {
  return {
    _not_configured: true,
    tool: "iliad_voice",
    message: `Owned voice synthesis/transcription is not provisioned on this AXIS instance. ${detail}`,
    required_env: ["AXIS_VOICE_ENABLED"],
    capability_map_reference: ".ai/capability-map.yaml",
  };
}

/** Computed specifier so tsc/the bundler never hard-requires the heavy runtime. */
function voiceModuleSpecifier(): string {
  return process.env.AXIS_VOICE_MODULE ?? ["@huggingface", "transformers"].join("/");
}

/** True only when an operator has opted in AND the ONNX runtime is importable. */
export async function isVoiceConfigured(): Promise<boolean> {
  if (process.env.AXIS_VOICE_ENABLED !== "1" && process.env.AXIS_VOICE_ENABLED !== "true") return false;
  try {
    await import(/* @vite-ignore */ voiceModuleSpecifier());
    return true;
  } catch {
    return false;
  }
}

export interface SynthesisResult {
  audio_base64: string;
  sample_rate: number;
  format: "wav";
  voice: string;
  speed: number;
}

/**
 * Synthesize speech with Kokoro for the given persona. Gated: returns
 * _not_configured unless the operator enabled the runtime. The model runtime is
 * loaded lazily; this path is exercised in provisioned environments only (no
 * model is bundled or fetched in CI), matching the LLM/sandbox tools.
 */
export async function synthesizeSpeech(
  text: string,
  persona: Pick<VoicePersona, "voice" | "speed">,
): Promise<SynthesisResult | VoiceNotConfigured> {
  if (!(await isVoiceConfigured())) {
    return voiceNotConfigured("Set AXIS_VOICE_ENABLED=1 and install the ONNX voice runtime to enable Kokoro TTS.");
  }
  const mod = (await import(/* @vite-ignore */ voiceModuleSpecifier())) as {
    KokoroTTS?: { from_pretrained: (id: string) => Promise<{ generate: (t: string, o: { voice: string; speed: number }) => Promise<{ toWav: () => ArrayBuffer; sampling_rate?: number }> }> };
  };
  if (!mod.KokoroTTS) return voiceNotConfigured("The installed voice runtime does not expose a Kokoro TTS pipeline.");
  const tts = await mod.KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX");
  const audio = await tts.generate(text, { voice: persona.voice, speed: persona.speed });
  return {
    audio_base64: Buffer.from(audio.toWav()).toString("base64"),
    sample_rate: audio.sampling_rate ?? 24000,
    format: "wav",
    voice: persona.voice,
    speed: persona.speed,
  };
}

export interface TranscriptionResult {
  text: string;
  language: string | null;
}

/** Transcribe audio with Whisper. Gated identically to synthesizeSpeech. */
export async function transcribeAudio(audioBase64: string): Promise<TranscriptionResult | VoiceNotConfigured> {
  if (!(await isVoiceConfigured())) {
    return voiceNotConfigured("Set AXIS_VOICE_ENABLED=1 and install the ONNX voice runtime to enable Whisper STT.");
  }
  const mod = (await import(/* @vite-ignore */ voiceModuleSpecifier())) as {
    pipeline?: (task: string, model: string) => Promise<(input: Float32Array | string) => Promise<{ text: string }>>;
  };
  if (!mod.pipeline) return voiceNotConfigured("The installed voice runtime does not expose a transcription pipeline.");
  const asr = await mod.pipeline("automatic-speech-recognition", "onnx-community/whisper-base");
  const out = await asr(`data:audio/wav;base64,${audioBase64}`);
  return { text: out.text, language: null };
}
