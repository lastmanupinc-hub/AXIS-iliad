import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetTestDb, sql, indexSnapshotContent, searchSnapshotContent, getSearchIndexStats, indexSymbols } from "@axis/snapshots";
import {
  handleSearchIndex,
  handleSearchQuery,
  handleSearchStats,
  handleSearchSymbols,
} from "./handlers.js";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { Readable } from "node:stream";

// ─── Helpers ────────────────────────────────────────────────────

function makeReq(body: unknown): IncomingMessage {
  const payload = JSON.stringify(body);
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.headers["content-type"] = "application/json";
  // Simulate body by pushing data
  const readable = new Readable({ read() {} });
  readable.push(payload);
  readable.push(null);
  // Copy stream events
  req.push = readable.push.bind(readable);
  // Override to emit data
  const origOn = req.on.bind(req);
  const dataCallbacks: Array<(chunk: Buffer) => void> = [];
  const endCallbacks: Array<() => void> = [];
  req.on = function (event: string, cb: (...args: unknown[]) => void) {
    if (event === "data") { dataCallbacks.push(cb as (chunk: Buffer) => void); }
    else if (event === "end") { endCallbacks.push(cb as () => void); }
    else { origOn(event, cb); }
    return req;
  } as typeof req.on;
  // Trigger immediately
  process.nextTick(() => {
    for (const cb of dataCallbacks) cb(Buffer.from(payload));
    for (const cb of endCallbacks) cb();
  });
  return req;
}

function makeGetReq(url = "/"): IncomingMessage {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.url = url;
  return req;
}

interface CapturedResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
}

function makeRes(): { res: ServerResponse; captured: () => CapturedResponse } {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  const res = new ServerResponse(req);

  let writtenHead = 200;
  let writtenBody = "";
  const headers: Record<string, string> = {};

  const origSetHeader = res.setHeader.bind(res);
  res.setHeader = function (name: string, value: string | number | readonly string[]) {
    headers[name.toLowerCase()] = String(value);
    return origSetHeader(name, value);
  } as typeof res.setHeader;

  res.writeHead = function (status: number, _headers?: Record<string, string>) {
    writtenHead = status;
    if (_headers) {
      for (const [k, v] of Object.entries(_headers)) headers[k.toLowerCase()] = v;
    }
    return res;
  } as typeof res.writeHead;

  res.end = function (data?: string | Buffer) {
    if (data) writtenBody = typeof data === "string" ? data : data.toString();
    return res;
  } as typeof res.end;

  return {
    res,
    captured: () => ({
      statusCode: writtenHead,
      headers,
      body: writtenBody ? JSON.parse(writtenBody) : null,
    }),
  };
}

// Seed snapshot data
async function seedSnapshot(snapshotId = "snap1") {
  const projectExists = await sql.one("SELECT 1 FROM projects WHERE project_id = 'p1'");
  if (!projectExists) {
    await sql.run("INSERT INTO projects (project_id, project_name) VALUES ('p1', 'Test Project')");
  }
  const files = [
    { path: "src/index.ts", content: "import { foo } from './foo';\nexport default foo;\n", size: 50 },
    { path: "src/foo.ts", content: "export const foo = 42;\nexport const bar = 'hello';\n", size: 55 },
    { path: "README.md", content: "# Test Project\nA sample project\n", size: 35 },
  ];
  await sql.run(
    "INSERT INTO snapshots (snapshot_id, project_id, created_at, input_method, manifest, file_count, total_size_bytes, files, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (snapshot_id) DO UPDATE SET project_id = EXCLUDED.project_id, created_at = EXCLUDED.created_at, input_method = EXCLUDED.input_method, manifest = EXCLUDED.manifest, file_count = EXCLUDED.file_count, total_size_bytes = EXCLUDED.total_size_bytes, files = EXCLUDED.files, status = EXCLUDED.status",
    [snapshotId, "p1", "2024-01-01", "api_submission", "{}", files.length, 140, JSON.stringify(files), "ready"],
  );
  return files;
}

/** R5.7: same shape as seedSnapshot, but already discarded (post web-logout). */
async function seedDiscardedSnapshot(snapshotId = "snap-discarded") {
  const projectExists = await sql.one("SELECT 1 FROM projects WHERE project_id = 'p1'");
  if (!projectExists) {
    await sql.run("INSERT INTO projects (project_id, project_name) VALUES ('p1', 'Test Project')");
  }
  const files = [{ path: "src/index.ts", content: "", size: 50 }];
  await sql.run(
    "INSERT INTO snapshots (snapshot_id, project_id, created_at, input_method, manifest, file_count, total_size_bytes, files, status, content_discarded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (snapshot_id) DO UPDATE SET files = EXCLUDED.files, content_discarded_at = EXCLUDED.content_discarded_at",
    [snapshotId, "p1", "2024-01-01", "api_submission", "{}", files.length, 50, JSON.stringify(files), "ready", "2024-06-01T00:00:00.000Z"],
  );
}

beforeEach(async () => {
  await resetTestDb();
});

