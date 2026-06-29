// ─── iliad_code_sandbox — Ephemeral Docker container per call ───
//
// AXIS-owned secure code execution. Each call spawns a fresh
// throwaway container with hardened isolation flags and tears it
// down immediately after. Real OS-level boundary (namespaces +
// cgroups + dropped capabilities) — not a JS-eval fig leaf.
//
// Isolation contract (every container, no exceptions):
//   - NetworkMode: "none"       — no outbound network
//   - ReadonlyRootfs: true      — no writes to the image
//   - CapDrop: ["ALL"]          — no Linux capabilities
//   - User: "65534:65534"       — nobody:nobody
//   - PidsLimit: 64             — bounded fork bombs
//   - Memory: 256 MB            — bounded RAM
//   - NanoCPUs: 0.5 CPU         — bounded CPU
//   - tmpfs /tmp (size-capped)  — only writable mount
//   - timeout via AbortController → SIGKILL → force-remove
//
// dockerode is loaded via dynamic import so tests pass without
// Docker installed; isCodeSandboxConfigured() probes the daemon
// and returns false when unreachable (Docker Desktop not running,
// /var/run/docker.sock absent, etc.) — runCodeSandbox then
// returns a structured _not_configured envelope rather than
// crashing.
//
// Production note: Render.com's standard services do NOT expose
// /var/run/docker.sock. For that deployment the code-sandbox tool
// will report _not_configured until the API is moved to a host
// with Docker access (e.g. a Render Private Service running
// docker-in-docker, or a self-hosted runner).

import { Readable } from "node:stream";

export type SandboxLanguage = "python" | "node" | "bash";

export interface SandboxOptions {
  language: SandboxLanguage;
  /** Source to execute. Required, max 256 KiB. */
  code: string;
  /** Wall-clock timeout in seconds. Defaults 30, hard max 600. */
  timeout_seconds?: number;
  /** Optional stdin to feed the process. Max 1 MiB. */
  stdin?: string;
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  timed_out: boolean;
  duration_ms: number;
  image: string;
}

export interface NotConfiguredResult {
  _not_configured: true;
  reason: "docker_daemon_unreachable" | "dockerode_import_failed" | "disabled" | "sandbox_busy";
  detail: string;
  remediation: string;
}

const DEFAULT_IMAGE = "nikolaik/python-nodejs:python3.12-nodejs22-slim";
const MAX_CODE_BYTES = 262_144;          // 256 KiB
const MAX_STDIN_BYTES = 1_048_576;       // 1 MiB
const MAX_TIMEOUT_SECONDS = 600;
const DEFAULT_TIMEOUT_SECONDS = 30;
const DEFAULT_MEMORY_BYTES = 268_435_456;   // 256 MiB
const DEFAULT_NANO_CPUS = 500_000_000;      // 0.5 CPU
const DEFAULT_PIDS_LIMIT = 64;
const TMPFS_BYTES = 16_777_216;          // 16 MiB
const OUTPUT_CAP_BYTES = 1_048_576;      // truncate stdout/stderr at 1 MiB
// Aggregate concurrency cap — each run reserves memory/CPU, so unbounded concurrent runs
// exhaust the host. Released in the finally regardless of how a run exits.
const SANDBOX_MAX_CONCURRENT = Math.max(1, parseInt(process.env.AXIS_SANDBOX_MAX_CONCURRENT ?? "4", 10));
let activeSandboxes = 0;

function resolveImage(): string {
  const env = process.env.AXIS_CODE_SANDBOX_IMAGE;
  if (env && env.length > 0) return env;
  return DEFAULT_IMAGE;
}

// ─── Lazy dockerode init ────────────────────────────────────────
//
// @types/dockerode uses `export = Dockerode`, so a static
// `import Dockerode from "dockerode"` works via esModuleInterop.
// Dynamic `await import("dockerode")` returns the CJS interop
// shape — namespace object with a `default` property at runtime —
// which TS can't statically resolve to a constructable. We cast
// through `unknown` to bridge the static/runtime mismatch.

type DockerodeCtor = new () => DockerInstance;
type DockerInstance = import("dockerode");

let _DockerodeCtor: DockerodeCtor | null = null;
let _docker: DockerInstance | null = null;
let _initPromise: Promise<void> | null = null;

