// ─── E5 Living Architecture: push-triggered PR drift mode ────────
//
// When a repo pushes to its default branch, AXIS re-derives the verified
// living-architecture.md and, if it has drifted from the stored version, opens a
// PR with the update. This file holds the pure, dependency-free core:
//   1. GitHub webhook signature verification (HMAC-SHA256, timing-safe)
//   2. push-event parsing
//   3. architecture drift diffing
// The endpoint wiring + PR creation (outward actions) live in the dispatcher.

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify a GitHub webhook's `X-Hub-Signature-256` against the raw body using the
 * shared secret. Timing-safe. Returns false for any missing/malformed input —
 * never throws — so an unsigned or forged delivery is simply rejected.
 */
export function verifyGitHubWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!secret || !signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const provided = signatureHeader.slice("sha256=".length);
  if (!/^[0-9a-f]{64}$/i.test(provided)) return false; // must be a 32-byte hex digest

  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(provided.toLowerCase(), "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface PushInfo {
  repo_full_name: string; // "owner/name"
  html_url: string; // repo URL to re-analyze
  ref: string; // "refs/heads/main"
  branch: string; // "main"
  default_branch: string;
  is_default_branch: boolean;
  head_sha: string | null;
}

/**
 * Parse a GitHub `push` event payload into the bits drift mode needs. Returns
 * null if the payload isn't a usable push (missing repository/ref). Defensive —
 * never throws on malformed input.
 */
export function parsePushEvent(payload: unknown): PushInfo | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const repo = p.repository;
  if (!repo || typeof repo !== "object") return null;
  const r = repo as Record<string, unknown>;

  // Validate the owner/repo shape — guards splitRepo + the PR target downstream.
  const repo_full_name = typeof r.full_name === "string" && /^[\w.-]+\/[\w.-]+$/.test(r.full_name) ? r.full_name : null;
  const html_url =
    typeof r.html_url === "string" ? r.html_url : typeof r.clone_url === "string" ? r.clone_url : null;
  const ref = typeof p.ref === "string" ? p.ref : null;
  if (!repo_full_name || !html_url || !ref) return null;

  const default_branch = typeof r.default_branch === "string" ? r.default_branch : "main";
  const branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
  const head_sha = typeof p.after === "string" ? p.after : null;

  return {
    repo_full_name,
    html_url,
    ref,
    branch,
    default_branch,
    is_default_branch: branch === default_branch,
    head_sha,
  };
}

/**
 * Pull the deterministic fact-identity labels (the `_(…)_` spans) from a
 * living-architecture.md body. Drift is diffed on THESE, not the LLM prose,
 * which rewords the same fact across model builds. Stops at the Verification
 * footer so counts / dropped-claim lines don't count as content.
 */
export function extractInsights(markdown: string): string[] {
  const out: string[] = [];
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "## Verification") break;
    if (!line.startsWith("- ")) continue;
    const m = line.match(/_\(([^()]*)\)_\s*$/);
    if (m && m[1].trim().length > 0) out.push(m[1].trim());
  }
  return out;
}

export interface DriftResult {
  drifted: boolean;
  added: string[];
  removed: string[];
}

/** Diff two living-architecture docs by their verified-insight sets. Pure. */
export function diffArchitecture(oldMd: string, newMd: string): DriftResult {
  const oldSet = new Set(extractInsights(oldMd));
  const newSet = new Set(extractInsights(newMd));
  const added = [...newSet].filter((x) => !oldSet.has(x));
  const removed = [...oldSet].filter((x) => !newSet.has(x));
  return { drifted: added.length > 0 || removed.length > 0, added, removed };
}
