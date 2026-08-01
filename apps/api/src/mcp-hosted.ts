// ─── app_20_mcp_hosted: mcp program's hosted, per-account MCP endpoint ──
//
// AXIS's mcp-config.json documents tools a repo's OWNER would run locally
// (read_file, run_build, git_status, ...). This hosts a LIVE version for the
// filesystem-category tools only — read_file/list_directory/search_files —
// answered from the latest synced snapshot, never live code execution.
// run_build/run_tests/type_check/git_*/framework tools are still advertised
// in tools/list (matching the real, local mcp-config.json exactly — reusing
// generateMcpConfig's own output, not a hand-duplicated tool list) but
// tools/call returns an honest "not available in hosted mode" for them: this
// is a hosted API endpoint serving arbitrary subscribers' repos, and actually
// running someone's build/test/git commands server-side would be the same
// arbitrary-code-execution surface app_10's local-only Docker verify was
// designed to avoid — except here there's no "the user's own machine" escape
// hatch, so the honest answer is "self-host to run this," not "run it
// anyway."
//
// Two halves:
//  - processMcpHostedSync: the Watch step. On a "mcp"-subscribed repo's
//    push, re-fetches the repo, persists a fresh snapshot, and records it as
//    the subscription's latest_snapshot_id (app_01/repo-subscriptions.ts).
//  - handleMcpHostedPost: the HTTP transport. Resolves the caller's account
//    via the SAME Authorization header the existing global /mcp endpoint
//    uses (resolveAuth), looks up THAT account's subscription for the
//    requested repo, and dispatches JSON-RPC against its latest snapshot.
//    The account is never taken from the URL — only from the authenticated
//    caller — so there's nothing to enumerate: a repo's hosted endpoint is
//    reachable only by whichever account actually subscribed it.

import type { IncomingMessage, ServerResponse } from "node:http";
import { readBody, sendJSON } from "./router.js";
import { resolveAuth } from "./billing.js";
import { log } from "./logger.js";
import { rpcOk, rpcErr, RPC_INVALID_PARAMS, RPC_METHOD_NOT_FOUND, RPC_INTERNAL_ERROR, RPC_INVALID_REQUEST, RPC_PARSE_ERROR, type RpcSuccess, type RpcError } from "./mcp-runtime.js";

type RpcResponse = RpcSuccess | RpcError;
import { MCP_PROTOCOL_VERSION } from "./mcp-server.js";
import { fetchGitHubRepo, createSnapshot, getSnapshot, getRepoSubscription, setLatestSnapshot } from "@axis/snapshots";
import type { SnapshotRecord, SnapshotManifest, FileEntry, WatchJobPayload } from "@axis/snapshots";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import { generateMcpConfig, generateContextMapJSON, generateRepoProfileYAML } from "@axis/generator-core";

export const MCP_HOSTED_PRODUCT_ID = "mcp";

// ─── Watch step: re-sync on push ──────────────────────────────────

export interface McpHostedSyncDeps {
  token: string | undefined;
  fetchRepo: (url: string, token: string) => Promise<{ files: FileEntry[] }>;
}

export type McpHostedSyncStatus = "not_mcp_product" | "no_token" | "synced";

export async function processMcpHostedSync(payload: WatchJobPayload, deps: McpHostedSyncDeps): Promise<{ status: McpHostedSyncStatus }> {
  if (payload.product_id !== MCP_HOSTED_PRODUCT_ID) return { status: "not_mcp_product" };
  if (!deps.token) return { status: "no_token" };

  const fr = await deps.fetchRepo(`https://github.com/${payload.repo_full_name}`, deps.token);
  const manifest: SnapshotManifest = {
    project_name: payload.repo_full_name,
    project_type: "github_repository",
    frameworks: [],
    goals: ["Hosted MCP endpoint"],
    requested_outputs: [],
  };
  const snapshot = await createSnapshot({ input_method: "github_repo_url", manifest, files: fr.files }, payload.account_id);
  await setLatestSnapshot(payload.account_id, payload.product_id, payload.repo_full_name, snapshot.snapshot_id);
  return { status: "synced" };
}

