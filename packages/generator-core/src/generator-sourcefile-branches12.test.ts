import { describe, it, expect } from "vitest";
import { generateFiles } from "./generate.js";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { SnapshotRecord, FileEntry } from "@axis/snapshots";
import type { GeneratorInput, SourceFile } from "./types.js";

/* --- Fixture Helpers ------------------------------------------------ */

function snap(opts: { name?: string; type?: string; files?: FileEntry[] } = {}): SnapshotRecord {
  const files = opts.files ?? [];
  return {
    snapshot_id: "snap-sf12-001",
    project_id: "proj-sf12-001",
    created_at: new Date().toISOString(),
    input_method: "repo_snapshot_upload",
    manifest: {
      project_name: opts.name ?? "sf12-test",
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

/* ================================================================= */
/* GROUP A: project_summary="" for generators still missing coverage  */
/* ================================================================= */

describe("project_summary FALSE path — batch 2", () => {
  const outputs = [
    "brand-guidelines.md",       // brand L19
    "messaging-system.yaml",     // brand L430
    "component-library.json",    // artifacts L558
    "schema-recommendations.json", // seo L266
    "component-guidelines.md",   // frontend L189
    "collection-map.md",         // algorithmic L296
  ];

  it("generates all outputs with empty project_summary", () => {
    const inp = input(snap(), outputs);
    inp.context_map.ai_context.project_summary = "";
    const res = generateFiles(inp);
    for (const o of outputs) {
      expect(getFile(res, o), `missing: ${o}`).toBeDefined();
    }
  });

  it("brand-guidelines content check with empty summary", () => {
    const inp = input(snap(), ["brand-guidelines.md"]);
    inp.context_map.ai_context.project_summary = "";
    const res = generateFiles(inp);
    const f = getFile(res, "brand-guidelines.md");
    expect(f!.content.length).toBeGreaterThan(50);
  });

  it("messaging-system content check with empty summary", () => {
    const inp = input(snap(), ["messaging-system.yaml"]);
    inp.context_map.ai_context.project_summary = "";
    const res = generateFiles(inp);
    const f = getFile(res, "messaging-system.yaml");
    expect(f!.content.length).toBeGreaterThan(50);
  });
});

/* ================================================================= */
/* GROUP B: No matching source files (FALSE path of length > 0)      */
/* ================================================================= */

describe("no matching source files — empty arrays", () => {
  /* An inert file that is NOT a component, entry, config, page, or route */
  const INERT: SourceFile = {
    path: "docs/notes.txt",
    content: "Just a plain text file with notes.\nLine 2.\nLine 3.\nLine 4.\nLine 5.\n",
    size: 70,
  };

  it("generated-component with no component files → components.length===0 FALSE", () => {
    // artifacts L59: if (components.length > 0) — FALSE path
    const inp = input(snap(), ["generated-component.tsx"], [INERT]);
    const res = generateFiles(inp);
    expect(getFile(res, "generated-component.tsx")).toBeDefined();
  });

  it("dashboard-widget with no config files → configs.length===0 FALSE", () => {
    // artifacts L167: if (configs.length > 0) — FALSE path
    const inp = input(snap(), ["dashboard-widget.tsx"], [INERT]);
    const res = generateFiles(inp);
    expect(getFile(res, "dashboard-widget.tsx")).toBeDefined();
  });

  it("embed-snippet with no entry points → entries.length===0 FALSE", () => {
    // artifacts L251: if (entries.length > 0) — FALSE path
    const inp = input(snap(), ["embed-snippet.ts"], [INERT]);
    const res = generateFiles(inp);
    expect(getFile(res, "embed-snippet.ts")).toBeDefined();
  });

  it("incident-template with no entry points → entries.length===0 FALSE", () => {
    // debug L525: if (entries.length > 0) — FALSE path
    const inp = input(snap(), ["incident-template.md"], [INERT]);
    const res = generateFiles(inp);
    expect(getFile(res, "incident-template.md")).toBeDefined();
  });

  it("tracing-rules with no entry points → entries.length===0 FALSE", () => {
    // debug L737: if (entries.length > 0) — FALSE path
    const inp = input(snap(), ["tracing-rules.md"], [INERT]);
    const res = generateFiles(inp);
    expect(getFile(res, "tracing-rules.md")).toBeDefined();
  });

  it("seo-rules with no page files → pageFiles.length===0 FALSE", () => {
    // seo L155: if (pageFiles.length > 0) — FALSE path
    const inp = input(snap(), [".ai/seo-rules.md"], [INERT]);
    const res = generateFiles(inp);
    expect(getFile(res, ".ai/seo-rules.md")).toBeDefined();
  });

  it("route-priority-map with no route files → routeFiles.length===0 FALSE", () => {
    // seo L425: if (routeFiles.length > 0) — FALSE path
    const inp = input(snap(), ["route-priority-map.md"], [INERT]);
    const res = generateFiles(inp);
    expect(getFile(res, "route-priority-map.md")).toBeDefined();
  });

  it("obsidian-skill-pack with no config files → configs.length===0 FALSE", () => {
    // obsidian L155: if (configs.length > 0) — FALSE path
    const inp = input(snap(), ["obsidian-skill-pack.md"], [INERT]);
    const res = generateFiles(inp);
    expect(getFile(res, "obsidian-skill-pack.md")).toBeDefined();
  });

  it("AGENTS.md with no entry points → entries.length===0 FALSE", () => {
    // skills L135: if (entries.length > 0) — FALSE path
    const inp = input(snap(), ["AGENTS.md"], [INERT]);
    const res = generateFiles(inp);
    expect(getFile(res, "AGENTS.md")).toBeDefined();
  });

  it("workflow-registry with no config files → cfgFiles.length===0 FALSE", () => {
    // superpowers L345: if (cfgFiles.length > 0) — FALSE path
    const inp = input(snap(), ["workflow-registry.json"], [INERT]);
    const res = generateFiles(inp);
    expect(getFile(res, "workflow-registry.json")).toBeDefined();
  });

  it("brand-guidelines with no README/CONTRIBUTING files → readmes.length===0 FALSE", () => {
    // brand L148: if (readmes.length > 0) — FALSE path
    const inp = input(snap(), ["brand-guidelines.md"], [INERT]);
    const res = generateFiles(inp);
    const f = getFile(res, "brand-guidelines.md");
    expect(f!.content.length).toBeGreaterThan(50);
  });
});

/* ================================================================= */
/* GROUP C: Empty warnings array (FALSE path)                        */
/* ================================================================= */

describe("empty warnings → warnings.length===0 FALSE path", () => {
  it("theme-guidelines with no warnings", () => {
    // theme L719: if (warnings.length > 0) — FALSE path
    const inp = input(snap(), ["theme-guidelines.md"]);
    inp.context_map.ai_context.warnings = [];
    const res = generateFiles(inp);
    expect(getFile(res, "theme-guidelines.md")).toBeDefined();
  });

  it("brand-board with no warnings", () => {
    // canvas L614: if (warnings.length > 0) — FALSE path
    const inp = input(snap(), ["brand-board.md"]);
    inp.context_map.ai_context.warnings = [];
    const res = generateFiles(inp);
    expect(getFile(res, "brand-board.md")).toBeDefined();
  });
});

/* ================================================================= */
/* GROUP D: Many files (13+ components, 7+ entries, 13+ routes)      */
/* ================================================================= */

describe("many file truncation branches", () => {
  it("component-guidelines with 14 components → components.length>12 TRUE", () => {
    // frontend L281: if (components.length > 12) — TRUE path
    const comps: SourceFile[] = Array.from({ length: 14 }, (_, i) => ({
      path: `src/components/Comp${i}.tsx`,
      content: `export function Comp${i}() { return <div>Comp ${i}</div>; }\n// l2\n// l3\n// l4\n// l5\n`,
      size: 60,
    }));
    const inp = input(snap(), ["component-guidelines.md"], comps);
    const res = generateFiles(inp);
    const f = getFile(res, "component-guidelines.md");
    expect(f!.content).toContain("more");
  });

  it("AGENTS.md with 8 entry points → entries.length>6 TRUE", () => {
    // skills L146: if (entries.length > 6) — TRUE path
    const entries: SourceFile[] = Array.from({ length: 8 }, (_, i) => ({
      path: `src/cmd/entry${i}/main.ts`,
      content: `export function main${i}() { return ${i}; }\n// line2\n// line3\n// line4\n// line5\n`,
      size: 60,
    }));
    const inp = input(snap(), ["AGENTS.md"], entries);
    const res = generateFiles(inp);
    const f = getFile(res, "AGENTS.md");
    expect(f!.content).toContain("more");
  });

  it("theme-guidelines with 14 routes → routes.length>12 TRUE", () => {
    // theme L702: if (ctx.routes.length > 12) — TRUE path
    const files: FileEntry[] = [];
    // Create a Go project with many routes
    const routeLines = Array.from({ length: 14 }, (_, i) => `  e.GET("/api/v1/resource${i}", handler${i})`).join("\n");
    files.push({
      path: "main.go",
      content: `package main\nimport "github.com/labstack/echo/v4"\nfunc main() {\n  e := echo.New()\n${routeLines}\n}\n`,
      size: 500,
    });
    const inp = input(snap({ files }), ["theme-guidelines.md"]);
    addFw(inp, "Echo");
    const res = generateFiles(inp);
    const f = getFile(res, "theme-guidelines.md");
    expect(f!.content.length).toBeGreaterThan(100);
  });
});

/* ================================================================= */
/* GROUP E: Route file edge cases for SEO generator                  */
/* ================================================================= */

describe("SEO route-priority-map edge cases", () => {
  it("route file with no exports → exports.join()||'default' RIGHT side", () => {
    // seo L432: exports.join(", ") || "default" — RIGHT side
    const routeFile: SourceFile = {
      path: "src/routes/+page.svelte",
      content: '<h1>Hello</h1>\n<p>No exports here</p>\n<!-- l3 -->\n<!-- l4 -->\n<!-- l5 -->\n',
      size: 60,
    };
    const inp = input(snap(), ["route-priority-map.md"], [routeFile]);
    addFw(inp, "SvelteKit");
    const res = generateFiles(inp);
    const f = getFile(res, "route-priority-map.md");
    expect(f).toBeDefined();
    // The route table should contain "default" since the file has no exports
    if (f!.content.includes("+page.svelte")) {
      expect(f!.content.toLowerCase()).toContain("default");
    }
  });

  it("route files all very short → no exemplar FALSE path", () => {
    // seo L440: if (exemplar) — FALSE path (all route files <5 lines)
    const shortRoute: SourceFile = {
      path: "src/routes/+page.svelte",
      content: '<h1>Hi</h1>\n<p>Short</p>\n',
      size: 30,
    };
    const inp = input(snap(), ["route-priority-map.md"], [shortRoute]);
    addFw(inp, "SvelteKit");
    const res = generateFiles(inp);
    expect(getFile(res, "route-priority-map.md")).toBeDefined();
  });
});

/* ================================================================= */
/* GROUP F: Hotspot files with no exports                            */
/* ================================================================= */

describe("debug: root-cause-checklist hotspot with no exports", () => {
  it("hotspot file content has no export statements → exports.length===0 FALSE", () => {
    // debug L978: if (exports.length > 0) — FALSE path
    const hotspot: SourceFile = {
      path: "src/utils/helpers.ts",
      content: 'const add = (a: number, b: number) => a + b;\nconst sub = (a: number, b: number) => a - b;\nfunction internal() { return 42; }\n// line4\n// line5\n',
      size: 120,
    };
    const inp = input(snap(), ["root-cause-checklist.md"], [hotspot]);
    const res = generateFiles(inp);
    expect(getFile(res, "root-cause-checklist.md")).toBeDefined();
  });
});
