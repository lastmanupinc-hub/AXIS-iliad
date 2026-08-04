// The V gate in isolation: if the generated structured data is invalid, NO PR
// may be opened. Split into its own file because it mocks the generator to
// force output the real one never produces — a PR that injects broken JSON-LD
// into a user's <head> is worse than doing nothing, since search engines act on
// it, so this property is worth proving rather than assuming.
import { describe, it, expect, vi } from "vitest";
import type { FileEntry, WatchJobPayload } from "@axis/snapshots";
import type { OpenApplyPrParams } from "./github-pr.js";

const generateSeoHeadTags = vi.fn();

vi.mock("@axis/generator-core", async (importOriginal) => {
  // Keep the REAL validator — mocking it too would make this test prove nothing.
  const actual = await importOriginal<typeof import("@axis/generator-core")>();
  return { ...actual, generateSeoHeadTags: (...args: unknown[]) => generateSeoHeadTags(...args) };
});

const REPO_FILES: FileEntry[] = [
  { path: "index.html", content: "<html><head><title>x</title></head><body></body></html>", size: 55 },
  { path: "package.json", content: JSON.stringify({ name: "fixture" }), size: 25 },
];

const payload: WatchJobPayload = {
  account_id: "a",
  product_id: "seo",
  repo_full_name: "o/r",
  event_type: "push",
  ref: "refs/heads/main",
};

describe("processSeoApply — structured-data gate", () => {
  it("refuses to open a PR when the generated JSON-LD is invalid, and says why", async () => {
    generateSeoHeadTags.mockReturnValue({
      path: "seo-head-tags.html",
      // @type missing entirely, and a placeholder name — both must be caught.
      content: `<script type="application/ld+json">{"@context":"https://schema.org","name":"TODO"}</script>`,
      content_type: "text/html",
      program: "seo",
      description: "",
    });

    const { processSeoApply } = await import("./seo-apply-watcher.js");
    const calls: OpenApplyPrParams[] = [];
    const out = await processSeoApply(payload, {
      token: "t",
      fetchRepo: async () => ({ files: REPO_FILES }),
      openPr: async (p) => {
        calls.push(p);
        return { opened: true, pr_url: "u", pr_number: 1 };
      },
    });

    expect(out.status).toBe("invalid_structured_data");
    expect(calls, "no PR may be opened when validation fails").toHaveLength(0);
    expect(out.validation_errors?.join(" ")).toMatch(/@type/);
    // 30s: this file importOriginal's the whole generator module AND takes a
    // real Postgres snapshot, which together exceed vitest's 5s default.
  }, 30_000);

  it("proceeds to a PR once the same generator emits valid markup (the gate is not simply always-closed)", async () => {
    generateSeoHeadTags.mockReturnValue({
      path: "seo-head-tags.html",
      content: `<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"fixture"}</script>`,
      content_type: "text/html",
      program: "seo",
      description: "",
    });

    const { processSeoApply } = await import("./seo-apply-watcher.js");
    const calls: OpenApplyPrParams[] = [];
    const out = await processSeoApply(payload, {
      token: "t",
      fetchRepo: async () => ({ files: REPO_FILES }),
      openPr: async (p) => {
        calls.push(p);
        return { opened: true, pr_url: "u", pr_number: 1 };
      },
    });

    expect(out.status).toBe("pr_opened");
    expect(calls).toHaveLength(1);
  }, 30_000);
});
