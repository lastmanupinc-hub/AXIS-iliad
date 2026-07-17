// ─── iliad_speech_to_text — AXIS-owned audio transcription ──────
//
// AXIS-owned implementation built on whisper.cpp (shell-out to
// the `whisper-cli` binary the operator installs) + ffmpeg-static
// for audio resampling. No third-party API, no native Node addon,
// no per-minute provider fee. Real owned implementation.
//
// Why shell-out over a native binding? nodejs-whisper has no
// prebuilt binaries (postinstall compiles whisper.cpp from source
// → fails on Windows CI). @huggingface/transformers via ONNX
// Runtime works but adds ~720 MB of disk weight from
// onnxruntime-node. Shell-out keeps the npm install lean and
// pushes the inference runtime to operator setup, where it
// belongs.
//
// Operator setup:
//   1. Install whisper.cpp (brew install whisper-cpp |
//      apt install whisper.cpp | cargo install whisper-cpp |
//      download from ggml-org/whisper.cpp releases) so the
//      `whisper-cli` (or older `main`) binary is on PATH, or
//      set AXIS_WHISPER_CLI_PATH to an absolute path.
//   2. Download a GGML model (recommended: ggml-base.en.bin
//      ~142 MB English-only, ggml-tiny.en.bin ~75 MB faster but
//      less accurate, or ggml-small.bin ~466 MB multilingual)
//      and either place it at models/ggml-base.en.bin in the
//      process cwd or set AXIS_WHISPER_MODEL_PATH to its absolute
//      path.
// When either prerequisite is missing the tool returns a
// structured _not_configured envelope with remediation steps —
// no crash, no native load attempt.

import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { safeFetch } from "./url-guard.js";

export interface TranscriptionOptions {
  /** Public URL the API can fetch (HTTPS, max 100 MiB). One of audio_url XOR audio_base64. */
  audio_url?: string;
  /** Inline base64-encoded audio bytes (max 100 MiB decoded). One of audio_url XOR audio_base64. */
  audio_base64?: string;
  /** ISO-639-1 code for known language, or "auto" to autodetect. Defaults "auto". */
  language?: string;
  /** Initial bias prompt fed to whisper to nudge spelling of rare names. Max 512 chars. */
  initial_prompt?: string;
  /** Emit word-level timestamps inside each segment. Defaults false. */
  word_timestamps?: boolean;
}

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  text: string;
  segments: TranscriptionSegment[];
  language_detected: string;
  duration_seconds: number;
  model_used: string;
}

export interface NotConfiguredResult {
  _not_configured: true;
  reason:
    | "whisper_cli_not_found"
    | "model_file_not_found"
    | "ffmpeg_static_missing"
    | "audio_download_failed"
    | "audio_decode_failed";
  detail: string;
  remediation: string;
}

const DEFAULT_MODEL_FILENAME = "ggml-base.en.bin";
const MAX_AUDIO_BYTES = 104_857_600;       // 100 MiB
const MAX_DOWNLOAD_TIMEOUT_MS = 60_000;
const WHISPER_TIMEOUT_MS = 30 * 60_000;    // 30 min hard cap
const FFMPEG_TIMEOUT_MS = 5 * 60_000;      // 5 min for resample
const MAX_INITIAL_PROMPT_CHARS = 512;
const TARGET_SAMPLE_RATE = 16_000;
const TARGET_CHANNELS = 1;

/** lite_description promise (@axis/mpp PRICING_TIERS.iliad_speech_to_text): "audio capped at 60 seconds". */
export const LITE_STT_MAX_DURATION_SECONDS = 60;

function resolveModelPath(): string {
  const env = process.env.AXIS_WHISPER_MODEL_PATH;
  if (env && env.length > 0) return env;
  return path.join(process.cwd(), "models", DEFAULT_MODEL_FILENAME);
}

function resolveCliPath(): string {
  const env = process.env.AXIS_WHISPER_CLI_PATH;
  if (env && env.length > 0) return env;
  // Bare command — relies on PATH resolution by the OS at spawn time.
  // Try whisper-cli first (newer whisper.cpp builds), fall back to main.
  return process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli";
}

// ─── Lazy ffmpeg-static path resolution ─────────────────────────

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

/** Test-only helper. Clears the cached ffmpeg path lookup. */
export function resetSpeechToTextForTests(): void {
  _ffmpegPath = null;
  _ffmpegLookupDone = false;
}

// ─── Configuration probes ───────────────────────────────────────

export async function isWhisperModelPresent(): Promise<boolean> {
  try {
    await fs.access(resolveModelPath());
    return true;
  } catch {
    return false;
  }
}

