/**
 * The web host's security files (the site standard, 2026-11-04: sec.csp, plus.csp_reports). The live grader reads
 * the deployed site; these hold the source to the same rules.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
// @ts-expect-error: a plain .mjs build script with no type declarations; its exports are exercised below.
import { headersPolicy, directives, policyProblems, pageProblems } from "../scripts/csp-check.mjs";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");

describe("public/_headers CSP", () => {
  const policy: string = headersPolicy(read("../public/_headers"));

  it("is sent for every path", () => {
    expect(policy).toBeTruthy();
  });

  it("has no unsafe script source and object-src 'none'", () => {
    expect(policyProblems(policy)).toEqual([]);
    expect(directives(policy)["script-src"]).not.toContain("'unsafe-inline'");
  });

  it("reports violations to the estate's collector", () => {
    expect(directives(policy)["report-uri"]).toEqual(["https://launch.jonathanarvay.com/api/csp-report"]);
  });
});

describe("csp-check", () => {
  const src = ["'self'"];

  it("lets JSON-LD and same-origin bundles through", () => {
    const html = '<script type="application/ld+json">{"@type":"Thing"}</script><script type="module" src="/a.js"></script>';
    expect(pageProblems(html, src)).toEqual([]);
  });

  it("refuses an inline script that is not hashed, and accepts it once its hash is listed", () => {
    const html = "<script>console.log(1)</script>";
    expect(pageProblems(html, src)).toHaveLength(1);
    expect(pageProblems(html, [...src, "'sha256-CihokcEcBW4atb/CW/XWsvWwbTjqwQlE9nj9ii5ww5M='"])).toEqual([]);
  });

  it("refuses inline event handlers and javascript: URLs", () => {
    expect(pageProblems('<button onclick="x()">x</button>', src)).toHaveLength(1);
    expect(pageProblems('<a href="javascript:alert(1)">x</a>', src)).toHaveLength(1);
  });

  it("refuses 'unsafe-inline', 'unsafe-eval' and a bare scheme in script-src", () => {
    const base = "object-src 'none'; report-uri https://example.org/r; script-src 'self' ";
    expect(policyProblems(base + "'unsafe-inline'")).toHaveLength(1);
    expect(policyProblems(base + "'unsafe-eval'")).toHaveLength(1);
    expect(policyProblems(base + "https:")).toHaveLength(1);
  });
});
