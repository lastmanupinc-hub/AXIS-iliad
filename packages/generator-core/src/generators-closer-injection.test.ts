import { describe, it, expect } from "vitest";
import { parse as parseYaml } from "yaml";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import {
  generatePackagingReadme,
  generatePackagingLicense,
  generateCloserDockerfile,
  generateCloserDockerCompose,
  generateCloserCiWorkflow,
  generateCloserReleaseWorkflow,
  generateCloserManifestNpm,
  generateCloserManifestUnreal,
  generateCloserManifestVsCode,
  generateCloserManifestDockerHub,
  generateCloserManifestGitHubMarketplace,
  generateCloserTrustAttestation,
  generateCloserMerkleProof,
  generateCloserPackagingReport,
  generateDistributableGuide,
  generateMakefileWithShipTarget,
} from "./generators-closer.js";

// Every breakout char across markdown / Dockerfile / Makefile(make+shell) / YAML.
const PAY = 'INJ"$(shell pwn)\'`|c|{e} ## HEAD RUN pwned forged_key: 1 - item newtarget: pwn';
// A multi-line variant carried through the branding config (JSON survives newlines).
const MULTILINE = 'Prod\n## HEAD\nRUN pwned\nforged_top: 1\nnewtarget:\n\t@echo pwned "$(shell evil)"';

