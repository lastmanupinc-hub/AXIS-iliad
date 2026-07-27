import { useEffect } from "react";
import type { RouteDef } from "./routes.tsx";

// ─── useDocumentHead — per-page title/description/canonical ──────
//
// Every route shared one <title>, one description and one canonical URL,
// because index.html is the only place they were set and this is a single
// bundle. So a search result for the Programs page, the Docs page and the
// pricing page all read identically, and every URL declared the site root as
// its canonical — which actively tells a crawler not to index the sub-pages
// separately.
//
// Deliberately hand-rolled: react-helmet (or any head manager) is a new
// runtime dependency, and this repo requires discussion before adding one.
// The whole job is three DOM writes, so a dependency would be a poor trade.
//
// Honest scope: this runs client-side. Google executes JS and will read it;
// crawlers that don't will still see index.html's site-wide defaults. That is
// a real limitation, not a fixed one — genuine per-page HTML needs
// prerendering or SSR, which is a much larger change. This is strictly better
// than the previous state and does not pretend to be more.

const WEB_ORIGIN = "https://iliad.trustfabric.ai";

/** index.html's values — restored for any route that declares no SEO of its own. */
const DEFAULTS = {
  title: document.title,
  description:
    document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "",
  canonical: WEB_ORIGIN,
};

function setMeta(selector: string, attr: "content" | "href", value: string) {
  const el = document.querySelector(selector);
  if (el) el.setAttribute(attr, value);
}

/**
 * Apply a route's SEO metadata to the document head, falling back to
 * index.html's defaults. Also updates the og:/twitter: twins so a shared link
 * previews as the page you were actually on rather than the site root.
 */
export function useDocumentHead(def: RouteDef, hash: string): void {
  useEffect(() => {
    const seo = def.seo;
    const title = seo?.title ?? DEFAULTS.title;
    const description = seo?.description ?? DEFAULTS.description;
    // Canonical follows the real address bar: the hash route when there is
    // one, the bare origin for home. A route with no SEO block keeps the
    // site-root canonical, which is correct for app screens that should not
    // be indexed as separate destinations.
    const canonical = seo ? `${WEB_ORIGIN}/${hash ? `#${hash}` : ""}` : DEFAULTS.canonical;

    document.title = title;
    setMeta('meta[name="description"]', "content", description);
    setMeta('link[rel="canonical"]', "href", canonical);
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", description);
    setMeta('meta[property="og:url"]', "content", canonical);
    setMeta('meta[name="twitter:title"]', "content", title);
    setMeta('meta[name="twitter:description"]', "content", description);
  }, [def, hash]);
}
