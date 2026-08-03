import { describe, it, expect } from "vitest";
import { generateFiles, listAvailableGenerators } from "./generate.js";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { SnapshotRecord, FileEntry } from "@axis/snapshots";
import type { GeneratorInput } from "./types.js";

function makeSnapshot(): SnapshotRecord {
  const files: FileEntry[] = [
    { path: "src/index.ts", content: 'import { db } from "./db";\nexport function main() { return db.query(); }', size: 70 },
    { path: "src/db.ts", content: 'export const db = { query: () => [] };', size: 38 },
    { path: "next.config.mjs", content: "export default {}", size: 18 },
    { path: "package.json", content: '{"name":"test-app","dependencies":{"next":"14.0.0","react":"18.0.0","@prisma/client":"5.0.0"},"devDependencies":{"vitest":"1.0.0","typescript":"5.0.0"}}', size: 160 },
    { path: "app/page.tsx", content: "export default function Home() { return <div>Home</div> }", size: 58 },
    { path: "app/api/users/route.ts", content: 'export async function GET() { return Response.json([]) }', size: 56 },
    { path: "tailwind.config.ts", content: "export default {}", size: 18 },
    { path: "prisma/schema.prisma", content: "model User { id Int @id\n  name String\n  email String @unique\n}", size: 65 },
    { path: "tsconfig.json", content: '{"compilerOptions":{"strict":true}}', size: 34 },
    { path: ".github/workflows/ci.yml", content: "name: CI\non: [push]", size: 20 },
    { path: "tests/index.test.ts", content: 'import { test } from "vitest";\ntest("works", () => expect(true).toBe(true));', size: 78 },
    { path: "components/Button.tsx", content: 'export function Button({ children }: { children: React.ReactNode }) { return <button>{children}</button> }', size: 104 },
    { path: "lib/utils.ts", content: 'export function cn(...classes: string[]) { return classes.filter(Boolean).join(" "); }', size: 85 },
  ];
  return {
    snapshot_id: "snap-pgm-001",
    project_id: "proj-pgm-001",
    created_at: new Date().toISOString(),
    input_method: "repo_snapshot_upload",
    manifest: {
      project_name: "test-app",
      project_type: "web_application",
      frameworks: ["next", "prisma"],
      goals: ["Generate AI context files"],
      requested_outputs: [],
    },
    file_count: files.length,
    total_size_bytes: files.reduce((s, f) => s + f.size, 0),
    files,
    status: "ready",
    account_id: null,
  };
}

function makeInput(requested: string[] = []): GeneratorInput {
  const snapshot = makeSnapshot();
  return {
    context_map: buildContextMap(snapshot),
    repo_profile: buildRepoProfile(snapshot),
    requested_outputs: requested,
  };
}

