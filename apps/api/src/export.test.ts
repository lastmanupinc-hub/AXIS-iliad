import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { inflateRawSync } from "node:zlib";
import { openMemoryDb, closeDb, createSnapshot, saveGeneratorResult } from "@axis/snapshots";
import { Router, createApp } from "./router.js";
import { handleExportZip } from "./export.js";

const TEST_PORT = 44410;
let server: Server;
let projectId: string;
let snapshotId: string;

// ─── HTTP helper (binary-safe) ──────────────────────────────────

interface RawRes {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

function rawReq(method: string, path: string): Promise<RawRes> {
  return new Promise((resolve, reject) => {
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: TEST_PORT, path, method },
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

// ─── Server + seed data ─────────────────────────────────────────

beforeAll(async () => {
  openMemoryDb();

  const snap = createSnapshot({
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

  saveGeneratorResult(snapshotId, {
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
  server = createApp(router, TEST_PORT);
  await new Promise<void>((r) => setTimeout(r, 100));
});

afterAll(() => {
  server?.close();
  closeDb();
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
    saveGeneratorResult(snapshotId, {
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
    saveGeneratorResult(snapshotId, {
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
    saveGeneratorResult(snapshotId, {
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
    saveGeneratorResult(snapshotId, {
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
    saveGeneratorResult(snapshotId, {
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
    saveGeneratorResult(snapshotId, {
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
    saveGeneratorResult(snapshotId, {
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
    saveGeneratorResult(snapshotId, {
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
    const snap2 = createSnapshot({
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
});