// ─── handleSearchIndex ──────────────────────────────────────────

describe("handleSearchIndex", () => {
  it("indexes snapshot files and returns counts including indexed_symbols", async () => {
    await seedSnapshot();
    const req = makeReq({ snapshot_id: "snap1" });
    const { res, captured } = makeRes();
    await handleSearchIndex(req, res);
    const result = captured();
    expect(result.statusCode).toBe(200);
    expect(result.body).toHaveProperty("indexed_files", 3);
    expect((result.body as Record<string, number>).indexed_lines).toBeGreaterThan(0);
    expect(typeof (result.body as Record<string, number>).indexed_symbols).toBe("number");
  });

  it("returns 404 for non-existent snapshot", async () => {
    const req = makeReq({ snapshot_id: "nonexistent" });
    const { res, captured } = makeRes();
    await handleSearchIndex(req, res);
    expect(captured().statusCode).toBe(404);
  });

  it("returns 400 when snapshot_id is missing", async () => {
    const req = makeReq({});
    const { res, captured } = makeRes();
    await handleSearchIndex(req, res);
    expect(captured().statusCode).toBe(400);
  });

  it("R5.7: returns 410 CONTENT_DISCARDED instead of silently indexing blanked content", async () => {
    await seedDiscardedSnapshot();
    const req = makeReq({ snapshot_id: "snap-discarded" });
    const { res, captured } = makeRes();
    await handleSearchIndex(req, res);
    const result = captured();
    expect(result.statusCode).toBe(410);
    expect((result.body as Record<string, unknown>).error_code).toBe("CONTENT_DISCARDED");
  });
});

// ─── handleSearchQuery ──────────────────────────────────────────

describe("handleSearchQuery", () => {
  beforeEach(async () => {
    const files = await seedSnapshot();
    await indexSnapshotContent("snap1", files);
  });

  it("returns matching results for a query", async () => {
    const req = makeReq({ snapshot_id: "snap1", query: "foo" });
    const { res, captured } = makeRes();
    await handleSearchQuery(req, res);
    const result = captured();
    expect(result.statusCode).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(body.query).toBe("foo");
    expect((body.results as unknown[]).length).toBeGreaterThan(0);
    expect(body.total_indexed_files).toBe(3);
  });

  it("returns empty results for unmatched query", async () => {
    const req = makeReq({ snapshot_id: "snap1", query: "zzz_no_match_zzz" });
    const { res, captured } = makeRes();
    await handleSearchQuery(req, res);
    const body = captured().body as Record<string, unknown>;
    expect((body.results as unknown[]).length).toBe(0);
  });

  it("respects limit parameter", async () => {
    const req = makeReq({ snapshot_id: "snap1", query: "export", limit: 1 });
    const { res, captured } = makeRes();
    await handleSearchQuery(req, res);
    const body = captured().body as Record<string, unknown>;
    expect((body.results as unknown[]).length).toBe(1);
  });

  it("returns 400 when query is missing", async () => {
    const req = makeReq({ snapshot_id: "snap1" });
    const { res, captured } = makeRes();
    await handleSearchQuery(req, res);
    expect(captured().statusCode).toBe(400);
  });

  it("returns 400 when query exceeds 500 chars", async () => {
    const req = makeReq({ snapshot_id: "snap1", query: "x".repeat(501) });
    const { res, captured } = makeRes();
    await handleSearchQuery(req, res);
    expect(captured().statusCode).toBe(400);
  });

  it("clamps limit to valid range", async () => {
    const req = makeReq({ snapshot_id: "snap1", query: "foo", limit: 999 });
    const { res, captured } = makeRes();
    await handleSearchQuery(req, res);
    // Should not error — clamped internally to 200
    expect(captured().statusCode).toBe(200);
  });
});

// ─── handleSearchStats ──────────────────────────────────────────

describe("handleSearchStats", () => {
  it("returns stats for an indexed snapshot", async () => {
    const files = await seedSnapshot();
    await indexSnapshotContent("snap1", files);

    const req = makeGetReq();
    const { res, captured } = makeRes();
    await handleSearchStats(req, res, { snapshot_id: "snap1" });
    const body = captured().body as Record<string, unknown>;
    expect(captured().statusCode).toBe(200);
    expect(body.file_count).toBe(3);
    expect((body.line_count as number)).toBeGreaterThan(0);
  });

  it("returns zeros for non-indexed snapshot", async () => {
    const req = makeGetReq();
    const { res, captured } = makeRes();
    await handleSearchStats(req, res, { snapshot_id: "snap-none" });
    const body = captured().body as Record<string, unknown>;
    expect(body.file_count).toBe(0);
    expect(body.line_count).toBe(0);
  });
});

// ─── Layer 11: Invalid JSON (handlers.ts lines 705-706) ────────

