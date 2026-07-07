// ─── Sovereign web fetch (WO-12) ─────────────────────────────────
//
// AXIS-owned, zero-dependency fetch layer for iliad_web_research /
// iliad_web_research_crawl: SSRF-guarded GET over node built-ins (`fetch`,
// `node:dns/promises`, `node:net`, `node:url`), robots.txt fetch + parse, and
// per-host politeness rate limiting. No third-party key, no new runtime deps.
//
// Honest scope (do not oversell): the SSRF guard RESOLVES-then-FETCHES — undici
// re-resolves DNS at connect time, so there is a theoretical DNS-rebinding
// TOCTOU window between our vetting lookup and the actual socket connect. That
// is acceptable for the advertised research use, but this module must NOT be
// described as a hardened security boundary or a sandboxed fetch.

import { lookup } from "node:dns/promises";
import net from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { Buffer } from "node:buffer";

export interface SovereignFetchResult {
  url: string; // final URL after redirects
  status: number;
  contentType: string; // lowercased, params stripped
  html: string; // decoded text body (utf-8), possibly truncated
  truncated: boolean;
}

export interface RobotsRules {
  userAgent: string;
  disallow: string[];
  allow: string[];
  crawlDelayMs: number | null;
}

/** Error with a stable machine-readable `.code` so callers can branch without parsing text. */
export class SovereignFetchError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "SovereignFetchError";
    this.code = code;
  }
}

const DEFAULT_USER_AGENT =
  "AxisIliadBot/0.5 (+https://axis-api-6c7z.onrender.com/for-agents; static-html; no-js-rendering)";
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024; // 5 MiB
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_POLITENESS_MS = 1_000;
const MAX_REDIRECTS = 5;
/** Conservative egress allowlist — standard web ports only. */
const ALLOWED_PORTS = new Set([80, 443, 8080, 8443]);

function envNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function allowPrivateHosts(): boolean {
  const v = process.env.AXIS_WEB_RESEARCH_ALLOW_PRIVATE_HOSTS;
  return v === "1" || v === "true";
}

/** User-Agent the sovereign crawler presents (env AXIS_WEB_RESEARCH_USER_AGENT or the default bot UA). */
export function sovereignUserAgent(): string {
  const ua = process.env.AXIS_WEB_RESEARCH_USER_AGENT?.trim();
  return ua || DEFAULT_USER_AGENT;
}

// ─── IP classification ───────────────────────────────────────────

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  if (a === 0) return true; // "this network"
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local (incl. 169.254.169.254 metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 192 && b === 0 && parts[2] === 0) return true; // IETF protocol assignments
  if (a === 192 && b === 0 && parts[2] === 2) return true; // TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && parts[2] === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && parts[2] === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true; // unspecified / loopback
  // IPv4-mapped (::ffff:a.b.c.d) and other dotted-quad forms — classify the v4 part.
  if (lower.includes(".")) {
    const v4 = lower.slice(lower.lastIndexOf(":") + 1);
    if (net.isIP(v4) === 4) return isPrivateIpv4(v4);
  }
  const firstGroup = /^([0-9a-f]{1,4}):/.exec(lower);
  if (!firstGroup) return true; // unparseable — treat as unsafe
  const first = parseInt(firstGroup[1], 16);
  if (first >= 0xfc00 && first <= 0xfdff) return true; // ULA fc00::/7
  if (first >= 0xfe80 && first <= 0xfebf) return true; // link-local fe80::/10
  if (first >= 0xfec0 && first <= 0xfeff) return true; // (deprecated) site-local fec0::/10
  if (first >= 0xff00) return true; // multicast ff00::/8
  return false;
}

/** Covers v4 + v6 private / loopback / link-local / CGNAT / ULA / metadata ranges.
 *  A string that is not a literal IP at all returns true (treated as unsafe). */
export function isPrivateIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateIpv4(ip);
  if (family === 6) return isPrivateIpv6(ip);
  return true;
}

// ─── URL vetting ─────────────────────────────────────────────────

/** URL.hostname wraps IPv6 literals in brackets ("[::1]") — strip them before net.isIP/dns. */
function bareHostname(url: URL): string {
  const h = url.hostname;
  return h.startsWith("[") && h.endsWith("]") ? h.slice(1, -1) : h;
}

