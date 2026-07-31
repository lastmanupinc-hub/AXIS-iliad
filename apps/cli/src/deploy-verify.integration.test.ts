// Real end-to-end proof for app_10_deploy_proven: scans a real minimal Node
// fixture on disk, runs it through the ACTUAL scan → generate pipeline (real
// generateDeployDockerfile output, not a hand-written Dockerfile), then calls
// the real verifyDeploy() against a real local Docker daemon — build, boot,
// HTTP healthcheck, cleanup. Skips (not fails) when Docker isn't on PATH, so
// this suite stays honest on a machine/runner without it instead of a false
// red or a false green.
import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { scanDirectory } from "./scanner.js";
import { run } from "./runner.js";
import { verifyDeploy, realDeps, extractHealthCheckPath } from "./deploy-verify.js";

const dockerAvailable = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { encoding: "utf-8" }).status === 0;

describe.skipIf(!dockerAvailable)("deploy-verify integration (real Docker, real generated Dockerfile)", () => {
  let fixtureDir: string;

  beforeAll(() => {
    fixtureDir = mkdtempSync(join(tmpdir(), "axis-deploy-fixture-"));
    writeFileSync(
      join(fixtureDir, "package.json"),
      JSON.stringify({
        name: "axis-deploy-fixture",
        version: "1.0.0",
        scripts: {
          // No shell/coreutils dependency (portable across the node:alpine build
          // stage): pure Node to create dist/ and copy the server into it.
          build:
            "node -e \"const fs=require('fs');fs.mkdirSync('dist',{recursive:true});fs.copyFileSync('server.js','dist/index.js')\"",
        },
      }),
      "utf-8",
    );
    writeFileSync(
      join(fixtureDir, "server.js"),
      [
        'const http = require("http");',
        "const port = process.env.PORT || 8080;",
        "http.createServer((req, res) => {",
        '  if (req.url === "/healthz") {',
        '    res.writeHead(200, { "Content-Type": "text/plain" });',
        '    res.end("ok");',
        "    return;",
        "  }",
        "  res.writeHead(404);",
        "  res.end();",
        "}).listen(port, () => console.log(`listening on ${port}`));",
      ].join("\n"),
      "utf-8",
    );
  }, 30_000);

  it("builds and boots the real deploy-program-generated Dockerfile, and it answers its own healthcheck", async () => {
    const scan = scanDirectory(fixtureDir);
    expect(scan.files.length).toBeGreaterThan(0);

    const result = run(scan, fixtureDir, ["deploy"]);
    const dockerfile = result.generator_result.files.find((f) => f.path === "deploy/Dockerfile");
    const renderYaml = result.generator_result.files.find((f) => f.path === "deploy/render.yaml");
    expect(dockerfile).toBeTruthy();

    const dockerBuildDir = mkdtempSync(join(tmpdir(), "axis-deploy-dockerfile-"));
    const dockerfilePath = join(dockerBuildDir, "Dockerfile");
    writeFileSync(dockerfilePath, dockerfile!.content, "utf-8");

    const healthCheckPath = extractHealthCheckPath(renderYaml?.content);

    try {
      const verifyResult = await verifyDeploy(
        { dockerfilePath, buildContext: fixtureDir, healthCheckPath, maxAttempts: 20 },
        realDeps(),
      );
      if (!verifyResult.pass) {
        // Surface the real build/boot log in the failure output — essential for
        // diagnosing a real infra proof, not just a mocked assertion.
        console.error(verifyResult.log);
      }
      expect(verifyResult.method).toBe("docker-build-boot");
      expect(verifyResult.pass).toBe(true);
      expect(verifyResult.detail).toContain("ok");
    } finally {
      rmSync(dockerBuildDir, { recursive: true, force: true });
    }
  }, 120_000);

  it("reports a real build failure (not a false pass) when the generated Dockerfile can't build in this context", async () => {
    // Point buildContext at an EMPTY directory — deploy/Dockerfile's COPY
    // steps have nothing to copy, so the real docker build genuinely fails.
    // Proves verifyDeploy surfaces a real failure instead of always passing.
    const emptyDir = mkdtempSync(join(tmpdir(), "axis-deploy-empty-"));
    const scan = scanDirectory(fixtureDir);
    const result = run(scan, fixtureDir, ["deploy"]);
    const dockerfile = result.generator_result.files.find((f) => f.path === "deploy/Dockerfile")!;

    const dockerBuildDir = mkdtempSync(join(tmpdir(), "axis-deploy-dockerfile-empty-"));
    const dockerfilePath = join(dockerBuildDir, "Dockerfile");
    writeFileSync(dockerfilePath, dockerfile.content, "utf-8");
    // The Dockerfile's first COPY needs package.json — give it a bare
    // placeholder in the empty build context so `docker build` gets far
    // enough to hit the SAME failure a truly missing package.json would
    // cause a fraction of a second later (no dist/ output, so the final
    // stage's COPY --from=builder .../dist fails). Real corruption, not a
    // contrived one.
    writeFileSync(join(emptyDir, "package.json"), "{}", "utf-8");

    try {
      const verifyResult = await verifyDeploy(
        { dockerfilePath, buildContext: emptyDir, healthCheckPath: "/healthz", maxAttempts: 3 },
        realDeps(),
      );
      expect(verifyResult.method).toBe("docker-build-boot");
      expect(verifyResult.pass).toBe(false);
      expect(verifyResult.detail).toContain("docker build failed");
    } finally {
      rmSync(dockerBuildDir, { recursive: true, force: true });
      rmSync(emptyDir, { recursive: true, force: true });
    }
  }, 60_000);
});
