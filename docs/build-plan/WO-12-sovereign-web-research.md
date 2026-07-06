# WO-12 · sovereign-web-research

**Claim it makes true:** iliad_web_research/crawl advertised in the AXIS surface.

**Tier:** A_pure_software · **Effort:** L · **Package:** apps/api

**Verify verdict:** implementable_by_sonnet5=`True` · fully_closes_claim=`False` · confidence=`medium`
**Missing for codeability:** Mostly codeable -- signatures, wiring pseudocode, and lenient acceptance tests are concrete, and the named interfaces (ScrapeResult/CrawlResult, authorize/captureMcpToolCredits) all exist as described. Residual design latitude the agent must resolve itself: (1) the 'zero-dep readability, highest text-density container' extractor requires hand-rolling an HTML parser + a density metric from scratch -- the spec gives a strip-list and a heuristic name but no algorithm; it's buildable only because the acceptance fixture (article vs nav/footer) is lenient. (2) 'redirect re-validation' implies manual redirect following (redirect:'manual' + re-assert each hop), which the sovereignFetch signature doesn't state. (3) IPv6 URL.hostname returns bracketed '[::1]' -- must be stripped before net.isIP/dns; not mentioned. (4) env.ts ENV_SPEC rows for the ~6 new AXIS_WEB_RESEARCH_* vars are not enumerated. (5) acceptance #8's spy on authorize/captureMcpToolCredits assumes vi.spyOn intercepts destructured ESM imports inside mcp-tool-impls -- works in vitest but is a gotcha; asserting DB credit deltas would be safer.
**Spec overclaims flagged:** 'Makes the AXIS-surface claim ... literally true' overclaims: the spec only touches the two MCP tools, leaving a same-named REST twin (/v1/research/scrape, /v1/research/crawl via handlers.ts) still a pure Firecrawl proxy, openapi.ts:367/406 still saying 'Proxy to Firecrawl', and web/api.ts:858 labelled 'Firecrawl proxy'. The 'AXIS-owned web research' product claim is contradicted on the REST/web surface the spec doesn't convert.; The spec does not update .ai/capability-map.yaml, which classifies web_research as status:live_proxy ('proxies to a third party') -- completing the WO makes this self-honesty ledger stale/contradictory (the exact docs-vs-runtime drift the project's own honesty tests exist to prevent).; new_deps:[] / 'zero-dep readability' is optimistic relative to the repo's OWN capability-map replication_plan, which states the owned equivalent needs playwright + Mozilla readability + cheerio; the from-scratch version is achievable only at explicitly lower fidelity (spec does caveat this, so partial not fatal).; 'SSRF-guarded fetch' via node fetch glosses that undici re-resolves DNS and cannot be pinned to the vetted IP, so the guard is inherently resolve-then-fetch TOCTOU/DNS-rebinding -- the spec admits this only in doc_impact, not in the interface contract.
**Hidden external gates:** No credential/account/network-membership gate -- this is genuinely pure software over node built-ins (external_gates:[] is accurate). One non-credential operational note the spec understates: switching the default backend to owned makes AXIS's own Render servers perform outbound fetches to arbitrary user-supplied URLs (a new SSRF-exposed egress surface that previously lived entirely inside Firecrawl); the DNS-resolve-then-reject guard is the sole mitigation and, as noted, has a TOCTOU window.

