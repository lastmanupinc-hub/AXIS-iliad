import { describe, it, expect } from "vitest";
import {
  processThemeTokenSync,
  parseCssVariablePalette,
  replaceKnownHexLiteralsWithVars,
  type ThemeTokenSyncDeps,
} from "./theme-token-sync-watcher.js";
import { generateThemeCss } from "@axis/generator-core";
import { createSnapshot } from "@axis/snapshots";
import { buildContextMap } from "@axis/context-engine";
import type { FileEntry, WatchJobPayload, SnapshotManifest } from "@axis/snapshots";
import type { OpenApplyPrParams } from "./github-pr.js";

const REPO_FILES: FileEntry[] = [
  { path: "src/index.ts", content: 'export function main() { return "hi"; }', size: 40 },
  { path: "package.json", content: '{"name":"fixture-app"}', size: 24 },
];

/** The REAL theme.css this fixture repo's context produces — used to derive a real palette, never a hand-written stand-in. */
async function realPalette(): Promise<Map<string, string>> {
  const manifest: SnapshotManifest = {
    project_name: "o/r",
    project_type: "github_repository",
    frameworks: [],
    goals: ["Detect theme token drift"],
    requested_outputs: [],
  };
  const snapshot = await createSnapshot({ input_method: "github_repo_url", manifest, files: REPO_FILES }, undefined);
  const ctx = buildContextMap(snapshot);
  const css = generateThemeCss(ctx, REPO_FILES).content;
  return parseCssVariablePalette(css);
}

function payload(over?: Partial<WatchJobPayload>): WatchJobPayload {
  return {
    account_id: "acct-1",
    product_id: "theme",
    repo_full_name: "o/r",
    event_type: "push",
    ref: "refs/heads/main",
    ...over,
  };
}

function makeDeps(files: FileEntry[], opts?: { token?: string; openPr?: ThemeTokenSyncDeps["openPr"] }): { deps: ThemeTokenSyncDeps; openPrCalls: OpenApplyPrParams[] } {
  const openPrCalls: OpenApplyPrParams[] = [];
  const token = opts && "token" in opts ? opts.token : "t";
  const deps: ThemeTokenSyncDeps = {
    token,
    fetchRepo: async () => ({ files }),
    openPr:
      opts?.openPr ??
      (async (params) => {
        openPrCalls.push(params);
        return { opened: true, pr_url: "https://github.com/o/r/pull/1", pr_number: 1 };
      }),
  };
  return { deps, openPrCalls };
}

describe("parseCssVariablePalette", () => {
  it("parses --name: #hex; declarations, lowercasing the hex key", () => {
    const css = ":root {\n  --color-primary-500: #06B6D4;\n  --color-neutral-50: #f4f7fa;\n}\n";
    const palette = parseCssVariablePalette(css);
    expect(palette.get("#06b6d4")).toBe("--color-primary-500");
    expect(palette.get("#f4f7fa")).toBe("--color-neutral-50");
  });

  it("ignores non-color declarations", () => {
    const css = ":root {\n  --spacing-4: 1rem;\n  --color-primary-500: #06b6d4;\n}\n";
    const palette = parseCssVariablePalette(css);
    expect(palette.size).toBe(1);
  });
});

describe("replaceKnownHexLiteralsWithVars", () => {
  const palette = new Map([["#06b6d4", "--color-primary-500"]]);

  it("replaces an exact known hex with its var() reference", () => {
    const { content, replacedCount } = replaceKnownHexLiteralsWithVars("a { color: #06b6d4; }", palette);
    expect(content).toBe("a { color: var(--color-primary-500); }");
    expect(replacedCount).toBe(1);
  });

  it("is case-insensitive on the hex but leaves unknown hexes untouched", () => {
    const { content, replacedCount } = replaceKnownHexLiteralsWithVars("a { color: #06B6D4; border-color: #123456; }", palette);
    expect(content).toBe("a { color: var(--color-primary-500); border-color: #123456; }");
    expect(replacedCount).toBe(1);
  });

  it("replaces every occurrence, not just the first", () => {
    const { content, replacedCount } = replaceKnownHexLiteralsWithVars("a{color:#06b6d4}b{color:#06b6d4}", palette);
    expect(content).toBe("a{color:var(--color-primary-500)}b{color:var(--color-primary-500)}");
    expect(replacedCount).toBe(2);
  });

  it("returns replacedCount 0 and identical content when nothing matches", () => {
    const { content, replacedCount } = replaceKnownHexLiteralsWithVars("a { color: #ffffff; }", palette);
    expect(content).toBe("a { color: #ffffff; }");
    expect(replacedCount).toBe(0);
  });
});

