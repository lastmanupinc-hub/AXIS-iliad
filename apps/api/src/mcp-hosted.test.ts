import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { resetTestDb, subscribeRepo, createSnapshot, setLatestSnapshot } from "@axis/snapshots";
import type { SnapshotRecord, FileEntry, WatchJobPayload } from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleCreateAccount } from "./billing.js";
import { handleMcpHostedPost, processMcpHostedSync, dispatchHosted, type McpHostedSyncDeps } from "./mcp-hosted.js";
import { resetRateLimits } from "./rate-limiter.js";

function makeSnapshot(files: FileEntry[], projectName = "acme/widgets"): SnapshotRecord {
  return {
    snapshot_id: "snap-test",
    project_id: "proj-test",
    created_at: "2026-01-01T00:00:00Z",
    input_method: "github_repo_url",
    manifest: { project_name: projectName, project_type: "github_repository", frameworks: [], goals: [], requested_outputs: [] },
    file_count: files.length,
    total_size_bytes: files.reduce((s, f) => s + f.size, 0),
    files,
    status: "ready",
    account_id: null,
    content_discarded_at: null,
  };
}

const FIXTURE_FILES: FileEntry[] = [
  { path: "src/index.ts", content: 'export function main() { return "hi"; }', size: 40 },
  { path: "src/utils/helpers.ts", content: "export const noop = () => {};", size: 30 },
  { path: "package.json", content: '{"name":"acme-widgets"}', size: 24 },
];

describe("dispatchHosted (pure, no DB)", () => {
  const snapshot = makeSnapshot(FIXTURE_FILES);

  it("initialize returns server info derived from the snapshot's project name", async () => {
    const res = await dispatchHosted("initialize", {}, 1, snapshot);
    expect("result" in res).toBe(true);
    if ("result" in res) {
      const result = res.result as { serverInfo: { name: string } };
      expect(result.serverInfo.name).toBe("acme/widgets-mcp-hosted");
    }
  });

  it("tools/list returns the REAL generateMcpConfig tool catalog, including exec-category tools", async () => {
    const res = await dispatchHosted("tools/list", {}, 1, snapshot);
    expect("result" in res).toBe(true);
    if ("result" in res) {
      const { tools } = res.result as { tools: Array<{ name: string }> };
      const names = tools.map((t) => t.name);
      expect(names).toContain("read_file");
      expect(names).toContain("run_build"); // advertised even though hosted mode declines it at call time
    }
  });

  it("tools/call read_file returns the real file content from the snapshot", async () => {
    const res = await dispatchHosted("tools/call", { name: "read_file", arguments: { path: "src/index.ts" } }, 1, snapshot);
    expect("result" in res).toBe(true);
    if ("result" in res) {
      const result = res.result as { content: Array<{ text: string }>; isError: boolean };
      expect(result.isError).toBe(false);
      expect(result.content[0].text).toBe(FIXTURE_FILES[0].content);
    }
  });

  it("tools/call read_file on a missing path returns a tool error, not a JSON-RPC error", async () => {
    const res = await dispatchHosted("tools/call", { name: "read_file", arguments: { path: "does/not/exist.ts" } }, 1, snapshot);
    expect("result" in res).toBe(true);
    if ("result" in res) {
      const result = res.result as { isError: boolean };
      expect(result.isError).toBe(true);
    }
  });

  it("tools/call list_directory lists real immediate entries under a path", async () => {
    const res = await dispatchHosted("tools/call", { name: "list_directory", arguments: { path: "src" } }, 1, snapshot);
    expect("result" in res).toBe(true);
    if ("result" in res) {
      const result = res.result as { content: Array<{ text: string }> };
      const entries = JSON.parse(result.content[0].text) as string[];
      expect(entries).toEqual(["index.ts", "utils/"]);
    }
  });

  it("tools/call search_files finds real matching paths", async () => {
    const res = await dispatchHosted("tools/call", { name: "search_files", arguments: { pattern: "helpers" } }, 1, snapshot);
    expect("result" in res).toBe(true);
    if ("result" in res) {
      const result = res.result as { content: Array<{ text: string }> };
      const matches = JSON.parse(result.content[0].text) as string[];
      expect(matches).toEqual(["src/utils/helpers.ts"]);
    }
  });

  it("tools/call on an exec-category tool declines honestly instead of pretending to run it", async () => {
    const res = await dispatchHosted("tools/call", { name: "run_build", arguments: {} }, 1, snapshot);
    expect("result" in res).toBe(true);
    if ("result" in res) {
      const result = res.result as { content: Array<{ text: string }>; isError: boolean };
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not available");
    }
  });

  it("tools/call on a genuinely unknown tool name returns a real JSON-RPC error", async () => {
    const res = await dispatchHosted("tools/call", { name: "not_a_real_tool", arguments: {} }, 1, snapshot);
    expect("error" in res).toBe(true);
  });

  it("resources/read context-map returns the real generateContextMapJSON output", async () => {
    const res = await dispatchHosted("resources/read", { uri: "project://acme/widgets/context-map" }, 1, snapshot);
    expect("result" in res).toBe(true);
    if ("result" in res) {
      const result = res.result as { contents: Array<{ text: string }> };
      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed).toBeTruthy();
    }
  });

  it("an unknown method returns RPC_METHOD_NOT_FOUND", async () => {
    const res = await dispatchHosted("not/a/real/method", {}, 1, snapshot);
    expect("error" in res).toBe(true);
    if ("error" in res) {
      expect((res as { error: { code: number } }).error.code).toBe(-32601);
    }
  });
});

