import { describe, it, expect } from "vitest";
import { generateFiles } from "./generate.js";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { SnapshotRecord, FileEntry } from "@axis/snapshots";
import type { GeneratorInput, SourceFile } from "./types.js";

/* --- Fixture Helpers ------------------------------------------------ */

function snap(opts: { name?: string; type?: string; files?: FileEntry[] } = {}): SnapshotRecord {
  const files = opts.files ?? [];
  return {
    snapshot_id: "snap-sf11-001",
    project_id: "proj-sf11-001",
    created_at: new Date().toISOString(),
    input_method: "repo_snapshot_upload",
    manifest: {
      project_name: opts.name ?? "sf11-test",
      project_type: opts.type ?? "web_application",
      frameworks: [],
      goals: [],
      requested_outputs: [],
    },
    file_count: files.length,
    total_size_bytes: files.reduce((s, f) => s + f.size, 0),
    files,
    status: "ready",
  };
}

function input(s: SnapshotRecord, requested: string[], sourceFiles?: SourceFile[]): GeneratorInput {
  return {
    context_map: buildContextMap(s),
    repo_profile: buildRepoProfile(s),
    requested_outputs: requested,
    source_files: sourceFiles,
  };
}

function addFw(inp: GeneratorInput, ...names: string[]) {
  for (const name of names) {
    inp.context_map.detection.frameworks.push({
      name,
      confidence: 0.9,
      version: null,
      evidence: ["test fixture"],
    });
  }
}

function getFile(result: ReturnType<typeof generateFiles>, path: string) {
  return result.files.find((f) => f.path === path);
}

/* --- Source file fixtures ------------------------------------------- */

/** Entry point WITH exports */
const ENTRY_EXPORTS: SourceFile = {
  path: "src/index.ts",
  content: 'export function main() { return "hello"; }\nexport const VERSION = "1.0";\n// l3\n// l4\n// l5\n',
  size: 80,
};

/** Entry point WITHOUT exports */
const ENTRY_NO_EXPORTS: SourceFile = {
  path: "src/main.ts",
  content: '// main entry\nconsole.log("start");\nprocess.exit(0);\n// l4\n// l5\n',
  size: 60,
};

/** Config file */
const CONFIG_FILE: SourceFile = {
  path: "tsconfig.json",
  content: '{"compilerOptions":{"strict":true,"target":"es2022"}}\n// l2\n// l3\n// l4\n// l5\n',
  size: 60,
};

/** CSS/theme file */
const CSS_FILE: SourceFile = {
  path: "src/styles/global.css",
  content: ':root { --primary: #3366ff; }\nbody { margin: 0; }\n// l3\n// l4\n// l5\n',
  size: 70,
};

/** Media asset file */
const MEDIA_FILE: SourceFile = {
  path: "public/logo.svg",
  content: '<svg><circle cx="50" cy="50" r="40"/></svg>\n// l2\n// l3\n// l4\n// l5\n',
  size: 50,
};

/** CI file */
const CI_FILE: SourceFile = {
  path: ".github/workflows/ci.yml",
  content: "name: CI\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n",
  size: 60,
};

/** README file */
const README_FILE: SourceFile = {
  path: "README.md",
  content: "# Project\n\nA web application for managing data.\n// l3\n// l4\n// l5\n",
  size: 60,
};

/** Contributing file */
const CONTRIBUTING_FILE: SourceFile = {
  path: "CONTRIBUTING.md",
  content: "# Contributing\n\nPlease follow these guidelines.\n// l3\n// l4\n// l5\n",
  size: 60,
};

/* ================================================================= */
/* PART 1: Entry points WITH exports → covers entries>0 TRUE paths   */
/* ================================================================= */

