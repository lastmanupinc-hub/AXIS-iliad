import { describe, it, expect } from "vitest";
import { generateFiles } from "./generate.js";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { SnapshotRecord, FileEntry } from "@axis/snapshots";
import type { GeneratorInput } from "./types.js";

/* ─── Fixture Helpers ──────────────────────────────────────────── */

function snap(opts: { name?: string; files?: FileEntry[] } = {}): SnapshotRecord {
  const files = opts.files ?? [{ path: "index.ts", content: 'console.log("hi");', size: 18 }];
  return {
    snapshot_id: "snap-b17-001",
    project_id: "proj-b17-001",
    created_at: new Date().toISOString(),
    input_method: "repo_snapshot_upload",
    manifest: {
      project_name: opts.name ?? "b17-test",
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

function addFw(inp: GeneratorInput, name: string, confidence = 0.9): GeneratorInput {
  inp.context_map.detection.frameworks.push({ name, version: null, confidence });
  return inp;
}

function setLang(inp: GeneratorInput, lang: string): GeneratorInput {
  inp.context_map.project_identity.primary_language = lang;
  return inp;
}

function withRoutes(
  inp: GeneratorInput,
  routes: Array<{ method: string; path: string; source_file: string }>,
): GeneratorInput {
  inp.context_map.routes = routes;
  return inp;
}

function withModels(
  inp: GeneratorInput,
  models: Array<{ name: string; kind: string; field_count: number }>,
): GeneratorInput {
  inp.context_map.domain_models = models.map((m) => ({
    name: m.name,
    kind: m.kind,
    language: "TypeScript",
    field_count: m.field_count,
    source_file: `src/models/${m.name.toLowerCase()}.ts`,
  }));
  return inp;
}

/* ================================================================= */
/* PART 1: generators-remotion — deriveRemotionTheme framework paths */
/* ================================================================= */

describe("remotion: Angular palette path — branch 5[0] (line 26)", () => {
  it("uses angular red palette for Angular projects", () => {
    const inp = addFw(input(snap(), ["remotion-script.ts"]), "Angular");
    const res = generateFiles(inp);
    const f = getFile(res, "remotion-script.ts");
    expect(f).toBeDefined();
    // Angular palette has accent #dd0031
    expect(f!.content).toContain("#dd0031");
  });
});

describe("remotion: Nuxt palette path — branch 7[0] (line 28)", () => {
  it("uses nuxt green palette for Nuxt projects", () => {
    const inp = addFw(input(snap(), ["remotion-script.ts"]), "Nuxt");
    const res = generateFiles(inp);
    const f = getFile(res, "remotion-script.ts");
    expect(f).toBeDefined();
    expect(f!.content).toContain("#00dc82");
  });
});

describe("remotion: FastAPI palette path — branch 8[0] (line 29)", () => {
  it("uses fastapi teal palette for FastAPI projects", () => {
    const inp = addFw(input(snap(), ["remotion-script.ts"]), "FastAPI");
    const res = generateFiles(inp);
    const f = getFile(res, "remotion-script.ts");
    expect(f).toBeDefined();
    expect(f!.content).toContain("#009688");
  });
});

describe("remotion: Django palette path — branch 9[0] (line 30)", () => {
  it("uses django green palette for Django projects", () => {
    const inp = addFw(input(snap(), ["remotion-script.ts"]), "Django");
    const res = generateFiles(inp);
    const f = getFile(res, "remotion-script.ts");
    expect(f).toBeDefined();
    expect(f!.content).toContain("#0c4b33");
  });
});

describe("remotion: Go language palette path — branch 13[0] (line 36)", () => {
  it("uses Go blue palette when primary language is Go", () => {
    const inp = setLang(input(snap(), ["remotion-script.ts"]), "Go");
    const res = generateFiles(inp);
    const f = getFile(res, "remotion-script.ts");
    expect(f).toBeDefined();
    expect(f!.content).toContain("#00add8");
  });
});

describe("remotion: Rust language palette path — branch 14[0] (line 37)", () => {
  it("uses Rust orange palette when primary language is Rust", () => {
    const inp = setLang(input(snap(), ["remotion-script.ts"]), "Rust");
    const res = generateFiles(inp);
    const f = getFile(res, "remotion-script.ts");
    expect(f).toBeDefined();
    expect(f!.content).toContain("#ce422b");
  });
});

describe("remotion: routes + models put data in scene_data (canonical scene list)", () => {
  it("keeps the fixed 4-scene composition layout; route/model content lives in scene_data", () => {
    const inp = withRoutes(
      withModels(input(snap(), ["render-config.json"]), [
        { name: "User", kind: "interface", field_count: 5 },
        { name: "Product", kind: "class", field_count: 8 },
      ]),
      [
        { method: "GET", path: "/api/users", source_file: "api.ts" },
        { method: "POST", path: "/api/products", source_file: "api.ts" },
      ],
    );
    const res = generateFiles(inp);
    const f = getFile(res, "render-config.json");
    expect(f).toBeDefined();
    const parsed = JSON.parse(f!.content);
    // render-config now declares exactly the scenes the composition renders — it
    // no longer invents api-surface/data-model scenes the video never shows.
    expect(parsed.scenes.map((s: { id: string }) => s.id)).toEqual(["intro", "tech-stack", "architecture", "abstractions"]);
    // the route/model DATA is still available for overlay builders under scene_data.
    expect(parsed.scene_data.api_surface).not.toBeNull();
    expect(parsed.scene_data.data_model).not.toBeNull();
  });
});

describe("remotion: api_surface cond-expr true case — branch 40[0] (line 407)", () => {
  it("includes api_surface in scene_data when routes exist", () => {
    const inp = withRoutes(input(snap(), ["render-config.json"]), [
      { method: "GET", path: "/", source_file: "pages.ts" },
      { method: "POST", path: "/api/search", source_file: "api.ts" },
    ]);
    const res = generateFiles(inp);
    const f = getFile(res, "render-config.json");
    expect(f).toBeDefined();
    const parsed = JSON.parse(f!.content);
    // api_surface is non-null when routes > 0
    expect(parsed.scene_data.api_surface).not.toBeNull();
    expect(parsed.scene_data.api_surface.total_routes).toBeGreaterThan(0);
  });
});

describe("remotion: data_model cond-expr true case — branch 41[0] (line 411)", () => {
  it("includes data_model in scene_data when domain models exist", () => {
    const inp = withModels(input(snap(), ["render-config.json"]), [
      { name: "Account", kind: "interface", field_count: 6 },
      { name: "Order", kind: "class", field_count: 12 },
    ]);
    const res = generateFiles(inp);
    const f = getFile(res, "render-config.json");
    expect(f).toBeDefined();
    const parsed = JSON.parse(f!.content);
    expect(parsed.scene_data.data_model).not.toBeNull();
    expect(parsed.scene_data.data_model.total_models).toBeGreaterThan(0);
  });
});

/* ================================================================= */
/* PART 2: generators-superpowers — test factory + refactor          */
/* ================================================================= */

describe("superpowers: vitest factory helpers with domain models — branches 49[0], 53[0]", () => {
  it("generates TypeScript factory helpers when vitest test framework + domain models", () => {
    const inp = withModels(input(snap(), ["test-generation-rules.md"]), [
      { name: "User", kind: "interface", field_count: 3 },
      { name: "Product", kind: "interface", field_count: 6 },   // field_count >= 5 → complexModels
      { name: "Order", kind: "class", field_count: 9 },          // field_count >= 5 → complexModels
    ]);
    inp.context_map.detection.test_frameworks = ["vitest"];
    const res = generateFiles(inp);
    const f = getFile(res, "test-generation-rules.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("makeUser");
    expect(f!.content).toContain("High-Complexity Models");
  });

  it("generates pytest factory helpers when pytest framework + domain models", () => {
    const inp = withModels(input(snap(), ["test-generation-rules.md"]), [
      { name: "User", kind: "class", field_count: 4 },
      { name: "Report", kind: "class", field_count: 5 },
    ]);
    inp.context_map.detection.test_frameworks = ["pytest"];
    const res = generateFiles(inp);
    const f = getFile(res, "test-generation-rules.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("def make_user");
  });
});

describe("superpowers: refactor checklist with domain models — branches 70[0], 71-79", () => {
  it("includes Domain Model Complexity section with large models (branch 70[0], 71[0,1])", () => {
    const inp = withModels(input(snap(), ["refactor-checklist.md"]), [
      { name: "MegaRecord", kind: "interface", field_count: 12 },    // >= 10 → ⚠️ large
      { name: "MediumModel", kind: "interface", field_count: 7 },     // >= 6 → consider splitting
      { name: "SmallModel", kind: "class", field_count: 3 },          // no flag
    ]);
    const res = generateFiles(inp);
    const f = getFile(res, "refactor-checklist.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Domain Model Complexity");
    expect(f!.content).toContain("⚠️ large");
    expect(f!.content).toContain("consider splitting");
    // Branch 73[0]: largeModels.length > 0 (field_count >= 8)
    expect(f!.content).toContain("Decomposition Candidates");
  });

  it("shows interface vs class balance — branch 74[0] (both kinds present)", () => {
    const inp = withModels(input(snap(), ["refactor-checklist.md"]), [
      { name: "IUser", kind: "interface", field_count: 4 },
      { name: "IProduct", kind: "interface", field_count: 4 },
      { name: "ConcreteA", kind: "class", field_count: 5 },
      { name: "ConcreteB", kind: "class", field_count: 5 },
      { name: "ConcreteC", kind: "class", field_count: 5 },
    ]);
    const res = generateFiles(inp);
    const f = getFile(res, "refactor-checklist.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Model balance");
  });

  it("suggests interface extraction when classes >> interfaces — branch 75[0] (line 752[0])", () => {
    // classes.length > interfaces.length * 2 → suggest shared interface extraction
    const inp = withModels(input(snap(), ["refactor-checklist.md"]), [
      { name: "IBase", kind: "interface", field_count: 2 },         // 1 interface
      { name: "ConcreteA", kind: "class", field_count: 5 },         // 3 classes > 1*2=2
      { name: "ConcreteB", kind: "class", field_count: 5 },
      { name: "ConcreteC", kind: "class", field_count: 5 },
    ]);
    const res = generateFiles(inp);
    const f = getFile(res, "refactor-checklist.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("shared interfaces");
  });
});

/* ================================================================= */
/* PART 3: generators-brand — messaging_system branches              */
/* ================================================================= */

describe("brand: no project_summary uses id.name — branch 30[1] (line 451)", () => {
  it("uses project name as tagline when project_summary is null", () => {
    const inp = input(snap({ name: "MyApp" }), ["messaging-system.yaml"]);
    inp.context_map.ai_context.project_summary = "";  // falsy → triggers ?? fallback
    const res = generateFiles(inp);
    const f = getFile(res, "messaging-system.yaml");
    expect(f).toBeDefined();
    expect(f!.content).toContain("taglines:");
  });
});

describe("brand: routes in value proposition — branch 37[0] (line 480)", () => {
  it("includes API endpoint value proposition when routes exist", () => {
    const inp = withRoutes(input(snap(), ["messaging-system.yaml"]), [
      { method: "GET", path: "/api/users", source_file: "api.ts" },
      { method: "POST", path: "/api/products", source_file: "api.ts" },
    ]);
    const res = generateFiles(inp);
    const f = getFile(res, "messaging-system.yaml");
    expect(f).toBeDefined();
    expect(f!.content).toContain("API Endpoints");
    expect(f!.content).toContain("api_surface");
  });
});

describe("brand: models > 5 in value proposition — branch 38[0] (line 483)", () => {
  it("shows overflow count when domain models exceed 5", () => {
    const inp = withModels(input(snap(), ["messaging-system.yaml"]), [
      { name: "User", kind: "interface", field_count: 4 },
      { name: "Product", kind: "interface", field_count: 4 },
      { name: "Order", kind: "class", field_count: 4 },
      { name: "Review", kind: "interface", field_count: 4 },
      { name: "Category", kind: "class", field_count: 4 },
      { name: "Vendor", kind: "interface", field_count: 4 },   // 6 models > 5 → shows "and 1 more"
    ]);
    const res = generateFiles(inp);
    const f = getFile(res, "messaging-system.yaml");
    expect(f).toBeDefined();
    expect(f!.content).toContain("and 1 more");
  });
});

describe("brand: channel-rulebook with domain models — branch 56[0] (line 609)", () => {
  it("uses domain model names as key terms in channel rulebook", () => {
    const inp = withModels(input(snap(), ["channel-rulebook.md"]), [
      { name: "Subscription", kind: "interface", field_count: 6 },
      { name: "Invoice", kind: "class", field_count: 8 },
    ]);
    const res = generateFiles(inp);
    const f = getFile(res, "channel-rulebook.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Subscription");
    expect(f!.content).toContain("Key terms");
  });
});

describe("brand: channel-rulebook with support routes — branch 58[0], 60[0,1,2] (lines 686, 688)", () => {
  it("shows detected support routes in channel rulebook when support paths exist", () => {
    const inp = withRoutes(input(snap(), ["channel-rulebook.md"]), [
      { method: "GET", path: "/support", source_file: "pages.ts" },  // covers branch 688[1]
      { method: "GET", path: "/contact", source_file: "pages.ts" },  // covers branch 688[2]
      { method: "GET", path: "/help", source_file: "pages.ts" },     // covers branch 688[0]
    ]);
    const res = generateFiles(inp);
    const f = getFile(res, "channel-rulebook.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Detected support routes");
    expect(f!.content).toContain("/support");
  });

  it("all three route path checks in channel rulebook OR chain", () => {
    // branch 688 binary-expr [0,1,2] = support || contact || help
    // [0] = support matches (short-circuits)
    // [1] = support=false, contact matches
    // [2] = support=false, contact=false, help evaluates
    const inp1 = withRoutes(input(snap(), ["channel-rulebook.md"]), [
      { method: "GET", path: "/support-center", source_file: "pages.ts" },  // support → [0]
    ]);
    const res1 = generateFiles(inp1);
    const f1 = getFile(res1, "channel-rulebook.md");
    expect(f1!.content).toContain("Detected support routes");

    const inp2 = withRoutes(input(snap(), ["channel-rulebook.md"]), [
      { method: "GET", path: "/contact-us", source_file: "pages.ts" },  // no "support", has "contact" → [1]
    ]);
    const res2 = generateFiles(inp2);
    const f2 = getFile(res2, "channel-rulebook.md");
    expect(f2!.content).toContain("Detected support routes");

    const inp3 = withRoutes(input(snap(), ["channel-rulebook.md"]), [
      { method: "GET", path: "/help-center", source_file: "pages.ts" },  // no support/contact, has "help" → [2]
    ]);
    const res3 = generateFiles(inp3);
    const f3 = getFile(res3, "channel-rulebook.md");
    expect(f3!.content).toContain("Detected support routes");
  });
});