export async function isWhisperCliAvailable(): Promise<boolean> {
  const cli = resolveCliPath();
  // If absolute path, just stat it. Otherwise probe by spawning `cli --help`.
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
    child.on("exit", (code) => finish(code === 0 || code === 1)); // some builds exit 1 on --help
    setTimeout(() => {
      try { child.kill(); } catch {}
      finish(false);
    }, 3000);
  });
}

export async function isSttConfigured(): Promise<boolean> {
  const [cli, model, ffmpeg] = await Promise.all([
    isWhisperCliAvailable(),
    isWhisperModelPresent(),
    getFfmpegPath().then((p) => p !== null),
  ]);
  return cli && model && ffmpeg;
}

export function getWhisperModelPath(): string {
  return resolveModelPath();
}

export function getWhisperCliPath(): string {
  return resolveCliPath();
}

// ─── Validation ─────────────────────────────────────────────────

export function validateTranscriptionOptions(opts: TranscriptionOptions): void {
  if (!opts || typeof opts !== "object") {
    throw new Error("runTranscription: options object required");
  }
  const hasUrl = typeof opts.audio_url === "string" && opts.audio_url.length > 0;
  const hasB64 = typeof opts.audio_base64 === "string" && opts.audio_base64.length > 0;
  if (hasUrl === hasB64) {
    throw new Error("runTranscription: provide exactly one of audio_url or audio_base64");
  }
  if (hasUrl) {
    if (!opts.audio_url!.startsWith("https://") && !opts.audio_url!.startsWith("http://")) {
      throw new Error("runTranscription: audio_url must be an http(s) URL");
    }
  }
  if (opts.language !== undefined) {
    if (typeof opts.language !== "string" || opts.language.length === 0) {
      throw new Error("runTranscription: language must be a non-empty string when provided");
    }
    if (opts.language.length > 16) {
      throw new Error("runTranscription: language code looks too long");
    }
  }
  if (opts.initial_prompt !== undefined) {
    if (typeof opts.initial_prompt !== "string") {
      throw new Error("runTranscription: initial_prompt must be a string when provided");
    }
    if (opts.initial_prompt.length > MAX_INITIAL_PROMPT_CHARS) {
      throw new Error(`runTranscription: initial_prompt exceeds ${MAX_INITIAL_PROMPT_CHARS} chars`);
    }
  }
  if (opts.word_timestamps !== undefined && typeof opts.word_timestamps !== "boolean") {
    throw new Error("runTranscription: word_timestamps must be a boolean when provided");
  }
}

// ─── Audio acquisition ──────────────────────────────────────────

async function downloadAudio(url: string, dest: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAX_DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await safeFetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    const lenHeader = res.headers.get("content-length");
    if (lenHeader) {
      const declared = Number(lenHeader);
      if (Number.isFinite(declared) && declared > MAX_AUDIO_BYTES) {
        throw new Error(`Content-Length ${declared} exceeds ${MAX_AUDIO_BYTES} bytes`);
      }
    }
    const arrBuf = await res.arrayBuffer();
    if (arrBuf.byteLength > MAX_AUDIO_BYTES) {
      throw new Error(`Downloaded ${arrBuf.byteLength} bytes exceeds ${MAX_AUDIO_BYTES}`);
    }
    await fs.writeFile(dest, Buffer.from(arrBuf));
  } finally {
    clearTimeout(timer);
  }
}