describe("all generators: entry points with exports", () => {
  const allOutputs = [
    "funnel-map.md", "sequence-pack.md", "cro-playbook.md",
    "artifact-spec.md", "superpower-pack.md", "refactor-checklist.md",
    "research-threads.md", "linking-policy.md", "prompt-diff-report.md",
    ".ai/debug-playbook.md", "tracing-rules.md", "root-cause-checklist.md",
    ".cursorrules", "CLAUDE.md", "workflow-pack.md",
    "route-priority-map.md", "content-audit.md",
    "dependency-hotspots.md", "architecture-summary.md",
    "test-generation-rules.md",
  ];

  it("handles entry points with exports across all generators", () => {
    const inp = input(snap(), allOutputs, [ENTRY_EXPORTS, CONFIG_FILE]);
    const res = generateFiles(inp);
    for (const o of allOutputs) {
      expect(getFile(res, o)).toBeDefined();
    }
  });
});

/* ================================================================= */
/* PART 2: Entry points WITHOUT exports → covers || "default" paths  */
/* ================================================================= */

describe("generators: entry points without exports (|| default path)", () => {
  it("research-threads shows default exports", () => {
    const inp = input(snap(), ["research-threads.md"], [ENTRY_NO_EXPORTS]);
    const res = generateFiles(inp);
    const f = getFile(res, "research-threads.md");
    expect(f!.content).toContain("default");
  });

  it("linking-policy shows default exports", () => {
    const inp = input(snap(), ["linking-policy.md"], [ENTRY_NO_EXPORTS]);
    const res = generateFiles(inp);
    const f = getFile(res, "linking-policy.md");
    expect(f).toBeDefined();
  });

  it("prompt-diff-report shows default exports", () => {
    const inp = input(snap(), ["prompt-diff-report.md"], [ENTRY_NO_EXPORTS]);
    const res = generateFiles(inp);
    const f = getFile(res, "prompt-diff-report.md");
    expect(f).toBeDefined();
  });

  it("tracing-rules shows default for no-export entry", () => {
    const inp = input(snap(), ["tracing-rules.md"], [ENTRY_NO_EXPORTS]);
    const res = generateFiles(inp);
    const f = getFile(res, "tracing-rules.md");
    expect(f).toBeDefined();
  });

  it("route-priority-map shows default for no-export routes", () => {
    const inp = input(snap(), ["route-priority-map.md"], [ENTRY_NO_EXPORTS]);
    addFw(inp, "SvelteKit");
    const res = generateFiles(inp);
    const f = getFile(res, "route-priority-map.md");
    expect(f).toBeDefined();
  });

  it("dependency-hotspots shows default for no-export hotspot files", () => {
    const inp = input(snap(), ["dependency-hotspots.md"], [ENTRY_NO_EXPORTS]);
    inp.context_map.dependency_graph.hotspots = [
      { path: "src/main.ts", inbound_count: 10, outbound_count: 5, risk_score: 8.0 },
    ];
    const res = generateFiles(inp);
    const f = getFile(res, "dependency-hotspots.md");
    expect(f).toBeDefined();
  });
});

/* ================================================================= */
/* PART 3: Config files → covers configs.length > 0 TRUE             */
/* ================================================================= */

describe("generators with config source files", () => {
  it("architecture-summary detects configs", () => {
    const inp = input(snap(), ["architecture-summary.md"], [CONFIG_FILE]);
    const res = generateFiles(inp);
    const f = getFile(res, "architecture-summary.md");
    expect(f!.content).toContain("tsconfig");
  });

  it("workflow-pack detects configs", () => {
    const inp = input(snap(), ["workflow-pack.md"], [CONFIG_FILE]);
    const res = generateFiles(inp);
    const f = getFile(res, "workflow-pack.md");
    expect(f!.content).toContain("tsconfig");
  });
});

/* ================================================================= */
/* PART 4: CSS/theme files → covers themeFiles/cssFiles > 0 TRUE     */
/* ================================================================= */

describe("theme generators with CSS source files", () => {
  it("design-tokens detects theme files", () => {
    const inp = input(snap(), [".ai/design-tokens.json"], [CSS_FILE]);
    const res = generateFiles(inp);
    const f = getFile(res, ".ai/design-tokens.json");
    const data = JSON.parse(f!.content);
    expect(data.source_theme_files).toBeDefined();
  });

  it("theme.css detects style files", () => {
    const inp = input(snap(), ["theme.css"], [CSS_FILE]);
    const res = generateFiles(inp);
    const f = getFile(res, "theme.css");
    expect(f!.content).toContain("global.css");
  });
});