export function defaultMcpHostedSyncDeps(): McpHostedSyncDeps {
  return { token: process.env.GITHUB_TOKEN, fetchRepo: (url, token) => fetchGitHubRepo(url, token) };
}

// ─── JSON-RPC dispatch against an already-resolved snapshot ──────

interface ToolContent {
  content: Array<{ type: "text"; text: string }>;
  isError: boolean;
}

function toolOk(data: unknown): ToolContent {
  return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }], isError: false };
}

function toolError(message: string): ToolContent {
  return { content: [{ type: "text", text: message }], isError: true };
}

/** Tools that require running code — never executed server-side against a subscriber's arbitrary repo; advertised but declined at call time. */
const EXEC_TOOL_NAMES = new Set(["run_build", "run_tests", "type_check", "git_status", "git_diff", "git_log", "nextjs_dev_server", "prisma_studio"]);

function listDirectory(files: FileEntry[], dirPath: string): string[] {
  const prefix = dirPath ? `${dirPath.replace(/\/$/, "")}/` : "";
  const entries = new Set<string>();
  for (const f of files) {
    if (!f.path.startsWith(prefix)) continue;
    const rest = f.path.slice(prefix.length);
    if (!rest) continue;
    const slash = rest.indexOf("/");
    entries.add(slash === -1 ? rest : `${rest.slice(0, slash + 1)}`);
  }
  return [...entries].sort();
}

export function dispatchHosted(method: string, params: unknown, id: string | number | null, snapshot: SnapshotRecord): RpcResponse {
  switch (method) {
    case "initialize":
      return rpcOk(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
        serverInfo: { name: `${snapshot.manifest.project_name}-mcp-hosted`, version: "0.1.0" },
        instructions: `Hosted, read-only MCP endpoint for ${snapshot.manifest.project_name} — re-synced on every push. Filesystem tools (read_file/list_directory/search_files) answer from the latest synced snapshot; build/test/git tools are advertised but return "not available in hosted mode" (self-host via the generated mcp-config.json to run them).`,
      });

    case "notifications/initialized":
    case "notifications/cancelled":
      return rpcOk(id, null);

    case "tools/list": {
      const ctx = buildContextMap(snapshot);
      const profile = buildRepoProfile(snapshot);
      const config = JSON.parse(generateMcpConfig(ctx, profile, snapshot.files).content) as { tools: unknown[] };
      return rpcOk(id, { tools: config.tools });
    }

    case "tools/call": {
      const p = params as Record<string, unknown> | null;
      const name = p?.name;
      const args = (p?.arguments as Record<string, unknown>) ?? {};
      if (typeof name !== "string" || !name) {
        return rpcErr(id, RPC_INVALID_PARAMS, "tools/call requires 'name' as a string");
      }

      if (name === "read_file") {
        if (typeof args.path !== "string") return rpcOk(id, toolError("read_file requires a string 'path' argument"));
        const file = snapshot.files.find((f) => f.path === args.path);
        return rpcOk(id, file ? toolOk(file.content) : toolError(`No file at path "${args.path}" in the latest synced snapshot`));
      }
      if (name === "list_directory") {
        const dirPath = typeof args.path === "string" ? args.path : "";
        return rpcOk(id, toolOk(listDirectory(snapshot.files, dirPath)));
      }
      if (name === "search_files") {
        if (typeof args.pattern !== "string") return rpcOk(id, toolError("search_files requires a string 'pattern' argument"));
        const matches = snapshot.files.map((f) => f.path).filter((path) => path.includes(args.pattern as string)).sort();
        return rpcOk(id, toolOk(matches));
      }
      if (EXEC_TOOL_NAMES.has(name)) {
        return rpcOk(id, toolError(`"${name}" requires running code and is not available on this hosted endpoint — self-host via the generated mcp-config.json to use it.`));
      }
      return rpcErr(id, RPC_METHOD_NOT_FOUND, `Unknown tool "${name}"`);
    }

    case "resources/list":
      return rpcOk(id, {
        resources: [
          { uri: `project://${snapshot.manifest.project_name}/context-map`, name: "Context Map", mimeType: "application/json" },
          { uri: `project://${snapshot.manifest.project_name}/repo-profile`, name: "Repository Profile", mimeType: "application/yaml" },
        ],
      });

    case "resources/read": {
      const p = params as Record<string, unknown> | null;
      const uri = p?.uri;
      if (typeof uri !== "string") return rpcErr(id, RPC_INVALID_PARAMS, "resources/read requires a string 'uri'");
      if (uri.endsWith("/context-map")) {
        const ctx = buildContextMap(snapshot);
        return rpcOk(id, { contents: [{ uri, mimeType: "application/json", text: generateContextMapJSON(ctx, snapshot.files).content }] });
      }
      if (uri.endsWith("/repo-profile")) {
        const profile = buildRepoProfile(snapshot);
        return rpcOk(id, { contents: [{ uri, mimeType: "application/yaml", text: generateRepoProfileYAML(profile, snapshot.files).content }] });
      }
      return rpcErr(id, RPC_INVALID_PARAMS, `Unknown resource uri "${uri}"`);
    }

    default:
      return rpcErr(id, RPC_METHOD_NOT_FOUND, `Unknown method "${method}"`);
  }
}

