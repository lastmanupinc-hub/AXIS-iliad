import { describe, it, expect } from "vitest";
import {
  processSeoApply,
  injectIntoHtml,
  buildManagedBlock,
  pickHtmlTarget,
  MARKER_START,
  MARKER_END,
  SEO_TAGS_PATH,
  type SeoApplyDeps,
} from "./seo-apply-watcher.js";
import type { FileEntry, WatchJobPayload } from "@axis/snapshots";
import type { OpenApplyPrParams } from "./github-pr.js";

const HTML = `<!doctype html>
<html>
<head>
  <title>Existing</title>
</head>
<body><h1>hi</h1></body>
</html>
`;

const REPO_FILES: FileEntry[] = [
  { path: "index.html", content: HTML, size: HTML.length },
  { path: "package.json", content: JSON.stringify({ name: "fixture-app", description: "A real described app" }), size: 60 },
  { path: "src/index.ts", content: "export const x = 1;", size: 20 },
];

function payload(over?: Partial<WatchJobPayload>): WatchJobPayload {
  return { account_id: "a", product_id: "seo", repo_full_name: "o/r", event_type: "push", ref: "refs/heads/main", ...over };
}

function makeDeps(files: FileEntry[], opts?: { token?: string; openPr?: SeoApplyDeps["openPr"] }): { deps: SeoApplyDeps; calls: OpenApplyPrParams[] } {
  const calls: OpenApplyPrParams[] = [];
  const deps: SeoApplyDeps = {
    token: opts && "token" in opts ? opts.token : "t",
    fetchRepo: async () => ({ files }),
    openPr:
      opts?.openPr ??
      (async (p) => {
        calls.push(p);
        return { opened: true, pr_url: "https://github.com/o/r/pull/1", pr_number: 1 };
      }),
  };
  return { deps, calls };
}

describe("injectIntoHtml", () => {
  const block = buildManagedBlock('<meta name="description" content="x" />');

  it("inserts before </head> when no markers exist", () => {
    const out = injectIntoHtml(HTML, block)!;
    expect(out).toContain(MARKER_START);
    expect(out.indexOf(MARKER_START)).toBeLessThan(out.indexOf("</head>"));
    expect(out).toContain("<title>Existing</title>"); // pre-existing head content survives
    expect(out).toContain("<h1>hi</h1>"); // body untouched
  });

  it("is idempotent — re-injecting replaces the block instead of stacking duplicates", () => {
    const once = injectIntoHtml(HTML, block)!;
    const twice = injectIntoHtml(once, block)!;
    expect(twice).toBe(once);
    expect(twice.split(MARKER_START).length - 1).toBe(1);
  });

  it("replaces stale managed content in place, leaving everything outside the markers alone", () => {
    const stale = injectIntoHtml(HTML, buildManagedBlock("<meta name=\"description\" content=\"OLD\" />"))!;
    const fresh = injectIntoHtml(stale, block)!;
    expect(fresh).not.toContain("OLD");
    expect(fresh).toContain('content="x"');
    expect(fresh).toContain("<title>Existing</title>");
    expect(fresh).toContain("<h1>hi</h1>");
  });

  it("returns null when there is no </head> to anchor to, rather than guessing", () => {
    expect(injectIntoHtml("<p>fragment</p>", block)).toBeNull();
  });
});

describe("pickHtmlTarget", () => {
  it("prefers the shallowest index.html", () => {
    const files: FileEntry[] = [
      { path: "packages/site/public/index.html", content: "<head></head>", size: 10 },
      { path: "index.html", content: "<head></head>", size: 10 },
    ];
    expect(pickHtmlTarget(files)!.path).toBe("index.html");
  });

  it("returns null when the repo has no index.html", () => {
    expect(pickHtmlTarget([{ path: "src/a.ts", content: "", size: 0 }])).toBeNull();
  });
});

describe("processSeoApply", () => {
  it("ignores products other than seo without fetching the repo", async () => {
    const { deps } = makeDeps(REPO_FILES);
    let fetched = false;
    deps.fetchRepo = async () => {
      fetched = true;
      return { files: REPO_FILES };
    };
    expect(await processSeoApply(payload({ product_id: "canvas" }), deps)).toEqual({ status: "not_seo_product" });
    expect(fetched).toBe(false);
  });

  it("does nothing without a token", async () => {
    const { deps } = makeDeps(REPO_FILES, { token: undefined });
    expect(await processSeoApply(payload(), deps)).toEqual({ status: "no_token" });
  });

  it("opens a PR that injects the managed block into the repo's own index.html", async () => {
    const { deps, calls } = makeDeps(REPO_FILES);
    const out = await processSeoApply(payload(), deps);
    expect(out.status).toBe("pr_opened");
    expect(out.target).toBe("index.html");
    expect(calls).toHaveLength(1);

    const written = calls[0].files[0];
    expect(written.path).toBe("index.html");
    expect(written.content).toContain(MARKER_START);
    expect(written.content).toContain(MARKER_END);
    expect(written.content).toContain("application/ld+json");
    expect(written.content).toContain("<h1>hi</h1>"); // the user's body is preserved
  });

  it("reports no_changes when the committed HTML already holds the current block", async () => {
    const { deps: first, calls: firstCalls } = makeDeps(REPO_FILES);
    expect((await processSeoApply(payload(), first)).status).toBe("pr_opened");
    const applied = firstCalls[0].files[0].content;

    const already: FileEntry[] = [{ path: "index.html", content: applied, size: applied.length }, ...REPO_FILES.slice(1)];
    const { deps, calls } = makeDeps(already);
    const out = await processSeoApply(payload(), deps);
    expect(out.status).toBe("no_changes");
    expect(calls).toHaveLength(0);
  });

  it("falls back to a standalone file when the repo has no HTML document", async () => {
    const noHtml = REPO_FILES.filter((f) => f.path !== "index.html");
    const { deps, calls } = makeDeps(noHtml);
    const out = await processSeoApply(payload(), deps);
    expect(out.status).toBe("pr_opened");
    expect(out.target).toBe(SEO_TAGS_PATH);
    expect(calls[0].files[0].path).toBe(SEO_TAGS_PATH);
  });

  it("never treats its own prior standalone output as an input to regeneration", async () => {
    const withStale: FileEntry[] = [
      ...REPO_FILES.filter((f) => f.path !== "index.html"),
      { path: SEO_TAGS_PATH, content: "<!-- stale prior output that must not influence the next run -->", size: 40 },
    ];
    const { deps, calls } = makeDeps(withStale);
    const out = await processSeoApply(payload(), deps);
    expect(out.status).toBe("pr_opened");
    expect(calls[0].files[0].content).not.toContain("stale prior output");
  });

  it("reports pr_skipped when the Apply channel says the branch already exists", async () => {
    const { deps } = makeDeps(REPO_FILES, {
      openPr: async () => ({ opened: false, reason: "branch already exists (apply PR likely already open)" }),
    });
    expect((await processSeoApply(payload(), deps)).status).toBe("pr_skipped");
  });
});
