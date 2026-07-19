import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import {
  runSynthesis,
  validateSynthesisOptions,
  isPiperCliAvailable,
  listAvailableVoices,
  isTtsConfigured,
  getPiperCliPath,
  getPiperVoiceDir,
  resetTextToSpeechForTests,
  type NotConfiguredResult,
  type SynthesisResult,
} from "./text-to-speech.js";

function isNotConfigured(r: unknown): r is NotConfiguredResult {
  return Boolean(r && typeof r === "object" && (r as { _not_configured?: unknown })._not_configured === true);
}

describe("text-to-speech — path resolution", () => {
  const originalCli = process.env.AXIS_PIPER_CLI_PATH;
  const originalDir = process.env.AXIS_PIPER_VOICE_DIR;
  afterEach(() => {
    if (originalCli === undefined) delete process.env.AXIS_PIPER_CLI_PATH;
    else process.env.AXIS_PIPER_CLI_PATH = originalCli;
    if (originalDir === undefined) delete process.env.AXIS_PIPER_VOICE_DIR;
    else process.env.AXIS_PIPER_VOICE_DIR = originalDir;
  });

  it("cli path uses AXIS_PIPER_CLI_PATH env var when set", () => {
    process.env.AXIS_PIPER_CLI_PATH = "/opt/piper/piper";
    expect(getPiperCliPath()).toBe("/opt/piper/piper");
  });

  it("cli path defaults to piper (platform-suffixed on Windows)", () => {
    delete process.env.AXIS_PIPER_CLI_PATH;
    const expected = process.platform === "win32" ? "piper.exe" : "piper";
    expect(getPiperCliPath()).toBe(expected);
  });

  it("voice dir uses AXIS_PIPER_VOICE_DIR env var when set", () => {
    process.env.AXIS_PIPER_VOICE_DIR = "/custom/voices";
    expect(getPiperVoiceDir()).toBe("/custom/voices");
  });

  it("voice dir defaults to models/piper at cwd when unset", () => {
    delete process.env.AXIS_PIPER_VOICE_DIR;
    expect(getPiperVoiceDir().endsWith(path.join("models", "piper"))).toBe(true);
  });
});

describe("text-to-speech — validateSynthesisOptions", () => {
  it("accepts a minimal valid call", () => {
    expect(() => validateSynthesisOptions({ text: "hello world" })).not.toThrow();
  });

  it("accepts all optional fields with valid values", () => {
    expect(() =>
      validateSynthesisOptions({
        text: "hello",
        voice: "en_US-amy-medium",
        format: "mp3",
        sentence_silence: 0.5,
      }),
    ).not.toThrow();
  });

  it("rejects non-string text", () => {
    expect(() =>
      validateSynthesisOptions({ text: 42 as unknown as string }),
    ).toThrow(/text must be a string/);
  });

  it("rejects empty/whitespace-only text", () => {
    expect(() => validateSynthesisOptions({ text: "" })).toThrow(/empty/);
    expect(() => validateSynthesisOptions({ text: "   " })).toThrow(/empty/);
  });

  it("rejects text over 5000 chars", () => {
    expect(() => validateSynthesisOptions({ text: "x".repeat(5001) })).toThrow(/5000/);
  });

  it("rejects voice slug containing path traversal", () => {
    expect(() => validateSynthesisOptions({ text: "x", voice: "../etc" })).toThrow(/voice slug/);
    expect(() => validateSynthesisOptions({ text: "x", voice: "a/b" })).toThrow(/voice slug/);
    expect(() => validateSynthesisOptions({ text: "x", voice: "a\\b" })).toThrow(/voice slug/);
  });

  it("rejects empty voice slug", () => {
    expect(() => validateSynthesisOptions({ text: "x", voice: "" })).toThrow(/voice must be a non-empty/);
  });

  it("rejects oversized voice slug", () => {
    expect(() => validateSynthesisOptions({ text: "x", voice: "x".repeat(201) })).toThrow(/voice slug too long/);
  });

  it("rejects unknown format", () => {
    expect(() =>
      validateSynthesisOptions({ text: "x", format: "flac" as unknown as "wav" }),
    ).toThrow(/format must be one of/);
  });

  it("rejects sentence_silence outside [0, 5]", () => {
    expect(() => validateSynthesisOptions({ text: "x", sentence_silence: -0.1 })).toThrow(/sentence_silence/);
    expect(() => validateSynthesisOptions({ text: "x", sentence_silence: 6 })).toThrow(/sentence_silence/);
  });
});

