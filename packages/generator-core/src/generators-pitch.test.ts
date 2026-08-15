import { describe, it, expect } from "vitest";
import { generatePitchDeck, generatePitchDeckJson, generateSlideArtPrompts } from "./generators-pitch.js";
import type { ContextMap } from "@axis/context-engine";
import type { SourceFile } from "./types.js";

// Minimal honest ContextMap fixture: a repo with 3 real routes, 1 model, no tests.
function ctxFixture(over?: Partial<ContextMap>): ContextMap {
  return {
    version: "1.0.0",
    snapshot_id: "snap-1",
    project_id: "proj-1",
    generated_at: "2026-01-01T00:00:00.000Z",
    project_identity: {
      name: "acme-api",
      type: "web_service",
      primary_language: "TypeScript",
      description: "Invoice API for small businesses",
      repo_url: null,
      go_module: null,
    },
    structure: {
      total_files: 12,
      total_directories: 3,
      total_loc: 900,
      file_tree_summary: [
        { path: "src/index.ts", type: "file", language: "TypeScript", loc: 300, role: "source" },
        { path: "src/routes.ts", type: "file", language: "TypeScript", loc: 300, role: "source" },
      ],
      top_level_layout: [{ name: "src", purpose: "application_source", file_count: 12 }],
    },
    detection: {
      languages: [{ name: "TypeScript", loc: 900, percentage: 100 }] as ContextMap["detection"]["languages"],
      frameworks: [] as ContextMap["detection"]["frameworks"],
      build_tools: [],
      test_frameworks: [],
      package_managers: ["npm"],
      ci_platform: null,
      deployment_target: null,
    },
    dependency_graph: { external_dependencies: [] as never, internal_imports: [] as never, hotspots: [] },
    entry_points: [{ path: "src/index.ts", type: "app_entry", description: "Application entry point" }],
    routes: [
      { path: "/invoices", method: "GET", source_file: "src/routes.ts" },
      { path: "/invoices", method: "POST", source_file: "src/routes.ts" },
      { path: "/health", method: "GET", source_file: "src/routes.ts" },
    ],
    domain_models: [{ name: "Invoice", kind: "interface", language: "TypeScript", field_count: 5, source_file: "src/models.ts" }],
    sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.7 },
    ai_context: {
      project_summary: "acme-api is a web service built with TypeScript.",
      key_abstractions: [],
      conventions: [],
      warnings: ["No test files detected", "No CI/CD pipeline detected"],
    },
    ...over,
  } as ContextMap;
}

const LYING_README: SourceFile[] = [
  {
    path: "README.md",
    content:
      "# acme-api\n\nBattle-tested API with 500 endpoints and 1,200 tests. Trusted by 40,000 users.\n",
    size: 100,
  },
];

describe("pitch — truth-first deck", () => {
  it("flags a README claim the code contradicts, with both numbers, and never repeats it as fact", () => {
    const deck = generatePitchDeck(ctxFixture(), LYING_README);
    // The contradiction is surfaced with claim AND measurement…
    expect(deck.content).toContain('claims "500 endpoints"');
    expect(deck.content).toMatch(/measured 3/);
    // …and the claimed numbers never appear as standalone deck facts.
    // (They may appear inside the quoted claim; strip quoted spans first.)
    const outsideQuotes = deck.content.replace(/"[^"]*"/g, "");
    expect(outsideQuotes).not.toMatch(/\b500\b/);
    expect(outsideQuotes).not.toMatch(/\b1,?200\b/);
  });

  it("marks unmeasurable marketing numbers (users) as unverifiable rather than repeating them", () => {
    const json = JSON.parse(generatePitchDeckJson(ctxFixture(), LYING_README).content) as {
      claims_audit: Array<{ noun: string; verdict: string }>;
    };
    const users = json.claims_audit.find((c) => c.noun.startsWith("user"));
    expect(users?.verdict).toBe("unverifiable");
  });

  it("puts the bad news on the deck: missing tests and CI surface as warnings", () => {
    const deck = generatePitchDeck(ctxFixture(), []);
    expect(deck.content).toContain("No test files detected");
    expect(deck.content).toContain("No CI/CD pipeline detected");
    expect(deck.content).toContain("Test files found: 0");
  });

  it("states absence honestly when the repo has no self-description", () => {
    const ctx = ctxFixture();
    (ctx.project_identity as { description: string | null }).description = null;
    (ctx.ai_context as { project_summary: string }).project_summary = "";
    const deck = generatePitchDeck(ctx, []);
    expect(deck.content).toContain("No self-description found");
  });

  it("every measured fact in the JSON carries its analyzer source field", () => {
    const json = JSON.parse(generatePitchDeckJson(ctxFixture(), []).content) as {
      facts: Array<{ label: string; source: string }>;
    };
    expect(json.facts.length).toBeGreaterThan(3);
    for (const f of json.facts) expect(f.source.length, `${f.label} missing source`).toBeGreaterThan(3);
  });

  it("art prompts forbid text/logos/fake UI and derive from repo facts", () => {
    const art = JSON.parse(generateSlideArtPrompts(ctxFixture()).content) as {
      prompts: Record<string, string>;
      style_contract: { negative: string };
    };
    expect(Object.keys(art.prompts).sort()).toEqual(["ask", "engineering", "evidence", "title", "truth"]);
    for (const p of Object.values(art.prompts)) {
      expect(p).toContain("No words");
      expect(p).toContain("no logos");
      expect(p).toContain("no fake user interfaces");
    }
    // Derived from this repo's facts: the evidence slide encodes the route count.
    expect(art.prompts.evidence).toContain("3 accent points");
  });

  it("is deterministic — identical output for identical input", () => {
    const a = generatePitchDeck(ctxFixture(), LYING_README).content;
    const b = generatePitchDeck(ctxFixture(), LYING_README).content;
    expect(a).toBe(b);
    expect(a).not.toContain("2026-01-01"); // generated_at must not leak (Watch-diff lesson)
  });
});
