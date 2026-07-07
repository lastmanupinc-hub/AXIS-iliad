// ─── Sovereign web-research backend (WO-12) ──────────────────────
//
// Drop-in AXIS-owned backend for iliad_web_research / iliad_web_research_crawl:
// SSRF-guarded fetch → robots.txt → per-host politeness → zero-dep readability →
// markdown, plus a same-origin BFS crawl frontier. Same return shapes as the
// Firecrawl functions in web-research.ts (ScrapeResult / CrawlResult), so the
// MCP outputSchema and PRICING_TIERS rows are untouched.
//
// Honest scope: static HTML only — no JavaScript rendering. Client-rendered SPA
// pages may extract thin/empty content; the Firecrawl backend flag remains for
// those (AXIS_WEB_RESEARCH_BACKEND=firecrawl).

import type { CrawlPage, CrawlResult, ScrapeResult } from "./web-research.js";
import {
  assertPublicUrl,
  awaitHostSlot,
  fetchRobots,
  isPathAllowed,
  sovereignFetch,
  SovereignFetchError,
  type RobotsRules,
  type SovereignFetchResult,
} from "./web-fetch-sovereign.js";
import { extractReadable, type ExtractedDoc } from "./html-extract.js";

/** text/html, application/xhtml+xml, an XML feed, or a missing header all get the readability pass. */
function isHtmlLike(contentType: string): boolean {
  return contentType === "" || contentType.includes("html") || contentType.includes("xml");
}

function pageMetadata(doc: ExtractedDoc, res: SovereignFetchResult): Record<string, unknown> {
  return {
    ...doc.metadata,
    title: doc.title,
    status: res.status,
    content_type: res.contentType,
    truncated: res.truncated,
    backend: "sovereign",
  };
}

/** Strip the fragment; keep origin + path + query as the dedupe identity. */
function normalizeUrl(url: URL): string {
  const u = new URL(url.href);
  u.hash = "";
  return u.href;
}

/**
 * Owned single-page scrape: vet the URL, honor robots.txt + politeness, fetch
 * (redirects re-validated, byte-capped), extract readable markdown. Runs with
 * NO third-party key.
 */
export async function sovereignScrape(url: string, onlyMainContent = true): Promise<ScrapeResult> {
  const target = await assertPublicUrl(url);
  const robots = await fetchRobots(target.origin);
  if (!isPathAllowed(robots, target.pathname)) {
    throw new SovereignFetchError(
      "robots_disallowed",
      `web-research: ${target.href} is disallowed by ${target.origin}/robots.txt for this crawler.`,
    );
  }
  await awaitHostSlot(target.host, robots.crawlDelayMs);
  const res = await sovereignFetch(target.href);
  if (!isHtmlLike(res.contentType)) {
    // Plain-text (or other non-HTML) bodies pass through as-is — still useful for research.
    return {
      url: res.url,
      markdown: res.html,
      metadata: {
        title: "",
        status: res.status,
        content_type: res.contentType,
        truncated: res.truncated,
        backend: "sovereign",
      },
    };
  }
  const doc = extractReadable(res.html, res.url, onlyMainContent);
  return { url: res.url, markdown: doc.markdown, metadata: pageMetadata(doc, res) };
}

/**
 * Owned same-origin BFS crawl: dedupe by fragment-stripped URL, skip
 * robots-disallowed paths, honor per-host politeness, stop at `limit` pages.
 * Off-origin links are never enqueued, and a redirect that lands off-origin
 * drops the page rather than leaking the crawl to another host. Fetch or
 * extraction failures skip the page (best-effort, like a real crawler).
 */
export async function sovereignCrawl(url: string, limit: number, onlyMainContent = true): Promise<CrawlResult> {
  const start = await assertPublicUrl(url);
  const origin = start.origin;
  const robots: RobotsRules = await fetchRobots(origin);
  const cap = Math.max(1, Math.min(100, Math.floor(limit)));

  const startKey = normalizeUrl(start);
  const queue: string[] = [startKey];
  const enqueued = new Set<string>([startKey]);
  const emitted = new Set<string>();
  const pages: CrawlPage[] = [];

  while (queue.length > 0 && pages.length < cap) {
    const nextHref = queue.shift() as string;
    const next = new URL(nextHref);
    if (!isPathAllowed(robots, next.pathname)) continue;
    await awaitHostSlot(next.host, robots.crawlDelayMs);

    let res: SovereignFetchResult;
    try {
      res = await sovereignFetch(next.href);
    } catch {
      continue; // unreachable/blocked page — skip, don't fail the whole crawl
    }
    if (res.status < 200 || res.status >= 300) continue;
    if (!isHtmlLike(res.contentType)) continue;

    let finalUrl: URL;
    try {
      finalUrl = new URL(res.url);
    } catch {
      continue;
    }
    if (finalUrl.origin !== origin) continue; // redirect escaped the origin — drop
    const finalKey = normalizeUrl(finalUrl);
    if (emitted.has(finalKey)) continue; // two queued URLs redirected to one page
    emitted.add(finalKey);

    const doc = extractReadable(res.html, res.url, onlyMainContent);
    pages.push({ url: res.url, markdown: doc.markdown, metadata: pageMetadata(doc, res) });

    for (const link of doc.links) {
      let linkUrl: URL;
      try {
        linkUrl = new URL(link);
      } catch {
        continue;
      }
      if (linkUrl.origin !== origin) continue; // same-origin frontier only
      const key = normalizeUrl(linkUrl);
      if (enqueued.has(key)) continue;
      if (!isPathAllowed(robots, linkUrl.pathname)) continue;
      enqueued.add(key);
      queue.push(key);
    }
  }
  return { url, pages_crawled: pages.length, pages };
}
