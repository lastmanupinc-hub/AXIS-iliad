// ─── Deploy-proven substrate (app_10_deploy_proven, docs/saas-strategy/
// APPLICATION_BUILD_STRATEGY.md #3) — the deploy program's V stage. Runs
// entirely in the CLI against the user's OWN local Docker daemon: `axis
// verify-deploy` never sends a user's repo content to the hosted API for
// server-side execution (that would be an arbitrary-code-execution surface —
// their COPY'd source and RUN steps executing inside a build the API
// triggered). If Docker isn't available, falls back to hadolint (static
// analysis, no execution of user content); if neither is available, the
// result says so honestly instead of a silent pass.
//
// verifyDeploy() takes injected `run`/`fetchImpl`/`sleep` so the full
// build→boot→healthcheck state machine is unit-testable without a real
// Docker daemon; realDeps() wires the actual child_process/fetch/timer calls
// for the CLI's own use.

import { spawnSync } from "node:child_process";

export interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export type RunCmd = (cmd: string, args: string[]) => RunResult;

export interface DeployVerifyDeps {
  run: RunCmd;
  fetchImpl: typeof fetch;
  sleep: (ms: number) => Promise<void>;
}

export interface DeployVerifyInput {
  dockerfilePath: string;
  /** Directory docker build treats as the build context — the user's real repo root. */
  buildContext: string;
  healthCheckPath: string;
  /** Container's EXPOSEd port — every stack's generated Dockerfile uses 8080. */
  port?: number;
  /** How many 1s-apart health probes to attempt before giving up. */
  maxAttempts?: number;
}

export interface DeployVerifyResult {
  method: "docker-build-boot" | "hadolint" | "skipped";
  pass: boolean;
  detail: string;
  log: string;
}

export function realDeps(): DeployVerifyDeps {
  return {
    run: (cmd, args) => {
      const r = spawnSync(cmd, args, { encoding: "utf-8" });
      return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
    },
    fetchImpl: fetch,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

function commandAvailable(deps: DeployVerifyDeps, cmd: string, versionArgs: string[]): boolean {
  return deps.run(cmd, versionArgs).status === 0;
}

async function buildAndBoot(input: DeployVerifyInput, deps: DeployVerifyDeps): Promise<DeployVerifyResult> {
  const suffix = Date.now();
  const tag = `axis-deploy-verify:${suffix}`;
  const containerName = `axis-deploy-verify-${suffix}`;
  const port = input.port ?? 8080;
  const hostPort = 18080 + (suffix % 1000);

  const build = deps.run("docker", ["build", "-f", input.dockerfilePath, "-t", tag, input.buildContext]);
  const buildLog = `${build.stdout}${build.stderr}`;
  if (build.status !== 0) {
    return { method: "docker-build-boot", pass: false, detail: `docker build failed (exit ${build.status})`, log: buildLog };
  }

  const boot = deps.run("docker", ["run", "-d", "--name", containerName, "-p", `${hostPort}:${port}`, tag]);
  if (boot.status !== 0) {
    deps.run("docker", ["rmi", "-f", tag]);
    return { method: "docker-build-boot", pass: false, detail: `docker run failed (exit ${boot.status})`, log: `${buildLog}${boot.stderr}` };
  }

  let healthy = false;
  let body = "";
  const attempts = input.maxAttempts ?? 10;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await deps.fetchImpl(`http://localhost:${hostPort}${input.healthCheckPath}`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        healthy = true;
        body = await res.text();
        break;
      }
    } catch {
      // container not up yet — retry until attempts are exhausted
    }
    await deps.sleep(1000);
  }

  const containerLogs = deps.run("docker", ["logs", containerName]);
  const fullLog = `${buildLog}\n--- container logs ---\n${containerLogs.stdout}${containerLogs.stderr}`;

  deps.run("docker", ["stop", containerName]);
  deps.run("docker", ["rm", containerName]);
  deps.run("docker", ["rmi", "-f", tag]);

  return {
    method: "docker-build-boot",
    pass: healthy,
    detail: healthy
      ? `booted and passed healthcheck at ${input.healthCheckPath}: ${body.slice(0, 200)}`
      : `container never became healthy at ${input.healthCheckPath} within ${attempts}s`,
    log: fullLog,
  };
}

function runHadolint(dockerfilePath: string, deps: DeployVerifyDeps): DeployVerifyResult {
  const r = deps.run("hadolint", [dockerfilePath]);
  const log = `${r.stdout}${r.stderr}`;
  return {
    method: "hadolint",
    pass: r.status === 0,
    detail: r.status === 0 ? "hadolint found no issues in the generated Dockerfile" : `hadolint reported issues (exit ${r.status})`,
    log,
  };
}

/**
 * Verifies a generated deploy/Dockerfile actually builds and, when Docker is
 * available, boots and answers its own healthcheck. Falls back to hadolint
 * (static, no execution) when Docker isn't installed; reports honestly —
 * never a silent pass — when neither tool is available.
 */
export async function verifyDeploy(input: DeployVerifyInput, deps: DeployVerifyDeps): Promise<DeployVerifyResult> {
  if (commandAvailable(deps, "docker", ["version", "--format", "{{.Server.Version}}"])) {
    return buildAndBoot(input, deps);
  }
  if (commandAvailable(deps, "hadolint", ["--version"])) {
    return runHadolint(input.dockerfilePath, deps);
  }
  return {
    method: "skipped",
    pass: false,
    detail: "neither docker nor hadolint is available on PATH — install Docker Desktop or hadolint to verify the generated Dockerfile",
    log: "",
  };
}

/** Extracts render.yaml's `healthCheckPath:` value; "/healthz" if absent (matches generateDeployRenderBlueprint's own default). */
export function extractHealthCheckPath(renderYamlContent: string | undefined): string {
  const match = renderYamlContent?.match(/healthCheckPath:\s*(\S+)/);
  return match ? match[1] : "/healthz";
}
