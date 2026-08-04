// Real end-to-end proof for app_25_superpowers_executable: runs actual node
// processes on disk via realRunCmd (the same real spawnSync path release-
// operator.ts uses) — no mocked RunCmd — and writes a real workflow file to a
// real .github/workflows/ directory. Red-then-green: a genuinely broken step
// is proven to fail and withhold the workflow file; fixing it is proven to
// pass and write it.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { realRunCmd } from "./release-operator.js";
import { verifyAutomation, writeDispatchableWorkflow, type RegistryAutomation } from "./automation-verifier.js";

function makeAutomation(): RegistryAutomation {
  return {
    id: "fixture-build",
    name: "Fixture Build",
    category: "build",
    trigger: "test",
    steps: ["node build.js", "node test.js"],
    exec_steps: ["node build.js", "node test.js"],
    applicable: true,
  };
}

describe("automation-verifier integration (real node processes, real filesystem)", () => {
  let repoDir: string;

  beforeAll(() => {
    repoDir = mkdtempSync(join(tmpdir(), "axis-automation-repo-"));
  });

  afterAll(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("red: a genuinely failing step reports FAIL, names the failed command, and never writes a workflow file", () => {
    writeFileSync(join(repoDir, "build.js"), "process.exit(1);\n", "utf-8"); // real, deliberate failure
    writeFileSync(join(repoDir, "test.js"), "process.exit(0);\n", "utf-8");

    const result = verifyAutomation(makeAutomation(), repoDir, realRunCmd(20_000));
    expect(result.ok).toBe(false);
    expect(result.failed_command).toBe("node build.js");
    expect(result.steps).toHaveLength(1); // test.js never ran

    const workflowPath = join(repoDir, ".github", "workflows", "axis-automation-fixture-build.yml");
    expect(existsSync(workflowPath)).toBe(false);
  });

  it("green: fixing the real failure makes every step pass, and only then is the workflow file written", () => {
    writeFileSync(join(repoDir, "build.js"), "process.exit(0);\n", "utf-8"); // real fix
    writeFileSync(join(repoDir, "test.js"), "process.exit(0);\n", "utf-8");

    const result = verifyAutomation(makeAutomation(), repoDir, realRunCmd(20_000));
    if (!result.ok) console.error("Unexpected failure:", JSON.stringify(result, null, 2));
    expect(result.ok).toBe(true);
    expect(result.steps).toHaveLength(2);
    expect(result.steps.every((s) => s.status === 0)).toBe(true);

    const written = writeDispatchableWorkflow(repoDir, makeAutomation());
    expect(existsSync(written)).toBe(true);
    const content = readFileSync(written, "utf-8");
    expect(content).toContain("workflow_dispatch");
    expect(content).toContain("- run: node build.js");
    expect(content).toContain("- run: node test.js");
  });

  it("a real crashing step (nonzero exit with real stderr output) is captured verbatim in failure_output", () => {
    const crashDir = mkdtempSync(join(tmpdir(), "axis-automation-crash-"));
    try {
      writeFileSync(join(crashDir, "build.js"), "console.error('FATAL: disk full'); process.exit(17);\n", "utf-8");
      writeFileSync(join(crashDir, "test.js"), "process.exit(0);\n", "utf-8");

      const result = verifyAutomation(makeAutomation(), crashDir, realRunCmd(20_000));
      expect(result.ok).toBe(false);
      expect(result.steps[0].status).toBe(17); // the real exit code, not a mocked one
      expect(result.failure_output).toContain("FATAL: disk full");
    } finally {
      rmSync(crashDir, { recursive: true, force: true });
    }
  });
});
