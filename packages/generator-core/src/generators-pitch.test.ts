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
    expect(Object.keys(art.prompts).sort()).toEqual(["ask", "market", "model", "problem", "solution", "team", "title", "traction", "truth"]);
    for (const p of Object.values(art.prompts)) {
      expect(p).toContain("No words");
      expect(p).toContain("no logos");
      expect(p).toContain("no fake user interfaces");
    }
    // Derived from this repo's facts: the solution slide encodes the route count.
    expect(art.prompts.solution).toContain("3 accent points");
  });

  it("every slide's art key has a matching art prompt — no slide can render background-less by omission", () => {
    const json = JSON.parse(generatePitchDeckJson(ctxFixture(), []).content) as {
      slides: Array<{ art: string }>;
    };
    const art = JSON.parse(generateSlideArtPrompts(ctxFixture()).content) as { prompts: Record<string, string> };
    for (const s of json.slides) {
      expect(art.prompts[s.art], `slide art key "${s.art}" missing from slide-art-prompts.json`).toBeDefined();
    }
  });

  it("is deterministic — identical output for identical input", () => {
    const a = generatePitchDeck(ctxFixture(), LYING_README).content;
    const b = generatePitchDeck(ctxFixture(), LYING_README).content;
    expect(a).toBe(b);
    expect(a).not.toContain("2026-01-01"); // generated_at must not leak (Watch-diff lesson)
  });
});

