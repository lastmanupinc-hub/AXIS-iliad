import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
      expect(r.detail).toContain("missing.bin");
      expect(r.remediation).toContain("GGML");
    }
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
