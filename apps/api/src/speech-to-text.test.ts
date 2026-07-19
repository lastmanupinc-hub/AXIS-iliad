import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import {
  runTranscription,
  validateTranscriptionOptions,
  isWhisperModelPresent,
  isSttConfigured,
  getWhisperModelPath,
  getWhisperCliPath,
  getWavDurationSeconds,
  resetSpeechToTextForTests,
  type NotConfiguredResult,
  type TranscriptionResult,
} from "./speech-to-text.js";

function isNotConfigured(r: unknown): r is NotConfiguredResult {
  return Boolean(r && typeof r === "object" && (r as { _not_configured?: unknown })._not_configured === true);
}

describe("speech-to-text — path resolution", () => {
  const originalModel = process.env.AXIS_WHISPER_MODEL_PATH;
  const originalCli = process.env.AXIS_WHISPER_CLI_PATH;
  afterEach(() => {
    if (originalModel === undefined) delete process.env.AXIS_WHISPER_MODEL_PATH;
    else process.env.AXIS_WHISPER_MODEL_PATH = originalModel;
    if (originalCli === undefined) delete process.env.AXIS_WHISPER_CLI_PATH;
    else process.env.AXIS_WHISPER_CLI_PATH = originalCli;
  });

  it("model path uses AXIS_WHISPER_MODEL_PATH env var when set", () => {
    process.env.AXIS_WHISPER_MODEL_PATH = "/custom/models/foo.bin";
    expect(getWhisperModelPath()).toBe("/custom/models/foo.bin");
  });

  it("model path defaults to models/ggml-base.en.bin at cwd when unset", () => {
    delete process.env.AXIS_WHISPER_MODEL_PATH;
    const p = getWhisperModelPath();
    expect(p.endsWith(path.join("models", "ggml-base.en.bin"))).toBe(true);
  });

  it("cli path uses AXIS_WHISPER_CLI_PATH env var when set", () => {
    process.env.AXIS_WHISPER_CLI_PATH = "/opt/whisper/whisper-cli";
    expect(getWhisperCliPath()).toBe("/opt/whisper/whisper-cli");
  });

  it("cli path defaults to whisper-cli (platform-suffixed on Windows)", () => {
    delete process.env.AXIS_WHISPER_CLI_PATH;
    const expected = process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli";
    expect(getWhisperCliPath()).toBe(expected);
  });
});

describe("speech-to-text — validateTranscriptionOptions", () => {
  it("accepts a minimal audio_url call", () => {
    expect(() =>
      validateTranscriptionOptions({ audio_url: "https://example.com/audio.mp3" }),
    ).not.toThrow();
  });

  it("accepts a minimal audio_base64 call", () => {
    expect(() => validateTranscriptionOptions({ audio_base64: "aGVsbG8=" })).not.toThrow();
  });

  it("rejects neither audio_url nor audio_base64", () => {
    expect(() => validateTranscriptionOptions({})).toThrow(/exactly one of/);
  });

  it("rejects both audio_url and audio_base64", () => {
    expect(() =>
      validateTranscriptionOptions({
        audio_url: "https://example.com/a.mp3",
        audio_base64: "aGVsbG8=",
      }),
    ).toThrow(/exactly one of/);
  });

  it("rejects non-http audio_url", () => {
    expect(() =>
      validateTranscriptionOptions({ audio_url: "file:///etc/passwd" }),
    ).toThrow(/http\(s\) URL/);
  });

  it("rejects empty language string", () => {
    expect(() =>
      validateTranscriptionOptions({ audio_url: "https://x.com/a.mp3", language: "" }),
    ).toThrow(/language/);
  });

  it("rejects oversized language code", () => {
    expect(() =>
      validateTranscriptionOptions({
        audio_url: "https://x.com/a.mp3",
        language: "en-US-FOO-BAR-QUUX-LONG",
      }),
    ).toThrow(/language code/);
  });

  it("rejects oversized initial_prompt", () => {
    expect(() =>
      validateTranscriptionOptions({
        audio_url: "https://x.com/a.mp3",
        initial_prompt: "x".repeat(513),
      }),
    ).toThrow(/initial_prompt/);
  });

  it("rejects non-boolean word_timestamps", () => {
    expect(() =>
      validateTranscriptionOptions({
        audio_url: "https://x.com/a.mp3",
        word_timestamps: "yes" as unknown as boolean,
      }),
    ).toThrow(/word_timestamps/);
  });
});

