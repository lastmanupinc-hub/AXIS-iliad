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
    snapshot_id: "snap-gen-001",
    project_id: "proj-gen-001",
    created_at: new Date().toISOString(),
    input_method: "repo_snapshot_upload",
    manifest: {
      project_name: "test-app",
      project_type: "web_application",
      frameworks: ["next", "prisma"],
      goals: ["Generate AI context files"],
      requested_outputs: ["context-map.json", "AGENTS.md", "CLAUDE.md", ".cursorrules"],
    },
    file_count: files.length,
    total_size_bytes: files.reduce((s, f) => s + f.size, 0),
    files,
    status: "ready",
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

describe("generateFiles", () => {
  it("always includes core search outputs", () => {
    const result = generateFiles(makeInput([]));
    const paths = result.files.map(f => f.path);
    expect(paths).toContain(".ai/context-map.json");
    expect(paths).toContain(".ai/repo-profile.yaml");
    expect(paths).toContain("architecture-summary.md");
  });

  it("generates skills files when requested", () => {
    const result = generateFiles(makeInput(["AGENTS.md", "CLAUDE.md", ".cursorrules"]));
    const paths = result.files.map(f => f.path);
    expect(paths).toContain("AGENTS.md");
    expect(paths).toContain("CLAUDE.md");
    expect(paths).toContain(".cursorrules");
  });

  it("generates debug files when requested", () => {
    const result = generateFiles(makeInput([".ai/debug-playbook.md", "incident-template.md", "tracing-rules.md"]));
    const paths = result.files.map(f => f.path);
    expect(paths).toContain(".ai/debug-playbook.md");
    expect(paths).toContain("incident-template.md");
    expect(paths).toContain("tracing-rules.md");
  });

  it("generates frontend files when requested", () => {
    const result = generateFiles(makeInput([".ai/frontend-rules.md", "component-guidelines.md"]));
    const paths = result.files.map(f => f.path);
    expect(paths).toContain(".ai/frontend-rules.md");
    expect(paths).toContain("component-guidelines.md");
  });

  it("resolves aliases", () => {
    const result = generateFiles(makeInput(["context-map.json", "CURSOR.md"]));
    const paths = result.files.map(f => f.path);
    expect(paths).toContain(".ai/context-map.json");
    expect(paths).toContain(".cursorrules");
  });

  it("deduplicates when alias and canonical both requested", () => {
    const result = generateFiles(makeInput([".ai/context-map.json", "context-map.json"]));
    const ctxFiles = result.files.filter(f => f.path === ".ai/context-map.json");
    expect(ctxFiles.length).toBe(1);
  });

  it("skips unknown outputs and records them", () => {
    const result = generateFiles(makeInput(["nonexistent-file.md"]));
    expect(result.skipped.length).toBe(1);
    expect(result.skipped[0].path).toBe("nonexistent-file.md");
  });

  it("includes snapshot and project IDs in result", () => {
    const result = generateFiles(makeInput([]));
    expect(result.snapshot_id).toBe("snap-gen-001");
    expect(result.project_id).toBe("proj-gen-001");
    expect(result.generated_at).toBeTruthy();
  });

  it("each file has program and content_type", () => {
    const result = generateFiles(makeInput([
      "AGENTS.md", ".ai/debug-playbook.md", ".ai/frontend-rules.md",
    ]));
    for (const file of result.files) {
      expect(file.program).toBeTruthy();
      expect(file.content_type).toBeTruthy();
      expect(file.content.length).toBeGreaterThan(0);
    }
  });
});

describe("search generators content", () => {
  const input = makeInput([]);
  const result = generateFiles(input);

  it("context-map.json is valid JSON", () => {
    const file = result.files.find(f => f.path === ".ai/context-map.json")!;
    const parsed = JSON.parse(file.content);
    expect(parsed.version).toBe("1.0.0");
    expect(parsed.project_identity.name).toBe("test-app");
  });

  it("repo-profile.yaml contains project name", () => {
    const file = result.files.find(f => f.path === ".ai/repo-profile.yaml")!;
    expect(file.content).toContain("test-app");
    expect(file.content).toContain("version:");
  });

  it("architecture-summary.md has markdown headings", () => {
    const file = result.files.find(f => f.path === "architecture-summary.md")!;
    expect(file.content).toContain("# ");
    expect(file.content).toContain("test-app");
  });
});

describe("skills generators content", () => {
  const result = generateFiles(makeInput(["AGENTS.md", "CLAUDE.md", ".cursorrules"]));

  it("AGENTS.md contains stack info", () => {
    const file = result.files.find(f => f.path === "AGENTS.md")!;
    expect(file.content).toContain("TypeScript");
    expect(file.content.length).toBeGreaterThan(100);
  });

  it("CLAUDE.md contains project overview", () => {
    const file = result.files.find(f => f.path === "CLAUDE.md")!;
    expect(file.content).toContain("test-app");
    expect(file.content.length).toBeGreaterThan(100);
  });

  it(".cursorrules contains rules", () => {
    const file = result.files.find(f => f.path === ".cursorrules")!;
    expect(file.content.length).toBeGreaterThan(50);
  });
});

