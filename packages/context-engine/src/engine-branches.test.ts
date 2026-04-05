import { describe, it, expect } from "vitest";
import { buildContextMap, buildRepoProfile } from "./engine.js";
import type { SnapshotRecord, FileEntry } from "@axis/snapshots";

function makeSnapshot(
  files: Array<{ path: string; content?: string }>,
  overrides?: Partial<SnapshotRecord>,
): SnapshotRecord {
  const entries: FileEntry[] = files.map((f) => ({
    path: f.path,
    content: f.content ?? "",
    size: f.content?.length ?? 0,
  }));
  return {
    snapshot_id: "snap-branch-001",
    project_id: "proj-branch-001",
    created_at: new Date().toISOString(),
    input_method: "repo_snapshot_upload",
    manifest: {
      project_name: "branch-test",
      project_type: "web_application",
      frameworks: [],
      goals: [],
      requested_outputs: [],
    },
    file_count: entries.length,
    total_size_bytes: entries.reduce((s, e) => s + e.size, 0),
    files: entries,
    status: "ready",
    ...overrides,
  };
}

// ─── detectEntryPoints branches ─────────────────────────────────

describe("detectEntryPoints — branches", () => {
  it("detects src/main.ts as app_entry", () => {
    const snap = makeSnapshot([{ path: "src/main.ts", content: "" }]);
    const cm = buildContextMap(snap);
    expect(cm.entry_points).toContainEqual(
      expect.objectContaining({ path: "src/main.ts", type: "app_entry" }),
    );
  });

  it("detects src/main.js as app_entry", () => {
    const snap = makeSnapshot([{ path: "src/main.js", content: "" }]);
    const cm = buildContextMap(snap);
    expect(cm.entry_points).toContainEqual(
      expect.objectContaining({ path: "src/main.js", type: "app_entry" }),
    );
  });

  it("detects app/layout.tsx as app_entry", () => {
    const snap = makeSnapshot([{ path: "app/layout.tsx", content: "" }]);
    const cm = buildContextMap(snap);
    expect(cm.entry_points).toContainEqual(
      expect.objectContaining({ path: "app/layout.tsx", type: "app_entry" }),
    );
  });

  it("detects src/cli.ts as cli_command", () => {
    const snap = makeSnapshot([{ path: "src/cli.ts", content: "" }]);
    const cm = buildContextMap(snap);
    expect(cm.entry_points).toContainEqual(
      expect.objectContaining({ path: "src/cli.ts", type: "cli_command" }),
    );
  });

  it("detects bin/cli.js as cli_command", () => {
    const snap = makeSnapshot([{ path: "bin/cli.js", content: "" }]);
    const cm = buildContextMap(snap);
    expect(cm.entry_points).toContainEqual(
      expect.objectContaining({ path: "bin/cli.js", type: "cli_command" }),
    );
  });

  it("detects app/api/ routes as api_route", () => {
    const snap = makeSnapshot([{ path: "app/api/users/route.ts", content: "" }]);
    const cm = buildContextMap(snap);
    expect(cm.entry_points).toContainEqual(
      expect.objectContaining({ path: "app/api/users/route.ts", type: "api_route" }),
    );
  });
});

// ─── extractHTTPMethods branches ────────────────────────────────