function makeRawReq(rawBody: string): IncomingMessage {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.headers["content-type"] = "application/json";
  const origOn = req.on.bind(req);
  const dataCallbacks: Array<(chunk: Buffer) => void> = [];
  const endCallbacks: Array<() => void> = [];
  req.on = function (event: string, cb: (...args: unknown[]) => void) {
    if (event === "data") { dataCallbacks.push(cb as (chunk: Buffer) => void); }
    else if (event === "end") { endCallbacks.push(cb as () => void); }
    else { origOn(event, cb); }
    return req;
  } as typeof req.on;
  process.nextTick(() => {
    for (const cb of dataCallbacks) cb(Buffer.from(rawBody));
    for (const cb of endCallbacks) cb();
  });
  return req;
}

describe("handleSearchIndex — invalid JSON", () => {
  it("returns 400 for malformed JSON body", async () => {
    const req = makeRawReq("{not valid json}}}");
    const { res, captured } = makeRes();
    await handleSearchIndex(req, res);
    expect(captured().statusCode).toBe(400);
    expect((captured().body as Record<string, unknown>).error_code).toBe("INVALID_JSON");
  });
});

describe("handleSearchQuery — invalid JSON", () => {
  it("returns 400 for malformed JSON body", async () => {
    const req = makeRawReq("<<<not json>>>");
    const { res, captured } = makeRes();
    await handleSearchQuery(req, res);
    expect(captured().statusCode).toBe(400);
    expect((captured().body as Record<string, unknown>).error_code).toBe("INVALID_JSON");
  });
});

// ─── handleSearchSymbols ────────────────────────────────────────

async function seedSnapshotWithCode(snapshotId = "code-snap") {
  const projectExists = await sql.one("SELECT 1 FROM projects WHERE project_id = 'codep'");
  if (!projectExists) {
    await sql.run("INSERT INTO projects (project_id, project_name) VALUES ('codep', 'Code Project')");
  }
  const files = [
    { path: "src/handlers.ts", content: "export function handleCreate() {}\nexport async function handleDelete() {}\n", size: 70 },
    { path: "src/models.ts", content: "export class UserModel {}\nexport interface UserPayload { id: string; }\n", size: 70 },
  ];
  await sql.run(
    "INSERT INTO snapshots (snapshot_id, project_id, created_at, input_method, manifest, file_count, total_size_bytes, files, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (snapshot_id) DO UPDATE SET project_id = EXCLUDED.project_id, created_at = EXCLUDED.created_at, input_method = EXCLUDED.input_method, manifest = EXCLUDED.manifest, file_count = EXCLUDED.file_count, total_size_bytes = EXCLUDED.total_size_bytes, files = EXCLUDED.files, status = EXCLUDED.status",
    [snapshotId, "codep", "2024-01-01", "api_submission", "{}", files.length, 140, JSON.stringify(files), "ready"],
  );
  return files;
}

describe("handleSearchSymbols", () => {
  const snapId = "code-snap";

  beforeEach(async () => {
    const files = await seedSnapshotWithCode(snapId);
    await indexSymbols(snapId, files.map((f) => ({ path: f.path, content: f.content })));
  });

  it("returns all symbols with no query params", async () => {
    const req = makeGetReq(`/v1/search/${snapId}/symbols`);
    const { res, captured } = makeRes();
    await handleSearchSymbols(req, res, { snapshot_id: snapId });
    const body = captured().body as Record<string, unknown>;
    expect(captured().statusCode).toBe(200);
    expect((body.results as unknown[]).length).toBeGreaterThan(0);
    expect(typeof body.symbol_count).toBe("number");
  });

  it("filters by name prefix", async () => {
    const req = makeGetReq(`/v1/search/${snapId}/symbols?name=handle`);
    const { res, captured } = makeRes();
    await handleSearchSymbols(req, res, { snapshot_id: snapId });
    const body = captured().body as Record<string, unknown>;
    const results = body.results as Array<{ symbol_name: string }>;
    expect(results.every((r) => r.symbol_name.toLowerCase().startsWith("handle"))).toBe(true);
  });

  it("filters by type", async () => {
    const req = makeGetReq(`/v1/search/${snapId}/symbols?type=class`);
    const { res, captured } = makeRes();
    await handleSearchSymbols(req, res, { snapshot_id: snapId });
    const body = captured().body as Record<string, unknown>;
    const results = body.results as Array<{ symbol_type: string }>;
    expect(results.every((r) => r.symbol_type === "class")).toBe(true);
  });

  it("respects limit query param", async () => {
    const req = makeGetReq(`/v1/search/${snapId}/symbols?limit=1`);
    const { res, captured } = makeRes();
    await handleSearchSymbols(req, res, { snapshot_id: snapId });
    const body = captured().body as Record<string, unknown>;
    expect((body.results as unknown[]).length).toBeLessThanOrEqual(1);
  });

  it("returns empty results for unindexed snapshot", async () => {
    const req = makeGetReq("/v1/search/nobody/symbols");
    const { res, captured } = makeRes();
    await handleSearchSymbols(req, res, { snapshot_id: "nobody" });
    const body = captured().body as Record<string, unknown>;
    expect(captured().statusCode).toBe(200);
    expect((body.results as unknown[]).length).toBe(0);
    expect(body.symbol_count).toBe(0);
  });
});
