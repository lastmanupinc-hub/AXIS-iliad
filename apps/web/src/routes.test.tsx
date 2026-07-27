/**
 * @vitest-environment happy-dom
 */

// WO-F2 route table — pattern matching (incl. ":id" params), hash building,
// pathname aliases, and derived auth/shortcut metadata.

import { describe, expect, it } from "vitest";
import {
  AUTH_ONLY_PAGES,
  ROUTES,
  hashForPage,
  matchHash,
  matchPattern,
  routeForPage,
  routeForShortcut,
  routeFromPathname,
  visibleNavRoutes,
  type NavContext,
} from "./routes.tsx";

describe("matchPattern — the params parser", () => {
  it("parses :id segments (#projects/abc123 → { id: 'abc123' })", () => {
    expect(matchPattern("projects/:id", "projects/abc123")).toEqual({ id: "abc123" });
  });

  it("parses params in nested positions", () => {
    expect(matchPattern("projects/:id/artifacts", "projects/p_42/artifacts")).toEqual({ id: "p_42" });
  });

  it("supports trailing optional params (run/:program?)", () => {
    expect(matchPattern("run/:program?", "run")).toEqual({});
    expect(matchPattern("run/:program?", "run/theme")).toEqual({ program: "theme" });
  });

  it("URL-decodes captured params", () => {
    expect(matchPattern("projects/:id", "projects/a%20b")).toEqual({ id: "a b" });
  });

  it("rejects extra, missing, and mismatched segments", () => {
    expect(matchPattern("projects/:id", "projects")).toBeNull();
    expect(matchPattern("projects/:id", "projects/a/b")).toBeNull();
    expect(matchPattern("docs", "help")).toBeNull();
    expect(matchPattern("docs", "docs/extra")).toBeNull();
  });

  it("matches static patterns with empty params", () => {
    expect(matchPattern("tools/web-research", "tools/web-research")).toEqual({});
    expect(matchPattern("", "")).toEqual({});
  });
});

describe("matchHash — table resolution", () => {
  it("resolves every static route at its own hash (old URLs keep working)", () => {
    for (const route of ROUTES) {
      if (route.pattern === null || route.pattern.includes(":")) continue;
      const match = matchHash(route.pattern);
      expect(match, `#${route.pattern} should resolve`).not.toBeNull();
      expect(match!.route.page).toBe(route.page);
    }
  });

  it("tolerates a leading '#' and trailing slashes", () => {
    expect(matchHash("#docs")!.route.page).toBe("docs");
    expect(matchHash("docs/")!.route.page).toBe("docs");
  });

  it("resolves the empty hash to the landing page", () => {
    expect(matchHash("")!.route.page).toBe("home");
    expect(matchHash("#")!.route.page).toBe("home");
  });

  it("resolves sub-tool hashes (#tools/web-research)", () => {
    expect(matchHash("tools/web-research")!.route.page).toBe("tool-web-research");
  });

  it("returns null for unknown hashes (404, never a silent landing fallback)", () => {
    expect(matchHash("definitely/not/a/page")).toBeNull();
    expect(matchHash("docs/extra")).toBeNull();
    expect(matchHash("tools/unknown-tool")).toBeNull();
    expect(matchHash("Docs")).toBeNull(); // case-sensitive
    // WO-P8: "tools" (the ToolsIndexPage catalog) and "install" (the old
    // InstallPage) were merged into "mcp" — their bare hashes no longer
    // resolve to anything (404, not a silent fallback to either page).
    expect(matchHash("tools")).toBeNull();
    expect(matchHash("install")).toBeNull();
  });
});

describe("hashForPage — hash building", () => {
  it("builds the home hash as empty", () => {
    expect(hashForPage("home")).toBe("");
  });

  it("builds static and sub-path hashes", () => {
    expect(hashForPage("dashboard")).toBe("dashboard");
    expect(hashForPage("tool-web-research")).toBe("tools/web-research");
  });

  it("round-trips: built hash resolves back to the same page", () => {
    for (const route of ROUTES) {
      if (route.pattern === null || route.pattern.includes(":")) continue;
      const match = matchHash(hashForPage(route.page));
      expect(match!.route.page).toBe(route.page);
    }
  });
});