## Current state
Both MCP tools are pure Firecrawl proxies with no owned path and no flag. `apps/api/src/web-research.ts:8-9` hardcodes `https://api.firecrawl.dev/v0/scrape` and `/v0/crawl`; `firecrawlScrape` (:84) and `firecrawlCrawl` (:102) POST via `firecrawlPost` (:65) sending `Authorization: Bearer ${FIRECRAWL_API_KEY}`. The file header (:1-6) says work is done "via the Firecrawl proxy" and explicitly punts SSRF to Firecrawl. `isFirecrawlConfigured()` (:44) gates on `FIRECRAWL_API_KEY`; unset returns a `firecrawl_not_configured` envelope (:48) -- i.e. no key means the tool is disabled, there is NO owned fallback. Handlers `runWebResearch` (`apps/api/src/mcp-tool-impls.ts:1074`) and `runWebResearchCrawl` (:1098) do auth -> validate (`url`, `only_main_content`, `limit` 1-100) -> `isFirecrawlConfigured` short-circuit -> `authorizeMcpToolCredits` -> firecrawl call -> `captureMcpToolCredits`. Tool descriptions `apps/api/src/mcp-tools.ts:700` and :744 literally advertise "using Firecrawl." `FIRECRAWL_API_KEY` is registered `required:false` at `env.ts:42`. There is no owned fetch, robots.txt/politeness, readability extraction, HTML->markdown, or crawl frontier/SSRF guard anywhere in the tree.

## Target state (== the claim is literally true)
iliad_web_research and iliad_web_research_crawl have an AXIS-owned fetch->extract->crawl implementation that runs with NO third-party key and NO new runtime deps (pure TypeScript over node built-ins: `fetch`, `node:dns/promises`, `node:net`, `node:url`). Owned path is the DEFAULT backend; Firecrawl is retained behind an explicit `AXIS_WEB_RESEARCH_BACKEND=firecrawl` flag (used only when a key is also set). The owned path implements: SSRF-guarded fetch (scheme allowlist http/https, DNS-resolve-then-reject private/loopback/link-local/metadata IPs, blocked ports, redirect re-validation, byte cap), robots.txt fetch+parse with User-Agent + crawl-delay honored, per-host politeness rate limiting, a deterministic zero-dep readability heuristic (strip script/style/nav/header/footer/aside, pick highest text-density container when `only_main_content`), HTML->markdown serialization, and a same-origin BFS crawl frontier with dedupe + robots + limit enforcement. Return shapes (`ScrapeResult`, `CrawlResult` from web-research.ts:21-37) and the metering authorize/capture flow are unchanged, so `mcp-tools.ts` outputSchema and `PRICING_TIERS` rows need no change. Tool descriptions and the file header are rewritten to say "AXIS's owned crawler" (with an honest "static HTML only, no JavaScript rendering" note) instead of "using Firecrawl." The `firecrawl_not_configured` envelope becomes reachable ONLY when the operator explicitly selects the firecrawl backend without a key.

## Files to create / edit
- apps/api/src/web-research-sovereign.ts
- apps/api/src/web-fetch-sovereign.ts
- apps/api/src/html-extract.ts
- apps/api/src/web-research.ts
- apps/api/src/mcp-tool-impls.ts
- apps/api/src/mcp-tools.ts
- apps/api/src/env.ts
- apps/api/src/web-research-sovereign.test.ts
- apps/api/src/html-extract.test.ts

