// Emit the storefront: one page + one favicon per product, from the real
// registry and the real generator manifest.
//
// Plain .mjs run with `node`, matching every other script in this directory —
// deliberately NOT a .ts needing `npx tsx`, which downloads a package from the
// npm registry mid-run and makes an offline build impossible.
//
//   node scripts/build-storefront.mjs [outDir]      # default: .storefront-dist
//
// Writing files is all this does. Deploying them and pointing DNS at them are
// separate, deliberate steps — publishing ~20 public URLs is not a side effect
// of a build script.
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const OUT = resolve(process.argv[2] ?? join(ROOT, ".storefront-dist"));

// pathToFileURL, not a bare path: on Windows a dynamic import of "c:\..." is
// rejected as an unsupported URL scheme ('c:').
const dist = (f) => pathToFileURL(join(ROOT, "packages/generator-core/dist", f)).href;
const core = await import(dist("index.js"));
const manifest = await import(dist("program-manifest.js"));
const registry = await import(dist("product-registry.js"));

const { generateStorefrontPage, generateStorefrontFavicon, generateStorefrontRobots, generateStorefrontLlmsTxt, generateStorefrontSitemap, AVERIONICS } = core;
const { GENERATOR_PROGRAMS } = manifest;
const { PRODUCT_REGISTRY } = registry;

const products = Array.isArray(PRODUCT_REGISTRY) ? PRODUCT_REGISTRY : Object.values(PRODUCT_REGISTRY);
if (products.length === 0) {
  console.error("refusing to build: PRODUCT_REGISTRY is empty");
  process.exit(1);
}

function artifactsFor(product) {
  const out = [];
  for (const [generator, program] of Object.entries(GENERATOR_PROGRAMS)) {
    if (product.programs.includes(program)) out.push(generator);
  }
  return out.sort();
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let pages = 0;
const inputs = [];
for (const product of products) {
  const input = { product, artifacts: artifactsFor(product), palette: AVERIONICS };
  inputs.push(input);
  const page = generateStorefrontPage(input);
  const icon = generateStorefrontFavicon(input);

  const pagePath = join(OUT, page.path);
  mkdirSync(dirname(pagePath), { recursive: true });
  writeFileSync(pagePath, page.content, "utf8");
  // Favicon at the root, matching the page's absolute /<id>-favicon.svg href.
  writeFileSync(join(OUT, icon.path), icon.content, "utf8");
  pages++;
  console.log(`  ${product.id.padEnd(20)} ${input.artifacts.length} artifacts  ->  ${page.path}`);
}

// ─── ext_02: Cloudflare Agent Readiness ─────────────────────────────────────
// One robots.txt + one llms.txt at the dist root — _worker.js only rewrites
// "/", so both resolve identically on all 21 subdomains with no routing change.
const robots = generateStorefrontRobots();
writeFileSync(join(OUT, robots.path), robots.content, "utf8");
const llms = generateStorefrontLlmsTxt(inputs);
writeFileSync(join(OUT, llms.path), llms.content, "utf8");
console.log(`  ${"robots.txt".padEnd(20)} Content-Signal directive  ->  ${robots.path}`);
console.log(`  ${"llms.txt".padEnd(20)} ${inputs.length} products  ->  ${llms.path}`);

// sitemap.xml — closes the dangling Sitemap: reference robots.txt already makes.
const sitemap = generateStorefrontSitemap(inputs);
writeFileSync(join(OUT, sitemap.path), sitemap.content, "utf8");
console.log(`  ${"sitemap.xml".padEnd(20)} ${inputs.length} urls  ->  ${sitemap.path}`);

// ─── host routing ────────────────────────────────────────────────────────────
// Every product page lives at /<id>/, but each product's SUBDOMAIN must serve
// its own page at the root: theme.trustfabric.ai/ is the theme page, not the
// index of all products. Pages advanced mode (_worker.js) is the one mechanism
// that can see the Host header, so the mapping is done here rather than with
// _redirects (which is path-based only).
//
// Unknown hosts — the raw *.pages.dev preview, or the apex — fall through to the
// normal asset served for that path, so the preview index keeps working.
// Keyed by the registry's ACTUAL subdomain label, which is NOT always the product
// id: agentic-purchasing is sold at commerce.trustfabric.ai. Assuming label === id
// would have served the wrong page there, so the map is built from the registry.
const hostMap = Object.fromEntries(products.map((p) => [p.subdomain.split(".")[0], p.id]));
writeFileSync(
  join(OUT, "_worker.js"),
  `const HOSTS = ${JSON.stringify(hostMap)};
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const id = HOSTS[url.hostname.split(".")[0]];
    // Only the root is rewritten; deeper paths and assets (favicons) are served
    // as-is so /theme-favicon.svg still resolves from any host.
    if (id && (url.pathname === "/" || url.pathname === "")) {
      return env.ASSETS.fetch(new Request(new URL("/" + id + "/", url), request));
    }
    return env.ASSETS.fetch(request);
  },
};
`,
  "utf8",
);

// An index so the deployed preview is navigable before any DNS exists.
const links = products
  .map((p) => `<li><a href="/${p.id}/">${p.name}</a></li>`)
  .join("");
writeFileSync(
  join(OUT, "index.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AXIS' Iliad — storefront preview</title><style>body{margin:0;background:${AVERIONICS.surface};color:${AVERIONICS.ink};font-family:system-ui,sans-serif;line-height:1.6}main{max-width:48rem;margin:0 auto;padding:4rem 1.5rem}a{color:${AVERIONICS.primary}}</style></head><body><main><h1>Storefront preview</h1><p>${pages} product pages, generated from the registry.</p><ul>${links}</ul></main></body></html>`,
  "utf8",
);

console.log(`\n${pages} pages + ${pages} favicons -> ${OUT}`);
