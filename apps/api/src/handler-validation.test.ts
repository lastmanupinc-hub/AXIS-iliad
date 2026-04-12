import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { openMemoryDb, closeDb, createAccount, createApiKey } from "@axis/snapshots";
import { Router } from "./router.js";
import { handleCreateSnapshot, makeProgramHandler, PROGRAM_OUTPUTS } from "./handlers.js";
import { resetRateLimits } from "./rate-limiter.js";

const TEST_PORT = 44418;
let server: Server;

// ─── HTTP helper ────────────────────────────────────────────────

interface Res {
  status: number;
  data: Record<string, unknown>;
}

async function req(
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined;
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: TEST_PORT, path, method, headers: { "Content-Type": "application/json", ...headers } },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: Record<string, unknown> = {};
          try { data = JSON.parse(raw); } catch { data = { raw } as Record<string, unknown>; }
          resolve({ status: res.statusCode ?? 0, data });
        });
      },
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

// ─── Server setup ───────────────────────────────────────────────

beforeAll(async () => {
  openMemoryDb();
  resetRateLimits();

  const router = new Router();
  router.post("/v1/snapshots", handleCreateSnapshot);
  router.post("/v1/debug/analyze", makeProgramHandler("debug", PROGRAM_OUTPUTS.debug));

  const { createApp } = await import("./router.js");
  server = createApp(router, TEST_PORT);
  await new Promise<void>((resolve) => setTimeout(resolve, 100));
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  closeDb();
});

// ─── Helpers ────────────────────────────────────────────────────

function validManifest(overrides?: Record<string, unknown>) {
  return {
    project_name: "handler-test",
    project_type: "saas_web_app",
    frameworks: ["react"],
    goals: ["analyze"],
    requested_outputs: ["AGENTS.md"],
    ...overrides,
  };
}

function validSnapshot(overrides?: Record<string, unknown>) {
  return {
    manifest: validManifest(),
    files: [{ path: "index.ts", content: "export const x = 1;" }],
    ...overrides,
  };
}

// ─── Invalid JSON body ──────────────────────────────────────────

describe("invalid JSON body", () => {
  it("returns 400 INVALID_JSON for malformed JSON on snapshot", async () => {
    const r = await req("POST", "/v1/snapshots", "not json{{{");
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("INVALID_JSON");
  });

  it("returns 400 INVALID_JSON for malformed JSON on program handler", async () => {
    const r = await req("POST", "/v1/debug/analyze", "{broken");
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("INVALID_JSON");
  });

  it("returns 400 INVALID_JSON for empty body on snapshot", async () => {
    const r = await req("POST", "/v1/snapshots", "");
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("INVALID_JSON");
  });
});

// ─── Missing manifest fields ────────────────────────────────────

describe("missing manifest fields", () => {
  it("rejects when manifest is missing entirely", async () => {
    const r = await req("POST", "/v1/snapshots", { files: [{ path: "a.ts", content: "x" }] });
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("MISSING_FIELD");
  });

  it("rejects when project_name is missing", async () => {
    const r = await req("POST", "/v1/snapshots", {
      manifest: { project_type: "web", frameworks: ["react"], goals: ["a"], requested_outputs: ["b"] },
      files: [{ path: "a.ts", content: "x" }],
    });
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("MISSING_FIELD");
  });

  it("rejects when requested_outputs is missing", async () => {
    const r = await req("POST", "/v1/snapshots", {
      manifest: { project_name: "test", project_type: "web", frameworks: ["react"], goals: ["a"] },
      files: [{ path: "a.ts", content: "x" }],
    });
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("MISSING_FIELD");
  });
});

// ─── File array validation ──────────────────────────────────────

describe("file array validation", () => {
  it("rejects when files is missing", async () => {
    const r = await req("POST", "/v1/snapshots", { manifest: validManifest() });
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("MISSING_FIELD");
  });

  it("rejects when files is empty array", async () => {
    const r = await req("POST", "/v1/snapshots", { manifest: validManifest(), files: [] });
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("MISSING_FIELD");
  });

  it("rejects file entry without path", async () => {
    const r = await req("POST", "/v1/snapshots", {
      manifest: validManifest(),
      files: [{ content: "x" }],
    });
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("FILE_INVALID");
  });

  it("rejects file entry with non-string content", async () => {
    const r = await req("POST", "/v1/snapshots", {
      manifest: validManifest(),
      files: [{ path: "a.ts", content: 123 }],
    });
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("FILE_INVALID");
  });
});

// ─── Path traversal protection ──────────────────────────────────