/* ================================================================= */
/* PART 5: Media files → covers mediaFiles/assets > 0 TRUE           */
/* ================================================================= */

describe("canvas/remotion generators with media source files", () => {
  it("canvas-spec detects media assets", () => {
    const inp = input(snap(), ["canvas-spec.json"], [MEDIA_FILE]);
    const res = generateFiles(inp);
    const f = getFile(res, "canvas-spec.json");
    const data = JSON.parse(f!.content);
    expect(data.source_asset_files).toBeDefined();
  });

  it("social-pack detects media files", () => {
    const inp = input(snap(), ["social-pack.md"], [MEDIA_FILE]);
    const res = generateFiles(inp);
    const f = getFile(res, "social-pack.md");
    expect(f).toBeDefined();
  });

  it("scene-plan detects media files", () => {
    const inp = input(snap(), ["scene-plan.md"], [MEDIA_FILE]);
    const res = generateFiles(inp);
    const f = getFile(res, "scene-plan.md");
    expect(f!.content).toContain("logo.svg");
  });
});

/* ================================================================= */
/* PART 6: CI files → covers ciFiles > 0 TRUE                       */
/* ================================================================= */

describe("generators with CI source files", () => {
  it("connector-map detects CI files", () => {
    const inp = input(snap(), ["connector-map.yaml"], [CI_FILE]);
    const res = generateFiles(inp);
    const f = getFile(res, "connector-map.yaml");
    expect(f!.content).toContain("ci.yml");
  });

  it("automation-pipeline detects CI files", () => {
    const inp = input(snap(), ["automation-pipeline.yaml"], [CI_FILE]);
    const res = generateFiles(inp);
    const f = getFile(res, "automation-pipeline.yaml");
    expect(f!.content).toContain("ci.yml");
  });
});

/* ================================================================= */
/* PART 7: README/CONTRIBUTING files                                 */
/* ================================================================= */

describe("brand/marketing generators with README source files", () => {
  it("voice-and-tone detects README brand assets", () => {
    const inp = input(snap(), ["voice-and-tone.md"], [README_FILE]);
    const res = generateFiles(inp);
    const f = getFile(res, "voice-and-tone.md");
    expect(f!.content).toContain("README");
  });

  it("brand-board detects doc files", () => {
    const inp = input(snap(), ["brand-board.md"], [README_FILE]);
    const res = generateFiles(inp);
    const f = getFile(res, "brand-board.md");
    expect(f).toBeDefined();
  });

  it("content-constraints detects config/format files", () => {
    const inp = input(snap(), ["content-constraints.md"], [CONFIG_FILE]);
    const res = generateFiles(inp);
    const f = getFile(res, "content-constraints.md");
    expect(f).toBeDefined();
  });

  it("sequence-pack detects contributor assets", () => {
    const inp = input(snap(), ["sequence-pack.md"], [CONTRIBUTING_FILE]);
    const res = generateFiles(inp);
    const f = getFile(res, "sequence-pack.md");
    expect(f!.content).toContain("CONTRIBUTING");
  });

  it("cro-playbook detects landing pages", () => {
    const landing: SourceFile = {
      path: "src/pages/landing.tsx",
      content: 'export default function Landing() { return <div>Hero</div>; }\n// l2\n// l3\n// l4\n// l5\n',
      size: 70,
    };
    const inp = input(snap(), ["cro-playbook.md"], [landing]);
    const res = generateFiles(inp);
    const f = getFile(res, "cro-playbook.md");
    expect(f).toBeDefined();
  });
});

/* ================================================================= */
/* PART 8: Skills with 51+ source files → files.length > 50 TRUE    */
/* ================================================================= */

describe("skills: > 50 source files for file tree truncation", () => {
  it("truncates file tree at 50 and shows remainder", () => {
    const manyFiles: SourceFile[] = Array.from({ length: 55 }, (_, i) => ({
      path: `src/module${i}.ts`,
      content: `// module ${i}\nconst x = ${i};\n`,
      size: 20,
    }));
    const inp = input(snap(), [".cursorrules"], manyFiles);
    const res = generateFiles(inp);
    const f = getFile(res, ".cursorrules");
    expect(f!.content).toContain("more files");
  });
});