function hostileCtx(over: Partial<ContextMap> = {}): ContextMap {
  return {
    version: "1.0.0", snapshot_id: `snap${PAY}`, project_id: `proj${PAY}`, generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: `App${MULTILINE}`, type: `mono${PAY}`, primary_language: `TypeScript${MULTILINE}`, description: `d${PAY}`, repo_url: `https://x/${MULTILINE}`, go_module: null },
    structure: { total_files: 5, total_directories: 2, total_loc: 1234, file_tree_summary: [] as ContextMap["structure"]["file_tree_summary"], top_level_layout: [] },
    detection: {
      languages: [{ name: `TypeScript${PAY}`, file_count: 5, loc: 1234, loc_percent: 90 }] as ContextMap["detection"]["languages"],
      frameworks: [{ name: `React${MULTILINE}`, version: "1", confidence: 0.9, evidence: [] }] as ContextMap["detection"]["frameworks"],
      build_tools: [], test_frameworks: [], package_managers: [], ci_platform: null, deployment_target: null,
    },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [], routes: [], domain_models: [], sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.5 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
    ...over,
  } as ContextMap;
}
const profile = { project: { primary_language: `TypeScript${MULTILINE}` }, health: { separation_score: 0.5 } } as unknown as RepoProfile;
// Hostile branding config drives product_name / tagline (the real attack surface).
const files: SourceFile[] = [
  { path: "branding.json", content: JSON.stringify({ product_name: `Prod${MULTILINE}`, tagline: `Tag${MULTILINE}` }), size: 200 } as SourceFile,
];

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
function assertMarkdownContained(content: string) {
  for (const l of stripFences(content).split("\n")) {
    expect(l).not.toMatch(/^\s*#{1,6}\s+(INJ|HEAD)/);
    expect(l).not.toMatch(/^\s*HEAD\b/);
  }
  expect((content.match(/^```/gm) ?? []).length % 2).toBe(0);
}

describe("closer markdown — injection containment", () => {
  it("README / dockerhub / github-marketplace / report / DISTRIBUTABLE forge no heading, balance fences", () => {
    assertMarkdownContained(generatePackagingReadme(hostileCtx(), profile, files).content);
    assertMarkdownContained(generateCloserManifestDockerHub(hostileCtx(), profile, files).content);
    assertMarkdownContained(generateCloserManifestGitHubMarketplace(hostileCtx(), profile, files).content);
    assertMarkdownContained(generateCloserPackagingReport(hostileCtx(), profile, files).content);
    assertMarkdownContained(generateDistributableGuide(hostileCtx(), profile, files).content);
  });
});

describe("Dockerfile — no injected build instruction (build RCE)", () => {
  it("the hostile name/repo_url stay inside LABEL values; no new RUN/ENV/FROM line", () => {
    const content = generateCloserDockerfile(hostileCtx(), profile, files).content;
    for (const line of content.split("\n")) {
      // any line carrying payload text must be a LABEL (the only sink); the payload's
      // `RUN pwned` must never become a real instruction line.
      if (/pwned|forged_top|newtarget/.test(line)) {
        expect(line.trimStart().startsWith("LABEL ")).toBe(true);
      }
    }
    expect(content).not.toMatch(/^RUN pwned/m);
    expect(content).not.toMatch(/^\s*FROM .*newtarget/m);
  });
});

describe("Makefile — no injected recipe/target and no make-level $ expansion (recipe RCE)", () => {
  it("hostile name/lang/frameworks forge no target and $ is doubled", () => {
    const content = generateMakefileWithShipTarget(hostileCtx(), profile, files).content;
    const targetName = (l: string) => l.match(/^([a-zA-Z][\w-]*):/)?.[1];
    const cleanTargets = new Set(
      generateMakefileWithShipTarget(cleanCtx(), cleanProfile, []).content
        .split("\n").map(targetName).filter(Boolean),
    );
    // No line may DEFINE a target (name before the ':') that the clean build doesn't —
    // the payload's `newtarget:` must stay inside a collapsed comment / single-quoted echo.
    for (const line of content.split("\n")) {
      const t = targetName(line);
      if (t) expect(cleanTargets.has(t), `forged target: ${t}`).toBe(true);
    }
    // In RECIPE lines (tab-prefixed, where make expands `$`), the payload's
    // `$(shell evil)` must be make-neutralized to `$$(…)` — never a lone `$(…)`.
    // (In `#` comments make never expands, so a lone `$(…)` there is inert.)
    for (const line of content.split("\n").filter(l => l.startsWith("\t"))) {
      expect(line, `un-doubled $ in recipe: ${line}`).not.toMatch(/(^|[^$])\$\(shell evil\)/);
    }
    expect(content).not.toMatch(/^\tpwn/m);
  });
});

describe("closer YAML — valid + no forged top-level key", () => {
  const yamlGen: Array<[string, string]> = [
    ["docker-compose.yml", generateCloserDockerCompose(hostileCtx(), profile, files).content],
    ["ci.yml", generateCloserCiWorkflow(hostileCtx(), profile, files).content],
    ["release.yml", generateCloserReleaseWorkflow(hostileCtx(), profile, files).content],
  ];
  for (const [name, content] of yamlGen) {
    it(`${name} parses and grows no forged root key`, () => {
      const doc = parseYaml(content) as Record<string, unknown>;
      expect(doc).toBeTruthy();
      expect(JSON.stringify(Object.keys(doc))).not.toContain("forged_top");
      expect(JSON.stringify(Object.keys(doc))).not.toContain("newtarget");
    });
  }
});

describe("closer JSON manifests — valid under hostile input", () => {
  it("npm / unreal / vscode / attestation / merkle all parse", () => {
    for (const gen of [generateCloserManifestNpm, generateCloserManifestUnreal, generateCloserManifestVsCode, generateCloserTrustAttestation, generateCloserMerkleProof]) {
      expect(() => JSON.parse(gen(hostileCtx(), profile, files).content)).not.toThrow();
    }
  });
});

describe("closer — deterministic under hostile input", () => {
  it("every generator is byte-stable across two runs", () => {
    const c = hostileCtx();
    const gens = [
      generatePackagingReadme, generatePackagingLicense, generateCloserDockerfile, generateCloserDockerCompose,
      generateCloserCiWorkflow, generateCloserReleaseWorkflow, generateCloserManifestNpm, generateCloserManifestUnreal,
      generateCloserManifestVsCode, generateCloserManifestDockerHub, generateCloserManifestGitHubMarketplace,
      generateCloserTrustAttestation, generateCloserMerkleProof, generateCloserPackagingReport, generateDistributableGuide,
      generateMakefileWithShipTarget,
    ];
    for (const gen of gens) {
      expect(gen(c, profile, files).content).toBe(gen(c, profile, files).content);
    }
  });
});

// ── clean-input helpers (for the Makefile forged-target diff) ──
function cleanCtx(): ContextMap {
  return hostileCtx({
    project_identity: { name: "myapp", type: "app", primary_language: "TypeScript", description: null, repo_url: "https://github.com/o/r", go_module: null },
    detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: [], ci_platform: null, deployment_target: null },
  });
}
const cleanProfile = { project: { primary_language: "TypeScript" }, health: { separation_score: 0.5 } } as unknown as RepoProfile;