describe("routeFromPathname — marketing/SEO aliases", () => {
  it("maps the existing marketing pathnames", () => {
    expect(routeFromPathname("/pricing")!.page).toBe("plans");
    expect(routeFromPathname("/plans")!.page).toBe("plans");
    // WO-P8: "/mcp" now points at the real MCP Configuration page (moved off
    // "for-agents"); "/install" and "/tools" are kept as aliases into the
    // same merged page for continuity with the pages it absorbed.
    expect(routeFromPathname("/mcp")!.page).toBe("mcp");
    expect(routeFromPathname("/install")!.page).toBe("mcp");
    expect(routeFromPathname("/tools")!.page).toBe("mcp");
    expect(routeFromPathname("/for-agents")!.page).toBe("for-agents");
    expect(routeFromPathname("/docs")!.page).toBe("docs");
    expect(routeFromPathname("/programs")!.page).toBe("programs");
    expect(routeFromPathname("/tools/web-research")!.page).toBe("tool-web-research");
    expect(routeFromPathname("/account")!.page).toBe("account");
    expect(routeFromPathname("/paid-checkout")!.page).toBe("paid-checkout");
  });

  it("tolerates trailing slashes and rejects unknown paths", () => {
    expect(routeFromPathname("/docs/")!.page).toBe("docs");
    expect(routeFromPathname("/")).toBeNull();
    expect(routeFromPathname("/nope")).toBeNull();
  });
});

describe("derived route metadata", () => {
  it("AUTH_ONLY_PAGES preserves the pre-refactor gating set exactly (WO-P3's account-dashboard is now the real 'dashboard'; WO-P11 adds 'projects'; WO-P10 adds 'usage'; WO-P12 adds 'settings'; fleet is authOnly per its own route entry; 'plans' REMOVED 2026-07-27 — pricing is public)", () => {
    expect([...AUTH_ONLY_PAGES].sort()).toEqual(
      ["account", "dashboard", "admin", "fleet", "myanalytics", "paid-checkout", "projects", "usage", "settings"].sort(),
    );
  });

  it("the project/project-versions/project-artifacts routes (WO-P5/P6) are NOT auth-only — anonymous projects stay viewable by id", () => {
    expect(AUTH_ONLY_PAGES.has("project")).toBe(false);
    expect(AUTH_ONLY_PAGES.has("project-versions")).toBe(false);
    expect(AUTH_ONLY_PAGES.has("project-artifacts")).toBe(false);
  });

  it("page ids and non-null patterns are unique", () => {
    const pages = ROUTES.map((r) => r.page);
    expect(new Set(pages).size).toBe(pages.length);
    const patterns = ROUTES.map((r) => r.pattern).filter((p) => p !== null);
    expect(new Set(patterns).size).toBe(patterns.length);
  });

  it("aliases are unique across routes", () => {
    const aliases = ROUTES.flatMap((r) => r.aliases ?? []);
    expect(new Set(aliases).size).toBe(aliases.length);
  });

  it("routeForPage falls back to the 404 route for the not-found id", () => {
    const def = routeForPage("not-found");
    expect(def.pattern).toBeNull();
    expect(def.label).toBe("404");
  });

  it("Ctrl+2 always resolves to Dashboard (auth-only — nav() gates it at fire time, like Ctrl+3/Plans)", () => {
    const base: NavContext = { loggedIn: false, privateAccess: false, hasResult: false };
    expect(routeForShortcut(2, base)!.page).toBe("dashboard");
    expect(routeForShortcut(2, { ...base, loggedIn: true })!.page).toBe("dashboard");
  });

  it("Programs (WO-P5) no longer claims a Ctrl+2 fallback — Dashboard is its sole owner", () => {
    expect(routeForPage("programs").shortcut).toBeUndefined();
  });

  it("admin shortcuts resolve only with privateAccess", () => {
    const base: NavContext = { loggedIn: true, privateAccess: false, hasResult: false };
    expect(routeForShortcut(8, base)).toBeNull();
    expect(routeForShortcut(9, base)).toBeNull();
    expect(routeForShortcut(8, { ...base, privateAccess: true })!.page).toBe("admin");
    expect(routeForShortcut(9, { ...base, privateAccess: true })!.page).toBe("myanalytics");
  });
});

