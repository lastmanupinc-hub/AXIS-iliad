/**
 * The web host answers only the app's real paths with the app shell (2026-10-26, AXIS Launch taskgate T151).
 *
 * Until then public/_redirects was "/* /index.html 200": every unknown path answered the home page with 200, and the
 * crawler had /llms.txt, /openapi.json and the .well-known files queued as pages (soft 404s). Now each pathname
 * alias the router knows (src/routes.tsx) that is not prerendered (seo.routes.ts), and each path the API sends
 * people to, has its own rewrite; there is no wildcard, and 404.html answers the rest without being indexed.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const redirects = read("../public/_redirects");
const rules = redirects
  .split("\n")
  .filter((l) => l.trim() && !l.trim().startsWith("#"))
  .map((l) => l.trim().split(/\s+/));
const rewritten = new Set(rules.filter((r) => r[1] === "/index.html" && r[2] === "200").map((r) => r[0]));

const aliases = [...read("./routes.tsx").matchAll(/aliases:\s*\[([^\]]*)\]/g)].flatMap((m) =>
  [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]),
);
const prerendered = new Set([...read("../seo.routes.ts").matchAll(/path:\s*"([^"]+)"/g)].map((m) => m[1]));
// Paths the API hands out on the web host (apps/api/src: Stripe returns, emails, the dashboard link).
const FROM_THE_API = ["/billing", "/dashboard", "/account"];

describe("public/_redirects", () => {
  it("has no catch-all", () => {
    expect(rules.filter((r) => r[0].includes("*"))).toEqual([]);
  });

  it("finds the router's aliases to check against", () => {
    expect(aliases.length).toBeGreaterThanOrEqual(10);
    expect(prerendered.has("/docs")).toBe(true);
  });

  it("serves the app shell at every alias that is not prerendered, with and without the slash", () => {
    for (const alias of aliases.filter((a) => !prerendered.has(a))) {
      expect(rewritten.has(alias), alias).toBe(true);
      expect(rewritten.has(`${alias}/`), `${alias}/`).toBe(true);
    }
  });

  it("serves the app shell at every path the API sends people to", () => {
    for (const p of FROM_THE_API) expect(rewritten.has(p), p).toBe(true);
  });

  it("does not rewrite a prerendered page (it is a file of its own)", () => {
    for (const p of prerendered) if (p !== "/") expect(rewritten.has(p), p).toBe(false);
  });
});

describe("public/404.html", () => {
  it("exists, is not indexed, and leads back into the site", () => {
    const html = read("../public/404.html");
    expect(html).toMatch(/<meta name="robots" content="noindex">/);
    expect(html).toMatch(/href="\/"/);
  });
});
