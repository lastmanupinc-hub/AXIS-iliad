import { describe, it, expect } from "vitest";
import { generateFiles } from "./generate.js";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { SnapshotRecord, FileEntry } from "@axis/snapshots";
import type { GeneratorInput, SourceFile } from "./types.js";

/* --- Fixture Helpers ------------------------------------------------ */

function snap(opts: { name?: string; type?: string; files?: FileEntry[] } = {}): SnapshotRecord {
  const files = opts.files ?? [];
  return {
    snapshot_id: "snap-sf8-001",
    project_id: "proj-sf8-001",
    created_at: new Date().toISOString(),
    input_method: "repo_snapshot_upload",
    manifest: {
      project_name: opts.name ?? "sf8-test",
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
  return result.files.find(f => f.path === path);
}

/* entry-point source file (5-80 lines, has exports) */
const ENTRY_SRC: SourceFile = {
  path: "src/index.ts",
  content: 'export function main() { return "hello"; }\nexport const VERSION = "1.0";\n// line3\n// line4\n// line5\n// line6\n// line7\n',
  size: 200,
};

/* config source file */
const CONFIG_SRC: SourceFile = {
  path: "tsconfig.json",
  content: '{\n  "compilerOptions": {\n    "strict": true\n  }\n}\n',
  size: 60,
};

/* README source file */
const README_SRC: SourceFile = {
  path: "README.md",
  content: "# My Project\n\nA great framework for building apps.\n\n## Features\n\n- Fast\n- Reliable\n",
  size: 120,
};

/* package.json source file with description and keywords */
const PKG_SRC: SourceFile = {
  path: "package.json",
  content: '{\n  "name": "sf8-test",\n  "description": "A test package for branch coverage",\n  "keywords": ["testing", "coverage", "branches"],\n  "dependencies": { "react": "^18" }\n}\n',
  size: 200,
};

/* markdown doc file */
const DOC_MD: SourceFile = {
  path: "docs/guide.md",
  content: "# Guide\n\nThis is a guide for the project.\n",
  size: 50,
};

/* CONTRIBUTING file */
const CONTRIBUTING_SRC: SourceFile = {
  path: "CONTRIBUTING.md",
  content: "# Contributing\n\nPlease follow these guidelines.\n",
  size: 50,
};

/* Vue component source file */
const VUE_SRC: SourceFile = {
  path: "src/App.vue",
  content: '<template>\n  <div>{{ msg }}</div>\n</template>\n<script setup>\nconst msg = "hello";\n</script>\n',
  size: 100,
};

/* Layout file with exports and right size */
const LAYOUT_SRC: SourceFile = {
  path: "src/Layout.tsx",
  content: 'export function Layout({ children }: { children: React.ReactNode }) {\n  return <div className="layout">{children}</div>;\n}\nexport default Layout;\n// line5\n// line6\n',
  size: 180,
};

/* Media file */
const MEDIA_SRC: SourceFile = {
  path: "assets/intro.mp4",
  content: "binary-video-data",
  size: 5000,
};

/* YAML CI file */
const CI_YML: SourceFile = {
  path: ".github/workflows/ci.yml",
  content: "name: CI\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n",
  size: 80,
};

/* Svelte page component */
const SVELTE_PAGE: SourceFile = {
  path: "src/routes/+page.svelte",
  content: '<script>\n  import { page } from "$app/stores";\n</script>\n<svelte:head><title>Home</title></svelte:head>\n<h1>Welcome</h1>\n',
  size: 150,
};

/* Page component without meta */
const PAGE_NO_META: SourceFile = {
  path: "src/routes/about/+page.svelte",
  content: '<h1>About</h1>\n<p>Some content here</p>\n',
  size: 60,
};

/* Hotspot-matching file */
function hotspotFile(path: string): SourceFile {
  return {
    path,
    content: 'export function handler() { return null; }\nexport class Service {}\n// line3\n// line4\n// line5\n',
    size: 120,
  };
}

/* ----------------------------------------------------------------- */
/* MARKETING — campaign-brief source-derived messaging               */
/* ----------------------------------------------------------------- */
describe("marketing: campaign-brief source-derived messaging", () => {
  it("extracts description and keywords from package.json", () => {
    const inp = input(snap(), ["campaign-brief.md"], [PKG_SRC, README_SRC]);
    const res = generateFiles(inp);
    const f = getFile(res, "campaign-brief.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Source-Derived Messaging");
    expect(f!.content).toContain("Package description");
    expect(f!.content).toContain("A test package for branch coverage");
    expect(f!.content).toContain("Keywords");
    expect(f!.content).toContain("testing");
  });

  it("extracts README tagline", () => {
    const inp = input(snap(), ["campaign-brief.md"], [README_SRC]);
    const res = generateFiles(inp);
    const f = getFile(res, "campaign-brief.md");
    expect(f!.content).toContain("README tagline");
    expect(f!.content).toContain("A great framework");
  });
});

/* ----------------------------------------------------------------- */
/* MARKETING — sequence-pack contributor assets                      */
/* ----------------------------------------------------------------- */
describe("marketing: sequence-pack contributor assets", () => {
  it("detects CONTRIBUTING files", () => {
    const inp = input(snap(), ["sequence-pack.md"], [CONTRIBUTING_SRC]);
    const res = generateFiles(inp);
    const f = getFile(res, "sequence-pack.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Detected Contributor Assets");
    expect(f!.content).toContain("CONTRIBUTING.md");
  });
});

/* ----------------------------------------------------------------- */
/* MARKETING — cro-playbook frameworks + landing pages               */
/* ----------------------------------------------------------------- */
describe("marketing: cro-playbook with stack and landing pages", () => {
  it("renders framework table when frameworks present", () => {
    const inp = input(snap(), ["cro-playbook.md"]);
    addFw(inp, "Next.js", "Tailwind CSS");
    const res = generateFiles(inp);
    const f = getFile(res, "cro-playbook.md");
    expect(f!.content).toContain("Detected Stack");
    expect(f!.content).toContain("Next.js");
  });

  it("detects landing pages from source files", () => {
    const landing: SourceFile = { path: "src/pages/landing.tsx", content: "export default Landing;", size: 40 };
    const inp = input(snap(), ["cro-playbook.md"], [landing]);
    const res = generateFiles(inp);
    const f = getFile(res, "cro-playbook.md");
    expect(f!.content).toContain("Detected Landing/Conversion Pages");
    expect(f!.content).toContain("landing.tsx");
  });
});

/* ----------------------------------------------------------------- */
/* OBSIDIAN — vault-rules markdown files                             */
/* ----------------------------------------------------------------- */
describe("obsidian: vault-rules markdown detection", () => {
  it("lists existing markdown files", () => {
    const inp = input(snap(), ["vault-rules.md"], [DOC_MD, README_SRC]);
    const res = generateFiles(inp);
    const f = getFile(res, "vault-rules.md");
    expect(f!.content).toContain("Existing Markdown Files");
  });
});

/* ----------------------------------------------------------------- */
/* OBSIDIAN — graph-prompt-map source entry points                   */
/* ----------------------------------------------------------------- */
describe("obsidian: graph-prompt-map source analysis", () => {
  it("includes source_entry_points when files provided", () => {
    const inp = input(snap(), ["graph-prompt-map.json"], [ENTRY_SRC]);
    const res = generateFiles(inp);
    const f = getFile(res, "graph-prompt-map.json");
    const data = JSON.parse(f!.content);
    expect(data.source_file_count).toBe(1);
    expect(data.source_entry_points).toBeDefined();
    expect(data.source_entry_points.length).toBeGreaterThan(0);
  });
});

/* ----------------------------------------------------------------- */
/* OBSIDIAN — linking-policy entry point hub candidates              */
/* ----------------------------------------------------------------- */
describe("obsidian: linking-policy source entry points", () => {
  it("lists entry points as hub note candidates", () => {
    const inp = input(snap(), ["linking-policy.md"], [ENTRY_SRC]);
    const res = generateFiles(inp);
    const f = getFile(res, "linking-policy.md");
    expect(f!.content).toContain("Source Entry Points as Hub Note Candidates");
    expect(f!.content).toContain("src/index.ts");
  });
});

/* ----------------------------------------------------------------- */
/* OBSIDIAN — template-pack source overview                          */
/* ----------------------------------------------------------------- */
describe("obsidian: template-pack source file analysis", () => {
  it("includes source file summary", () => {
    const inp = input(snap(), ["template-pack.md"], [ENTRY_SRC]);
    const res = generateFiles(inp);
    const f = getFile(res, "template-pack.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Source File");
  });
});

/* ----------------------------------------------------------------- */
/* ARTIFACTS — embed-snippet entry points + exemplar                 */
/* ----------------------------------------------------------------- */
describe("artifacts: embed-snippet source entry points and exemplar", () => {
  it("renders entry point data in emitted snippet", () => {
    const inp = input(snap(), ["embed-snippet.ts"], [ENTRY_SRC]);
    const res = generateFiles(inp);
    const f = getFile(res, "embed-snippet.ts");
    expect(f).toBeDefined();
    expect(f!.content).toContain("ENTRY_POINTS");
    expect(f!.content).toContain("index.ts");
  });
});

/* ----------------------------------------------------------------- */
/* ARTIFACTS — component-library source_components                   */
/* ----------------------------------------------------------------- */
describe("artifacts: component-library source_components", () => {
  it("includes source components from .tsx files", () => {
    const comp: SourceFile = {
      path: "src/components/Button.tsx",
      content: 'export function Button() { return <button>Click</button>; }',
      size: 60,
    };
    const inp = input(snap(), ["component-library.json"], [comp]);
    addFw(inp, "React");
    const res = generateFiles(inp);
    const f = getFile(res, "component-library.json");
    const data = JSON.parse(f!.content);
    expect(data.source_components).toBeDefined();
    expect(data.source_components.length).toBeGreaterThan(0);
    expect(data.source_components[0].path).toContain("Button.tsx");
  });
});

/* ----------------------------------------------------------------- */
/* BRAND — voice-and-tone doc files                                  */
/* ----------------------------------------------------------------- */
describe("brand: voice-and-tone documentation tone samples", () => {
  it("detects documentation files for tone audit", () => {
    const inp = input(snap(), ["voice-and-tone.md"], [DOC_MD, README_SRC]);
    const res = generateFiles(inp);
    const f = getFile(res, "voice-and-tone.md");
    expect(f!.content).toContain("Documentation Tone Samples");
    expect(f!.content).toContain("docs/guide.md");
  });
});

/* ----------------------------------------------------------------- */
/* BRAND — content-constraints config files                          */
/* ----------------------------------------------------------------- */
describe("brand: content-constraints formatting configs", () => {
  it("lists detected formatting configs", () => {
    const eslint: SourceFile = { path: ".eslintrc.json", content: '{"extends": "eslint:recommended"}', size: 40 };
    const inp = input(snap(), ["content-constraints.md"], [eslint, CONFIG_SRC]);
    const res = generateFiles(inp);
    const f = getFile(res, "content-constraints.md");
    expect(f!.content).toContain("Detected Formatting Configs");
  });
});

/* ----------------------------------------------------------------- */
/* BRAND — brand-board source analysis                               */
/* ----------------------------------------------------------------- */
describe("brand: brand-board source analysis", () => {
  it("includes brand asset references", () => {
    const logo: SourceFile = { path: "public/logo.svg", content: "<svg></svg>", size: 100 };
    const inp = input(snap(), ["brand-board.md"], [logo, README_SRC]);
    const res = generateFiles(inp);
    const f = getFile(res, "brand-board.md");
    expect(f).toBeDefined();
  });
});

/* ----------------------------------------------------------------- */
/* FRONTEND — layout-patterns layout files + exemplar                */
/* ----------------------------------------------------------------- */
describe("frontend: layout-patterns layout file detection", () => {
  it("finds layout files and renders reference excerpt", () => {
    const inp = input(snap(), ["layout-patterns.md"], [LAYOUT_SRC]);
    addFw(inp, "React");
    const res = generateFiles(inp);
    const f = getFile(res, "layout-patterns.md");
    expect(f!.content).toContain("Detected Layout Files");
    expect(f!.content).toContain("Layout.tsx");
    expect(f!.content).toContain("Reference Layout");
  });
});

/* ----------------------------------------------------------------- */
/* FRONTEND — ui-audit component signatures + style analysis         */
/* ----------------------------------------------------------------- */
describe("frontend: ui-audit source components", () => {
  it("renders component and style file analysis", () => {
    const comp: SourceFile = {
      path: "src/Button.tsx",
      content: 'export function Button() { return <button>Click</button>; }\n// line2\n// line3\n// line4\n// line5\n',
      size: 100,
    };
    const style: SourceFile = { path: "src/styles.css", content: ".btn { color: red; }", size: 30 };
    const inp = input(snap(), ["ui-audit.md"], [comp, style]);
    addFw(inp, "React");
    const res = generateFiles(inp);
    const f = getFile(res, "ui-audit.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Button.tsx");
  });
});

/* ----------------------------------------------------------------- */
/* NOTEBOOK — study-brief source entry points + configs              */
/* ----------------------------------------------------------------- */
describe("notebook: study-brief source analysis", () => {
  it("renders key files and configuration overview", () => {
    const inp = input(snap(), ["study-brief.md"], [ENTRY_SRC, CONFIG_SRC]);
    const res = generateFiles(inp);
    const f = getFile(res, "study-brief.md");
    expect(f!.content).toContain("Key Files to Read");
    expect(f!.content).toContain("Configuration Overview");
  });
});

/* ----------------------------------------------------------------- */
/* NOTEBOOK — research-threads entry point complexity                */
/* ----------------------------------------------------------------- */
describe("notebook: research-threads source-based threads", () => {
  it("renders entry point complexity thread", () => {
    const inp = input(snap(), ["research-threads.md"], [ENTRY_SRC]);
    const res = generateFiles(inp);
    const f = getFile(res, "research-threads.md");
    expect(f!.content).toContain("Source-Based Threads");
    expect(f!.content).toContain("Entry Point Complexity");
    expect(f!.content).toContain("src/index.ts");
  });
});

/* ----------------------------------------------------------------- */
/* NOTEBOOK — notebook-summary entry points + configs                */
/* ----------------------------------------------------------------- */
describe("notebook: notebook-summary source analysis", () => {
  it("renders entry point source and config excerpts", () => {
    const inp = input(snap(), ["notebook-summary.md"], [ENTRY_SRC, CONFIG_SRC]);
    const res = generateFiles(inp);
    const f = getFile(res, "notebook-summary.md");
    expect(f!.content).toContain("Entry Point Source");
    expect(f!.content).toContain("src/index.ts");
  });
});

/* ----------------------------------------------------------------- */
/* SUPERPOWERS — workflow-registry source config files                */
/* ----------------------------------------------------------------- */
describe("superpowers: workflow-registry source configs", () => {
  it("includes detected config file paths", () => {
    const inp = input(snap(), ["workflow-registry.json"], [CI_YML, CONFIG_SRC]);
    const res = generateFiles(inp);
    const f = getFile(res, "workflow-registry.json");
    const data = JSON.parse(f!.content);
    expect(data.source_config_files).toBeDefined();
    expect(data.source_config_files.length).toBeGreaterThan(0);
  });
});

/* ----------------------------------------------------------------- */
/* SUPERPOWERS — refactor-checklist hotspot exports                   */
/* ----------------------------------------------------------------- */
describe("superpowers: refactor-checklist hotspot file exports", () => {
  it("renders high-risk file export surface when hotspots match files", () => {
    const s = snap();
    const srcFiles: SourceFile[] = [{
      path: "src/core.ts",
      content: 'export const core = 1;\nexport function init() {}\n// line3\n// line4\n// line5\n',
      size: 100,
    }];
    const inp = input(s, ["refactor-checklist.md"], srcFiles);
    inp.context_map.dependency_graph.hotspots = [
      { path: "src/core.ts", inbound_count: 12, outbound_count: 8, risk_score: 8.0 },
    ];
    const res = generateFiles(inp);
    const f = getFile(res, "refactor-checklist.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("High-Risk File Export Surface");
    expect(f!.content).toContain("core.ts");
  });
});

/* ----------------------------------------------------------------- */
/* SUPERPOWERS — automation-pipeline CI/config files                  */
/* ----------------------------------------------------------------- */
describe("superpowers: automation-pipeline source files", () => {
  it("lists detected CI/config files", () => {
    const inp = input(snap(), ["automation-pipeline.yaml"], [CI_YML]);
    const res = generateFiles(inp);
    const f = getFile(res, "automation-pipeline.yaml");
    expect(f!.content).toContain("source_files");
    expect(f!.content).toContain("ci.yml");
  });
});

/* ----------------------------------------------------------------- */
/* SEO — content-audit source content + page components              */
/* ----------------------------------------------------------------- */
describe("seo: content-audit source content files and page components", () => {
  it("lists detected content files", () => {
    const inp = input(snap(), ["content-audit.md"], [DOC_MD, README_SRC]);
    const res = generateFiles(inp);
    const f = getFile(res, "content-audit.md");
    expect(f!.content).toContain("Detected Content Files");
    expect(f!.content).toContain("docs/guide.md");
  });

  it("analyzes page components for meta tags", () => {
    const inp = input(snap(), ["content-audit.md"], [SVELTE_PAGE, PAGE_NO_META]);
    addFw(inp, "SvelteKit");
    const res = generateFiles(inp);
    const f = getFile(res, "content-audit.md");
    expect(f!.content).toContain("Page Component Analysis");
    expect(f!.content).toContain("Yes"); // SVELTE_PAGE has svelte:head
    expect(f!.content).toContain("**Missing**"); // PAGE_NO_META has no meta
  });
});

/* ----------------------------------------------------------------- */
/* SEO — seo-rules no SSR warning                                    */
/* ----------------------------------------------------------------- */
describe("seo: seo-rules SPA warning", () => {
  it("warns about client-rendered React SPA", () => {
    const inp = input(snap(), [".ai/seo-rules.md"]);
    addFw(inp, "React");
    const res = generateFiles(inp);
    const f = getFile(res, ".ai/seo-rules.md");
    expect(f!.content).toContain("Client-rendered");
  });
});

/* ----------------------------------------------------------------- */
/* SEO — meta-tag-audit route analysis                               */
/* ----------------------------------------------------------------- */
describe("seo: meta-tag-audit with routes", () => {
  it("generates per-route audit with page routes", () => {
    const files: FileEntry[] = [
      { path: "app/page.tsx", content: 'export default function Home() {}', size: 40 },
      { path: "app/about/page.tsx", content: 'export default function About() {}', size: 40 },
    ];
    const inp = input(snap({ files }), ["meta-tag-audit.json"]);
    addFw(inp, "Next.js");
    const res = generateFiles(inp);
    const f = getFile(res, "meta-tag-audit.json");
    const data = JSON.parse(f!.content);
    expect(data.per_route_audit.length).toBeGreaterThan(0);
    expect(data.framework).toBe("next");
  });
});

/* ----------------------------------------------------------------- */
/* DEBUG — playbook with description                                 */
/* ----------------------------------------------------------------- */
describe("debug: playbook with project description", () => {
  it("renders description when README has content", () => {
    const files: FileEntry[] = [
      { path: "README.md", content: "# MyApp\n\nA high-performance API server for data processing.", size: 60 },
      { path: "src/index.ts", content: 'console.log("hi");', size: 20 },
    ];
    const inp = input(snap({ files }), [".ai/debug-playbook.md"]);
    const res = generateFiles(inp);
    const f = getFile(res, ".ai/debug-playbook.md");
    expect(f!.content).toContain("A high-performance API server");
  });
});

/* ----------------------------------------------------------------- */
/* DEBUG — playbook with Prisma + SQL schema                         */
/* ----------------------------------------------------------------- */
describe("debug: playbook Prisma + SQL schema", () => {
  it("renders Prisma debugging section and SQL tables", () => {
    const files: FileEntry[] = [
      { path: "src/index.ts", content: 'import { PrismaClient } from "@prisma/client";', size: 50 },
      { path: "schema.sql", content: "CREATE TABLE users (id INT PRIMARY KEY, name TEXT);\nCREATE TABLE orders (id INT PRIMARY KEY, user_id INT REFERENCES users(id));", size: 120 },
    ];
    const inp = input(snap({ files }), [".ai/debug-playbook.md"]);
    addFw(inp, "Prisma");
    const res = generateFiles(inp);
    const f = getFile(res, ".ai/debug-playbook.md");
    expect(f!.content).toContain("Prisma");
    expect(f!.content).toContain("prisma migrate dev");
    expect(f!.content).toContain("Tables in schema");
    expect(f!.content).toContain("users");
  });
});

/* ----------------------------------------------------------------- */
/* DEBUG — playbook with Svelte (non-SvelteKit)                      */
/* ----------------------------------------------------------------- */
describe("debug: playbook Svelte framework", () => {
  it("renders Svelte debugging section", () => {
    const inp = input(snap(), [".ai/debug-playbook.md"]);
    addFw(inp, "Svelte");
    const res = generateFiles(inp);
    const f = getFile(res, ".ai/debug-playbook.md");
    expect(f!.content).toContain("Svelte");
    expect(f!.content).toContain("Reactivity bugs");
    expect(f!.content).toContain("$state");
  });
});

/* ----------------------------------------------------------------- */
/* DEBUG — tracing-rules with hotspot file matching                  */
/* ----------------------------------------------------------------- */
describe("debug: tracing-rules source entry points", () => {
  it("renders entry point information when source files provided", () => {
    const srcFiles: SourceFile[] = [ENTRY_SRC];
    const inp = input(snap(), ["tracing-rules.md"], srcFiles);
    const res = generateFiles(inp);
    const f = getFile(res, "tracing-rules.md");
    expect(f!.content).toContain("Entry Point");
    expect(f!.content).toContain("src/index.ts");
  });
});

/* ----------------------------------------------------------------- */
/* DEBUG — tracing SQL + domain models                               */
/* ----------------------------------------------------------------- */
describe("debug: tracing-rules SQL + domain models", () => {
  it("renders database table monitoring and domain model watch list", () => {
    const files: FileEntry[] = [
      { path: "src/index.ts", content: 'export interface User { id: number; name: string; email: string; }', size: 70 },
      { path: "schema.sql", content: "CREATE TABLE users (id INT PRIMARY KEY, name TEXT, email TEXT);", size: 60 },
    ];
    const inp = input(snap({ files }), ["tracing-rules.md"]);
    const res = generateFiles(inp);
    const f = getFile(res, "tracing-rules.md");
    expect(f!.content).toContain("Database Table Monitoring");
    expect(f!.content).toContain("users");
    expect(f!.content).toContain("Domain Model Watch List");
    expect(f!.content).toContain("User");
  });
});

/* ----------------------------------------------------------------- */
/* DEBUG — root-cause-checklist with SQL + hotspot excerpts           */
/* ----------------------------------------------------------------- */
describe("debug: root-cause-checklist SQL + hotspot source excerpts", () => {
  it("renders DB integrity and suspect file excerpts", () => {
    const files: FileEntry[] = [
      { path: "src/core.ts", content: 'import { a } from "./a";\nimport { b } from "./b";\n', size: 60 },
      { path: "src/a.ts", content: 'import { core } from "./core";\nexport const a = 1;\n', size: 40 },
      { path: "src/b.ts", content: 'import { core } from "./core";\nexport const b = 2;\n', size: 40 },
      { path: "src/c.ts", content: 'import { core } from "./core";\nexport const c = 3;\n', size: 40 },
      { path: "src/d.ts", content: 'import { core } from "./core";\nexport const d = 4;\n', size: 40 },
      { path: "src/e.ts", content: 'import { core } from "./core";\nexport const e = 5;\n', size: 40 },
      { path: "schema.sql", content: "CREATE TABLE orders (id INT PRIMARY KEY, user_id INT REFERENCES users(id));", size: 80 },
    ];
    const s = snap({ files });
    const srcFiles: SourceFile[] = [hotspotFile("src/core.ts")];
    const inp = input(s, ["root-cause-checklist.md"], srcFiles);
    const res = generateFiles(inp);
    const f = getFile(res, "root-cause-checklist.md");
    expect(f!.content).toContain("Database Table Integrity");
    expect(f!.content).toContain("orders");
    expect(f!.content).toContain("Suspect File Excerpts");
  });
});

/* ----------------------------------------------------------------- */
/* DEBUG — root-cause CI + test framework verification               */
/* ----------------------------------------------------------------- */
describe("debug: root-cause-checklist CI platform and test verification", () => {
  it("includes CI pass check and test pass check", () => {
    const files: FileEntry[] = [
      { path: ".github/workflows/ci.yml", content: "name: CI\non: push\n", size: 20 },
      { path: "src/index.test.ts", content: 'test("works", () => {});', size: 30 },
      { path: "vitest.config.ts", content: 'export default {};', size: 20 },
      { path: "src/index.ts", content: 'export const x = 1;', size: 20 },
    ];
    const inp = input(snap({ files }), ["root-cause-checklist.md"]);
    const res = generateFiles(inp);
    const f = getFile(res, "root-cause-checklist.md");
    expect(f!.content).toContain("Does CI pass?");
    expect(f!.content).toContain("github_actions");
    expect(f!.content).toContain("Do all existing tests still pass?");
  });
});

/* ----------------------------------------------------------------- */
/* DEBUG — incident-template with domain models                      */
/* ----------------------------------------------------------------- */
describe("debug: incident-template domain models", () => {
  it("renders domain model checklist", () => {
    const files: FileEntry[] = [
      { path: "src/index.ts", content: 'export interface Order { id: number; total: number; status: string; }', size: 70 },
    ];
    const inp = input(snap({ files }), ["incident-template.md"]);
    const res = generateFiles(inp);
    const f = getFile(res, "incident-template.md");
    expect(f!.content).toContain("Order");
  });
});

/* ----------------------------------------------------------------- */
/* SKILLS — policy-pack no config files path                         */
/* ----------------------------------------------------------------- */
describe("skills: policy-pack with empty configs", () => {
  it("still generates when no config files found", () => {
    const noConfig: SourceFile = { path: "src/app.ts", content: 'console.log("app");', size: 20 };
    const inp = input(snap(), ["policy-pack.md"], [noConfig]);
    const res = generateFiles(inp);
    const f = getFile(res, "policy-pack.md");
    expect(f).toBeDefined();
  });
});

/* ----------------------------------------------------------------- */
/* SKILLS — .cursorrules with no entry points                        */
/* ----------------------------------------------------------------- */
describe("skills: .cursorrules empty exports path", () => {
  it("renders when entry points have no exports", () => {
    // Entry point with no exports
    const noExports: SourceFile = {
      path: "src/index.ts",
      content: 'console.log("no exports here");\n// line2\n// line3\n// line4\n// line5\n',
      size: 80,
    };
    const inp = input(snap(), [".cursorrules"], [noExports]);
    const res = generateFiles(inp);
    const f = getFile(res, ".cursorrules");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Entry Point");
  });
});

/* ----------------------------------------------------------------- */
/* MCP — automation-pipeline CI + mcp config                         */
/* ----------------------------------------------------------------- */
describe("mcp: mcp-config with no frameworks", () => {
  it("generates mcp-config with no framework-specific tools", () => {
    const inp = input(snap(), ["mcp-config.json"]);
    // No frameworks added
    const res = generateFiles(inp);
    const f = getFile(res, "mcp-config.json");
    expect(f).toBeDefined();
    const data = JSON.parse(f!.content);
    expect(data.tools).toBeDefined();
  });
});

/* ----------------------------------------------------------------- */
/* MCP — server-manifest source scripts                              */
/* ----------------------------------------------------------------- */
describe("mcp: server-manifest source scripts", () => {
  it("includes detected server source files", () => {
    const serverFile: SourceFile = { path: "src/server.ts", content: 'export function startServer() {}', size: 40 };
    const inp = input(snap(), ["server-manifest.yaml"], [serverFile]);
    const res = generateFiles(inp);
    const f = getFile(res, "server-manifest.yaml");
    expect(f).toBeDefined();
  });
});

/* ----------------------------------------------------------------- */
/* SEARCH — dependency-hotspots with matching source files            */
/* ----------------------------------------------------------------- */
describe("search: dependency-hotspots source excerpts", () => {
  it("includes hotspot source excerpts", () => {
    const files: FileEntry[] = [
      { path: "src/core.ts", content: 'import { a } from "./a";\nimport { b } from "./b";\n', size: 60 },
      { path: "src/a.ts", content: 'import { core } from "./core";\nexport const a = 1;\n', size: 40 },
      { path: "src/b.ts", content: 'import { core } from "./core";\nexport const b = 2;\n', size: 40 },
      { path: "src/c.ts", content: 'import { core } from "./core";\nexport const c = 3;\n', size: 40 },
      { path: "src/d.ts", content: 'import { core } from "./core";\nexport const d = 4;\n', size: 40 },
      { path: "src/e.ts", content: 'import { core } from "./core";\nexport const e = 5;\n', size: 40 },
    ];
    const s = snap({ files });
    const inp = input(s, ["dependency-hotspots.md"], [hotspotFile("src/core.ts")]);
    const res = generateFiles(inp);
    const f = getFile(res, "dependency-hotspots.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("src/core.ts");
  });
});

/* ----------------------------------------------------------------- */
/* THEME — component-theme-map non-React framework                   */
/* ----------------------------------------------------------------- */
describe("theme: component-theme-map non-React", () => {
  it("uses framework name instead of react when React not detected", () => {
    const inp = input(snap(), ["component-theme-map.json"]);
    addFw(inp, "Vue.js");
    const res = generateFiles(inp);
    const f = getFile(res, "component-theme-map.json");
    const data = JSON.parse(f!.content);
    expect(data.framework).not.toBe("react");
  });
});

/* ----------------------------------------------------------------- */
/* THEME — theme-guidelines source component + style analysis        */
/* ----------------------------------------------------------------- */
describe("theme: theme-guidelines source components", () => {
  it("includes component and style file analysis", () => {
    const comp: SourceFile = {
      path: "src/Card.tsx",
      content: 'export function Card() { return <div>Card</div>; }\n// line2\n// line3\n// line4\n// line5\n',
      size: 100,
    };
    const style: SourceFile = { path: "src/theme.css", content: ":root { --color-primary: #000; }\n.card { color: var(--color-primary); }", size: 80 };
    const inp = input(snap(), ["theme-guidelines.md"], [comp, style]);
    addFw(inp, "React");
    const res = generateFiles(inp);
    const f = getFile(res, "theme-guidelines.md");
    expect(f).toBeDefined();
  });
});

/* ----------------------------------------------------------------- */
/* OPTIMIZATION — token-budget-plan hotspot excerpts                  */
/* ----------------------------------------------------------------- */
describe("optimization: token-budget-plan source hotspot analysis", () => {
  it("includes hotspot excerpts when files match", () => {
    const files: FileEntry[] = [
      { path: "src/core.ts", content: 'import { a } from "./a";\nimport { b } from "./b";\n', size: 60 },
      { path: "src/a.ts", content: 'import { core } from "./core";\nexport const a = 1;\n', size: 40 },
      { path: "src/b.ts", content: 'import { core } from "./core";\nexport const b = 2;\n', size: 40 },
      { path: "src/c.ts", content: 'import { core } from "./core";\nexport const c = 3;\n', size: 40 },
      { path: "src/d.ts", content: 'import { core } from "./core";\nexport const d = 4;\n', size: 40 },
      { path: "src/e.ts", content: 'import { core } from "./core";\nexport const e = 5;\n', size: 40 },
    ];
    const s = snap({ files });
    const inp = input(s, ["token-budget-plan.md"], [hotspotFile("src/core.ts")]);
    const res = generateFiles(inp);
    const f = getFile(res, "token-budget-plan.md");
    expect(f).toBeDefined();
  });
});

/* ----------------------------------------------------------------- */
/* CANVAS — canvas-spec data field binding                           */
/* ----------------------------------------------------------------- */
describe("canvas: canvas-spec data fields", () => {
  it("includes domain models as data fields", () => {
    const files: FileEntry[] = [
      { path: "src/index.ts", content: 'export interface Product { id: number; name: string; price: number; }', size: 70 },
    ];
    const inp = input(snap({ files }), ["canvas-spec.json"]);
    const res = generateFiles(inp);
    const f = getFile(res, "canvas-spec.json");
    const data = JSON.parse(f!.content);
    expect(data).toBeDefined();
  });
});

/* ----------------------------------------------------------------- */
/* CANVAS — poster-layouts source file analysis                      */
/* ----------------------------------------------------------------- */
describe("canvas: poster-layouts source analysis", () => {
  it("generates poster layouts with css/asset source files", () => {
    const cssFile: SourceFile = { path: "src/styles.css", content: ".poster { display: flex; }", size: 30 };
    const inp = input(snap(), ["poster-layouts.md"], [cssFile]);
    const res = generateFiles(inp);
    const f = getFile(res, "poster-layouts.md");
    expect(f).toBeDefined();
  });
});

/* ----------------------------------------------------------------- */
/* REMOTION — remotion-script media assets                           */
/* ----------------------------------------------------------------- */
describe("remotion: remotion-script media asset detection", () => {
  it("includes detected media assets", () => {
    const inp = input(snap(), ["remotion-script.ts"], [MEDIA_SRC]);
    const res = generateFiles(inp);
    const f = getFile(res, "remotion-script.ts");
    expect(f!.content).toContain("Detected Media Assets");
    expect(f!.content).toContain("intro.mp4");
  });
});

/* ----------------------------------------------------------------- */
/* ALGORITHMIC — export-manifest with media assets                   */
/* ----------------------------------------------------------------- */
describe("algorithmic: export-manifest source assets", () => {
  it("includes source asset analysis", () => {
    const imgFile: SourceFile = { path: "art/output.png", content: "png-data", size: 500 };
    const inp = input(snap(), ["export-manifest.yaml"], [imgFile]);
    const res = generateFiles(inp);
    const f = getFile(res, "export-manifest.yaml");
    expect(f).toBeDefined();
  });
});

/* ----------------------------------------------------------------- */
/* MARKETING — channel-rulebook warnings section                     */
/* ----------------------------------------------------------------- */
describe("marketing: channel-rulebook with warnings", () => {
  it("renders warnings section when AI warnings exist", () => {
    const files: FileEntry[] = [
      { path: "src/index.ts", content: 'console.log("test");', size: 25 },
    ];
    const inp = input(snap({ files }), ["channel-rulebook.md"]);
    // AI context warnings are auto-populated — no tests/CI/lockfile
    const res = generateFiles(inp);
    const f = getFile(res, "channel-rulebook.md");
    expect(f).toBeDefined();
  });
});

/* ----------------------------------------------------------------- */
/* MARKETING — ab-test-plan with routes                              */
/* ----------------------------------------------------------------- */
describe("marketing: ab-test-plan route analysis", () => {
  it("generates test plan using detected routes", () => {
    const files: FileEntry[] = [
      { path: "app/page.tsx", content: "export default function Home() {}", size: 40 },
      { path: "app/pricing/page.tsx", content: "export default function Pricing() {}", size: 40 },
    ];
    const inp = input(snap({ files }), ["ab-test-plan.md"]);
    addFw(inp, "Next.js");
    const res = generateFiles(inp);
    const f = getFile(res, "ab-test-plan.md");
    expect(f).toBeDefined();
  });
});

/* ----------------------------------------------------------------- */
/* SKILLS — AGENTS.md with no warnings                               */
/* ----------------------------------------------------------------- */
describe("skills: AGENTS.md no-warnings path", () => {
  it("omits Known Issues when no warnings exist", () => {
    const files: FileEntry[] = [
      { path: "tsconfig.json", content: '{"compilerOptions": {"strict": true}}', size: 40 },
      { path: "src/index.ts", content: 'export const x = 1;', size: 20 },
      { path: "src/index.test.ts", content: 'test("x", () => {});', size: 25 },
      { path: ".github/workflows/ci.yml", content: "name: CI", size: 10 },
      { path: "pnpm-lock.yaml", content: "lockfileVersion: 5", size: 20 },
      { path: ".eslintrc.json", content: '{"extends": "eslint:recommended"}', size: 35 },
      { path: ".prettierrc", content: '{}', size: 2 },
    ];
    const inp = input(snap({ files }), ["AGENTS.md"]);
    const res = generateFiles(inp);
    const f = getFile(res, "AGENTS.md");
    // With CI, tests, lockfile — no warnings should be generated
    expect(f!.content).not.toContain("Known Issues");
  });
});

/* ----------------------------------------------------------------- */
/* NOTEBOOK — citation-index framework docs                          */
/* ----------------------------------------------------------------- */
describe("notebook: citation-index detection", () => {
  it("generates framework documentation citations", () => {
    const inp = input(snap(), ["citation-index.json"]);
    addFw(inp, "Next.js", "Prisma");
    const res = generateFiles(inp);
    const f = getFile(res, "citation-index.json");
    const data = JSON.parse(f!.content);
    const fwCitations = data.citations.filter((c: { type: string }) => c.type === "documentation");
    expect(fwCitations.length).toBeGreaterThanOrEqual(2);
  });
});

/* ----------------------------------------------------------------- */
/* CANVAS — asset-guidelines with image assets                       */
/* ----------------------------------------------------------------- */
describe("canvas: asset-guidelines asset file detection", () => {
  it("includes detected asset files in analysis", () => {
    const svgFile: SourceFile = { path: "assets/icon.svg", content: "<svg></svg>", size: 50 };
    const inp = input(snap(), ["asset-guidelines.md"], [svgFile]);
    const res = generateFiles(inp);
    const f = getFile(res, "asset-guidelines.md");
    expect(f).toBeDefined();
  });
});

/* ----------------------------------------------------------------- */
/* DEBUG — playbook with React framework                             */
/* ----------------------------------------------------------------- */
describe("debug: playbook React-specific section", () => {
  it("includes React debugging tips", () => {
    const inp = input(snap(), [".ai/debug-playbook.md"]);
    addFw(inp, "React");
    const res = generateFiles(inp);
    const f = getFile(res, ".ai/debug-playbook.md");
    expect(f!.content).toContain("React");
    expect(f!.content).toContain("stale closures");
    expect(f!.content).toContain("useEffect");
  });
});

/* ----------------------------------------------------------------- */
/* FRONTEND — frontend-rules source component file analysis          */
/* ----------------------------------------------------------------- */
describe("frontend: frontend-rules component file source", () => {
  it("renders component file excerpts when >10 components", () => {
    const comps: SourceFile[] = [];
    for (let i = 0; i < 12; i++) {
      comps.push({
        path: `src/components/Comp${i}.tsx`,
        content: `export function Comp${i}() { return <div>Comp ${i}</div>; }\n// line2\n// line3\n`,
        size: 80,
      });
    }
    const inp = input(snap(), [".ai/frontend-rules.md"], comps);
    addFw(inp, "React");
    const res = generateFiles(inp);
    const f = getFile(res, ".ai/frontend-rules.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Comp0");
  });
});

/* ----------------------------------------------------------------- */
/* SUPERPOWERS — superpower-pack with no source files                */
/* ----------------------------------------------------------------- */
describe("superpowers: superpower-pack no files path", () => {
  it("generates pack without source file section", () => {
    const inp = input(snap(), ["superpower-pack.md"]);
    const res = generateFiles(inp);
    const f = getFile(res, "superpower-pack.md");
    expect(f).toBeDefined();
    expect(f!.content).not.toContain("Source Entry Points");
  });
});

/* ----------------------------------------------------------------- */
/* SUPERPOWERS — test-generation-rules with test files               */
/* ----------------------------------------------------------------- */
describe("superpowers: test-generation-rules untested exports", () => {
  it("detects untested exports when no matching test file", () => {
    const srcFile: SourceFile = {
      path: "src/utils.ts",
      content: 'export function add(a: number, b: number) { return a + b; }\nexport function subtract(a: number, b: number) { return a - b; }\n// line3\n// line4\n// line5\n',
      size: 160,
    };
    const inp = input(snap(), ["test-generation-rules.md"], [srcFile]);
    const res = generateFiles(inp);
    const f = getFile(res, "test-generation-rules.md");
    expect(f).toBeDefined();
  });
});

/* ----------------------------------------------------------------- */
/* SEO — route-priority-map with routes                              */
/* ----------------------------------------------------------------- */
describe("seo: route-priority-map route categorization", () => {
  it("categorizes routes by type", () => {
    const files: FileEntry[] = [
      { path: "app/page.tsx", content: "export default function Home() {}", size: 40 },
      { path: "app/api/users/route.ts", content: "export async function GET() {}", size: 30 },
      { path: "app/blog/page.tsx", content: "export default function Blog() {}", size: 40 },
    ];
    const inp = input(snap({ files }), ["route-priority-map.md"]);
    addFw(inp, "Next.js");
    const res = generateFiles(inp);
    const f = getFile(res, "route-priority-map.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("/");
  });
});

/* ----------------------------------------------------------------- */
/* SEARCH — architecture-summary with deep patterns                  */
/* ----------------------------------------------------------------- */
describe("search: architecture-summary pattern detection", () => {
  it("detects MVC pattern", () => {
    const files: FileEntry[] = [
      { path: "services/user.ts", content: "export class UserService {}", size: 30 },
      { path: "controllers/user.ts", content: "export class UserController {}", size: 30 },
      { path: "models/user.ts", content: "export class User {}", size: 20 },
    ];
    const inp = input(snap({ files }), ["architecture-summary.md"]);
    const res = generateFiles(inp);
    const f = getFile(res, "architecture-summary.md");
    expect(f!.content).toContain("mvc");
  });
});

/* ----------------------------------------------------------------- */
/* OPTIMIZATION — optimization-rules performance rendering           */
/* ----------------------------------------------------------------- */
describe("optimization: optimization-rules with frameworks", () => {
  it("renders framework-specific optimization tips", () => {
    const inp = input(snap(), [".ai/optimization-rules.md"]);
    addFw(inp, "Next.js", "Prisma");
    const res = generateFiles(inp);
    const f = getFile(res, ".ai/optimization-rules.md");
    expect(f).toBeDefined();
  });
});

/* ----------------------------------------------------------------- */
/* MCP — connector-map resource URIs                                 */
/* ----------------------------------------------------------------- */
describe("mcp: connector-map resource URI generation", () => {
  it("generates resource URIs for routes", () => {
    const files: FileEntry[] = [
      { path: "app/api/users/route.ts", content: "export async function GET() {}", size: 30 },
    ];
    const inp = input(snap({ files }), ["connector-map.yaml"]);
    addFw(inp, "Next.js");
    const res = generateFiles(inp);
    const f = getFile(res, "connector-map.yaml");
    expect(f).toBeDefined();
  });
});

/* ----------------------------------------------------------------- */
/* MCP — capability-registry capabilities list                       */
/* ----------------------------------------------------------------- */
describe("mcp: capability-registry capabilities", () => {
  it("includes source file analysis", () => {
    const serverFile: SourceFile = {
      path: "src/server.ts",
      content: 'export function listen() { /* ... */ }\nexport function close() {}\n// line3\n// line4\n// line5\n',
      size: 100,
    };
    const inp = input(snap(), ["capability-registry.json"], [serverFile]);
    const res = generateFiles(inp);
    const f = getFile(res, "capability-registry.json");
    expect(f).toBeDefined();
  });
});