describe("speech-to-text — isWhisperModelPresent + isSttConfigured", () => {
  const original = process.env.AXIS_WHISPER_MODEL_PATH;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "axis-stt-mp-"));
    resetSpeechToTextForTests();
  });
  afterEach(async () => {
    if (original === undefined) delete process.env.AXIS_WHISPER_MODEL_PATH;
    else process.env.AXIS_WHISPER_MODEL_PATH = original;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns false when the model file is absent", async () => {
    process.env.AXIS_WHISPER_MODEL_PATH = path.join(tmpDir, "missing.bin");
    expect(await isWhisperModelPresent()).toBe(false);
  });

  it("returns true when the model file exists", async () => {
    const p = path.join(tmpDir, "fake.bin");
    await fs.writeFile(p, "fake-ggml");
    process.env.AXIS_WHISPER_MODEL_PATH = p;
    expect(await isWhisperModelPresent()).toBe(true);
  });

  it("isSttConfigured returns a boolean without throwing in any environment", async () => {
    process.env.AXIS_WHISPER_MODEL_PATH = path.join(tmpDir, "missing.bin");
    const r = await isSttConfigured();
    expect(typeof r).toBe("boolean");
  }, 15_000);
});

// ─── getWavDurationSeconds — H-Phase-A cycle 1 (lite mode's 60s audio cap) ──
//
// Pure header-parsing logic, tested with a hand-built canonical WAV (no
// ffmpeg/whisper needed — this sandbox has no real ffmpeg binary, see the
// audio_url describe block below). Duration = dataChunkSize / byteRate; a
// wrong offset or endianness would silently mis-measure every lite call.
describe("speech-to-text — getWavDurationSeconds", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "axis-stt-wav-"));
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function buildWav(opts: { sampleRate: number; channels: number; bitsPerSample: number; durationSeconds: number }): Buffer {
    const { sampleRate, channels, bitsPerSample, durationSeconds } = opts;
    const byteRate = sampleRate * channels * (bitsPerSample / 8);
    const dataSize = Math.round(byteRate * durationSeconds);
    const buf = Buffer.alloc(44 + dataSize);
    buf.write("RIFF", 0, "ascii");
    buf.writeUInt32LE(36 + dataSize, 4);
    buf.write("WAVE", 8, "ascii");
    buf.write("fmt ", 12, "ascii");
    buf.writeUInt32LE(16, 16); // fmt chunk size
    buf.writeUInt16LE(1, 20); // PCM
    buf.writeUInt16LE(channels, 22);
    buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE(byteRate, 28);
    buf.writeUInt16LE(channels * (bitsPerSample / 8), 32); // block align
    buf.writeUInt16LE(bitsPerSample, 34);
    buf.write("data", 36, "ascii");
    buf.writeUInt32LE(dataSize, 40);
    // Data bytes themselves are irrelevant to duration — left zeroed.
    return buf;
  }

  it("computes duration from a 16kHz mono 16-bit WAV (ffmpeg's resample target format)", async () => {
    const p = path.join(tmpDir, "a.wav");
    await fs.writeFile(p, buildWav({ sampleRate: 16_000, channels: 1, bitsPerSample: 16, durationSeconds: 42 }));
    expect(await getWavDurationSeconds(p)).toBeCloseTo(42, 1);
  });

  it("computes duration correctly for a different sample rate / stereo / 8-bit combo", async () => {
    const p = path.join(tmpDir, "b.wav");
    await fs.writeFile(p, buildWav({ sampleRate: 44_100, channels: 2, bitsPerSample: 8, durationSeconds: 7.5 }));
    expect(await getWavDurationSeconds(p)).toBeCloseTo(7.5, 1);
  });

  it("rejects a file that isn't RIFF/WAVE", async () => {
    const p = path.join(tmpDir, "not-a-wav.bin");
    await fs.writeFile(p, Buffer.from("this is not a wav file at all, just plain bytes"));
    await expect(getWavDurationSeconds(p)).rejects.toThrow(/RIFF\/WAVE/);
  });
});

