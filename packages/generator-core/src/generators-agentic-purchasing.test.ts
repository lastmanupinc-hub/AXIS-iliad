import { describe, it, expect } from "vitest";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { SnapshotRecord, FileEntry } from "@axis/snapshots";
import {
  generateAgentPurchasingPlaybook,
  generateProductSchema,
  generateCheckoutFlow,
  generateNegotiationRules,
  generateCommerceRegistry,
} from "./generators-agentic-purchasing.js";

function makeSnapshot(overrides: Partial<SnapshotRecord> = {}): SnapshotRecord {
  const files: FileEntry[] = [
    { path: "src/index.ts", content: 'import { db } from "./db";\nexport function main() { return db.query(); }', size: 70 },
    { path: "src/db.ts", content: 'export const db = { query: () => [] };', size: 38 },
    { path: "next.config.mjs", content: "export default {}", size: 18 },
    { path: "package.json", content: '{"name":"axis-test","dependencies":{"next":"14.0.0","react":"18.0.0"}}', size: 72 },
    { path: "app/page.tsx", content: "export default function Home() { return <div>Home</div> }", size: 58 },
    { path: ".github/workflows/ci.yml", content: "name: CI\non: [push]", size: 20 },
    { path: "tsconfig.json", content: '{"compilerOptions":{"strict":true}}', size: 34 },
  ];
  return {
    snapshot_id: "snap-ap-001",
    project_id: "proj-ap-001",
    created_at: new Date().toISOString(),
    input_method: "api_submission",
    manifest: {
      project_name: "axis-test",
      project_type: "web_application",
      frameworks: ["next", "react"],
      goals: ["Generate AI context files"],
      requested_outputs: [],
    },
    file_count: files.length,
    total_size_bytes: files.reduce((s, f) => s + f.size, 0),
    files,
    status: "ready",
    account_id: null,
    ...overrides,
  };
}

describe("generateAgentPurchasingPlaybook", () => {
  const snapshot = makeSnapshot();
  const ctx = buildContextMap(snapshot);
  const profile = buildRepoProfile(snapshot);

  it("returns a GeneratedFile with correct path and program", () => {
    const file = generateAgentPurchasingPlaybook(ctx, profile);
    expect(file.path).toBe("agent-purchasing-playbook.md");
    expect(file.program).toBe("agentic-purchasing");
    expect(file.content_type).toBe("text/markdown");
    expect(file.description).toBeTruthy();
  });

  it("content contains project name and MCP endpoint", () => {
    const file = generateAgentPurchasingPlaybook(ctx, profile);
    expect(file.content).toContain("axis-test");
    expect(file.content).toContain("POST /mcp");
  });

  it("content includes step-by-step purchasing flow", () => {
    const file = generateAgentPurchasingPlaybook(ctx, profile);
    expect(file.content).toContain("Step 1");
    expect(file.content).toContain("Step 2");
    expect(file.content).toContain("Step 3");
    expect(file.content).toContain("Step 4");
  });

  it("content includes free and pro program classification", () => {
    const file = generateAgentPurchasingPlaybook(ctx, profile);
    expect(file.content).toContain("free");
    expect(file.content).toContain("pro");
    expect(file.content).toContain("skills");
    expect(file.content).toContain("debug");
  });

  it("includes framework recommendations when frameworks detected", () => {
    const file = generateAgentPurchasingPlaybook(ctx, profile);
    // next.js detected → frontend mention
    expect(file.content).toContain("**frontend**");
  });

  it("content includes autonomous purchase decision rules", () => {
    const file = generateAgentPurchasingPlaybook(ctx, profile);
    expect(file.content).toContain("SHOULD purchase");
    expect(file.content).toContain("SHOULD NOT");
  });
});