// All generators organized by program
const PROGRAM_OUTPUTS: Record<string, string[]> = {
  search: ["context-map.json", "repo-profile.yaml", "architecture-summary.md", "dependency-hotspots.md", "symbol-index.json", "repo-run-stats.json"],
  skills: ["AGENTS.md", "CLAUDE.md", ".cursorrules", "workflow-pack.md", "policy-pack.md"],
  debug: ["debug-playbook.md", "incident-template.md", "tracing-rules.md", "root-cause-checklist.md"],
  frontend: ["frontend-rules.md", "component-guidelines.md", "layout-patterns.md", "ui-audit.md"],
  seo: ["seo-rules.md", "schema-recommendations.json", "route-priority-map.md", "content-audit.md", "meta-tag-audit.json"],
  optimization: ["optimization-rules.md", "prompt-diff-report.md", "cost-estimate.json", "token-budget-plan.md"],
  theme: ["design-tokens.json", "theme.css", "theme-guidelines.md", "component-theme-map.json", "dark-mode-tokens.json"],
  brand: ["brand-guidelines.md", "voice-and-tone.md", "content-constraints.md", "messaging-system.yaml", "channel-rulebook.md"],
  superpowers: ["superpower-pack.md", "workflow-registry.json", "test-generation-rules.md", "refactor-checklist.md", "automation-pipeline.yaml"],
  marketing: ["campaign-brief.md", "funnel-map.md", "sequence-pack.md", "cro-playbook.md", "ab-test-plan.md"],
  notebook: ["notebook-summary.md", "source-map.json", "study-brief.md", "research-threads.md", "citation-index.json"],
  obsidian: ["obsidian-skill-pack.md", "vault-rules.md", "graph-prompt-map.json", "linking-policy.md", "template-pack.md"],
  mcp: ["mcp-config.json", "mcp-registry-metadata.json", "protocol-spec.md", "spec.types.ts", "mcp/README.md", "mcp/project-setup.md", "mcp/build-artifacts.md", "mcp/package-json.root.template.json", "mcp/package-json.package.template.json", "mcp/tsconfig.root.template.json", "mcp/tsconfig.package.template.json", "mcp/monorepo-structure.md", "mcp/core-implementation-artifacts.md", "mcp/testing-documentation-polish-artifacts.md", "connector-map.yaml", "capability-registry.json", "server-manifest.yaml", "mcp/fintech-mcp-surface-package.md", "mcp/fintech-domain-schema.yaml"],
  artifacts: ["generated-component.tsx", "dashboard-widget.tsx", "embed-snippet.ts", "artifact-spec.md", "component-library.json", "prd.md", "design.md", "tasks.md", "context.md", "index.html", "capability-map.yaml"],
  remotion: ["remotion-script.ts", "scene-plan.md", "render-config.json", "asset-checklist.md", "storyboard.md"],
  canvas: ["canvas-spec.json", "social-pack.md", "poster-layouts.md", "asset-guidelines.md", "brand-board.md"],
  algorithmic: ["generative-sketch.ts", "parameter-pack.json", "collection-map.md", "export-manifest.yaml", "variation-matrix.json"],
  "agentic-purchasing": ["agent-purchasing-playbook.md", "product-schema.json", "checkout-flow.md", "negotiation-rules.md", "commerce-registry.json"],
  closer: [
    "packaging/README.md",
    "packaging/LICENSE",
    "Dockerfile",
    "docker-compose.yml",
    ".github/workflows/ci.yml",
    ".github/workflows/release.yml",
    "packaging/manifests/npm-package.json",
    "packaging/manifests/unreal.uplugin",
    "packaging/manifests/vscode-extension.json",
    "packaging/manifests/dockerhub-repository.md",
    "packaging/manifests/github-marketplace-listing.md",
    "packaging/trust-fabric/attestation.json",
    "packaging/trust-fabric/merkle-proof.json",
    "packaging-report.md",
    "DISTRIBUTABLE.md",
    "Makefile",
  ],
  deploy: [
    "deploy/Dockerfile",
    "deploy/Dockerfile.dockerignore",
    "deploy/docker-compose.dev.yml",
    "deploy/render.yaml",
    "deploy/deploy.sh",
    "deploy/deploy.ps1",
    "deploy/vscode-launch.json.template",
    "deploy/wrangler.pages.toml",
    "deploy/wrangler.containers.toml",
    "deploy/worker.ts",
    "deploy/deploy-cloudflare.sh",
    "deploy/deploy-cloudflare.ps1",
    "deploy/deploy-qualification-report.md",
  ],
};

