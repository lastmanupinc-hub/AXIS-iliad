import { describe, it, expect, vi } from "vitest";
import { verifyDeploy, extractHealthCheckPath, type DeployVerifyDeps, type RunResult } from "./deploy-verify.js";

function makeDeps(overrides: {
  dockerAvailable?: boolean;
  hadolintAvailable?: boolean;
  buildResult?: RunResult;
  runResult?: RunResult;
  hadolintResult?: RunResult;
  healthResponses?: Array<{ ok: boolean; body?: string; throws?: boolean }>;
}): { deps: DeployVerifyDeps; calls: Array<{ cmd: string; args: string[] }>; sleeps: number[] } {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const sleeps: number[] = [];
  const dockerAvailable = overrides.dockerAvailable ?? true;
  const hadolintAvailable = overrides.hadolintAvailable ?? false;
  const buildResult = overrides.buildResult ?? { status: 0, stdout: "build ok", stderr: "" };
  const runResult = overrides.runResult ?? { status: 0, stdout: "container-id", stderr: "" };
  const hadolintResult = overrides.hadolintResult ?? { status: 0, stdout: "", stderr: "" };
  let healthCallIndex = 0;
  const healthResponses = overrides.healthResponses ?? [{ ok: true, body: "ok" }];

  const run = vi.fn((cmd: string, args: string[]): RunResult => {
    calls.push({ cmd, args });
    if (cmd === "docker" && args[0] === "version") return { status: dockerAvailable ? 0 : 1, stdout: "", stderr: "" };
    if (cmd === "hadolint" && args[0] === "--version") return { status: hadolintAvailable ? 0 : 1, stdout: "", stderr: "" };
    if (cmd === "docker" && args[0] === "build") return buildResult;
    if (cmd === "docker" && args[0] === "run") return runResult;
    if (cmd === "docker" && args[0] === "logs") return { status: 0, stdout: "container log output", stderr: "" };
    if (cmd === "hadolint") return hadolintResult;
    return { status: 0, stdout: "", stderr: "" };
  });

  const fetchImpl = vi.fn(async () => {
    const r = healthResponses[Math.min(healthCallIndex, healthResponses.length - 1)];
    healthCallIndex++;
    if (r.throws) throw new Error("connection refused");
    return { ok: r.ok, text: async () => r.body ?? "" } as Response;
  }) as unknown as typeof fetch;

  const sleep = vi.fn(async (ms: number) => {
    sleeps.push(ms);
  });

  return { deps: { run, fetchImpl, sleep }, calls, sleeps };
}

const input = {
  dockerfilePath: "/tmp/fixture/deploy/Dockerfile",
  buildContext: "/tmp/fixture",
  healthCheckPath: "/healthz",
};

describe("verifyDeploy", () => {
  it("builds, boots, and passes the healthcheck on the first attempt when docker is available", async () => {
    const { deps, calls, sleeps } = makeDeps({ healthResponses: [{ ok: true, body: "ok" }] });
    const result = await verifyDeploy(input, deps);
    expect(result.method).toBe("docker-build-boot");
    expect(result.pass).toBe(true);
    expect(result.detail).toContain("passed healthcheck");
    expect(sleeps).toHaveLength(0); // healthy on the very first probe
    expect(calls.some((c) => c.cmd === "docker" && c.args[0] === "build")).toBe(true);
    expect(calls.some((c) => c.cmd === "docker" && c.args[0] === "run")).toBe(true);
    expect(calls.some((c) => c.cmd === "docker" && c.args[0] === "stop")).toBe(true);
    expect(calls.some((c) => c.cmd === "docker" && c.args[0] === "rm")).toBe(true);
    expect(calls.some((c) => c.cmd === "docker" && c.args[0] === "rmi")).toBe(true);
  });

  it("retries the healthcheck with a real sleep between attempts before succeeding", async () => {
    const { deps, sleeps } = makeDeps({
      healthResponses: [{ throws: true }, { ok: false }, { ok: true, body: "ok" }],
    });
    const result = await verifyDeploy(input, deps);
    expect(result.pass).toBe(true);
    expect(sleeps).toEqual([1000, 1000]); // two failed probes before the third succeeds
  });

  it("fails cleanly (and still cleans up the image) when docker build itself fails", async () => {
    const { deps, calls } = makeDeps({ buildResult: { status: 1, stdout: "", stderr: "COPY failed: file not found" } });
    const result = await verifyDeploy(input, deps);
    expect(result.method).toBe("docker-build-boot");
    expect(result.pass).toBe(false);
    expect(result.detail).toContain("docker build failed");
    expect(result.log).toContain("COPY failed");
    expect(calls.some((c) => c.cmd === "docker" && c.args[0] === "run")).toBe(false); // never reached
  });

  it("fails cleanly and removes the built image when docker run fails", async () => {
    const { deps, calls } = makeDeps({ runResult: { status: 1, stdout: "", stderr: "port already in use" } });
    const result = await verifyDeploy(input, deps);
    expect(result.pass).toBe(false);
    expect(result.detail).toContain("docker run failed");
    expect(calls.some((c) => c.cmd === "docker" && c.args[0] === "rmi")).toBe(true);
  });

  it("reports unhealthy after exhausting all attempts, still attaching container logs as evidence", async () => {
    const { deps } = makeDeps({ healthResponses: [{ ok: false }] }); // every attempt returns not-ok
    const result = await verifyDeploy({ ...input, maxAttempts: 3 }, deps);
    expect(result.pass).toBe(false);
    expect(result.detail).toContain("never became healthy");
    expect(result.log).toContain("container log output");
  });

  it("falls back to hadolint when docker is unavailable, and passes on a clean lint", async () => {
    const { deps, calls } = makeDeps({ dockerAvailable: false, hadolintAvailable: true, hadolintResult: { status: 0, stdout: "", stderr: "" } });
    const result = await verifyDeploy(input, deps);
    expect(result.method).toBe("hadolint");
    expect(result.pass).toBe(true);
    expect(calls.some((c) => c.cmd === "docker" && c.args[0] === "build")).toBe(false); // never attempts a real build
  });

  it("falls back to hadolint and fails when it reports issues", async () => {
    const { deps } = makeDeps({ dockerAvailable: false, hadolintAvailable: true, hadolintResult: { status: 1, stdout: "DL3006 pin base image tag", stderr: "" } });
    const result = await verifyDeploy(input, deps);
    expect(result.method).toBe("hadolint");
    expect(result.pass).toBe(false);
    expect(result.log).toContain("DL3006");
  });

  it("reports skipped (never a silent pass) when neither docker nor hadolint is available", async () => {
    const { deps } = makeDeps({ dockerAvailable: false, hadolintAvailable: false });
    const result = await verifyDeploy(input, deps);
    expect(result.method).toBe("skipped");
    expect(result.pass).toBe(false);
    expect(result.detail).toContain("neither docker nor hadolint");
  });
});

describe("extractHealthCheckPath", () => {
  it("reads the healthCheckPath value out of a real render.yaml body", () => {
    const yaml = "services:\n  - type: web\n    healthCheckPath: /api/health\n    envVars: []\n";
    expect(extractHealthCheckPath(yaml)).toBe("/api/health");
  });

  it("defaults to /healthz when the field is absent, matching generateDeployRenderBlueprint's own default", () => {
    expect(extractHealthCheckPath("services:\n  - type: web\n")).toBe("/healthz");
  });

  it("defaults to /healthz when given undefined (e.g. render.yaml wasn't generated)", () => {
    expect(extractHealthCheckPath(undefined)).toBe("/healthz");
  });
});
