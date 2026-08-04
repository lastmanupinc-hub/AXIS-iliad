import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyAutomation, generateDispatchableWorkflowYaml, writeDispatchableWorkflow, type RegistryAutomation } from "./automation-verifier.js";
import type { RunCmd, RunResult } from "./release-operator.js";

function automation(over: Partial<RegistryAutomation> = {}): RegistryAutomation {
  return {
    id: "full-build-verify",
    name: "Full Build & Verify",
    category: "build",
    trigger: "Before commit / Before PR",
    steps: ["npm install", "npm run build", "npx vitest run"],
    exec_steps: ["npm install", "npm run build", "npx vitest run"],
    applicable: true,
    ...over,
  };
}

function makeRunCmd(behavior: Partial<Record<string, RunResult>>): { run: RunCmd; calls: Array<{ cmd: string; args: string[] }> } {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const run: RunCmd = (cmd, args) => {
    calls.push({ cmd, args });
    const key = `${cmd} ${args.join(" ")}`;
    return behavior[key] ?? behavior[cmd] ?? { status: 0, stdout: "", stderr: "" };
  };
  return { run, calls };
}

describe("verifyAutomation", () => {
  it("runs every exec_step in order and reports ok when all pass", () => {
    const { run, calls } = makeRunCmd({});
    const result = verifyAutomation(automation(), "/repo", run);
    expect(result.ok).toBe(true);
    expect(result.steps).toHaveLength(3);
    expect(result.steps.every((s) => s.ok)).toBe(true);
    expect(calls.map((c) => `${c.cmd} ${c.args.join(" ")}`)).toEqual(["npm install", "npm run build", "npx vitest run"]);
  });

  it("stops at the first failing step and never runs the rest", () => {
    const { run, calls } = makeRunCmd({ "npm run build": { status: 1, stdout: "", stderr: "TS2322: type error" } });
    const result = verifyAutomation(automation(), "/repo", run);
    expect(result.ok).toBe(false);
    expect(result.failed_command).toBe("npm run build");
    expect(result.failure_output).toContain("TS2322");
    expect(result.steps).toHaveLength(2); // install (pass) + build (fail) — vitest never runs
    expect(calls).toHaveLength(2);
  });

  it("passes cwd through to every step (the app_21 bug this mirrors: a missing cwd silently builds the wrong repo)", () => {
    const seenCwds: Array<string | undefined> = [];
    const capturingRun: RunCmd = (_cmd, _args, cwd) => {
      seenCwds.push(cwd);
      return { status: 0, stdout: "", stderr: "" };
    };
    verifyAutomation(automation(), "/some/target/repo", capturingRun);
    expect(seenCwds).toEqual(["/some/target/repo", "/some/target/repo", "/some/target/repo"]);
  });

  it("reports not-ok for a non-executable automation instead of throwing", () => {
    const { run } = makeRunCmd({});
    const result = verifyAutomation(automation({ id: "new-feature", exec_steps: null }), "/repo", run);
    expect(result.ok).toBe(false);
    expect(result.steps).toHaveLength(0);
  });
});

describe("generateDispatchableWorkflowYaml", () => {
  it("emits a workflow_dispatch-only trigger (never push/PR) running the exact verified steps", () => {
    const yaml = generateDispatchableWorkflowYaml(automation());
    expect(yaml).toContain("workflow_dispatch: {}");
    expect(yaml).not.toMatch(/^\s*push:/m);
    expect(yaml).not.toMatch(/^\s*pull_request:/m);
    expect(yaml).toContain("- run: npm install");
    expect(yaml).toContain("- run: npm run build");
    expect(yaml).toContain("- run: npx vitest run");
  });

  it("adds a corepack setup step for pnpm-based automations, not for npm ones", () => {
    const pnpmYaml = generateDispatchableWorkflowYaml(automation({ exec_steps: ["pnpm install", "pnpm run build"] }));
    expect(pnpmYaml).toContain("corepack enable && corepack prepare pnpm@10 --activate");

    const npmYaml = generateDispatchableWorkflowYaml(automation());
    expect(npmYaml).not.toContain("corepack");
  });

  it("throws rather than emitting an empty/broken workflow for a non-executable automation", () => {
    expect(() => generateDispatchableWorkflowYaml(automation({ exec_steps: null }))).toThrow();
  });
});

describe("writeDispatchableWorkflow", () => {
  let dir: string;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("writes a real file under .github/workflows/, never committing or pushing", () => {
    dir = mkdtempSync(join(tmpdir(), "axis-automation-write-"));
    const path = writeDispatchableWorkflow(dir, automation());
    expect(path).toBe(join(dir, ".github", "workflows", "axis-automation-full-build-verify.yml"));
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf-8")).toContain("workflow_dispatch");
  });
});
