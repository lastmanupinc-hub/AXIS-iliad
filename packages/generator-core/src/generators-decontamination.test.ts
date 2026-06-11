/**
 * Decontamination regression guards.
 *
 * Two adversarial-review findings removed marketing content from
 * machine-readable pipeline outputs:
 *  - capability-map.yaml carried 14 `axis_advantages` blocks with invented
 *    wholesale-cost figures / margin multipliers and competitor-disparaging
 *    claims, plus stale-prone third-party `retail_pricing` snapshots.
 *  - product-schema.json carried a promotional `axis_advantage` price pitch
 *    inside agent_sca_optimization.
 *
 * These tests pin the outputs clean so the content cannot drift back in.
 */
import { describe, it, expect } from "vitest";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { SnapshotRecord, FileEntry } from "@axis/snapshots";
import { generateCapabilityMap } from "./generators-artifacts.js";
import { generateProductSchema } from "./generators-agentic-purchasing.js";

function makeSnapshot(): SnapshotRecord {
  const files: FileEntry[] = [
    { path: "src/index.ts", content: 'export function main() { return 1; }', size: 36 },
    { path: "package.json", content: '{"name":"decon-test","dependencies":{"react":"18.0.0","openai":"4.0.0"}}', size: 74 },
    { path: ".github/workflows/ci.yml", content: "name: CI\non: [push]", size: 20 },
    { path: "tsconfig.json", content: '{"compilerOptions":{"strict":true}}', size: 34 },
  ];
  return {
    snapshot_id: "snap-decon-001",
    project_id: "proj-decon-001",
    created_at: "2025-01-01T00:00:00.000Z",
    input_method: "api_submission",
    manifest: {
      project_name: "decon-test",
      project_type: "library",
      frameworks: ["react"],
      goals: ["Generate AI context files"],
      requested_outputs: [],
    },
    file_count: files.length,
    total_size_bytes: files.reduce((s, f) => s + f.size, 0),
    files,
    status: "ready",
    account_id: null,
  };
}

const snapshot = makeSnapshot();
const ctx = buildContextMap(snapshot);
const profile = buildRepoProfile(snapshot);
const sourceFiles = snapshot.files.map((f) => ({ path: f.path, content: f.content }));

describe("capability-map.yaml decontamination", () => {
  const file = generateCapabilityMap(ctx, profile, sourceFiles);

  it("contains no axis_advantages marketing blocks", () => {
    expect(file.content).not.toContain("axis_advantages");
    expect(file.description).not.toContain("advantages");
  });

  it("contains no third-party retail_pricing snapshots", () => {
    expect(file.content).not.toContain("retail_pricing");
  });

  it("contains no fabricated cost/margin claims", () => {
    expect(file.content).not.toMatch(/wholesale/i);
    expect(file.content).not.toMatch(/pure margin/i);
    expect(file.content).not.toMatch(/\d+× margin/);
  });

  it("still emits the capability catalog itself", () => {
    expect(file.path).toBe("capability-map.yaml");
    expect(file.content).toContain("capabilities:");
    expect(file.content).toContain("replication_plan:");
    expect(file.content).toContain("third_party_providers:");
    expect(file.content).toContain("recommended_next_owned:");
  });

  it("recommended_next_owned section carries no marketing language", () => {
    // The section may be empty when no capability is in a planned_* status;
    // when reasons are emitted they come from the neutral capability summary.
    const summarySection = file.content.split("recommended_next_owned:")[1] ?? "";
    expect(summarySection).not.toMatch(/margin|wholesale|retail/i);
  });
});

describe("product-schema.json decontamination", () => {
  const file = generateProductSchema(ctx, profile, sourceFiles);
  const schema = JSON.parse(file.content) as Record<string, unknown>;

  it("agent_sca_optimization carries no promotional axis_advantage field", () => {
    const commerce = schema.repo_commerce_profile as Record<string, unknown>;
    const sca = commerce.agent_sca_optimization as Record<string, unknown>;
    expect(sca).toBeDefined();
    expect(sca.axis_advantage).toBeUndefined();
    expect(file.content).not.toContain("axis_advantage");
  });

  it("keeps the neutral SCA optimization fields intact", () => {
    const commerce = schema.repo_commerce_profile as Record<string, unknown>;
    const sca = commerce.agent_sca_optimization as Record<string, unknown>;
    expect(sca.frictionless_first).toBe(true);
    expect(sca.exemption_priority).toContain("low_value");
    expect(sca.challenge_escalation).toBe("abort_agent_flow_escalate_to_operator");
  });
});
