#!/usr/bin/env node
// VENDORED from AXIS Launch packages/axis-seo@0.1.0 bin/ (2026-08-08) - see
// src/plugins/axis-seo/vitePlugin.ts for why the file: dependency had to go.
// stdlib-only. ONE deliberate change from upstream, marked AXIS-CHANGE below.
/**
 * axis-seo-audit — check built pages the way a crawler sees them.
 *
 *   npx axis-seo-audit dist                       # audit every .html in dist/
 *   npx axis-seo-audit https://iliad.trustfabric.ai/docs
 *
 * Exits non-zero if any page fails, so it can gate a build or CI.
 * Parses raw HTML only — no JS execution — matching what AI and social
 * crawlers actually do.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const strip = (html) =>
  html.replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ").trim();

function audit(html, url) {
  const problems = [];
  const body = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/i) || [undefined, ""])[1];
  const text = strip(body);
  const headings = (body.match(/<h[1-3][\s>]/gi) || []).length;
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim() || null;
  const desc = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || [])[1] || null;
  const canon = (html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i) || [])[1] || null;
  const ld = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
  let ldValid = true, hasPerson = false;
  for (const b of ld) {
    try {
      const parsed = JSON.parse(b.replace(/^[\s\S]*?>/, "").replace(/<\/script>$/i, ""));
      if (JSON.stringify(parsed).includes("jonathanarvay.com/#person")) hasPerson = true;
    } catch { ldValid = false; }
  }
  const links = (body.match(/<a[^>]+href=/gi) || []).length;

  if (BODY_MODE && text.length < 200) problems.push(`body text only ${text.length} chars — crawlers see nothing`);
  if (BODY_MODE && !headings) problems.push("no heading (h1-h3) in raw HTML");
  if (!title) problems.push("no <title>");
  if (!desc) problems.push("no meta description");
  if (!canon) problems.push("no canonical");
  if (!ld.length) problems.push("no JSON-LD");
  else if (!ldValid) problems.push("JSON-LD does not parse");
  else if (!hasPerson) problems.push("JSON-LD missing Person attribution");
  if (BODY_MODE && !links) problems.push("no links for a crawler to follow");

  return { url, ok: !problems.length, text: text.length, headings, ld: ld.length, links, problems };
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (e.endsWith(".html")) out.push(p);
  }
  return out;
}

const target = process.argv[2];
// AXIS-CHANGE: body-content checks apply only when body prerender actually ran
// (seo-prerender.mjs writes dist/.axis-prerendered on completion). Browserless
// environments (docker CI) still get the full HEAD audit — title, description,
// canonical, JSON-LD, Person attribution — which the vite plugin guarantees
// everywhere. Without this gate, the audit fails every page on empty bodies in
// exactly the environments that can never render bodies.
const BODY_MODE = existsSync(join(target ?? "", ".axis-prerendered"));
if (!BODY_MODE) console.warn("[seo-audit] head-only mode: no .axis-prerendered marker (body prerender did not run here)");
if (!target) {
  console.error("usage: axis-seo-audit <dist-dir | url>");
  process.exit(2);
}

const results = [];
if (/^https?:\/\//.test(target)) {
  const res = await fetch(target, { headers: { "user-agent": "axis-seo-audit (raw HTML, no JS)" } });
  results.push(audit(await res.text(), target));
} else if (statSync(target).isFile()) {
  results.push(audit(readFileSync(target, "utf8"), target));
} else {
  for (const f of walk(target)) results.push(audit(readFileSync(f, "utf8"), relative(target, f)));
}

let failed = 0;
for (const r of results) {
  const mark = r.ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${r.url}`);
  console.log(`      text:${r.text}  headings:${r.headings}  json-ld:${r.ld}  links:${r.links}`);
  for (const p of r.problems) console.log(`      - ${p}`);
  if (!r.ok) failed++;
}
console.log(`\n${results.length - failed}/${results.length} pages crawlable`);
process.exit(failed ? 1 : 0);