async function ensureDockerLoaded(): Promise<void> {
  if (_docker) return;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    if (!_DockerodeCtor) {
      const mod = (await import("dockerode")) as unknown as
        | DockerodeCtor
        | { default: DockerodeCtor };
      _DockerodeCtor =
        typeof mod === "function"
          ? mod
          : (mod as { default: DockerodeCtor }).default;
    }
    _docker = new _DockerodeCtor();
  })();
  try {
    await _initPromise;
  } finally {
    _initPromise = null;
  }
}

/** Test-only helper. Drops the cached Docker handle so subsequent calls reinit. */
export function resetCodeSandboxForTests(): void {
  _docker = null;
  _initPromise = null;
  // Intentionally do not null _dockerode — re-importing native modules
  // repeatedly is wasteful and the module itself is stateless.
}

/** ping timeout — Docker named-pipe / socket lookup can hang indefinitely on Windows when the daemon is stopped. */
const PING_TIMEOUT_MS = 3000;

function withPingTimeout<T>(p: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Docker ping exceeded ${PING_TIMEOUT_MS}ms (daemon likely not running)`)),
      PING_TIMEOUT_MS,
    );
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export async function isCodeSandboxConfigured(): Promise<boolean> {
  // Explicit kill-switch: report unconfigured without probing the daemon. Lets an operator
  // disable the sandbox on a Docker-equipped host, and lets tests force the deterministic
  // _not_configured path instead of doing real (slow, flaky) image-pull + container work.
  if (process.env.AXIS_CODE_SANDBOX_DISABLED === "1") return false;
  try {
    await ensureDockerLoaded();
    if (!_docker) return false;
    await withPingTimeout(_docker.ping());
    return true;
  } catch {
    return false;
  }
}

// ─── Validation ─────────────────────────────────────────────────

export function validateSandboxOptions(opts: SandboxOptions): void {
  if (!opts || typeof opts !== "object") {
    throw new Error("runCodeSandbox: options object required");
  }
  if (opts.language !== "python" && opts.language !== "node" && opts.language !== "bash") {
    throw new Error("runCodeSandbox: language must be one of python, node, bash");
  }
  if (typeof opts.code !== "string" || opts.code.length === 0) {
    throw new Error("runCodeSandbox: code must be a non-empty string");
  }
  if (Buffer.byteLength(opts.code, "utf8") > MAX_CODE_BYTES) {
    throw new Error(`runCodeSandbox: code exceeds ${MAX_CODE_BYTES} bytes`);
  }
  if (opts.timeout_seconds !== undefined) {
    if (!Number.isFinite(opts.timeout_seconds) || opts.timeout_seconds <= 0) {
      throw new Error("runCodeSandbox: timeout_seconds must be a positive number");
    }
    if (opts.timeout_seconds > MAX_TIMEOUT_SECONDS) {
      throw new Error(`runCodeSandbox: timeout_seconds exceeds hard cap ${MAX_TIMEOUT_SECONDS}`);
    }
  }
  if (opts.stdin !== undefined) {
    if (typeof opts.stdin !== "string") {
      throw new Error("runCodeSandbox: stdin must be a string when provided");
    }
    if (Buffer.byteLength(opts.stdin, "utf8") > MAX_STDIN_BYTES) {
      throw new Error(`runCodeSandbox: stdin exceeds ${MAX_STDIN_BYTES} bytes`);
    }
  }
}

// ─── Per-language Cmd construction ──────────────────────────────
//
// We pass the source via stdin and exec the interpreter with "-"
// (read from stdin) so we never have to touch the read-only
// rootfs. Bash's `bash -s` does the same trick.

function cmdForLanguage(lang: SandboxLanguage): string[] {
  if (lang === "python") return ["python3", "-"];
  if (lang === "node") return ["node", "-"];
  return ["bash", "-s"];
}

// ─── Output assembly with size cap ──────────────────────────────

function makeCappedWriter(): { write: (chunk: Buffer) => void; value: () => string; truncated: () => boolean } {
  const parts: Buffer[] = [];
  let total = 0;
  let trunc = false;
  return {
    write(chunk: Buffer) {
      if (trunc) return;
      const remaining = OUTPUT_CAP_BYTES - total;
      if (remaining <= 0) {
        trunc = true;
        return;
      }
      if (chunk.byteLength > remaining) {
        parts.push(chunk.subarray(0, remaining));
        total = OUTPUT_CAP_BYTES;
        trunc = true;
        return;
      }
      parts.push(chunk);
      total += chunk.byteLength;
    },
    value() {
      const s = Buffer.concat(parts).toString("utf8");
      return trunc ? `${s}\n[...truncated at ${OUTPUT_CAP_BYTES} bytes...]` : s;
    },
    truncated() {
      return trunc;
    },
  };
}

// Docker multiplexed stream demuxer: each frame is an 8-byte header
// where byte 0 is 1=stdout/2=stderr and bytes 4-7 are big-endian
// frame length. Anything else means the stream isn't multiplexed
// (TTY mode) and we treat everything as stdout.
function demuxStream(
  stream: NodeJS.ReadableStream,
  onStdout: (b: Buffer) => void,
  onStderr: (b: Buffer) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    stream.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.byteLength >= 8) {
        const streamType = buffer[0];
        const len = buffer.readUInt32BE(4);
        if (buffer.byteLength < 8 + len) break;
        const payload = buffer.subarray(8, 8 + len);
        if (streamType === 2) onStderr(payload);
        else onStdout(payload);
        buffer = buffer.subarray(8 + len);
      }
    });
    stream.on("end", () => {
      // Flush any trailing non-multiplexed bytes as stdout.
      if (buffer.byteLength > 0) onStdout(buffer);
      resolve();
    });
    stream.on("error", reject);
  });
}

// ─── Public entrypoint ──────────────────────────────────────────

export async function runCodeSandbox(
  opts: SandboxOptions,
): Promise<SandboxResult | NotConfiguredResult> {
  validateSandboxOptions(opts);

  // Explicit kill-switch — checked AFTER validation (so option errors still take
  // precedence) but BEFORE any Docker work. Lets an operator disable the sandbox on a
  // Docker-equipped host, and lets tests get the deterministic _not_configured envelope
  // instead of a real (slow, flaky) image-pull + container run.
  if (process.env.AXIS_CODE_SANDBOX_DISABLED === "1") {
    return {
      _not_configured: true,
      reason: "disabled",
      detail: "Code sandbox disabled via AXIS_CODE_SANDBOX_DISABLED=1.",
      remediation: "Unset AXIS_CODE_SANDBOX_DISABLED to re-enable Docker-backed execution.",
    };
  }

  try {
    await ensureDockerLoaded();
  } catch (err) {
    return {
      _not_configured: true,
      reason: "dockerode_import_failed",
      detail: err instanceof Error ? err.message : String(err),
      remediation:
        "The dockerode native bindings failed to load. Run `pnpm approve-builds` to allow its post-install scripts, then reinstall.",
    };
  }
  if (!_docker) {
    return {
      _not_configured: true,
      reason: "dockerode_import_failed",
      detail: "dockerode module loaded but Docker instance is null",
      remediation: "Reinstall apps/api dependencies.",
    };
  }
  try {
    await withPingTimeout(_docker.ping());
  } catch (err) {
    return {
      _not_configured: true,
      reason: "docker_daemon_unreachable",
      detail: err instanceof Error ? err.message : String(err),
      remediation:
        "iliad_code_sandbox requires a reachable Docker daemon. On dev: start Docker Desktop. On prod (e.g. Render standard services): /var/run/docker.sock is not exposed — move the API to a Render Private Service running docker-in-docker or a self-hosted runner that mounts the daemon socket.",
    };
  }

  const image = resolveImage();
  const timeoutSeconds = opts.timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS;
  const stdin = opts.code + (opts.stdin ?? "");

  // Make sure the image is locally available. Pulls only on first call.
  await ensureImagePulled(_docker, image);

  // Reject when at the aggregate concurrency cap (host CPU/RAM protection). The counter is
  // released in the finally below no matter how this run exits.
  if (activeSandboxes >= SANDBOX_MAX_CONCURRENT) {
    return {
      _not_configured: true,
      reason: "sandbox_busy",
      detail: `Too many concurrent sandbox runs (limit ${SANDBOX_MAX_CONCURRENT}).`,
      remediation: "Retry shortly, or raise AXIS_SANDBOX_MAX_CONCURRENT.",
    };
  }
  activeSandboxes++;
  try {
  const container = await _docker.createContainer({
    Image: image,
    Cmd: cmdForLanguage(opts.language),
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    OpenStdin: true,
    StdinOnce: true,
    Tty: false,
    User: "65534:65534",
    NetworkDisabled: true,
    HostConfig: {
      NetworkMode: "none",
      ReadonlyRootfs: true,
      AutoRemove: false,
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges"],
      PidsLimit: DEFAULT_PIDS_LIMIT,
      Memory: DEFAULT_MEMORY_BYTES,
      MemorySwap: DEFAULT_MEMORY_BYTES, // disable swap (== memory)
      NanoCpus: DEFAULT_NANO_CPUS,
      Tmpfs: {
        "/tmp": `rw,noexec,nosuid,size=${TMPFS_BYTES}`,
      },
    },
  });

  const stdoutWriter = makeCappedWriter();
  const stderrWriter = makeCappedWriter();
  const start = Date.now();
  let timedOut = false;

  try {
    const stream = await container.attach({
      stream: true,
      stdin: true,
      stdout: true,
      stderr: true,
      hijack: true,
    });

    // Pipe the source into stdin then close it so the interpreter sees EOF.
    Readable.from([Buffer.from(stdin, "utf8")]).pipe(stream as unknown as NodeJS.WritableStream);

    await container.start();

    // Timeout enforcement. We race the wait() against a setTimeout
    // that triggers container.kill() with SIGKILL. exit_code comes
    // from wait()'s StatusCode either way (137 on SIGKILL).
    const timer = setTimeout(() => {
      timedOut = true;
      container.kill({ signal: "SIGKILL" }).catch(() => {});
    }, timeoutSeconds * 1000);

    const [demuxResult, waitResult] = await Promise.allSettled([
      demuxStream(
        stream as unknown as NodeJS.ReadableStream,
        (b) => stdoutWriter.write(b),
        (b) => stderrWriter.write(b),
      ),
      container.wait(),
    ]);

    clearTimeout(timer);

    if (demuxResult.status === "rejected") {
      // Demux errors after kill are expected; surface only as stderr addition.
      stderrWriter.write(Buffer.from(`\n[sandbox: stream error: ${String(demuxResult.reason)}]\n`));
    }

    let exitCode = 0;
    if (waitResult.status === "fulfilled" && typeof waitResult.value?.StatusCode === "number") {
      exitCode = waitResult.value.StatusCode;
    } else if (waitResult.status === "rejected") {
      exitCode = 137;
    }

    return {
      stdout: stdoutWriter.value(),
      stderr: stderrWriter.value(),
      exit_code: exitCode,
      timed_out: timedOut,
      duration_ms: Date.now() - start,
      image,
    };
  } finally {
    // Always tear down. Force-remove handles still-running containers.
    try {
      await container.remove({ force: true });
    } catch {
      // Container may already be gone; that's fine.
    }
  }
  } finally {
    activeSandboxes--;
  }
}

// ─── Image pull (one-shot, cached) ──────────────────────────────

const pulledImages = new Set<string>();

async function ensureImagePulled(docker: DockerInstance, image: string): Promise<void> {
  if (pulledImages.has(image)) return;
  try {
    await docker.getImage(image).inspect();
    pulledImages.add(image);
    return;
  } catch {
    // not present, pull below
  }
  await new Promise<void>((resolve, reject) => {
    docker.pull(image, {}, (err: Error | null, stream: NodeJS.ReadableStream | undefined) => {
      if (err) return reject(err);
      if (!stream) return reject(new Error("pull returned no stream"));
      docker.modem.followProgress(
        stream,
        (followErr: Error | null) => {
          if (followErr) reject(followErr);
          else {
            pulledImages.add(image);
            resolve();
          }
        },
      );
    });
  });
}

/** Test-only helper. Forgets the set of already-pulled images. */
export function resetCodeSandboxPullCacheForTests(): void {
  pulledImages.clear();
}

export function getCodeSandboxImage(): string {
  return resolveImage();
}
