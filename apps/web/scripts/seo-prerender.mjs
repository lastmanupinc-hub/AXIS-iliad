#!/usr/bin/env node
// VENDORED from AXIS Launch packages/axis-seo@0.1.0 bin/ (2026-08-08) - see
// src/plugins/axis-seo/vitePlugin.ts for why the file: dependency had to go.
// stdlib-only. ONE deliberate change from upstream, marked AXIS-CHANGE below.
/**
 * axis-seo-prerender — render a built SPA's routes into real crawlable HTML.
 *
 *   npx axis-seo-prerender dist --routes seo.routes.ts
 *
 * Serves dist/ locally, then drives an already-installed Chrome/Edge with
 * --headless --dump-dom to capture each route's fully rendered DOM, and writes
 * the markup back into that route's HTML file.
 *
 * Why a real browser rather than renderToString or a DOM shim: these apps use a
 * custom hash router, read localStorage during render, and code-split heavily.
 * SSR crashes on the browser APIs and lightweight DOMs can't execute the split
 * module graph. Chrome handles all of it with zero changes to app code.
 *
 * It captures the app's OWN markup — nothing injected, fabricated, or hidden.
 * This is what a user sees, made readable by crawlers that don't run JS.
 */
import { readFileSync, writeFileSync, existsSync, statSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const run = promisify(execFile);
const args = process.argv.slice(2);
const distDir = args[0];
const routesArg = args[args.indexOf("--routes") + 1];
const budget = args.includes("--wait") ? Number(args[args.indexOf("--wait") + 1]) : 5000;
const minChars = args.includes("--min") ? Number(args[args.indexOf("--min") + 1]) : 200;

if (!distDir || !routesArg) {
  console.error("usage: axis-seo-prerender <dist> --routes <file> [--wait ms] [--min chars]");
  process.exit(2);
}

const BROWSERS = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const browser = BROWSERS.find((p) => existsSync(p));
if (!browser) {
  // AXIS-CHANGE: upstream hard-exits(2) here. In THIS repo the build must be
  // self-contained and CI runs in browserless containers, so a missing browser
  // is a LOUD SKIP, not a failure: the vite plugin has already written every
  // route's head (title/canonical/OG/JSON-LD) + sitemap. Body prerender is
  // best-effort enrichment wherever Chrome/Edge exists (set CHROME_PATH).
  console.warn("[seo-prerender] SKIPPED - no Chrome/Edge found (set CHROME_PATH to enable body prerender). Head SEO is unaffected.");
  process.exit(0);
}

let routes;
const routesPath = resolve(routesArg);
if (/\.tsx?$/.test(routesPath)) {
  const src = readFileSync(routesPath, "utf8");
  routes = [...src.matchAll(/path:\s*["'`]([^"'`]+)["'`]/g)].map((m) => ({ path: m[1] }));
} else {
  const mod = await import(pathToFileURL(routesPath).href);
  routes = mod.seoRoutes ?? mod.routes ?? mod.default;
}
if (!routes?.length) { console.error("no routes in", routesArg); process.exit(2); }

const MIME = { ".html":"text/html", ".js":"text/javascript", ".mjs":"text/javascript", ".css":"text/css",
  ".json":"application/json", ".svg":"image/svg+xml", ".png":"image/png", ".jpg":"image/jpeg",
  ".webp":"image/webp", ".ico":"image/x-icon", ".woff2":"font/woff2", ".woff":"font/woff", ".txt":"text/plain" };

const server = createServer((req, res) => {
  const p = decodeURIComponent(req.url.split("?")[0]);
  let file = join(distDir, p);
  try { if (statSync(file).isDirectory()) file = join(file, "index.html"); } catch { /* best-effort: absence handled by caller */ }
  if (!existsSync(file)) file = join(distDir, "index.html");
  try {
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const profile = mkdtempSync(join(tmpdir(), "axis-seo-"));

let ok = 0, failed = 0;
for (const route of routes) {
  const clean = route.path.replace(/^\/+|\/+$/g, "");
  const file = clean ? join(distDir, clean, "index.html") : join(distDir, "index.html");
  if (!existsSync(file)) { console.log(`SKIP  ${route.path} (run the axisSeo vite plugin first)`); continue; }

  try {
    const { stdout } = await run(browser, [
      "--headless", "--disable-gpu", "--no-sandbox", "--disable-extensions", "--no-first-run",
      `--user-data-dir=${profile}`, `--virtual-time-budget=${budget}`, "--dump-dom",
      base + route.path,
    ], { maxBuffer: 64 * 1024 * 1024, timeout: budget + 25000, windowsHide: true });

    const rootMatch = stdout.match(/<div id="root"[^>]*>([\s\S]*?)<\/div>\s*(?:<script|<\/body)/i);
    const rendered = rootMatch ? rootMatch[1] : "";
    const text = rendered.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    if (text.length < minChars) { console.log(`FAIL  ${route.path} — ${text.length} chars`); failed++; continue; }

    const html = readFileSync(file, "utf8");
    const out = html.replace(/(<div id="root">)([\s\S]*?)(<\/div>)/, (_m, a, _b, c) => `${a}${rendered}${c}`);
    writeFileSync(file, out, "utf8");
    console.log(`OK    ${route.path} — ${text.length} chars`);
    ok++;
  } catch (e) {
    console.log(`FAIL  ${route.path} — ${String(e.message).split("\n")[0].slice(0, 110)}`);
    failed++;
  }
}

server.close();
try { rmSync(profile, { recursive: true, force: true }); } catch { /* best-effort: absence handled by caller */ }
// AXIS-CHANGE: record that body prerender RAN, so the audit can require body
// content only when it was actually produced. Without this, a browserless
// container (docker CI) skips prerender and the audit then fails every page
// on empty bodies — punishing the environment, not the code.
writeFileSync(join(distDir, ".axis-prerendered"), new Date().toISOString());
console.log(`\nprerendered ${ok}/${ok + failed}`);
process.exit(failed && ok === 0 ? 1 : 0);
