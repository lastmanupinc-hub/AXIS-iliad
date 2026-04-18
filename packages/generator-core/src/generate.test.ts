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

describe("theme generators content", () => {
  const result = generateFiles(makeInput([".ai/design-tokens.json", "theme.css", "theme-guidelines.md", "component-theme-map.json"]));

  it("generates all 4 theme files", () => {
    const themeFiles = result.files.filter(f => f.program === "theme");
    expect(themeFiles.length).toBe(4);
  });

  it("design-tokens.json is valid JSON with color and typography tokens", () => {
    const file = result.files.find(f => f.path === ".ai/design-tokens.json")!;
    const parsed = JSON.parse(file.content);
    expect(parsed.colors).toBeTruthy();
    expect(parsed.typography).toBeTruthy();
    expect(parsed.spacing).toBeTruthy();
    expect(parsed.project).toBe("test-app");
  });

  it("theme.css has CSS custom properties", () => {
    const file = result.files.find(f => f.path === "theme.css")!;
    expect(file.content).toContain(":root");
    expect(file.content).toContain("--color-primary-500");
    expect(file.content).toContain("--font-sans");
    expect(file.content).toContain("prefers-color-scheme: dark");
    expect(file.content_type).toBe("text/css");
  });

  it("theme-guidelines.md has styling and color sections", () => {
    const file = result.files.find(f => f.path === "theme-guidelines.md")!;
    expect(file.content).toContain("Styling Approach");
    expect(file.content).toContain("Color Usage");
    expect(file.content).toContain("Typography");
    expect(file.content).toContain("Accessibility");
    expect(file.content.length).toBeGreaterThan(200);
  });

  it("component-theme-map.json is valid JSON with component list", () => {
    const file = result.files.find(f => f.path === "component-theme-map.json")!;
    const parsed = JSON.parse(file.content);
    expect(parsed.summary).toBeTruthy();
    expect(parsed.components).toBeTruthy();
    expect(Array.isArray(parsed.components)).toBe(true);
    expect(parsed.token_usage_guidance).toBeTruthy();
  });

  it("resolves design-tokens.json alias", () => {
    const result2 = generateFiles(makeInput(["design-tokens.json"]));
    const paths = result2.files.map(f => f.path);
    expect(paths).toContain(".ai/design-tokens.json");
  });
});

describe("brand generators content", () => {
  const result = generateFiles(makeInput(["brand-guidelines.md", "voice-and-tone.md", "content-constraints.md", "messaging-system.yaml"]));

  it("generates all 4 brand files", () => {
    const brandFiles = result.files.filter(f => f.program === "brand");
    expect(brandFiles.length).toBe(4);
  });

  it("brand-guidelines.md has identity and voice sections", () => {
    const file = result.files.find(f => f.path === "brand-guidelines.md")!;
    expect(file.content).toContain("Brand Identity");
    expect(file.content).toContain("Voice Attributes");
    expect(file.content).toContain("test-app");
    expect(file.content.length).toBeGreaterThan(200);
  });

  it("voice-and-tone.md has tone spectrum and contexts", () => {
    const file = result.files.find(f => f.path === "voice-and-tone.md")!;
    expect(file.content).toContain("Tone Spectrum");
    expect(file.content).toContain("Error");
    expect(file.content).toContain("Writing Checklist");
    expect(file.content.length).toBeGreaterThan(200);
  });

  it("content-constraints.md has hard and soft constraints", () => {
    const file = result.files.find(f => f.path === "content-constraints.md")!;
    expect(file.content).toContain("Hard Constraints");
    expect(file.content).toContain("Soft Constraints");
    expect(file.content).toContain("AI Content Generation");
    expect(file.content.length).toBeGreaterThan(200);
  });

  it("messaging-system.yaml has product and value props", () => {
    const file = result.files.find(f => f.path === "messaging-system.yaml")!;
    expect(file.content).toContain("product:");
    expect(file.content).toContain("value_propositions:");
    expect(file.content).toContain("test-app");
    expect(file.content_type).toBe("text/yaml");
  });
});

describe("superpowers generators content", () => {
  const result = generateFiles(makeInput(["superpower-pack.md", "workflow-registry.json", "test-generation-rules.md", "refactor-checklist.md"]));

  it("generates all 4 superpowers files", () => {
    const spFiles = result.files.filter(f => f.program === "superpowers");
    expect(spFiles.length).toBe(4);
  });

  it("superpower-pack.md has quick actions and debugging workflow", () => {
    const file = result.files.find(f => f.path === "superpower-pack.md")!;
    expect(file.content).toContain("Quick Actions");
    expect(file.content).toContain("Debugging Workflow");
    expect(file.content).toContain("Code Review Checklist");
    expect(file.content).toContain("test-app");
    expect(file.content.length).toBeGreaterThan(300);
  });

  it("workflow-registry.json has structured workflows", () => {
    const file = result.files.find(f => f.path === "workflow-registry.json")!;
    const data = JSON.parse(file.content);
    expect(data.total_workflows).toBeGreaterThanOrEqual(4);
    expect(data.workflows[0].steps.length).toBeGreaterThan(0);
    expect(file.content_type).toBe("application/json");
  });

  it("test-generation-rules.md has test structure and categories", () => {
    const file = result.files.find(f => f.path === "test-generation-rules.md")!;
    expect(file.content).toContain("Test Framework");
    expect(file.content).toContain("Test Categories");
    expect(file.content).toContain("Unit Tests");
    expect(file.content).toContain("Assertion Patterns");
    expect(file.content.length).toBeGreaterThan(300);
  });

  it("refactor-checklist.md has risk assessment and patterns", () => {
    const file = result.files.find(f => f.path === "refactor-checklist.md")!;
    expect(file.content).toContain("Risk Assessment");
    expect(file.content).toContain("Pre-Refactor Checklist");
    expect(file.content).toContain("Refactoring Patterns");
    expect(file.content).toContain("Post-Refactor Checklist");
    expect(file.content.length).toBeGreaterThan(300);
  });
});