describe("generateProductSchema", () => {
  const snapshot = makeSnapshot();
  const ctx = buildContextMap(snapshot);
  const profile = buildRepoProfile(snapshot);

  it("returns a GeneratedFile with correct path and program", () => {
    const file = generateProductSchema(ctx, profile);
    expect(file.path).toBe("product-schema.json");
    expect(file.program).toBe("agentic-purchasing");
    expect(file.content_type).toBe("application/json");
    expect(file.description).toBeTruthy();
  });

  it("content is valid JSON", () => {
    const file = generateProductSchema(ctx, profile);
    expect(() => JSON.parse(file.content)).not.toThrow();
  });

  it("schema includes all 18 programs", () => {
    const file = generateProductSchema(ctx, profile);
    const schema = JSON.parse(file.content);
    expect(schema.programs).toHaveLength(18);
    expect(schema.total_programs).toBe(18);
    expect(schema.total_outputs).toBe(87);
  });

  it("schema includes required structural fields", () => {
    const file = generateProductSchema(ctx, profile);
    const schema = JSON.parse(file.content);
    expect(schema.schema_version).toBe("1.0");
    expect(schema.product).toBe("AXIS Toolbox");
    expect(schema.mcp_endpoint).toBe("POST /mcp");
    expect(schema.auth).toBeTruthy();
    expect(schema.auth.type).toBe("bearer");
  });

  it("schema programs have required fields", () => {
    const file = generateProductSchema(ctx, profile);
    const schema = JSON.parse(file.content);
    for (const program of schema.programs) {
      expect(program.slug).toBeTruthy();
      expect(["free", "pro"]).toContain(program.tier);
      expect(typeof program.outputs).toBe("number");
      expect(program.description).toBeTruthy();
    }
  });

  it("schema includes agentic-purchasing entry", () => {
    const file = generateProductSchema(ctx, profile);
    const schema = JSON.parse(file.content);
    const ap = schema.programs.find((p: { slug: string }) => p.slug === "agentic-purchasing");
    expect(ap).toBeTruthy();
    expect(ap.tier).toBe("pro");
    expect(ap.outputs).toBe(5);
  });
});

describe("generateCheckoutFlow", () => {
  const snapshot = makeSnapshot();
  const ctx = buildContextMap(snapshot);
  const profile = buildRepoProfile(snapshot);

  it("returns a GeneratedFile with correct path and program", () => {
    const file = generateCheckoutFlow(ctx, profile);
    expect(file.path).toBe("checkout-flow.md");
    expect(file.program).toBe("agentic-purchasing");
    expect(file.content_type).toBe("text/markdown");
    expect(file.description).toBeTruthy();
  });

  it("content contains project name", () => {
    const file = generateCheckoutFlow(ctx, profile);
    expect(file.content).toContain("axis-test");
  });

  it("content includes decision tree steps", () => {
    const file = generateCheckoutFlow(ctx, profile);
    expect(file.content).toContain("Intent Validation");
    expect(file.content).toContain("Program Selection");
    expect(file.content).toContain("API Call Sequence");
    expect(file.content).toContain("Post-Purchase Verification");
  });

  it("content includes all API call steps", () => {
    const file = generateCheckoutFlow(ctx, profile);
    expect(file.content).toContain("Step 1:");
    expect(file.content).toContain("Step 2:");
    expect(file.content).toContain("analyze_repo");
  });

  it("content includes error recovery table", () => {
    const file = generateCheckoutFlow(ctx, profile);
    expect(file.content).toContain("401");
    expect(file.content).toContain("429");
    expect(file.content).toContain("404 Snapshot Not Found");
    expect(file.content).toContain("Quota Exceeded");
  });

  it("content includes agent authorization policy", () => {
    const file = generateCheckoutFlow(ctx, profile);
    expect(file.content).toContain("pro");
    expect(file.content).toContain("free");
    expect(file.content).toContain("bearer");
  });
});

