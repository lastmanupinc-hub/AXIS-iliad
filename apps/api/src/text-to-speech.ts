// ─── iliad_text_to_speech — AXIS-owned voice synthesis ──────────
//
// AXIS-owned implementation built on Piper (rhasspy/piper) via
// shell-out to the `piper` CLI binary the operator installs +
// ffmpeg-static for optional WAV → MP3/Opus transcoding. No
// third-party API, no per-character provider fee. Real owned
// implementation.
//
// Why shell-out over a Node binding? Piper has no first-party
// Node binding and the community wrappers are either stale or
// require building from source. Shell-out keeps the npm install
// lean and pushes the runtime to operator setup, where it
// belongs.
//
// Operator setup:
//   1. Install Piper so the `piper` (or `piper.exe`) binary is on
//      PATH, or set AXIS_PIPER_CLI_PATH to an absolute path. See
//      https://github.com/rhasspy/piper/releases for prebuilt
//      binaries (Win/Mac/Linux, x64/arm64).
//   2. Download one or more voice models (each = a .onnx file plus
//      a sibling .onnx.json config). Place them in models/piper/
//      under the process cwd, or set AXIS_PIPER_VOICE_DIR to the
//      directory. Voice slug is the filename without extension —
//      e.g. en_US-amy-medium.onnx → "en_US-amy-medium". Browse
//      voices at https://huggingface.co/rhasspy/piper-voices.
//   3. (Optional) AXIS_PIPER_DEFAULT_VOICE picks the voice used
//      when the caller omits `voice`; otherwise we use whichever
//      voice .onnx file sorts first in the directory.
// When any prerequisite is missing the tool returns a structured
// _not_configured envelope with remediation steps — no crash.

import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

export type AudioFormat = "wav" | "mp3" | "opus";

export interface SynthesisOptions {
  /** Text to synthesize. Required, 1-5000 chars after trim. */
  text: string;
  /** Voice slug (filename without extension). Defaults to AXIS_PIPER_DEFAULT_VOICE or auto-discovered. */
  voice?: string;
  /** Output format. Defaults "wav". mp3 and opus require ffmpeg-static. */
  format?: AudioFormat;
  /** Per-sentence silence in seconds. Defaults 0.2. */
  sentence_silence?: number;
}

export interface SynthesisResult {
  audio_base64: string;
  format: AudioFormat;
  voice_used: string;
  sample_rate: number;
  duration_seconds: number;
  byte_size: number;
}

export interface NotConfiguredResult {
  _not_configured: true;
  reason:
    | "piper_cli_not_found"
    | "voice_dir_missing"
    | "no_voices_available"
    | "voice_model_not_found"
    | "voice_config_not_found"
    | "ffmpeg_static_missing"
    | "synthesis_failed";
  detail: string;
  remediation: string;
}

const MAX_TEXT_CHARS = 5000;
const PIPER_TIMEOUT_MS = 5 * 60_000;
const FFMPEG_TIMEOUT_MS = 60_000;
const DEFAULT_SENTENCE_SILENCE = 0.2;
const FALLBACK_SAMPLE_RATE = 22_050;

function resolveCliPath(): string {
  const env = process.env.AXIS_PIPER_CLI_PATH;
  if (env && env.length > 0) return env;
  return process.platform === "win32" ? "piper.exe" : "piper";
}

function resolveVoiceDir(): string {
  const env = process.env.AXIS_PIPER_VOICE_DIR;
  if (env && env.length > 0) return env;
  return path.join(process.cwd(), "models", "piper");
}

function resolveDefaultVoice(): string | undefined {
  const env = process.env.AXIS_PIPER_DEFAULT_VOICE;
  if (env && env.length > 0) return env;
  return undefined;
}

// ─── Lazy ffmpeg-static (only needed for mp3/opus) ──────────────

let _ffmpegPath: string | null = null;
let _ffmpegLookupDone = false;

