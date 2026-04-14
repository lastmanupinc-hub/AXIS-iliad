/**
 * @axis/sdk — Typed TypeScript client for the AXIS Toolbox API.
 *
 * Usage:
 *   import { AxisClient } from "@axis/sdk";
 *   const axis = new AxisClient({ apiKey: "ax_..." });
 *   const snap = await axis.analyzeFiles({ ... });
 *   const artifact = await axis.getArtifact(snap.snapshot_id, "AGENTS.md");
 */

// ─── Types ──────────────────────────────────────────────────────

export interface AxisClientOptions {
  /** API base URL. Defaults to production. */
  baseUrl?: string;
  /** API key (ax_...). Required for authenticated endpoints. */
  apiKey?: string;
  /** Request timeout in ms. Default 30000. */
  timeout?: number;
}

export interface FileEntry {
  path: string;
  content: string;
}

export interface AnalyzeFilesInput {
  project_name: string;
  project_type: string;
  frameworks: string[];
  goals: string[];
  files: FileEntry[];
}

export interface AnalyzeRepoInput {
  github_url: string;
}

export interface ArtifactEntry {
  path: string;
  program: string;
  description: string;
}

export interface SnapshotResult {
  snapshot_id: string;
  project_id: string;
  status: string;
  artifact_count: number;
  artifacts: ArtifactEntry[];
  programs_executed: string[];
  [key: string]: unknown;
}

export interface HealthResponse {
  status: string;
  version?: string;
  uptime_seconds?: number;
  [key: string]: unknown;
}

export interface McpToolCallResult {
  isError: boolean;
  text: string;
  _usage?: {
    tier: string;
    credits_remaining: number | null;
    tool: string;
  };
}

export interface OpenApiSpec {
  openapi: string;
  info: { title: string; version: string; description?: string };
  paths: Record<string, unknown>;
  [key: string]: unknown;
}

// ─── Client ─────────────────────────────────────────────────────

const DEFAULT_BASE = "https://axis-api-6c7z.onrender.com";

export class AxisClient {
  private readonly base: string;
  private readonly apiKey: string | undefined;
  private readonly timeout: number;

  constructor(opts: AxisClientOptions = {}) {
    this.base = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, "");
    this.apiKey = opts.apiKey;
    this.timeout = opts.timeout ?? 30_000;
  }

  // ── Internal fetch ──────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;

    const res = await fetch(`${this.base}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const text = await res.text();
        const json = JSON.parse(text);
        if (json.error) msg = json.error;
        else if (json.message) msg = json.message;
      } catch { /* use default msg */ }
      throw new Error(msg);
    }

    return res.json() as Promise<T>;
  }

  private async mcpCall(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<McpToolCallResult> {
    const rpc = await this.request<{
      result: {
        content: Array<{ text: string }>;
        isError?: boolean;
        _usage?: McpToolCallResult["_usage"];
      };
    }>("POST", "/mcp", {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    });

    return {
      isError: !!rpc.result.isError,
      text: rpc.result.content[0]?.text ?? "",
      _usage: rpc.result._usage,
    };
  }

  // ── Health ──────────────────────────────────────────────────

  async health(): Promise<HealthResponse> {
    return this.request("GET", "/v1/health");
  }

  async healthLive(): Promise<HealthResponse> {
    return this.request("GET", "/v1/health/live");
  }

  async healthReady(): Promise<HealthResponse> {
    return this.request("GET", "/v1/health/ready");
  }

  // ── Analysis ────────────────────────────────────────────────

  async analyzeFiles(input: AnalyzeFilesInput): Promise<SnapshotResult> {
    const result = await this.mcpCall("analyze_files", input as unknown as Record<string, unknown>);
    if (result.isError) throw new Error(result.text);
    return JSON.parse(result.text) as SnapshotResult;
  }

  async analyzeRepo(input: AnalyzeRepoInput): Promise<SnapshotResult> {
    const result = await this.mcpCall("analyze_repo", input as unknown as Record<string, unknown>);
    if (result.isError) throw new Error(result.text);
    return JSON.parse(result.text) as SnapshotResult;
  }

  // ── Snapshot & Artifact ─────────────────────────────────────

  async getSnapshot(snapshotId: string): Promise<Record<string, unknown>> {
    const result = await this.mcpCall("get_snapshot", { snapshot_id: snapshotId });
    if (result.isError) throw new Error(result.text);
    return JSON.parse(result.text) as Record<string, unknown>;
  }

  async getArtifact(snapshotId: string, path: string): Promise<string> {
    const result = await this.mcpCall("get_artifact", { snapshot_id: snapshotId, path });
    if (result.isError) throw new Error(result.text);
    return result.text;
  }

  // ── Discovery (no auth required) ───────────────────────────

  async listPrograms(): Promise<string> {
    const result = await this.mcpCall("list_programs", {});
    return result.text;
  }

  async searchTools(query?: string): Promise<string> {
    const result = await this.mcpCall("search_and_discover_tools", query ? { q: query } : {});
    return result.text;
  }

  async discoverCommerceTools(): Promise<string> {
    const result = await this.mcpCall("discover_agentic_commerce_tools", {});
    return result.text;
  }

  // ── OpenAPI ─────────────────────────────────────────────────

  async docs(): Promise<OpenApiSpec> {
    return this.request("GET", "/v1/docs");
  }

  // ── Probe ───────────────────────────────────────────────────

  async probeIntent(intent: string, description: string): Promise<Record<string, unknown>> {
    return this.request("POST", "/probe-intent", { intent, description });
  }
}
