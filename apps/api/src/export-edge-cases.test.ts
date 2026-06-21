import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { inflateRawSync } from "node:zlib";
import { openMemoryDb, closeDb, createSnapshot, saveGeneratorResult } from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleExportZip } from "./export.js";

let server: Server;
let testPort = 0;

// ─── HTTP helper (binary-safe) ──────────────────────────────────

interface RawRes {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

function rawReq(method: string, path: string): Promise<RawRes> {
  return new Promise((resolve, reject) => {
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: testPort, path, method },
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

// ─── ZIP parser ─────────────────────────────────────────────────

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
    if (sig !== 0x04034b50) break;
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

// ─── Test data ──────────────────────────────────────────────────

let manyFilesProjectId: string;
let manyFilesSnapshotId: string;
let emojiProjectId: string;
let emojiSnapshotId: string;

beforeAll(async () => {
  openMemoryDb();

  // Project 1: many files (offset arithmetic)
  const manySnap = createSnapshot({
    input_method: "repo_snapshot_upload",
    manifest: {
      project_name: "many-files-project",
      project_type: "web",
      frameworks: [],
      goals: [],
      requested_outputs: [],
    },
    files: [{ path: "seed.ts", content: "x", size: 1 }],
  });
  manyFilesProjectId = manySnap.project_id;
  manyFilesSnapshotId = manySnap.snapshot_id;

  // Generate 50 files with varied content sizes
  const manyFiles = Array.from({ length: 50 }, (_, i) => ({
    path: `dir-${Math.floor(i / 10)}/file-${i.toString().padStart(3, "0")}.md`,
    content: `# File ${i}\n${"content-line\n".repeat(i + 1)}`,
    program: i % 3 === 0 ? "debug" : i % 3 === 1 ? "search" : "skills",
  }));

  saveGeneratorResult(manyFilesSnapshotId, {
    snapshot_id: manyFilesSnapshotId,
    generated_at: new Date().toISOString(),
    files: manyFiles,
  });

  // Project 2: emoji + multi-byte UTF-8 paths
  const emojiSnap = createSnapshot({
    input_method: "repo_snapshot_upload",
    manifest: {
      project_name: "emoji-project",
      project_type: "web",
      frameworks: [],
      goals: [],
      requested_outputs: [],
    },
    files: [{ path: "seed.ts", content: "x", size: 1 }],
  });
  emojiProjectId = emojiSnap.project_id;
  emojiSnapshotId = emojiSnap.snapshot_id;

  saveGeneratorResult(emojiSnapshotId, {
    snapshot_id: emojiSnapshotId,
    generated_at: new Date().toISOString(),
    files: [
      { path: "🚀-launch/readme.md", content: "# Launch Guide", program: "search" },
      { path: "数据/分析报告.md", content: "# 数据分析报告\n内容在此", program: "search" },
      { path: "café/menü.md", content: "Ä Ö Ü ß", program: "debug" },
      { path: "normal/ascii-only.txt", content: "plain text", program: "debug" },
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
  closeDb();
});

// ─── Many-files offset arithmetic ───────────────────────────────

describe("ZIP with many files", () => {
  it("produces valid ZIP with all 50 files", async () => {
    const res = await rawReq("GET", `/v1/projects/${manyFilesProjectId}/export`);
    expect(res.status).toBe(200);

    const entries = parseZip(res.body);
    expect(entries.length).toBe(50);
  });

  it("all 50 files decompress correctly with matching content", async () => {
    const res = await rawReq("GET", `/v1/projects/${manyFilesProjectId}/export`);
    const entries = parseZip(res.body);

    for (let i = 0; i < 50; i++) {
      const expected = `# File ${i}\n${"content-line\n".repeat(i + 1)}`;
      const entry = entries.find(e => e.path === `dir-${Math.floor(i / 10)}/file-${i.toString().padStart(3, "0")}.md`);
      expect(entry, `file-${i} should exist`).toBeDefined();
      expect(entry!.content).toBe(expected);
      expect(entry!.uncompressedSize).toBe(Buffer.byteLength(expected, "utf-8"));
    }
  });

  it("central directory entry count matches in EOCD", async () => {
    const res = await rawReq("GET", `/v1/projects/${manyFilesProjectId}/export`);
    const eocdOffset = res.body.length - 22;
    expect(res.body.readUInt32LE(eocdOffset)).toBe(0x06054b50);
    expect(res.body.readUInt16LE(eocdOffset + 10)).toBe(50);
  });

  it("program filter reduces file count for many-files project", async () => {
    const res = await rawReq("GET", `/v1/projects/${manyFilesProjectId}/export?program=debug`);
    expect(res.status).toBe(200);

    const entries = parseZip(res.body);
    // debug files: indices 0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48 = 17 files
    expect(entries.length).toBe(17);
  });

  it("Content-Disposition includes program filter in filename", async () => {
    const res = await rawReq("GET", `/v1/projects/${manyFilesProjectId}/export?program=debug`);
    expect(res.headers["content-disposition"]).toContain("axis-debug-");
    expect(res.headers["content-disposition"]).toContain(".zip");
  });

  it("Content-Disposition uses export prefix when no program filter", async () => {
    const res = await rawReq("GET", `/v1/projects/${manyFilesProjectId}/export`);
    expect(res.headers["content-disposition"]).toContain("axis-export-");
  });
});

// ─── Multi-byte UTF-8 paths ─────────────────────────────────────

describe("ZIP with multi-byte UTF-8 paths", () => {
  it("emoji paths survive round-trip", async () => {
    const res = await rawReq("GET", `/v1/projects/${emojiProjectId}/export`);
    expect(res.status).toBe(200);

    const entries = parseZip(res.body);
    const launch = entries.find(e => e.path.includes("launch"));
    expect(launch).toBeDefined();
    expect(launch!.path).toBe("🚀-launch/readme.md");
    expect(launch!.content).toBe("# Launch Guide");
  });

  it("CJK paths survive round-trip", async () => {
    const res = await rawReq("GET", `/v1/projects/${emojiProjectId}/export`);
    const entries = parseZip(res.body);

    const cjk = entries.find(e => e.path.includes("数据"));
    expect(cjk).toBeDefined();
    expect(cjk!.path).toBe("数据/分析报告.md");
    expect(cjk!.content).toBe("# 数据分析报告\n内容在此");
  });

  it("accented Latin paths survive round-trip", async () => {
    const res = await rawReq("GET", `/v1/projects/${emojiProjectId}/export`);
    const entries = parseZip(res.body);

    const cafe = entries.find(e => e.path.includes("café"));
    expect(cafe).toBeDefined();
    expect(cafe!.path).toBe("café/menü.md");
    expect(cafe!.content).toBe("Ä Ö Ü ß");
  });

  it("uncompressed sizes account for multi-byte encoding", async () => {
    const res = await rawReq("GET", `/v1/projects/${emojiProjectId}/export`);
    const entries = parseZip(res.body);

    for (const entry of entries) {
      expect(entry.uncompressedSize).toBe(Buffer.byteLength(entry.content, "utf-8"));
    }
  });

  it("all 4 files present in ZIP", async () => {
    const res = await rawReq("GET", `/v1/projects/${emojiProjectId}/export`);
    const entries = parseZip(res.body);
    expect(entries.length).toBe(4);
  });

  it("program filter works with multi-byte paths", async () => {
    const res = await rawReq("GET", `/v1/projects/${emojiProjectId}/export?program=search`);
    expect(res.status).toBe(200);
    const entries = parseZip(res.body);
    expect(entries.length).toBe(2);
    expect(entries.some(e => e.path.includes("🚀"))).toBe(true);
    expect(entries.some(e => e.path.includes("数据"))).toBe(true);
  });
});
