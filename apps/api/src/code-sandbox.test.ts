import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  validateSandboxOptions,
  getCodeSandboxImage,
  runCodeSandbox,
  isCodeSandboxConfigured,
  resetCodeSandboxForTests,
  resetCodeSandboxPullCacheForTests,
  cmdForLanguage,
  type NotConfiguredResult,
  type SandboxResult,
} from "./code-sandbox.js";

function isNotConfigured(r: unknown): r is NotConfiguredResult {
  return Boolean(r && typeof r === "object" && (r as { _not_configured?: unknown })._not_configured === true);
}

describe("code-sandbox — getCodeSandboxImage", () => {
  const original = process.env.AXIS_CODE_SANDBOX_IMAGE;
  afterEach(() => {
    if (original === undefined) delete process.env.AXIS_CODE_SANDBOX_IMAGE;
    else process.env.AXIS_CODE_SANDBOX_IMAGE = original;
  });

  it("uses AXIS_CODE_SANDBOX_IMAGE env var when set", () => {
    process.env.AXIS_CODE_SANDBOX_IMAGE = "my/custom-runtime:latest";
    expect(getCodeSandboxImage()).toBe("my/custom-runtime:latest");
  });

  it("defaults to the multi-runtime nikolaik image when unset", () => {
    delete process.env.AXIS_CODE_SANDBOX_IMAGE;
    expect(getCodeSandboxImage()).toBe("nikolaik/python-nodejs:python3.12-nodejs22-slim");
  });
});

describe("code-sandbox — cmdForLanguage (program delivery)", () => {
  it("decodes the program from AXIS_B64 to a file and execs the interpreter on it (stdin stays free)", () => {
    const cases: ReadonlyArray<readonly ["python" | "node" | "bash", string]> = [
      ["python", "python3"],
      ["node", "node"],
      ["bash", "bash"],
    ];
    for (const [lang, interp] of cases) {
      const cmd = cmdForLanguage(lang);
      expect(cmd[0]).toBe("sh");
      expect(cmd[1]).toBe("-c");
      // The program rides in AXIS_B64 → /tmp/prog, not stdin.
      expect(cmd[2]).toContain("AXIS_B64");
      expect(cmd[2]).toContain("/tmp/prog");
      // Exec the interpreter ON THE FILE — not `<interp> -`, which read the program FROM
      // stdin (the bug that made supplied stdin execute as source).
      expect(cmd[2]).toContain(`exec ${interp} /tmp/prog`);
      expect(cmd[2]).not.toContain(`${interp} -`);
    }
  });
});

describe("code-sandbox — validateSandboxOptions", () => {
  it("accepts a minimal valid call", () => {
    expect(() => validateSandboxOptions({ language: "python", code: "print('hi')" })).not.toThrow();
  });

  it("rejects an unknown language", () => {
    expect(() =>
      validateSandboxOptions({ language: "ruby" as unknown as "python", code: "puts 'hi'" }),
    ).toThrow(/language must be one of/);
  });

  it("rejects an empty code body", () => {
    expect(() => validateSandboxOptions({ language: "python", code: "" })).toThrow(/non-empty/);
  });

  it("rejects code over 256 KiB", () => {
    const big = "x".repeat(300_000);
    expect(() => validateSandboxOptions({ language: "python", code: big })).toThrow(/code exceeds/);
  });

  it("rejects timeout_seconds = 0", () => {
    expect(() =>
      validateSandboxOptions({ language: "python", code: "x", timeout_seconds: 0 }),
    ).toThrow(/positive/);
  });

  it("rejects timeout_seconds above 600", () => {
    expect(() =>
      validateSandboxOptions({ language: "python", code: "x", timeout_seconds: 1000 }),
    ).toThrow(/600/);
  });

  it("rejects non-string stdin", () => {
    expect(() =>
      validateSandboxOptions({ language: "python", code: "x", stdin: 42 as unknown as string }),
    ).toThrow(/stdin must be a string/);
  });

  it("rejects stdin over 1 MiB", () => {
    const big = "x".repeat(2_000_000);
    expect(() =>
      validateSandboxOptions({ language: "python", code: "x", stdin: big }),
    ).toThrow(/stdin exceeds/);
  });

  it("accepts all three supported languages", () => {
    expect(() => validateSandboxOptions({ language: "python", code: "1" })).not.toThrow();
    expect(() => validateSandboxOptions({ language: "node", code: "1" })).not.toThrow();
    expect(() => validateSandboxOptions({ language: "bash", code: "echo" })).not.toThrow();
  });
});

describe("code-sandbox — runCodeSandbox not-configured envelope", () => {
  beforeEach(() => {
    resetCodeSandboxForTests();
    resetCodeSandboxPullCacheForTests();
  });

  it("validates options BEFORE checking Docker (validation errors take precedence)", async () => {
    await expect(runCodeSandbox({ language: "python", code: "" })).rejects.toThrow(/non-empty/);
    await expect(
      runCodeSandbox({ language: "python", code: "x", timeout_seconds: 9999 }),
    ).rejects.toThrow(/600/);
  });

  it("returns a _not_configured envelope (deterministic via the kill-switch)", async () => {
    // Force the disabled path so this is deterministic + fast regardless of whether the dev
    // machine has Docker. (Real execution is covered by the AXIS_RUN_DOCKER_TESTS live suite
    // below; the genuinely-unreachable-daemon path is environment-specific.)
    process.env.AXIS_CODE_SANDBOX_DISABLED = "1";
    try {
      const r = await runCodeSandbox({ language: "python", code: "print('axis')" });
      expect(isNotConfigured(r)).toBe(true);
      if (isNotConfigured(r)) {
        expect(r.reason).toBe("disabled");
        expect(typeof r.detail).toBe("string");
        expect(r.remediation.length).toBeGreaterThan(20);
      }
    } finally {
      delete process.env.AXIS_CODE_SANDBOX_DISABLED;
    }
  });
});