describe("generateNegotiationRules", () => {
  const snapshot = makeSnapshot();
  const ctx = buildContextMap(snapshot);
  const profile = buildRepoProfile(snapshot);

  it("returns a GeneratedFile with correct path and program", () => {
    const file = generateNegotiationRules(ctx, profile);
    expect(file.path).toBe("negotiation-rules.md");
    expect(file.program).toBe("agentic-purchasing");
    expect(file.content_type).toBe("text/markdown");
    expect(file.description).toBeTruthy();
  });

  it("content contains project name and complexity estimate", () => {
    const file = generateNegotiationRules(ctx, profile);
    expect(file.content).toContain("axis-test");
    expect(file.content).toMatch(/low|medium|high/);
  });

  it("content includes value assessment formula", () => {
    const file = generateNegotiationRules(ctx, profile);
    expect(file.content).toContain("value_score");
    expect(file.content).toContain("Estimated value score");
  });

  it("content includes purchase decision rules", () => {
    const file = generateNegotiationRules(ctx, profile);
    expect(file.content).toContain("Automatic APPROVE");
    expect(file.content).toContain("Automatic REJECT");
    expect(file.content).toContain("Negotiate");
  });

  it("content includes comparison matrix", () => {
    const file = generateNegotiationRules(ctx, profile);
    expect(file.content).toContain("Comparison Matrix");
    expect(file.content).toContain("AXIS analyze");
    expect(file.content).toContain("Manual grep");
  });

  it("content includes agent accountability section", () => {
    const file = generateNegotiationRules(ctx, profile);
    expect(file.content).toContain("Agent Accountability");
    expect(file.content).toContain("snapshot_id");
  });

  it("uses 'high' complexity when profile has >2 risk flags", () => {
    const richSnapshot = makeSnapshot({
      manifest: {
        project_name: "axis-test",
        project_type: "web_application",
        frameworks: ["next", "react"],
        goals: [],
        requested_outputs: [],
      },
    });
    const richCtx = buildContextMap(richSnapshot);
    const richProfile = buildRepoProfile(richSnapshot);
    // Inject low separation_score for high-complexity branch
    const flaggedProfile = { ...richProfile, health: { ...richProfile.health, separation_score: 0.1 } };
    const file = generateNegotiationRules(richCtx, flaggedProfile);
    expect(file.content).toContain("high");
  });

  it("uses 'medium' complexity when profile has 1-2 risk flags", () => {
    const profile2 = buildRepoProfile(makeSnapshot());
    const flaggedProfile = { ...profile2, health: { ...profile2.health, separation_score: 0.5 } };
    const file = generateNegotiationRules(ctx, flaggedProfile);
    expect(file.content).toContain("medium");
  });
});

describe("generateCommerceRegistry", () => {
  const snapshot = makeSnapshot();
  const ctx = buildContextMap(snapshot);
  const profile = buildRepoProfile(snapshot);

  it("returns a GeneratedFile with correct path and program", () => {
    const file = generateCommerceRegistry(ctx, profile);
    expect(file.path).toBe("commerce-registry.json");
    expect(file.program).toBe("agentic-purchasing");
    expect(file.content_type).toBe("application/json");
    expect(file.description).toBeTruthy();
  });

  it("content is valid JSON", () => {
    const file = generateCommerceRegistry(ctx, profile);
    expect(() => JSON.parse(file.content)).not.toThrow();
  });

  it("registry has required top-level fields", () => {
    const file = generateCommerceRegistry(ctx, profile);
    const registry = JSON.parse(file.content);
    expect(registry.registry_version).toBe("1.0");
    expect(registry.product).toBe("AXIS Toolbox");
    expect(registry.mcp_endpoint).toBe("POST /mcp");
    expect(registry.auth).toBeTruthy();
    expect(registry.auth.type).toBe("bearer");
    expect(registry.catalog).toBeInstanceOf(Array);
    expect(registry.agent_endpoints).toBeInstanceOf(Array);
  });

  it("registry contains project name", () => {
    const file = generateCommerceRegistry(ctx, profile);
    const registry = JSON.parse(file.content);
    expect(registry.project).toBe("axis-test");
  });

  it("catalog includes free and pro bundles", () => {
    const file = generateCommerceRegistry(ctx, profile);
    const registry = JSON.parse(file.content);
    const freeBundle = registry.catalog.find((c: { id: string }) => c.id === "free-bundle");
    const proAll = registry.catalog.find((c: { id: string }) => c.id === "pro-all");
    expect(freeBundle).toBeTruthy();
    expect(proAll).toBeTruthy();
    expect(freeBundle.tier).toBe("free");
    expect(proAll.tier).toBe("pro");
  });

  it("agent_endpoints includes MCP endpoint", () => {
    const file = generateCommerceRegistry(ctx, profile);
    const registry = JSON.parse(file.content);
    const mcpEndpoint = registry.agent_endpoints.find(
      (e: { path: string }) => e.path === "/mcp"
    );
    expect(mcpEndpoint).toBeTruthy();
    expect(mcpEndpoint.method).toBe("POST");
  });

  it("auth has obtain instructions", () => {
    const file = generateCommerceRegistry(ctx, profile);
    const registry = JSON.parse(file.content);
    expect(registry.auth.obtain).toContain("raw_key");
    expect(registry.auth.format).toContain("Bearer");
  });
});
