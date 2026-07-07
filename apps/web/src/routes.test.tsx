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
    expect(matchHash("")!.route.page).toBe("upload");
    expect(matchHash("#")!.route.page).toBe("upload");
  });

  it("resolves sub-tool hashes (#tools/web-research)", () => {
    expect(matchHash("tools/web-research")!.route.page).toBe("tool-web-research");
    expect(matchHash("tools")!.route.page).toBe("tools");
  });

  it("returns null for unknown hashes (404, never a silent landing fallback)", () => {
    expect(matchHash("definitely/not/a/page")).toBeNull();
    expect(matchHash("docs/extra")).toBeNull();
    expect(matchHash("tools/unknown-tool")).toBeNull();
    expect(matchHash("Docs")).toBeNull(); // case-sensitive
  });
});

describe("hashForPage — hash building", () => {
  it("builds the home hash as empty", () => {
    expect(hashForPage("upload")).toBe("");
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
    expect(routeFromPathname("/mcp")!.page).toBe("for-agents");
    expect(routeFromPathname("/for-agents")!.page).toBe("for-agents");
    expect(routeFromPathname("/docs")!.page).toBe("docs");
    expect(routeFromPathname("/install")!.page).toBe("install");
    expect(routeFromPathname("/programs")!.page).toBe("programs");
    expect(routeFromPathname("/tools")!.page).toBe("tools");
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
  it("AUTH_ONLY_PAGES preserves the pre-refactor gating set exactly", () => {
    expect([...AUTH_ONLY_PAGES].sort()).toEqual(
      ["account", "admin", "myanalytics", "paid-checkout", "plans"].sort(),
    );
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

  it("Ctrl+2 goes to Dashboard with a result and Programs without (HelpPage table)", () => {
    const base: NavContext = { loggedIn: false, privateAccess: false, hasResult: false };
    expect(routeForShortcut(2, base)!.page).toBe("programs");
    expect(routeForShortcut(2, { ...base, hasResult: true })!.page).toBe("dashboard");
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