describe("code-sandbox — isCodeSandboxConfigured", () => {
  beforeEach(() => resetCodeSandboxForTests());

  it("returns a boolean without throwing regardless of Docker state", async () => {
    const r = await isCodeSandboxConfigured();
    expect(typeof r).toBe("boolean");
  });

  it("returns false when AXIS_CODE_SANDBOX_DISABLED=1, without probing the daemon", async () => {
    process.env.AXIS_CODE_SANDBOX_DISABLED = "1";
    try {
      expect(await isCodeSandboxConfigured()).toBe(false);
    } finally {
      delete process.env.AXIS_CODE_SANDBOX_DISABLED;
    }
  });
});

// ─── Optional live-execution tests ──────────────────────────────
// These only run when the env var AXIS_RUN_DOCKER_TESTS=1 is set.
// CI never sets it, so the suite passes regardless of whether the
// Docker daemon is reachable on the runner.

describe("code-sandbox — live Docker (only when AXIS_RUN_DOCKER_TESTS=1)", () => {
  const shouldRun = process.env.AXIS_RUN_DOCKER_TESTS === "1";

  it.skipIf(!shouldRun)("executes python3 and returns stdout", async () => {
    const r = await runCodeSandbox({ language: "python", code: "print(2 + 2)" });
    if (isNotConfigured(r)) {
      throw new Error("AXIS_RUN_DOCKER_TESTS=1 but Docker is not reachable");
    }
    expect(r.stdout.trim()).toBe("4");
    expect(r.exit_code).toBe(0);
    expect(r.timed_out).toBe(false);
  }, 180_000);

  it.skipIf(!shouldRun)("executes node and returns stdout", async () => {
    const r = await runCodeSandbox({ language: "node", code: "console.log(2 * 3);" });
    if (isNotConfigured(r)) throw new Error("docker not reachable under AXIS_RUN_DOCKER_TESTS=1");
    expect(r.stdout.trim()).toBe("6");
    expect(r.exit_code).toBe(0);
  }, 60_000);

  it.skipIf(!shouldRun)("executes bash and returns stdout", async () => {
    const r = await runCodeSandbox({ language: "bash", code: "echo hello-axis" });
    if (isNotConfigured(r)) throw new Error("docker not reachable under AXIS_RUN_DOCKER_TESTS=1");
    expect(r.stdout.trim()).toBe("hello-axis");
    expect(r.exit_code).toBe(0);
  }, 60_000);

  it.skipIf(!shouldRun)("enforces timeout (SIGKILL → timed_out=true, non-zero exit)", async () => {
    const r = await runCodeSandbox({
      language: "python",
      code: "import time; time.sleep(60)",
      timeout_seconds: 2,
    });
    if (isNotConfigured(r)) throw new Error("docker not reachable under AXIS_RUN_DOCKER_TESTS=1");
    expect(r.timed_out).toBe(true);
    expect(r.exit_code).not.toBe(0);
  }, 60_000);

  it.skipIf(!shouldRun)("captures stderr separately from stdout", async () => {
    const r = await runCodeSandbox({
      language: "bash",
      code: "echo OUT >&1; echo ERR >&2",
    });
    if (isNotConfigured(r)) throw new Error("docker not reachable under AXIS_RUN_DOCKER_TESTS=1");
    expect(r.stdout).toContain("OUT");
    expect(r.stderr).toContain("ERR");
    expect(r.exit_code).toBe(0);
  }, 60_000);

  it.skipIf(!shouldRun)("blocks network access (NetworkMode=none)", async () => {
    const r = await runCodeSandbox({
      language: "python",
      code: "import urllib.request; urllib.request.urlopen('https://example.com', timeout=3)",
      timeout_seconds: 10,
    });
    if (isNotConfigured(r)) throw new Error("docker not reachable under AXIS_RUN_DOCKER_TESTS=1");
    // Should fail with a name-resolution or connection error.
    expect(r.exit_code).not.toBe(0);
    expect(r.stderr).toMatch(/network|resolve|connection|gaierror|temporary failure/i);
  }, 60_000);

  it.skipIf(!shouldRun)("feeds runtime stdin to the program (not executed as source)", async () => {
    // Pre-fix, opts.stdin was concatenated onto the source and run as code; the program
    // here reads stdin at runtime and echoes it, proving the two channels are separate.
    const r = await runCodeSandbox({
      language: "python",
      code: "import sys; print('got:' + sys.stdin.read().strip())",
      stdin: "hello-stdin",
    });
    if (isNotConfigured(r)) throw new Error("docker not reachable under AXIS_RUN_DOCKER_TESTS=1");
    expect(r.exit_code).toBe(0);
    expect(r.stdout).toContain("got:hello-stdin");
  }, 60_000);
});
