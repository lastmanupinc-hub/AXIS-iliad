// ─── IP prefix aggregation (shared anti-abuse primitive) ─────────────────
//
// Buckets a client IP to its network prefix — /24 for IPv4, /64 for IPv6 —
// so rate limiting keys on the allocation an attacker controls rather than
// on a single address they can rotate freely. A residential IPv6 client is
// routinely handed a whole /64 and OS privacy extensions rotate the host
// bits automatically, so exact-address keying hands out a fresh budget per
// request to the very callers a limiter exists to stop.
//
// Extracted from anon-frontdoor.ts (which has used this since the challenge
// door shipped) so rate-limiter.ts can share the SAME implementation rather
// than growing a second copy — hand-duplicated logic drifting apart is a
// recurring defect family in this codebase, and the expandIpv6Hextets bug
// documented below is exactly the kind of subtlety a re-implementation
// would get wrong again.

/**
 * Expand IPv6 "::" zero-compression into the full 8 hextets. A naive
 * `split(":").filter(Boolean)` (the original implementation here) drops the
 * empty string "::" produces WITHOUT restoring the zero hextets it stands
 * for — so for an address whose *network* portion itself contains the
 * compression (e.g. "2001:db8::a1b2:c3d4:e5f6:1234", true prefix
 * "2001:db8::/64"), host-bit hextets silently shift into the "first 4"
 * slot, producing a DIFFERENT aggregated prefix per address even though
 * they share the same real /64 — defeating the abuse-throttling this
 * function exists for (any attacker whose own /64 happens to contain a
 * zero hextet, or who rotates IPv6 privacy addresses, mints a fresh
 * rate-limit bucket per request). Full expansion first, then slicing the
 * first 4 of the real 8 hextets, is required to aggregate correctly.
 */
export function expandIpv6Hextets(ip: string): string[] {
  const compressedAt = ip.indexOf("::");
  if (compressedAt === -1) {
    return ip.split(":");
  }
  const left = ip.slice(0, compressedAt).split(":").filter((h) => h.length > 0);
  const right = ip.slice(compressedAt + 2).split(":").filter((h) => h.length > 0);
  const zerosNeeded = Math.max(0, 8 - left.length - right.length);
  const zeros: string[] = new Array<string>(zerosNeeded).fill("0");
  return [...left, ...zeros, ...right];
}

/** Bucket an IP to its network prefix: /24 for IPv4, /64 for IPv6. */
export function aggregateIpPrefix(ip: string): string {
  if (ip.includes(":")) {
    // IPv4-mapped IPv6 ("::ffff:a.b.c.d" — common for req.socket.remoteAddress
    // on a dual-stack listener) is really an IPv4 client; aggregate as IPv4.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    if (mapped) return aggregateIpPrefix(mapped[1]);
    // IPv6 — expand "::" first, then keep the first 4 of the real 8 hextets (a /64).
    return expandIpv6Hextets(ip).slice(0, 4).join(":") + "::/64";
  }
  const octets = ip.split(".");
  if (octets.length === 4) return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
  // "unknown" or malformed — not a real IP to aggregate; bucket it on its own.
  return ip;
}
