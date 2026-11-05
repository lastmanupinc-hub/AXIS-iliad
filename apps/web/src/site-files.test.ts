/**
 * The web host's security and agent files (the site standard, 2026-11-04: sec.csp, plus.csp_reports,
 * plus.security_txt, seo.llms). The live grader reads the deployed site; these hold the source to the same rules.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
// @ts-expect-error: a plain .mjs build script with no type declarations; its exports are exercised below.
import { headersPolicy, directives, policyProblems, pageProblems } from "../scripts/csp-check.mjs";
import { PROGRAMS } from "./programs.ts";
import { runInNewContext } from "node:vm";
import { BOOTSTRAP, BOOTSTRAP_HASH, withBootstrap } from "./plugins/csp-bootstrap.ts";

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

describe("the CSP's root of trust (Cloudflare Zaraz, 2026-11-04)", () => {
  const policy: string = headersPolicy(read("../public/_headers"));
  const script = directives(policy)["script-src"];

  it("trusts the bootstrap by its hash and what it creates through 'strict-dynamic'", () => {
    expect(script).toContain("'strict-dynamic'");
    expect(script).toContain(BOOTSTRAP_HASH);
    expect(pageProblems(`<script data-module="/assets/a.js">${BOOTSTRAP}</script>`, script)).toEqual([]);
  });

  it("allows no edge-injected beacon (the estate turns it off where Zaraz measures)", () => {
    expect(policy).not.toContain("cloudflareinsights");
  });

  it("moves Vite's entry tag into the bootstrap at the end of the body, after #root", () => {
    const built = '<html><head><script type="module" crossorigin src="/assets/index-x.js"></script></head><body><div id="root"></div></body></html>';
    const out = withBootstrap(built, ["/consent.js"]);
    expect(out).not.toContain('<script type="module"');
    expect(out).toContain(`<script data-module="/assets/index-x.js" data-src="/consent.js">${BOOTSTRAP}</script>`);
    expect(out.indexOf('<div id="root">')).toBeLessThan(out.indexOf("data-module"));
    expect(() => withBootstrap(built.replace("</head>", '<link rel="modulepreload" href="/assets/v.js"></head>'), [])).toThrow(/modulepreload/);
  });
});

describe("public/consent.js", () => {
  const code = read("../public/consent.js");

  /** Runs consent.js against a stub browser; returns the scripts it added and what it left in sessionStorage. */
  function run(nav: { globalPrivacyControl?: boolean; doNotTrack?: string }) {
    const added: { src: string }[] = [];
    const store = new Map<string, string>();
    const listeners: string[] = [];
    const win: Record<string, unknown> = {
      sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
    };
    const document = {
      createElement: () => ({ src: "", async: false, referrerPolicy: "", addEventListener: () => {} }),
      head: { appendChild: (e: { src: string }) => added.push(e) },
      addEventListener: (type: string) => listeners.push(type),
    };
    runInNewContext(code, { window: win, navigator: nav, document, Promise, JSON });
    return { added, store, win, listeners };
  }

  it("adds the Zaraz loader when the browser sends no privacy signal", () => {
    expect(run({}).added.map((e) => e.src)).toEqual(["/cdn-cgi/zaraz/i.js"]);
  });

  it("adds nothing under Global Privacy Control or Do Not Track, and keeps no key event", async () => {
    for (const nav of [{ globalPrivacyControl: true }, { doNotTrack: "1" }]) {
      const r = run(nav);
      expect(r.added, JSON.stringify(nav)).toEqual([]);
      await (r.win.axisKeyEvent as (n: string) => Promise<void>)("account_created");
      expect(r.store.size, JSON.stringify(nav)).toBe(0);
    }
  });

  it("holds a key event until the loader is there, then sends it once", async () => {
    const r = run({});
    await (r.win.axisKeyEvent as (n: string) => Promise<void>)("account_created");
    expect(JSON.parse(r.store.get("axis_key_events")!)).toEqual(["account_created"]);
    const sent: string[] = [];
    r.win.zaraz = { track: (n: string) => { sent.push(n); return Promise.resolve(); } };
    await (r.win.axisKeyEvent as (n: string) => Promise<void>)("account_created");
    expect(sent).toEqual(["account_created"]);
    expect(r.store.has("axis_key_events")).toBe(false);
  });

  it("listens for the Privacy choices link", () => {
    expect(run({}).listeners).toContain("click");
    expect(code).toContain("[data-privacy-choices]");
    expect(code).toContain("zaraz.consent.modal = true");
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

describe("public/.well-known/security.txt", () => {
  const txt = read("../public/.well-known/security.txt");

  it("names the estate's security contact and its own canonical URL", () => {
    expect(txt).toMatch(/^Contact: mailto:jonathan@jonathanarvay\.com$/m);
    expect(txt).toMatch(/^Canonical: https:\/\/iliad\.trustfabric\.ai\/\.well-known\/security\.txt$/m);
    expect(txt).toMatch(/^Preferred-Languages: en$/m);
  });

  it("expires in the future, and under a year from now (RFC 9116)", () => {
    const m = /^Expires: (\S+)$/m.exec(txt);
    expect(m).not.toBeNull();
    const ms = new Date(m![1]).getTime() - Date.now();
    expect(ms).toBeGreaterThan(30 * 86400_000); // renew it a month before it lapses
    expect(ms).toBeLessThan(366 * 86400_000);
  });
});

describe("public/llms.txt", () => {
  const txt = read("../public/llms.txt");

  it("opens with a markdown title", () => {
    expect(txt.split("\n")[0]).toBe("# Axis' Iliad");
  });

  it("lists every program the site has, and no other", () => {
    const listed = [...txt.matchAll(/\/programs\/([a-z-]+)\//g)].map((m) => m[1]);
    expect(new Set(listed)).toEqual(new Set(PROGRAMS.map((p) => p.id)));
  });

  it("states no usage numbers", () => {
    expect(txt).not.toMatch(/\b\d[\d,.]*\+?\s*(users|developers|teams|customers|repos analyzed|runs)\b/i);
  });
});
