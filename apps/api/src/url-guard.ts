// SSRF guard for server-side fetches of caller-supplied URLs (document parsing,
// speech-to-text audio). Resolves the host and refuses any URL that points at a
// loopback / private / link-local / cloud-metadata address, and re-validates
// every redirect hop so a public host can't 302 into the internal network.
//
// Note: this is not bulletproof against DNS-rebinding (the kernel re-resolves at
// connect time), but it blocks every direct and redirect-based SSRF vector,
// which is the realistic threat for a user-supplied download URL.
import { lookup } from "node:dns/promises";
import net from "node:net";

/** True for an IPv4 address that must never be reachable from a caller-driven fetch. */
function isBlockedV4(ip: string): boolean {
  const o = ip.split(".").map(Number);
  if (o.length !== 4 || o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = o;
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 10) return true; // 10/8 private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12 private
  if (a === 192 && b === 168) return true; // 192.168/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  if (a >= 224) return true; // 224/4 multicast + 240/4 reserved
  return false;
}

/** True for an IPv6 address that must never be reachable from a caller-driven fetch. */
function isBlockedV6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true; // loopback / unspecified
  if (lower.startsWith("fe80")) return true; // link-local fe80::/10
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique-local fc00::/7
  const mapped = lower.match(/^(?:::ffff:)(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped ::ffff:a.b.c.d
  if (mapped) return isBlockedV4(mapped[1]);
  return false;
}

/** True if the given literal IP is in a blocked range. Non-IP input is blocked. */
export function isBlockedIp(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return isBlockedV4(ip);
  if (kind === 6) return isBlockedV6(ip);
  return true;
}

/**
 * Validate that `raw` is an http(s) URL whose host does not resolve to a
 * private/loopback/link-local/metadata address. Throws on violation; returns the
 * parsed URL on success.
 */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed");
  }

  const host = url.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  let ips: string[];
  if (net.isIP(host)) {
    ips = [host];
  } else {
    const name = host.toLowerCase();
    if (name === "localhost" || name.endsWith(".localhost") || name.endsWith(".internal") || name.endsWith(".local")) {
      throw new Error("URL host is not allowed");
    }
    const records = await lookup(host, { all: true });
    ips = records.map((r) => r.address);
  }

  if (ips.length === 0 || ips.some(isBlockedIp)) {
    throw new Error("URL resolves to a disallowed (private/loopback/link-local) address");
  }
  return url;
}

/**
 * fetch() that validates the target (and every redirect hop) with assertPublicUrl
 * before connecting. Use for any fetch of a caller-supplied URL.
 */
export async function safeFetch(rawUrl: string, init: RequestInit = {}, maxRedirects = 5): Promise<Response> {
  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicUrl(current);
    const res = await fetch(current, { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return res;
      current = new URL(location, current).toString();
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects");
}