describe("processThemeTokenSync", () => {
  it("ignores watch jobs for any product other than theme, without ever fetching the repo", async () => {
    const { deps } = makeDeps(REPO_FILES);
    let fetched = false;
    deps.fetchRepo = async () => {
      fetched = true;
      return { files: REPO_FILES };
    };
    const out = await processThemeTokenSync(payload({ product_id: "skills" }), deps);
    expect(out).toEqual({ status: "not_theme_product" });
    expect(fetched).toBe(false);
  });

  it("does nothing without a token", async () => {
    const { deps } = makeDeps(REPO_FILES, { token: undefined });
    expect(await processThemeTokenSync(payload(), deps)).toEqual({ status: "no_token" });
  });

  it("reports no_drift when no CSS/SCSS file contains a known token hex", async () => {
    // #123456 is not in the real fixed palette (confirmed by inspection, unlike
    // #ffffff which genuinely is one of the preset's surface colors).
    const files: FileEntry[] = [...REPO_FILES, { path: "src/App.css", content: "a { color: #123456; }", size: 22 }];
    const { deps, openPrCalls } = makeDeps(files);
    const out = await processThemeTokenSync(payload(), deps);
    expect(out.status).toBe("no_drift");
    expect(openPrCalls).toHaveLength(0);
  });

  it("opens a PR replacing a real, exact hardcoded token hex found in a real CSS file", async () => {
    const palette = await realPalette();
    const [knownHex] = [...palette.keys()];
    expect(knownHex).toBeTruthy(); // sanity: the real palette actually produced at least one entry

    const files: FileEntry[] = [...REPO_FILES, { path: "src/App.css", content: `a { color: ${knownHex}; }`, size: 30 }];
    const { deps, openPrCalls } = makeDeps(files);
    const out = await processThemeTokenSync(payload(), deps);
    expect(out.status).toBe("pr_opened");
    expect(out.changed_paths).toEqual(["src/App.css"]);
    expect(openPrCalls).toHaveLength(1);
    const call = openPrCalls[0];
    expect(call.owner).toBe("o");
    expect(call.repo).toBe("r");
    expect(call.baseBranch).toBe("main");
    expect(call.files[0].content).toBe(`a { color: var(${palette.get(knownHex)}); }`);
    expect(call.branchName).toMatch(/^axis\/theme-token-sync-[0-9a-f]{12}$/);
  });

  it("never treats the generated theme.css itself as a drift target", async () => {
    const palette = await realPalette();
    const [knownHex] = [...palette.keys()];
    // theme.css legitimately DEFINES these hexes (as the --var: #hex; declarations
    // themselves) — scanning it as a "drift" source would be nonsensical.
    const files: FileEntry[] = [...REPO_FILES, { path: "theme.css", content: `:root { --x: ${knownHex}; }`, size: 30 }];
    const { deps, openPrCalls } = makeDeps(files);
    const out = await processThemeTokenSync(payload(), deps);
    expect(out.status).toBe("no_drift");
    expect(openPrCalls).toHaveLength(0);
  });

  it("ignores non-CSS files even if they contain a known token hex literal", async () => {
    const palette = await realPalette();
    const [knownHex] = [...palette.keys()];
    const files: FileEntry[] = [...REPO_FILES, { path: "src/Component.tsx", content: `const c = "${knownHex}";`, size: 30 }];
    const { deps, openPrCalls } = makeDeps(files);
    const out = await processThemeTokenSync(payload(), deps);
    expect(out.status).toBe("no_drift");
    expect(openPrCalls).toHaveLength(0);
  });

  it("reports pr_skipped (not pr_opened) when the Apply channel reports the branch already exists", async () => {
    const palette = await realPalette();
    const [knownHex] = [...palette.keys()];
    const files: FileEntry[] = [...REPO_FILES, { path: "src/App.css", content: `a { color: ${knownHex}; }`, size: 30 }];
    const { deps } = makeDeps(files, {
      openPr: async () => ({ opened: false, reason: "branch already exists (apply PR likely already open)" }),
    });
    const out = await processThemeTokenSync(payload(), deps);
    expect(out.status).toBe("pr_skipped");
  });
});
