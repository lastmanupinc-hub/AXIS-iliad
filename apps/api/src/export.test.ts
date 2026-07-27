import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { inflateRawSync } from "node:zlib";
import { resetTestDb, createSnapshot, saveGeneratorResult, saveContextMap, createAccount, createApiKey, recordUsage, getEventsByType, addMemoryEntry } from "@axis/snapshots";
import { appendMemoryWeave, buildMemorySection, type GeneratorResult } from "@axis/generator-core";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleExportZip } from "./export.js";

let server: Server;
let testPort = 0;
let projectId: string;
let snapshotId: string;

// ─── HTTP helper (binary-safe) ──────────────────────────────────

interface RawRes {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

function rawReq(method: string, path: string, headers?: Record<string, string>): Promise<RawRes> {
  return new Promise((resolve, reject) => {
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: testPort, path, method, headers },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const h: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === "string") h[k] = v;
          }
          resolve({ status: res.statusCode ?? 0, headers: h, body: Buffer.concat(chunks) });
        });
      },
    );
    r.on("error", reject);
    r.end();
  });
}

// ─── ZIP parser (minimal, for assertions) ───────────────────────

interface ZipFileEntry {
  path: string;
  compressedSize: number;
  uncompressedSize: number;
  crc32: number;
  content: string;
}

function parseZip(buf: Buffer): ZipFileEntry[] {
  const entries: ZipFileEntry[] = [];
  let offset = 0;

  while (offset < buf.length - 4) {
    const sig = buf.readUInt32LE(offset);
    if (sig !== 0x04034b50) break; // not a local file header

    const compressionMethod = buf.readUInt16LE(offset + 8);
    const crc32 = buf.readUInt32LE(offset + 14);
    const compressedSize = buf.readUInt32LE(offset + 18);
    const uncompressedSize = buf.readUInt32LE(offset + 22);
    const pathLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);

    const path = buf.subarray(offset + 30, offset + 30 + pathLen).toString("utf-8");
    const dataStart = offset + 30 + pathLen + extraLen;
    const compressedData = buf.subarray(dataStart, dataStart + compressedSize);

    let content: string;
    if (compressionMethod === 8) {
      content = inflateRawSync(compressedData).toString("utf-8");
    } else {
      content = compressedData.toString("utf-8");
    }

    entries.push({ path, compressedSize, uncompressedSize, crc32, content });
    offset = dataStart + compressedSize;
  }

  return entries;
}

// ─── Minimal ContextMap fixture (delta report wiring) ───────────

function makeCtx(snap: { snapshot_id: string; project_id: string }, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: "1.0.0",
    snapshot_id: snap.snapshot_id,
    project_id: snap.project_id,
    generated_at: new Date().toISOString(),
    project_identity: { name: "delta-wiring-test", type: "web", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 0, total_directories: 0, total_loc: 0, file_tree_summary: [], top_level_layout: [] },
    detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: [], ci_platform: null, deployment_target: null },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [],
    routes: [],
    domain_models: [],
    sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
    ...overrides,
  };
}

// ─── Server + seed data ─────────────────────────────────────────