describe("debug generators content", () => {
  const result = generateFiles(makeInput([".ai/debug-playbook.md", "incident-template.md", "tracing-rules.md"]));

  it("debug playbook has triage steps", () => {
    const file = result.files.find(f => f.path === ".ai/debug-playbook.md")!;
    expect(file.content.toLowerCase()).toContain("triage");
    expect(file.content.length).toBeGreaterThan(200);
  });

  it("incident template has structure", () => {
    const file = result.files.find(f => f.path === "incident-template.md")!;
    expect(file.content.length).toBeGreaterThan(100);
  });

  it("tracing rules include trace points", () => {
    const file = result.files.find(f => f.path === "tracing-rules.md")!;
    expect(file.content.length).toBeGreaterThan(100);
  });
});

describe("frontend generators content", () => {
  const result = generateFiles(makeInput([".ai/frontend-rules.md", "component-guidelines.md"]));

  it("frontend rules mention component conventions", () => {
    const file = result.files.find(f => f.path === ".ai/frontend-rules.md")!;
    expect(file.content.length).toBeGreaterThan(200);
  });

  it("component guidelines have structure", () => {
    const file = result.files.find(f => f.path === "component-guidelines.md")!;
    expect(file.content.length).toBeGreaterThan(100);
  });
});

describe("seo generators content", () => {
  const result = generateFiles(makeInput([".ai/seo-rules.md", "schema-recommendations.json", "route-priority-map.md", "content-audit.md"]));

  it("generates all 4 seo files", () => {
    const seoFiles = result.files.filter(f => f.program === "seo");
    expect(seoFiles.length).toBe(4);
  });

  it("seo-rules.md contains meta tag guidance", () => {
    const file = result.files.find(f => f.path === ".ai/seo-rules.md")!;
    expect(file.content).toContain("Meta Tags");
    expect(file.content).toContain("Structured Data");
    expect(file.content.length).toBeGreaterThan(200);
  });

  it("schema-recommendations.json is valid JSON", () => {
    const file = result.files.find(f => f.path === "schema-recommendations.json")!;
    const parsed = JSON.parse(file.content);
    expect(parsed.recommendations).toBeTruthy();
    expect(Array.isArray(parsed.recommendations)).toBe(true);
    expect(parsed.recommendations.length).toBeGreaterThan(0);
  });

  it("route-priority-map.md has sitemap section", () => {
    const file = result.files.find(f => f.path === "route-priority-map.md")!;
    expect(file.content).toContain("test-app");
    expect(file.content.length).toBeGreaterThan(50);
  });

  it("content-audit.md has readiness score", () => {
    const file = result.files.find(f => f.path === "content-audit.md")!;
    expect(file.content).toContain("SEO Readiness Score");
    expect(file.content).toContain("Core Web Vitals");
    expect(file.content.length).toBeGreaterThan(200);
  });
});

describe("optimization generators content", () => {
  const result = generateFiles(makeInput([".ai/optimization-rules.md", "prompt-diff-report.md", "cost-estimate.json"]));

  it("generates all 3 optimization files", () => {
    const optFiles = result.files.filter(f => f.program === "optimization");
    expect(optFiles.length).toBe(3);
  });

  it("optimization-rules.md has context budget and high-value files", () => {
    const file = result.files.find(f => f.path === ".ai/optimization-rules.md")!;
    expect(file.content).toContain("Context Window Budget");
    expect(file.content).toContain("High-Value Files");
    expect(file.content).toContain("test-app");
    expect(file.content.length).toBeGreaterThan(200);
  });

  it("prompt-diff-report.md has before/after scores", () => {
    const file = result.files.find(f => f.path === "prompt-diff-report.md")!;
    expect(file.content).toContain("Score Summary");
    expect(file.content).toContain("Before");
    expect(file.content).toContain("After");
    expect(file.content).toContain("Recommendations");
    expect(file.content.length).toBeGreaterThan(200);
  });

  it("cost-estimate.json is valid JSON with cost matrix", () => {
    const file = result.files.find(f => f.path === "cost-estimate.json")!;
    const parsed = JSON.parse(file.content);
    expect(parsed.summary).toBeTruthy();
    expect(parsed.summary.total_loc).toBeGreaterThan(0);
    expect(parsed.cost_matrix).toBeTruthy();
    expect(Array.isArray(parsed.cost_matrix)).toBe(true);
    expect(parsed.cost_matrix.length).toBeGreaterThan(0);
    expect(parsed.language_breakdown).toBeTruthy();
  });

  it("resolves optimization-rules.md alias", () => {
    const result2 = generateFiles(makeInput(["optimization-rules.md"]));
    const paths = result2.files.map(f => f.path);
    expect(paths).toContain(".ai/optimization-rules.md");
  });
});

describe("listAvailableGenerators", () => {
  it("returns all registered generators", () => {
    const generators = listAvailableGenerators();
    expect(generators.length).toBe(18);
    const paths = generators.map(g => g.path);
    expect(paths).toContain(".ai/context-map.json");
    expect(paths).toContain("AGENTS.md");
    expect(paths).toContain(".ai/debug-playbook.md");
    expect(paths).toContain(".ai/frontend-rules.md");
    expect(paths).toContain(".ai/seo-rules.md");
    expect(paths).toContain("schema-recommendations.json");
    expect(paths).toContain(".ai/optimization-rules.md");
    expect(paths).toContain("prompt-diff-report.md");
    expect(paths).toContain("cost-estimate.json");
  });
});