describe("text-to-speech — listAvailableVoices + isTtsConfigured", () => {
  const originalDir = process.env.AXIS_PIPER_VOICE_DIR;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "axis-tts-lv-"));
    resetTextToSpeechForTests();
  });
  afterEach(async () => {
    if (originalDir === undefined) delete process.env.AXIS_PIPER_VOICE_DIR;
    else process.env.AXIS_PIPER_VOICE_DIR = originalDir;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns [] when the voice dir does not exist", async () => {
    process.env.AXIS_PIPER_VOICE_DIR = path.join(tmpDir, "missing");
    expect(await listAvailableVoices()).toEqual([]);
  });

  it("returns [] when the voice dir is empty", async () => {
    process.env.AXIS_PIPER_VOICE_DIR = tmpDir;
    expect(await listAvailableVoices()).toEqual([]);
  });

  it("skips .onnx files that lack a paired .onnx.json config", async () => {
    process.env.AXIS_PIPER_VOICE_DIR = tmpDir;
    await fs.writeFile(path.join(tmpDir, "lonely-voice.onnx"), "fake");
    expect(await listAvailableVoices()).toEqual([]);
  });

  it("lists voices that have both .onnx and .onnx.json files, sorted", async () => {
    process.env.AXIS_PIPER_VOICE_DIR = tmpDir;
    for (const slug of ["en_US-amy-medium", "en_GB-alan-low", "en_US-amy-medium"]) {
      await fs.writeFile(path.join(tmpDir, `${slug}.onnx`), "fake");
      await fs.writeFile(path.join(tmpDir, `${slug}.onnx.json`), "{}");
    }
    expect(await listAvailableVoices()).toEqual(["en_GB-alan-low", "en_US-amy-medium"]);
  });

  it("isTtsConfigured returns a boolean without throwing", async () => {
    process.env.AXIS_PIPER_VOICE_DIR = path.join(tmpDir, "missing");
    const r = await isTtsConfigured();
    expect(typeof r).toBe("boolean");
  }, 15_000);
});

describe("text-to-speech — isPiperCliAvailable", () => {
  beforeEach(() => resetTextToSpeechForTests());

  it("returns a boolean without throwing regardless of piper presence", async () => {
    const r = await isPiperCliAvailable();
    expect(typeof r).toBe("boolean");
  }, 15_000);
});

describe("text-to-speech — runSynthesis _not_configured envelopes", () => {
  const originalCli = process.env.AXIS_PIPER_CLI_PATH;
  const originalDir = process.env.AXIS_PIPER_VOICE_DIR;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "axis-tts-run-"));
    // Force piper-cli to look like an absolute path that doesn't exist —
    // bypass PATH lookup entirely so tests are deterministic.
    process.env.AXIS_PIPER_CLI_PATH = path.join(tmpDir, "definitely-not-piper");
    process.env.AXIS_PIPER_VOICE_DIR = path.join(tmpDir, "voices");
    resetTextToSpeechForTests();
  });
  afterEach(async () => {
    if (originalCli === undefined) delete process.env.AXIS_PIPER_CLI_PATH;
    else process.env.AXIS_PIPER_CLI_PATH = originalCli;
    if (originalDir === undefined) delete process.env.AXIS_PIPER_VOICE_DIR;
    else process.env.AXIS_PIPER_VOICE_DIR = originalDir;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("validates options BEFORE checking config (validation errors take precedence)", async () => {
    await expect(runSynthesis({ text: "" })).rejects.toThrow(/empty/);
    await expect(runSynthesis({ text: "x", voice: "../bad" })).rejects.toThrow(/voice slug/);
  });

  it("returns piper_cli_not_found envelope when CLI is absent", async () => {
    const r = await runSynthesis({ text: "hello world" });
    expect(isNotConfigured(r)).toBe(true);
    if (isNotConfigured(r)) {
      expect(r.reason).toBe("piper_cli_not_found");
      expect(r.category).toBe("not_configured");
      expect(r.detail).toContain("definitely-not-piper");
      expect(r.remediation).toContain("Piper");
    }
  }, 15_000);
});

