import { describe, it, expect } from "vitest";
import { processArchitectureDrift, type DriftDeps } from "./architecture-drift-webhook.js";
import type { PushInfo } from "./architecture-drift.js";
import type { OpenDriftPrParams } from "./github-pr.js";
import type { FileEntry } from "@axis/snapshots";

const push: PushInfo = {
  repo_full_name: "o/r",
  html_url: "https://github.com/o/r",
  ref: "refs/heads/main",
  branch: "main",
  default_branch: "main",
  is_default_branch: true,
  head_sha: "sha",
};

// A living-architecture doc shaped like the renderer's output (insights + footer).
function doc(insights: string[]): string {
  return ["# Living Architecture — r", "", "## Key symbols", ...insights.map((i) => `- ${i} _(x)_`), "", "## Verification", `- Verified (kept): ${insights.length}`].join("\n");
}

function makeDeps(opts: {
  token?: string;
  baselineDoc?: string;
  newDoc?: string;
  configured?: boolean;
  openPr?: DriftDeps["openPr"];
}): DriftDeps {
  const files = (
    opts.baselineDoc !== undefined
      ? [{ path: ".axis/living-architecture.md", content: opts.baselineDoc, size: 1 }]
      : [{ path: "src/x.ts", content: "x", size: 1 }]
  ) as unknown as FileEntry[];
  return {
    token: opts.token,
    fetchRepo: async () => ({ files }),
    analyze: async () => ({ content: opts.newDoc ?? doc(["A"]), configured: opts.configured ?? true }),
    openPr: opts.openPr ?? (async () => ({ opened: true, pr_url: "u", pr_number: 1 })),
  };
}

describe("processArchitectureDrift", () => {
  it("does nothing without a token", async () => {
    expect(await processArchitectureDrift(push, makeDeps({}))).toEqual({ status: "no_token" });
  });

  it("reports model_not_configured when the local model is absent", async () => {
    const out = await processArchitectureDrift(push, makeDeps({ token: "t", configured: false }));
    expect(out.status).toBe("model_not_configured");
  });

  it("reports no_drift when the verified doc is unchanged vs the committed baseline", async () => {
    const out = await processArchitectureDrift(push, makeDeps({ token: "t", baselineDoc: doc(["A"]), newDoc: doc(["A"]) }));
    expect(out.status).toBe("no_drift");
    expect(out.drift?.drifted).toBe(false);
  });

  it("opens a PR on drift with the new doc + correct path/branch", async () => {
    let captured: OpenDriftPrParams | null = null;
    const out = await processArchitectureDrift(
      push,
      makeDeps({
        token: "t",
        baselineDoc: doc(["A"]),
        newDoc: doc(["A", "B"]),
        openPr: async (p) => {
          captured = p;
          return { opened: true, pr_url: "https://github.com/o/r/pull/9", pr_number: 9 };
        },
      }),
    );
    expect(out.status).toBe("pr_opened");
    expect(out.drift?.added).toContain("B");
    expect(out.pr?.pr_number).toBe(9);
    expect(captured!.filePath).toBe(".axis/living-architecture.md");
    expect(captured!.content).toBe(doc(["A", "B"]));
    expect(captured!.baseBranch).toBe("main");
    expect(captured!.branchName).toMatch(/^axis\/arch-drift-/);
  });

  it("treats an absent committed doc as an empty baseline (first run → drift → PR)", async () => {
    const out = await processArchitectureDrift(push, makeDeps({ token: "t", newDoc: doc(["A"]) }));
    expect(out.status).toBe("pr_opened");
    expect(out.drift?.added).toContain("A");
  });

  it("reports pr_skipped when the PR opener declines (already in flight)", async () => {
    const out = await processArchitectureDrift(
      push,
      makeDeps({ token: "t", baselineDoc: doc(["A"]), newDoc: doc(["B"]), openPr: async () => ({ opened: false, reason: "branch already exists" }) }),
    );
    expect(out.status).toBe("pr_skipped");
    expect(out.pr?.reason).toMatch(/already exists/);
  });
});
