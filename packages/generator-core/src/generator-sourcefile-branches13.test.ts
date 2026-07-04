import { describe, it, expect } from "vitest";
import { generateFiles } from "./generate.js";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { SnapshotRecord, FileEntry } from "@axis/snapshots";
import type { GeneratorInput } from "./types.js";

/* ─── Fixture Helpers ──────────────────────────────────────────── */

function snap(opts: { name?: string; files?: FileEntry[] } = {}): SnapshotRecord {
  const files = opts.files ?? [{ path: "index.ts", content: 'console.log("hi");', size: 18 }];
  return {
    snapshot_id: "snap-mcp13-001",
    project_id: "proj-mcp13-001",
    created_at: new Date().toISOString(),
    input_method: "repo_snapshot_upload",
    manifest: {
      project_name: opts.name ?? "mcp13-test",
      project_type: "web_application",
      frameworks: [],
      goals: [],
      requested_outputs: [],
    },
    file_count: files.length,
    total_size_bytes: files.reduce((s, f) => s + f.size, 0),
    files,
    status: "ready",
    account_id: null,
  };
}

function input(s: SnapshotRecord, requested: string[]): GeneratorInput {
  return {
    context_map: buildContextMap(s),
    repo_profile: buildRepoProfile(s),
    requested_outputs: requested,
  };
}

function getFile(result: ReturnType<typeof generateFiles>, path: string) {
  return result.files.find(f => f.path === path);
}

function withModels(inp: GeneratorInput): GeneratorInput {
  inp.context_map.domain_models = [
    { name: "User",    kind: "interface", language: "TypeScript", field_count: 6, source_file: "src/user.ts" },
    { name: "Order",   kind: "class",     language: "TypeScript", field_count: 9, source_file: "src/order.ts" },
    { name: "Product", kind: "interface", language: "TypeScript", field_count: 5, source_file: "src/product.ts" },
  ];
  inp.context_map.sql_schema = [
    { name: "users",    column_count: 6,  foreign_key_count: 0 },
    { name: "orders",   column_count: 10, foreign_key_count: 2 },
    { name: "products", column_count: 8,  foreign_key_count: 1 },
  ];
  return inp;
}

// ─── generateMcpConfig — domain_models enrichment ───────────────

describe("mcp-config.json — domain_models enrichment", () => {
  it("includes domain_models in config when models exist", () => {
    const s = snap();
    const inp = withModels(input(s, ["mcp-config.json"]));
    const result = generateFiles(inp);
    const file = getFile(result, "mcp-config.json")!;
    const data = JSON.parse(file.content);
    expect(data.domain_models).toBeDefined();
    expect(Array.isArray(data.domain_models)).toBe(true);
    expect(data.domain_models.length).toBe(3);
  });

  it("domain_models entries have name, kind, field_count, source_file, resource_uri", () => {
    const s = snap();
    const inp = withModels(input(s, ["mcp-config.json"]));
    const result = generateFiles(inp);
    const data = JSON.parse(getFile(result, "mcp-config.json")!.content);
    const user = data.domain_models.find((m: { name: string }) => m.name === "User");
    expect(user).toBeDefined();
    expect(user.kind).toBe("interface");
    expect(user.field_count).toBe(6);
    expect(user.source_file).toBe("src/user.ts");
    expect(user.resource_uri).toContain("User");
    expect(user.resource_uri).toContain("model://");
  });

  it("domain_models null when no models", () => {
    const s = snap();
    const inp = input(s, ["mcp-config.json"]);
    const result = generateFiles(inp);
    const data = JSON.parse(getFile(result, "mcp-config.json")!.content);
    expect(data.domain_models).toBeNull();
  });

  it("resources array includes model:// URIs for each domain model", () => {
    const s = snap();
    const inp = withModels(input(s, ["mcp-config.json"]));
    const result = generateFiles(inp);
    const data = JSON.parse(getFile(result, "mcp-config.json")!.content);
    const modelUris = (data.resources as Array<{ uri: string }>).filter(r => r.uri.startsWith("model://"));
    expect(modelUris.length).toBe(3);
    expect(modelUris.some(r => r.uri.includes("User"))).toBe(true);
    expect(modelUris.some(r => r.uri.includes("Order"))).toBe(true);
  });

  it("model:// resource entries have name and description", () => {
    const s = snap();
    const inp = withModels(input(s, ["mcp-config.json"]));
    const result = generateFiles(inp);
    const data = JSON.parse(getFile(result, "mcp-config.json")!.content);
    const userResource = (data.resources as Array<{ uri: string; name: string; description: string; mimeType: string }>)
      .find(r => r.uri.includes("User"));
    expect(userResource).toBeDefined();
    expect(userResource!.name).toBe("User");
    expect(userResource!.description).toContain("6 fields");
    expect(userResource!.mimeType).toBe("application/json");
  });

  it("sql_schema in config when tables exist", () => {
    const s = snap();
    const inp = withModels(input(s, ["mcp-config.json"]));
    const result = generateFiles(inp);
    const data = JSON.parse(getFile(result, "mcp-config.json")!.content);
    expect(data.sql_schema).toBeDefined();
    expect(Array.isArray(data.sql_schema)).toBe(true);
    expect(data.sql_schema.length).toBe(3);
    const users = data.sql_schema.find((t: { table: string }) => t.table === "users");
    expect(users).toBeDefined();
    expect(users.columns).toBe(6);
    expect(users.foreign_keys).toBe(0);
  });

  it("sql_schema null when no tables", () => {
    const s = snap();
    const inp = input(s, ["mcp-config.json"]);
    const result = generateFiles(inp);
    const data = JSON.parse(getFile(result, "mcp-config.json")!.content);
    expect(data.sql_schema).toBeNull();
  });

  it("resources list still includes context-map and repo-profile URIs", () => {
    const s = snap();
    const inp = withModels(input(s, ["mcp-config.json"]));
    const result = generateFiles(inp);
    const data = JSON.parse(getFile(result, "mcp-config.json")!.content);
    const uris = (data.resources as Array<{ uri: string }>).map(r => r.uri);
    expect(uris.some(u => u.includes("context-map"))).toBe(true);
    expect(uris.some(u => u.includes("repo-profile"))).toBe(true);
  });

  it("capped at 15 model resources even with >15 models", () => {
    const s = snap();
    const inp = input(s, ["mcp-config.json"]);
    inp.context_map.domain_models = Array.from({ length: 25 }, (_, i) => ({
      name: `Model${i}`,
      kind: "interface" as const,
      language: "TypeScript",
      field_count: 3,
      source_file: `src/model${i}.ts`,
    }));
    const result = generateFiles(inp);
    const data = JSON.parse(getFile(result, "mcp-config.json")!.content);
    const modelUris = (data.resources as Array<{ uri: string }>).filter(r => r.uri.startsWith("model://"));
    expect(modelUris.length).toBeLessThanOrEqual(15);
    // domain_models key is capped at 20
    expect(data.domain_models.length).toBeLessThanOrEqual(20);
  });
});

