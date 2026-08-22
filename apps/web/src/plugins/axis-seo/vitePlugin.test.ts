// ext_01 (2026-08-21): the real bug this file exists to guard against.
//
// vitePlugin.ts had ZERO test coverage before this file — only schema.ts/
// config.ts (vendored alongside it for their own tests) were covered. That
// gap let a real production defect ship silently: this plugin's
// generateBundle unconditionally emitFile()'d its own 4-line robots.txt,
// and Vite copies `publicDir` into the output directory BEFORE this
// plugin's emitted assets are written — confirmed empirically with a
// diagnostic build (Object.keys(bundle) at generateBundle time did not
// contain "robots.txt") and confirmed LIVE: iliad.trustfabric.ai/robots.txt
// served this plugin's minimal fallback, never apps/web/public/robots.txt's
// real, richer, hand-authored content (agent-specific crawl directives,
// x402 pricing, a /for-agents link), on every single build.
//
// These tests call the plugin's generateBundle hook directly with a mocked
// Rollup `this` (emitFile/warn as spies) rather than running a full Vite
// build — the hook is a plain function, and this is fast and precise. A
// real end-to-end build is also exercised (see the last describe block)
// so the fix is proven at both levels, not just asserted at one.
import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";
import { axisSeo, type AxisSeoOptions } from "./vitePlugin.js";
import { defineSeoConfig } from "./config.js";

function baseOpts(overrides: Partial<AxisSeoOptions> = {}): AxisSeoOptions {
  return {
    config: defineSeoConfig({
      siteUrl: "https://example.com/",
      siteName: "Example",
      defaultImage: "/og.png",
    }),
    routes: [{ path: "/", title: "Home", description: "The home page" }],
    ...overrides,
  };
}

function makeBundle() {
  return {
    "index.html": {
      type: "asset" as const,
      source: "<html><head></head><body></body></html>",
    },
  };
}

/** Rollup plugin hooks are plain functions — call one directly with a mocked `this`. */
function runGenerateBundle(plugin: ReturnType<typeof axisSeo>, bundle: ReturnType<typeof makeBundle>) {
  const emitFile = vi.fn();
  const warn = vi.fn();
  const hook = plugin.generateBundle as unknown as (this: unknown, opts: unknown, bundle: unknown) => void;
  hook.call({ emitFile, warn }, {}, bundle);
  return { emitFile, warn };
}

function emittedFileNames(emitFile: ReturnType<typeof vi.fn>): string[] {
  return emitFile.mock.calls.map((c) => (c[0] as { fileName: string }).fileName);
}

describe("axisSeo — robots.txt ownership (emitRobotsTxt)", () => {
  it("emits its own robots.txt by default — the behavior that caused the bug", () => {
    const plugin = axisSeo(baseOpts());
    const { emitFile } = runGenerateBundle(plugin, makeBundle());
    expect(emittedFileNames(emitFile)).toContain("robots.txt");
  });

  it("does NOT emit robots.txt when emitRobotsTxt is false — THE FIX", () => {
    const plugin = axisSeo(baseOpts({ emitRobotsTxt: false }));
    const { emitFile } = runGenerateBundle(plugin, makeBundle());
    expect(emittedFileNames(emitFile)).not.toContain("robots.txt");
  });

  it("still emits sitemap.xml when emitRobotsTxt is false — the two are independent knobs", () => {
    const plugin = axisSeo(baseOpts({ emitRobotsTxt: false }));
    const { emitFile } = runGenerateBundle(plugin, makeBundle());
    expect(emittedFileNames(emitFile)).toContain("sitemap.xml");
  });

  it("emits neither when emitSitemap is false, regardless of emitRobotsTxt", () => {
    const plugin = axisSeo(baseOpts({ emitSitemap: false, emitRobotsTxt: true }));
    const { emitFile } = runGenerateBundle(plugin, makeBundle());
    const names = emittedFileNames(emitFile);
    expect(names).not.toContain("robots.txt");
    expect(names).not.toContain("sitemap.xml");
  });

  it("still decorates page heads (title/canonical/JSON-LD) when emitRobotsTxt is false", () => {
    // A narrow fix must not have a wide blast radius — the option only
    // touches robots.txt emission, nothing else this plugin does.
    const plugin = axisSeo(baseOpts({ emitRobotsTxt: false }));
    const bundle = makeBundle();
    runGenerateBundle(plugin, bundle);
    expect(bundle["index.html"].source).toContain("<title>Home</title>");
    expect(bundle["index.html"].source).toContain('rel="canonical"');
  });
});

describe("axisSeo — real end-to-end build (apps/web's actual vite.config.ts)", () => {
  it("dist/robots.txt is byte-identical to public/robots.txt, plus Content-Signal — never the plugin's fallback", async () => {
    // The real, convincing proof: run the REAL project build (not a mock),
    // exactly as `npm run build`/CI does, and read the REAL output file —
    // the same check that caught the live production bug in the first
    // place (a manual `curl https://iliad.trustfabric.ai/robots.txt`).
    const outDir = mkdtempSync(join(tmpdir(), "axis-web-robots-test-"));
    try {
      await build({
        root: join(import.meta.dirname, "..", "..", ".."),
        configFile: join(import.meta.dirname, "..", "..", "..", "vite.config.ts"),
        logLevel: "silent",
        build: { outDir, emptyOutDir: true },
      });
      const publicRobots = readFileSync(
        join(import.meta.dirname, "..", "..", "..", "public", "robots.txt"),
        "utf8",
      );
      const distRobots = readFileSync(join(outDir, "robots.txt"), "utf8");
      expect(distRobots).toBe(publicRobots);
      expect(distRobots).toContain("Content-Signal: search=yes, ai-train=yes, ai-input=yes");
      // The specific 4-line fallback this plugin used to silently substitute —
      // asserted absent by name, not just "some other content is present".
      expect(distRobots).not.toMatch(/^User-agent: \*\nAllow: \/\n\nSitemap:.*\n$/);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 30_000);
});