async function getFfmpegPath(): Promise<string | null> {
  if (_ffmpegLookupDone) return _ffmpegPath;
  _ffmpegLookupDone = true;
  try {
    const mod = (await import("ffmpeg-static")) as unknown as
      | string
      | { default: string | null }
      | null;
    let p: string | null = null;
    if (typeof mod === "string") p = mod;
    else if (mod && typeof (mod as { default: unknown }).default === "string") {
      p = (mod as { default: string }).default;
    }
    if (p) {
      try {
        await fs.access(p);
        _ffmpegPath = p;
      } catch {
        _ffmpegPath = null;
      }
    }
  } catch {
    _ffmpegPath = null;
  }
  return _ffmpegPath;
}

/** Test-only helper. Clears cached ffmpeg lookup. */
export function resetTextToSpeechForTests(): void {
  _ffmpegPath = null;
  _ffmpegLookupDone = false;
}

// ─── Configuration probes ───────────────────────────────────────

export async function isPiperCliAvailable(): Promise<boolean> {
  const cli = resolveCliPath();
  if (path.isAbsolute(cli)) {
    try {
      await fs.access(cli);
      return true;
    } catch {
      return false;
    }
  }
  return new Promise((resolve) => {
    const child = spawn(cli, ["--help"], { stdio: "ignore", shell: false });
    let resolved = false;
    const finish = (ok: boolean) => {
      if (resolved) return;
      resolved = true;
      resolve(ok);
    };
    child.on("error", () => finish(false));
    child.on("exit", (code) => finish(code === 0 || code === 1));
    setTimeout(() => {
      try { child.kill(); } catch {}
      finish(false);
    }, 3000);
  });
}

export async function listAvailableVoices(): Promise<string[]> {
  const dir = resolveVoiceDir();
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const onnx = entries
    .filter((f) => f.endsWith(".onnx"))
    .map((f) => f.slice(0, -".onnx".length))
    .sort();
  // Only keep voices that also have a paired .onnx.json config; piper needs both.
  const valid: string[] = [];
  for (const slug of onnx) {
    if (entries.includes(`${slug}.onnx.json`)) valid.push(slug);
  }
  return valid;
}

export async function isTtsConfigured(): Promise<boolean> {
  const cli = await isPiperCliAvailable();
  if (!cli) return false;
  const voices = await listAvailableVoices();
  return voices.length > 0;
}

export function getPiperCliPath(): string {
  return resolveCliPath();
}

export function getPiperVoiceDir(): string {
  return resolveVoiceDir();
}

// ─── Validation ─────────────────────────────────────────────────

export function validateSynthesisOptions(opts: SynthesisOptions): void {
  if (!opts || typeof opts !== "object") {
    throw new Error("runSynthesis: options object required");
  }
  if (typeof opts.text !== "string") {
    throw new Error("runSynthesis: text must be a string");
  }
  const trimmed = opts.text.trim();
  if (trimmed.length === 0) {
    throw new Error("runSynthesis: text must not be empty after trim");
  }
  if (opts.text.length > MAX_TEXT_CHARS) {
    throw new Error(`runSynthesis: text exceeds ${MAX_TEXT_CHARS} chars`);
  }
  if (opts.voice !== undefined) {
    if (typeof opts.voice !== "string" || opts.voice.length === 0) {
      throw new Error("runSynthesis: voice must be a non-empty string when provided");
    }
    // Defence in depth: voice slug becomes part of a file path. Reject
    // traversal and path-separator chars so a caller can't escape the
    // configured voice directory.
    if (opts.voice.includes("..") || opts.voice.includes("/") || opts.voice.includes("\\")) {
      throw new Error("runSynthesis: voice slug must not contain '..', '/', or '\\'");
    }
    if (opts.voice.length > 200) {
      throw new Error("runSynthesis: voice slug too long");
    }
  }
  if (opts.format !== undefined && opts.format !== "wav" && opts.format !== "mp3" && opts.format !== "opus") {
    throw new Error("runSynthesis: format must be one of wav, mp3, opus");
  }
  if (opts.sentence_silence !== undefined) {
    if (!Number.isFinite(opts.sentence_silence) || opts.sentence_silence < 0 || opts.sentence_silence > 5) {
      throw new Error("runSynthesis: sentence_silence must be in [0, 5]");
    }
  }
}

// ─── piper invocation ───────────────────────────────────────────