describe("text-to-speech — voice-dir + voice-missing envelopes", () => {
  // These tests need piper-cli to "appear available" so the dispatch
  // reaches the voice-dir / voice-pick branches. We use a fake CLI
  // path pointing at a real file (any existing file works for the
  // path.isAbsolute() existence check).
  const originalCli = process.env.AXIS_PIPER_CLI_PATH;
  const originalDir = process.env.AXIS_PIPER_VOICE_DIR;
  let tmpDir: string;
  let fakeCli: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "axis-tts-voice-"));
    fakeCli = path.join(tmpDir, "fake-piper");
    await fs.writeFile(fakeCli, "");
    process.env.AXIS_PIPER_CLI_PATH = fakeCli;
    resetTextToSpeechForTests();
  });
  afterEach(async () => {
    if (originalCli === undefined) delete process.env.AXIS_PIPER_CLI_PATH;
    else process.env.AXIS_PIPER_CLI_PATH = originalCli;
    if (originalDir === undefined) delete process.env.AXIS_PIPER_VOICE_DIR;
    else process.env.AXIS_PIPER_VOICE_DIR = originalDir;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns voice_dir_missing when AXIS_PIPER_VOICE_DIR does not exist", async () => {
    process.env.AXIS_PIPER_VOICE_DIR = path.join(tmpDir, "no-such-dir");
    const r = await runSynthesis({ text: "hello" });
    expect(isNotConfigured(r)).toBe(true);
    if (isNotConfigured(r)) {
      expect(r.reason).toBe("voice_dir_missing");
      expect(r.category).toBe("not_configured");
    }
  });

  it("returns no_voices_available when the dir is empty", async () => {
    const voiceDir = path.join(tmpDir, "voices-empty");
    await fs.mkdir(voiceDir);
    process.env.AXIS_PIPER_VOICE_DIR = voiceDir;
    const r = await runSynthesis({ text: "hello" });
    expect(isNotConfigured(r)).toBe(true);
    if (isNotConfigured(r)) {
      expect(r.reason).toBe("no_voices_available");
      expect(r.category).toBe("not_configured");
    }
  });

  it("returns voice_model_not_found (category bad_input — other voices ARE available) when requested slug isn't present", async () => {
    const voiceDir = path.join(tmpDir, "voices-some");
    await fs.mkdir(voiceDir);
    await fs.writeFile(path.join(voiceDir, "en_US-amy-medium.onnx"), "fake");
    await fs.writeFile(path.join(voiceDir, "en_US-amy-medium.onnx.json"), "{}");
    process.env.AXIS_PIPER_VOICE_DIR = voiceDir;
    const r = await runSynthesis({ text: "hello", voice: "does-not-exist" });
    expect(isNotConfigured(r)).toBe(true);
    if (isNotConfigured(r)) {
      expect(r.reason).toBe("voice_model_not_found");
      expect(r.category).toBe("bad_input");
      expect(r.detail).toContain("does-not-exist");
      expect(r.detail).toContain("en_US-amy-medium");
    }
  });
});

// ─── Optional live-synthesis tests ──────────────────────────────
// Only runs when AXIS_RUN_PIPER_TESTS=1 AND a real piper binary +
// voice files are available. CI never sets the env so this whole
// block is skipped there.

describe("text-to-speech — live piper (AXIS_RUN_PIPER_TESTS=1)", () => {
  const shouldRun = process.env.AXIS_RUN_PIPER_TESTS === "1";

  it.skipIf(!shouldRun)("synthesizes real audio end-to-end", async () => {
    const r = await runSynthesis({ text: "AXIS Iliad text to speech is online." });
    if (isNotConfigured(r)) {
      throw new Error(`expected real synthesis, got _not_configured: ${r.reason}: ${r.detail}`);
    }
    const sr = r as SynthesisResult;
    expect(sr.format).toBe("wav");
    expect(sr.byte_size).toBeGreaterThan(0);
    expect(sr.audio_base64.length).toBeGreaterThan(0);
    expect(sr.sample_rate).toBeGreaterThan(0);
    expect(sr.duration_seconds).toBeGreaterThan(0);
  }, 300_000);
});
