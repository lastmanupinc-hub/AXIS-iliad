// ─── Web enrichment for the revenue pipeline ─────────────────────────────
//
// The I/O half of prospecting. @axis/revops decides WHAT a page means
// (fingerprint.ts) and whether robots.txt permits a fetch (robots.ts); this
// module does the fetching, and enforces the limits that make it defensible:
//
//   1. robots.txt is fetched and honored on EVERY host, before the page fetch.
//   2. An identifying User-Agent with a contact URL — no browser impersonation.
//   3. Per-host rate limiting, honoring Crawl-delay when the site sets one.
//   4. Hard timeout + response size cap.
//   5. HTTPS only, public hosts only (no SSRF into private ranges).
//
// None of these are optional or flag-gated. A prospecting tool that ignores
// robots.txt is not a growth advantage — it is a reputational liability that
// costs more than the lead is worth.
//
// SCOPE: this enriches a prospect we already have, from a URL we already have.
// It does not crawl, does not follow links, and does not harvest people. One
// prospect, one page, one fetch.

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  fingerprintPage,
  hasAgeGate,
  detectStackChange,
  isAllowed,
  parseRobots,
  ROBOTS_ABSENT,
  type PageSnapshot,
  type RobotsRules,
} from "@axis/revops";

/** Identifies us honestly and gives site owners a way to reach a human. */
export const REVOPS_USER_AGENT =
  "AxisRevOpsBot/1.0 (+https://axis-api-6c7z.onrender.com/for-agents)";

const FETCH_TIMEOUT_MS = 10_000;
/** 2 MB. Enough for any storefront's HTML; a cap stops a hostile/huge body. */
const MAX_BYTES = 2 * 1024 * 1024;
/** Default politeness gap when a site sets no Crawl-delay. */
const DEFAULT_HOST_DELAY_MS = 2_000;

/** Per-host last-fetch clock for rate limiting. Process-local by design —
 *  this runs on one API instance and does not need distributed coordination
 *  at prospecting volumes. */
const lastFetchByHost = new Map<string, number>();
/** Cached robots.txt per host, so one scan does not refetch it repeatedly. */
const robotsCache = new Map<string, { rules: RobotsRules; fetchedAt: number }>();
const ROBOTS_TTL_MS = 60 * 60 * 1000;

export interface IngestRefusal {
  readonly ok: false;
  /** Machine-readable so callers can distinguish policy from failure. */
  readonly code:
    | "INVALID_URL"
    | "NOT_HTTPS"
    | "PRIVATE_HOST"
    | "ROBOTS_DISALLOWED"
    | "FETCH_FAILED"
    | "NOT_HTML";
  readonly reason: string;
}

export interface IngestSuccess {
  readonly ok: true;
  readonly page: PageSnapshot;
  readonly facts: Record<string, unknown>;
  readonly signals: readonly string[];
  readonly evidence: readonly string[];
}

export type IngestResult = IngestSuccess | IngestRefusal;

/**
 * Block private/loopback/link-local targets. Without this, an operator could
 * point a prospect's `website` at 169.254.169.254 or 127.0.0.1 and turn an
 * admin endpoint into an SSRF probe of our own infrastructure.
 */
function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const p = ip.split(".").map(Number) as number[];
    const [a, b] = [p[0] ?? 0, p[1] ?? 0];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // cloud metadata
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::1" || v6 === "::") return true;
  if (v6.startsWith("fc") || v6.startsWith("fd")) return true; // unique-local
  if (v6.startsWith("fe80")) return true; // link-local
  // IPv4-mapped (::ffff:127.0.0.1) — re-check the embedded v4 address.
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return isPrivateAddress(mapped[1]);
  return false;
}

