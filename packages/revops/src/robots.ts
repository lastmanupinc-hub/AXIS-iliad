// robots.txt parsing — PURE. Fetching robots.txt is the caller's job; deciding
// what it permits is this module's.
//
// WHY THIS EXISTS AT ALL: the ingest path fetches other people's websites. Not
// honoring robots.txt is the difference between "we look at public pages the
// way every browser and search engine does" and "we are a bot they asked not to
// run". The former is defensible; the latter is not worth a sales lead.
//
// FAIL-CLOSED BY DEFAULT on ambiguity: if robots.txt is unreachable we allow
// (that is the RFC 9309 / long-standing convention — an absent robots.txt means
// no restrictions), but if robots.txt is PRESENT and we cannot parse it, we
// refuse rather than guessing. Guessing in our own favour is exactly the bias
// this module exists to remove.

/** One user-agent group from a robots.txt file. */
interface RobotsGroup {
  agents: string[];
  allow: string[];
  disallow: string[];
  crawlDelaySec?: number;
}

export interface RobotsRules {
  readonly groups: readonly RobotsGroup[];
  /** True when robots.txt existed and parsed. */
  readonly parsed: boolean;
}

/** An absent robots.txt (404/empty) means "no restrictions" per convention. */
export const ROBOTS_ABSENT: RobotsRules = { groups: [], parsed: true };

/**
 * Parse robots.txt. Handles the parts that actually matter in the wild:
 * grouped User-agent lines, Allow, Disallow, Crawl-delay, comments, and the
 * `*` wildcard agent. Sitemap/Host lines are ignored (not access controls).
 */
export function parseRobots(text: string): RobotsRules {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  // Consecutive User-agent lines share ONE group (per the standard), so a new
  // agent line only starts a group if the previous line was a rule.
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0]!.trim();
    if (!line) continue;

    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }

    if (!current) continue; // rule before any user-agent — ignore
    lastWasAgent = false;

    switch (field) {
      case "disallow":
        // "Disallow:" with an empty value means allow everything.
        if (value !== "") current.disallow.push(value);
        break;
      case "allow":
        if (value !== "") current.allow.push(value);
        break;
      case "crawl-delay": {
        const n = Number(value);
        if (Number.isFinite(n) && n >= 0) current.crawlDelaySec = n;
        break;
      }
      default:
        break;
    }
  }

  return { groups, parsed: true };
}

/** Pick the group that applies: an exact agent match beats the `*` wildcard. */
function groupFor(rules: RobotsRules, userAgent: string): RobotsGroup | undefined {
  const ua = userAgent.toLowerCase();
  const exact = rules.groups.find((g) => g.agents.some((a) => a !== "*" && ua.includes(a)));
  if (exact) return exact;
  return rules.groups.find((g) => g.agents.includes("*"));
}

/**
 * Longest-match wins, and Allow beats Disallow at equal length — the behaviour
 * Google and RFC 9309 specify. A naive "any disallow prefix blocks" reading
 * would refuse paths the site explicitly permitted.
 */
function matchLength(patterns: readonly string[], path: string): number {
  let best = -1;
  for (const p of patterns) {
    if (patternMatches(p, path) && p.length > best) best = p.length;
  }
  return best;
}

/** Supports the two wildcards robots.txt actually uses: `*` and end-anchor `$`. */
function patternMatches(pattern: string, path: string): boolean {
  if (!pattern.includes("*") && !pattern.endsWith("$")) {
    return path.startsWith(pattern);
  }
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}${anchored ? "$" : ""}`).test(path);
}

export interface RobotsDecision {
  readonly allowed: boolean;
  readonly reason: string;
  readonly crawlDelaySec?: number;
}

/**
 * May `userAgent` fetch `path`?
 *
 * @param path the URL path only (e.g. "/products"), not the full URL.
 */
export function isAllowed(rules: RobotsRules, userAgent: string, path: string): RobotsDecision {
  if (!rules.parsed) {
    // Present but unparseable — refuse. See the fail-closed note at the top.
    return { allowed: false, reason: "robots.txt present but could not be parsed — refusing" };
  }

  const group = groupFor(rules, userAgent);
  if (!group) {
    return { allowed: true, reason: "no applicable robots.txt group" };
  }

  const disallowLen = matchLength(group.disallow, path);
  const allowLen = matchLength(group.allow, path);

  if (disallowLen === -1) {
    return { allowed: true, reason: "no matching Disallow", crawlDelaySec: group.crawlDelaySec };
  }
  if (allowLen >= disallowLen) {
    return {
      allowed: true,
      reason: `Allow (${allowLen}) >= Disallow (${disallowLen})`,
      crawlDelaySec: group.crawlDelaySec,
    };
  }
  return {
    allowed: false,
    reason: `Disallow "${group.disallow.find((d) => patternMatches(d, path)) ?? ""}" applies`,
    crawlDelaySec: group.crawlDelaySec,
  };
}