describe("extractHTTPMethods — routes", () => {
  it("detects PUT method in Next.js route", () => {
    const snap = makeSnapshot([
      { path: "app/api/items/route.ts", content: "export async function PUT(req) { return new Response(); }" },
    ]);
    const cm = buildContextMap(snap);
    expect(cm.routes).toContainEqual(
      expect.objectContaining({ method: "PUT", path: expect.stringContaining("items") }),
    );
  });

  it("detects DELETE method in Next.js route", () => {
    const snap = makeSnapshot([
      { path: "app/api/items/route.ts", content: "export function DELETE(req) { return new Response(); }" },
    ]);
    const cm = buildContextMap(snap);
    expect(cm.routes).toContainEqual(
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("detects PATCH method in Next.js route", () => {
    const snap = makeSnapshot([
      { path: "app/api/items/route.ts", content: "export async function PATCH(req) {}" },
    ]);
    const cm = buildContextMap(snap);
    expect(cm.routes).toContainEqual(
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("defaults to GET when no methods exported", () => {
    const snap = makeSnapshot([
      { path: "app/api/health/route.ts", content: "// empty route handler" },
    ]);
    const cm = buildContextMap(snap);
    expect(cm.routes).toContainEqual(
      expect.objectContaining({ method: "GET", path: expect.stringContaining("health") }),
    );
  });

  it("detects multiple methods in single route file", () => {
    const snap = makeSnapshot([
      {
        path: "app/api/users/route.ts",
        content: "export async function GET() {}\nexport async function POST() {}\nexport async function DELETE() {}",
      },
    ]);
    const cm = buildContextMap(snap);
    const userRoutes = cm.routes.filter((r) => r.source_file === "app/api/users/route.ts");
    const methods = userRoutes.map((r) => r.method).sort();
    expect(methods).toEqual(["DELETE", "GET", "POST"]);
  });
});

// ─── analyzeArchitecture pattern branches ───────────────────────

describe("analyzeArchitecture — patterns", () => {
  it("detects cqrs from commands/queries dirs", () => {
    const snap = makeSnapshot([
      { path: "commands/create.ts", content: "" },
      { path: "queries/list.ts", content: "" },
    ]);
    const cm = buildContextMap(snap);
    expect(cm.architecture_signals.patterns_detected).toContain("cqrs");
  });

  it("detects serverless from serverless file", () => {
    const snap = makeSnapshot([
      { path: "serverless.yml", content: "service: my-api" },
    ]);
    const cm = buildContextMap(snap);
    expect(cm.architecture_signals.patterns_detected).toContain("serverless");
  });

  it("detects containerized from Dockerfile", () => {
    const snap = makeSnapshot([
      { path: "Dockerfile", content: "FROM node:20" },
    ]);
    const cm = buildContextMap(snap);
    expect(cm.architecture_signals.patterns_detected).toContain("containerized");
  });

  it("detects mvc from services + controllers dirs", () => {
    const snap = makeSnapshot([
      { path: "services/user.ts", content: "" },
      { path: "controllers/user.ts", content: "" },
    ]);
    const cm = buildContextMap(snap);
    expect(cm.architecture_signals.patterns_detected).toContain("mvc");
  });

  it("detects layer boundaries from known dirs", () => {
    const snap = makeSnapshot([
      { path: "components/App.tsx", content: "" },
      { path: "services/api.ts", content: "" },
      { path: "prisma/schema.prisma", content: "" },
      { path: "utils/helpers.ts", content: "" },
    ]);
    const cm = buildContextMap(snap);
    const layerNames = cm.architecture_signals.layer_boundaries.map((l) => l.layer);
    expect(layerNames).toContain("presentation");
    expect(layerNames).toContain("business_logic");
    expect(layerNames).toContain("data");
    expect(layerNames).toContain("shared");
  });
});

// ─── buildAIContext warning branches ────────────────────────────

describe("buildAIContext — warnings", () => {
  it("warns when no test files detected", () => {
    const snap = makeSnapshot([{ path: "src/app.ts", content: "const x = 1;" }]);
    const cm = buildContextMap(snap);
    expect(cm.ai_context.warnings).toContain("No test files detected");
  });

  it("warns when no CI pipeline detected", () => {
    const snap = makeSnapshot([{ path: "src/app.ts", content: "const x = 1;" }]);
    const cm = buildContextMap(snap);
    expect(cm.ai_context.warnings).toContain("No CI/CD pipeline detected");
  });

  it("warns when no lockfile found", () => {
    const snap = makeSnapshot([{ path: "src/app.ts", content: "const x = 1;" }]);
    const cm = buildContextMap(snap);
    expect(cm.ai_context.warnings).toContain(
      "No lockfile found \u2014 dependency versions may be inconsistent",
    );
  });

  it("warns about high dependency count (>80)", () => {
    const deps: Record<string, string> = {};
    for (let i = 0; i < 85; i++) deps[`pkg-${i}`] = "1.0.0";
    const snap = makeSnapshot([
      { path: "package.json", content: JSON.stringify({ dependencies: deps }) },
      { path: "src/app.ts", content: "const x = 1;" },
    ]);
    const cm = buildContextMap(snap);
    expect(cm.ai_context.warnings).toContain(
      "High dependency count (>80) \u2014 review for unused packages",
    );
  });

  it("no dependency warning when count <= 80", () => {
    const deps: Record<string, string> = {};
    for (let i = 0; i < 10; i++) deps[`pkg-${i}`] = "1.0.0";
    const snap = makeSnapshot([
      { path: "package.json", content: JSON.stringify({ dependencies: deps }) },
    ]);
    const cm = buildContextMap(snap);
    const depWarnings = cm.ai_context.warnings.filter((w) => w.includes("dependency count"));
    expect(depWarnings).toHaveLength(0);
  });
});

// ─── buildAIContext conventions ──────────────────────────────────

describe("buildAIContext — conventions", () => {
  it("includes TypeScript strict mode when .ts files present", () => {
    const snap = makeSnapshot([{ path: "tsconfig.json", content: "{}" }]);
    const cm = buildContextMap(snap);
    expect(cm.ai_context.conventions).toContain("TypeScript strict mode");
  });

  it("includes pnpm workspaces convention", () => {
    const snap = makeSnapshot([{ path: "pnpm-lock.yaml", content: "" }]);
    const cm = buildContextMap(snap);
    expect(cm.ai_context.conventions).toContain("pnpm workspaces");
  });
});

// ─── dependency graph hotspot filtering ─────────────────────────

describe("dependency graph hotspots", () => {
  it("filters out files with low connection count", () => {
    // Create a file that only imports one other file — should NOT be a hotspot
    const snap = makeSnapshot([
      { path: "src/a.ts", content: 'import { x } from "./b";\n' },
      { path: "src/b.ts", content: "export const x = 1;\n" },
    ]);
    const cm = buildContextMap(snap);
    // b.ts has 1 inbound, 0 outbound = total 1 → below threshold of 3 inbound or 5 outbound
    const bHotspot = cm.dependency_graph.hotspots.find((h) => h.path.includes("b.ts"));
    expect(bHotspot).toBeUndefined();
  });
});

// ─── buildRepoProfile with custom api_url ───────────────────────

describe("buildRepoProfile — detection passthrough", () => {
  it("passes deployment target through to profile", () => {
    const snap = makeSnapshot([{ path: "Dockerfile", content: "FROM python:3" }]);
    const rp = buildRepoProfile(snap);
    expect(rp.detection.deployment_target).toBe("docker");
  });

  it("computes separation score in health", () => {
    const snap = makeSnapshot([
      { path: "components/App.tsx", content: "" },
      { path: "services/api.ts", content: "" },
      { path: "prisma/schema.prisma", content: "" },
    ]);
    const rp = buildRepoProfile(snap);
    expect(rp.health.separation_score).toBeGreaterThan(0);
  });
});
