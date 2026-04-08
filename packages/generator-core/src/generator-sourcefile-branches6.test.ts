import { describe, it, expect } from "vitest";
import { generateFiles } from "./generate.js";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { SnapshotRecord, FileEntry } from "@axis/snapshots";
import type { GeneratorInput, SourceFile } from "./types.js";

/* ─── Fixture Helpers ──────────────────────────────────────────── */

function snap(opts: { name?: string; type?: string; files?: FileEntry[] } = {}): SnapshotRecord {
  const files = opts.files ?? [];
  return {
    snapshot_id: "snap-sf6-001",
    project_id: "proj-sf6-001",
    created_at: new Date().toISOString(),
    input_method: "repo_snapshot_upload",
    manifest: {
      project_name: opts.name ?? "sf6-test",
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

function getFile(result: ReturnType<typeof generateFiles>, path: string) {
  return result.files.find(f => f.path === path);
}

/* ─── Go Framework File Fixtures ───────────────────────────────── */

const GO_ECHO_FILES: FileEntry[] = [
  { path: "go.mod", content: "module github.com/example/echoapp\n\ngo 1.21\n\nrequire github.com/labstack/echo/v4 v4.11.4", size: 90 },
  { path: "main.go", content: 'package main\n\nimport (\n\t"github.com/labstack/echo/v4"\n)\n\nfunc main() {\n\te := echo.New()\n\te.GET("/api/health", healthHandler)\n\te.Logger.Fatal(e.Start(":8080"))\n}', size: 180 },
  { path: "handlers/user.go", content: 'package handlers\n\nimport "github.com/labstack/echo/v4"\n\nfunc GetUser(c echo.Context) error {\n\treturn c.JSON(200, map[string]string{"name": "test"})\n}', size: 140 },
];

const GO_CHI_FILES: FileEntry[] = [
  { path: "go.mod", content: "module github.com/example/chiapp\n\ngo 1.21\n\nrequire github.com/go-chi/chi/v5 v5.0.10", size: 85 },
  { path: "main.go", content: 'package main\n\nimport (\n\t"net/http"\n\t"github.com/go-chi/chi/v5"\n)\n\nfunc main() {\n\tr := chi.NewRouter()\n\tr.Get("/api/health", func(w http.ResponseWriter, r *http.Request) {})\n\thttp.ListenAndServe(":8080", r)\n}', size: 200 },
];

const GO_GIN_FILES: FileEntry[] = [
  { path: "go.mod", content: "module github.com/example/ginapp\n\ngo 1.21\n\nrequire github.com/gin-gonic/gin v1.9.1", size: 80 },
  { path: "main.go", content: 'package main\n\nimport "github.com/gin-gonic/gin"\n\nfunc main() {\n\tr := gin.Default()\n\tr.GET("/api/health", func(c *gin.Context) { c.JSON(200, gin.H{"status": "ok"}) })\n\tr.Run(":8080")\n}', size: 180 },
];

const GO_STDLIB_FILES: FileEntry[] = [
  { path: "go.mod", content: "module github.com/example/stdlibapp\n\ngo 1.21", size: 45 },
  { path: "main.go", content: 'package main\n\nimport (\n\t"fmt"\n\t"net/http"\n)\n\nfunc main() {\n\thttp.HandleFunc("/", handler)\n\thttp.ListenAndServe(":8080", nil)\n}\n\nfunc handler(w http.ResponseWriter, r *http.Request) {\n\tfmt.Fprintln(w, "hello")\n}', size: 200 },
];

const EXPRESS_FILES: FileEntry[] = [
  { path: "package.json", content: '{"name":"express-app","dependencies":{"express":"4.18.2"}}', size: 55 },
  { path: "src/server.ts", content: 'import express from "express";\nconst app = express();\napp.get("/api/health", (req, res) => res.json({ok:true}));\napp.listen(3000);\n', size: 120 },
];

const VUE_FILES: FileEntry[] = [
  { path: "package.json", content: '{"name":"vue-app","dependencies":{"vue":"3.3.0"}}', size: 48 },
  { path: "src/App.vue", content: '<template><div>{{ msg }}</div></template>\n<script setup>\nconst msg = "Hello"\n</script>', size: 80 },
];

const MINIMAL_FILES: FileEntry[] = [
  { path: "index.ts", content: 'console.log("hello");', size: 20 },
];

/* ═══════════════════════════════════════════════════════════════
   generators-debug.ts — Go framework branches
   ═══════════════════════════════════════════════════════════════ */

describe("debug generator — Go Echo framework branches", () => {
  const s = snap({ name: "echo-api", files: GO_ECHO_FILES });
  const allDebug = [".ai/debug-playbook.md", "incident-template.md", "tracing-rules.md", "root-cause-checklist.md"];
  const result = generateFiles(input(s, allDebug));

  it("debug-playbook includes Echo framework debugging steps", () => {
    const f = getFile(result, ".ai/debug-playbook.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Echo");
    expect(f!.content).toContain("Route 404");
    expect(f!.content).toContain("Go HTTP");
  });

  it("debug-playbook includes Go Module in quick reference", () => {
    const f = getFile(result, ".ai/debug-playbook.md");
    expect(f!.content).toContain("Go Module");
    expect(f!.content).toContain("github.com/example/echoapp");
  });

  it("debug-playbook includes Go triage steps", () => {
    const f = getFile(result, ".ai/debug-playbook.md");
    expect(f!.content).toContain("go build");
    expect(f!.content).toContain("go test");
  });

  it("tracing-rules includes Echo middleware tracing", () => {
    const f = getFile(result, "tracing-rules.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Echo Middleware Tracing");
    expect(f!.content).toContain("RequestLoggerWithConfig");
  });

  it("tracing-rules uses Go structured logging format", () => {
    const f = getFile(result, "tracing-rules.md");
    expect(f!.content).toContain("zerolog");
  });

  it("incident-template includes Go Module field", () => {
    const f = getFile(result, "incident-template.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Go Module");
    expect(f!.content).toContain("echoapp");
  });

  it("root-cause-checklist includes Go-specific steps", () => {
    const f = getFile(result, "root-cause-checklist.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("go test ./...");
    expect(f!.content).toContain("go vet");
  });

  it("root-cause-checklist includes Go debugging patterns", () => {
    const f = getFile(result, "root-cause-checklist.md");
    expect(f!.content).toContain("Goroutine leak");
    expect(f!.content).toContain("Channel deadlock");
  });

  it("root-cause-checklist includes Echo trace steps", () => {
    const f = getFile(result, "root-cause-checklist.md");
    expect(f!.content).toContain("goroutine");
    expect(f!.content).toContain("pprof");
  });
});

describe("debug generator — Go Chi framework branches", () => {
  const s = snap({ name: "chi-api", files: GO_CHI_FILES });
  const result = generateFiles(input(s, [".ai/debug-playbook.md", "tracing-rules.md"]));

  it("debug-playbook includes Chi framework debugging steps", () => {
    const f = getFile(result, ".ai/debug-playbook.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Chi");
    expect(f!.content).toContain("Route conflicts");
    expect(f!.content).toContain("chi.URLParam");
  });

  it("debug-playbook does NOT include Go stdlib HTTP debugging section (Chi is detected)", () => {
    const f = getFile(result, ".ai/debug-playbook.md");
    // Chi is detected, so Go stdlib debugging section should NOT appear
    expect(f!.content).not.toContain("#### Go stdlib HTTP");
  });

  it("tracing-rules includes Chi middleware tracing", () => {
    const f = getFile(result, "tracing-rules.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Chi Middleware Tracing");
    expect(f!.content).toContain("middleware.Logger");
    expect(f!.content).toContain("middleware.Recoverer");
  });
});

describe("debug generator — Go Gin framework branches", () => {
  const s = snap({ name: "gin-api", files: GO_GIN_FILES });
  const result = generateFiles(input(s, [".ai/debug-playbook.md"]));

  it("debug-playbook includes Gin framework debugging steps", () => {
    const f = getFile(result, ".ai/debug-playbook.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Gin");
    expect(f!.content).toContain("SetMode");
    expect(f!.content).toContain("ShouldBind");
  });

  it("debug-playbook does NOT include Go stdlib HTTP debugging section (Gin is detected)", () => {
    const f = getFile(result, ".ai/debug-playbook.md");
    expect(f!.content).not.toContain("#### Go stdlib HTTP");
  });
});

describe("debug generator — Go stdlib HTTP (no framework)", () => {
  const s = snap({ name: "go-stdlib", files: GO_STDLIB_FILES });
  const result = generateFiles(input(s, [".ai/debug-playbook.md", "root-cause-checklist.md"]));

  it("debug-playbook includes Go stdlib HTTP section", () => {
    const f = getFile(result, ".ai/debug-playbook.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Go stdlib HTTP");
    expect(f!.content).toContain("Handler panics");
    expect(f!.content).toContain("Connection pooling");
  });

  it("debug-playbook does NOT include Echo/Chi/Gin debugging sections", () => {
    const f = getFile(result, ".ai/debug-playbook.md");
    expect(f!.content).not.toContain("#### Echo");
    expect(f!.content).not.toContain("#### Chi (Go Router)");
    expect(f!.content).not.toContain("#### Gin (Go HTTP)");
  });

  it("root-cause-checklist includes pprof for stdlib Go project", () => {
    const f = getFile(result, "root-cause-checklist.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("pprof");
    expect(f!.content).toContain("NumGoroutine");
  });
});

describe("debug generator — Express/Fastify branches", () => {
  const s = snap({ name: "express-app", files: EXPRESS_FILES });
  const result = generateFiles(input(s, [".ai/debug-playbook.md"]));

  it("debug-playbook includes API Server debugging steps", () => {
    const f = getFile(result, ".ai/debug-playbook.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("API Server");
    expect(f!.content).toContain("Route 404");
    expect(f!.content).toContain("CORS");
  });
});

/* ═══════════════════════════════════════════════════════════════
   generators-brand.ts — FALSE branches for non-React, no pkg, no README
   ═══════════════════════════════════════════════════════════════ */

describe("brand generator — non-React and missing-data branches", () => {
  // Vue project: hasFw("Next.js", "React") should be FALSE
  it("brand-guidelines skips React rules for Vue project", () => {
    const s = snap({ name: "vue-brand", files: VUE_FILES });
    const result = generateFiles(input(s, ["brand-guidelines.md"]));
    const f = getFile(result, "brand-guidelines.md");
    expect(f).toBeDefined();
    // Should NOT have React/Next.js specific brand application
    expect(f!.content).not.toContain("PascalCase");
    expect(f!.content).not.toContain("aria-labels");
  });

  // messaging-system with files but NO package.json
  it("messaging-system skips package_description without package.json", () => {
    const s = snap({ files: MINIMAL_FILES });
    const files: SourceFile[] = [
      { path: "src/main.ts", content: "export function run() {}", size: 25 },
    ];
    const result = generateFiles(input(s, ["messaging-system.yaml"], files));
    const f = getFile(result, "messaging-system.yaml");
    expect(f).toBeDefined();
    expect(f!.content).not.toContain("package_description");
  });

  // messaging-system with package.json but NO description field
  it("messaging-system skips package_description without description field", () => {
    const s = snap({ files: MINIMAL_FILES });
    const files: SourceFile[] = [
      { path: "package.json", content: '{"name":"test","version":"1.0.0"}', size: 32 },
    ];
    const result = generateFiles(input(s, ["messaging-system.yaml"], files));
    const f = getFile(result, "messaging-system.yaml");
    expect(f).toBeDefined();
    expect(f!.content).not.toContain("package_description");
  });

  // channel-rulebook with files but NO READMEs
  it("channel-rulebook skips public-facing files without READMEs", () => {
    const s = snap({ files: MINIMAL_FILES });
    const files: SourceFile[] = [
      { path: "src/utils.ts", content: "export const x = 1;", size: 20 },
    ];
    const result = generateFiles(input(s, ["channel-rulebook.md"], files));
    const f = getFile(result, "channel-rulebook.md");
    expect(f).toBeDefined();
    expect(f!.content).not.toContain("Detected Public-Facing Files");
  });
});

/* ═══════════════════════════════════════════════════════════════
   generators-canvas.ts — no asset files, no brand assets
   ═══════════════════════════════════════════════════════════════ */

describe("canvas generator — no-asset branches", () => {
  it("asset-guidelines skips asset section when no media files found", () => {
    const s = snap({ files: MINIMAL_FILES });
    const files: SourceFile[] = [
      { path: "src/app.ts", content: "export default function App() { return null; }", size: 47 },
    ];
    const result = generateFiles(input(s, ["asset-guidelines.md"], files));
    const f = getFile(result, "asset-guidelines.md");
    expect(f).toBeDefined();
    // No png/jpg/svg files → asset section should not appear
    expect(f!.content).not.toContain("Detected Assets in Repo");
  });

  it("brand-board skips brand assets when no logo/brand/icon files found", () => {
    const s = snap({ files: MINIMAL_FILES });
    const files: SourceFile[] = [
      { path: "src/utils.ts", content: "export const x = 1;", size: 20 },
    ];
    const result = generateFiles(input(s, ["brand-board.md"], files));
    const f = getFile(result, "brand-board.md");
    expect(f).toBeDefined();
    expect(f!.content).not.toContain("Detected Brand Assets");
  });
});

/* ═══════════════════════════════════════════════════════════════
   generators-marketing.ts — empty data branches
   ═══════════════════════════════════════════════════════════════ */

describe("marketing generator — empty data branches", () => {
  // ab-test-plan with no files
  it("ab-test-plan skips source analysis with no files", () => {
    const s = snap({ files: MINIMAL_FILES });
    const result = generateFiles(input(s, ["ab-test-plan.md"]));
    const f = getFile(result, "ab-test-plan.md");
    expect(f).toBeDefined();
    // No source files passed → no landing page analysis
    expect(f!.content).not.toContain("Detected Landing");
  });

  // ab-test-plan with files but no landing pages
  it("ab-test-plan skips landing section when no landing files found", () => {
    const s = snap({ files: MINIMAL_FILES });
    const files: SourceFile[] = [
      { path: "src/utils.ts", content: "export const x = 1;", size: 20 },
    ];
    const result = generateFiles(input(s, ["ab-test-plan.md"], files));
    const f = getFile(result, "ab-test-plan.md");
    expect(f).toBeDefined();
    expect(f!.content).not.toContain("Detected Landing");
  });
});

/* ═══════════════════════════════════════════════════════════════
   generators-mcp.ts — empty build tools, no server files
   ═══════════════════════════════════════════════════════════════ */

describe("mcp generator — uncovered branches", () => {
  // capability-registry with no build tool detected → buildTools[0] ?? pkgMgr
  it("capability-registry falls back to package manager when no build tools", () => {
    const s = snap({ files: MINIMAL_FILES });
    const result = generateFiles(input(s, ["capability-registry.json"]));
    const f = getFile(result, "capability-registry.json");
    expect(f).toBeDefined();
    const parsed = JSON.parse(f!.content);
    // buildTools is empty → provider should be package manager
    expect(parsed.capabilities[0].provider).toBe("npm");
  });

  // capability-registry with package.json with scripts section
  it("capability-registry extracts scripts from package.json", () => {
    const s = snap({ files: MINIMAL_FILES });
    const files: SourceFile[] = [
      {
        path: "package.json",
        content: '{"name":"test","scripts":{"build":"tsc","dev":"tsx watch","test":"vitest"}}',
        size: 70,
      },
    ];
    const result = generateFiles(input(s, ["capability-registry.json"], files));
    const f = getFile(result, "capability-registry.json");
    expect(f).toBeDefined();
    const parsed = JSON.parse(f!.content);
    expect(parsed.source_scripts).not.toBeNull();
    expect(parsed.source_scripts.length).toBeGreaterThan(0);
  });

  // capability-registry with package.json but NO scripts section
  it("capability-registry returns null scripts when package.json has no scripts", () => {
    const s = snap({ files: MINIMAL_FILES });
    const files: SourceFile[] = [
      { path: "package.json", content: '{"name":"test","version":"1.0.0"}', size: 32 },
    ];
    const result = generateFiles(input(s, ["capability-registry.json"], files));
    const f = getFile(result, "capability-registry.json");
    const parsed = JSON.parse(f!.content);
    expect(parsed.source_scripts).toBeNull();
  });

  // server-manifest with files but no server/handler/tool/mcp files
  it("server-manifest skips source_files when no server files found", () => {
    const s = snap({ files: MINIMAL_FILES });
    const files: SourceFile[] = [
      { path: "src/utils.ts", content: "export const x = 1;", size: 20 },
    ];
    const result = generateFiles(input(s, ["server-manifest.yaml"], files));
    const f = getFile(result, "server-manifest.yaml");
    expect(f).toBeDefined();
    expect(f!.content).not.toContain("source_files:");
  });
});

/* ═══════════════════════════════════════════════════════════════
   generators-remotion.ts — no media branches
   ═══════════════════════════════════════════════════════════════ */

describe("remotion generator — no media branches", () => {
  // scene-plan with files but no media
  it("scene-plan skips media assets when no media files found", () => {
    const s = snap({ files: MINIMAL_FILES });
    const files: SourceFile[] = [
      { path: "src/app.ts", content: "export const run = () => {};", size: 28 },
    ];
    const result = generateFiles(input(s, ["scene-plan.md"], files));
    const f = getFile(result, "scene-plan.md");
    expect(f).toBeDefined();
    expect(f!.content).not.toContain("Available Media Assets");
  });

  // render-config with files but no media
  it("render-config keeps source_media_files null when no media found", () => {
    const s = snap({ files: MINIMAL_FILES });
    const files: SourceFile[] = [
      { path: "src/index.ts", content: "export default 1;", size: 18 },
    ];
    const result = generateFiles(input(s, ["render-config.json"], files));
    const f = getFile(result, "render-config.json");
    expect(f).toBeDefined();
    const parsed = JSON.parse(f!.content);
    expect(parsed.source_media_files).toBeNull();
  });

  // asset-checklist with files but no visual/audio assets
  it("asset-checklist skips detected assets when no media found", () => {
    const s = snap({ files: MINIMAL_FILES });
    const files: SourceFile[] = [
      { path: "src/main.ts", content: "console.log('hi');", size: 18 },
    ];
    const result = generateFiles(input(s, ["asset-checklist.md"], files));
    const f = getFile(result, "asset-checklist.md");
    expect(f).toBeDefined();
    expect(f!.content).not.toContain("Detected Assets in Repository");
  });

  // storyboard with files but no visual files
  it("storyboard skips visual assets when no images found", () => {
    const s = snap({ files: MINIMAL_FILES });
    const files: SourceFile[] = [
      { path: "README.md", content: "# Hello", size: 8 },
    ];
    const result = generateFiles(input(s, ["storyboard.md"], files));
    const f = getFile(result, "storyboard.md");
    expect(f).toBeDefined();
    expect(f!.content).not.toContain("Available Visual Assets");
  });
});

/* ═══════════════════════════════════════════════════════════════
   generators-frontend.ts — no component/no framework branches
   ═══════════════════════════════════════════════════════════════ */

describe("frontend generator — no-component branches", () => {
  // ui-audit with no frameworks detected
  it("ui-audit handles no frameworks gracefully", () => {
    const s = snap({ name: "go-svc", files: GO_STDLIB_FILES });
    const result = generateFiles(input(s, ["ui-audit.md"]));
    const f = getFile(result, "ui-audit.md");
    expect(f).toBeDefined();
    // Go project → no UI frameworks → should not list component frameworks
    expect(f!.content).not.toContain("Component Framework");
  });

  // ui-audit with files but no tsx/jsx/vue/svelte components
  it("ui-audit skips component analysis when no UI files found", () => {
    const s = snap({ files: MINIMAL_FILES });
    const files: SourceFile[] = [
      { path: "src/server.ts", content: "export function serve() {}", size: 26 },
    ];
    const result = generateFiles(input(s, ["ui-audit.md"], files));
    const f = getFile(result, "ui-audit.md");
    expect(f).toBeDefined();
    expect(f!.content).not.toContain("Detected UI Components");
  });

  // ui-audit with components but no style files
  it("ui-audit skips style analysis when no CSS/SCSS found", () => {
    const s = snap({ files: MINIMAL_FILES });
    const files: SourceFile[] = [
      { path: "src/App.tsx", content: "export default function App() { return <div/>; }", size: 48 },
    ];
    const result = generateFiles(input(s, ["ui-audit.md"], files));
    const f = getFile(result, "ui-audit.md");
    expect(f).toBeDefined();
    expect(f!.content).not.toContain("Detected Style Files");
  });
});

/* ═══════════════════════════════════════════════════════════════
   generators-artifacts.ts — isReact false, no components
   ═══════════════════════════════════════════════════════════════ */

describe("artifacts generator — non-React branches", () => {
  it("component-library uses non-React framework for Vue project", () => {
    const s = snap({ name: "vue-lib", files: VUE_FILES });
    const result = generateFiles(input(s, ["component-library.json"]));
    const f = getFile(result, "component-library.json");
    expect(f).toBeDefined();
    const parsed = JSON.parse(f!.content);
    // Vue project → hasReact is false → framework should NOT be "react"
    expect(parsed.framework).not.toBe("react");
  });

  it("component-library skips component analysis when no UI files found", () => {
    const s = snap({ files: GO_STDLIB_FILES });
    const files: SourceFile[] = [
      { path: "main.go", content: 'package main\nfunc main() {}', size: 28 },
    ];
    const result = generateFiles(input(s, ["component-library.json"], files));
    const f = getFile(result, "component-library.json");
    expect(f).toBeDefined();
    expect(f!.content).not.toContain("source_component_files");
  });
});

/* ═══════════════════════════════════════════════════════════════
   generators-obsidian.ts — no summary, no hotspots
   ═══════════════════════════════════════════════════════════════ */

describe("obsidian generator — empty data branches", () => {
  it("linking-policy skips hotspot table when no hotspots exist", () => {
    const s = snap({ files: MINIMAL_FILES });
    // Minimal snapshot → no hotspots
    const result = generateFiles(input(s, ["linking-policy.md"]));
    const f = getFile(result, "linking-policy.md");
    expect(f).toBeDefined();
    // No hotspots → no risk table
    expect(f!.content).not.toContain("| Code File | Risk");
  });
});