describe("marketing generators content", () => {
  const result = generateFiles(makeInput(["campaign-brief.md", "funnel-map.md", "sequence-pack.md", "cro-playbook.md"]));

  it("generates all 4 marketing files", () => {
    const mktFiles = result.files.filter(f => f.program === "marketing");
    expect(mktFiles.length).toBe(4);
  });

  it("campaign-brief.md has audience and channels", () => {
    const file = result.files.find(f => f.path === "campaign-brief.md")!;
    expect(file.content).toContain("Target Audience");
    expect(file.content).toContain("Distribution Channels");
    expect(file.content).toContain("Campaign Timeline");
    expect(file.content).toContain("test-app");
    expect(file.content.length).toBeGreaterThan(300);
  });

  it("funnel-map.md has funnel stages", () => {
    const file = result.files.find(f => f.path === "funnel-map.md")!;
    expect(file.content).toContain("Awareness");
    expect(file.content).toContain("Interest");
    expect(file.content).toContain("Decision");
    expect(file.content).toContain("Activation");
    expect(file.content).toContain("Advocacy");
    expect(file.content.length).toBeGreaterThan(300);
  });

  it("sequence-pack.md has email sequences", () => {
    const file = result.files.find(f => f.path === "sequence-pack.md")!;
    expect(file.content).toContain("Welcome Sequence");
    expect(file.content).toContain("Re-engagement Sequence");
    expect(file.content).toContain("Contributor Outreach");
    expect(file.content).toContain("test-app");
    expect(file.content.length).toBeGreaterThan(300);
  });

  it("cro-playbook.md has conversion events and experiments", () => {
    const file = result.files.find(f => f.path === "cro-playbook.md")!;
    expect(file.content).toContain("Core Conversion Events");
    expect(file.content).toContain("Optimization Experiments");
    expect(file.content).toContain("Metrics to Track");
    expect(file.content.length).toBeGreaterThan(300);
  });
});

describe("notebook generators content", () => {
  const result = generateFiles(makeInput(["notebook-summary.md", "source-map.json", "study-brief.md", "research-threads.md"]));

  it("generates all 4 notebook files", () => {
    const nbFiles = result.files.filter(f => f.program === "notebook");
    expect(nbFiles.length).toBe(4);
  });

  it("notebook-summary.md has synopsis and architecture", () => {
    const file = result.files.find(f => f.path === "notebook-summary.md")!;
    expect(file.content).toContain("Project Synopsis");
    expect(file.content).toContain("Architecture Overview");
    expect(file.content).toContain("Key Concepts");
    expect(file.content).toContain("test-app");
    expect(file.content.length).toBeGreaterThan(200);
  });

  it("source-map.json has structured project data", () => {
    const file = result.files.find(f => f.path === "source-map.json")!;
    const data = JSON.parse(file.content);
    expect(data.project).toBe("test-app");
    expect(data.structure.total_files).toBeGreaterThan(0);
    expect(data.languages).toBeTruthy();
    expect(file.content_type).toBe("application/json");
  });

  it("study-brief.md has reading order and study questions", () => {
    const file = result.files.find(f => f.path === "study-brief.md")!;
    expect(file.content).toContain("Prerequisites");
    expect(file.content).toContain("Recommended Reading Order");
    expect(file.content).toContain("Study Questions");
    expect(file.content.length).toBeGreaterThan(300);
  });

  it("research-threads.md has investigation threads", () => {
    const file = result.files.find(f => f.path === "research-threads.md")!;
    expect(file.content).toContain("Architecture Threads");
    expect(file.content).toContain("Technology Choices");
    expect(file.content).toContain("Performance");
    expect(file.content).toContain("Test Coverage");
    expect(file.content.length).toBeGreaterThan(300);
  });
});

describe("obsidian generators content", () => {
  const result = generateFiles(makeInput(["obsidian-skill-pack.md", "vault-rules.md", "graph-prompt-map.json", "linking-policy.md"]));

  it("generates all 4 obsidian files", () => {
    const obFiles = result.files.filter(f => f.program === "obsidian");
    expect(obFiles.length).toBe(4);
  });

  it("obsidian-skill-pack.md has templates and prompts", () => {
    const file = result.files.find(f => f.path === "obsidian-skill-pack.md")!;
    expect(file.content).toContain("Daily Note Template");
    expect(file.content).toContain("ADR Template");
    expect(file.content).toContain("Prompt Snippets");
    expect(file.content).toContain("test-app");
    expect(file.content.length).toBeGreaterThan(300);
  });

  it("vault-rules.md has naming and tagging conventions", () => {
    const file = result.files.find(f => f.path === "vault-rules.md")!;
    expect(file.content).toContain("Naming Conventions");
    expect(file.content).toContain("Tagging System");
    expect(file.content).toContain("Linking Rules");
    expect(file.content).toContain("Maintenance Rules");
    expect(file.content.length).toBeGreaterThan(300);
  });

  it("graph-prompt-map.json has nodes and edges", () => {
    const file = result.files.find(f => f.path === "graph-prompt-map.json")!;
    const data = JSON.parse(file.content);
    expect(data.project).toBe("test-app");
    expect(data.total_nodes).toBeGreaterThanOrEqual(4);
    expect(data.total_edges).toBeGreaterThanOrEqual(3);
    expect(data.nodes.length).toBeGreaterThanOrEqual(4);
    expect(file.content_type).toBe("application/json");
  });

  it("linking-policy.md has link types and health metrics", () => {
    const file = result.files.find(f => f.path === "linking-policy.md")!;
    expect(file.content).toContain("Link Types");
    expect(file.content).toContain("Mandatory Links");
    expect(file.content).toContain("Hub Notes");
    expect(file.content).toContain("Graph Health Metrics");
    expect(file.content.length).toBeGreaterThan(300);
  });
});

