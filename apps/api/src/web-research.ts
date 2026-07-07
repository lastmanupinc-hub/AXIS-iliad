// AXIS web research — shared core for the MCP tools iliad_web_research
// (single-page scrape) and iliad_web_research_crawl (multi-page crawl).
//
// The DEFAULT backend is AXIS's owned crawler (web-research-sovereign.ts):
// SSRF-guarded fetch + robots.txt + per-host politeness + zero-dep readability
// over node built-ins — no third-party key required. Honest scope: the owned
// path fetches STATIC HTML only (no JavaScript rendering, so client-rendered
// SPA pages may extract thin content), its readability pass is a text-density
// heuristic (lower fidelity than Mozilla Readability on adversarial layouts),
// and its SSRF guard resolves-then-fetches (a theoretical DNS-rebinding TOCTOU
// window — not a hardened security boundary).
//
// The Firecrawl proxy below is retained ONLY behind an explicit
// AXIS_WEB_RESEARCH_BACKEND=firecrawl selection (e.g. for JS-rendered pages).
// The _not_configured envelope is reachable ONLY when that backend is
// explicitly selected without FIRECRAWL_API_KEY.

const SCRAPE_URL = "https://api.firecrawl.dev/v0/scrape";
const CRAWL_URL = "https://api.firecrawl.dev/v0/crawl";
const SCRAPE_TIMEOUT_MS = 30_000;
const CRAWL_TIMEOUT_MS = 60_000;

export interface WebResearchNotConfigured {
  _not_configured: true;
  tool: string;
  reason: "firecrawl_not_configured";
  detail: string;
  remediation: string;
}

export interface ScrapeResult {
  url: string;
  markdown: string;
  metadata: Record<string, unknown>;
}

export interface CrawlPage {
  url: string;
  markdown: string;
  metadata: Record<string, unknown>;
}

export interface CrawlResult {
  url: string;
  pages_crawled: number;
  pages: CrawlPage[];
}

export function isWebResearchNotConfigured(v: unknown): v is WebResearchNotConfigured {
  return Boolean(v && typeof v === "object" && (v as { _not_configured?: unknown })._not_configured === true);
}

/** True when FIRECRAWL_API_KEY is configured — lets a caller short-circuit before metering. */
export function isFirecrawlConfigured(): boolean {
  return Boolean(process.env.FIRECRAWL_API_KEY);
}

/**
 * Backend selector: "firecrawl" iff the operator explicitly opted in via
 * AXIS_WEB_RESEARCH_BACKEND=firecrawl AND the key is present; otherwise the
 * AXIS-owned sovereign backend (the default — no third-party dependency).
 * An explicit firecrawl selection WITHOUT a key is surfaced by the handlers as
 * a _not_configured envelope rather than silently falling back.
 */
export function webResearchBackend(): "sovereign" | "firecrawl" {
  return process.env.AXIS_WEB_RESEARCH_BACKEND === "firecrawl" && isFirecrawlConfigured()
    ? "firecrawl"
    : "sovereign";
}

export function webResearchNotConfigured(tool: string): WebResearchNotConfigured {
  return {
    _not_configured: true,
    tool,
    reason: "firecrawl_not_configured",
    detail: "AXIS_WEB_RESEARCH_BACKEND=firecrawl is selected but FIRECRAWL_API_KEY is not set on this deployment.",
    remediation:
      "Set FIRECRAWL_API_KEY (https://firecrawl.dev), or unset AXIS_WEB_RESEARCH_BACKEND to use the default AXIS-owned crawler (no key required).",
  };
}

interface FirecrawlScrapeBody {
  data?: { markdown?: string; metadata?: Record<string, unknown> };
}
interface FirecrawlCrawlBody {
  data?: { scrapeResults?: Array<{ url?: string; markdown?: string; metadata?: Record<string, unknown> }> };
}

async function firecrawlPost(target: string, payload: unknown, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY ?? ""}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Scrape a single URL → markdown + metadata. */
export async function firecrawlScrape(
  url: string,
  onlyMainContent = true,
): Promise<ScrapeResult | WebResearchNotConfigured> {
  if (!process.env.FIRECRAWL_API_KEY) return webResearchNotConfigured("iliad_web_research");
  const res = await firecrawlPost(
    SCRAPE_URL,
    { url, formats: ["markdown"], onlyMainContent, timeout: SCRAPE_TIMEOUT_MS },
    SCRAPE_TIMEOUT_MS,
  );
  if (!res.ok) {
    throw new Error(`Firecrawl scrape failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as FirecrawlScrapeBody;
  return { url, markdown: data.data?.markdown ?? "", metadata: data.data?.metadata ?? {} };
}

/** Crawl a domain and scrape up to `limit` pages. */
export async function firecrawlCrawl(
  url: string,
  limit: number,
  onlyMainContent = true,
): Promise<CrawlResult | WebResearchNotConfigured> {
  if (!process.env.FIRECRAWL_API_KEY) return webResearchNotConfigured("iliad_web_research_crawl");
  const res = await firecrawlPost(
    CRAWL_URL,
    { url, limit, allowBackendLinks: false, scrapeOptions: { formats: ["markdown"], onlyMainContent }, timeout: CRAWL_TIMEOUT_MS },
    CRAWL_TIMEOUT_MS,
  );
  if (!res.ok) {
    throw new Error(`Firecrawl crawl failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as FirecrawlCrawlBody;
  const pages: CrawlPage[] = (data.data?.scrapeResults ?? []).map((r) => ({
    url: r.url ?? "",
    markdown: r.markdown ?? "",
    metadata: r.metadata ?? {},
  }));
  return { url, pages_crawled: pages.length, pages };
}