// ─── HTTP transport ────────────────────────────────────────────────

interface JsonRpcLikeRequest {
  jsonrpc?: string;
  method?: string;
  id?: string | number | null;
  params?: unknown;
}

/** POST /v1/mcp/hosted/:repo* — account comes ONLY from Authorization, never the URL. */
export async function handleMcpHostedPost(req: IncomingMessage, res: ServerResponse, routeParams?: Record<string, string>): Promise<void> {
  const auth = await resolveAuth(req);
  if (auth.anonymous || !auth.account) {
    sendJSON(res, 401, { error: "authentication required — pass Authorization: Bearer <api_key>" });
    return;
  }

  const repoFullName = routeParams?.repo;
  if (!repoFullName) {
    sendJSON(res, 400, { error: "missing repo path — POST /v1/mcp/hosted/<owner>/<repo>" });
    return;
  }

  const sub = await getRepoSubscription(auth.account.account_id, MCP_HOSTED_PRODUCT_ID, repoFullName);
  if (!sub) {
    sendJSON(res, 404, { error: `no mcp subscription for "${repoFullName}" on this account` });
    return;
  }
  if (!sub.latest_snapshot_id) {
    sendJSON(res, 503, { error: `"${repoFullName}" has not synced yet — wait for the first push after subscribing` });
    return;
  }
  const snapshot = await getSnapshot(sub.latest_snapshot_id);
  if (!snapshot) {
    sendJSON(res, 500, { error: "the synced snapshot is missing — internal inconsistency" });
    return;
  }

  let msg: JsonRpcLikeRequest;
  try {
    msg = JSON.parse(await readBody(req)) as JsonRpcLikeRequest;
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify(rpcErr(null, RPC_PARSE_ERROR, "Parse error: invalid JSON")));
    return;
  }
  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify(rpcErr(msg.id ?? null, RPC_INVALID_REQUEST, "Invalid JSON-RPC 2.0 request")));
    return;
  }

  if (msg.id == null && msg.method.startsWith("notifications/")) {
    try {
      dispatchHosted(msg.method, msg.params, null, snapshot);
    } catch {
      /* notifications never respond with an error, even if dispatch throws */
    }
    res.writeHead(202);
    res.end();
    return;
  }

  const id = msg.id ?? null;
  let response: RpcResponse;
  try {
    response = dispatchHosted(msg.method, msg.params, id, snapshot);
  } catch (err) {
    log("error", "mcp_hosted_dispatch_error", { method: msg.method, error: err instanceof Error ? err.message : String(err) });
    response = rpcErr(id, RPC_INTERNAL_ERROR, "Internal error");
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(response));
}