## Interfaces
```ts
// ─── apps/api/src/web-fetch-sovereign.ts (owned SSRF-safe fetch + robots + politeness) ───
export interface SovereignFetchResult {
  url: string;          // final URL after redirects
  status: number;
  contentType: string;  // lowercased, params stripped
  html: string;         // decoded text body (utf-8), possibly truncated
  truncated: boolean;
}
export interface RobotsRules { userAgent: string; disallow: string[]; allow: string[]; crawlDelayMs: number | null; }

/** Throws Error(.code) on non-http(s) scheme, blocked port, or a host that DNS-resolves to a
 *  private/loopback/link-local/CGNAT/metadata (169.254.169.254) IP. Returns the parsed URL when public.
 *  Honors AXIS_WEB_RESEARCH_ALLOW_PRIVATE_HOSTS=1 (dev/test escape hatch only). */
export async function assertPublicUrl(rawUrl: string): Promise<URL>;
export function isPrivateIp(ip: string): boolean;                       // covers v4 + v6 private/loopback/ULA/link-local
export function sovereignUserAgent(): string;                           // env AXIS_WEB_RESEARCH_USER_AGENT or default bot UA
/** SSRF-guarded GET: re-validates every redirect hop, caps at AXIS_WEB_RESEARCH_MAX_BYTES (default 5MiB),
 *  timeout from AXIS_WEB_RESEARCH_TIMEOUT_MS (default 30000). */
export async function sovereignFetch(url: string, timeoutMs?: number): Promise<SovereignFetchResult>;
export async function fetchRobots(origin: string): Promise<RobotsRules>; // "" body / 4xx ⇒ allow-all
export function parseRobots(text: string, userAgent: string): RobotsRules;
export function isPathAllowed(rules: RobotsRules, pathname: string): boolean; // longest-match Allow/Disallow
/** Per-host token gate: resolves after enough time has elapsed since this host's last fetch
 *  (max(AXIS_WEB_RESEARCH_POLITENESS_MS default 1000, robots crawlDelayMs)). */
export async function awaitHostSlot(host: string, crawlDelayMs: number | null): Promise<void>;

// ─── apps/api/src/html-extract.ts (owned readability + HTML->markdown, zero deps) ───
export interface ExtractedDoc {
  title: string;
  markdown: string;                       // main content when onlyMainContent, else whole body
  text: string;                           // plain text of the same region
  links: string[];                        // absolute, resolved against baseUrl, deduped
  metadata: Record<string, unknown>;      // { title, description?, canonical?, byline?, lang? }
}
export function extractReadable(html: string, baseUrl: string, onlyMainContent: boolean): ExtractedDoc;
export function htmlToMarkdown(fragmentHtml: string): string; // headings, p, a, ul/ol/li, pre/code, blockquote, br

// ─── apps/api/src/web-research-sovereign.ts (drop-in owned backend, same return types) ───
import type { ScrapeResult, CrawlResult } from "./web-research.js";
export async function sovereignScrape(url: string, onlyMainContent?: boolean): Promise<ScrapeResult>;
export async function sovereignCrawl(url: string, limit: number, onlyMainContent?: boolean): Promise<CrawlResult>;

// ─── apps/api/src/web-research.ts (backend selector; existing Firecrawl fns kept) ───
export function webResearchBackend(): "sovereign" | "firecrawl";
// returns "firecrawl" iff process.env.AXIS_WEB_RESEARCH_BACKEND === "firecrawl" && isFirecrawlConfigured();
// otherwise "sovereign" (the default -- no third-party dependency).

// ─── handler edit (mcp-tool-impls.ts runWebResearch/runWebResearchCrawl), auth+metering unchanged ───
// const backend = webResearchBackend();
// if (backend === "firecrawl" && !isFirecrawlConfigured()) return JSON.stringify(webResearchNotConfigured(tool), null, 2);
// const charge = await authorizeMcpToolCredits(req, auth.account, tool);
// const result = backend === "firecrawl" ? await firecrawlScrape(url, main) : await sovereignScrape(url, main);
// await captureMcpToolCredits(auth.account, charge); return JSON.stringify(result, null, 2);
```