beforeAll(async () => {
  await resetTestDb();

  const snap = await createSnapshot({
    input_method: "repo_snapshot_upload",
    manifest: {
      project_name: "export-test-project",
      project_type: "web",
      frameworks: ["react"],
      goals: ["test"],
      requested_outputs: ["search"],
    },
    files: [{ path: "index.ts", content: "export default 1;", size: 18 }],
  });

  projectId = snap.project_id;
  snapshotId = snap.snapshot_id;

  await saveGeneratorResult(snapshotId, {
    snapshot_id: snapshotId,
    generated_at: new Date().toISOString(),
    files: [
      { path: ".ai/context-map.json", content: '{"summary":"hello"}', program: "search" },
      { path: ".ai/repo-profile.yaml", content: "name: test\n", program: "search" },
      { path: ".ai/debug-playbook.md", content: "# Debug\nStep 1", program: "debug" },
    ],
  });

  const router = new Router();
  router.get("/v1/projects/:project_id/export", handleExportZip);
  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterAll(() => {
  server?.close();
});

// ─── Tests ──────────────────────────────────────────────────────

describe("Export ZIP handler", () => {
  it("returns 404 for nonexistent project", async () => {
    const res = await rawReq("GET", "/v1/projects/nonexistent/export");
    expect(res.status).toBe(404);
  });

  it("returns valid ZIP with all generated files", async () => {
    const res = await rawReq("GET", `/v1/projects/${projectId}/export`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.headers["content-disposition"]).toContain("axis-export-");
    expect(res.headers["content-disposition"]).toContain(".zip");
    expect(parseInt(res.headers["content-length"], 10)).toBe(res.body.length);

    const entries = parseZip(res.body);
    expect(entries.length).toBe(3);
  });

  it("decompresses files correctly (round-trip)", async () => {
    const res = await rawReq("GET", `/v1/projects/${projectId}/export`);
    const entries = parseZip(res.body);

    const contextMap = entries.find(e => e.path === ".ai/context-map.json");
    expect(contextMap).toBeDefined();
    expect(contextMap!.content).toBe('{"summary":"hello"}');

    const profile = entries.find(e => e.path === ".ai/repo-profile.yaml");
    expect(profile).toBeDefined();
    expect(profile!.content).toBe("name: test\n");

    const playbook = entries.find(e => e.path === ".ai/debug-playbook.md");
    expect(playbook).toBeDefined();
    expect(playbook!.content).toBe("# Debug\nStep 1");
  });

  it("reports correct uncompressed sizes", async () => {
    const res = await rawReq("GET", `/v1/projects/${projectId}/export`);
    const entries = parseZip(res.body);

    for (const entry of entries) {
      expect(entry.uncompressedSize).toBe(Buffer.byteLength(entry.content, "utf-8"));
    }
  });

  it("CRC32 values are non-zero", async () => {
    const res = await rawReq("GET", `/v1/projects/${projectId}/export`);
    const entries = parseZip(res.body);

    for (const entry of entries) {
      expect(entry.crc32).toBeGreaterThan(0);
    }
  });

  it("filters by ?program=search", async () => {
    const res = await rawReq("GET", `/v1/projects/${projectId}/export?program=search`);
    expect(res.status).toBe(200);

    const entries = parseZip(res.body);
    expect(entries.length).toBe(2);
    expect(entries.map(e => e.path).sort()).toEqual([
      ".ai/context-map.json",
      ".ai/repo-profile.yaml",
    ]);

    expect(res.headers["content-disposition"]).toContain("axis-search-");
  });

  it("filters by ?program=debug", async () => {
    const res = await rawReq("GET", `/v1/projects/${projectId}/export?program=debug`);
    expect(res.status).toBe(200);

    const entries = parseZip(res.body);
    expect(entries.length).toBe(1);
    expect(entries[0].path).toBe(".ai/debug-playbook.md");
    expect(entries[0].content).toBe("# Debug\nStep 1");
  });

  it("returns 404 for unknown program filter", async () => {
    const res = await rawReq("GET", `/v1/projects/${projectId}/export?program=nonexistent`);
    expect(res.status).toBe(404);
  });

  it("ZIP contains valid EOCD signature", async () => {
    const res = await rawReq("GET", `/v1/projects/${projectId}/export`);
    // End of central directory record should be at the end
    const eocdSig = res.body.readUInt32LE(res.body.length - 22);
    expect(eocdSig).toBe(0x06054b50);
  });

  it("ZIP central directory entry count matches files", async () => {
    const res = await rawReq("GET", `/v1/projects/${projectId}/export`);
    // EOCD: total entries at offset -22 + 10
    const totalEntries = res.body.readUInt16LE(res.body.length - 22 + 10);
    expect(totalEntries).toBe(3);
  });

  it("sanitizes path traversal in file paths", async () => {
    // Save a generator result with path traversal attempts
    await saveGeneratorResult(snapshotId, {
      snapshot_id: snapshotId,
      generated_at: new Date().toISOString(),
      files: [
        { path: "../../../etc/passwd", content: "nope", program: "search" },
        { path: "normal/file.txt", content: "ok", program: "search" },
        { path: "./a/../b/./c.txt", content: "collapsed", program: "search" },
      ],
    });

    const res = await rawReq("GET", `/v1/projects/${projectId}/export`);
    expect(res.status).toBe(200);

    const entries = parseZip(res.body);
    const paths = entries.map(e => e.path);

    // No path should start with .. or contain ..
    for (const p of paths) {
      expect(p).not.toContain("..");
      expect(p.startsWith("/")).toBe(false);
    }

    expect(paths).toContain("etc/passwd");
    expect(paths).toContain("normal/file.txt");
    expect(paths).toContain("a/b/c.txt");

    // Restore original data for subsequent tests
    await saveGeneratorResult(snapshotId, {
      snapshot_id: snapshotId,
      generated_at: new Date().toISOString(),
      files: [
        { path: ".ai/context-map.json", content: '{"summary":"hello"}', program: "search" },
        { path: ".ai/repo-profile.yaml", content: "name: test\n", program: "search" },
        { path: ".ai/debug-playbook.md", content: "# Debug\nStep 1", program: "debug" },
      ],
    });
  });

  it("handles UTF-8 filenames", async () => {
    await saveGeneratorResult(snapshotId, {
      snapshot_id: snapshotId,
      generated_at: new Date().toISOString(),
      files: [
        { path: "日本語/ファイル.md", content: "UTF-8 content", program: "search" },
      ],
    });

    const res = await rawReq("GET", `/v1/projects/${projectId}/export`);
    expect(res.status).toBe(200);

    const entries = parseZip(res.body);
    expect(entries[0].path).toBe("日本語/ファイル.md");
    expect(entries[0].content).toBe("UTF-8 content");

    // Restore
    await saveGeneratorResult(snapshotId, {
      snapshot_id: snapshotId,
      generated_at: new Date().toISOString(),
      files: [
        { path: ".ai/context-map.json", content: '{"summary":"hello"}', program: "search" },
        { path: ".ai/repo-profile.yaml", content: "name: test\n", program: "search" },
        { path: ".ai/debug-playbook.md", content: "# Debug\nStep 1", program: "debug" },
      ],
    });
  });

  it("handles single-file ZIP", async () => {
    await saveGeneratorResult(snapshotId, {
      snapshot_id: snapshotId,
      generated_at: new Date().toISOString(),
      files: [
        { path: "only-file.txt", content: "single", program: "search" },
      ],
    });

    const res = await rawReq("GET", `/v1/projects/${projectId}/export`);
    expect(res.status).toBe(200);

    const entries = parseZip(res.body);
    expect(entries.length).toBe(1);
    expect(entries[0].content).toBe("single");

    // Restore
    await saveGeneratorResult(snapshotId, {
      snapshot_id: snapshotId,
      generated_at: new Date().toISOString(),
      files: [
        { path: ".ai/context-map.json", content: '{"summary":"hello"}', program: "search" },
        { path: ".ai/repo-profile.yaml", content: "name: test\n", program: "search" },
        { path: ".ai/debug-playbook.md", content: "# Debug\nStep 1", program: "debug" },
      ],
    });
  });

  it("handles empty content files", async () => {
    await saveGeneratorResult(snapshotId, {
      snapshot_id: snapshotId,
      generated_at: new Date().toISOString(),
      files: [
        { path: "empty.txt", content: "", program: "search" },
      ],
    });

    const res = await rawReq("GET", `/v1/projects/${projectId}/export`);
    expect(res.status).toBe(200);

    const entries = parseZip(res.body);
    expect(entries.length).toBe(1);
    expect(entries[0].content).toBe("");
    expect(entries[0].uncompressedSize).toBe(0);

    // Restore
    await saveGeneratorResult(snapshotId, {
      snapshot_id: snapshotId,
      generated_at: new Date().toISOString(),
      files: [
        { path: ".ai/context-map.json", content: '{"summary":"hello"}', program: "search" },
        { path: ".ai/repo-profile.yaml", content: "name: test\n", program: "search" },
        { path: ".ai/debug-playbook.md", content: "# Debug\nStep 1", program: "debug" },
      ],
    });
  });

  it("sets CORS header on ZIP response", async () => {
    const res = await rawReq("GET", `/v1/projects/${projectId}/export`);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });

  it("returns 404 when project has snapshots but no generated files", async () => {
    // Create a new project with a snapshot but no generator result
    const snap2 = await createSnapshot({
      input_method: "repo_snapshot_upload",
      manifest: {
        project_name: "empty-gen-project",
        project_type: "web",
        frameworks: [],
        goals: [],
        requested_outputs: [],
      },
      files: [{ path: "a.ts", content: "x", size: 1 }],
    });

    const res = await rawReq("GET", `/v1/projects/${snap2.project_id}/export`);
    expect(res.status).toBe(404);
  });

  // Layer 12: program filter returns empty (export.ts line 143)
  it("returns 404 when program filter matches nothing", async () => {
    const res = await rawReq("GET", `/v1/projects/${projectId}/export?program=nonexistent`);
    expect(res.status).toBe(404);
  });

  // ─── Delta report wiring (SPEC-01) ─────────────────────────────

  it("includes delta-report.md when the project has a prior snapshot with a differing context map", async () => {
    const projectName = "export-delta-two-snap";
    const manifest = { project_name: projectName, project_type: "web", frameworks: [], goals: [], requested_outputs: [] };

    const snap1 = await createSnapshot({ input_method: "repo_snapshot_upload", manifest, files: [{ path: "a.ts", content: "x", size: 1 }] });
    await saveContextMap(snap1.snapshot_id, makeCtx(snap1, { routes: [] }));

    const snap2 = await createSnapshot({ input_method: "repo_snapshot_upload", manifest, files: [{ path: "a.ts", content: "x", size: 1 }] });
    expect(snap2.project_id).toBe(snap1.project_id); // same project_name ⇒ reused project

    await saveContextMap(snap2.snapshot_id, makeCtx(snap2, { routes: [{ path: "/new", method: "GET", source_file: "a.ts" }] }));
    await saveGeneratorResult(snap2.snapshot_id, {
      snapshot_id: snap2.snapshot_id,
      generated_at: new Date().toISOString(),
      files: [{ path: "AGENTS.md", content: "# Agents", program: "skills" }],
    });

    const res = await rawReq("GET", `/v1/projects/${snap2.project_id}/export`);
    expect(res.status).toBe(200);
    const entries = parseZip(res.body);
    const delta = entries.find(e => e.path === "delta-report.md");
    expect(delta).toBeDefined();
    expect(delta!.content).toContain("/new");
  });

  it("omits delta-report.md for a project with only a single snapshot", async () => {
    const manifest = { project_name: "export-delta-single-snap", project_type: "web", frameworks: [], goals: [], requested_outputs: [] };
    const snap = await createSnapshot({ input_method: "repo_snapshot_upload", manifest, files: [{ path: "a.ts", content: "x", size: 1 }] });
    await saveContextMap(snap.snapshot_id, makeCtx(snap));
    await saveGeneratorResult(snap.snapshot_id, {
      snapshot_id: snap.snapshot_id,
      generated_at: new Date().toISOString(),
      files: [{ path: "AGENTS.md", content: "# Agents", program: "skills" }],
    });

    const res = await rawReq("GET", `/v1/projects/${snap.project_id}/export`);
    expect(res.status).toBe(200);
    const entries = parseZip(res.body);
    expect(entries.some(e => e.path === "delta-report.md")).toBe(false);
  });

  // ─── Usage-aware program funnel (SPEC-03) ──────────────────────

  it("includes the personalization line when the export account has recorded usage", async () => {
    const acct = await createAccount("Personalization User", "personalization@test.com", "paid");
    const key = await createApiKey(acct.account_id, "test");
    const headers = { Authorization: `Bearer ${key.rawKey}` };

    const manifest = { project_name: "export-funnel-personalization", project_type: "web", frameworks: [], goals: [], requested_outputs: [] };
    const snap = await createSnapshot(
      { input_method: "repo_snapshot_upload", manifest, files: [{ path: "a.ts", content: "x", size: 1 }] },
      acct.account_id,
    );
    await saveContextMap(snap.snapshot_id, makeCtx(snap));
    await saveGeneratorResult(snap.snapshot_id, {
      snapshot_id: snap.snapshot_id,
      generated_at: new Date().toISOString(),
      files: [{ path: "debug-playbook.md", content: "# Debug", program: "debug" }],
    });
    await recordUsage(acct.account_id, "optimization", snap.snapshot_id, 1, 1, 100);

    const res = await rawReq("GET", `/v1/projects/${snap.project_id}/export`, headers);
    expect(res.status).toBe(200);
    const entries = parseZip(res.body);
    const funnel = entries.find(e => e.path === "recommended-next-programs.md");
    expect(funnel).toBeDefined();
    expect(funnel!.content).toContain("Ranked for this account");

    const events = await getEventsByType(acct.account_id, "funnel_personalized");
    expect(events).toHaveLength(1);
    expect(events[0].metadata.project_id).toBe(snap.project_id);
  });

  // ─── KPI events (SPEC-06) ───────────────────────────────────────

  it("tracks delta_generated for an owned two-snapshot project's export", async () => {
    const acct = await createAccount("Delta KPI User", "delta-kpi@test.com", "paid");
    const key = await createApiKey(acct.account_id, "test");
    const headers = { Authorization: `Bearer ${key.rawKey}` };

    const manifest = { project_name: "export-delta-kpi", project_type: "web", frameworks: [], goals: [], requested_outputs: [] };
    const snap1 = await createSnapshot({ input_method: "repo_snapshot_upload", manifest, files: [{ path: "a.ts", content: "x", size: 1 }] }, acct.account_id);
    await saveContextMap(snap1.snapshot_id, makeCtx(snap1, { routes: [] }));

    const snap2 = await createSnapshot({ input_method: "repo_snapshot_upload", manifest, files: [{ path: "a.ts", content: "x", size: 1 }] }, acct.account_id);
    await saveContextMap(snap2.snapshot_id, makeCtx(snap2, { routes: [{ path: "/new", method: "GET", source_file: "a.ts" }] }));
    await saveGeneratorResult(snap2.snapshot_id, {
      snapshot_id: snap2.snapshot_id,
      generated_at: new Date().toISOString(),
      files: [{ path: "AGENTS.md", content: "# Agents", program: "skills" }],
    });

    const res = await rawReq("GET", `/v1/projects/${snap2.project_id}/export`, headers);
    expect(res.status).toBe(200);
    const entries = parseZip(res.body);
    expect(entries.some(e => e.path === "delta-report.md")).toBe(true);

    const events = await getEventsByType(acct.account_id, "delta_generated");
    expect(events).toHaveLength(1);
    expect(events[0].metadata.project_id).toBe(snap2.project_id);
  });

  // ─── Memory weave (SPEC-07) ─────────────────────────────────────

  it("weaves project memory into the export: project-memory.md + AGENTS.md section + memory_woven event", async () => {
    const acct = await createAccount("Memory Weave User", "memory-weave@test.com", "paid");
    const key = await createApiKey(acct.account_id, "test");
    const headers = { Authorization: `Bearer ${key.rawKey}` };

    const manifest = { project_name: "export-memory-weave", project_type: "web", frameworks: [], goals: [], requested_outputs: [] };
    const snap = await createSnapshot({ input_method: "repo_snapshot_upload", manifest, files: [{ path: "a.ts", content: "x", size: 1 }] }, acct.account_id);
    await saveContextMap(snap.snapshot_id, makeCtx(snap));
    await saveGeneratorResult(snap.snapshot_id, {
      snapshot_id: snap.snapshot_id,
      generated_at: new Date().toISOString(),
      files: [{ path: "AGENTS.md", content: "# Agents", program: "skills" }],
    });

    await addMemoryEntry(snap.project_id, acct.account_id, "decision", "Use Postgres, not SQLite");
    await addMemoryEntry(snap.project_id, acct.account_id, "convention", "snake_case for SQL columns");

    const res = await rawReq("GET", `/v1/projects/${snap.project_id}/export`, headers);
    expect(res.status).toBe(200);
    const entries = parseZip(res.body);

    const memoryFile = entries.find(e => e.path === "project-memory.md");
    expect(memoryFile).toBeDefined();
    expect(memoryFile!.content).toContain("Use Postgres, not SQLite");

    const agents = entries.find(e => e.path === "AGENTS.md");
    expect(agents).toBeDefined();
    expect(agents!.content).toContain("Decisions already made");

    const events = await getEventsByType(acct.account_id, "memory_woven");
    expect(events).toHaveLength(1);
    expect(events[0].metadata.project_id).toBe(snap.project_id);
  });

  it("omits project-memory.md and the section when the project has no memory entries", async () => {
    const acct = await createAccount("No Memory User", "no-memory@test.com", "paid");
    const key = await createApiKey(acct.account_id, "test");
    const headers = { Authorization: `Bearer ${key.rawKey}` };

    const manifest = { project_name: "export-no-memory", project_type: "web", frameworks: [], goals: [], requested_outputs: [] };
    const snap = await createSnapshot({ input_method: "repo_snapshot_upload", manifest, files: [{ path: "a.ts", content: "x", size: 1 }] }, acct.account_id);
    await saveContextMap(snap.snapshot_id, makeCtx(snap));
    await saveGeneratorResult(snap.snapshot_id, {
      snapshot_id: snap.snapshot_id,
      generated_at: new Date().toISOString(),
      files: [{ path: "AGENTS.md", content: "# Agents", program: "skills" }],
    });

    const res = await rawReq("GET", `/v1/projects/${snap.project_id}/export`, headers);
    expect(res.status).toBe(200);
    const entries = parseZip(res.body);

    expect(entries.some(e => e.path === "project-memory.md")).toBe(false);
    const agents = entries.find(e => e.path === "AGENTS.md");
    expect(agents!.content).not.toContain("Decisions already made");

    const events = await getEventsByType(acct.account_id, "memory_woven");
    expect(events).toHaveLength(0);
  });

  // WO-08 fix 3: the MCP path persists a woven package, so the export path must
  // REFRESH stale memory rather than skip it (the old skip-if-present guard froze
  // memory at first-analysis state forever).
  it("refreshes a stale project-memory.md and AGENTS.md section instead of freezing at first-weave state", async () => {
    const acct = await createAccount("Stale Memory User", "stale-memory@test.com", "paid");
    const key = await createApiKey(acct.account_id, "test");
    const headers = { Authorization: `Bearer ${key.rawKey}` };

    const manifest = { project_name: "export-memory-stale", project_type: "web", frameworks: [], goals: [], requested_outputs: [] };
    const snap = await createSnapshot({ input_method: "repo_snapshot_upload", manifest, files: [{ path: "a.ts", content: "x", size: 1 }] }, acct.account_id);
    await saveContextMap(snap.snapshot_id, makeCtx(snap));

    // Simulate what the MCP path already persisted: a woven package for a memory
    // that, at the time, had only the first decision.
    await addMemoryEntry(snap.project_id, acct.account_id, "decision", "old decision recorded first");
    const staleGenerated: GeneratorResult = {
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      generated_at: new Date().toISOString(),
      files: [{ path: "AGENTS.md", content: "# Agents", content_type: "text/markdown", program: "skills", description: "d" }],
      skipped: [],
    };
    appendMemoryWeave(staleGenerated, [{ kind: "decision", content: "old decision recorded first", source: "", created_at: new Date().toISOString() }]);
    await saveGeneratorResult(snap.snapshot_id, staleGenerated);

    // A new decision is recorded after that stale package was persisted.
    await addMemoryEntry(snap.project_id, acct.account_id, "decision", "new decision recorded second");

    const res = await rawReq("GET", `/v1/projects/${snap.project_id}/export`, headers);
    expect(res.status).toBe(200);
    const entries = parseZip(res.body);

    const memoryFiles = entries.filter(e => e.path === "project-memory.md");
    expect(memoryFiles).toHaveLength(1); // refreshed, not duplicated
    expect(memoryFiles[0].content).toContain("old decision recorded first");
    expect(memoryFiles[0].content).toContain("new decision recorded second");

    const agents = entries.find(e => e.path === "AGENTS.md")!;
    expect((agents.content.match(/old decision recorded first/g) ?? []).length).toBe(1);
    expect((agents.content.match(/new decision recorded second/g) ?? []).length).toBe(1);
    expect((agents.content.match(/Decisions already made/g) ?? []).length).toBe(1); // exactly one section
  });

  // SPEC-10 Fix 1: a package persisted between WO-07 (undelimited weave) and WO-08
  // (delimited refresh) carries a legacy section with no marker pair. Export must
  // migrate it to the delimited form, not duplicate it.
  it("migrates a legacy undelimited memory section instead of duplicating it on export", async () => {
    const acct = await createAccount("Legacy Memory User", "legacy-memory@test.com", "paid");
    const key = await createApiKey(acct.account_id, "test");
    const headers = { Authorization: `Bearer ${key.rawKey}` };

    const manifest = { project_name: "export-memory-legacy", project_type: "web", frameworks: [], goals: [], requested_outputs: [] };
    const snap = await createSnapshot({ input_method: "repo_snapshot_upload", manifest, files: [{ path: "a.ts", content: "x", size: 1 }] }, acct.account_id);
    await saveContextMap(snap.snapshot_id, makeCtx(snap));

    await addMemoryEntry(snap.project_id, acct.account_id, "decision", "legacy decision from before delimiters");

    // Hand-build a legacy (WO-07-era) AGENTS.md: the section appended with NO
    // marker pair — exactly what pre-delimiter code produced.
    const legacySection = buildMemorySection([{ kind: "decision", content: "legacy decision from before delimiters", source: "", created_at: new Date().toISOString() }])!;
    const legacyGenerated: GeneratorResult = {
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      generated_at: new Date().toISOString(),
      files: [{ path: "AGENTS.md", content: `# Agents\n\n${legacySection}\n`, content_type: "text/markdown", program: "skills", description: "d" }],
      skipped: [],
    };
    await saveGeneratorResult(snap.snapshot_id, legacyGenerated);

    // A fresh decision is recorded after that legacy package was persisted.
    await addMemoryEntry(snap.project_id, acct.account_id, "decision", "fresh decision after migration");

    const res = await rawReq("GET", `/v1/projects/${snap.project_id}/export`, headers);
    expect(res.status).toBe(200);
    const entries = parseZip(res.body);

    // Memory is append-only, so both entries are current and the refreshed section
    // renders both — the bug this guards against is the OLD undelimited copy
    // surviving alongside a NEW delimited copy (each text appearing twice, plus a
    // duplicated heading), not either text going missing.
    const agents = entries.find(e => e.path === "AGENTS.md")!;
    expect((agents.content.match(/Decisions already made/g) ?? []).length).toBe(1); // migrated, not duplicated
    expect((agents.content.match(/legacy decision from before delimiters/g) ?? []).length).toBe(1);
    expect((agents.content.match(/fresh decision after migration/g) ?? []).length).toBe(1);
    expect((agents.content.match(/<!-- axis:project-memory:start -->/g) ?? []).length).toBe(1);
    expect((agents.content.match(/<!-- axis:project-memory:end -->/g) ?? []).length).toBe(1);
  });
});

// ─── CORS contract for the download (live iPhone/desktop export bug) ────
//
// The export succeeded server-side (200, valid zip) and was then discarded by
// the BROWSER: this handler hardcoded Access-Control-Allow-Origin: "*" in its
// writeHead, Node gives writeHead's headers precedence over the router's
// setHeader values, and the router sets Access-Control-Allow-Credentials:
// true in production. Wildcard origin + credentials is the one combination
// the CORS spec forbids, and downloadExport() fetches with
// credentials:"include" (the HttpOnly axis_session cookie is the only
// credential after legacy-key migration). Net effect: a perfect 200 in the
// server logs, "Export failed" in the UI, nothing anywhere pointing at CORS.

describe("export CORS contract", () => {
  const REAL_ORIGIN = "https://iliad.trustfabric.ai";

  async function exportWithOrigin(): Promise<RawRes> {
    const prev = process.env.CORS_ORIGIN;
    process.env.CORS_ORIGIN = REAL_ORIGIN; // production-shaped: specific origin, not "*"
    try {
      return await rawReq("GET", `/v1/projects/${projectId}/export`, { Origin: REAL_ORIGIN });
    } finally {
      if (prev === undefined) delete process.env.CORS_ORIGIN;
      else process.env.CORS_ORIGIN = prev;
    }
  }

  it("never returns a wildcard origin together with credentials (the pair browsers reject)", async () => {
    const res = await exportWithOrigin();
    expect(res.status).toBe(200);

    const allowOrigin = res.headers["access-control-allow-origin"];
    const allowCredentials = res.headers["access-control-allow-credentials"];

    // This is the exact assertion the shipped bug failed.
    if (allowCredentials === "true") {
      expect(allowOrigin).not.toBe("*");
    }
    expect(allowOrigin).toBe(REAL_ORIGIN);
  });

  it("still delivers a real zip alongside the corrected CORS headers", async () => {
    const res = await exportWithOrigin();
    expect(res.headers["content-type"]).toBe("application/zip");
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="axis-export-.+\.zip"$/);
    // Body is a genuine archive, not an error page that happened to 200.
    expect(res.body.readUInt32LE(0)).toBe(0x04034b50);
    expect(parseZip(res.body).length).toBeGreaterThan(0);
  });

  it("exposes Content-Disposition so a cross-origin fetch can read the real filename", async () => {
    const res = await exportWithOrigin();
    // Without this, res.headers.get("Content-Disposition") is null in the
    // browser and every export saves as the generic fallback name.
    expect(res.headers["access-control-expose-headers"]).toContain("Content-Disposition");
  });
});
