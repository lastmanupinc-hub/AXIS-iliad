// csp-bootstrap — the one inline script every page carries, and the root of trust of the enforced CSP (2026-11-04).
//
// Why: Google Analytics runs through Cloudflare Zaraz (public/consent.js adds its loader only while counting is
// allowed). Zaraz's loader runs code its server returns as inline <script> elements it creates itself, which a list
// of hashes or hosts alone refuses, so script-src carries 'strict-dynamic' (as AXIS Launch's and lastmanup.org's do):
// a script that a trusted script creates is trusted, and host sources such as 'self' are ignored by browsers that
// support it. The trusted script is this bootstrap, allowed by its sha256 in public/_headers; it creates the app's
// entry module and the files named in data-src. A parser-inserted <script src> would be refused, so the build has
// none: this plugin takes Vite's entry tag out of the head and puts the bootstrap at the end of the body (a module it
// creates runs as soon as it loads, so #root must already be parsed). scripts/csp-check.mjs refuses a page whose
// inline script hash is not in script-src, so a change to BOOTSTRAP fails the build until _headers carries the new hash.
import { createHash } from "node:crypto";
import type { Plugin } from "vite";

export const BOOTSTRAP =
  '(function(){var s=document.currentScript;if(!s)return;function add(u,m){var e=document.createElement("script");' +
  'if(m){e.type="module";e.crossOrigin="";}else{e.async=false;}e.src=u;document.head.appendChild(e);}' +
  'var m=s.getAttribute("data-module");if(m)add(m,true);var l=(s.getAttribute("data-src")||"").split(" ");' +
  "for(var i=0;i<l.length;i++){if(l[i])add(l[i],false);}})();";

/** The script-src source that allows BOOTSTRAP. */
export const BOOTSTRAP_HASH = `'sha256-${createHash("sha256").update(BOOTSTRAP, "utf8").digest("base64")}'`;

const ENTRY = /\s*<script type="module" crossorigin src="([^"]+)"><\/script>/g;

/** Rewrites a built page: Vite's entry tag out, the bootstrap (loading it and `extra`, in order) in before </body>. */
export function withBootstrap(html: string, extra: string[]): string {
  const entries = [...html.matchAll(ENTRY)].map((m) => m[1]);
  if (entries.length !== 1) throw new Error(`[csp-bootstrap] expected one entry module tag, found ${entries.length}`);
  // A parser-inserted modulepreload is refused under 'strict-dynamic' too (and logged as a violation).
  if (/<link[^>]+rel=["']modulepreload["']/i.test(html)) throw new Error("[csp-bootstrap] a modulepreload link would be refused by the CSP");
  if (!html.includes("</body>")) throw new Error("[csp-bootstrap] no </body>");
  const tag = `<script data-module="${entries[0]}" data-src="${extra.join(" ")}">${BOOTSTRAP}</script>`;
  return html.replace(ENTRY, "").replace("</body>", `  ${tag}\n  </body>`);
}

export function cspBootstrap(extra: string[]): Plugin {
  return {
    name: "csp-bootstrap",
    apply: "build",
    transformIndexHtml: { order: "post", handler: (html) => withBootstrap(html, extra) },
  };
}