async function writeBase64Audio(b64: string, dest: string): Promise<void> {
  let buf: Buffer;
  try {
    buf = Buffer.from(b64, "base64");
  } catch (err) {
    throw new Error(`base64 decode failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (buf.byteLength === 0) {
    throw new Error("decoded audio is empty");
  }
  if (buf.byteLength > MAX_AUDIO_BYTES) {
    throw new Error(`decoded audio ${buf.byteLength} bytes exceeds ${MAX_AUDIO_BYTES}`);
  }
  await fs.writeFile(dest, buf);
}

// ─── ffmpeg resample → 16 kHz mono WAV ──────────────────────────

async function resampleToWav(
  ffmpegBin: string,
  input: string,
  output: string,
): Promise<void> {
  await spawnWithTimeout(
    ffmpegBin,
    ["-y", "-i", input, "-ar", String(TARGET_SAMPLE_RATE), "-ac", String(TARGET_CHANNELS), "-f", "wav", output],
    FFMPEG_TIMEOUT_MS,
    "ffmpeg",
  );
}

/**
 * Reads just enough of a canonical RIFF/WAVE file to compute its duration —
 * no full-file read, no new dependency. ffmpeg's `-f wav` output always puts
 * a `fmt ` chunk immediately after the 12-byte RIFF header followed by
 * `data`, but this walks chunks (bounded) rather than assuming a fixed
 * offset, so a stray chunk (e.g. LIST/INFO) doesn't break it.
 */
export async function getWavDurationSeconds(wavPath: string): Promise<number> {
  const handle = await fs.open(wavPath, "r");
  try {
    const riff = Buffer.alloc(12);
    await handle.read(riff, 0, 12, 0);
    if (riff.toString("ascii", 0, 4) !== "RIFF" || riff.toString("ascii", 8, 12) !== "WAVE") {
      throw new Error("not a RIFF/WAVE file");
    }
    let offset = 12;
    let sampleRate = 0;
    let channels = 0;
    let bitsPerSample = 0;
    let dataSize: number | null = null;
    const chunkHeader = Buffer.alloc(8);
    for (let i = 0; i < 20 && dataSize === null; i++) {
      const { bytesRead } = await handle.read(chunkHeader, 0, 8, offset);
      if (bytesRead < 8) break;
      const chunkId = chunkHeader.toString("ascii", 0, 4);
      const chunkSize = chunkHeader.readUInt32LE(4);
      if (chunkId === "fmt ") {
        const fmt = Buffer.alloc(16);
        await handle.read(fmt, 0, 16, offset + 8);
        channels = fmt.readUInt16LE(2);
        sampleRate = fmt.readUInt32LE(4);
        bitsPerSample = fmt.readUInt16LE(14);
      } else if (chunkId === "data") {
        dataSize = chunkSize;
      }
      offset += 8 + chunkSize + (chunkSize % 2); // chunks are word-aligned
    }
    if (dataSize === null || sampleRate === 0 || channels === 0 || bitsPerSample === 0) {
      throw new Error("could not determine WAV duration (missing fmt or data chunk)");
    }
    const byteRate = sampleRate * channels * (bitsPerSample / 8);
    return dataSize / byteRate;
  } finally {
    await handle.close();
  }
}

// ─── whisper-cli invocation ─────────────────────────────────────

interface WhisperJsonShape {
  model?: { type?: string };
  result?: { language?: string };
  transcription?: Array<{
    timestamps?: { from?: string; to?: string };
    offsets?: { from?: number; to?: number };
    text?: string;
  }>;
}

async function runWhisperCli(
  cli: string,
  modelPath: string,
  wavPath: string,
  outBase: string,
  opts: TranscriptionOptions,
): Promise<void> {
  const args = [
    "-m", modelPath,
    "-f", wavPath,
    "-of", outBase,
    "-oj",                // emit JSON sidecar
    "--no-prints",        // suppress progress noise
  ];
  if (opts.language && opts.language !== "auto") {
    args.push("-l", opts.language);
  }
  if (opts.initial_prompt) {
    args.push("--prompt", opts.initial_prompt);
  }
  if (opts.word_timestamps) {
    args.push("-ml", "1");
  }
  await spawnWithTimeout(cli, args, WHISPER_TIMEOUT_MS, "whisper-cli");
}

async function spawnWithTimeout(
  cmd: string,
  args: string[],
  timeoutMs: number,
  label: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], shell: false });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 65536) stderr = stderr.slice(-65536);
    });
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
      reject(new Error(`${label} exceeded ${timeoutMs}ms wall-clock`));
    }, timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`${label} spawn failed: ${err.message}`));
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${label} exited ${code}: ${stderr.trim().slice(0, 500)}`));
    });
  });
}

// ─── JSON parsing ───────────────────────────────────────────────

function parseTimestamp(stamp?: string): number {
  // whisper.cpp timestamps look like "00:01:23.456" — convert to seconds.
  if (!stamp) return 0;
  const match = /^(\d+):(\d+):(\d+)\.(\d+)$/.exec(stamp);
  if (!match) return 0;
  const h = Number(match[1]);
  const m = Number(match[2]);
  const s = Number(match[3]);
  const ms = Number(match[4]);
  return h * 3600 + m * 60 + s + ms / 1000;
}

function parseWhisperJson(raw: string, modelPath: string): TranscriptionResult {
  const data = JSON.parse(raw) as WhisperJsonShape;
  const segments: TranscriptionSegment[] = [];
  let textParts: string[] = [];
  let lastEnd = 0;
  if (Array.isArray(data.transcription)) {
    for (const t of data.transcription) {
      const txt = (t.text ?? "").trim();
      // Prefer numeric offsets (ms) when present; fall back to string timestamps.
      let start: number;
      let end: number;
      if (t.offsets && typeof t.offsets.from === "number" && typeof t.offsets.to === "number") {
        start = t.offsets.from / 1000;
        end = t.offsets.to / 1000;
      } else {
        start = parseTimestamp(t.timestamps?.from);
        end = parseTimestamp(t.timestamps?.to);
      }
      if (end > lastEnd) lastEnd = end;
      if (txt.length > 0) {
        segments.push({ start, end, text: txt });
        textParts.push(txt);
      }
    }
  }
  return {
    text: textParts.join(" ").trim(),
    segments,
    language_detected: data.result?.language ?? "unknown",
    duration_seconds: lastEnd,
    model_used: path.basename(modelPath),
  };
}