// ─── server-manifest.yaml — domain_models enrichment ────────────

describe("server-manifest.yaml — domain_models enrichment", () => {
  it("includes query_{model} tools when domain_models exist", () => {
    const s = snap();
    const inp = withModels(input(s, ["server-manifest.yaml"]));
    const result = generateFiles(inp);
    const file = getFile(result, "server-manifest.yaml")!;
    expect(file.content).toContain("query_user");
    expect(file.content).toContain("query_order");
    expect(file.content).toContain("query_product");
  });

  it("query tool has input_schema with id and filter properties", () => {
    const s = snap();
    const inp = withModels(input(s, ["server-manifest.yaml"]));
    const result = generateFiles(inp);
    const content = getFile(result, "server-manifest.yaml")!.content;
    expect(content).toContain("input_schema:");
    expect(content).toContain("filter:");
  });

  it("includes model:// resource URIs when domain_models exist", () => {
    const s = snap();
    const inp = withModels(input(s, ["server-manifest.yaml"]));
    const result = generateFiles(inp);
    const content = getFile(result, "server-manifest.yaml")!.content;
    // The uri scalar is now yamlFlowScalar-quoted (injection hardening): the
    // `model://` colon triggers conservative quoting. Still valid YAML, same
    // parsed value — assert the quoted serialization.
    expect(content).toContain('uri: "model://User"');
    expect(content).toContain('uri: "model://Order"');
  });

  it("model resources have mime_type and description", () => {
    const s = snap();
    const inp = withModels(input(s, ["server-manifest.yaml"]));
    const result = generateFiles(inp);
    const content = getFile(result, "server-manifest.yaml")!.content;
    expect(content).toContain("mime_type: application/json");
    expect(content).toContain("6 fields");
  });

  it("no query tools or model resources when domain_models empty", () => {
    const s = snap();
    const inp = input(s, ["server-manifest.yaml"]);
    const result = generateFiles(inp);
    const content = getFile(result, "server-manifest.yaml")!.content;
    expect(content).not.toContain("query_");
    expect(content).not.toContain("uri: model://");
  });

  it("still includes generic resources regardless of domain_models", () => {
    const s = snap();
    const inp = withModels(input(s, ["server-manifest.yaml"]));
    const result = generateFiles(inp);
    const content = getFile(result, "server-manifest.yaml")!.content;
    expect(content).toContain("project://context-map");
    expect(content).toContain("project://repo-profile");
    expect(content).toContain("project://architecture-summary");
  });

  it("query tool description includes kind and field count", () => {
    const s = snap();
    const inp = withModels(input(s, ["server-manifest.yaml"]));
    const result = generateFiles(inp);
    const content = getFile(result, "server-manifest.yaml")!.content;
    expect(content).toContain("interface");
    expect(content).toContain("6 fields");
  });

  it("capped at 12 query tools even with >12 models", () => {
    const s = snap();
    const inp = input(s, ["server-manifest.yaml"]);
    inp.context_map.domain_models = Array.from({ length: 20 }, (_, i) => ({
      name: `Model${i}`,
      kind: "interface" as const,
      language: "TypeScript",
      field_count: 3,
      source_file: `src/model${i}.ts`,
    }));
    const result = generateFiles(inp);
    const content = getFile(result, "server-manifest.yaml")!.content;
    const queryMatches = [...content.matchAll(/name: query_/g)];
    expect(queryMatches.length).toBeLessThanOrEqual(12);
  });
});