/**
 * Throws SovereignFetchError(.code) on a non-http(s) scheme, a blocked port, or
 * a host that DNS-resolves to a private/loopback/link-local/CGNAT/metadata IP.
 * Returns the parsed URL when public. AXIS_WEB_RESEARCH_ALLOW_PRIVATE_HOSTS=1
 * (dev/test escape hatch ONLY) bypasses the port + address checks — never the
 * scheme allowlist.
 */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SovereignFetchError("invalid_url", `web-research: not a valid URL: ${rawUrl}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SovereignFetchError(
      "blocked_scheme",
      `web-research: scheme ${url.protocol.replace(/:$/, "")} is not allowed (http/https only).`,
    );
  }
  if (allowPrivateHosts()) return url;

  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (!ALLOWED_PORTS.has(port)) {
    throw new SovereignFetchError("blocked_port", `web-research: port ${port} is not allowed.`);
  }

  const host = bareHostname(url);
  if (net.isIP(host)) {
    if (isPrivateIp(host)) {
      throw new SovereignFetchError(
        "private_address",
        `web-research: ${host} is a private/reserved address and cannot be fetched.`,
      );
    }
    return url;
  }
  // Obvious internal names — reject without a DNS round-trip.
  const lowerHost = host.toLowerCase();
  if (
    lowerHost === "localhost" ||
    lowerHost.endsWith(".localhost") ||
    lowerHost.endsWith(".local") ||
    lowerHost.endsWith(".internal") ||
    !lowerHost.includes(".")
  ) {
    throw new SovereignFetchError(
      "private_address",
      `web-research: host ${host} looks internal and cannot be fetched.`,
    );
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(lowerHost, { all: true, verbatim: true });
  } catch {
    throw new SovereignFetchError("dns_error", `web-research: DNS resolution failed for ${host}.`);
  }
  if (addresses.length === 0) {
    throw new SovereignFetchError("dns_error", `web-research: DNS returned no addresses for ${host}.`);
  }
  for (const { address } of addresses) {
    if (isPrivateIp(address)) {
      throw new SovereignFetchError(
        "private_address",
        `web-research: ${host} resolves to a private/reserved address (${address}) and cannot be fetched.`,
      );
    }
  }
  return url;
}

// ─── SSRF-guarded fetch ──────────────────────────────────────────

/**
 * SSRF-guarded GET. Follows up to 5 redirects manually, re-validating EVERY hop
 * through assertPublicUrl (so a public page cannot bounce us into a private
 * network). Body is capped at AXIS_WEB_RESEARCH_MAX_BYTES (default 5 MiB) and
 * the whole exchange shares one timeout budget from AXIS_WEB_RESEARCH_TIMEOUT_MS
 * (default 30s). Static bytes only — nothing here executes JavaScript.
 */
export async function sovereignFetch(url: string, timeoutMs?: number): Promise<SovereignFetchResult> {
  const budget = timeoutMs ?? envNumber("AXIS_WEB_RESEARCH_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);
  const deadline = Date.now() + budget;
  let current = await assertPublicUrl(url);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new SovereignFetchError("timeout", `web-research: fetch timed out after ${budget}ms.`);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    let res: Response;
    try {
      res = await fetch(current.href, {
        method: "GET",
        redirect: "manual",
        headers: {
          "user-agent": sovereignUserAgent(),
          accept: "text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
        },
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (controller.signal.aborted) {
        throw new SovereignFetchError("timeout", `web-research: fetch timed out after ${budget}ms.`);
      }
      throw new SovereignFetchError(
        "fetch_failed",
        `web-research: fetch failed for ${current.href}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      clearTimeout(timer);
      try {
        await res.body?.cancel();
      } catch {
        /* discarding a redirect body can never fail the fetch */
      }
      if (hop === MAX_REDIRECTS) {
        throw new SovereignFetchError("too_many_redirects", `web-research: more than ${MAX_REDIRECTS} redirects.`);
      }
      let nextUrl: URL;
      try {
        nextUrl = new URL(location, current);
      } catch {
        throw new SovereignFetchError("invalid_url", `web-research: redirect to an invalid URL: ${location}`);
      }
      // Redirect re-validation — every hop must pass the same public-URL gate.
      current = await assertPublicUrl(nextUrl.href);
      continue;
    }

    // Final response: read the body under the byte cap, still under the timeout.
    const cap = envNumber("AXIS_WEB_RESEARCH_MAX_BYTES", DEFAULT_MAX_BYTES);
    const chunks: Uint8Array[] = [];
    let total = 0;
    let truncated = false;
    const body = res.body;
    if (body) {
      const reader = body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          total += value.byteLength;
          if (total > cap) {
            const keep = value.byteLength - (total - cap);
            if (keep > 0) chunks.push(value.subarray(0, keep));
            truncated = true;
            try {
              await reader.cancel();
            } catch {
              /* cancelling past the cap is best-effort */
            }
            break;
          }
          chunks.push(value);
        }
      } catch (err) {
        clearTimeout(timer);
        if (controller.signal.aborted) {
          throw new SovereignFetchError("timeout", `web-research: fetch timed out after ${budget}ms.`);
        }
        throw new SovereignFetchError(
          "fetch_failed",
          `web-research: body read failed for ${current.href}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    clearTimeout(timer);
    const html = new TextDecoder("utf-8").decode(Buffer.concat(chunks));
    const rawContentType = res.headers.get("content-type") ?? "";
    const contentType = rawContentType.split(";")[0].trim().toLowerCase();
    return { url: current.href, status: res.status, contentType, html, truncated };
  }
  /* v8 ignore next 2 — loop always returns or throws before falling through */
  throw new SovereignFetchError("too_many_redirects", `web-research: more than ${MAX_REDIRECTS} redirects.`);
}

// ─── robots.txt ──────────────────────────────────────────────────

/** Parse robots.txt for the group that best matches `userAgent` (longest
 *  User-agent substring match; `*` as fallback). Unknown fields are ignored. */
export function parseRobots(text: string, userAgent: string): RobotsRules {
  interface Group {
    agents: string[];
    disallow: string[];
    allow: string[];
    crawlDelayMs: number | null;
  }
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastFieldWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const field = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();

    if (field === "user-agent") {
      // Consecutive User-agent lines share one group; a User-agent after rules starts a new group.
      if (!lastFieldWasAgent || !current) {
        current = { agents: [], disallow: [], allow: [], crawlDelayMs: null };
        groups.push(current);
      }
      if (value) current.agents.push(value.toLowerCase());
      lastFieldWasAgent = true;
      continue;
    }
    lastFieldWasAgent = false;
    if (!current) continue; // rules before any User-agent line are ignored
    if (field === "disallow") {
      if (value) current.disallow.push(value);
    } else if (field === "allow") {
      if (value) current.allow.push(value);
    } else if (field === "crawl-delay") {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) current.crawlDelayMs = Math.round(seconds * 1000);
    }
  }

  const uaLower = userAgent.toLowerCase();
  let best: Group | null = null;
  let bestLen = -1;
  for (const group of groups) {
    for (const agent of group.agents) {
      if (agent === "*") {
        if (bestLen < 0) {
          best = group;
          bestLen = 0;
        }
      } else if (uaLower.includes(agent) && agent.length > bestLen) {
        best = group;
        bestLen = agent.length;
      }
    }
  }
  return {
    userAgent,
    disallow: best?.disallow ?? [],
    allow: best?.allow ?? [],
    crawlDelayMs: best?.crawlDelayMs ?? null,
  };
}

/** Fetch + parse `${origin}/robots.txt`. An empty body, a 4xx/5xx, or any fetch
 *  error yields allow-all rules (the research-crawler convention). */
export async function fetchRobots(origin: string): Promise<RobotsRules> {
  const ua = sovereignUserAgent();
  const allowAll: RobotsRules = { userAgent: ua, disallow: [], allow: [], crawlDelayMs: null };
  let robotsUrl: string;
  try {
    robotsUrl = new URL("/robots.txt", origin).href;
  } catch {
    return allowAll;
  }
  let res: SovereignFetchResult;
  try {
    res = await sovereignFetch(robotsUrl);
  } catch {
    return allowAll;
  }
  if (res.status !== 200 || !res.html.trim()) return allowAll;
  return parseRobots(res.html, ua);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** -1 when the rule doesn't match; otherwise the rule length (specificity). Supports `*` and a trailing `$`. */
function ruleMatchLength(rule: string, pathname: string): number {
  let body = rule;
  let anchored = false;
  if (body.endsWith("$")) {
    anchored = true;
    body = body.slice(0, -1);
  }
  const pattern = "^" + body.split("*").map(escapeRegExp).join(".*") + (anchored ? "$" : "");
  return new RegExp(pattern).test(pathname) ? rule.length : -1;
}

/** Longest-match Allow/Disallow (Allow wins ties, per the Google/RFC 9309 convention). */
export function isPathAllowed(rules: RobotsRules, pathname: string): boolean {
  let allowLen = -1;
  let disallowLen = -1;
  for (const rule of rules.allow) allowLen = Math.max(allowLen, ruleMatchLength(rule, pathname));
  for (const rule of rules.disallow) disallowLen = Math.max(disallowLen, ruleMatchLength(rule, pathname));
  if (disallowLen < 0) return true;
  return allowLen >= disallowLen;
}

// ─── per-host politeness ─────────────────────────────────────────

/** Next moment each host may be fetched. Module-level on purpose: one process,
 *  one politeness ledger, shared across scrape + crawl calls. */
const hostNextSlot = new Map<string, number>();

/**
 * Per-host token gate: resolves once enough time has elapsed since this host's
 * last granted slot — max(AXIS_WEB_RESEARCH_POLITENESS_MS default 1000, robots
 * crawlDelayMs). Concurrent callers queue FIFO because each call reserves the
 * next slot synchronously before awaiting.
 */
export async function awaitHostSlot(host: string, crawlDelayMs: number | null): Promise<void> {
  const politeness = envNumber("AXIS_WEB_RESEARCH_POLITENESS_MS", DEFAULT_POLITENESS_MS);
  const delay = Math.max(politeness, crawlDelayMs ?? 0);
  const now = Date.now();
  const slot = Math.max(hostNextSlot.get(host) ?? 0, now);
  hostNextSlot.set(host, slot + delay);
  if (slot > now) await sleep(slot - now);
}
