import { describe, it, expect } from "vitest";
import ts from "typescript";
import { parse as parseYaml } from "yaml";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import {
  generateDeployDockerfile,
  generateDeployDockerignore,
  generateDeployComposeDev,
  generateDeployRenderBlueprint,
  generateDeployScriptBash,
  generateDeployScriptPwsh,
  generateDeployVSCodeLaunchTemplate,
  generateDeployWranglerPages,
  generateDeployWranglerContainers,
  generateDeployContainersWorker,
  generateDeployScriptCloudflareBash,
  generateDeployScriptCloudflarePwsh,
  generateDeployQualificationReport,
} from "./generators-deploy.js";

// Every breakout char across markdown / Dockerfile / shell / PowerShell / TOML / YAML / TS.
const PAY = 'INJ"$(rm -rf /)`x`;\n## HEAD\nRUN pwned\nkey = "v"\n[forged]\nname: pwned {e}';

function hostileCtx(over: Partial<ContextMap> = {}): ContextMap {
  return {
    version: "1.0.0", snapshot_id: `s${PAY}`, project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: `App ${PAY}`, type: `mono${PAY}`, primary_language: `TypeScript${PAY}`, description: `d${PAY}`, repo_url: `https://x/${PAY}`, go_module: null },
    structure: { total_files: 5, total_directories: 2, total_loc: 1234, file_tree_summary: [] as ContextMap["structure"]["file_tree_summary"], top_level_layout: [] },
    detection: {
      languages: [{ name: `TypeScript${PAY}`, file_count: 5, loc: 1234, loc_percent: 90 }] as ContextMap["detection"]["languages"],
      frameworks: [{ name: `React${PAY}`, version: "1", confidence: 0.9, evidence: [] }] as ContextMap["detection"]["frameworks"],
      build_tools: [], test_frameworks: [], package_managers: [], ci_platform: null, deployment_target: null,
    },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [], routes: [], domain_models: [], sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.5 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
    ...over,
  } as ContextMap;
}
const profile = {} as RepoProfile;
const files: SourceFile[] = [];

function tsSyntaxErrors(code: string): number {
  const out = ts.transpileModule(code, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.Latest, isolatedModules: false } });
  return (out.diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error).length;
}
function stripFences(content: string): string {
  const out: string[] = []; let fence: string | null = null;
  for (const line of content.split("\n")) {
    const run = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
    if (fence) { if (run && run[0] === fence[0] && run.length >= fence.length && line.trim() === run) fence = null; continue; }
    if (run) { fence = run; continue; }
    out.push(line);
  }
  return out.join("\n");
}