describe("evidence-skeleton structure (v2) — the consensus skeleton, provenance-typed", () => {
  it("emits the full consensus skeleton in order: thesis-first title through the ask", () => {
    const json = JSON.parse(generatePitchDeckJson(ctxFixture(), []).content) as {
      slides: Array<{ n: number; title: string }>;
    };
    expect(json.slides.map((s) => s.title)).toEqual([
      "acme-api",
      "The problem",
      "The solution — measured",
      "Traction — attested, never invented",
      "Business model",
      "Market — bottom-up only",
      "Team",
      "The honest audit — docs vs. code, gaps included",
      "The ask",
    ]);
    expect(json.slides.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("every slide carries a provenance type, and owner-input slides declare their fields", () => {
    const json = JSON.parse(generatePitchDeckJson(ctxFixture(), []).content) as {
      slides: Array<{ title: string; provenance: string; owner_inputs?: string[] }>;
      owner_inputs: Array<{ slide: number; fields: string[] }>;
    };
    for (const s of json.slides) {
      expect(["measured", "owner_input", "mixed"], `${s.title} has invalid provenance`).toContain(s.provenance);
      if (s.provenance !== "measured") {
        expect(s.owner_inputs?.length, `${s.title} is ${s.provenance} but declares no owner_inputs`).toBeGreaterThan(0);
      }
    }
    // The aggregate manifest matches the per-slide declarations.
    const declared = json.slides.filter((s) => (s.owner_inputs ?? []).length > 0).length;
    expect(json.owner_inputs.length).toBe(declared);
  });

  it("RED-PROOF: owner-input placeholder text NEVER contains a digit — a placeholder that smuggles an invented number is the exact defect this program refuses", () => {
    const json = JSON.parse(generatePitchDeckJson(ctxFixture(), []).content) as {
      slides: Array<{ title: string; bullets: string[] }>;
    };
    for (const s of json.slides) {
      for (const b of s.bullets.filter((x) => x.startsWith("OWNER INPUT REQUIRED"))) {
        expect(b, `placeholder on "${s.title}" contains a digit: ${b}`).not.toMatch(/\d/);
      }
    }
  });

  it("no top-down TAM: the market slide is policy + owner input, with no market number anywhere on it", () => {
    const deck = JSON.parse(generatePitchDeckJson(ctxFixture(), LYING_README).content) as {
      slides: Array<{ title: string; bullets: string[]; provenance: string }>;
    };
    const market = deck.slides.find((s) => s.title.startsWith("Market"));
    expect(market).toBeDefined();
    expect(market!.provenance).toBe("owner_input");
    for (const b of market!.bullets) expect(b, `market slide carries a number: ${b}`).not.toMatch(/\d/);
  });

  it("business model: detects a payment dependency as evidence of a rail, never as evidence of a price", () => {
    const ctx = ctxFixture();
    (ctx.dependency_graph as { external_dependencies: Array<{ name: string }> }).external_dependencies = [
      { name: "stripe" },
      { name: "express" },
    ];
    const json = JSON.parse(generatePitchDeckJson(ctx, []).content) as {
      slides: Array<{ title: string; bullets: string[] }>;
    };
    const model = json.slides.find((s) => s.title === "Business model")!;
    expect(model.bullets[0]).toContain("stripe");
    expect(model.bullets[0]).not.toContain("express");
    // The detection bullet asserts a PATH exists — it must never state a price.
    expect(model.bullets[0]).not.toMatch(/\$|price[sd]? at|per (month|run|call)/i);
  });

  it("RED-PROOF: payment detection never false-positives on lookalike names or dev-only dependencies", () => {
    const ctx = ctxFixture();
    (ctx.dependency_graph as { external_dependencies: Array<{ name: string; type?: string }> }).external_dependencies = [
      { name: "squarify" },                        // treemap layout, not Square
      { name: "paddlejs" },                        // Baidu ML framework, not Paddle billing
      { name: "striped-background" },              // contains "stripe" as a substring only
      { name: "stripe", type: "development" },     // real SDK but a test mock — dev-only
    ];
    const json = JSON.parse(generatePitchDeckJson(ctx, []).content) as { slides: Array<{ title: string; bullets: string[] }> };
    const model = json.slides.find((s) => s.title === "Business model")!;
    expect(model.bullets[0]).toContain("No payment integration detected");
  });

  it("payment detection still matches scoped and delimiter-prefixed real SDK names", () => {
    const ctx = ctxFixture();
    (ctx.dependency_graph as { external_dependencies: Array<{ name: string; type?: string }> }).external_dependencies = [
      { name: "@stripe/stripe-js", type: "production" },
      { name: "paypal-rest-sdk" },
    ];
    const json = JSON.parse(generatePitchDeckJson(ctx, []).content) as { slides: Array<{ title: string; bullets: string[] }> };
    const model = json.slides.find((s) => s.title === "Business model")!;
    expect(model.bullets[0]).toContain("@stripe/stripe-js");
    expect(model.bullets[0]).toContain("paypal-rest-sdk");
  });

  it("the markdown renders the per-slide provenance its own header promises", () => {
    const deck = generatePitchDeck(ctxFixture(), []).content;
    // Every slide carries a provenance line; owner-input slides name their fields.
    expect(deck).toContain("**Provenance:** measured");
    expect(deck).toContain("**Provenance:** owner_input — owner inputs: problem_statement, current_alternatives");
    expect((deck.match(/\*\*Provenance:\*\*/g) ?? []).length).toBe(9);
  });

  it("the repo's self-description renders in quoted-claim typography, never as a bare fact", () => {
    const deck = generatePitchDeck(ctxFixture(), []).content;
    expect(deck).toContain('"Invoice API for small businesses"');
  });

  it("the honest audit slide keeps both halves: engineering reality AND the docs-vs-code diff", () => {
    const deck = generatePitchDeck(ctxFixture(), LYING_README).content;
    // Engineering reality (was slide 3) and the claims audit (was slide 4)
    // now live on one signature slide — both must survive the merge.
    expect(deck).toContain("The honest audit");
    expect(deck).toContain("Test files found: 0");
    expect(deck).toContain('claims "500 endpoints"');
  });
});

describe("claims audit — the two real false positives from the PAI'D dogfood (2026-08-15)", () => {
  // Both shapes below appeared verbatim on a real customer's generated deck.
  // They were found by GENERATING, not by review — the fixture carries them so
  // they can never return.
  it('never manufactures a claim from a trailing comma ("...2, Test cases...")', () => {
    const files: SourceFile[] = [
      { path: "README.md", content: "We ship fast. See section 2, Test cases are described later.", size: 60 },
    ];
    const deck = generatePitchDeck(ctxFixture(), files).content;
    expect(deck).not.toContain('"2, Test"');
    expect(deck).not.toMatch(/claims?.*2, Test/i);
  });

  it('never reads a numbered heading as a claim ("5 User Rights")', () => {
    const files: SourceFile[] = [
      { path: "docs/DATA_GOVERNANCE.md", content: "## 5 User Rights\n\nUsers may request deletion.", size: 50 },
    ];
    const deck = generatePitchDeck(ctxFixture(), files).content;
    expect(deck).not.toMatch(/5 User/);
  });

  it("still catches real claims: plural, lowercase, thousands-separated", () => {
    const files: SourceFile[] = [
      { path: "README.md", content: "Serving 1,234 users across 689 routes today.", size: 60 },
    ];
    const deck = generatePitchDeck(ctxFixture(), files).content;
    // users is not code-measurable -> unverifiable claim, listed with its number
    expect(deck).toMatch(/1,?234 users/);
    // routes IS measured (fixture has 0 routes; capped scan -> floors regime,
    // so an overstated claim is unverifiable, never silently dropped)
    expect(deck).toMatch(/689 routes/);
  });

  it('does not bleed across word boundaries ("5 routers" is not "5 routes")', () => {
    const files: SourceFile[] = [
      { path: "README.md", content: "Our lab rack has 5 routers humming.", size: 40 },
    ];
    const deck = generatePitchDeck(ctxFixture(), files).content;
    expect(deck).not.toMatch(/5 route/);
  });
});
