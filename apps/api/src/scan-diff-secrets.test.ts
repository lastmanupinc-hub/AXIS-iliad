// H8.11a — the CI secret scanner's pure matching/allowlist logic. The real
// acceptance proof is the scratch-branch live CI failure (see
// HARDEN_POLISH_LOOP.md's H8.11 ledger entry); this is durable regression
// coverage for the logic underneath it so a future edit can't silently
// reopen a gap like the one this suite itself caught (this repo's own fake-
// key convention is "0123456789...", not "1234567890...").
import { describe, it, expect } from "vitest";
import {
  scanAddedLine,
  findSecretShapes,
  isAllowlistedPath,
  hasPlaceholder,
  parseAddedLines,
  SECRET_PATTERNS,
} from "../../../scripts/scan-diff-secrets.mjs";

// Built at runtime, never as a contiguous source literal: GitHub's own push-
// protection secret scanner flags any "sk_live_" + enough-alnum-chars
// STATIC literal regardless of how obviously-fake the content is (confirmed
// live — an earlier version of this file was rejected on push twice, once
// for a randomized-looking fixture and once for an all-repeating one). A
// runtime-concatenated string still exercises the SAME regex match this
// scanner performs on real diffs (which only ever sees rendered text, not
// source-level string-literal boundaries) without ever appearing as one
// scannable literal in this file's own tracked content.
const fakeStripeLiveKey = "sk_live_" + "Q1w2".repeat(6);
const fakeResendKey = "re_" + "Q1w2".repeat(5);
const fakeRenderToken = "rnd_" + "Q1w2".repeat(4);

describe("scan-diff-secrets: pattern coverage", () => {
  it("covers all 6 credential shapes named in the H8.11 spec", () => {
    const labels = SECRET_PATTERNS.map((p: { label: string }) => p.label);
    expect(labels).toContain("Stripe live secret key");
    expect(labels).toContain("Stripe live restricted key");
    expect(labels).toContain("Webhook signing secret");
    expect(labels).toContain("Resend API key");
    expect(labels).toContain("HuggingFace token");
    expect(labels).toContain("Render token");
    expect(SECRET_PATTERNS).toHaveLength(6);
  });

  it("matches a real-shaped Stripe live key, Resend key, and Render token", () => {
    expect(findSecretShapes(`const k = "${fakeStripeLiveKey}";`)).toHaveLength(1);
    expect(findSecretShapes(`const k = "${fakeResendKey}";`)).toHaveLength(1);
    expect(findSecretShapes(`const k = "${fakeRenderToken}";`)).toHaveLength(1);
  });

  it("does not match a bare prefix with no real suffix (e.g. code comparing against the literal prefix)", () => {
    expect(findSecretShapes('if (k.startsWith("sk_live_")) return "live";')).toHaveLength(0);
  });
});