describe("path traversal protection", () => {
  it("rejects path with ../", async () => {
    const r = await req("POST", "/v1/snapshots", validSnapshot({
      files: [{ path: "../../etc/passwd", content: "root:x:0:0" }],
    }));
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("PATH_TRAVERSAL");
  });

  it("rejects path with .. in middle", async () => {
    const r = await req("POST", "/v1/snapshots", validSnapshot({
      files: [{ path: "src/../secret.txt", content: "x" }],
    }));
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("PATH_TRAVERSAL");
  });

  it("rejects path with backslash-converted traversal", async () => {
    const r = await req("POST", "/v1/snapshots", validSnapshot({
      files: [{ path: "src\\..\\secret.txt", content: "x" }],
    }));
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("PATH_TRAVERSAL");
  });

  it("normalizes backslashes to forward slashes", async () => {
    const r = await req("POST", "/v1/snapshots", validSnapshot({
      files: [{ path: "src\\components\\App.tsx", content: "export default function App() { return null; }" }],
    }));
    // Should succeed — no traversal, just backslashes
    expect(r.status).toBe(201);
  });

  it("normalizes duplicate slashes", async () => {
    const r = await req("POST", "/v1/snapshots", validSnapshot({
      files: [{ path: "src///deep///file.ts", content: "export const x = 1;" }],
    }));
    expect(r.status).toBe(201);
  });

  it("strips leading slashes", async () => {
    const r = await req("POST", "/v1/snapshots", validSnapshot({
      files: [{ path: "/src/file.ts", content: "export const x = 1;" }],
    }));
    expect(r.status).toBe(201);
  });
});

// ─── Program handler factory (makeProgramHandler) ───────────────

describe("makeProgramHandler", () => {
  it("rejects missing snapshot_id", async () => {
    const r = await req("POST", "/v1/debug/analyze", { something: "else" });
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("MISSING_FIELD");
    expect(r.data.error).toContain("snapshot_id");
  });

  it("rejects snapshot_id as number", async () => {
    const r = await req("POST", "/v1/debug/analyze", { snapshot_id: 42 });
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("MISSING_FIELD");
  });

  it("rejects non-array outputs", async () => {
    const r = await req("POST", "/v1/debug/analyze", { snapshot_id: "test", outputs: "single.md" });
    expect(r.status).toBe(400);
    expect(r.data.error_code).toBe("INVALID_FORMAT");
    expect(r.data.error).toContain("outputs must be an array");
  });

  it("returns 404 when no context exists for snapshot", async () => {
    const r = await req("POST", "/v1/debug/analyze", { snapshot_id: "nonexistent-snap" });
    expect(r.status).toBe(404);
    expect(r.data.error_code).toBe("CONTEXT_PENDING");
  });
});

// ─── Successful snapshot creation ───────────────────────────────

describe("successful snapshot flow", () => {
  it("creates a snapshot and returns status ready", async () => {
    const r = await req("POST", "/v1/snapshots", validSnapshot());
    expect(r.status).toBe(201);
    expect(r.data.status).toBe("ready");
    expect(r.data.snapshot_id).toBeTruthy();
    expect(r.data.project_id).toBeTruthy();
    expect(r.data.context_map).toBeTruthy();
    expect(r.data.repo_profile).toBeTruthy();
    expect(Array.isArray(r.data.generated_files)).toBe(true);
  });

  it("auto-sizes files when size is omitted", async () => {
    const content = "a".repeat(100);
    const r = await req("POST", "/v1/snapshots", {
      manifest: validManifest({ project_name: "autosize-test" }),
      files: [{ path: "big.txt", content }],
    });
    expect(r.status).toBe(201);
  });

  it("uses given input_method when provided", async () => {
    const r = await req("POST", "/v1/snapshots", {
      ...validSnapshot(),
      manifest: validManifest({ project_name: "method-test" }),
      input_method: "github_url",
    });
    expect(r.status).toBe(201);
  });
});

// ─── PROGRAM_OUTPUTS coverage ───────────────────────────────────

describe("PROGRAM_OUTPUTS", () => {
  it("has exactly 16 programs", () => {
    expect(Object.keys(PROGRAM_OUTPUTS).length).toBe(16);
  });

  it("every program has at least one output file", () => {
    for (const [program, outputs] of Object.entries(PROGRAM_OUTPUTS)) {
      expect(outputs.length, `${program} should have outputs`).toBeGreaterThan(0);
    }
  });

  it("no duplicate output files within a program", () => {
    for (const [program, outputs] of Object.entries(PROGRAM_OUTPUTS)) {
      const unique = new Set(outputs);
      expect(unique.size, `${program} has duplicate outputs`).toBe(outputs.length);
    }
  });
});