async function runPiperCli(
  cli: string,
  modelPath: string,
  outputPath: string,
  text: string,
  sentenceSilence: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      cli,
      [
        "--model", modelPath,
        "--output_file", outputPath,
        "--sentence_silence", String(sentenceSilence),
      ],
      { stdio: ["pipe", "ignore", "pipe"], shell: false },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 65536) stderr = stderr.slice(-65536);
    });
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
      reject(new Error(`piper exceeded ${PIPER_TIMEOUT_MS}ms wall-clock`));
    }, PIPER_TIMEOUT_MS);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`piper spawn failed: ${err.message}`));
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`piper exited ${code}: ${stderr.trim().slice(0, 500)}`));
    });
    child.stdin.write(text);
    child.stdin.end();
  });
}

async function transcodeWav(
  ffmpegBin: string,
  wavPath: string,
  outPath: string,
  format: AudioFormat,
): Promise<void> {
  const args =
    format === "mp3"
      ? ["-y", "-i", wavPath, "-codec:a", "libmp3lame", "-qscale:a", "4", outPath]
      : ["-y", "-i", wavPath, "-codec:a", "libopus", "-b:a", "48k", outPath];
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegBin, args, { stdio: ["ignore", "ignore", "pipe"], shell: false });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 32768) stderr = stderr.slice(-32768);
    });
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
      reject(new Error(`ffmpeg exceeded ${FFMPEG_TIMEOUT_MS}ms wall-clock`));
    }, FFMPEG_TIMEOUT_MS);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`ffmpeg spawn failed: ${err.message}`));
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.trim().slice(0, 300)}`));
    });
  });
}

// ─── WAV header parsing (sample rate + duration) ────────────────
//
// Piper emits standard 16-bit PCM WAV. The RIFF header is fixed at
// 44 bytes for that format, with sample rate at offset 24 (LE u32)
// and the data chunk's bytes-per-sample × channels at offset 28.

function readWavMetadata(buf: Buffer): { sampleRate: number; durationSeconds: number } {
  if (buf.byteLength < 44 || buf.subarray(0, 4).toString("ascii") !== "RIFF") {
    return { sampleRate: FALLBACK_SAMPLE_RATE, durationSeconds: 0 };
  }
  const sampleRate = buf.readUInt32LE(24);
  const byteRate = buf.readUInt32LE(28);
  // data chunk size lives after the "data" marker. For a fixed 44-byte
  // header this is at offset 40; for files with extra chunks (LIST
  // metadata, etc.) we scan.
  let dataSize = 0;
  if (buf.subarray(36, 40).toString("ascii") === "data") {
    dataSize = buf.readUInt32LE(40);
  } else {
    // Scan for the "data" chunk header.
    for (let i = 12; i < Math.min(buf.byteLength - 8, 4096); i++) {
      if (buf.subarray(i, i + 4).toString("ascii") === "data") {
        dataSize = buf.readUInt32LE(i + 4);
        break;
      }
    }
  }
  const durationSeconds = byteRate > 0 ? dataSize / byteRate : 0;
  return { sampleRate, durationSeconds };
}

// ─── Public entrypoint ──────────────────────────────────────────

async function pickVoice(requested: string | undefined): Promise<string | NotConfiguredResult> {
  const voices = await listAvailableVoices();
  if (voices.length === 0) {
    return {
      _not_configured: true,
      reason: "no_voices_available",
      detail: `${resolveVoiceDir()} contains no paired .onnx + .onnx.json voice files`,
      remediation:
        "Download a Piper voice from https://huggingface.co/rhasspy/piper-voices " +
        "(e.g. en_US-amy-medium.onnx + en_US-amy-medium.onnx.json) into AXIS_PIPER_VOICE_DIR.",
    };
  }
  const wanted = requested ?? resolveDefaultVoice() ?? voices[0];
  if (!voices.includes(wanted)) {
    return {
      _not_configured: true,
      reason: "voice_model_not_found",
      detail: `voice slug "${wanted}" not found in ${resolveVoiceDir()}. Available: ${voices.join(", ")}`,
      remediation:
        "Pick one of the listed voices or download the requested .onnx + .onnx.json pair into AXIS_PIPER_VOICE_DIR.",
    };
  }
  return wanted;
}

export async function runSynthesis(
  opts: SynthesisOptions,
): Promise<SynthesisResult | NotConfiguredResult> {
  validateSynthesisOptions(opts);

  const cli = resolveCliPath();
  if (!(await isPiperCliAvailable())) {
    return {
      _not_configured: true,
      reason: "piper_cli_not_found",
      detail: `Could not invoke '${cli}' — not on PATH or not executable`,
      remediation:
        "Operator must install Piper (https://github.com/rhasspy/piper/releases) so 'piper' is on PATH " +
        "or set AXIS_PIPER_CLI_PATH to an absolute path. Prebuilt binaries for Linux/macOS/Windows on x64+arm64.",
    };
  }
  const dir = resolveVoiceDir();
  try {
    await fs.access(dir);
  } catch {
    return {
      _not_configured: true,
      reason: "voice_dir_missing",
      detail: `Voice directory '${dir}' does not exist`,
      remediation:
        "Create AXIS_PIPER_VOICE_DIR (default models/piper/ in process cwd) and drop voice .onnx + .onnx.json files into it.",
    };
  }
  const voiceOrErr = await pickVoice(opts.voice);
  if (typeof voiceOrErr !== "string") return voiceOrErr;
  const voice = voiceOrErr;

  const format: AudioFormat = opts.format ?? "wav";
  const sentenceSilence = opts.sentence_silence ?? DEFAULT_SENTENCE_SILENCE;

  let ffmpeg: string | null = null;
  if (format !== "wav") {
    ffmpeg = await getFfmpegPath();
    if (!ffmpeg) {
      return {
        _not_configured: true,
        reason: "ffmpeg_static_missing",
        detail: "ffmpeg-static did not resolve to an executable binary on this host",
        remediation:
          "format='mp3' or 'opus' requires ffmpeg-static. Reinstall apps/api deps (postinstall fetches the binary), or call with format='wav' to bypass the transcode.",
      };
    }
  }

  const modelPath = path.join(dir, `${voice}.onnx`);
  const configPath = path.join(dir, `${voice}.onnx.json`);
  try {
    await fs.access(modelPath);
  } catch {
    return {
      _not_configured: true,
      reason: "voice_model_not_found",
      detail: `Voice model file missing: ${modelPath}`,
      remediation: "Download the .onnx file for the requested voice into AXIS_PIPER_VOICE_DIR.",
    };
  }
  try {
    await fs.access(configPath);
  } catch {
    return {
      _not_configured: true,
      reason: "voice_config_not_found",
      detail: `Voice config file missing: ${configPath}`,
      remediation: "Download the .onnx.json config alongside the .onnx model.",
    };
  }

  const stagingDir = path.join(os.tmpdir(), `axis-tts-${randomBytes(8).toString("hex")}`);
  await fs.mkdir(stagingDir, { recursive: true });
  const wavPath = path.join(stagingDir, "out.wav");
  const finalPath = format === "wav" ? wavPath : path.join(stagingDir, `out.${format}`);

  try {
    try {
      await runPiperCli(cli, modelPath, wavPath, opts.text, sentenceSilence);
    } catch (err) {
      return {
        _not_configured: true,
        reason: "synthesis_failed",
        detail: err instanceof Error ? err.message : String(err),
        remediation:
          "Piper itself failed mid-synthesis. Common causes: malformed voice model (re-download), unsupported text characters, or hitting the 5-minute wall-clock cap. Check the operator's piper install with `piper --help`.",
      };
    }

    if (format !== "wav") {
      await transcodeWav(ffmpeg!, wavPath, finalPath, format);
    }

    // Read the WAV header BEFORE optional transcode for accurate sample rate
    // + duration metadata (mp3/opus headers are more complex to parse).
    const wavBytes = await fs.readFile(wavPath);
    const { sampleRate, durationSeconds } = readWavMetadata(wavBytes);
    const finalBytes = format === "wav" ? wavBytes : await fs.readFile(finalPath);

    return {
      audio_base64: finalBytes.toString("base64"),
      format,
      voice_used: voice,
      sample_rate: sampleRate,
      duration_seconds: durationSeconds,
      byte_size: finalBytes.byteLength,
    };
  } finally {
    await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
  }
}
