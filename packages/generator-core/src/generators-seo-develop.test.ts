import { describe, it, expect } from "vitest";
import { analyzeSeoSurface, renderSeoGaps, isPageFile } from "./generators-seo.js";
import type { SourceFile } from "./types.js";

const sf = (path: string, content: string): SourceFile => ({ path, content, size: content.length });

// ─── DEVELOP (Program 5 = SEO): real per-page meta-tag static scan ──

describe("isPageFile — a real page/route, not a module barrel", () => {
  it("recognizes real page files and rejects barrels/components", () => {
    expect(isPageFile("app/page.tsx")).toBe(true);
    expect(isPageFile("src/routes/+page.svelte")).toBe(true);
    expect(isPageFile("pages/index.tsx")).toBe(true);      // page under pages/
    expect(isPageFile("public/index.html")).toBe(true);
    expect(isPageFile("pages/_app.tsx")).toBe(true);
    expect(isPageFile("app/layout.tsx")).toBe(true);       // app-router layout (meta home)
    // NOT pages:
    expect(isPageFile("packages/context-engine/src/index.ts")).toBe(false); // barrel
    expect(isPageFile("src/components/Button.tsx")).toBe(false);            // component
    expect(isPageFile("src/utils/index.ts")).toBe(false);
    expect(isPageFile("app/page.test.tsx")).toBe(false);                    // test
  });

  it("HARDEN-2: co-located components under page dirs are NOT pages (greedy .* fix), and api routes are excluded", () => {
    expect(isPageFile("app/components/Button.tsx")).toBe(false);
    expect(isPageFile("pages/components/Card.tsx")).toBe(false);          // was flagged via pages/.*
    expect(isPageFile("app/dashboard/_components/Chart.tsx")).toBe(false);
    expect(isPageFile("app/lib/helpers.tsx")).toBe(false);
    expect(isPageFile("pages/api/users.tsx")).toBe(false);                // API route, not an SEO page
    // real ones still detected
    expect(isPageFile("app/dashboard/page.tsx")).toBe(true);
    expect(isPageFile("pages/about.tsx")).toBe(true);
  });
});

describe("analyzeSeoSurface — per-page meta gap scan", () => {
  const FULL = '<title>X</title>\n<meta name="description" content="y">\n<link rel="canonical" href="/">\n<meta property="og:title" content="X">';
  it("reports no gaps for a page with all four signals", () => {
    expect(analyzeSeoSurface([sf("app/page.tsx", FULL)])).toHaveLength(0);
  });
  it("reports 2 ERRORs (title, description) + 2 WARNINGs (canonical, og) for a bare page", () => {
    const g = analyzeSeoSurface([sf("app/page.tsx", "export default function Page(){ return <div/> }")]);
    expect(g.filter((x) => x.klass === "ERROR").map((x) => x.category).sort()).toEqual(["no-description", "no-title"]);
    expect(g.filter((x) => x.klass === "WARNING").map((x) => x.category).sort()).toEqual(["no-canonical", "no-og"]);
  });
  it("recognizes Next generateMetadata / static metadata export / svelte:head as title+description signals", () => {
    expect(analyzeSeoSurface([sf("app/page.tsx", "export function generateMetadata(){ return { title: 't', description: 'd' } }")])
      .some((x) => x.category === "no-title" || x.category === "no-description")).toBe(false);
    // Next static metadata export
    expect(analyzeSeoSurface([sf("app/page.tsx", 'export const metadata = { title: "X", description: "Y" };')])
      .some((x) => x.category === "no-title" || x.category === "no-description")).toBe(false);
  });

  it("HARDEN-2: a `description` PROP or a quoted `title:` config key is NOT a meta signal (no false suppression)", () => {
    // description prop, no meta → the no-description ERROR must still fire
    expect(analyzeSeoSurface([sf("app/page.tsx", "export default (p: {description: string}) => <Card description={p.description} />")])
      .some((x) => x.category === "no-description")).toBe(true);
    // a quoted `"title":` column config is not a <title> → no-title must still fire
    expect(analyzeSeoSurface([sf("app/page.tsx", 'const cols = [{ "title": "Name" }]; export default () => <table/>')])
      .some((x) => x.category === "no-title")).toBe(true);
  });
  it("does not scan module barrels or test files", () => {
    expect(analyzeSeoSurface([sf("src/index.ts", "export * from './x'"), sf("app/page.test.tsx", "<div/>")])).toHaveLength(0);
  });
  it("HARDEN-2: `og:` is not a bare substring — 'dialog:'/'catalog:' don't clear the OG check", () => {
    const g = analyzeSeoSurface([sf("app/page.tsx", "const x = { dialog: true, catalog: [] };")]);
    expect(g.some((x) => x.category === "no-og")).toBe(true); // still flagged
    // a real og: tag DOES clear it
    expect(analyzeSeoSurface([sf("app/page.tsx", '<meta property="og:title" content="X">')])
      .some((x) => x.category === "no-og")).toBe(false);
  });

  it("is deterministic (same input → identical output)", () => {
    const files = [sf("b/app/page.tsx", "<div/>"), sf("a/app/page.tsx", "<div/>")];
    expect(analyzeSeoSurface(files)).toEqual(analyzeSeoSurface(files));
  });
});

describe("renderSeoGaps", () => {
  it("renders a tally + table, ERROR before WARNING", () => {
    const md = renderSeoGaps(analyzeSeoSurface([sf("app/page.tsx", "<div/>")]), 1).join("\n");
    expect(md).toContain("## Detected Meta-Tag Gaps (deterministic)");
    expect(md.indexOf("ERROR")).toBeLessThan(md.indexOf("WARNING"));
  });
  it("distinguishes 'no pages to scan' from 'all pages clean'", () => {
    expect(renderSeoGaps([], 0).join("\n")).toContain("No page/layout files detected");
    expect(renderSeoGaps([], 5).join("\n")).toContain("Every scanned page shows");
  });
});