// ─── Kitchen sink (WO-F4 dev aid) ────────────────────────────────

describe("kitchen-sink route (WO-F4)", () => {
  it("resolves at #__kitchen-sink", () => {
    expect(matchHash("__kitchen-sink")!.route.page).toBe("kitchen-sink");
    expect(hashForPage("kitchen-sink")).toBe("__kitchen-sink");
  });

  it("stays hidden: no nav entry, shortcut, or alias — absent from every nav surface", () => {
    const def = routeForPage("kitchen-sink");
    expect(def.nav).toBeUndefined();
    expect(def.shortcut).toBeUndefined();
    expect(def.aliases).toBeUndefined();
    const everything: NavContext = { loggedIn: true, privateAccess: true, hasResult: true };
    expect(visibleNavRoutes(everything).some((r) => r.page === "kitchen-sink")).toBe(false);
  });

  it("is not login-gated (a dev aid, not an account page)", () => {
    expect(AUTH_ONLY_PAGES.has("kitchen-sink")).toBe(false);
  });
});

// ─── Home / Analyze split (WO-P1) ─────────────────────────────────

describe("home/analyze split (WO-P1)", () => {
  it("home owns the empty pattern and has no nav entry, shortcut, or alias", () => {
    const def = routeForPage("home");
    expect(def.pattern).toBe("");
    expect(def.nav).toBeUndefined();
    expect(def.shortcut).toBeUndefined();
    const everything: NavContext = { loggedIn: true, privateAccess: true, hasResult: true };
    expect(visibleNavRoutes(everything).some((r) => r.page === "home")).toBe(false);
  });

  it("analyze resolves at #analyze, is in the WORKSPACE nav, and owns Ctrl+1", () => {
    expect(matchHash("analyze")!.route.page).toBe("analyze");
    expect(hashForPage("analyze")).toBe("analyze");
    const def = routeForPage("analyze");
    expect(def.nav?.group).toBe("WORKSPACE");
    const base: NavContext = { loggedIn: false, privateAccess: false, hasResult: false };
    expect(routeForShortcut(1, base)!.page).toBe("analyze");
  });

  it("neither home nor analyze is login-gated", () => {
    expect(AUTH_ONLY_PAGES.has("home")).toBe(false);
    expect(AUTH_ONLY_PAGES.has("analyze")).toBe(false);
  });
});

// ─── Program Runner (WO-P7) ────────────────────────────────────────

describe("Program Runner route (WO-P7)", () => {
  it("#run resolves to the 'runner' page with no program captured", () => {
    const match = matchHash("run");
    expect(match!.route.page).toBe("runner");
    expect(match!.params).toEqual({});
  });

  it("#run/:program resolves to the 'runner' page with the program captured", () => {
    const match = matchHash("run/theme");
    expect(match!.route.page).toBe("runner");
    expect(match!.params).toEqual({ program: "theme" });
  });

  it("hashForPage round-trips both the bare and program-preselected forms", () => {
    expect(hashForPage("runner")).toBe("run");
    expect(hashForPage("runner", { program: "theme" })).toBe("run/theme");
    expect(matchHash(hashForPage("runner", { program: "theme" }))!.params).toEqual({ program: "theme" });
  });

  it("is in the WORKSPACE nav and is NOT login-gated (anonymous visitors can run free programs against their guest project)", () => {
    const def = routeForPage("runner");
    expect(def.nav?.group).toBe("WORKSPACE");
    expect(AUTH_ONLY_PAGES.has("runner")).toBe(false);
  });
});

// ─── Project/Snapshot Detail (WO-P5/WO-P6) ────────────────────────

