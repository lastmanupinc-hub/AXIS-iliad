/**
 * One page per program (2026-10-26, AXIS Launch taskgate T151): every program in programs.ts is prerendered at
 * /programs/<id>/ with a title and a description that fit, and the path resolves to that program's page.
 */
import { describe, it, expect } from "vitest";
import { PROGRAMS } from "./programs.ts";
import { matchPathname, hrefForPage } from "./routes.tsx";
import { seoRoutes } from "../seo.routes.ts";

describe("a page per program", () => {
  it("lists every program among the prerendered routes, with a title of 10-60 and a description of 50-160", () => {
    expect(PROGRAMS.length).toBeGreaterThanOrEqual(10);
    for (const p of PROGRAMS) {
      const route = seoRoutes.find((r) => r.path === `/programs/${p.id}`);
      expect(route, p.id).toBeDefined();
      expect(route!.title.length, `${p.id} title: ${route!.title}`).toBeGreaterThanOrEqual(10);
      expect(route!.title.length, `${p.id} title: ${route!.title}`).toBeLessThanOrEqual(60);
      expect(route!.description.length, `${p.id} description`).toBeGreaterThanOrEqual(50);
      expect(route!.description.length, `${p.id} description`).toBeLessThanOrEqual(160);
    }
  });

  it("resolves /programs/<id>/ to the program's page with its id", () => {
    const m = matchPathname("/programs/search/");
    expect(m?.route.page).toBe("program");
    expect(m?.params).toEqual({ id: "search" });
    expect(matchPathname("/programs")?.route.page).toBe("programs");
    expect(hrefForPage("program", { id: "search" })).toBe("/programs/search/");
  });
});
