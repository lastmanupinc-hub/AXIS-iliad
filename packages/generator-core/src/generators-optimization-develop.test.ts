import { describe, it, expect } from "vitest";
import { analyzeContextBloat, renderContextBloat } from "./generators-optimization.js";
import type { SourceFile } from "./types.js";

const sf = (path: string, lines: number): SourceFile => ({ path, content: Array.from({ length: lines }, () => "x").join("\n"), size: lines });

describe("analyzeContextBloat — quantified context-bloat scan", () => {
  it("flags build output, lockfiles, minified, snapshots, vendored, and oversized files", () => {
    const scan = analyzeContextBloat([
      sf("dist/bundle.js", 100),
      sf("pnpm-lock.yaml", 500),
      sf("public/app.min.js", 50),
      sf("src/__snapshots__/x.snap", 40),
      sf("vendor/lib.ts", 200),
      sf("apps/api/src/handlers.ts", 2000), // > 6000 tokens (2000×4.5=9000)
      sf("src/small.ts", 20),               // clean → NOT flagged
    ]);
    const byPath = Object.fromEntries(scan.findings.map((f) => [f.path, f.reason]));
    expect(byPath["dist/bundle.js"]).toBe("generated/build output");
    expect(byPath["pnpm-lock.yaml"]).toBe("dependency lockfile");
    expect(byPath["public/app.min.js"]).toBe("minified bundle");
    expect(byPath["src/__snapshots__/x.snap"]).toBe("test snapshot/fixture");
    expect(byPath["vendor/lib.ts"]).toBe("vendored dependency");
    expect(byPath["apps/api/src/handlers.ts"]).toBe("oversized file (>6K tokens)");
    expect(byPath["src/small.ts"]).toBeUndefined();
  });

  it("computes total + bloat token counts (4.5 tok/line) and is sorted by tokens desc", () => {
    const scan = analyzeContextBloat([sf("dist/a.js", 100), sf("dist/b.js", 200), sf("src/clean.ts", 10)]);
    expect(scan.totalTokens).toBe(Math.round(310 * 4.5));
    expect(scan.bloatTokens).toBe(Math.round(300 * 4.5)); // the two dist files
    expect(scan.findings[0].path).toBe("dist/b.js"); // larger first
  });

  it("HARDEN-2: bloatTokens (the 'savings') counts only SAFE-to-exclude files, NOT oversized real source", () => {
    const scan = analyzeContextBloat([
      sf("dist/vendor.js", 100),                 // excludable
      sf("apps/api/src/handlers.ts", 2000),      // oversized real source — NOT counted as savings
    ]);
    expect(scan.bloatTokens).toBe(Math.round(100 * 4.5)); // only the dist file
    // both are still findings, but only one counts toward "savings"
    expect(scan.findings).toHaveLength(2);
  });

  it("is deterministic", () => {
    const files = [sf("dist/b.js", 100), sf("dist/a.js", 100)];
    expect(analyzeContextBloat(files)).toEqual(analyzeContextBloat(files));
  });
});

describe("renderContextBloat", () => {
  it("renders the savings headline + table, capped at 30", () => {
    const files = Array.from({ length: 40 }, (_, i) => sf(`dist/f${i}.js`, 100));
    const md = renderContextBloat(analyzeContextBloat(files)).join("\n");
    expect(md).toContain("## Context Bloat (deterministic)");
    expect(md).toMatch(/Excluding these 40 low-signal file\(s\) removes ~[\d,]+ tokens \(\d+% of/);
    expect(md).toContain("*… 10 more*");
  });

  it("HARDEN-2: oversized source is rendered in a SEPARATE 'review' section, not the savings headline", () => {
    const md = renderContextBloat(analyzeContextBloat([sf("apps/api/src/handlers.ts", 2000), sf("dist/x.js", 50)])).join("\n");
    expect(md).toContain("### Oversized source files (review — don't blindly exclude)");
    expect(md).toContain("handlers.ts");
    // handlers.ts must NOT appear in the "safe to drop" savings figure
    expect(md).not.toMatch(/Excluding these 2 /);
  });
  it("renders a clean empty-state when nothing is bloated", () => {
    expect(renderContextBloat(analyzeContextBloat([sf("src/a.ts", 10)])).join("\n")).toContain("context is already lean");
  });
});