describe("generateFiles — all 20 programs produce valid output", () => {
  const requestedOutputs = Object.values(PROGRAM_OUTPUTS).flat();
  const input = makeInput(requestedOutputs);

  it("generates one file per requested output with 0 skipped", () => {
    const result = generateFiles(input);
    expect(result.skipped).toEqual([]);
    expect(result.files.length).toBe(requestedOutputs.length);
  });

  it("verify-harness substrate: every one of the 20 programs' real output passes its structural self-check", () => {
    const result = generateFiles(input);
    const programs = Object.keys(PROGRAM_OUTPUTS);
    expect(result.verification).toBeDefined();
    const verifiedPrograms = result.verification!.map((r) => r.program).sort();
    expect(verifiedPrograms).toEqual([...programs].sort());
    const failing = result.verification!.filter((r) => !r.pass);
    expect(failing).toEqual([]);
  });

  for (const [program, outputs] of Object.entries(PROGRAM_OUTPUTS)) {
    describe(`program: ${program}`, () => {
      for (const output of outputs) {
        it(`generates ${output}`, () => {
          const result = generateFiles({ ...input, requested_outputs: [output] });
          const file = result.files.find(f => f.path === output);
          expect(file).toBeTruthy();
          expect(file!.content.length).toBeGreaterThan(0);
          expect(file!.content_type).toBeTruthy();
          expect(file!.program).toBeTruthy();
          expect(file!.description).toBeTruthy();
        });
      }
    });
  }
});

describe("generateFiles — content type correctness", () => {
  const input = makeInput(Object.values(PROGRAM_OUTPUTS).flat());
  const result = generateFiles(input);

  it("JSON files have application/json content type", () => {
    const jsonFiles = result.files.filter(f => f.path.endsWith(".json"));
    for (const file of jsonFiles) {
      expect(file.content_type).toBe("application/json");
      // Verify it's actually valid JSON
      expect(() => JSON.parse(file.content)).not.toThrow();
    }
  });

  it("YAML files have application/yaml content type", () => {
    const yamlFiles = result.files.filter(f => f.path.endsWith(".yaml") || f.path.endsWith(".yml"));
    for (const file of yamlFiles) {
      expect(["application/yaml", "text/yaml"]).toContain(file.content_type);
      expect(file.content.length).toBeGreaterThan(0);
    }
  });

  it("Markdown files have text/markdown content type", () => {
    const mdFiles = result.files.filter(f => f.path.endsWith(".md"));
    for (const file of mdFiles) {
      expect(file.content_type).toBe("text/markdown");
      expect(file.content.length).toBeGreaterThan(0);
    }
  });

  it("CSS files have text/css content type", () => {
    const cssFiles = result.files.filter(f => f.path.endsWith(".css"));
    for (const file of cssFiles) {
      expect(file.content_type).toBe("text/css");
    }
  });

  it("TypeScript/TSX files have appropriate content type", () => {
    const tsFiles = result.files.filter(f => f.path.endsWith(".ts") || f.path.endsWith(".tsx"));
    for (const file of tsFiles) {
      expect(["text/typescript", "text/tsx"]).toContain(file.content_type);
    }
  });
});

describe("generateFiles — edge cases", () => {
  it("always includes core 3 search outputs even with empty requested_outputs", () => {
    const result = generateFiles(makeInput([]));
    const paths = result.files.map(f => f.path);
    expect(paths).toContain("context-map.json");
    expect(paths).toContain("repo-profile.yaml");
    expect(paths).toContain("architecture-summary.md");
    expect(result.files.length).toBe(3);
  });

  it("deduplicates when both alias and canonical are requested", () => {
    const result = generateFiles(makeInput(["context-map.json", ".ai/context-map.json"]));
    const ctxMapFiles = result.files.filter(f => f.path === "context-map.json");
    expect(ctxMapFiles.length).toBe(1);
  });

  it("records unknown outputs in skipped array", () => {
    const result = generateFiles(makeInput(["nonexistent-output.xyz"]));
    expect(result.skipped.length).toBe(1);
    expect(result.skipped[0].path).toBe("nonexistent-output.xyz");
    expect(result.skipped[0].reason).toContain("No generator");
  });

  it("resolves all legacy .ai/-prefixed aliases to bare canonical names", () => {
    const aliases = [
      ["CURSOR.md", ".cursorrules"],
      [".ai/context-map.json", "context-map.json"],
      [".ai/repo-profile.yaml", "repo-profile.yaml"],
      [".ai/debug-playbook.md", "debug-playbook.md"],
      [".ai/frontend-rules.md", "frontend-rules.md"],
      [".ai/seo-rules.md", "seo-rules.md"],
      [".ai/optimization-rules.md", "optimization-rules.md"],
      [".ai/design-tokens.json", "design-tokens.json"],
      [".ai/symbol-index.json", "symbol-index.json"],
    ];
    for (const [alias, canonical] of aliases) {
      const result = generateFiles(makeInput([alias]));
      const file = result.files.find(f => f.path === canonical);
      expect(file, `alias ${alias} should resolve to ${canonical}`).toBeTruthy();
    }
  });

  it("returns correct metadata in result", () => {
    const result = generateFiles(makeInput([]));
    expect(result.snapshot_id).toBe("snap-pgm-001");
    expect(result.project_id).toBe("proj-pgm-001");
    expect(result.generated_at).toBeTruthy();
  });
});

