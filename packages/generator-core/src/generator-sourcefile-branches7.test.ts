import { describe, it, expect } from "vitest";
import { generateFiles } from "./generate.js";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { SnapshotRecord, FileEntry } from "@axis/snapshots";
import type { GeneratorInput, SourceFile } from "./types.js";

/* --- Fixture Helpers ------------------------------------------------ */

function snap(opts: { name?: string; type?: string; files?: FileEntry[] } = {}): SnapshotRecord {
  const files = opts.files ?? [];
  return {
    snapshot_id: "snap-sf7-001",
    project_id: "proj-sf7-001",
    created_at: new Date().toISOString(),
    input_method: "repo_snapshot_upload",
    manifest: {
      project_name: opts.name ?? "sf7-test",
      project_type: opts.type ?? "web_application",
      frameworks: [],
      goals: [],
      requested_outputs: [],
    },
    file_count: files.length,
    total_size_bytes: files.reduce((s, f) => s + f.size, 0),
    files,
    status: "ready",
    account_id: null,
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

/** Inject framework detections into context_map */
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
/* ----------------------------------------------------------------- */
/* DEBUG - FRAMEWORK-SPECIFIC PLAYBOOK BRANCHES                      */
/* ----------------------------------------------------------------- */

describe("debug generator - framework-specific playbook branches", () => {
  it("debug-playbook: Next.js-specific debugging section", () => {
    const inp = input(snap(), ["debug-playbook.md"]);
    addFw(inp, "Next.js");
    const f = getFile(generateFiles(inp), "debug-playbook.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Next.js");
    expect(f!.content).toContain("Hydration mismatches");
  });

  it("debug-playbook: SvelteKit-specific debugging section", () => {
    const inp = input(snap(), ["debug-playbook.md"]);
    addFw(inp, "SvelteKit");
    const f = getFile(generateFiles(inp), "debug-playbook.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("SvelteKit");
    expect(f!.content).toContain("Load functions");
  });

  it("debug-playbook: Svelte-specific debugging section", () => {
    const inp = input(snap(), ["debug-playbook.md"]);
    addFw(inp, "Svelte");
    const f = getFile(generateFiles(inp), "debug-playbook.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Svelte");
    expect(f!.content).toContain("Reactivity bugs");
  });

  it("debug-playbook: React-specific debugging section", () => {
    const inp = input(snap(), ["debug-playbook.md"]);
    addFw(inp, "React");
    const f = getFile(generateFiles(inp), "debug-playbook.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("React");
    expect(f!.content).toContain("stale closures");
  });

  it("debug-playbook: Prisma with sql_schema tables", () => {
    const inp = input(snap(), ["debug-playbook.md"]);
    addFw(inp, "Prisma");
    inp.context_map.sql_schema = [
      { name: "users", column_count: 5, foreign_key_count: 0, source_file: "schema.sql" },
      { name: "orders", column_count: 8, foreign_key_count: 2, source_file: "schema.sql" },
    ];
    const f = getFile(generateFiles(inp), "debug-playbook.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Prisma");
    expect(f!.content).toContain("`users` (5 cols, 0 FKs)");
  });

  it("debug-playbook: Echo (Go HTTP) section", () => {
    const inp = input(snap(), ["debug-playbook.md"]);
    addFw(inp, "Echo");
    inp.context_map.project_identity.go_module = "github.com/org/api";
    const f = getFile(generateFiles(inp), "debug-playbook.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Echo");
  });

  it("debug-playbook: Gin (Go HTTP) section", () => {
    const inp = input(snap(), ["debug-playbook.md"]);
    addFw(inp, "Gin");
    inp.context_map.project_identity.go_module = "github.com/org/api";
    const f = getFile(generateFiles(inp), "debug-playbook.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Gin");
    expect(f!.content).toContain("ShouldBind");
  });

  it("debug-playbook: Express/Fastify API Server section", () => {
    const inp = input(snap(), ["debug-playbook.md"]);
    addFw(inp, "Express");
    const f = getFile(generateFiles(inp), "debug-playbook.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("catch-all routes");
  });
});
/* --- DEBUG - RICH CONTEXT BRANCHES --------------------------------- */

describe("debug generator - rich context branches", () => {
  it("debug-playbook: domain models, sql schema, routes, architecture", () => {
    const inp = input(snap(), ["debug-playbook.md"]);
    addFw(inp, "Next.js");
    inp.context_map.domain_models = [
      { name: "User", kind: "interface", language: "TypeScript", field_count: 6, source_file: "src/types.ts" },
    ];
    inp.context_map.sql_schema = [
      { name: "users", column_count: 5, foreign_key_count: 0, source_file: "schema.sql" },
      { name: "orders", column_count: 8, foreign_key_count: 2, source_file: "schema.sql" },
    ];
    inp.context_map.routes = [
      { method: "GET", path: "/api/users", source_file: "app/api/users/route.ts" },
    ];
    inp.context_map.architecture_signals.layer_boundaries = [
      { layer: "presentation", directories: ["src/app"] },
      { layer: "data", directories: ["src/db"] },
    ];
    inp.context_map.architecture_signals.separation_score = 0.4;
    inp.context_map.architecture_signals.patterns_detected = ["MVC"];
    const f = getFile(generateFiles(inp), "debug-playbook.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Domain Model");
    expect(f!.content).toContain("Database Schema");
    expect(f!.content).toContain("Route");
    expect(f!.content).toContain("Low separation");
    expect(f!.content).toContain("MVC");
  });

  it("debug-playbook: moderate separation (0.5-0.7) + docker", () => {
    const inp = input(snap(), ["debug-playbook.md"]);
    inp.context_map.architecture_signals.layer_boundaries = [
      { layer: "business_logic", directories: ["src/services"] },
    ];
    inp.context_map.architecture_signals.separation_score = 0.6;
    inp.context_map.detection.deployment_target = "docker";
    const f = getFile(generateFiles(inp), "debug-playbook.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Moderate separation");
    expect(f!.content).toContain("Container");
  });

  it("debug-playbook: good separation (>=0.7)", () => {
    const inp = input(snap(), ["debug-playbook.md"]);
    inp.context_map.architecture_signals.layer_boundaries = [
      { layer: "presentation", directories: ["src/app"] },
    ];
    inp.context_map.architecture_signals.separation_score = 0.85;
    const f = getFile(generateFiles(inp), "debug-playbook.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Good separation");
  });

  it("debug-playbook: >20 production deps shows truncation", () => {
    const inp = input(snap(), ["debug-playbook.md"]);
    const deps = [];
    for (let i = 0; i < 25; i++) {
      deps.push({ name: `dep-${i}`, version: "1.0.0", type: "production" as const });
    }
    inp.context_map.dependency_graph.external_dependencies = deps;
    const f = getFile(generateFiles(inp), "debug-playbook.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("and 5 more");
  });
});
/* --- DEBUG TRACING-RULES - FRAMEWORK BRANCHES ---------------------- */

describe("debug generator - tracing-rules framework branches", () => {
  it("tracing-rules: Prisma database query tracing", () => {
    const inp = input(snap(), ["tracing-rules.md"]);
    addFw(inp, "Prisma");
    const f = getFile(generateFiles(inp), "tracing-rules.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Prisma");
    expect(f!.content).toContain("PrismaClient");
  });

  it("tracing-rules: Echo middleware tracing (Go)", () => {
    const inp = input(snap(), ["tracing-rules.md"]);
    addFw(inp, "Echo");
    inp.context_map.project_identity.go_module = "github.com/org/svc";
    const f = getFile(generateFiles(inp), "tracing-rules.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Echo");
    expect(f!.content).toContain("middleware");
  });

  it("tracing-rules: Chi middleware tracing (Go)", () => {
    const inp = input(snap(), ["tracing-rules.md"]);
    addFw(inp, "Chi");
    inp.context_map.project_identity.go_module = "github.com/org/svc";
    const f = getFile(generateFiles(inp), "tracing-rules.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Chi");
  });

  it("tracing-rules: SvelteKit hooks tracing", () => {
    const inp = input(snap(), ["tracing-rules.md"]);
    addFw(inp, "SvelteKit");
    const f = getFile(generateFiles(inp), "tracing-rules.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("SvelteKit");
  });

  it("tracing-rules: sql_schema FK + domain model watch list", () => {
    const inp = input(snap(), ["tracing-rules.md"]);
    inp.context_map.sql_schema = [
      { name: "accounts", column_count: 6, foreign_key_count: 3, source_file: "schema.sql" },
    ];
    inp.context_map.domain_models = [
      { name: "Account", kind: "interface", language: "TypeScript", field_count: 6, source_file: "src/types.ts" },
    ];
    const f = getFile(generateFiles(inp), "tracing-rules.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("accounts");
    expect(f!.content).toContain("3 FK");
    expect(f!.content).toContain("Account");
  });

  it("tracing-rules: API routes with HIGH priority", () => {
    const inp = input(snap(), ["tracing-rules.md"]);
    inp.context_map.routes = [
      { method: "POST", path: "/api/auth/login", source_file: "routes/auth.ts" },
      { method: "GET", path: "/api/items", source_file: "routes/items.ts" },
    ];
    const f = getFile(generateFiles(inp), "tracing-rules.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("HIGH");
    expect(f!.content).toContain("NORMAL");
  });

  it("tracing-rules: hotspot monitoring + layer boundaries", () => {
    const inp = input(snap(), ["tracing-rules.md"]);
    inp.context_map.dependency_graph.hotspots = [
      { path: "src/core.ts", inbound_count: 15, outbound_count: 5, risk_score: 9.0 },
    ];
    inp.context_map.architecture_signals.layer_boundaries = [
      { layer: "data", directories: ["src/db"] },
      { layer: "presentation", directories: ["src/ui"] },
      { layer: "infrastructure", directories: ["src/infra"] },
    ];
    inp.context_map.architecture_signals.separation_score = 0.75;
    const f = getFile(generateFiles(inp), "tracing-rules.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("src/core.ts");
    expect(f!.content).toContain("data");
    expect(f!.content).toContain("presentation");
  });

  it("tracing-rules: Go module structured logging format", () => {
    const inp = input(snap(), ["tracing-rules.md"]);
    inp.context_map.project_identity.go_module = "github.com/org/api";
    const f = getFile(generateFiles(inp), "tracing-rules.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("zerolog");
  });
});
/* --- DEBUG ROOT-CAUSE-CHECKLIST - FRAMEWORK BRANCHES --------------- */

describe("debug generator - root-cause-checklist framework branches", () => {
  it("root-cause: React/Next.js DevTools + hydration checks", () => {
    const inp = input(snap(), ["root-cause-checklist.md"]);
    addFw(inp, "Next.js");
    const f = getFile(generateFiles(inp), "root-cause-checklist.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("React DevTools");
    expect(f!.content).toContain("hydration");
  });

  it("root-cause: SvelteKit $page.data checks", () => {
    const inp = input(snap(), ["root-cause-checklist.md"]);
    addFw(inp, "SvelteKit");
    const f = getFile(generateFiles(inp), "root-cause-checklist.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("$page.data");
  });

  it("root-cause: Express error-handling middleware", () => {
    const inp = input(snap(), ["root-cause-checklist.md"]);
    addFw(inp, "Express");
    const f = getFile(generateFiles(inp), "root-cause-checklist.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("error-handling middleware");
  });

  it("root-cause: Echo goroutine/pprof checks", () => {
    const inp = input(snap(), ["root-cause-checklist.md"]);
    addFw(inp, "Echo");
    inp.context_map.project_identity.go_module = "github.com/org/api";
    const f = getFile(generateFiles(inp), "root-cause-checklist.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("goroutine");
  });

  it("root-cause: Prisma N+1 query checks", () => {
    const inp = input(snap(), ["root-cause-checklist.md"]);
    addFw(inp, "Prisma");
    const f = getFile(generateFiles(inp), "root-cause-checklist.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("N+1");
  });

  it("root-cause: layer boundaries + patterns + entry points", () => {
    const inp = input(snap(), ["root-cause-checklist.md"]);
    inp.context_map.architecture_signals.layer_boundaries = [
      { layer: "api", directories: ["src/api"] },
    ];
    inp.context_map.architecture_signals.patterns_detected = ["Repository"];
    inp.context_map.entry_points = [
      { path: "src/index.ts", type: "main", description: "Application entry" },
    ];
    const f = getFile(generateFiles(inp), "root-cause-checklist.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Repository");
    expect(f!.content).toContain("src/index.ts");
  });

  it("root-cause: go_module without Go frameworks (pprof)", () => {
    const inp = input(snap(), ["root-cause-checklist.md"]);
    inp.context_map.project_identity.go_module = "github.com/org/svc";
    inp.context_map.detection.frameworks = [];
    const f = getFile(generateFiles(inp), "root-cause-checklist.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("pprof");
    expect(f!.content).toContain("NumGoroutine");
  });

  it("root-cause: domain models entity integrity", () => {
    const inp = input(snap(), ["root-cause-checklist.md"]);
    inp.context_map.domain_models = [
      { name: "Order", kind: "struct", language: "Go", field_count: 8, source_file: "models/order.go" },
    ];
    const f = getFile(generateFiles(inp), "root-cause-checklist.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Order");
  });
});
/* --- DEBUG INCIDENT-TEMPLATE - RICH CONTEXT ------------------------ */

describe("debug generator - incident-template rich branches", () => {
  it("incident-template: all optional sections with rich context", () => {
    const inp = input(snap(), ["incident-template.md"]);
    addFw(inp, "Next.js", "Prisma");
    inp.context_map.project_identity.go_module = "github.com/org/api";
    inp.context_map.detection.ci_platform = "github-actions";
    inp.context_map.detection.deployment_target = "vercel";
    inp.context_map.detection.test_frameworks = ["vitest"];
    inp.context_map.architecture_signals.layer_boundaries = [
      { layer: "api", directories: ["src/api"] },
    ];
    inp.context_map.dependency_graph.hotspots = [
      { path: "src/core.ts", inbound_count: 10, outbound_count: 5, risk_score: 8.0 },
    ];
    inp.context_map.entry_points = [
      { path: "src/index.ts", type: "main", description: "Entry" },
    ];
    inp.context_map.domain_models = [
      { name: "User", kind: "interface", language: "TypeScript", field_count: 4, source_file: "src/types.ts" },
    ];
    inp.context_map.sql_schema = [
      { name: "users", column_count: 5, foreign_key_count: 1, source_file: "schema.sql" },
    ];
    const f = getFile(generateFiles(inp), "incident-template.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("CI");
    expect(f!.content).toContain("github-actions");
    expect(f!.content).toContain("vercel");
    expect(f!.content).toContain("Go Module");
    expect(f!.content).toContain("src/core.ts");
    expect(f!.content).toContain("src/index.ts");
    expect(f!.content).toContain("User");
    expect(f!.content).toContain("users");
  });

  it("incident-template: source file suspects + entry excerpts", () => {
    const inp = input(snap(), ["incident-template.md"], [
      { path: "src/core.ts", content: "export function process() {\n  return true;\n}\n", size: 40 },
      { path: "src/index.ts", content: "import { process } from './core';\nexport function main() { process(); }\n", size: 70 },
    ]);
    inp.context_map.dependency_graph.hotspots = [
      { path: "src/core.ts", inbound_count: 15, outbound_count: 5, risk_score: 9.0 },
    ];
    inp.context_map.entry_points = [
      { path: "src/index.ts", type: "main", description: "Entry" },
    ];
    const f = getFile(generateFiles(inp), "incident-template.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("src/core.ts");
    expect(f!.content).toContain("src/index.ts");
  });
});

/* ----------------------------------------------------------------- */
/* MARKETING - UNCOVERED BRANCHES                                    */
/* ----------------------------------------------------------------- */

describe("marketing generator - uncovered branches", () => {
  it("campaign-brief: frameworks list present vs empty", () => {
    const inp1 = input(snap(), ["campaign-brief.md"]);
    addFw(inp1, "Next.js", "Tailwind CSS");
    const r1 = generateFiles(inp1);
    expect(getFile(r1, "campaign-brief.md")!.content).toContain("Detected Stack");

    const inp2 = input(snap(), ["campaign-brief.md"]);
    inp2.context_map.detection.frameworks = [];
    const r2 = generateFiles(inp2);
    expect(getFile(r2, "campaign-brief.md")!.content).not.toContain("Detected Stack");
  });

  it("cro-playbook: project_summary + frameworks", () => {
    const inp = input(snap(), ["cro-playbook.md"]);
    addFw(inp, "Next.js");
    inp.context_map.ai_context.project_summary = "E-commerce platform";
    const r = generateFiles(inp);
    const f = getFile(r, "cro-playbook.md");
    expect(f!.content).toContain("Project Overview");
    expect(f!.content).toContain("Detected Stack");
  });

  it("cro-playbook: landing page detection from source files", () => {
    const inp = input(snap(), ["cro-playbook.md"], [
      { path: "src/pages/landing.tsx", content: "export default function Landing() { return <h1>Hi</h1>; }", size: 55 },
    ]);
    const f = getFile(generateFiles(inp), "cro-playbook.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("landing.tsx");
  });

  it("ab-test-plan: project_summary + frameworks vs empty", () => {
    const inp1 = input(snap(), ["ab-test-plan.md"]);
    addFw(inp1, "React");
    inp1.context_map.ai_context.project_summary = "SaaS dashboard";
    const r1 = generateFiles(inp1);
    expect(getFile(r1, "ab-test-plan.md")!.content).toContain("Project Overview");
    expect(getFile(r1, "ab-test-plan.md")!.content).toContain("Detected Stack");

    const inp2 = input(snap(), ["ab-test-plan.md"]);
    inp2.context_map.ai_context.project_summary = "";
    inp2.context_map.detection.frameworks = [];
    const r2 = generateFiles(inp2);
    expect(getFile(r2, "ab-test-plan.md")!.content).not.toContain("Project Overview");
  });

  it("sequence-pack: contributor assets from source files", () => {
    const inp = input(snap(), ["sequence-pack.md"], [
      { path: "CONTRIBUTING.md", content: "# Contributing\n\nPlease read guidelines.\n", size: 35 },
    ]);
    const r = generateFiles(inp);
    expect(getFile(r, "sequence-pack.md")!.content).toContain("CONTRIBUTING.md");
  });
});
/* ----------------------------------------------------------------- */
/* ARTIFACTS                                                         */
/* ----------------------------------------------------------------- */

describe("artifacts generator - uncovered branches", () => {
  it("artifact-spec: project_summary + stack vs empty", () => {
    const inp1 = input(snap(), ["artifact-spec.md"]);
    addFw(inp1, "React");
    inp1.context_map.ai_context.project_summary = "A React app";
    const r1 = generateFiles(inp1);
    expect(getFile(r1, "artifact-spec.md")!.content).toContain("Project Overview");

    const inp2 = input(snap(), ["artifact-spec.md"]);
    inp2.context_map.ai_context.project_summary = "";
    inp2.context_map.detection.frameworks = [];
    const r2 = generateFiles(inp2);
    expect(getFile(r2, "artifact-spec.md")!.content).not.toContain("Project Overview");
  });
});

/* ----------------------------------------------------------------- */
/* OBSIDIAN                                                          */
/* ----------------------------------------------------------------- */

describe("obsidian generator - uncovered branches", () => {
  it("linking-policy: project_summary + frameworks vs empty", () => {
    const inp1 = input(snap(), ["linking-policy.md"]);
    addFw(inp1, "Next.js");
    inp1.context_map.ai_context.project_summary = "A web platform";
    const r1 = generateFiles(inp1);
    expect(getFile(r1, "linking-policy.md")!.content).toContain("Project Overview");

    const inp2 = input(snap(), ["linking-policy.md"]);
    inp2.context_map.ai_context.project_summary = "";
    inp2.context_map.detection.frameworks = [];
    const r2 = generateFiles(inp2);
    expect(getFile(r2, "linking-policy.md")!.content).not.toContain("Project Overview");
  });

  it("graph-prompt-map: project_summary present", () => {
    const inp = input(snap(), ["graph-prompt-map.json"]);
    inp.context_map.ai_context.project_summary = "Widget toolkit";
    const r = generateFiles(inp);
    const f = getFile(r, "graph-prompt-map.json");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Widget toolkit");
  });
});

/* ----------------------------------------------------------------- */
/* BRAND                                                             */
/* ----------------------------------------------------------------- */

describe("brand generator - uncovered branches", () => {
  it("brand-board: project_summary vs empty", () => {
    const inp = input(snap(), ["brand-board.md"]);
    inp.context_map.ai_context.project_summary = "Design system platform";
    const r = generateFiles(inp);
    expect(getFile(r, "brand-board.md")!.content).toContain("Project Summary");

    const inp2 = input(snap(), ["brand-board.md"]);
    inp2.context_map.ai_context.project_summary = "";
    const r2 = generateFiles(inp2);
    expect(getFile(r2, "brand-board.md")!.content).not.toContain("Project Summary");
  });

  it("content-constraints: formatting config file detection", () => {
    const inp = input(snap(), ["content-constraints.md"], [
      { path: ".prettierrc", content: '{ "semi": false }', size: 18 },
    ]);
    const r = generateFiles(inp);
    expect(getFile(r, "content-constraints.md")!.content).toContain("Detected Formatting Configs");
  });

  it("messaging-system: project_summary in YAML", () => {
    const inp = input(snap(), ["messaging-system.yaml"]);
    inp.context_map.ai_context.project_summary = "SaaS analytics tool";
    const r = generateFiles(inp);
    expect(getFile(r, "messaging-system.yaml")!.content).toContain("SaaS analytics tool");
  });

  it("channel-rulebook: project_summary present", () => {
    const inp = input(snap(), ["channel-rulebook.md"]);
    inp.context_map.ai_context.project_summary = "E-commerce store";
    const r = generateFiles(inp);
    const f = getFile(r, "channel-rulebook.md");
    expect(f!.content).toContain("Project Overview");
  });

  it("channel-rulebook: skips project overview when empty", () => {
    const inp = input(snap(), ["channel-rulebook.md"]);
    inp.context_map.ai_context.project_summary = "";
    inp.context_map.ai_context.warnings = [];
    const r = generateFiles(inp);
    expect(getFile(r, "channel-rulebook.md")!.content).not.toContain("Project Overview");
  });
});
/* ----------------------------------------------------------------- */
/* CANVAS                                                            */
/* ----------------------------------------------------------------- */

describe("canvas generator - uncovered branches", () => {
  it("social-pack: project_summary present vs empty", () => {
    const inp1 = input(snap(), ["social-pack.md"]);
    inp1.context_map.ai_context.project_summary = "Product analytics dashboard";
    const r1 = generateFiles(inp1);
    expect(getFile(r1, "social-pack.md")!.content).toContain("Project Summary");

    const inp2 = input(snap(), ["social-pack.md"]);
    inp2.context_map.ai_context.project_summary = "";
    const r2 = generateFiles(inp2);
    expect(getFile(r2, "social-pack.md")!.content).not.toContain("Project Summary");
  });

  it("poster-layouts: image asset detection", () => {
    const inp = input(snap(), ["poster-layouts.md"], [
      { path: "public/logo.png", content: "(binary)", size: 5000 },
      { path: "assets/hero.jpg", content: "(binary)", size: 12000 },
    ]);
    const r = generateFiles(inp);
    const f = getFile(r, "poster-layouts.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("logo.png");
  });

  it("asset-guidelines: frameworks present vs empty", () => {
    const inp1 = input(snap(), ["asset-guidelines.md"]);
    addFw(inp1, "React");
    const r1 = generateFiles(inp1);
    expect(getFile(r1, "asset-guidelines.md")!.content).toContain("React");

    const inp2 = input(snap(), ["asset-guidelines.md"]);
    inp2.context_map.detection.frameworks = [];
    const r2 = generateFiles(inp2);
    expect(getFile(r2, "asset-guidelines.md")!.content).not.toContain("React");
  });
});

/* ----------------------------------------------------------------- */
/* NOTEBOOK                                                          */
/* ----------------------------------------------------------------- */

describe("notebook generator - config-less source file branches", () => {
  it("notebook-summary: files without configs skips config section", () => {
    const inp = input(snap(), ["notebook-summary.md"], [
      { path: "src/app.ts", content: "console.log('app');", size: 20 },
    ]);
    const r = generateFiles(inp);
    expect(getFile(r, "notebook-summary.md")!.content).not.toContain("Configuration Files");
  });

  it("study-brief: files without configs skips config section", () => {
    const inp = input(snap(), ["study-brief.md"], [
      { path: "src/main.ts", content: "export function run() {}", size: 24 },
    ]);
    const r = generateFiles(inp);
    expect(getFile(r, "study-brief.md")!.content).not.toContain("Configuration Overview");
  });
});

/* ----------------------------------------------------------------- */
/* FRONTEND                                                          */
/* ----------------------------------------------------------------- */

describe("frontend generator - uncovered branches", () => {
  it("frontend-rules: >10 component files shows truncation", () => {
    const components: SourceFile[] = [];
    for (let i = 0; i < 12; i++) {
      components.push({
        path: `src/components/Widget${i}.tsx`,
        content: `export function Widget${i}() { return <div>W${i}</div>; }\n`,
        size: 50,
      });
    }
    const inp = input(snap(), ["frontend-rules.md"], components);
    addFw(inp, "React");
    const f = getFile(generateFiles(inp), "frontend-rules.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Widget0");
    expect(f!.content).toContain("more");
  });

  it("layout-patterns: layout file detection with exemplar", () => {
    const layoutFiles: SourceFile[] = [
      {
        path: "src/components/MainLayout.tsx",
        content: [
          "import React from 'react';",
          "export function MainLayout({ children }: { children: React.ReactNode }) {",
          "  return (",
          "    <div className='layout'>",
          "      <header>Header</header>",
          "      <main>{children}</main>",
          "      <footer>Footer</footer>",
          "    </div>",
          "  );",
          "}",
        ].join("\n"),
        size: 200,
      },
    ];
    const inp = input(snap(), ["layout-patterns.md"], layoutFiles);
    addFw(inp, "React");
    const f = getFile(generateFiles(inp), "layout-patterns.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("MainLayout");
  });

  it("ui-audit: UI component + style file detection", () => {
    const inp = input(snap(), ["ui-audit.md"], [
      { path: "src/Button.tsx", content: "export function Button() { return <button>Click</button>; }", size: 55 },
      { path: "src/styles/global.css", content: "body { margin: 0; }\n.container { max-width: 1200px; }\n", size: 50 },
    ]);
    addFw(inp, "React");
    const f = getFile(generateFiles(inp), "ui-audit.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Button.tsx");
  });
});
/* ----------------------------------------------------------------- */
/* SUPERPOWERS                                                       */
/* ----------------------------------------------------------------- */

describe("superpowers generator - uncovered branches", () => {
  it("superpower-pack: project_summary + frameworks vs empty", () => {
    const inp1 = input(snap(), ["superpower-pack.md"]);
    addFw(inp1, "Next.js");
    inp1.context_map.ai_context.project_summary = "AI-powered dashboard";
    const r1 = generateFiles(inp1);
    expect(getFile(r1, "superpower-pack.md")!.content).toContain("Project Overview");

    const inp2 = input(snap(), ["superpower-pack.md"]);
    inp2.context_map.ai_context.project_summary = "";
    inp2.context_map.detection.frameworks = [];
    const r2 = generateFiles(inp2);
    expect(getFile(r2, "superpower-pack.md")!.content).not.toContain("Project Overview");
  });

  it("automation-pipeline: project_summary in YAML", () => {
    const inp = input(snap(), ["automation-pipeline.yaml"]);
    inp.context_map.ai_context.project_summary = "CI/CD platform";
    const r = generateFiles(inp);
    expect(getFile(r, "automation-pipeline.yaml")!.content).toContain("CI/CD platform");
  });

  it("automation-pipeline: source CI files", () => {
    const inp = input(snap(), ["automation-pipeline.yaml"], [
      { path: ".github/workflows/ci.yml", content: "name: CI\non: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest", size: 60 },
    ]);
    const r = generateFiles(inp);
    expect(getFile(r, "automation-pipeline.yaml")!.content).toContain("ci.yml");
  });
});

/* ----------------------------------------------------------------- */
/* SKILLS - REMAINING                                                */
/* ----------------------------------------------------------------- */

describe("skills generator - remaining branches", () => {
  it("AGENTS.md: warnings present triggers Known Issues", () => {
    const inp = input(snap(), ["AGENTS.md"]);
    inp.context_map.ai_context.warnings = ["No test files detected"];
    const r = generateFiles(inp);
    expect(getFile(r, "AGENTS.md")!.content).toContain("Known Issues");
  });

  it("workflow-pack: files but no configs", () => {
    const inp = input(snap(), ["workflow-pack.md"], [
      { path: "src/app.ts", content: "console.log('app');", size: 20 },
    ]);
    const r = generateFiles(inp);
    expect(getFile(r, "workflow-pack.md")!.content).not.toContain("Detected Config Files");
  });

  it("policy-pack: files with config entries", () => {
    const inp = input(snap(), ["policy-pack.md"], [
      { path: "tsconfig.json", content: '{"compilerOptions":{"strict":true}}', size: 35 },
    ]);
    const r = generateFiles(inp);
    expect(getFile(r, "policy-pack.md")!.content).toContain("tsconfig.json");
  });
});

/* ----------------------------------------------------------------- */
/* MCP                                                               */
/* ----------------------------------------------------------------- */

describe("mcp generator - uncovered branches", () => {
  it("mcp-config: Prisma adds prisma_studio tool", () => {
    const inp = input(snap(), ["mcp-config.json"]);
    addFw(inp, "Prisma");
    const r = generateFiles(inp);
    const json = JSON.parse(getFile(r, "mcp-config.json")!.content);
    expect(json.tools.map((t: any) => t.name)).toContain("prisma_studio");
  });

  it("capability-registry: source_scripts from package.json", () => {
    const inp = input(snap(), ["capability-registry.json"], [
      { path: "package.json", content: '{"name":"test","scripts":{"dev":"vite","build":"tsc"}}', size: 55 },
    ]);
    const r = generateFiles(inp);
    const json = JSON.parse(getFile(r, "capability-registry.json")!.content);
    expect(json.source_scripts).not.toBeNull();
  });

  it("capability-registry: source_scripts null when no package.json", () => {
    const inp = input(snap(), ["capability-registry.json"], [
      { path: "main.go", content: "package main\nfunc main() {}\n", size: 30 },
    ]);
    const r = generateFiles(inp);
    const json = JSON.parse(getFile(r, "capability-registry.json")!.content);
    expect(json.source_scripts).toBeNull();
  });

  it("server-manifest: project_summary in YAML", () => {
    const inp = input(snap(), ["server-manifest.yaml"]);
    inp.context_map.ai_context.project_summary = "API gateway";
    const r = generateFiles(inp);
    expect(getFile(r, "server-manifest.yaml")!.content).toContain("API gateway");
  });
});

/* ----------------------------------------------------------------- */
/* SEO                                                               */
/* ----------------------------------------------------------------- */

describe("seo generator - uncovered branches", () => {
  it("seo-rules: Next.js SSR/SSG tips", () => {
    const inp = input(snap(), ["seo-rules.md"]);
    addFw(inp, "Next.js");
    const r = generateFiles(inp);
    expect(getFile(r, "seo-rules.md")!.content).toContain("Next.js");
  });

  it("seo-rules: React SPA warnings (no Next)", () => {
    const inp = input(snap(), ["seo-rules.md"]);
    addFw(inp, "React");
    const r = generateFiles(inp);
    expect(getFile(r, "seo-rules.md")!.content).toContain("React");
  });

  it("content-audit: page component analysis from source files", () => {
    const inp = input(snap(), ["content-audit.md"], [
      { path: "app/page.tsx", content: "export default function Home() { return <h1>Home</h1>; }", size: 55 },
    ]);
    addFw(inp, "Next.js");
    const r = generateFiles(inp);
    expect(getFile(r, "content-audit.md")!.content).toContain("Page Component Analysis");
  });

  it("meta-tag-audit: project_summary in JSON", () => {
    const inp = input(snap(), ["meta-tag-audit.json"]);
    inp.context_map.ai_context.project_summary = "Blog platform";
    const r = generateFiles(inp);
    const json = JSON.parse(getFile(r, "meta-tag-audit.json")!.content);
    expect(json.project_summary).toBe("Blog platform");
  });
});

/* ----------------------------------------------------------------- */
/* ALGORITHMIC                                                       */
/* ----------------------------------------------------------------- */

describe("algorithmic generator - uncovered branches", () => {
  it("parameter-pack: source_files_count from files", () => {
    const inp = input(snap(), ["parameter-pack.json"], [
      { path: "src/sketch.ts", content: "export const draw = () => {};", size: 30 },
    ]);
    const r = generateFiles(inp);
    const json = JSON.parse(getFile(r, "parameter-pack.json")!.content);
    expect(json.source_files_count).toBe(1);
  });

  it("collection-map: source file tree from files", () => {
    const inp = input(snap(), ["collection-map.md"], [
      { path: "art/gen1.ts", content: "export function gen() {}", size: 25 },
    ]);
    const r = generateFiles(inp);
    expect(getFile(r, "collection-map.md")!.content).toContain("Source File Tree");
  });
});