import { describe, it, expect } from "vitest";
import { analyzeUiSurface, renderUiFindings } from "./generators-frontend.js";
import type { SourceFile } from "./types.js";

const sf = (path: string, content: string): SourceFile => ({ path, content, size: content.length });

// ─── DEVELOP (Program 4 = Frontend): real deterministic UI static scan ──
// Turns ui-audit's static "⚠️ Verify" checklist into actual findings on the
// uploaded components — a11y gaps, XSS risk, and type holes.

describe("analyzeUiSurface — deterministic UI-issue scan", () => {
  it("flags <img> without alt, and does NOT flag one with alt", () => {
    const f = analyzeUiSurface([
      sf("src/A.tsx", '<img src="/logo.png" />'),
      sf("src/B.tsx", '<img src="/ok.png" alt="ok" />'),
    ]);
    const byFile = Object.fromEntries(f.map((x) => [x.file, x]));
    expect(byFile["src/A.tsx"].category).toBe("missing-alt");
    expect(byFile["src/A.tsx"].klass).toBe("A11Y");
    expect(byFile["src/B.tsx"]).toBeUndefined();
  });

  it("flags dangerouslySetInnerHTML as XSS", () => {
    const f = analyzeUiSurface([sf("src/C.tsx", "<div dangerouslySetInnerHTML={{ __html: raw }} />")]);
    expect(f[0].klass).toBe("XSS");
    expect(f[0].category).toBe("dangerous-html");
  });

  it("flags `any` types but not identifiers merely starting with 'any'", () => {
    const flagged = analyzeUiSurface([
      sf("src/D.tsx", "const x = props as any;"),
      sf("src/E.tsx", "function C(props: any) { return null; }"),
    ]);
    expect(flagged.every((x) => x.klass === "TYPE")).toBe(true);
    expect(flagged).toHaveLength(2);
    // `anything` / `anyOther` are not `any`
    expect(analyzeUiSurface([sf("src/F.tsx", "const anything: string = anyOther;")])).toHaveLength(0);
  });

  it("flags onClick on a non-interactive element, not on a <button>", () => {
    const f = analyzeUiSurface([
      sf("src/G.tsx", "<div onClick={close}>x</div>"),
      sf("src/H.tsx", "<button onClick={close}>x</button>"),
    ]);
    const byFile = Object.fromEntries(f.map((x) => [x.file, x]));
    expect(byFile["src/G.tsx"].category).toBe("click-nonbutton");
    expect(byFile["src/H.tsx"]).toBeUndefined();
  });

  it("skips test/spec files, generated dirs, and comment-only lines", () => {
    const f = analyzeUiSurface([
      sf("src/x.test.tsx", '<img src="a" />'),          // test → skipped
      sf("dist/y.tsx", '<img src="a" />'),               // generated → skipped
      sf("src/z.tsx", '// <img src="a" /> legacy'),      // comment → skipped
      sf("src/keep.tsx", '<img src="a" />'),             // real → flagged
    ]);
    expect(f.map((x) => x.file)).toEqual(["src/keep.tsx"]);
  });

  it("is deterministic (same input → identical output)", () => {
    const files = [sf("src/b.tsx", '<img src="a" />'), sf("src/a.tsx", "x as any;")];
    expect(analyzeUiSurface(files)).toEqual(analyzeUiSurface(files));
  });
});

describe("renderUiFindings", () => {
  it("renders a tally + table, worst class (XSS) first", () => {
    const md = renderUiFindings(
      analyzeUiSurface([sf("src/a.tsx", "x as any;"), sf("src/b.tsx", "<div dangerouslySetInnerHTML={{__html:h}} />")]),
    ).join("\n");
    expect(md).toContain("## Detected UI Issues (deterministic)");
    expect(md).toContain("| Class | Count |");
    expect(md.indexOf("XSS")).toBeLessThan(md.indexOf("TYPE"));
  });

  it("renders an explicit clean empty-state", () => {
    expect(renderUiFindings([]).join("\n")).toContain("No missing alt text");
  });
});
