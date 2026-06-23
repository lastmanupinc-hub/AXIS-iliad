import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyGitHubWebhookSignature, parsePushEvent, extractInsights, diffArchitecture } from "./architecture-drift.js";

function sign(body: string, secret: string): string {
  return "sha256=" + createHmac("sha256", secret).update(Buffer.from(body, "utf8")).digest("hex");
}

describe("verifyGitHubWebhookSignature", () => {
  const secret = "s3cr3t";
  const body = JSON.stringify({ ref: "refs/heads/main", repository: { full_name: "o/r" } });

  it("accepts a correctly-signed body", () => {
    expect(verifyGitHubWebhookSignature(body, sign(body, secret), secret)).toBe(true);
  });

  it("rejects a wrong secret, tampered body, and a valid sig over different bytes", () => {
    expect(verifyGitHubWebhookSignature(body, sign(body, "other"), secret)).toBe(false);
    expect(verifyGitHubWebhookSignature(body + "x", sign(body, secret), secret)).toBe(false);
    expect(verifyGitHubWebhookSignature(body, sign("different", secret), secret)).toBe(false);
  });

  it("rejects missing / malformed signature headers and an empty secret", () => {
    expect(verifyGitHubWebhookSignature(body, undefined, secret)).toBe(false);
    expect(verifyGitHubWebhookSignature(body, "sha1=abc", secret)).toBe(false);
    expect(verifyGitHubWebhookSignature(body, "sha256=nothexnothex", secret)).toBe(false);
    expect(verifyGitHubWebhookSignature(body, "sha256=" + "a".repeat(63), secret)).toBe(false);
    expect(verifyGitHubWebhookSignature(body, sign(body, secret), "")).toBe(false);
  });

  it("is case-insensitive on the hex digest", () => {
    const sig = sign(body, secret);
    const upper = sig.slice(0, 7) + sig.slice(7).toUpperCase();
    expect(verifyGitHubWebhookSignature(body, upper, secret)).toBe(true);
  });
});

describe("parsePushEvent", () => {
  it("parses a default-branch push", () => {
    const info = parsePushEvent({
      ref: "refs/heads/main",
      after: "abc123",
      repository: { full_name: "o/r", html_url: "https://github.com/o/r", default_branch: "main" },
    });
    expect(info).not.toBeNull();
    expect(info!.repo_full_name).toBe("o/r");
    expect(info!.branch).toBe("main");
    expect(info!.is_default_branch).toBe(true);
    expect(info!.head_sha).toBe("abc123");
  });

  it("flags a non-default-branch push", () => {
    const info = parsePushEvent({
      ref: "refs/heads/feature",
      repository: { full_name: "o/r", html_url: "https://github.com/o/r", default_branch: "main" },
    });
    expect(info!.is_default_branch).toBe(false);
  });

  it("returns null on garbage / missing fields", () => {
    expect(parsePushEvent(null)).toBeNull();
    expect(parsePushEvent({})).toBeNull();
    expect(parsePushEvent({ ref: "refs/heads/main" })).toBeNull(); // no repository
    expect(parsePushEvent({ repository: { full_name: "o/r", html_url: "u" } })).toBeNull(); // no ref
  });
});

describe("extractInsights + diffArchitecture", () => {
  const doc = (insights: string[], dropped = 0): string =>
    [
      "# Living Architecture — demo",
      "",
      "## Key symbols",
      ...insights.map((i) => `- some prose _(${i})_`), // drift keys on the _(label)_, so vary it per item
      "",
      "## Verification",
      `- Claims proposed: ${insights.length + dropped}`,
      `- Verified (kept): ${insights.length}`,
      `- Dropped (unverifiable): ${dropped}`,
      ...(dropped ? ["", "### Dropped claims", `- "ghost" — not found`] : []),
    ].join("\n");

  it("extracts insight lines, stops at Verification, strips the evidence label", () => {
    expect(extractInsights(doc(["A bootstraps", "B handles auth"], 1))).toEqual(["A bootstraps", "B handles auth"]);
  });

  it("reports no drift for identical docs", () => {
    const a = doc(["A", "B"]);
    expect(diffArchitecture(a, a)).toEqual({ drifted: false, added: [], removed: [] });
  });

  it("reports added and removed insights", () => {
    const r = diffArchitecture(doc(["A", "B"]), doc(["B", "C"]));
    expect(r.drifted).toBe(true);
    expect(r.added).toEqual(["C"]);
    expect(r.removed).toEqual(["A"]);
  });

  it("ignores prose rewording — drift keys on the evidence label, not the LLM prose", () => {
    const a = ["# x", "## Key symbols", "- Express powers the HTTP layer _(dependency express)_", "", "## Verification"].join("\n");
    const b = ["# x", "## Key symbols", "- The server routes via Express _(dependency express)_", "", "## Verification"].join("\n");
    expect(diffArchitecture(a, b)).toEqual({ drifted: false, added: [], removed: [] });
  });
});