// ─── Public entrypoint ──────────────────────────────────────────

export async function runTranscription(
  opts: TranscriptionOptions,
  liteMaxDurationSeconds?: number,
): Promise<TranscriptionResult | NotConfiguredResult> {
  validateTranscriptionOptions(opts);

  const modelPath = resolveModelPath();
  if (!(await isWhisperModelPresent())) {
    return {
      _not_configured: true,
      reason: "model_file_not_found",
      detail: `No GGML model at ${modelPath}`,
      remediation:
        "Operator must download a GGML whisper model (recommended: ggml-base.en.bin ~142 MB from " +
        "https://huggingface.co/ggml-org/whisper.cpp/tree/main) and set AXIS_WHISPER_MODEL_PATH to " +
        "its absolute path, then restart the API.",
    };
  }
  const cli = resolveCliPath();
  if (!(await isWhisperCliAvailable())) {
    return {
      _not_configured: true,
      reason: "whisper_cli_not_found",
      detail: `Could not invoke '${cli}' — not on PATH or not executable`,
      remediation:
        "Operator must install whisper.cpp so the 'whisper-cli' binary is on PATH (brew install " +
        "whisper-cpp | apt install whisper.cpp | download from https://github.com/ggml-org/whisper.cpp/releases) " +
        "or set AXIS_WHISPER_CLI_PATH to an absolute path.",
    };
  }
  const ffmpeg = await getFfmpegPath();
  if (!ffmpeg) {
    return {
      _not_configured: true,
      reason: "ffmpeg_static_missing",
      detail: "ffmpeg-static did not resolve to an executable binary on this host",
      remediation:
        "ffmpeg-static is a runtime dependency. Run `pnpm install --filter @axis/api` to fetch the prebuilt binary, or set up your own ffmpeg on PATH (this module currently requires ffmpeg-static for resampling).",
    };
  }

  // Stage tempfiles in os.tmpdir under a random subdir we own.
  const stagingDir = path.join(os.tmpdir(), `axis-stt-${randomBytes(8).toString("hex")}`);
  await fs.mkdir(stagingDir, { recursive: true });
  const inputPath = path.join(stagingDir, "input.bin");
  const wavPath = path.join(stagingDir, "input.wav");
  const outBase = path.join(stagingDir, "out");
  const outJsonPath = `${outBase}.json`;

  try {
    if (opts.audio_url) {
      try {
        await downloadAudio(opts.audio_url, inputPath);
      } catch (err) {
        return {
          _not_configured: true,
          reason: "audio_download_failed",
          detail: err instanceof Error ? err.message : String(err),
          remediation:
            "audio_url must return a 200 response with audio bytes under 100 MiB within 60 seconds. " +
            "Verify the URL is reachable from the API host and the audio file is well-formed.",
        };
      }
    } else {
      try {
        await writeBase64Audio(opts.audio_base64!, inputPath);
      } catch (err) {
        return {
          _not_configured: true,
          reason: "audio_decode_failed",
          detail: err instanceof Error ? err.message : String(err),
          remediation: "audio_base64 must be a valid base64-encoded audio payload under 100 MiB decoded.",
        };
      }
    }

    await resampleToWav(ffmpeg, inputPath, wavPath);

    // Lite mode's 60-second cap, checked BEFORE the whisper-cli step (which
    // dominates cost/latency) so an over-limit call is rejected cheaply
    // rather than paying for a transcription it can't use.
    if (liteMaxDurationSeconds !== undefined) {
      const durationSeconds = await getWavDurationSeconds(wavPath);
      if (durationSeconds > liteMaxDurationSeconds) {
        throw new Error(
          `iliad_speech_to_text: lite mode caps audio at ${liteMaxDurationSeconds} seconds ` +
            `(this file is ~${Math.round(durationSeconds)}s). Send X-Agent-Mode: standard for up to 30 minutes.`,
        );
      }
    }

    await runWhisperCli(cli, modelPath, wavPath, outBase, opts);

    const raw = await fs.readFile(outJsonPath, "utf8");
    return parseWhisperJson(raw, modelPath);
  } finally {
    // Best-effort cleanup. Never let temp leaks propagate as failures.
    await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
  }
}