describe("processMcpHostedSync", () => {
  const payload: WatchJobPayload = { account_id: "a", product_id: "mcp", repo_full_name: "o/r", event_type: "push", ref: "refs/heads/main" };

  it("ignores watch jobs for any product other than mcp, without fetching", async () => {
    let fetched = false;
    const deps: McpHostedSyncDeps = { token: "t", fetchRepo: async () => { fetched = true; return { files: [] }; } };
    const out = await processMcpHostedSync({ ...payload, product_id: "skills" }, deps);
    expect(out).toEqual({ status: "not_mcp_product" });
    expect(fetched).toBe(false);
  });

  it("does nothing without a token", async () => {
    const deps: McpHostedSyncDeps = { token: undefined, fetchRepo: async () => ({ files: [] }) };
    expect(await processMcpHostedSync(payload, deps)).toEqual({ status: "no_token" });
  });
});

describe("hosted MCP endpoint — real HTTP round trip (app_20 acceptance test)", () => {
  let server: Server;
  let testPort = 0;
  let apiKey: string;
  let otherAccountKey: string;

  async function req(path: string, body: unknown, authKey?: string): Promise<{ status: number; data: unknown }> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(body);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authKey) headers["Authorization"] = `Bearer ${authKey}`;
      const r = require("node:http").request(
        { hostname: "127.0.0.1", port: testPort, path, method: "POST", headers },
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

  beforeAll(async () => {
    await resetTestDb();
    resetRateLimits();
    const router = new Router();
    router.post("/v1/accounts", handleCreateAccount);
    router.post("/v1/mcp/hosted/:repo*", handleMcpHostedPost);
    const ts = await startTestServer(router);
    server = ts.server;
    testPort = ts.port;

    const acct = await req("/v1/accounts", { name: "Hosted MCP Tester", email: "hosted-mcp@test.com" });
    apiKey = (acct.data as { api_key: { raw_key: string }; account: { account_id: string } }).api_key.raw_key;
    const accountId = (acct.data as { account: { account_id: string } }).account.account_id;

    const otherAcct = await req("/v1/accounts", { name: "Other Account", email: "other-hosted-mcp@test.com" });
    otherAccountKey = (otherAcct.data as { api_key: { raw_key: string } }).api_key.raw_key;

    // Real subscribe + real synced snapshot — the exact state processMcpHostedSync would leave behind.
    await subscribeRepo(accountId, "mcp", "acme/widgets");
    const snapshot = await createSnapshot(
      { input_method: "github_repo_url", manifest: { project_name: "acme/widgets", project_type: "github_repository", frameworks: [], goals: [], requested_outputs: [] }, files: FIXTURE_FILES },
      accountId,
    );
    await setLatestSnapshot(accountId, "mcp", "acme/widgets", snapshot.snapshot_id);
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  it("rejects an unauthenticated request", async () => {
    const res = await req("/v1/mcp/hosted/acme/widgets", { jsonrpc: "2.0", method: "initialize", id: 1 });
    expect(res.status).toBe(401);
  });

  it("rejects a request from an account that never subscribed this repo — no cross-tenant leak, even with a valid key", async () => {
    const res = await req("/v1/mcp/hosted/acme/widgets", { jsonrpc: "2.0", method: "tools/list", id: 1 }, otherAccountKey);
    expect(res.status).toBe(404);
  });

  it("round-trips a real tools/call against the real hosted endpoint: subscribe -> sync -> HTTP tools/call -> real file content back", async () => {
    const res = await req(
      "/v1/mcp/hosted/acme/widgets",
      { jsonrpc: "2.0", method: "tools/call", id: 42, params: { name: "read_file", arguments: { path: "package.json" } } },
      apiKey,
    );
    expect(res.status).toBe(200);
    const data = res.data as { id: number; result: { content: Array<{ text: string }>; isError: boolean } };
    expect(data.id).toBe(42);
    expect(data.result.isError).toBe(false);
    expect(data.result.content[0].text).toBe(FIXTURE_FILES[2].content);
  });

  it("round-trips a real initialize handshake", async () => {
    const res = await req("/v1/mcp/hosted/acme/widgets", { jsonrpc: "2.0", method: "initialize", id: 1 }, apiKey);
    expect(res.status).toBe(200);
    const data = res.data as { result: { serverInfo: { name: string } } };
    expect(data.result.serverInfo.name).toBe("acme/widgets-mcp-hosted");
  });
});
