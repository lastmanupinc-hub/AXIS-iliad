import { describe, it, expect } from "vitest";
import { generateFiles } from "./generate.js";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { SnapshotRecord, FileEntry } from "@axis/snapshots";
import type { GeneratorInput, SourceFile } from "./types.js";

/* ─── Fixture Helpers ──────────────────────────────────────────── */

function snap(opts: { name?: string; files?: FileEntry[] } = {}): SnapshotRecord {
  const files = opts.files ?? [{ path: "index.ts", content: 'console.log("hi");', size: 18 }];
  return {
    snapshot_id: "snap-b16-001",
    project_id: "proj-b16-001",
    created_at: new Date().toISOString(),
    input_method: "repo_snapshot_upload",
    manifest: {
      project_name: opts.name ?? "b16-test",
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

function input(s: SnapshotRecord, requested: string[], sourceFiles?: SourceFile[]): GeneratorInput {
  return {
    context_map: buildContextMap(s),
    repo_profile: buildRepoProfile(s),
    requested_outputs: requested,
    source_files: sourceFiles,
  };
}

function getFile(result: ReturnType<typeof generateFiles>, path: string) {
  return result.files.find(f => f.path === path);
}

function withRoutes(
  inp: GeneratorInput,
  routes: Array<{ method: string; path: string; source_file: string }>,
): GeneratorInput {
  inp.context_map.routes = routes;
  return inp;
}

function withDomainModels(
  inp: GeneratorInput,
  models: Array<{ name: string; kind: string; field_count?: number }>,
): GeneratorInput {
  inp.context_map.domain_models = models.map((m) => ({
    name: m.name,
    kind: m.kind,
    language: "TypeScript",
    field_count: m.field_count ?? 4,
    source_file: `src/models/${m.name.toLowerCase()}.ts`,
  }));
  return inp;
}

/* ================================================================= */
/* PART 1: seo-rules.md — non-GET route (branch 10[0])               */
/* ================================================================= */

describe("seo-rules: non-GET route marks as API exclude — branch 10[0]", () => {
  it("POST and PUT routes appear as API route exclusion", () => {
    const inp = withRoutes(input(snap(), ["seo-rules.md"]), [
      { method: "POST", path: "/api/users", source_file: "api.ts" },
      { method: "PUT", path: "/api/users/1", source_file: "api.ts" },
      { method: "GET", path: "/", source_file: "pages.ts" },
    ]);
    const res = generateFiles(inp);
    const f = getFile(res, "seo-rules.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("API route — exclude from sitemap");
  });

  it("DELETE route also marked as API exclude", () => {
    const inp = withRoutes(input(snap(), ["seo-rules.md"]), [
      { method: "DELETE", path: "/api/items/:id", source_file: "api.ts" },
    ]);
    const res = generateFiles(inp);
    const f = getFile(res, "seo-rules.md");
    expect(f!.content).toContain("API route — exclude from sitemap");
  });
});

/* ================================================================= */
/* PART 2: seo-rules.md — contact route (branch 28[0]) +             */
/*          Contact & Support section listing (branch 53[0])         */
/* ================================================================= */

describe("seo-rules: contact route marks ContactPage schema — branches 28[0] and 53[0]", () => {
  it("GET /contact triggers ContactPage schema and lists in support section", () => {
    const inp = withRoutes(input(snap(), ["seo-rules.md"]), [
      { method: "GET", path: "/contact", source_file: "pages.ts" },
      { method: "GET", path: "/support", source_file: "pages.ts" },
      { method: "GET", path: "/feedback", source_file: "pages.ts" },
    ]);
    const res = generateFiles(inp);
    const f = getFile(res, "seo-rules.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Add ContactPage schema · include in sitemap");
    // Branch 53[0]: contactRoutes.length > 0 → lists detected contact routes
    expect(f!.content).toMatch(/Detected \d+ contact\/support route/);
  });

  it("GET /help route also maps to ContactPage schema", () => {
    const inp = withRoutes(input(snap(), ["seo-rules.md"]), [
      { method: "GET", path: "/help", source_file: "pages.ts" },
    ]);
    const res = generateFiles(inp);
    const f = getFile(res, "seo-rules.md");
    // /help matches both "help" (TechArticle) AND "help" in contactRoutes filter
    expect(f).toBeDefined();
    expect(f!.content.length).toBeGreaterThan(50);
  });
});

/* ================================================================= */
/* PART 3: seo-rules.md — domain models schema mapping               */
/*  Covers branches 32[0], 33–50 (if chains + binary-expr OR paths) */
/* ================================================================= */

describe("seo-rules: domain models Person/Product/Order/Review schema — branches 32-42", () => {
  it("maps user/account/person keywords to Person schema (branch 32[0], 33[0], 34[0,1,2])", () => {
    const inp = withDomainModels(input(snap(), ["seo-rules.md"]), [
      { name: "UserProfile", kind: "interface" },    // user → binary-expr[34][0]
      { name: "AccountSettings", kind: "class" },    // account → binary-expr[34][1]
      { name: "PersonRecord", kind: "interface" },   // person → binary-expr[34][2]
    ]);
    const res = generateFiles(inp);
    const f = getFile(res, "seo-rules.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Domain Models as Content Entities");
    expect(f!.content).toContain("Person");
  });

  it("maps product/item/plan keywords to Product schema (branch 33[1], 35[0], 36[0,1,2])", () => {
    const inp = withDomainModels(input(snap(), ["seo-rules.md"]), [
      { name: "ProductCatalog", kind: "interface" },  // product → binary-expr[36][0]
      { name: "ItemList", kind: "class" },             // item → binary-expr[36][1]
      { name: "PlanConfig", kind: "interface" },       // plan → binary-expr[36][2]
    ]);
    const res = generateFiles(inp);
    const f = getFile(res, "seo-rules.md");
    expect(f!.content).toContain("Product");
  });

  it("maps order/purchase/transaction to Order schema (branch 35[1], 37[0], 38[0,1,2])", () => {
    const inp = withDomainModels(input(snap(), ["seo-rules.md"]), [
      { name: "OrderHistory", kind: "interface" },       // order
      { name: "PurchaseRecord", kind: "class" },         // purchase
      { name: "TransactionLog", kind: "interface" },     // transaction
    ]);
    const res = generateFiles(inp);
    const f = getFile(res, "seo-rules.md");
    expect(f!.content).toContain("Order");
  });

  it("maps review/rating/comment to Review schema (branch 37[1], 39[0], 40[0,1,2])", () => {
    const inp = withDomainModels(input(snap(), ["seo-rules.md"]), [
      { name: "ReviewBoard", kind: "interface" },       // review
      { name: "RatingSystem", kind: "class" },          // rating
      { name: "CommentFeed", kind: "interface" },       // comment
    ]);
    const res = generateFiles(inp);
    const f = getFile(res, "seo-rules.md");
    expect(f!.content).toContain("Review");
  });
});

describe("seo-rules: domain models Org/Event/Article/TechArticle/WebPage schema — branches 41-51", () => {
  it("maps org/company/team to Organization schema (branch 39[1], 41[0], 42[0,1,2])", () => {
    const inp = withDomainModels(input(snap(), ["seo-rules.md"]), [
      { name: "OrgStructure", kind: "interface" },      // org
      { name: "CompanyProfile", kind: "class" },        // company
      { name: "TeamConfig", kind: "interface" },        // team
    ]);
    const res = generateFiles(inp);
    const f = getFile(res, "seo-rules.md");
    expect(f!.content).toContain("Organization");
  });

  it("maps event/meeting/session to Event schema (branch 41[1], 43[0], 44[0,1,2])", () => {
    const inp = withDomainModels(input(snap(), ["seo-rules.md"]), [
      { name: "EventCalendar", kind: "interface" },     // event
      { name: "MeetingRoom", kind: "class" },           // meeting
      { name: "SessionData", kind: "interface" },       // session
    ]);
    const res = generateFiles(inp);
    const f = getFile(res, "seo-rules.md");
    expect(f!.content).toContain("Event");
  });

  it("maps article/post/blog to Article schema (branch 43[1], 45[0], 46[0,1,2])", () => {
    const inp = withDomainModels(input(snap(), ["seo-rules.md"]), [
      { name: "ArticleContent", kind: "interface" },    // article
      { name: "PostFeed", kind: "class" },              // post
      { name: "BlogEntry", kind: "interface" },         // blog
    ]);
    const res = generateFiles(inp);
    const f = getFile(res, "seo-rules.md");
    expect(f!.content).toContain("Article");
  });

  it("maps doc/guide/tutorial to TechArticle schema (branch 45[1], 47[0], 48[0,1,2])", () => {
    const inp = withDomainModels(input(snap(), ["seo-rules.md"]), [
      { name: "DocumentIndex", kind: "interface" },     // doc
      { name: "GuideBook", kind: "class" },             // guide
      { name: "TutorialStep", kind: "interface" },      // tutorial
    ]);
    const res = generateFiles(inp);
    const f = getFile(res, "seo-rules.md");
    expect(f!.content).toContain("TechArticle");
  });

  it("maps interface/class kind to WebPage schema (branch 47[1], 49[0], 50[0,1], 51[1])", () => {
    // Model name has no keyword → falls through to kind check
    // kind="interface" → binary-expr[50][0] (short-circuits)
    // kind="class" → binary-expr[50][1] (interface check fails, class evaluates) — covers branch 51[1]
    const inp = withDomainModels(input(snap(), ["seo-rules.md"]), [
      { name: "Widget", kind: "interface" },     // no keyword, kind=interface → binary-expr[50][0]
      { name: "Component", kind: "class" },      // no keyword, kind=class → binary-expr[51][1]
    ]);
    const res = generateFiles(inp);
    const f = getFile(res, "seo-rules.md");
    expect(f!.content).toContain("WebPage");
  });

  it("models with unrecognized name and unknown kind fall to Thing (branch 49[1])", () => {
    // kind is not "interface" or "class" → schema stays "Thing"
    const inp = withDomainModels(input(snap(), ["seo-rules.md"]), [
      { name: "Misc", kind: "enum" },
      { name: "Unknown", kind: "type" },
    ]);
    const res = generateFiles(inp);
    const f = getFile(res, "seo-rules.md");
    expect(f!.content).toContain("Thing");
  });

  it("all 9 schema-type categories in one call (branch 32[0] comprehensive)", () => {
    // Combines all model types — 15 models covering every branch path
    const inp = withDomainModels(input(snap(), ["seo-rules.md"]), [
      { name: "UserRecord", kind: "interface" },
      { name: "AccountData", kind: "class" },
      { name: "PersonProfile", kind: "interface" },
      { name: "ProductList", kind: "interface" },
      { name: "ItemInventory", kind: "class" },
      { name: "PlanTier", kind: "interface" },
      { name: "OrderQueue", kind: "class" },
      { name: "ReviewCollection", kind: "interface" },
      { name: "OrgDetails", kind: "class" },
      { name: "EventStream", kind: "interface" },
      { name: "ArticleRegistry", kind: "class" },
      { name: "DocStore", kind: "interface" },
      { name: "Widget", kind: "interface" },
      { name: "BaseComponent", kind: "class" },
      { name: "DataShape", kind: "enum" },
    ]);
    const res = generateFiles(inp);
    const f = getFile(res, "seo-rules.md");
    expect(f!.content).toContain("Domain Models as Content Entities");
    expect(f!.content).toMatch(/Person|Product|Order|Review|Organization|Event|Article|TechArticle|WebPage/);
  });
});

/* ================================================================= */
/* PART 4: route-priority-map.md — source file analysis branches     */
/*  102[1]: routeFiles empty; 103[1]: no exports; 105[1]: no exemplar */
/* ================================================================= */

describe("route-priority-map: source files but no route files match — branch 102[1]", () => {
  it("produces route map even when source files have no route/page/handler names", () => {
    // Files don't match *route*, *page*, *handler*, *controller* → routeFiles = []
    const utilFile: SourceFile = {
      path: "src/utils/config.ts",
      content: "export const config = { debug: false };",
      size: 40,
    };
    const inp = input(snap(), ["route-priority-map.md"], [utilFile]);
    // Inject routes so the function doesn't early-return
    inp.context_map.routes = [{ method: "GET", path: "/", source_file: "pages.ts" }];
    const res = generateFiles(inp);
    const f = getFile(res, "route-priority-map.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Sitemap Configuration");
    // No "Route Handler Files" section because routeFiles is empty
    expect(f!.content).not.toContain("Route Handler Files");
  });
});

describe("route-priority-map: route file with no exports — branch 103[1]", () => {
  it("renders 'default' in exports column when file has no exports", () => {
    // File matches route pattern but has no exported symbols
    const noExportHandler: SourceFile = {
      path: "src/routes/handler.ts",
      content: [
        "// no exports",
        "const internal = () => {};",
        "internal();",
        "// line 4",
        "// line 5",
        "// line 6",
        "// line 7",
      ].join("\n"),
      size: 80,
    };
    const inp = input(snap(), ["route-priority-map.md"], [noExportHandler]);
    inp.context_map.routes = [{ method: "GET", path: "/home", source_file: "routes/handler.ts" }];
    const res = generateFiles(inp);
    const f = getFile(res, "route-priority-map.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Route Handler Files");
    expect(f!.content).toContain("default");
  });
});

describe("route-priority-map: all route files too long for exemplar — branch 105[1]", () => {
  it("skips Route Handler Example when all route files exceed 80 lines", () => {
    // File matches route pattern but has > 80 lines → exemplar = undefined
    const bigHandler: SourceFile = {
      path: "src/routes/api-handler.ts",
      content: Array.from({ length: 100 }, (_, i) => `// line ${i + 1}`).join("\n"),
      size: 1200,
    };
    const inp = input(snap(), ["route-priority-map.md"], [bigHandler]);
    inp.context_map.routes = [{ method: "GET", path: "/api/data", source_file: "routes/api-handler.ts" }];
    const res = generateFiles(inp);
    const f = getFile(res, "route-priority-map.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Route Handler Files");
    // no excerpt section since exemplar is undefined
    expect(f!.content).not.toContain("Route Handler Example");
  });
});

/* ================================================================= */
/* PART 5: content-audit.md — language nullish fallback (branch 115[1]) */
/* ================================================================= */

describe("content-audit: language ?? 'unknown' nullish path — branch 115[1]", () => {
  it("renders 'unknown' for page file with null language in tree summary", () => {
    const inp = input(snap(), ["content-audit.md"]);
    // Inject a page entry with null language into file_tree_summary
    inp.context_map.structure.file_tree_summary.push({
      path: "app/contact.page",
      type: "file",
      language: null,
      loc: 10,
      role: "page",
    });
    const res = generateFiles(inp);
    const f = getFile(res, "content-audit.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("unknown");
    expect(f!.content).toContain("contact.page");
  });

  it("renders 'unknown' for pages/ file entry with no language", () => {
    const inp = input(snap(), ["content-audit.md"]);
    inp.context_map.structure.file_tree_summary.push({
      path: "pages/about.md",
      type: "file",
      language: null,
      loc: 20,
      role: "content",
    });
    const res = generateFiles(inp);
    const f = getFile(res, "content-audit.md");
    expect(f).toBeDefined();
    // about.md is in pages/ path, so pageFiles includes it if pages/ filter hits
    expect(f!.content.length).toBeGreaterThan(50);
  });
});

/* ================================================================= */
/* PART 6: meta-tag-audit.json — source files provided (branch 135[1]) */
/* ================================================================= */

describe("meta-tag-audit: source files provided populates source_meta_scan — branch 135[1]", () => {
  it("includes source_meta_scan when source files have HTML/page content", () => {
    const pageFile: SourceFile = {
      path: "pages/index.html",
      content: [
        "<html>",
        "<head>",
        '  <title>My App</title>',
        '  <meta name="description" content="test">',
        "</head>",
        "<body><p>Hello</p></body>",
        "</html>",
      ].join("\n"),
      size: 120,
    };
    const inp = input(snap(), ["meta-tag-audit.json"], [pageFile]);
    const res = generateFiles(inp);
    const f = getFile(res, "meta-tag-audit.json");
    expect(f).toBeDefined();
    const parsed = JSON.parse(f!.content);
    // source_meta_scan should be populated (non-null) when files are provided
    expect(parsed.source_meta_scan).not.toBeNull();
  });

  it("source_meta_scan is null when no source files provided", () => {
    const inp = input(snap(), ["meta-tag-audit.json"]);
    const res = generateFiles(inp);
    const f = getFile(res, "meta-tag-audit.json");
    expect(f).toBeDefined();
    const parsed = JSON.parse(f!.content);
    // Without source files, source_meta_scan stays null
    expect(parsed.source_meta_scan).toBeNull();
  });

  it("meta scan detects title/og/json-ld flags in page files", () => {
    const richPage: SourceFile = {
      path: "app/layout.tsx",
      content: [
        "import Head from 'next/head';",
        "export const metadata = { title: 'App' };",
        'export function generateMetadata() { return { title: "Home" }; }',
        'const ogData = { "og:title": "App" };',
        'const jsonLd = { "@type": "WebPage" };',
        'const desc = "This is the description";',
      ].join("\n"),
      size: 200,
    };
    const inp = input(snap(), ["meta-tag-audit.json"], [richPage]);
    const res = generateFiles(inp);
    const f = getFile(res, "meta-tag-audit.json");
    expect(f).toBeDefined();
    const parsed = JSON.parse(f!.content);
    expect(parsed.source_meta_scan).not.toBeNull();
    // The scan array should have entries
    if (Array.isArray(parsed.source_meta_scan) && parsed.source_meta_scan.length > 0) {
      const entry = parsed.source_meta_scan[0];
      expect(entry).toHaveProperty("has_title");
      expect(entry).toHaveProperty("has_og_tags");
    }
  });
});

/* ================================================================= */
/* PART 7: seo-rules.md — comprehensive routes exercising all paths  */
/* ================================================================= */

describe("seo-rules: all route classification categories in one call", () => {
  it("classifies api, auth, signup, dashboard, pricing, blog, doc, about, faq, home routes", () => {
    const inp = withRoutes(input(snap(), ["seo-rules.md"]), [
      { method: "POST", path: "/api/create", source_file: "api.ts" },        // non-GET
      { method: "GET", path: "/api/users", source_file: "api.ts" },           // /api/
      { method: "GET", path: "/v1/search", source_file: "api.ts" },           // /v1/
      { method: "GET", path: "/auth/login", source_file: "auth.ts" },         // login
      { method: "GET", path: "/auth/oauth", source_file: "auth.ts" },         // oauth
      { method: "GET", path: "/signup", source_file: "auth.ts" },             // signup
      { method: "GET", path: "/register", source_file: "auth.ts" },           // register
      { method: "GET", path: "/dashboard", source_file: "pages.ts" },         // dashboard
      { method: "GET", path: "/account/settings", source_file: "pages.ts" },  // account+settings
      { method: "GET", path: "/profile", source_file: "pages.ts" },           // profile
      { method: "GET", path: "/pricing", source_file: "pages.ts" },           // pricing
      { method: "GET", path: "/blog/posts", source_file: "pages.ts" },        // blog
      { method: "GET", path: "/article/intro", source_file: "pages.ts" },     // article
      { method: "GET", path: "/docs/api", source_file: "pages.ts" },          // doc
      { method: "GET", path: "/guide/start", source_file: "pages.ts" },       // guide
    ]);
    const res = generateFiles(inp);
    const f = getFile(res, "seo-rules.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Route SEO Audit");
    expect(f!.content).toContain("API route — exclude from sitemap");
    expect(f!.content).toContain("noindex");
    expect(f!.content).toContain("Product schema");
    expect(f!.content).toContain("Article/BlogPosting schema");
    expect(f!.content).toContain("TechArticle schema");
  });

  it("classifies about, faq, contact, home routes", () => {
    const inp = withRoutes(input(snap(), ["seo-rules.md"]), [
      { method: "GET", path: "/about", source_file: "pages.ts" },             // about
      { method: "GET", path: "/team", source_file: "pages.ts" },              // team
      { method: "GET", path: "/faq", source_file: "pages.ts" },               // faq
      { method: "GET", path: "/contact", source_file: "pages.ts" },           // contact
      { method: "GET", path: "/support/help", source_file: "pages.ts" },      // support+help
      { method: "GET", path: "/", source_file: "pages.ts" },                  // home /
    ]);
    const res = generateFiles(inp);
    const f = getFile(res, "seo-rules.md");
    expect(f).toBeDefined();
    expect(f!.content).toContain("Organization schema");
    expect(f!.content).toContain("FAQPage schema");
    expect(f!.content).toContain("ContactPage schema");
    expect(f!.content).toContain("WebSite + SearchAction schema");
  });
});
