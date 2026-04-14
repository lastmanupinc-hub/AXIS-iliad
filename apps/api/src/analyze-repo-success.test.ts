import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { openMemoryDb, closeDb, createAccount, createApiKey } from "@axis/snapshots";
import { Router, createApp } from "./router.js";
import { handleMcpPost } from "./mcp-server.js";
import { resetRateLimits } from "./rate-limiter.js";

// ─── Mock GitHub network I/O ────────────────────────────────────
vi.mock("./github.js", () => ({
  parseGitHubUrl: (url: string) => {
    if (!url.includes("github.com")) throw new Error("Invalid GitHub URL");
    return { owner: "test-owner", repo: "test-repo", ref: "HEAD" };
  },
  fetchGitHubRepo: vi.fn(async () => ({
    files: [
      { path: "README.md", content: "# Mock Repo\nThis is a test." },
      { path: "package.json", content: '{"name":"mock","version":"1.0.0"}' },
      { path: "src/index.ts", content: 'export const hello = "world";' },
    ],
    owner: "test-owner",
    repo: "test-repo",
    ref: "HEAD",
    skipped_count: 0,
    total_bytes: 120,
  })),
}));

const TEST_PORT = 44525;
let server: Server;
let apiKey = "";

// ─── HTTP helper ────────────────────────────────────────────────

interface Res { status: number; data: unknown }

async function post(path: string, body: unknown, authKey?: string): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(payload)),
    };
    if (authKey) headers["Authorization"] = `Bearer ${authKey}`;
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: TEST_PORT, path, method: "POST", headers },
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
    r.write(payload);
    r.end();
  });
}

// ─── Server setup ───────────────────────────────────────────────

beforeAll(async () => {
  openMemoryDb();
  resetRateLimits();
  const router = new Router();
  router.post("/mcp", handleMcpPost);
  server = createApp(router, TEST_PORT);
  await new Promise<void>((r) => setTimeout(r, 150));

  // Create account + API key directly via DB
  const acct = createAccount("RepoTest", "repo-test@example.com");
  const key = createApiKey(acct.account_id, "repo-test-key");
  apiKey = key.rawKey;
});

afterAll(() => {
  server?.close();
  closeDb();
});

// ─── Tests ──────────────────────────────────────────────────────

describe("analyze_repo success path (mocked GitHub)", () => {
  it("returns full artifact bundle for a valid GitHub URL", async () => {
    const r = await post(
      "/mcp",
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "analyze_repo",
          arguments: { github_url: "https://github.com/test-owner/test-repo" },
        },
      },
      apiKey,
    );
    expect(r.status).toBe(200);
    const rpc = r.data as Record<string, unknown>;
    expect(rpc.jsonrpc).toBe("2.0");
    expect(rpc.id).toBe(1);

    const result = rpc.result as Record<string, unknown>;
    expect(result.isError).toBeFalsy();

    const content = result.content as Array<{ type: string; text: string }>;
    expect(content).toHaveLength(1);
    expect(content[0].type).toBe("text");

    const parsed = JSON.parse(content[0].text);
    expect(parsed.snapshot_id).toBeDefined();
    expect(parsed.project_id).toBeDefined();
    expect(parsed.status).toBe("ready");
    expect(parsed.artifact_count).toBeGreaterThan(0);
    expect(parsed.programs_executed).toBeInstanceOf(Array);
    expect(parsed.programs_executed.length).toBeGreaterThan(0);
    expect(parsed.artifacts).toBeInstanceOf(Array);
    expect(parsed.artifacts.length).toBeGreaterThan(0);

    // Verify artifacts have expected shape
    for (const art of parsed.artifacts) {
      expect(art.path).toBeDefined();
      expect(art.program).toBeDefined();
      expect(art.description).toBeDefined();
    }

    // Verify _usage metadata
    expect(result._usage).toBeDefined();
    const usage = result._usage as Record<string, unknown>;
    expect(usage.tool).toBe("analyze_repo");
    expect(usage.tier).toBeDefined();
  });
});