describe("verify-gate generators", () => {
  it("generates a stack-aware verify.sh + verify-full.sh + pre-push hook", () => {
    const v = generateFiles(makeInput(["verify.sh"])).files.find(f => f.path === "verify.sh");
    expect(v).toBeTruthy();
    expect(v!.program).toBe("superpowers");
    expect(v!.content_type).toBe("text/x-shellscript");
    expect(v!.content).toContain("#!/usr/bin/env bash");
    expect(v!.content).toContain("✅ verify passed");
    expect(v!.content).toMatch(/run (lint|test)|tsc --noEmit|pytest|go (vet|test)/);

    const full = generateFiles(makeInput(["verify-full.sh"])).files.find(f => f.path === "verify-full.sh");
    expect(full!.content).toMatch(/run build|next build|go build|pytest -q/);

    const hook = generateFiles(makeInput([".githooks/pre-push"])).files.find(f => f.path === ".githooks/pre-push");
    expect(hook!.content).toContain("core.hooksPath");
    expect(hook!.content).toContain("verify.sh");
  });
});

describe("listAvailableGenerators", () => {
  it("returns all 143 registered generators", () => {
    const generators = listAvailableGenerators();
    expect(generators.length).toBe(143); // +3: verify.sh, verify-full.sh, .githooks/pre-push; +1: ap2-interop-samples.json (WO-07); +1: model-cascade.md (H7.1); +1: architecture-diagram.d2 (app_24)
  });

  it("returns objects with path and program fields", () => {
    const generators = listAvailableGenerators();
    for (const gen of generators) {
      expect(gen).toHaveProperty("path");
      expect(gen).toHaveProperty("program");
      expect(typeof gen.path).toBe("string");
      expect(typeof gen.program).toBe("string");
    }
  });

  it("classifies all 20 programs correctly", () => {
    const generators = listAvailableGenerators();
    const programs = new Set(generators.map(g => g.program));
    expect(programs.size).toBe(20);
    for (const expected of Object.keys(PROGRAM_OUTPUTS)) {
      expect(programs.has(expected), `missing program: ${expected}`).toBe(true);
    }
  });

  it("assigns correct program to each generator", () => {
    const generators = listAvailableGenerators();
    const byProgram = new Map<string, string[]>();
    for (const g of generators) {
      const list = byProgram.get(g.program) ?? [];
      list.push(g.path);
      byProgram.set(g.program, list);
    }
    // Each program should have the expected outputs
    for (const [program, outputs] of Object.entries(PROGRAM_OUTPUTS)) {
      const actual = byProgram.get(program) ?? [];
      for (const output of outputs) {
        expect(actual, `${program} should include ${output}`).toContain(output);
      }
    }
  });

  it("has no 'unknown' program assignments", () => {
    const generators = listAvailableGenerators();
    const unknown = generators.filter(g => g.program === "unknown");
    expect(unknown, `unknown generators: ${unknown.map(g => g.path).join(", ")}`).toHaveLength(0);
  });

  it("includes all known output paths", () => {
    const generators = listAvailableGenerators();
    const paths = generators.map(g => g.path);
    expect(paths).toContain("context-map.json");
    expect(paths).toContain("AGENTS.md");
    expect(paths).toContain("debug-playbook.md");
    expect(paths).toContain("campaign-brief.md");
    expect(paths).toContain("generative-sketch.ts");
  });
});
