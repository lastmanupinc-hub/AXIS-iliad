import { describe, it, expect } from "vitest";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import {
  generateAgentPurchasingPlaybook,
  generateProductSchema,
  generateCheckoutFlow,
  generateNegotiationRules,
  generateCommerceRegistry,
} from "./generators-agentic-purchasing.js";

// Every markdown/HTML/code breakout character in one string.
const PAY = 'INJ*/x-->y\n## HEAD "q`z </script> <b> ({[}])';

// Payment-signal-laden files so the provider tables / has_* branches all fire
// (provider names are a bounded keyset, so these are safe — they only broaden coverage).
const files: SourceFile[] = [
  { path: `src/pay${PAY}.ts`, content: "stripe paypal checkout subscription 3ds sca dispute chargeback webhook network-token dpan mandate-id tap-protocol", size: 120 } as SourceFile,
  { path: "README.md", content: "x", size: 5 } as SourceFile,
];

// separation_score is a number (safe); negotiation-rules reads profile.health.separation_score.
const profile = { health: { separation_score: 0.8 } } as RepoProfile;

function hostileCtx(over: Partial<ContextMap> = {}): ContextMap {
  return {
    version: "1.0.0", snapshot_id: `snap${PAY}`, project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: `App${PAY}`, type: `mono${PAY}`, primary_language: `TypeScript${PAY}`, description: `desc${PAY}`, repo_url: null, go_module: null },
    structure: { total_files: 5, total_directories: 2, total_loc: 1234, file_tree_summary: [] as ContextMap["structure"]["file_tree_summary"], top_level_layout: [] },
    detection: {
      languages: [{ name: `TypeScript${PAY}`, file_count: 5, loc: 1234, loc_percent: 90 }] as ContextMap["detection"]["languages"],
      frameworks: [{ name: `React${PAY}`, version: `19${PAY}`, confidence: 0.9, evidence: [] }] as ContextMap["detection"]["frameworks"],
      build_tools: [], test_frameworks: [], package_managers: [], ci_platform: null, deployment_target: null,
    },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [], routes: [], domain_models: [], sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.8 },
    ai_context: { project_summary: `A project${PAY}`, key_abstractions: [], conventions: [], warnings: [] } as ContextMap["ai_context"],
    ...over,
  } as ContextMap;
}

// Strip fenced code blocks so a payload sitting inside a ``` fence can't be mistaken
// for a forged structural line.
function stripFences(content: string): string {
  const out: string[] = []; let fence: string | null = null;
  for (const line of content.split("\n")) {
    const run = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
    if (fence) { if (run && run[0] === fence[0] && run.length >= fence.length && line.trim() === run) fence = null; continue; }
    if (run) { fence = run; continue; }
    out.push(line);
  }
  return out.join("\n");
}

function assertContained(content: string) {
  for (const l of stripFences(content).split("\n")) {
    expect(l).not.toMatch(/^\s*#{1,6}\s+(INJ|HEAD)/); // no forged heading
    expect(l).not.toMatch(/^\s*HEAD\b/);
  }
  expect((content.match(/^```/gm) ?? []).length % 2).toBe(0); // balanced fences
}

describe("agentic-purchasing markdown — injection containment", () => {
  it("agent-purchasing-playbook.md: hostile name/type/lang/frameworks forge no heading, fences balance", () => {
    assertContained(generateAgentPurchasingPlaybook(hostileCtx(), profile, files).content);
  });
  it("checkout-flow.md: hostile name forges no heading, fences balance", () => {
    assertContained(generateCheckoutFlow(hostileCtx(), profile, files).content);
  });
  it("negotiation-rules.md: hostile name forges no heading, fences balance", () => {
    assertContained(generateNegotiationRules(hostileCtx(), profile, files).content);
  });
});

describe("agentic-purchasing JSON — valid under hostile input", () => {
  it("product-schema.json + commerce-registry.json parse as JSON", () => {
    expect(() => JSON.parse(generateProductSchema(hostileCtx(), profile, files).content)).not.toThrow();
    expect(() => JSON.parse(generateCommerceRegistry(hostileCtx(), profile, files).content)).not.toThrow();
  });
  it("commerce-registry root has no forged top-level key from the hostile name", () => {
    const reg = JSON.parse(generateCommerceRegistry(hostileCtx(), profile, files).content) as Record<string, unknown>;
    // the hostile name lands in a string value, never a structural key
    expect(JSON.stringify(Object.keys(reg))).not.toContain("INJ");
  });
});

describe("agentic-purchasing — deterministic under hostile input", () => {
  it("all five generators are byte-stable across two runs", () => {
    const c = hostileCtx();
    expect(generateAgentPurchasingPlaybook(c, profile, files).content).toBe(generateAgentPurchasingPlaybook(c, profile, files).content);
    expect(generateProductSchema(c, profile, files).content).toBe(generateProductSchema(c, profile, files).content);
    expect(generateCheckoutFlow(c, profile, files).content).toBe(generateCheckoutFlow(c, profile, files).content);
    expect(generateNegotiationRules(c, profile, files).content).toBe(generateNegotiationRules(c, profile, files).content);
    expect(generateCommerceRegistry(c, profile, files).content).toBe(generateCommerceRegistry(c, profile, files).content);
  });
});