describe("project detail routes (WO-P5/WO-P6)", () => {
  it("#projects/:id resolves to the 'project' page with the id captured", () => {
    const match = matchHash("projects/abc123");
    expect(match!.route.page).toBe("project");
    expect(match!.params).toEqual({ id: "abc123" });
  });

  it("#projects/:id/versions resolves to the 'project-versions' page with the id captured", () => {
    const match = matchHash("projects/abc123/versions");
    expect(match!.route.page).toBe("project-versions");
    expect(match!.params).toEqual({ id: "abc123" });
  });

  it("#projects/:id/artifacts resolves to the 'project-artifacts' page with the id captured (WO-P6)", () => {
    const match = matchHash("projects/abc123/artifacts");
    expect(match!.route.page).toBe("project-artifacts");
    expect(match!.params).toEqual({ id: "abc123" });
  });

  it("hashForPage round-trips all three project routes with an id", () => {
    expect(hashForPage("project", { id: "abc123" })).toBe("projects/abc123");
    expect(hashForPage("project-versions", { id: "abc123" })).toBe("projects/abc123/versions");
    expect(hashForPage("project-artifacts", { id: "abc123" })).toBe("projects/abc123/artifacts");
    expect(matchHash(hashForPage("project", { id: "p 1" }))!.params).toEqual({ id: "p 1" });
  });

  it("no project route has a nav entry, shortcut, or alias (parameterized — no static rail slot)", () => {
    for (const page of ["project", "project-versions", "project-artifacts"] as const) {
      const def = routeForPage(page);
      expect(def.nav).toBeUndefined();
      expect(def.shortcut).toBeUndefined();
      expect(def.aliases).toBeUndefined();
    }
  });

  it("'project-versions'/'project-artifacts' are not resolvable at 'projects/:id' — distinct, exact-segment-count matches", () => {
    expect(matchHash("projects/abc123")!.route.page).toBe("project");
    expect(matchHash("projects/abc123/versions")!.route.page).toBe("project-versions");
    expect(matchHash("projects/abc123/artifacts")!.route.page).toBe("project-artifacts");
  });

  it("'project-versions' and 'project-artifacts' both point back at 'project' as their parent", () => {
    expect(routeForPage("project-versions").parent).toBe("project");
    expect(routeForPage("project-artifacts").parent).toBe("project");
  });
});

// ─── Per-page SEO metadata (ROI 3.10) ────────────────────────────
//
// Before this, all 33 routes shared index.html's single <title>, description
// and canonical — so every page looked identical in search results, and the
// site-root canonical actively told crawlers not to index sub-pages
// separately. These lock the contract rather than the copy: they assert
// shape, uniqueness and gating, not specific wording, so marketing can retune
// a description without a test failing.

describe("route SEO metadata", () => {
  const withSeo = ROUTES.filter((r) => r.seo);

  it("covers the public pages a search result should be able to land on", () => {
    const covered = new Set(withSeo.map((r) => r.page));
    for (const page of ["home", "analyze", "programs", "mcp", "plans", "docs", "qa", "feedback", "for-agents", "terms", "privacy"]) {
      expect(covered.has(page as PageId), `public page "${page}" has no SEO metadata`).toBe(true);
    }
  });

  it("never gives SEO metadata to an auth-gated page", () => {
    // An app screen behind login should not present itself as an indexable
    // destination — it would rank, then bounce every visitor to a sign-in modal.
    const gated = withSeo.filter((r) => r.authOnly || r.adminOnly).map((r) => r.page);
    expect(gated, `auth-gated pages must not declare SEO: ${gated.join(", ")}`).toEqual([]);
  });

  it("gives every page a distinct title and description", () => {
    const titles = withSeo.map((r) => r.seo!.title);
    const descriptions = withSeo.map((r) => r.seo!.description);
    expect(new Set(titles).size, "duplicate <title> across routes").toBe(titles.length);
    expect(new Set(descriptions).size, "duplicate description across routes").toBe(descriptions.length);
  });

  it("keeps titles and descriptions inside the lengths search engines actually render", () => {
    for (const r of withSeo) {
      // ~60 chars for titles / ~160 for descriptions are the usual truncation
      // points. Slightly generous ceilings — the point is catching a runaway
      // paragraph, not policing every character.
      expect(r.seo!.title.length, `title too long on "${r.page}"`).toBeLessThanOrEqual(70);
      expect(r.seo!.description.length, `description too long on "${r.page}"`).toBeLessThanOrEqual(200);
      expect(r.seo!.title.length, `title suspiciously short on "${r.page}"`).toBeGreaterThan(10);
      expect(r.seo!.description.length, `description suspiciously short on "${r.page}"`).toBeGreaterThan(40);
    }
  });

  it("brands every title, so a search result is attributable at a glance", () => {
    for (const r of withSeo) {
      expect(r.seo!.title, `"${r.page}" title is unbranded`).toContain("Iliad");
    }
  });
});
