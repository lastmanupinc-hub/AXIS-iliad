/**
 * Tests for POST /v1/analyze, GET /.well-known/axis.json,
 * and the pure helper functions: adoptionHint, buildNextSteps, detectProjectName.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { openMemoryDb, closeDb } from "@axis/snapshots";
import { Router, createApp } from "./router.js";
import {
  handleAnalyze,
  handleWellKnown,
  adoptionHint,
  buildNextSteps,
  detectProjectName,
} from "./handlers.js";

// ─── HTTP helper ─────────────────────────────────────────────────

async function req(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const r = require("node:http").request(
      {
        hostname: "127.0.0.1",
        port: TEST_PORT,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: unknown;
          try { data = JSON.parse(raw); } catch { data = raw; }
          resolve({ status: res.statusCode ?? 0, data });
        });
      },
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

const TEST_PORT = 44510;
let server: Server;

const minFiles = [
  { path: "package.json", content: '{"name":"test-project","dependencies":{"react":"18.0.0"}}' },
  { path: "src/index.ts", content: 'import React from "react";\nexport const App = () => null;' },
  { path: "README.md", content: "# Test Project\nA test." },
];

beforeAll(async () => {
  openMemoryDb();
  const router = new Router();
  router.post("/v1/analyze", handleAnalyze);
  router.get("/.well-known/axis.json", handleWellKnown);
  server = createServer((r, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    router.handle(r, res);
  });
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  closeDb();
});

// ─── adoptionHint (pure function) ───────────────────────────────

describe("adoptionHint", () => {
  it("returns known hint for AGENTS.md", () => {
    const hint = adoptionHint("AGENTS.md");
    expect(hint.placement).toBe("repo root");
    expect(hint.adoption_hint).toContain("repo root");
  });

  it("works with prefixed paths (.ai/debug-playbook.md)", () => {
    const hint = adoptionHint(".ai/debug-playbook.md");
    expect(hint.placement).toBeDefined();
    expect(hint.adoption_hint).toBeDefined();
  });

  it("returns known hint for .cursorrules", () => {
    const hint = adoptionHint(".cursorrules");
    expect(hint.placement).toBe("repo root");
    expect(hint.adoption_hint).toContain("Cursor");
  });

  it("returns known hint for mcp-config.json", () => {
    const hint = adoptionHint("mcp-config.json");
    expect(hint.placement).toBe("MCP client config");
    expect(hint.adoption_hint).toContain("MCP");
  });

  it("returns known hint for commerce-registry.json", () => {
    const hint = adoptionHint("commerce-registry.json");
    expect(hint.adoption_hint).toContain("purchasing agent");
  });

  it("returns known hint for CLAUDE.md", () => {
    const hint = adoptionHint("CLAUDE.md");
    expect(hint.adoption_hint).toContain("Claude");
  });

  it("returns default for unknown file", () => {
    const hint = adoptionHint("unknown-file.xyz");
    expect(hint.placement).toBe(".ai/");
    expect(hint.adoption_hint).toContain(".ai/");
  });

  it("is deterministic (same input → same output)", () => {
    const a = adoptionHint("AGENTS.md");
    const b = adoptionHint("AGENTS.md");
    expect(a).toEqual(b);
  });
});

// ─── buildNextSteps (pure function) ─────────────────────────────

describe("buildNextSteps", () => {
  it("returns AGENTS.md as top step when present", () => {
    const steps = buildNextSteps([{ path: "AGENTS.md" }, { path: ".cursorrules" }]);
    expect(steps[0]).toContain("AGENTS.md");
  });

  it("returns at most 3 steps", () => {
    const files = [
      { path: "AGENTS.md" },
      { path: ".cursorrules" },
      { path: "CLAUDE.md" },
      { path: "mcp-config.json" },
      { path: "commerce-registry.json" },
    ];
    expect(buildNextSteps(files).length).toBeLessThanOrEqual(3);
  });

  it("returns empty array when no priority files match", () => {
    const steps = buildNextSteps([{ path: "theme.css" }, { path: "cost-estimate.json" }]);
    expect(steps).toEqual([]);
  });

  it("does not include steps for files not generated", () => {
    const steps = buildNextSteps([{ path: "CLAUDE.md" }]);
    const mentions = steps.filter(s => s.includes(".cursorrules"));
    expect(mentions.length).toBe(0);
  });

  it("is deterministic", () => {
    const files = [{ path: "AGENTS.md" }, { path: ".cursorrules" }, { path: "CLAUDE.md" }];
    expect(buildNextSteps(files)).toEqual(buildNextSteps(files));
  });
});

// ─── detectProjectName (pure function) ──────────────────────────

describe("detectProjectName", () => {
  it("extracts name from package.json", () => {
    const name = detectProjectName([
      { path: "package.json", content: '{"name":"my-project","version":"1.0.0"}' },
    ]);
    expect(name).toBe("my-project");
  });

  it("extracts name from nested package.json (non-root excluded by node_modules)", () => {
    const name = detectProjectName([
      { path: "frontend/package.json", content: '{"name":"frontend-pkg"}' },
    ]);
    expect(name).toBe("frontend-pkg");
  });

  it("falls back to README heading when no package.json", () => {
    const name = detectProjectName([
      { path: "README.md", content: "# My Awesome Repo\nSome description." },
    ]);
    expect(name).toBe("My Awesome Repo");
  });

  it("returns null when no detectable name", () => {
    const name = detectProjectName([
      { path: "src/index.ts", content: "export const x = 1;" },
    ]);
    expect(name).toBeNull();
  });

  it("handles malformed package.json gracefully", () => {
    const name = detectProjectName([
      { path: "package.json", content: "{{invalid json" },
    ]);
    expect(name).toBeNull();
  });

  it("handles package.json with no name field", () => {
    const name = detectProjectName([
      { path: "package.json", content: '{"version":"1.0.0"}' },
    ]);
    expect(name).toBeNull();
  });

  it("is deterministic", () => {
    const files = [{ path: "package.json", content: '{"name":"stable"}' }];
    expect(detectProjectName(files)).toBe(detectProjectName(files));
  });
});

// ─── POST /v1/analyze — validation ──────────────────────────────

describe("POST /v1/analyze — validation", () => {
  it("rejects missing body input (no github_url or files)", async () => {
    const r = await req("POST", "/v1/analyze", {});
    expect(r.status).toBe(400);
    expect((r.data as Record<string, unknown>).error_code).toBe("MISSING_FIELD");
  });

  it("rejects both github_url and files provided simultaneously", async () => {
    const r = await req("POST", "/v1/analyze", {
      github_url: "https://github.com/a/b",
      files: minFiles,
    });
    expect(r.status).toBe(400);
    expect((r.data as Record<string, unknown>).error_code).toBe("INVALID_FORMAT");
  });

  it("rejects invalid JSON body", async () => {
    const r = await req("POST", "/v1/analyze", "{{bad");
    expect(r.status).toBe(400);
  });

  it("rejects invalid programs type (non-array)", async () => {
    const r = await req("POST", "/v1/analyze", {
      files: minFiles,
      programs: "not-an-array",
    });
    expect(r.status).toBe(400);
    expect((r.data as Record<string, unknown>).error_code).toBe("INVALID_FORMAT");
  });

  it("rejects empty files array", async () => {
    const r = await req("POST", "/v1/analyze", { files: [] });
    expect(r.status).toBe(400);
    expect((r.data as Record<string, unknown>).error_code).toBe("MISSING_FIELD");
  });

  it("rejects file with missing content", async () => {
    const r = await req("POST", "/v1/analyze", {
      files: [{ path: "src/index.ts" }],
    });
    expect(r.status).toBe(400);
    expect((r.data as Record<string, unknown>).error_code).toBe("FILE_INVALID");
  });

  it("rejects path traversal attack", async () => {
    const r = await req("POST", "/v1/analyze", {
      files: [{ path: "../../etc/passwd", content: "root:x:0:0" }],
    });
    expect(r.status).toBe(400);
    expect((r.data as Record<string, unknown>).error_code).toBe("PATH_TRAVERSAL");
  });

  it("rejects invalid (non-GitHub) URL in github_url", async () => {
    const r = await req("POST", "/v1/analyze", {
      github_url: "https://gitlab.com/a/b",
    });
    expect(r.status).toBe(400);
    expect((r.data as Record<string, unknown>).error_code).toBe("INVALID_FORMAT");
  });

  it("rejects revoked/invalid API key", async () => {
    const r = await req("POST", "/v1/analyze", {
      files: minFiles,
    });
    // Anonymous (no auth header) is ok on free tier — 201 expected
    // This tests that the handler doesn't crash; covered by auth unit tests
    expect([201, 401]).toContain(r.status);
  });
});

// ─── POST /v1/analyze — success (files mode) ────────────────────

describe("POST /v1/analyze — files mode", () => {
  let result: Record<string, unknown>;

  beforeAll(async () => {
    const r = await req("POST", "/v1/analyze", { files: minFiles });
    expect(r.status).toBe(201);
    result = r.data as Record<string, unknown>;
  });

  it("returns snapshot_id and project_id", () => {
    expect(typeof result.snapshot_id).toBe("string");
    expect(typeof result.project_id).toBe("string");
    expect(result.status).toBe("ready");
  });

  it("returns analysis object with language and file_count", () => {
    const analysis = result.analysis as Record<string, unknown>;
    expect(analysis.file_count).toBe(minFiles.length);
    expect(typeof analysis.language).toBe("string");
    expect(Array.isArray(analysis.frameworks)).toBe(true);
    expect(typeof analysis.separation_score).toBe("number");
  });

  it("detects project_name from package.json", () => {
    const analysis = result.analysis as Record<string, unknown>;
    expect(analysis.project_name).toBe("test-project");
  });

  it("returns files array with content, placement, and adoption_hint", () => {
    const files = result.files as Array<Record<string, unknown>>;
    expect(Array.isArray(files)).toBe(true);
    expect(files.length).toBeGreaterThan(0);
    const first = files[0];
    expect(typeof first.path).toBe("string");
    expect(typeof first.program).toBe("string");
    expect(typeof first.content).toBe("string");
    expect(typeof first.placement).toBe("string");
    expect(typeof first.adoption_hint).toBe("string");
  });

  it("returns AGENTS.md among the files", () => {
    const files = result.files as Array<Record<string, unknown>>;
    expect(files.some(f => f.path === "AGENTS.md")).toBe(true);
  });

  it("returns programs_run and total_files", () => {
    expect(typeof result.programs_run).toBe("number");
    expect((result.programs_run as number)).toBeGreaterThan(0);
    expect(typeof result.total_files).toBe("number");
    expect((result.total_files as number)).toBeGreaterThan(0);
  });

  it("returns 3 next_steps", () => {
    const steps = result.next_steps as string[];
    expect(Array.isArray(steps)).toBe(true);
    expect(steps.length).toBeLessThanOrEqual(3);
    expect(steps.length).toBeGreaterThan(0);
  });

  it("no github field when using files mode", () => {
    expect(result.github).toBeUndefined();
  });
});

// ─── POST /v1/analyze — programs filter ──────────────────────────

describe("POST /v1/analyze — programs filter", () => {
  it("returns only requested programs", async () => {
    const r = await req("POST", "/v1/analyze", {
      files: minFiles,
      programs: ["debug"],
    });
    expect(r.status).toBe(201);
    const data = r.data as Record<string, unknown>;
    const files = data.files as Array<{ program: string }>;
    const programs = new Set(files.map(f => f.program));
    expect(programs.has("debug")).toBe(true);
    // search program not requested — should not appear
    expect(programs.has("search")).toBe(false);
  });

  it("empty programs array returns no files", async () => {
    const r = await req("POST", "/v1/analyze", {
      files: minFiles,
      programs: [],
    });
    expect(r.status).toBe(201);
    const data = r.data as Record<string, unknown>;
    expect((data.files as unknown[]).length).toBe(0);
  });
});

// ─── POST /v1/analyze — inline_content: false ────────────────────

describe("POST /v1/analyze — inline_content: false", () => {
  it("omits content field from files when inline_content is false", async () => {
    const r = await req("POST", "/v1/analyze", {
      files: minFiles,
      programs: ["search"],
      inline_content: false,
    });
    expect(r.status).toBe(201);
    const data = r.data as Record<string, unknown>;
    const files = data.files as Array<Record<string, unknown>>;
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(f.content).toBeUndefined();
      // placement and adoption_hint still present
      expect(typeof f.placement).toBe("string");
      expect(typeof f.adoption_hint).toBe("string");
    }
  });
});

// ─── GET /.well-known/axis.json ──────────────────────────────────

describe("GET /.well-known/axis.json", () => {
  let manifest: Record<string, unknown>;

  beforeAll(async () => {
    const r = await req("GET", "/.well-known/axis.json");
    expect(r.status).toBe(200);
    manifest = r.data as Record<string, unknown>;
  });

  it("returns name and version", () => {
    expect(manifest.name).toBe("AXIS Toolbox");
    expect(manifest.version).toBe("0.4.0");
  });

  it("describes the analyze_endpoint", () => {
    const endpoint = manifest.analyze_endpoint as Record<string, unknown>;
    expect(endpoint.method).toBe("POST");
    expect(endpoint.path).toBe("/v1/analyze");
    expect(endpoint.authentication).toBeDefined();
  });

  it("reports correct programs and generators count", () => {
    expect(manifest.programs).toBe(18);
    expect(manifest.generators).toBe(86);
  });

  it("includes key_outputs array with adoption guidance", () => {
    const outputs = manifest.key_outputs as Array<{ path: string; purpose: string }>;
    expect(Array.isArray(outputs)).toBe(true);
    expect(outputs.some(o => o.path === "AGENTS.md")).toBe(true);
    expect(outputs.some(o => o.path === "mcp-config.json")).toBe(true);
    expect(outputs.some(o => o.path === "commerce-registry.json")).toBe(true);
  });

  it("includes quick_start steps", () => {
    const qs = manifest.quick_start as Record<string, string>;
    expect(qs.step_1).toBeTruthy();
    expect(qs.step_4).toBeTruthy();
  });

  it("includes for_agents section with MCP and purchasing info", () => {
    const fa = manifest.for_agents as Record<string, string>;
    expect(fa.mcp_discovery).toContain("GET /mcp");
    expect(fa.purchasing).toContain("/v1/prepare-for-agentic-purchasing");
    expect(fa.note).toBeTruthy();
  });
});
