// csp-check — the built site runs under its enforced Content-Security-Policy with no unsafe script source (the site
// standard's sec.csp and plus.csp_reports, 2026-11-04). Run after the build, on dist/:
//
//   node scripts/csp-check.mjs dist
//
// It refuses, naming the file:
//   - a script-src (or default-src) with 'unsafe-inline', 'unsafe-eval', a wildcard or a bare scheme;
//   - an object-src other than 'none', or no report-uri / report-to;
//   - an inline <script> that a browser would run whose sha256 is not in script-src (a JSON-LD or other data block
//     is never run, so the CSP does not govern it);
//   - an inline event handler (onclick=...) or a javascript: URL, which no hash or nonce can allow.
// Every page is static text from the prerender, so a hash, when one is ever needed, is fixed at build time.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const dist = process.argv[2] ?? "dist";
const fail = [];

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".html") ? [join(dir, e.name)] : []);
}

/** The CSP the `/*` block of a Pages _headers file sends. */
export function headersPolicy(text) {
  let inAll = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\S/.test(line)) inAll = line.trim() === "/*";
    const m = /^\s+Content-Security-Policy:\s*(.+)$/i.exec(line);
    if (inAll && m) return m[1].trim();
  }
  return null;
}

export function directives(policy) {
  const out = {};
  for (const part of policy.split(";")) {
    const bits = part.trim().split(/\s+/).filter(Boolean);
    if (bits.length && !(bits[0].toLowerCase() in out)) out[bits[0].toLowerCase()] = bits.slice(1);
  }
  return out;
}

/** Why a policy is unsafe for scripts, or [] when it is not. */
export function policyProblems(policy) {
  const d = directives(policy);
  const problems = [];
  const script = d["script-src"] ?? d["default-src"];
  if (!script) problems.push("neither script-src nor default-src is set");
  else {
    const low = script.map((s) => s.toLowerCase());
    for (const bad of ["'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'"]) if (low.includes(bad)) problems.push(`script-src allows ${bad}`);
    const loose = low.filter((s) => ["*", "http:", "https:", "data:", "blob:"].includes(s));
    if (loose.length) problems.push(`script-src allows ${loose.join(" ")}`);
  }
  const obj = d["object-src"] ?? d["default-src"];
  if (!obj || obj.join(" ").toLowerCase() !== "'none'") problems.push("object-src is not 'none'");
  if (!d["report-uri"] && !d["report-to"]) problems.push("no report-uri or report-to");
  return problems;
}

// The script types a browser runs; anything else (application/ld+json, application/json, text/template) is data.
const RUNS = new Set(["", "text/javascript", "application/javascript", "module", "text/ecmascript", "application/ecmascript"]);

/** The problems one HTML page has under the given script-src sources. */
export function pageProblems(html, scriptSrc) {
  const problems = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const attrs = m[1];
    if (/\ssrc\s*=/i.test(attrs)) continue;
    const type = (/\stype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1] ?? "").toLowerCase();
    if (!RUNS.has(type)) continue;
    const hash = `'sha256-${createHash("sha256").update(m[2], "utf8").digest("base64")}'`;
    if (!scriptSrc.includes(hash)) problems.push(`an inline script whose hash is not in script-src (${m[2].length} chars)`);
  }
  for (const m of html.matchAll(/<[a-z][a-z0-9-]*\b[^>]*?\son[a-z]+\s*=/gi)) problems.push(`an inline event handler (${m[0].split(/\s/)[0]}>)`);
  if (/\s(?:href|src|action|formaction)\s*=\s*["']?\s*javascript:/i.test(html)) problems.push("a javascript: URL");
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const policy = headersPolicy(readFileSync(join(dist, "_headers"), "utf8"));
  if (!policy) {
    console.error("[csp-check] FAIL: dist/_headers sends no Content-Security-Policy for /*");
    process.exit(1);
  }
  for (const p of policyProblems(policy)) fail.push(`_headers: ${p}`);
  const d = directives(policy);
  const scriptSrc = d["script-src"] ?? d["default-src"] ?? [];
  const pages = walk(dist);
  for (const f of pages) {
    for (const p of pageProblems(readFileSync(f, "utf8"), scriptSrc)) fail.push(`${relative(dist, f).replace(/\\/g, "/")}: ${p}`);
  }
  if (fail.length) {
    for (const f of fail) console.error(`[csp-check] FAIL: ${f}`);
    process.exit(1);
  }
  console.log(`[csp-check] OK: ${pages.length} pages, no inline script outside script-src, no unsafe script source, reports go to ${(d["report-uri"] ?? d["report-to"]).join(" ")}`);
}