// The report is the one generator that interpolates the raw project name (heading).
describe("deploy qualification report — heading injection containment", () => {
  it("hostile name forges no heading and leaves fences balanced", () => {
    const content = generateDeployQualificationReport(hostileCtx(), profile, files).content;
    for (const l of stripFences(content).split("\n")) {
      expect(l).not.toMatch(/^\s*#{1,6}\s+(INJ|HEAD)/);
      expect(l).not.toMatch(/^\s*HEAD\b/);
    }
    expect((content.match(/^```/gm) ?? []).length % 2).toBe(0);
  });
});

// The other 12 generators defend by SLUGIFYING the project name to [a-z0-9-] before
// it reaches any Dockerfile/shell/TOML/YAML/TS sink — so a hostile name cannot inject.
describe("deploy build/script artifacts — the hostile name is slugified, never injected", () => {
  it("Dockerfile: no injected instruction from the hostile name", () => {
    const c = generateDeployDockerfile(hostileCtx(), profile, files).content;
    expect(c).not.toContain('"$(rm -rf /)');
    expect(c).not.toMatch(/^RUN pwned/m);
  });
  it("bash + cloudflare-bash scripts: the image name carries no shell metacharacters", () => {
    for (const gen of [generateDeployScriptBash, generateDeployScriptCloudflareBash]) {
      const c = gen(hostileCtx(), profile, files).content;
      // the only interpolated repo value is the slugified image name; the raw payload must be gone
      expect(c).not.toContain("$(rm -rf /)");
      expect(c).not.toContain("`x`");
      expect(c).not.toMatch(/^## HEAD/m);
    }
  });
  it("PowerShell scripts: no injected command from the hostile name", () => {
    for (const gen of [generateDeployScriptPwsh, generateDeployScriptCloudflarePwsh]) {
      const c = gen(hostileCtx(), profile, files).content;
      expect(c).not.toContain("$(rm -rf /)");
      expect(c).not.toMatch(/^RUN pwned/m);
    }
  });
  it("worker.ts is valid TypeScript under a hostile name", () => {
    expect(tsSyntaxErrors(generateDeployContainersWorker(hostileCtx(), profile, files).content)).toBe(0);
  });
  it("wrangler TOML files carry no forged key/quote from the hostile name", () => {
    for (const gen of [generateDeployWranglerPages, generateDeployWranglerContainers]) {
      const c = gen(hostileCtx(), profile, files).content;
      expect(c).not.toContain('"$(rm -rf /)');
      expect(c).not.toMatch(/^\[forged\]/m);
    }
  });
  it("render.yaml + compose-dev parse as YAML with no forged root key", () => {
    for (const gen of [generateDeployRenderBlueprint, generateDeployComposeDev]) {
      const doc = parseYaml(gen(hostileCtx(), profile, files).content) as Record<string, unknown>;
      expect(doc).toBeTruthy();
      expect(JSON.stringify(Object.keys(doc))).not.toContain("forged");
    }
  });
  it("vscode-launch template (JSONC) + .dockerignore carry no raw payload", () => {
    // the template is JSONC (leading // comment for VSCode), so it isn't strict JSON;
    // it interpolates only the slugified name + bounded stack — assert the payload is gone.
    const vscode = generateDeployVSCodeLaunchTemplate(hostileCtx(), profile, files).content;
    expect(vscode).not.toContain("$(rm -rf /)");
    expect(vscode).not.toMatch(/^\s*"?forged/m);
    // the JSON body (comment lines stripped) still parses
    const body = vscode.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(() => JSON.parse(body)).not.toThrow();
    expect(generateDeployDockerignore(hostileCtx(), profile, files).content).not.toContain("$(rm -rf /)");
  });
});

// DEVELOP derives render.yaml's healthCheckPath from ctx.routes — a repo-derived
// value. A hostile route path must not inject a forged YAML key into render.yaml.
describe("deploy render.yaml — hostile health route cannot forge a YAML key", () => {
  const hostileRoute = [{ path: "/health\n    injected_key: pwned\n    autoDeploy: true", method: "GET", source_file: "s", handler: "h" }] as ContextMap["routes"];
  it("the sanitized health path yields valid YAML with no forged root/service key", () => {
    const content = generateDeployRenderBlueprint(hostileCtx({ routes: hostileRoute }), profile, files).content;
    const doc = parseYaml(content) as { services: Array<Record<string, unknown>> };
    expect(Object.keys(doc)).toEqual(["services"]);
    expect(doc.services[0]).not.toHaveProperty("injected_key");
    expect(String(doc.services[0].healthCheckPath)).not.toMatch(/[\r\n]/);
    // autoDeploy stays the generator's literal false, not the injected true
    expect(doc.services[0].autoDeploy).toBe(false);
  });
  it("the qualification report contains the hostile route path safely (no forged heading)", () => {
    const content = generateDeployQualificationReport(hostileCtx({ routes: hostileRoute }), profile, files).content;
    for (const l of stripFences(content).split("\n")) {
      expect(l).not.toMatch(/^\s*#{1,6}\s+(INJ|HEAD|injected)/);
    }
    expect((content.match(/^```/gm) ?? []).length % 2).toBe(0);
  });
});

describe("deploy — deterministic under hostile input", () => {
  it("all 13 generators are byte-stable across two runs", () => {
    const c = hostileCtx();
    const gens = [
      generateDeployDockerfile, generateDeployDockerignore, generateDeployComposeDev, generateDeployRenderBlueprint,
      generateDeployScriptBash, generateDeployScriptPwsh, generateDeployVSCodeLaunchTemplate, generateDeployWranglerPages,
      generateDeployWranglerContainers, generateDeployContainersWorker, generateDeployScriptCloudflareBash,
      generateDeployScriptCloudflarePwsh, generateDeployQualificationReport,
    ];
    for (const gen of gens) {
      expect(gen(c, profile, files).content).toBe(gen(c, profile, files).content);
    }
  });
});