describe("mcp generators content", () => {
  const result = generateFiles(makeInput(["mcp-config.json", "connector-map.yaml", "capability-registry.json"]));

  it("generates all 3 mcp files", () => {
    const mcpFiles = result.files.filter(f => f.program === "mcp");
    expect(mcpFiles.length).toBe(3);
  });

  it("mcp-config.json has server, tools, and security", () => {
    const file = result.files.find(f => f.path === "mcp-config.json")!;
    const data = JSON.parse(file.content);
    expect(data.mcpVersion).toBe("1.0");
    expect(data.server.name).toContain("test-app");
    expect(data.tools.length).toBeGreaterThanOrEqual(6);
    expect(data.security.denied_patterns).toContain("node_modules/**");
    expect(file.content_type).toBe("application/json");
  });

  it("connector-map.yaml has connectors and flows", () => {
    const file = result.files.find(f => f.path === "connector-map.yaml")!;
    expect(file.content).toContain("connectors:");
    expect(file.content).toContain("vscode");
    expect(file.content).toContain("integration_flows:");
    expect(file.content).toContain("development_loop");
    expect(file.content.length).toBeGreaterThan(200);
  });

  it("capability-registry.json has capabilities and categories", () => {
    const file = result.files.find(f => f.path === "capability-registry.json")!;
    const data = JSON.parse(file.content);
    expect(data.project).toBe("test-app");
    expect(data.total_capabilities).toBeGreaterThanOrEqual(4);
    expect(data.categories.length).toBeGreaterThanOrEqual(2);
    expect(data.capabilities.some((c: { id: string }) => c.id === "build")).toBe(true);
    expect(file.content_type).toBe("application/json");
  });
});

describe("artifacts generators content", () => {
  const result = generateFiles(makeInput(["generated-component.tsx", "dashboard-widget.tsx", "embed-snippet.ts", "artifact-spec.md"]));

  it("generates all 4 artifacts files", () => {
    const artFiles = result.files.filter(f => f.program === "artifacts");
    expect(artFiles.length).toBe(4);
  });

  it("generated-component.tsx has component scaffold", () => {
    const file = result.files.find(f => f.path === "generated-component.tsx")!;
    expect(file.content).toContain("container");
    expect(file.content).toContain("content");
    expect(file.content.length).toBeGreaterThan(100);
  });

  it("dashboard-widget.tsx has project stats", () => {
    const file = result.files.find(f => f.path === "dashboard-widget.tsx")!;
    expect(file.content).toContain("test-app");
    expect(file.content).toContain("Dashboard");
    expect(file.content.length).toBeGreaterThan(100);
  });

  it("embed-snippet.ts has context and conventions", () => {
    const file = result.files.find(f => f.path === "embed-snippet.ts")!;
    expect(file.content).toContain("PROJECT_CONTEXT");
    expect(file.content).toContain("CONVENTIONS");
    expect(file.content).toContain("WARNINGS");
    expect(file.content).toContain("KEY_ABSTRACTIONS");
    expect(file.content).toContain("embedProjectContext");
    expect(file.content.length).toBeGreaterThan(200);
  });

  it("artifact-spec.md has architecture and metrics", () => {
    const file = result.files.find(f => f.path === "artifact-spec.md")!;
    expect(file.content).toContain("Artifact Specification");
    expect(file.content).toContain("test-app");
    expect(file.content).toContain("Language Distribution");
    expect(file.content).toContain("Architecture");
    expect(file.content).toContain("Entry Points");
    expect(file.content.length).toBeGreaterThan(300);
  });
});

describe("remotion generators content", () => {
  const result = generateFiles(makeInput(["remotion-script.ts", "scene-plan.md", "render-config.json", "asset-checklist.md"]));

  it("generates all 4 remotion files", () => {
    const remFiles = result.files.filter(f => f.program === "remotion");
    expect(remFiles.length).toBe(4);
  });

  it("remotion-script.ts has Remotion composition with scenes", () => {
    const file = result.files.find(f => f.path === "remotion-script.ts")!;
    expect(file.content).toContain("AbsoluteFill");
    expect(file.content).toContain("Sequence");
    expect(file.content).toContain("IntroScene");
    expect(file.content).toContain("TechStackScene");
    expect(file.content).toContain("ArchitectureScene");
    expect(file.content.length).toBeGreaterThan(500);
  });

  it("scene-plan.md has scenes and narration", () => {
    const file = result.files.find(f => f.path === "scene-plan.md")!;
    expect(file.content).toContain("Scene Plan");
    expect(file.content).toContain("Scene 1: Introduction");
    expect(file.content).toContain("Narration Script");
    expect(file.content).toContain("test-app");
    expect(file.content.length).toBeGreaterThan(300);
  });

  it("render-config.json has composition and render settings", () => {
    const file = result.files.find(f => f.path === "render-config.json")!;
    const data = JSON.parse(file.content);
    expect(data.project).toBe("test-app");
    expect(data.composition.width).toBe(1920);
    expect(data.composition.fps).toBe(30);
    expect(data.scenes.length).toBeGreaterThanOrEqual(3);
    expect(data.render.codec).toBe("h264");
    expect(file.content_type).toBe("application/json");
  });

  it("asset-checklist.md has fonts, colors, and dependencies", () => {
    const file = result.files.find(f => f.path === "asset-checklist.md")!;
    expect(file.content).toContain("Asset Checklist");
    expect(file.content).toContain("Fonts");
    expect(file.content).toContain("Colors");
    expect(file.content).toContain("remotion");
    expect(file.content).toContain("Output Formats");
    expect(file.content.length).toBeGreaterThan(300);
  });
});