describe("speech-to-text — runTranscription _not_configured envelopes", () => {
  const original = process.env.AXIS_WHISPER_MODEL_PATH;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "axis-stt-run-"));
    process.env.AXIS_WHISPER_MODEL_PATH = path.join(tmpDir, "missing.bin");
    resetSpeechToTextForTests();
  });
  afterEach(async () => {
    if (original === undefined) delete process.env.AXIS_WHISPER_MODEL_PATH;
    else process.env.AXIS_WHISPER_MODEL_PATH = original;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("validates options BEFORE checking config (validation errors take precedence)", async () => {
    await expect(runTranscription({})).rejects.toThrow(/exactly one of/);
    await expect(
      runTranscription({ audio_url: "https://x.com/a.mp3", language: "" }),
    ).rejects.toThrow(/language/);
  });

  it("returns model_file_not_found envelope when the model is missing", async () => {
    const r = await runTranscription({ audio_url: "https://example.com/audio.mp3" });
    expect(isNotConfigured(r)).toBe(true);
    if (isNotConfigured(r)) {
      expect(r.reason).toBe("model_file_not_found");
      expect(r.category).toBe("not_configured");
      expect(r.detail).toContain("missing.bin");
      expect(r.remediation).toContain("GGML");
    }
  }, 15_000);
});

// ─── audio_url ingestion — unhappy paths (safeFetch / url-guard) ────
//
// downloadAudio() (the audio_url path, via safeFetch in url-guard.ts) had
// no real coverage: the one test that would exercise it is gated behind
// AXIS_RUN_WHISPER_TESTS=1 (off by default, never runs in CI).
//
// To reach downloadAudio at all, runTranscription must first clear three
// operator-config gates (model file present, whisper-cli present, ffmpeg
// present). We fake the first two the same way the block above already
// does (existence-check-only env vars — isWhisperCliAvailable only calls
// fs.access on an absolute AXIS_WHISPER_CLI_PATH, it never executes it
// unless a real transcription is attempted, which none of these tests
// reach). ffmpeg-static has no such env override, so we ensure a file
// exists at the exact path getFfmpegPath() resolves to via `import
// ("ffmpeg-static")` — this sandbox has no network access for that
// package's postinstall binary download, so the real binary is absent;
// we drop a placeholder there (only if nothing is already present, and
// we remove only what we created) so the presence gate passes for real.
describe("speech-to-text — audio_url download failures (safeFetch integration)", () => {
  const AUDIO_URL = "http://93.184.216.34/clip.mp3";
  const originalModel = process.env.AXIS_WHISPER_MODEL_PATH;
  const originalCli = process.env.AXIS_WHISPER_CLI_PATH;
  let tmpDir: string;
  let ffmpegPath: string | null = null;
  let createdFfmpegPlaceholder = false;
  let fetchSpy: ReturnType<typeof vi.spyOn> | undefined;

  async function resolveFfmpegStaticPath(): Promise<string | null> {
    const mod = (await import("ffmpeg-static")) as unknown as string | { default: string | null } | null;
    if (typeof mod === "string") return mod;
    if (mod && typeof (mod as { default?: unknown }).default === "string") {
      return (mod as { default: string }).default;
    }
    return null;
  }

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "axis-stt-dl-"));

    const modelPath = path.join(tmpDir, "fake-model.bin");
    await fs.writeFile(modelPath, "fake-ggml");
    process.env.AXIS_WHISPER_MODEL_PATH = modelPath;

    const cliPath = path.join(tmpDir, "fake-whisper-cli");
    await fs.writeFile(cliPath, "fake-cli — never executed by these tests");
    process.env.AXIS_WHISPER_CLI_PATH = cliPath;

    ffmpegPath = await resolveFfmpegStaticPath();
    if (!ffmpegPath) {
      throw new Error("ffmpeg-static did not resolve to a path in this environment — cannot set up this test block");
    }
    try {
      await fs.access(ffmpegPath);
      createdFfmpegPlaceholder = false; // a real (or prior) binary is already there — don't touch it
    } catch {
      await fs.mkdir(path.dirname(ffmpegPath), { recursive: true });
      await fs.writeFile(ffmpegPath, "test placeholder — not a real ffmpeg binary");
      createdFfmpegPlaceholder = true;
    }
    resetSpeechToTextForTests();
  });

  afterEach(async () => {
    if (originalModel === undefined) delete process.env.AXIS_WHISPER_MODEL_PATH;
    else process.env.AXIS_WHISPER_MODEL_PATH = originalModel;
    if (originalCli === undefined) delete process.env.AXIS_WHISPER_CLI_PATH;
    else process.env.AXIS_WHISPER_CLI_PATH = originalCli;
    if (createdFfmpegPlaceholder && ffmpegPath) {
      await fs.rm(ffmpegPath, { force: true }).catch(() => {});
    }
    resetSpeechToTextForTests();
    fetchSpy?.mockRestore();
    fetchSpy = undefined;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns a clean audio_download_failed envelope when the guard's download timeout fires", async () => {
    // Simulating the abort by rejecting fetch itself (rather than waiting out a real 60s timer)
    // matches this codebase's existing convention for testing abort-driven timeouts (see
    // cashier-paid-wallet.test.ts's `Object.assign(new Error(...), { name: "AbortError" })`).
    fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      Object.assign(new Error("The operation was aborted"), { name: "AbortError" }),
    );
    const r = await runTranscription({ audio_url: AUDIO_URL });
    expect(isNotConfigured(r)).toBe(true);
    if (isNotConfigured(r)) {
      expect(r.reason).toBe("audio_download_failed");
      expect(r.category).toBe("bad_input");
      expect(r.detail).toMatch(/abort/i);
      expect(r.remediation).toMatch(/100 MiB/);
    }
  }, 15_000);

  it("returns a clean audio_download_failed envelope on a transport-level fetch rejection", async () => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("ECONNRESET: connection reset by peer"));
    const r = await runTranscription({ audio_url: AUDIO_URL });
    expect(isNotConfigured(r)).toBe(true);
    if (isNotConfigured(r)) {
      expect(r.reason).toBe("audio_download_failed");
      expect(r.category).toBe("bad_input");
      expect(r.detail).toMatch(/ECONNRESET/);
    }
  }, 15_000);

  it("KNOWN GAP: a 200 response with non-audio bytes is not caught cleanly — runTranscription rejects instead of returning a _not_configured envelope", async () => {
    // downloadAudio has zero content/audio validation — it accepts any 200 response body and
    // writes it to disk verbatim. The failure only surfaces one step later, inside
    // resampleToWav() (ffmpeg), which sits OUTSIDE the try/catch that wraps downloadAudio in
    // runTranscription (only download-phase errors are caught and turned into a clean
    // audio_download_failed envelope). So unlike the two tests above, this rejects the returned
    // promise rather than resolving to a _not_configured result — see the test report for detail.
    const garbage = Buffer.from("this is not an audio file, just plain text bytes");
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(garbage, { status: 200 }));
    await expect(runTranscription({ audio_url: AUDIO_URL })).rejects.toThrow();
  }, 15_000);
});