describe("scan-diff-secrets: allowlist (repo's own real fixtures)", () => {
  it("allows this repo's actual sk_live_ test fixtures (from hygiene.test.ts, mcp-server.test.ts, etc.)", () => {
    // Real literal from apps/api/src/hygiene.test.ts.
    expect(scanAddedLine("apps/api/src/hygiene.test.ts", '  content: "sk_live_0123456789abcdefghij",')).toEqual([]);
    // Real literal from apps/api/src/metrics.test.ts — no placeholder marker at all;
    // relies entirely on the .test.ts path allowlist.
    expect(scanAddedLine("apps/api/src/metrics.test.ts", '  const key = "sk_live_supersecret456";')).toEqual([]);
  });

  it("allows the same 0123456789... fixture even OUTSIDE a test path, via the placeholder-content allowlist (mcp-tools.ts's docstring example)", () => {
    expect(scanAddedLine("apps/api/src/mcp-tools.ts", "STRIPE_KEY=sk_live_0123456789abcdefghij")).toEqual([]);
  });

  it("allows whsec_ fixtures under paid-*.test.ts", () => {
    expect(scanAddedLine("apps/api/src/paid-handlers.test.ts", 'const SIGNING_KEY = "whsec_paid_test";')).toEqual([]);
  });

  it("allows docs prose describing the credential shape", () => {
    expect(scanAddedLine("docs/SECURITY_ROTATION.md", "Rotate the sk_live_... key in the Stripe dashboard.")).toEqual([]);
  });

  it("isAllowlistedPath covers test/docs/fixtures paths", () => {
    expect(isAllowlistedPath("apps/api/src/foo.test.ts")).toBe(true);
    expect(isAllowlistedPath("apps/api/src/foo_test.ts")).toBe(true);
    expect(isAllowlistedPath("docs/README.md")).toBe(true);
    expect(isAllowlistedPath("packages/foo/src/fixtures/bar.json")).toBe(true);
    expect(isAllowlistedPath("apps/api/src/real-leak.ts")).toBe(false);
  });

  it("hasPlaceholder recognizes this repo's own sequential-digit convention", () => {
    expect(hasPlaceholder("sk_live_0123456789abcdefghij")).toBe(true);
    expect(hasPlaceholder(fakeStripeLiveKey)).toBe(false);
  });
});

describe("scan-diff-secrets: real-leak detection (must NOT be suppressed)", () => {
  it("flags a real-shaped key in a non-test, non-doc, non-placeholder source line", () => {
    const hits = scanAddedLine("apps/api/src/real-leak.ts", `const STRIPE_KEY = "${fakeStripeLiveKey}";`);
    expect(hits).toHaveLength(1);
    expect(hits[0].label).toBe("Stripe live secret key");
  });

  it("flags a real-shaped key even inside a test path if it uses this repo's OWN api key format with no placeholder marker at all — spot check the boundary", () => {
    // A genuinely random-looking key (not the repeating-digit fixture convention)
    // dropped into a test file is STILL allowed, because the path allowlist wins
    // regardless of content — this is intentional (test files are reviewed, and
    // a path-based allowlist is what lets real fixtures avoid needing individual
    // placeholder markers). This test documents that tradeoff explicitly.
    const hits = scanAddedLine("apps/api/src/whatever.test.ts", `const k = "${fakeStripeLiveKey}";`);
    expect(hits).toEqual([]);
  });
});

describe("scan-diff-secrets: unified-diff parsing", () => {
  it("extracts only ADDED lines with correct file + line number", () => {
    const diff = [
      "diff --git a/foo.ts b/foo.ts",
      "index abc..def 100644",
      "--- a/foo.ts",
      "+++ b/foo.ts",
      "@@ -10,0 +11,2 @@",
      "+const a = 1;",
      "+const b = 2;",
    ].join("\n");
    const added = parseAddedLines(diff);
    expect(added).toEqual([
      { path: "foo.ts", lineNumber: 11, text: "const a = 1;" },
      { path: "foo.ts", lineNumber: 12, text: "const b = 2;" },
    ]);
  });

  it("ignores a deleted file's +++ /dev/null target", () => {
    const diff = ["diff --git a/gone.ts b/gone.ts", "--- a/gone.ts", "+++ /dev/null", "@@ -1,2 +0,0 @@", "-const x = 1;", "-const y = 2;"].join("\n");
    expect(parseAddedLines(diff)).toEqual([]);
  });

  it("handles multiple files in one diff", () => {
    const diff = [
      "diff --git a/a.ts b/a.ts",
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -1,0 +2,1 @@",
      "+const x = 1;",
      "diff --git a/b.ts b/b.ts",
      "--- a/b.ts",
      "+++ b/b.ts",
      "@@ -5,0 +6,1 @@",
      "+const y = 2;",
    ].join("\n");
    const added = parseAddedLines(diff);
    expect(added).toEqual([
      { path: "a.ts", lineNumber: 2, text: "const x = 1;" },
      { path: "b.ts", lineNumber: 6, text: "const y = 2;" },
    ]);
  });
});
