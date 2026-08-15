// VENDORED from the AXIS Launch repo: packages/axis-seo@0.1.0 (2026-08-08).
//
// WHY A COPY LIVES HERE. apps/web's prerender wiring (3771206) originally
// depended on it via `"@axis/seo": "file:../../../AXIS Launch/packages/axis-seo"`
// - a path OUTSIDE this repository. That broke every fresh clone and every CI
// container (ERR_PNPM_OUTDATED_LOCKFILE -> 3 consecutive red runs on main), and
// left a rogue npm package-lock.json inside a pnpm workspace. A repo must be
// self-contained to be buildable; a file: dependency into a sibling checkout
// never is.
//
// Only the closure this repo actually consumes is vendored: the vite plugin,
// schema.ts + config.ts it imports, and schema.test.ts so the vendored code
// keeps its coverage. The full axis-seo package (React components, audit) stays
// in AXIS Launch - if it is ever published to npm, delete this directory and
// depend on the published version.
//
/**
 * vitePlugin.ts — the universal drop-in.
 *
 * Works with React, Svelte, Vue, or vanilla, because it transforms the built
 * HTML rather than hooking a component tree. One entry in vite.config.ts gives
 * every public route its own real HTML file with its own title, description,
 * canonical, OG tags, and a JSON-LD graph carrying the canonical Person and
 * Organization nodes.
 *
 * What it fixes:
 *   • every route returning one shared <title> and canonical
 *   • no per-page OG tags (so every share preview looks identical)
 *   • no entity attribution in machine-readable form
 *
 * What it does NOT fix on its own: an empty <body>. Content still has to be
 * rendered into HTML — vite-react-ssg for the React apps, or hand-authored
 * static pages. This plugin makes the head correct for every framework; the
 * body is framework-specific. See seo/CRAWLABILITY-AUDIT.md.
 *
 * It never injects hidden text or invisible links. Head metadata and JSON-LD
 * only — the sanctioned machine-readable layer.
 */

import type { Plugin } from "vite";
import { buildSchema, buildMeta, type PageKind, type Breadcrumb, type FaqItem } from './schema.js';
import type { SeoConfig } from './config.js';

export interface RouteSeo {
  /** Site-relative path, e.g. "/docs". "/" is the home page. */
  path: string;
  title: string;
  description: string;
  kind?: PageKind;
  image?: string;
  product?: string;
  breadcrumbs?: Breadcrumb[];
  /** Only when the Q&A is visibly on the page. */
  faq?: FaqItem[];
  datePublished?: string;
  dateModified?: string;
}

export interface AxisSeoOptions {
  /** The entity graph, from defineSeoConfig(). */
  config: SeoConfig;
  /** Public routes to emit. Do NOT list authenticated app routes. */
  routes: RouteSeo[];
  /** Also write sitemap.xml + robots.txt. Default true. */
  emitSitemap?: boolean;
}

const SEO_MARK = "<!--axis-seo-->";

/** Strips tags this plugin owns so re-running is idempotent. */
function stripManaged(head: string): string {
  return head
    .replace(/<title>[\s\S]*?<\/title>/gi, "")
    .replace(/<link[^>]+rel=["']canonical["'][^>]*>/gi, "")
    .replace(/<meta[^>]+(?:name|property)=["'](?:description|og:[^"']*|twitter:[^"']*|author|article:[^"']*)["'][^>]*>/gi, "")
    .replace(/<script[^>]+application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi, "");
}

function renderHead(route: RouteSeo, opts: AxisSeoOptions): string {
  const input = { ...route, config: opts.config };
  const meta = buildMeta(input);
  const schema = buildSchema(input);

  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

  const tags = [
    SEO_MARK,
    `<title>${esc(meta.title)}</title>`,
    `<link rel="canonical" href="${esc(meta.canonical)}">`,
    ...meta.meta.map((m) =>
      "name" in m
        ? `<meta name="${esc(m.name as string)}" content="${esc(m.content)}">`
        : `<meta property="${esc((m as { property: string }).property)}" content="${esc(m.content)}">`,
    ),
    `<script type="application/ld+json">${JSON.stringify(schema)}</script>`,
  ];
  return tags.join("\n    ");
}

export function axisSeo(opts: AxisSeoOptions): Plugin {
  const { emitSitemap = true } = opts;

  return {
    name: "axis-seo",
    apply: "build",
    enforce: "post",

    // Rewrite the shell for the home route, then emit one file per other route.
    generateBundle(_options, bundle) {
      const shellKey = Object.keys(bundle).find((k) => k.endsWith("index.html"));
      if (!shellKey) {
        this.warn("[axis-seo] no index.html in bundle — nothing to decorate");
        return;
      }
      const shellAsset = bundle[shellKey];
      if (shellAsset.type !== "asset") return;
      const shellHtml = String(shellAsset.source);

      const inject = (html: string, route: RouteSeo) => {
        const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
        if (!headMatch) return html;
        const cleaned = stripManaged(headMatch[1]);
        const newHead = `${cleaned.trimEnd()}\n    ${renderHead(route, opts)}\n  `;
        return html.replace(headMatch[1], newHead);
      };

      for (const route of opts.routes) {
        const isHome = route.path === "/" || route.path === "";
        const html = inject(shellHtml, route);
        if (isHome) {
          shellAsset.source = html;
        } else {
          const clean = route.path.replace(/^\/+|\/+$/g, "");
          this.emitFile({ type: "asset", fileName: `${clean}/index.html`, source: html });
        }
      }

      if (emitSitemap) {
        const urls = opts.routes
          .map((r) => {
            const loc = new URL(r.path, opts.config.siteUrl).toString();
            const mod = r.dateModified ? `<lastmod>${r.dateModified}</lastmod>` : "";
            return `  <url><loc>${loc}</loc>${mod}</url>`;
          })
          .join("\n");
        this.emitFile({
          type: "asset",
          fileName: "sitemap.xml",
          source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
        });
        this.emitFile({
          type: "asset",
          fileName: "robots.txt",
          source: `User-agent: *\nAllow: /\n\nSitemap: ${new URL("/sitemap.xml", opts.config.siteUrl).toString()}\n`,
        });
      }
    },
  };
}
