import { describe, it, expect } from "vitest";
import { processCanvasDiagramSync, realRenderD2, DIAGRAM_D2_PATH, DIAGRAM_SVG_PATH, type CanvasDiagramSyncDeps } from "./canvas-diagram-watcher.js";
import type { FileEntry, WatchJobPayload } from "@axis/snapshots";
import type { OpenApplyPrParams } from "./github-pr.js";

const REPO_FILES: FileEntry[] = [
  { path: "apps/api/src/index.ts", content: 'import { helper } from "../../../packages/core/src/index.js";', size: 60 },
  { path: "packages/core/src/index.ts", content: "export function helper() {}", size: 30 },
];

function payload(over?: Partial<WatchJobPayload>): WatchJobPayload {
  return {
    account_id: "acct-1",
    product_id: "canvas",
    repo_full_name: "o/r",
    event_type: "push",
    ref: "refs/heads/main",
    ...over,
  };
}

function makeDeps(
  files: FileEntry[],
  opts?: { token?: string; renderD2?: CanvasDiagramSyncDeps["renderD2"]; openPr?: CanvasDiagramSyncDeps["openPr"] },
): { deps: CanvasDiagramSyncDeps; openPrCalls: OpenApplyPrParams[] } {
  const openPrCalls: OpenApplyPrParams[] = [];
  const token = opts && "token" in opts ? opts.token : "t";
  const deps: CanvasDiagramSyncDeps = {
    token,
    fetchRepo: async () => ({ files }),
    renderD2: opts?.renderD2 ?? (() => ({ ok: true, svg: "<svg>fake</svg>" })),
    openPr:
      opts?.openPr ??
      (async (params) => {
        openPrCalls.push(params);
        return { opened: true, pr_url: "https://github.com/o/r/pull/1", pr_number: 1 };
      }),
  };
  return { deps, openPrCalls };
}

describe("processCanvasDiagramSync", () => {
  it("ignores watch jobs for any product other than canvas, without ever fetching the repo", async () => {
    const { deps } = makeDeps(REPO_FILES);
    let fetched = false;
    deps.fetchRepo = async () => {
      fetched = true;
      return { files: REPO_FILES };
    };
    const out = await processCanvasDiagramSync(payload({ product_id: "theme" }), deps);
    expect(out).toEqual({ status: "not_canvas_product" });
    expect(fetched).toBe(false);
  });

  it("does nothing without a token", async () => {
    const { deps } = makeDeps(REPO_FILES, { token: undefined });
    expect(await processCanvasDiagramSync(payload(), deps)).toEqual({ status: "no_token" });
  });

  it("reports no_changes when the committed diagram already matches what would be regenerated", async () => {
    // First run to learn the real generated content, then feed it back as "already committed".
    const { deps: firstDeps, openPrCalls: firstCalls } = makeDeps(REPO_FILES);
    const first = await processCanvasDiagramSync(payload(), firstDeps);
    expect(first.status).toBe("pr_opened");
    const committedD2 = firstCalls[0].files.find((f) => f.path === DIAGRAM_D2_PATH)!.content;

    const filesWithDiagram: FileEntry[] = [...REPO_FILES, { path: DIAGRAM_D2_PATH, content: committedD2, size: committedD2.length }];
    const { deps, openPrCalls } = makeDeps(filesWithDiagram);
    const out = await processCanvasDiagramSync(payload(), deps);
    expect(out.status).toBe("no_changes");
    expect(openPrCalls).toHaveLength(0);
  });

  it("opens a PR with both the .d2 source and the rendered .svg when the diagram changed", async () => {
    const { deps, openPrCalls } = makeDeps(REPO_FILES);
    const out = await processCanvasDiagramSync(payload(), deps);
    expect(out.status).toBe("pr_opened");
    expect(openPrCalls).toHaveLength(1);
    const call = openPrCalls[0];
    expect(call.owner).toBe("o");
    expect(call.repo).toBe("r");
    expect(call.files.map((f) => f.path).sort()).toEqual([DIAGRAM_D2_PATH, DIAGRAM_SVG_PATH].sort());
    expect(call.files.find((f) => f.path === DIAGRAM_SVG_PATH)?.content).toBe("<svg>fake</svg>");
    expect(call.branchName).toMatch(/^axis\/canvas-diagram-[0-9a-f]{12}$/);
  });

  it("never treats the diagram's own prior output as an input to its regeneration", async () => {
    // The committed .d2/.svg files themselves must not appear as "source
    // files" whose imports get analyzed — they're generator OUTPUT, not code.
    const filesWithStaleDiagram: FileEntry[] = [
      ...REPO_FILES,
      { path: DIAGRAM_D2_PATH, content: "stale diagram content that would never match a fresh regeneration", size: 10 },
      { path: DIAGRAM_SVG_PATH, content: "<svg>stale</svg>", size: 10 },
    ];
    const { deps, openPrCalls } = makeDeps(filesWithStaleDiagram);
    const out = await processCanvasDiagramSync(payload(), deps);
    // Stale committed content differs from a fresh regeneration -> PR opens (proves diffing against the REAL committed .d2, not silently no-oping).
    expect(out.status).toBe("pr_opened");
    expect(openPrCalls[0].files.find((f) => f.path === DIAGRAM_SVG_PATH)?.content).toBe("<svg>fake</svg>");
  });

  it("reports render_failed (not a silent pass) when D2 rendering fails, and never opens a PR", async () => {
    const { deps, openPrCalls } = makeDeps(REPO_FILES, { renderD2: () => ({ ok: false, error: "d2: parse error" }) });
    const out = await processCanvasDiagramSync(payload(), deps);
    expect(out.status).toBe("render_failed");
    expect(out.render_error).toContain("parse error");
    expect(openPrCalls).toHaveLength(0);
  });

  it("reports pr_skipped (not pr_opened) when the Apply channel reports the branch already exists", async () => {
    const { deps } = makeDeps(REPO_FILES, {
      openPr: async () => ({ opened: false, reason: "branch already exists (apply PR likely already open)" }),
    });
    const out = await processCanvasDiagramSync(payload(), deps);
    expect(out.status).toBe("pr_skipped");
  });
});

describe("realRenderD2 (real D2 binary, no mocks)", () => {
  const d2Available = (() => {
    const { spawnSync } = require("node:child_process") as typeof import("node:child_process");
    const r = spawnSync("d2", ["--version"], { encoding: "utf-8", shell: process.platform === "win32" });
    return r.status === 0;
  })();

  // D2's own first render can genuinely take longer than vitest's default 5s
  // (layout engine / font cache cold-start) — this is real render time, not a
  // stuck process, so a longer test timeout is correct here (unlike
  // release-operator's spawnSync hang, which was a real bug).
  it.skipIf(!d2Available)("renders real D2 source into a real SVG document", () => {
    const result = realRenderD2('a: "Apps"\nb: "Packages"\na -> b: "3"\n');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.svg).toContain("<svg");
      expect(result.svg).toContain("</svg>");
    }
  }, 30_000);

  it.skipIf(!d2Available)("reports a real failure (not a false pass) for genuinely invalid D2 syntax", () => {
    const result = realRenderD2("this is not valid d2 syntax: [[[");
    expect(result.ok).toBe(false);
  }, 30_000);
});