async function resolvesToPublicHost(hostname: string): Promise<boolean> {
  if (isIP(hostname)) return !isPrivateAddress(hostname);
  try {
    const addrs = await lookup(hostname, { all: true });
    if (addrs.length === 0) return false;
    // EVERY resolved address must be public — a host with one public and one
    // private A record would otherwise be a bypass.
    return addrs.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

async function politeWait(host: string, crawlDelaySec?: number): Promise<void> {
  const gap = crawlDelaySec !== undefined ? crawlDelaySec * 1000 : DEFAULT_HOST_DELAY_MS;
  const last = lastFetchByHost.get(host);
  if (last !== undefined) {
    const waitMs = last + gap - Date.now();
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
  }
  lastFetchByHost.set(host, Date.now());
}

async function fetchText(url: string): Promise<{ status: number; headers: Record<string, string>; body: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": REVOPS_USER_AGENT, Accept: "text/html,text/plain,*/*" },
      signal: controller.signal,
      redirect: "follow",
    });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));

    // Read with a hard size cap rather than res.text(), which would buffer an
    // arbitrarily large body before we could refuse it.
    const reader = res.body?.getReader();
    let body = "";
    if (reader) {
      const decoder = new TextDecoder();
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BYTES) {
          await reader.cancel();
          break;
        }
        body += decoder.decode(value, { stream: true });
      }
    }
    return { status: res.status, headers, body };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch + cache robots.txt for a host. An absent file means no restrictions. */
async function getRobots(origin: string): Promise<RobotsRules> {
  const cached = robotsCache.get(origin);
  if (cached && Date.now() - cached.fetchedAt < ROBOTS_TTL_MS) return cached.rules;

  const res = await fetchText(`${origin}/robots.txt`);
  let rules: RobotsRules;
  if (!res || res.status === 404 || res.status === 410 || !res.body.trim()) {
    rules = ROBOTS_ABSENT;
  } else if (res.status >= 400) {
    // 401/403 on robots.txt means the site is gated; treat as absent rather
    // than as permission, and let the page fetch fail on its own merits.
    rules = ROBOTS_ABSENT;
  } else {
    rules = parseRobots(res.body);
  }
  robotsCache.set(origin, { rules, fetchedAt: Date.now() });
  return rules;
}

/**
 * Enrich one prospect from its own public website.
 *
 * @param websiteUrl the prospect's site
 * @param previousProcessors prior scan's processors, for stack-change detection
 */
export async function enrichFromWeb(
  websiteUrl: string,
  previousProcessors?: readonly string[],
): Promise<IngestResult> {
  let url: URL;
  try {
    url = new URL(websiteUrl);
  } catch {
    return { ok: false, code: "INVALID_URL", reason: `Not a URL: ${websiteUrl}` };
  }

  // HTTPS only: an http:// fetch is trivially MITM-able, and we would be
  // recording whatever an intermediary chose to return as a business fact.
  if (url.protocol !== "https:") {
    return { ok: false, code: "NOT_HTTPS", reason: `Refusing non-HTTPS URL (${url.protocol})` };
  }

  if (!(await resolvesToPublicHost(url.hostname))) {
    return {
      ok: false,
      code: "PRIVATE_HOST",
      reason: `${url.hostname} does not resolve to a public address — refusing (SSRF guard)`,
    };
  }

  const robots = await getRobots(url.origin);
  const decision = isAllowed(robots, REVOPS_USER_AGENT, url.pathname || "/");
  if (!decision.allowed) {
    return {
      ok: false,
      code: "ROBOTS_DISALLOWED",
      reason: `robots.txt disallows this path: ${decision.reason}`,
    };
  }

  await politeWait(url.hostname, decision.crawlDelaySec);

  const res = await fetchText(url.toString());
  if (!res) {
    return { ok: false, code: "FETCH_FAILED", reason: "Request failed or timed out" };
  }

  const contentType = res.headers["content-type"] ?? "";
  // A 5xx is meaningful even without HTML (it IS the checkout_down signal), so
  // only refuse non-HTML on otherwise-successful responses.
  if (res.status < 500 && contentType && !/text\/html|text\/plain/i.test(contentType)) {
    return { ok: false, code: "NOT_HTML", reason: `Unexpected content-type: ${contentType}` };
  }

  const page: PageSnapshot = {
    url: url.toString(),
    status: res.status,
    headers: res.headers,
    html: res.body,
  };

  const fp = fingerprintPage(page);
  const signals = new Set<string>(fp.signals);
  const evidence = [...fp.evidence];

  const change = detectStackChange(previousProcessors, fp.processors);
  if (change.changed) {
    signals.add("stack_change_detected");
    evidence.push(
      `stack_change (added: ${change.added.join(",") || "none"}; removed: ${change.removed.join(",") || "none"})`,
    );
  }

  // Facts the qualify()/score() gates actually read. Only set what we observed —
  // an absent field means "unknown", which keeps the prospect in enrich rather
  // than wrongly disqualifying it.
  const facts: Record<string, unknown> = {};
  if (fp.processors.length > 0) facts.current_processors = fp.processors;
  if (fp.vertical) facts.vertical = fp.vertical;
  if (fp.vertical || hasAgeGate(page)) facts.high_risk = true;

  return { ok: true, page, facts, signals: [...signals], evidence };
}