describe("canvas generators content", () => {
  const result = generateFiles(makeInput(["canvas-spec.json", "social-pack.md", "poster-layouts.md", "asset-guidelines.md"]));

  it("generates all 4 canvas files", () => {
    const canvasFiles = result.files.filter(f => f.program === "canvas");
    expect(canvasFiles.length).toBe(4);
  });

  it("canvas-spec.json has design system and templates", () => {
    const file = result.files.find(f => f.path === "canvas-spec.json")!;
    const data = JSON.parse(file.content);
    expect(data.project).toBe("test-app");
    expect(data.design_system.colors.primary).toBeTruthy();
    expect(data.templates.length).toBeGreaterThanOrEqual(3);
    expect(data.data_bindings.title).toBe("test-app");
    expect(file.content_type).toBe("application/json");
  });

  it("social-pack.md has OG image and thread templates", () => {
    const file = result.files.find(f => f.path === "social-pack.md")!;
    expect(file.content).toContain("Social Pack");
    expect(file.content).toContain("Open Graph");
    expect(file.content).toContain("Twitter");
    expect(file.content).toContain("LinkedIn");
    expect(file.content).toContain("test-app");
    expect(file.content.length).toBeGreaterThan(300);
  });

  it("poster-layouts.md has zones and data bindings", () => {
    const file = result.files.find(f => f.path === "poster-layouts.md")!;
    expect(file.content).toContain("Poster Layouts");
    expect(file.content).toContain("Layout A");
    expect(file.content).toContain("Layout B");
    expect(file.content).toContain("HERO ZONE");
    expect(file.content.length).toBeGreaterThan(300);
  });

  it("asset-guidelines.md has colors, typography, and exports", () => {
    const file = result.files.find(f => f.path === "asset-guidelines.md")!;
    expect(file.content).toContain("Asset Guidelines");
    expect(file.content).toContain("Color System");
    expect(file.content).toContain("Typography");
    expect(file.content).toContain("Export Specifications");
    expect(file.content.length).toBeGreaterThan(300);
  });
});

describe("algorithmic generators content", () => {
  const result = generateFiles(makeInput(["generative-sketch.ts", "parameter-pack.json", "collection-map.md", "export-manifest.yaml"]));

  it("generates all 4 algorithmic files", () => {
    const algorithmicFiles = result.files.filter(f => f.program === "algorithmic");
    expect(algorithmicFiles.length).toBe(4);
  });

  it("generative-sketch.ts has force simulation and rendering", () => {
    const file = result.files.find(f => f.path === "generative-sketch.ts")!;
    expect(file.content).toContain("CONFIG");
    expect(file.content).toContain("createNodes");
    expect(file.content).toContain("simulate");
    expect(file.content).toContain("renderSketch");
    expect(file.content_type).toBe("text/typescript");
    expect(file.content.length).toBeGreaterThan(500);
  });

  it("parameter-pack.json has structure, color, and motion params", () => {
    const file = result.files.find(f => f.path === "parameter-pack.json")!;
    const data = JSON.parse(file.content);
    expect(data.project).toBe("test-app");
    expect(data.parameters.structure.node_count).toBeGreaterThan(0);
    expect(data.parameters.color.palette.length).toBeGreaterThan(0);
    expect(data.parameters.motion.dampening).toBe(0.98);
    expect(data.presets.length).toBe(3);
    expect(file.content_type).toBe("application/json");
  });

  it("collection-map.md has pieces and metadata", () => {
    const file = result.files.find(f => f.path === "collection-map.md")!;
    expect(file.content).toContain("Collection Map");
    expect(file.content).toContain("Dependency Network");
    expect(file.content).toContain("Language Ring");
    expect(file.content).toContain("Architecture Terrain");
    expect(file.content).toContain("Hotspot Constellation");
    expect(file.content.length).toBeGreaterThan(300);
  });

  it("export-manifest.yaml has artifacts and render pipeline", () => {
    const file = result.files.find(f => f.path === "export-manifest.yaml")!;
    expect(file.content).toContain("manifest:");
    expect(file.content).toContain("generative-sketch");
    expect(file.content).toContain("render_pipeline");
    expect(file.content).toContain("dependencies");
    expect(file.content.length).toBeGreaterThan(300);
  });
});