## Acceptance tests (DONE == claim true)
- Hermetic test (apps/api/src/web-research-sovereign.test.ts) starts a local node:http server on 127.0.0.1 serving an article page (title + <article> body + <nav>/<footer> boilerplate) and asserts: with `delete process.env.FIRECRAWL_API_KEY` and `AXIS_WEB_RESEARCH_ALLOW_PRIVATE_HOSTS=1`, `sovereignScrape(pageUrl, true)` resolves to a ScrapeResult whose `markdown` contains the article sentence, does NOT contain the nav/footer boilerplate text, and whose `metadata.title` equals the <title> -- proving an owned scrape with zero third-party key.
- `webResearchBackend()` returns 'sovereign' when `AXIS_WEB_RESEARCH_BACKEND` is unset AND when `FIRECRAWL_API_KEY` is unset; returns 'firecrawl' ONLY when `AXIS_WEB_RESEARCH_BACKEND==='firecrawl'` and `FIRECRAWL_API_KEY` is set (assert all four combinations).
- SSRF guard: `await assertPublicUrl(u)` rejects (throws) for 'http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/', 'http://10.0.0.1/', 'http://192.168.1.1/', 'file:///etc/passwd', and 'ftp://host/' (with ALLOW_PRIVATE off); and `isPrivateIp` returns true for '127.0.0.1','10.0.0.1','192.168.0.1','169.254.169.254','::1','fc00::1' and false for '8.8.8.8'.
- robots.txt honored: `parseRobots('User-agent: *\nDisallow: /private\nCrawl-delay: 2', ua)` yields crawlDelayMs===2000 and `isPathAllowed(rules,'/private/x')===false` while `isPathAllowed(rules,'/public')===true`. A `sovereignCrawl` over a fixture whose robots disallows /private and whose home page links to /private returns pages_crawled with NO page whose url path starts with /private.
- same-origin BFS + dedupe + limit: fixture serves '/', '/a', '/b' (interlinked, plus an off-origin absolute link); `sovereignCrawl(homeUrl, 2)` resolves with `pages_crawled === 2`, every returned `pages[i].url` shares the fixture origin, and no url repeats.
- `htmlToMarkdown` (html-extract.test.ts) is deterministic and correct: '<h1>T</h1><p>hi <a href="/x">L</a></p><ul><li>one</li><li>two</li></ul><pre><code>x=1</code></pre>' -> markdown containing '# T', '[L](/x)' (or resolved absolute when via extractReadable), '- one', '- two', and a fenced ```` ``` ```` code block with 'x=1'.
- politeness: two back-to-back `awaitHostSlot('example.com', null)` calls with `AXIS_WEB_RESEARCH_POLITENESS_MS=300` are separated by ≥300ms measured wall-clock (assert `Date.now()` delta ≥ 290).
- handler wiring: calling `runWebResearch({url: fixtureUrl}, fakeReq)` with an authenticated account, backend defaulted to sovereign, `FIRECRAWL_API_KEY` unset -> returns JSON that parses to a ScrapeResult (NOT a `_not_configured` envelope), and spies confirm `authorizeMcpToolCredits` and `captureMcpToolCredits` were each called once for 'iliad_web_research'.
- honesty: `apps/api/src/mcp-tools.ts` descriptions for iliad_web_research and iliad_web_research_crawl no longer contain the substring 'Firecrawl' in the default advertised copy and instead state the owned crawler + a 'static HTML, no JavaScript rendering' caveat (grep assertion in a docs-honesty test).
- `npm run build` (tsc strict) and root `vitest run` pass with zero new entries added to apps/api/package.json dependencies.

## External gates (code alone can't satisfy)
_none_

## New runtime deps (project forbids w/o discussion)
_none_

## Depends on
_none_

## Doc impact / residual honesty caveat
Makes the AXIS-surface claim that iliad_web_research / iliad_web_research_crawl are AXIS-owned literally true: after this WO both tools run an owned fetch+extract+crawl+robots+politeness path by default with no paid third party and no new runtime deps, Firecrawl retained only behind AXIS_WEB_RESEARCH_BACKEND=firecrawl. REQUIRED residual honesty caveat that must stay in tool descriptions and docs: (1) the owned extractor fetches STATIC HTML only -- it does NOT execute JavaScript, so client-rendered SPA pages may extract thin/empty content (Firecrawl-flag path remains for those); (2) the readability heuristic is a text-density heuristic, lower-fidelity than Mozilla Readability on adversarial layouts; (3) the SSRF guard resolves-then-fetches and therefore has a theoretical DNS-rebinding TOCTOU window -- acceptable for the advertised research use but must not be described as a hardened security boundary. Do NOT advertise 'renders JavaScript' or 'sandboxed/secure fetch'.