/* ================================================================= */
/* PART 9: Notebook citation-index with non-standard framework       */
/* ================================================================= */

describe("notebook: citation-index with non-standard framework", () => {
  it("falls through to generic search URL", () => {
    const inp = input(snap(), ["citation-index.json"]);
    addFw(inp, "Flask");
    const res = generateFiles(inp);
    const f = getFile(res, "citation-index.json");
    const data = JSON.parse(f!.content);
    const flaskCitation = data.citations.find((c: { title: string }) => c.title.includes("Flask"));
    expect(flaskCitation).toBeDefined();
    expect(flaskCitation.source).toContain("google.com/search");
  });
});

/* ================================================================= */
/* PART 10: Theme with routes and domain models → TRUE paths         */
/* ================================================================= */

describe("theme: theme-guidelines with routes and domain models", () => {
  it("renders route theme zones and domain-specific tokens", () => {
    const inp = input(snap(), ["theme-guidelines.md"]);
    inp.context_map.routes = [
      { path: "/users", method: "GET", source_file: "src/routes/users.ts" },
    ];
    inp.context_map.domain_models = [
      { name: "User", kind: "interface", field_count: 5, source_file: "src/models/user.ts" },
    ];
    const res = generateFiles(inp);
    const f = getFile(res, "theme-guidelines.md");
    expect(f!.content).toContain("Route Theme Zones");
    expect(f!.content).toContain("Domain");
  });
});

/* ================================================================= */
/* PART 11: Obsidian project_summary || null                         */
/* ================================================================= */

describe("obsidian: graph-prompt-map with empty project_summary", () => {
  it("uses null when project_summary is empty", () => {
    const inp = input(snap(), ["graph-prompt-map.json"]);
    inp.context_map.ai_context.project_summary = "";
    const res = generateFiles(inp);
    const f = getFile(res, "graph-prompt-map.json");
    const data = JSON.parse(f!.content);
    expect(data.project_summary).toBeNull();
  });
});

/* ================================================================= */
/* PART 12: SEO with specific conditions                             */
/* ================================================================= */

describe("seo: meta-tag-audit with empty project_summary", () => {
  it("uses null for project_summary in audit JSON", () => {
    const inp = input(snap(), ["meta-tag-audit.json"]);
    inp.context_map.ai_context.project_summary = "";
    addFw(inp, "SvelteKit");
    const res = generateFiles(inp);
    const f = getFile(res, "meta-tag-audit.json");
    const data = JSON.parse(f!.content);
    expect(data.project_summary).toBeNull();
  });
});

describe("seo: content-audit with API route source file", () => {
  it("marks API routes as noindex", () => {
    const apiRoute: SourceFile = {
      path: "src/routes/api/data/+server.ts",
      content: 'export function GET() { return new Response("ok"); }\n// l2\n// l3\n// l4\n// l5\n',
      size: 80,
    };
    const pageRoute: SourceFile = {
      path: "src/routes/+page.svelte",
      content: '<h1>Home</h1>\n// l2\n// l3\n// l4\n// l5\n',
      size: 40,
    };
    const inp = input(snap(), ["content-audit.md"], [apiRoute, pageRoute]);
    addFw(inp, "SvelteKit");
    const res = generateFiles(inp);
    const f = getFile(res, "content-audit.md");
    expect(f).toBeDefined();
  });
});

/* ================================================================= */
/* PART 13: Artifacts component-library no frameworks fallback       */
/* ================================================================= */

describe("artifacts: component-library framework fallback", () => {
  it("uses primary_language when no frameworks detected", () => {
    const comp: SourceFile = {
      path: "src/components/Button.ts",
      content: 'export class Button { render() { return "btn"; } }\n// l2\n// l3\n// l4\n// l5\n',
      size: 60,
    };
    const inp = input(snap(), ["component-library.json"], [comp]);
    inp.context_map.detection.frameworks = [];
    const res = generateFiles(inp);
    const f = getFile(res, "component-library.json");
    const data = JSON.parse(f!.content);
    expect(data.framework).toBeDefined();
  });
});