describe("depth generators content", () => {
  const result = generateFiles(makeInput([
    "dependency-hotspots.md", "root-cause-checklist.md",
    "workflow-pack.md", "policy-pack.md",
    "layout-patterns.md", "ui-audit.md",
    "meta-tag-audit.json", "token-budget-plan.md",
    "dark-mode-tokens.json", "channel-rulebook.md",
    "ab-test-plan.md", "citation-index.json",
    "server-manifest.yaml", "protocol-spec.md", "spec.types.ts", "mcp/README.md", "mcp/project-setup.md", "mcp/build-artifacts.md", "mcp/package-json.root.template.json", "mcp/package-json.package.template.json", "mcp/tsconfig.root.template.json", "mcp/tsconfig.package.template.json", "mcp/monorepo-structure.md", "mcp/core-implementation-artifacts.md", "template-pack.md",
    "automation-pipeline.yaml", "component-library.json",
    "storyboard.md", "brand-board.md",
    "variation-matrix.json",
  ]));

  it("dependency-hotspots.md has risk analysis", () => {
    const file = result.files.find(f => f.path === "dependency-hotspots.md")!;
    expect(file.program).toBe("search");
    expect(file.content).toContain("Dependency Hotspots");
    expect(file.content.length).toBeGreaterThan(200);
  });

  it("root-cause-checklist.md has triage workflow", () => {
    const file = result.files.find(f => f.path === "root-cause-checklist.md")!;
    expect(file.program).toBe("debug");
    expect(file.content.toLowerCase()).toContain("root cause");
    expect(file.content.length).toBeGreaterThan(200);
  });

  it("workflow-pack.md has workflow definitions", () => {
    const file = result.files.find(f => f.path === "workflow-pack.md")!;
    expect(file.program).toBe("skills");
    expect(file.content).toContain("Workflow");
    expect(file.content.length).toBeGreaterThan(200);
  });

  it("policy-pack.md has policy definitions", () => {
    const file = result.files.find(f => f.path === "policy-pack.md")!;
    expect(file.program).toBe("skills");
    expect(file.content).toContain("Policy");
    expect(file.content.length).toBeGreaterThan(200);
  });

  it("layout-patterns.md has layout architecture", () => {
    const file = result.files.find(f => f.path === "layout-patterns.md")!;
    expect(file.program).toBe("frontend");
    expect(file.content).toContain("Layout");
    expect(file.content.length).toBeGreaterThan(200);
  });

  it("ui-audit.md has accessibility checklist", () => {
    const file = result.files.find(f => f.path === "ui-audit.md")!;
    expect(file.program).toBe("frontend");
    expect(file.content).toContain("Audit");
    expect(file.content.length).toBeGreaterThan(200);
  });

  it("meta-tag-audit.json is valid JSON with routes", () => {
    const file = result.files.find(f => f.path === "meta-tag-audit.json")!;
    expect(file.program).toBe("seo");
    const parsed = JSON.parse(file.content);
    expect(parsed.project).toBeTruthy();
    expect(Array.isArray(parsed.per_route_audit)).toBe(true);
  });

  it("token-budget-plan.md has budget allocation", () => {
    const file = result.files.find(f => f.path === "token-budget-plan.md")!;
    expect(file.program).toBe("optimization");
    expect(file.content).toContain("Token");
    expect(file.content.length).toBeGreaterThan(200);
  });

  it("dark-mode-tokens.json is valid JSON with tokens", () => {
    const file = result.files.find(f => f.path === "dark-mode-tokens.json")!;
    expect(file.program).toBe("theme");
    const parsed = JSON.parse(file.content);
    expect(parsed.project).toBeTruthy();
    expect(parsed.colors).toBeTruthy();
  });

  it("channel-rulebook.md has channel rules", () => {
    const file = result.files.find(f => f.path === "channel-rulebook.md")!;
    expect(file.program).toBe("brand");
    expect(file.content).toContain("Channel");
    expect(file.content.length).toBeGreaterThan(200);
  });

  it("ab-test-plan.md has test hypotheses", () => {
    const file = result.files.find(f => f.path === "ab-test-plan.md")!;
    expect(file.program).toBe("marketing");
    expect(file.content).toContain("Test");
    expect(file.content.length).toBeGreaterThan(200);
  });

  it("citation-index.json is valid JSON with entries", () => {
    const file = result.files.find(f => f.path === "citation-index.json")!;
    expect(file.program).toBe("notebook");
    const parsed = JSON.parse(file.content);
    expect(parsed.project).toBeTruthy();
    expect(Array.isArray(parsed.citations)).toBe(true);
  });

  it("server-manifest.yaml has MCP server config", () => {
    const file = result.files.find(f => f.path === "server-manifest.yaml")!;
    expect(file.program).toBe("mcp");
    expect(file.content).toContain("server");
    expect(file.content.length).toBeGreaterThan(200);
  });

  it("protocol-spec.md covers JSON-RPC request/response/notification/batch", () => {
    const file = result.files.find(f => f.path === "protocol-spec.md")!;
    expect(file.program).toBe("mcp");
    expect(file.content).toContain("JSON-RPC 2.0 Message Formats");
    expect(file.content).toContain("### Request");
    expect(file.content).toContain("### Success Response");
    expect(file.content).toContain("### Notification (no id)");
    expect(file.content).toContain("### Batch Request");
    expect(file.content).toContain("## Core Primitives");
    expect(file.content).toContain("### Tools");
    expect(file.content).toContain("### Resources");
    expect(file.content).toContain("### Prompts");
    expect(file.content).toContain("## Capabilities Advertisement (Handshake)");
    expect(file.content).toContain("## Session Model");
    expect(file.content).toContain("## Transports");
    expect(file.content).toContain("Streamable HTTP");
    expect(file.content).toContain("WebSockets");
    expect(file.content).toContain("## Error Model");
    expect(file.content).toContain("## Pagination");
    expect(file.content).toContain("## Cancellation");
    expect(file.content).toContain("## Progress Reporting");
    expect(file.content).toContain("## Security Model");
    expect(file.content).toContain("### OAuth");
    expect(file.content).toContain("### Sandboxing");
    expect(file.content).toContain("### Consent");
    expect(file.content).toContain("## Extensibility (SEPs)");
    expect(file.content).toContain("Spec Extension Proposals");
    expect(file.content).toContain("semantic versioning");
    expect(file.content).toContain("## Type Definitions / Core Types");
    expect(file.content).toContain("### JsonRpcRequest");
    expect(file.content).toContain("### JsonRpcSuccess | JsonRpcError");
    expect(file.content).toContain("### InitializeRequest / InitializeResult");
    expect(file.content).toContain("### ToolDefinition / ToolCall");
    expect(file.content).toContain("### PaginationEnvelope");
    expect(file.content).toContain("### CancelRequest / ProgressNotification");
    expect(file.content).toContain("## Validation Schema Strategy");
    expect(file.content).toContain("Standard Schema-compatible");
    expect(file.content).toContain("Zod-authored schemas");
  });

  it("spec.types.ts defines protocol interfaces and schemas", () => {
    const file = result.files.find(f => f.path === "spec.types.ts")!;
    expect(file.program).toBe("mcp");
    expect(file.content).toContain("export interface JsonRpcRequest");
    expect(file.content).toContain("export interface ToolDefinition");
    expect(file.content).toContain("export interface StandardSchemaV1");
    expect(file.content).toContain("export type ZodCompatibleSchema");
    expect(file.content).toContain("export interface ResourceTemplate");
    expect(file.content).toContain("export interface PromptDefinition");
    expect(file.content).toContain("export interface PaginationEnvelope");
    expect(file.content).toContain("export type ProgressNotification");
    expect(file.content_type).toBe("text/typescript");
    expect(file.content.length).toBeGreaterThan(500);
  });

  it("mcp/README.md has project overview and quickstart", () => {
    const file = result.files.find(f => f.path === "mcp/README.md")!;
    expect(file.program).toBe("mcp");
    expect(file.content).toContain("## Project Overview");
    expect(file.content).toContain("## Installation");
    expect(file.content).toContain("## Quickstart");
    expect(file.content).toContain("## Supported Runtimes");
    expect(file.content).toContain("Node.js");
    expect(file.content).toContain("Bun");
    expect(file.content).toContain("Deno");
    expect(file.content).toContain("## Contribution Guidelines");
    expect(file.content_type).toBe("text/markdown");
    expect(file.content.length).toBeGreaterThan(500);
  });

  it("mcp/project-setup.md has setup flow and checklist", () => {
    const file = result.files.find(f => f.path === "mcp/project-setup.md")!;
    expect(file.program).toBe("mcp");
    expect(file.content).toContain("## Environment Prerequisites");
    expect(file.content).toContain("## Bootstrap");
    expect(file.content).toContain("## Local Verification");
    expect(file.content).toContain("## Setup Checklist");
    expect(file.content_type).toBe("text/markdown");
    expect(file.content.length).toBeGreaterThan(400);
  });

  it("mcp/build-artifacts.md has build outputs and CI checks", () => {
    const file = result.files.find(f => f.path === "mcp/build-artifacts.md")!;
    expect(file.program).toBe("mcp");
    expect(file.content).toContain("## Core Build Outputs");
    expect(file.content).toContain("## Build Commands");
    expect(file.content).toContain("## Artifact Integrity Checks");
    expect(file.content).toContain("## CI/CD Packaging Notes");
    expect(file.content_type).toBe("text/markdown");
    expect(file.content.length).toBeGreaterThan(350);
  });

  it("mcp/package-json.root.template.json is valid root package template", () => {
    const file = result.files.find(f => f.path === "mcp/package-json.root.template.json")!;
    expect(file.program).toBe("mcp");
    const parsed = JSON.parse(file.content);
    expect(parsed.private).toBe(true);
    expect(parsed.packageManager).toBeTruthy();
    expect(Array.isArray(parsed.workspaces)).toBe(true);
    expect(parsed.workspaces).toContain("apps/*");
    expect(parsed.workspaces).toContain("packages/*");
    expect(parsed.scripts).toBeTruthy();
    expect(parsed.scripts.build).toBeTruthy();
    expect(parsed.scripts.test).toBeTruthy();
    expect(parsed.scripts.lint).toBeTruthy();
    expect(parsed.scripts.publish).toBeTruthy();
    expect(parsed.scripts["build:turbo"]).toBeTruthy();
    expect(parsed.scripts["test:turbo"]).toBeTruthy();
    expect(parsed.scripts["lint:turbo"]).toBeTruthy();
    expect(parsed.dependencies?.zod).toBeTruthy();
    expect(parsed.devDependencies?.typescript).toBeTruthy();
    expect(parsed.devDependencies?.vitest).toBeTruthy();
    expect(parsed.devDependencies?.turbo).toBeTruthy();
    expect(file.content_type).toBe("application/json");
  });

  it("mcp/package-json.package.template.json is valid package template", () => {
    const file = result.files.find(f => f.path === "mcp/package-json.package.template.json")!;
    expect(file.program).toBe("mcp");
    const parsed = JSON.parse(file.content);
    expect(parsed.main).toBe("dist/index.js");
    expect(parsed.types).toBe("dist/index.d.ts");
    expect(parsed.scripts).toBeTruthy();
    expect(parsed.scripts.build).toBeTruthy();
    expect(parsed.scripts.test).toBeTruthy();
    expect(parsed.scripts.lint).toBeTruthy();
    expect(parsed.scripts.publish).toBeTruthy();
    expect(parsed.peerDependencies?.zod).toBeTruthy();
    expect(parsed.devDependencies?.typescript).toBeTruthy();
    expect(parsed.devDependencies?.vitest).toBeTruthy();
    expect(file.content_type).toBe("application/json");
  });

  it("mcp/tsconfig.root.template.json has strict ESM and monorepo paths", () => {
    const file = result.files.find(f => f.path === "mcp/tsconfig.root.template.json")!;
    expect(file.program).toBe("mcp");
    const parsed = JSON.parse(file.content);
    expect(parsed.compilerOptions?.strict).toBe(true);
    expect(parsed.compilerOptions?.module).toBe("NodeNext");
    expect(parsed.compilerOptions?.moduleResolution).toBe("NodeNext");
    expect(parsed.compilerOptions?.paths?.["@apps/*"]).toBeTruthy();
    expect(parsed.compilerOptions?.paths?.["@packages/*"]).toBeTruthy();
    expect(file.content_type).toBe("application/json");
  });

  it("mcp/tsconfig.package.template.json has strict package output settings", () => {
    const file = result.files.find(f => f.path === "mcp/tsconfig.package.template.json")!;
    expect(file.program).toBe("mcp");
    const parsed = JSON.parse(file.content);
    expect(parsed.extends).toContain("tsconfig");
    expect(parsed.compilerOptions?.strict).toBe(true);
    expect(parsed.compilerOptions?.outDir).toBe("dist");
    expect(parsed.compilerOptions?.module).toBe("NodeNext");
    expect(parsed.compilerOptions?.moduleResolution).toBe("NodeNext");
    expect(file.content_type).toBe("application/json");
  });

  it("mcp/monorepo-structure.md includes apps and packages layout", () => {
    const file = result.files.find(f => f.path === "mcp/monorepo-structure.md")!;
    expect(file.program).toBe("mcp");
    expect(file.content).toContain("## Recommended Folder Layout");
    expect(file.content).toContain("apps/");
    expect(file.content).toContain("packages/");
    expect(file.content).toContain("packages/client/");
    expect(file.content).toContain("discovery/");
    expect(file.content).toContain("invocation/");
    expect(file.content).toContain("packages/sdk/");
    expect(file.content).toContain("index.ts");
    expect(file.content).toContain("packages/middleware/");
    expect(file.content).toContain("express/");
    expect(file.content).toContain("hono/");
    expect(file.content).toContain("node-http/");
    expect(file.content).toContain("packages/server/");
    expect(file.content).toContain("McpServer.ts");
    expect(file.content).toContain("mcp/");
    expect(file.content).toContain("## Folder Roles");
    expect(file.content).toContain("## packages/middleware Responsibilities");
    expect(file.content).toContain("Express helpers");
    expect(file.content).toContain("Hono helpers");
    expect(file.content).toContain("Node HTTP helpers");
    expect(file.content).toContain("## packages/sdk Responsibilities");
    expect(file.content).toContain("Re-export stable APIs");
    expect(file.content).toContain("## packages/client Responsibilities");
    expect(file.content).toContain("Discovery");
    expect(file.content).toContain("Invocation");
    expect(file.content).toContain("## packages/server Responsibilities");
    expect(file.content).toContain("Tool registration");
    expect(file.content).toContain("Transports");
    expect(file.content_type).toBe("text/markdown");
  });

  it("mcp/core-implementation-artifacts.md defines server/client/sdk/middleware contracts", () => {
    const file = result.files.find(f => f.path === "mcp/core-implementation-artifacts.md")!;
    expect(file.program).toBe("mcp");
    expect(file.content).toContain("## 7. Server Implementation (packages/server/src/index.ts or McpServer.ts)");
    expect(file.content).toContain("// packages/server/src/index.ts");
    expect(file.content).toContain("export { McpServer } from \"./McpServer.js\";");
    expect(file.content).toContain("// packages/server/src/McpServer.ts");
    expect(file.content).toContain("Implement capability negotiation during `initialize` and clean teardown on `shutdown`.");
    expect(file.content).toContain("initialize(clientCapabilities: unknown)");
    expect(file.content).toContain("tool(name: string, description: string, schema: unknown, handler: (input: unknown) => Promise<unknown>)");
    expect(file.content).toContain("resource(name: string, description: string, uriTemplate: string, handler: (params: unknown) => Promise<unknown>)");
    expect(file.content).toContain("prompt(name: string, description: string, schema: unknown, handler: (input: unknown) => Promise<string>)");
    expect(file.content).toContain("shutdown()");
    expect(file.content).toContain("## 8. Transport Implementations");
    expect(file.content).toContain("packages/server/src/transports/*");
    expect(file.content).toContain("Standard adapters: `stdio`, `http`, and `websocket`.");
    expect(file.content).toContain("export interface TransportAdapter");
    expect(file.content).toContain("start(): Promise<void>;");
    expect(file.content).toContain("stop(): Promise<void>;");
    expect(file.content).toContain("### StdioServerTransport (most common for local use)");
    expect(file.content).toContain("Use `StdioServerTransport` for local IDE integrations and CLI-hosted MCP servers.");
    expect(file.content).toContain("export class StdioServerTransport implements TransportAdapter");
    expect(file.content).toContain("// packages/server/src/transports/stdio.ts");
    expect(file.content).toContain("### Streamable HTTP transport");
    expect(file.content).toContain("Use streamable HTTP when clients need request/response plus incremental server events over HTTP.");
    expect(file.content).toContain("export class StreamableHttpServerTransport implements TransportAdapter");
    expect(file.content).toContain("// packages/server/src/transports/http.ts");
    expect(file.content).toContain("### WebSocket support (extensible base)");
    expect(file.content).toContain("Implement a shared base transport for connection/session handling, then extend it for WebSocket specifics.");
    expect(file.content).toContain("abstract class BaseSocketTransport implements TransportAdapter");
    expect(file.content).toContain("export class WebSocketServerTransport extends BaseSocketTransport");
    expect(file.content).toContain("// packages/server/src/transports/websocket.ts");
    expect(file.content).toContain("## 9. Schema & Validation Layer");
    expect(file.content).toContain("Centralize tool/resource/prompt schemas under `packages/server/src/schema/*`.");
    expect(file.content).toContain("Prefer Standard Schema-compatible validators and `zod` schemas so client/server types stay aligned.");
    expect(file.content).toContain("export interface SchemaValidator<TInput>");
    expect(file.content).toContain("kind: \"tool\" | \"resource\" | \"prompt\"");
    expect(file.content).toContain("private validateOrThrow<T>(validator: SchemaValidator<T>, input: unknown): T");
    expect(file.content).toContain("// packages/server/src/schema/types.ts");
    expect(file.content).toContain("import { z } from \"zod\";");
    expect(file.content).toContain("export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;");
    expect(file.content).toContain("export type CreateTaskOutput = z.infer<typeof createTaskOutputSchema>;");
    expect(file.content).toContain("server.tool(\"tasks.create\", \"Create a task\", createTaskInputSchema, async (input) => {");
    expect(file.content).toContain("return createTaskOutputSchema.parse(result);");
    expect(file.content).toContain("### Runtime validation + TypeScript inference");
    expect(file.content).toContain("Validate all unknown payloads at runtime before business logic executes.");
    expect(file.content).toContain("type RunReportInput = z.infer<typeof runReportInputSchema>;");
    expect(file.content).toContain("type RunReportOutput = z.infer<typeof runReportOutputSchema>;");
    expect(file.content).toContain("const typedInput: RunReportInput = runReportInputSchema.parse(input);");
    expect(file.content).toContain("return runReportOutputSchema.parse(result);");
    expect(file.content).toContain("## 10. Middleware & Runtime Helpers");
    expect(file.content).toContain("Keep framework glue code in `packages/middleware/src/*` so server and client packages stay runtime-agnostic.");
    expect(file.content).toContain("createMcpExpressHandler");
    expect(file.content).toContain("createMcpHonoHandler");
    expect(file.content).toContain("createMcpNodeHandler");
    expect(file.content).toContain("## packages/server");
    expect(file.content).toContain("## packages/client");
    expect(file.content).toContain("## packages/sdk");
    expect(file.content).toContain("## packages/middleware");
    expect(file.content).toContain("Recommended Artifact Layout");
    expect(file.content_type).toBe("text/markdown");
  });

  it("template-pack.md has note templates", () => {
    const file = result.files.find(f => f.path === "template-pack.md")!;
    expect(file.program).toBe("obsidian");
    expect(file.content).toContain("Template");
    expect(file.content.length).toBeGreaterThan(200);
  });

  it("automation-pipeline.yaml has CI/CD stages", () => {
    const file = result.files.find(f => f.path === "automation-pipeline.yaml")!;
    expect(file.program).toBe("superpowers");
    expect(file.content).toContain("pipeline");
    expect(file.content.length).toBeGreaterThan(200);
  });

  it("component-library.json is valid JSON with components", () => {
    const file = result.files.find(f => f.path === "component-library.json")!;
    expect(file.program).toBe("artifacts");
    const parsed = JSON.parse(file.content);
    expect(parsed.project).toBeTruthy();
    expect(Array.isArray(parsed.components)).toBe(true);
  });

  it("storyboard.md has scene descriptions", () => {
    const file = result.files.find(f => f.path === "storyboard.md")!;
    expect(file.program).toBe("remotion");
    expect(file.content).toContain("Scene");
    expect(file.content.length).toBeGreaterThan(200);
  });

  it("brand-board.md has color palette and typography", () => {
    const file = result.files.find(f => f.path === "brand-board.md")!;
    expect(file.program).toBe("canvas");
    expect(file.content).toContain("Color Palette");
    expect(file.content).toContain("Typography");
    expect(file.content.length).toBeGreaterThan(200);
  });

  it("variation-matrix.json is valid JSON with variations", () => {
    const file = result.files.find(f => f.path === "variation-matrix.json")!;
    expect(file.program).toBe("algorithmic");
    const parsed = JSON.parse(file.content);
    expect(parsed.project).toBeTruthy();
    expect(Array.isArray(parsed.variations)).toBe(true);
    expect(parsed.variations.length).toBeGreaterThan(0);
  });
});