// ─── Optional live-transcription tests ──────────────────────────
// Only run when AXIS_RUN_WHISPER_TESTS=1 AND both AXIS_WHISPER_MODEL_PATH
// and either AXIS_WHISPER_CLI_PATH or a discoverable whisper-cli are
// configured. CI never sets the env so this whole block is skipped there.

describe("speech-to-text — live transcription (AXIS_RUN_WHISPER_TESTS=1)", () => {
  const shouldRun = process.env.AXIS_RUN_WHISPER_TESTS === "1";

  it.skipIf(!shouldRun)(
    "transcribes a real audio_url end-to-end",
    async () => {
      // Operator-supplied URL; a short public sample like the JFK clip the
      // whisper.cpp repo ships works well. Set via env to keep the test
      // portable.
      const url = process.env.AXIS_TEST_AUDIO_URL;
      if (!url) throw new Error("AXIS_TEST_AUDIO_URL must be set to run this test");
      const r = await runTranscription({ audio_url: url });
      if (isNotConfigured(r)) {
        throw new Error(`expected real transcription, got _not_configured: ${r.reason}: ${r.detail}`);
      }
      const sr = r as TranscriptionResult;
      expect(typeof sr.text).toBe("string");
      expect(sr.text.length).toBeGreaterThan(0);
      expect(Array.isArray(sr.segments)).toBe(true);
      expect(sr.model_used.endsWith(".bin")).toBe(true);
    },
    600_000,
  );
});