/* ================================================================= */
/* PART 14: Frontend component WITH exports → TRUE path              */
/* ================================================================= */

describe("frontend: component-guidelines with exported component", () => {
  it("lists component with export details", () => {
    const comp: SourceFile = {
      path: "src/components/Card.tsx",
      content: 'export function Card({ title }: { title: string }) { return <div>{title}</div>; }\nexport type CardProps = { title: string };\n// l3\n// l4\n// l5\n',
      size: 100,
    };
    const inp = input(snap(), ["component-guidelines.md"], [comp]);
    addFw(inp, "React");
    const res = generateFiles(inp);
    const f = getFile(res, "component-guidelines.md");
    expect(f!.content).toContain("Card");
  });
});

/* ================================================================= */
/* PART 15: Canvas with domain models                                */
/* ================================================================= */

describe("canvas: asset-guidelines with domain models", () => {
  it("renders domain model iconography", () => {
    const inp = input(snap(), ["asset-guidelines.md"]);
    inp.context_map.domain_models = [
      { name: "Order", kind: "interface", field_count: 7, source_file: "src/models/order.ts" },
    ];
    const res = generateFiles(inp);
    const f = getFile(res, "asset-guidelines.md");
    expect(f!.content.length).toBeGreaterThan(50);
  });
});

/* ================================================================= */
/* PART 16: Algorithmic export-manifest with frameworks              */
/* ================================================================= */

describe("algorithmic: export-manifest with frameworks", () => {
  it("includes detected stack section", () => {
    const inp = input(snap(), ["export-manifest.yaml"]);
    addFw(inp, "React");
    const res = generateFiles(inp);
    const f = getFile(res, "export-manifest.yaml");
    expect(f!.content.length).toBeGreaterThan(50);
  });
});

/* ================================================================= */
/* PART 17: Superpowers with test files matching source               */
/* ================================================================= */

describe("superpowers: test-gen with test file matching source", () => {
  it("recognizes tested source files", () => {
    const src: SourceFile = {
      path: "src/utils/math.ts",
      content: 'export function sum(a: number, b: number) { return a + b; }\n// l2\n// l3\n// l4\n// l5\n',
      size: 70,
    };
    const test: SourceFile = {
      path: "src/utils/math.test.ts",
      content: 'import { sum } from "./math";\ntest("sum", () => expect(sum(1,2)).toBe(3));\n// l3\n// l4\n// l5\n',
      size: 80,
    };
    const inp = input(snap(), ["test-generation-rules.md"], [src, test]);
    const res = generateFiles(inp);
    const f = getFile(res, "test-generation-rules.md");
    expect(f).toBeDefined();
  });
});

/* ================================================================= */
/* PART 18: Diverse source files to ALL remaining generators         */
/* ================================================================= */

describe("kitchen sink: diverse source files to all generators", () => {
  it("covers remaining source file conditions", () => {
    const allFiles: SourceFile[] = [
      ENTRY_EXPORTS,
      ENTRY_NO_EXPORTS,
      CONFIG_FILE,
      CSS_FILE,
      MEDIA_FILE,
      CI_FILE,
      README_FILE,
      CONTRIBUTING_FILE,
    ];
    const outputs = [
      "campaign-brief.md",
      "obsidian-skill-pack.md",
      "vault-rules.md",
      "messaging-system.yaml",
      "brand-guidelines.md",
      "policy-pack.md",
      "AGENTS.md",
      "incident-template.md",
      "component-theme-map.json",
      "dark-mode-tokens.json",
      "schema-recommendations.json",
      "generative-sketch.ts",
      "parameter-pack.json",
      "collection-map.md",
      "variation-matrix.json",
      "poster-layouts.md",
      "storyboard.md",
      "ab-test-plan.md",
      "channel-rulebook.md",
      "template-pack.md",
      "notebook-summary.md",
      "study-brief.md",
      "source-map.json",
      "server-manifest.yaml",
      "capability-registry.json",
      "mcp-config.json",
    ];
    const inp = input(snap(), outputs, allFiles);
    const res = generateFiles(inp);
    for (const o of outputs) {
      expect(getFile(res, o)).toBeDefined();
    }
  });
});