describe("listAvailableGenerators", () => {
  it("returns all registered generators", () => {
    const generators = listAvailableGenerators();
    expect(generators.length).toBe(98);
    const paths = generators.map(g => g.path);
    expect(paths).toContain(".ai/symbol-index.json");
    expect(paths).toContain(".ai/context-map.json");
    expect(paths).toContain("AGENTS.md");
    expect(paths).toContain("remotion-script.ts");
    expect(paths).toContain("render-config.json");
    expect(paths).toContain("canvas-spec.json");
    expect(paths).toContain("social-pack.md");
    expect(paths).toContain("poster-layouts.md");
    expect(paths).toContain("asset-guidelines.md");
    expect(paths).toContain("generative-sketch.ts");
    expect(paths).toContain("parameter-pack.json");
    expect(paths).toContain("mcp-registry-metadata.json");
    expect(paths).toContain("protocol-spec.md");
    expect(paths).toContain("spec.types.ts");
    expect(paths).toContain("mcp/README.md");
    expect(paths).toContain("mcp/project-setup.md");
    expect(paths).toContain("mcp/build-artifacts.md");
    expect(paths).toContain("mcp/package-json.root.template.json");
    expect(paths).toContain("mcp/package-json.package.template.json");
    expect(paths).toContain("mcp/tsconfig.root.template.json");
    expect(paths).toContain("mcp/tsconfig.package.template.json");
    expect(paths).toContain("mcp/monorepo-structure.md");
    expect(paths).toContain("mcp/core-implementation-artifacts.md");
    expect(paths).toContain("collection-map.md");
    expect(paths).toContain("export-manifest.yaml");
    // depth generators
    expect(paths).toContain("dependency-hotspots.md");
    expect(paths).toContain("root-cause-checklist.md");
    expect(paths).toContain("workflow-pack.md");
    expect(paths).toContain("policy-pack.md");
    expect(paths).toContain("layout-patterns.md");
    expect(paths).toContain("ui-audit.md");
    expect(paths).toContain("meta-tag-audit.json");
    expect(paths).toContain("token-budget-plan.md");
    expect(paths).toContain("dark-mode-tokens.json");
    expect(paths).toContain("channel-rulebook.md");
    expect(paths).toContain("ab-test-plan.md");
    expect(paths).toContain("citation-index.json");
    expect(paths).toContain("server-manifest.yaml");
    expect(paths).toContain("template-pack.md");
    expect(paths).toContain("automation-pipeline.yaml");
    expect(paths).toContain("component-library.json");
    expect(paths).toContain("storyboard.md");
    expect(paths).toContain("brand-board.md");
    expect(paths).toContain("variation-matrix.json");
  });
});
