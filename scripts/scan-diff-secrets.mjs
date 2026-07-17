#!/usr/bin/env node
// H8.11a — CI secret scan. Greps every line a push ADDS (not the whole repo
// state) for the credential shapes named in HARDEN_POLISH_LOOP.md's H8.11
// spec: sk_live_, rk_live_, whsec_, a Resend key (re_ + 20+ alnum), a
// HuggingFace token (hf_ + 30+ alnum), and a Render token (rnd_). Diff-scoped
// by design: existing, already-reviewed fixtures never need retroactive
// allowlisting — only NEW additions in the current push are ever scanned.
//
// Deliberately a SEPARATE pattern/allowlist list from apps/api/src/hygiene.ts
// (the MCP hygiene tool's customer-facing secret scanner for THIRD-PARTY
// repos) rather than sharing one: the two scanners protect different things
// (this repo's own git history vs. a customer's uploaded code) and cover
// different provider sets (this one adds Resend/HuggingFace/Render, which
// hygiene.ts doesn't scan for; hygiene.ts also covers AWS/GitHub/Slack/
// private-key shapes this one doesn't need). The path+content allowlist
// PHILOSOPHY is intentionally the same as hygiene.ts's (proven, already
// tested there) — just not the same literal list, since the two surfaces
// have genuinely different false-positive profiles.
//
// Usage: node scripts/scan-diff-secrets.mjs [<base>..<head>]
//   No args: diffs HEAD^..HEAD (the most recent commit).
//   One ref range: diffs exactly that range (e.g. for GitHub Actions'
//   push-event before/after SHAs, or a PR's merge-base..head).
// Exit code 0 = clean; 1 = at least one credential-shaped string found in an
// added line outside the allowlist. This step is meant to BLOCK the push —
// unlike live-probe.mjs (H6.3/H8.9), it is deliberately gating.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// ─── Patterns (H8.11's own named list) ───────────────────────────

export const SECRET_PATTERNS = [
  { label: "Stripe live secret key", re: /sk_live_[0-9a-zA-Z]{8,}/ },
  { label: "Stripe live restricted key", re: /rk_live_[0-9a-zA-Z]{8,}/ },
  { label: "Webhook signing secret", re: /whsec_[0-9a-zA-Z]{8,}/ },
  { label: "Resend API key", re: /re_[A-Za-z0-9]{20,}/ },
  { label: "HuggingFace token", re: /hf_[A-Za-z0-9]{30,}/ },
  { label: "Render token", re: /rnd_[0-9a-zA-Z]{8,}/ },
];

// Low-entropy placeholder tokens that are NOT real secrets (case-insensitive
// substring match on the matched token itself) — mirrors hygiene.ts's own
// PLACEHOLDER_MARKERS philosophy so an obviously-fake value never needs a
// path-based exemption at all.
const PLACEHOLDER_MARKERS = [
  "xxxx", "abcdef1234", "0000", "example", "changeme", "redacted",
  "your_", "placeholder", "dummy", "<", "nnnn", "1234567890",
  "0123456789", // this repo's own established fake-key convention (see hygiene.test.ts)
  "fake", "test",
];

// Path allowlist: files where a secret-SHAPED (but not placeholder-marked)
// string is expected to legitimately appear — test fixtures, docs describing
// the credential format, and this script's own pattern-literal source.
const PATH_ALLOW = [
  /\.test\.[a-z]+$/i,
  /_test\.[a-z]+$/i,
  /\.spec\.[a-z]+$/i,
  /(^|\/)tests?\//i,
  /(^|\/)fixtures?\//i,
  /(^|\/)docs?\//i,
  /\.md$/i,
  /(^|\/)scan-diff-secrets\.mjs$/, // this file's own SECRET_PATTERNS literals
];

export function isAllowlistedPath(path) {
  return PATH_ALLOW.some((re) => re.test(path));
}

export function hasPlaceholder(token) {
  const low = token.toLowerCase();
  return PLACEHOLDER_MARKERS.some((m) => low.includes(m));
}

/** Scan one added line's text for credential shapes. Returns a list of {label, token} matches BEFORE allowlisting. */
export function findSecretShapes(text) {
  const hits = [];
  for (const { label, re } of SECRET_PATTERNS) {
    const m = text.match(re);
    if (m) hits.push({ label, token: m[0] });
  }
  return hits;
}

/**
 * The full decision for one added line: does it contain a credential shape
 * that is NOT excused by either allowlist? Returns the surviving findings
 * (empty array = clean).
 */
export function scanAddedLine(path, text) {
  const shapes = findSecretShapes(text);
  if (shapes.length === 0) return [];
  if (isAllowlistedPath(path)) return [];
  return shapes.filter((s) => !hasPlaceholder(s.token));
}

// ─── Diff parsing + CLI ───────────────────────────────────────────

/** Parse `git diff --unified=0` output into {path, lineNumber, text} for each ADDED line. */
export function parseAddedLines(diffText) {
  const out = [];
  let currentPath = null;
  let nextLine = null;
  for (const line of diffText.split("\n")) {
    if (line.startsWith("+++ ")) {
      const raw = line.slice(4).trim();
      currentPath = raw === "/dev/null" ? null : raw.replace(/^b\//, "");
      continue;
    }
    if (line.startsWith("@@ ")) {
      const m = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      nextLine = m ? Number(m[1]) : null;
      continue;
    }
    if (line.startsWith("+++") || line.startsWith("---")) continue; // guard against odd ordering
    if (line.startsWith("+")) {
      if (currentPath !== null && nextLine !== null) {
        out.push({ path: currentPath, lineNumber: nextLine, text: line.slice(1) });
        nextLine++;
      }
      continue;
    }
    // context/removed lines don't advance the "+" counter under --unified=0
    // (there are none), but stay defensive if invoked without it.
    if (!line.startsWith("-") && nextLine !== null) nextLine++;
  }
  return out;
}

// The CI workflow always passes an explicit range (computed from the push/PR
// event context, since that's the only place the right before/after SHAs are
// reliably available). This default is for direct/manual invocation only.
function resolveRange(argRange) {
  return argRange || "HEAD^..HEAD";
}

function main() {
  const range = resolveRange(process.argv[2]);
  let diffText;
  try {
    diffText = execFileSync("git", ["diff", "--unified=0", range], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    console.error(`[secret-scan] git diff ${range} failed: ${err.message}`);
    process.exit(1);
  }

  const added = parseAddedLines(diffText);
  const findings = [];
  for (const { path, lineNumber, text } of added) {
    const hits = scanAddedLine(path, text);
    for (const h of hits) findings.push({ path, lineNumber, ...h });
  }

  if (findings.length === 0) {
    console.log(`[secret-scan] clean — 0 credential-shaped strings in ${added.length} added line(s) (range: ${range})`);
    process.exit(0);
  }

  console.error(`[secret-scan] FOUND ${findings.length} credential-shaped string(s):`);
  for (const f of findings) {
    console.error(`  ${f.path}:${f.lineNumber} — ${f.label}: ${f.token.slice(0, 12)}…`);
  }
  console.error(`\nIf this is a genuine fake/test fixture, either move it under a *.test.*, docs/, or fixtures/ path, or include an obvious placeholder marker (xxxx, example, changeme, dummy, ...) in the literal.`);
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
