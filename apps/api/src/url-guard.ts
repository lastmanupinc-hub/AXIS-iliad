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

/** Expand any IPv6 spelling to its 8 hextets (numbers), or null if unparseable. */
function expandV6(ip: string): number[] | null {
  let s = ip.toLowerCase();
  const zone = s.indexOf("%"); // strip a zone id (fe80::1%eth0)
  if (zone >= 0) s = s.slice(0, zone);
  // Fold a trailing embedded IPv4 (::ffff:1.2.3.4) into two hextets.
  const v4 = s.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4 && v4.index !== undefined) {
    const o = v4[1].split(".").map(Number);
    if (o.some((n) => n > 255)) return null;
    s = s.slice(0, v4.index) + `${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 ? (halves[1] ? halves[1].split(":") : []) : null;
  let groups: string[];
  if (tail === null) {
    groups = head;
  } else {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null; // "::" must stand in for at least one group
    groups = [...head, ...Array(missing).fill("0"), ...tail];
  }
  if (groups.length !== 8) return null;
  const nums = groups.map((g) => (g === "" ? 0 : parseInt(g, 16)));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 0xffff)) return null;
  return nums;
}

function v4FromHextets(hi: number, lo: number): string {
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
}

/** True for an IPv6 address that must never be reachable from a caller-driven fetch. */
function isBlockedV6(ip: string): boolean {
  const g = expandV6(ip);
  if (!g) return true; // unparseable → fail closed
  if (g.every((x) => x === 0)) return true; // :: unspecified
  const lowZero = g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0;
  if (lowZero && g[5] === 0 && g[6] === 0 && g[7] === 1) return true; // ::1 loopback
  if (lowZero && g[5] === 0xffff) return isBlockedV4(v4FromHextets(g[6], g[7])); // ::ffff:a.b.c.d IPv4-mapped
  if (lowZero && g[5] === 0 && (g[6] !== 0 || g[7] !== 0)) return isBlockedV4(v4FromHextets(g[6], g[7])); // ::a.b.c.d v4-compatible
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0)
    return isBlockedV4(v4FromHextets(g[6], g[7])); // 64:ff9b::/96 NAT64
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // 2001:db8::/32 documentation
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

  // Strip IPv6 brackets and a single FQDN-root trailing dot ("127.0.0.1." / "localhost.").
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  let ips: string[];
  if (net.isIP(host)) {
    ips = [host];
  } else {
    const name = host.toLowerCase();
    // Reject numeric host encodings net.isIP doesn't recognize (decimal 2130706433,
    // hex 0x7f000001, octal, or any digits-and-dots form). undici may still resolve
    // these to an IPv4 the DNS check never saw, so they must never reach fetch.
    if (/^\d+$/.test(name) || /^0x[0-9a-f]+$/.test(name) || /^[0-9.]+$/.test(name)) {
      throw new Error("URL host is not allowed");
    }
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
