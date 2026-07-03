import { describe, it, expect } from "vitest";
import type { SourceFile } from "./types.js";
import { analyzeContentViolations, renderContentViolations } from "./generators-brand.js";

const sf = (path: string, content: string): SourceFile => ({ path, content, size: content.length } as SourceFile);

describe("analyzeContentViolations — deterministic doc scan", () => {
  const doc = sf("docs/guide.md", [
    "# Guide",                                  // 1
    "This is simply better.",                   // 2 DISMISSIVE simply
    "Just run the installer.",                  // 3 DISMISSIVE just run
    "A revolutionary, world-class tool.",       // 4 MARKETING revolutionary (first match)
    "TODO: clean this up",                      // 5 PLACEHOLDER TODO
    "a todo item stays lowercase",              // 6 not flagged (case-sensitive marker)
    "```",                                      // 7 open fence
    "TODO: inside a code example",              // 8 SKIPPED (in fence)
    "```",                                      // 9 close fence
    "All done.",                                // 10 clean
  ].join("\n"));

  it("flags placeholder/marketing/dismissive terms with correct lines + classes", () => {
    const found = analyzeContentViolations([doc]);
    const keyed = found.map((f) => `${f.line}:${f.klass}:${f.term}`);
    expect(keyed).toContain("2:DISMISSIVE:simply");
    expect(keyed).toContain("3:DISMISSIVE:Just run");
    expect(keyed).toContain("4:MARKETING:revolutionary");
    expect(keyed).toContain("5:PLACEHOLDER:TODO");
  });
  it("skips fenced code blocks (a TODO in a code example is legitimate)", () => {
    const found = analyzeContentViolations([doc]);
    expect(found.some((f) => f.line === 8)).toBe(false);
  });
  it("does NOT flag a lowercase 'todo' in prose (markers are case-sensitive)", () => {
    const found = analyzeContentViolations([doc]);
    expect(found.some((f) => f.line === 6)).toBe(false);
  });
  it("only scans docs — a TODO in source code is not a content violation", () => {
    const found = analyzeContentViolations([sf("src/x.ts", "// TODO: refactor\nconst simple = 1;")]);
    expect(found).toHaveLength(0);
  });
  it("scans README/CONTRIBUTING/CHANGELOG by basename too", () => {
    expect(analyzeContentViolations([sf("README", "This is effortless.")]).length).toBe(1);
    expect(analyzeContentViolations([sf("CONTRIBUTING.md", "A seamless workflow.")]).length).toBe(1);
  });
  it("is deterministic", () => {
    expect(analyzeContentViolations([doc])).toEqual(analyzeContentViolations([doc]));
  });

  it("HARDEN-2: does not scan source/data files merely NAMED like a doc", () => {
    // readme.ts / changelog.ts / README.json are not docs — the old name branch
    // matched any extension and would have flagged a `// TODO` in source.
    expect(analyzeContentViolations([sf("src/changelog.ts", "// TODO: refactor")])).toHaveLength(0);
    expect(analyzeContentViolations([sf("examples/README.json", '{"note":"TODO"}')])).toHaveLength(0);
    expect(analyzeContentViolations([sf("readme.tsx", "const simple = 1;")])).toHaveLength(0);
    // real docs still scan (extensionless README + doc extensions)
    expect(analyzeContentViolations([sf("README", "TODO: real")])).toHaveLength(1);
    expect(analyzeContentViolations([sf("CHANGELOG.md", "TODO: real")])).toHaveLength(1);
    expect(analyzeContentViolations([sf("docs/CONTRIBUTING.rst", "TODO: real")])).toHaveLength(1);
  });

  it("HARDEN-2: nested/mismatched fences don't leak a code example into the scan", () => {
    const nested = sf("docs/x.md", [
      "````",           // 1 outer 4-backtick fence opens
      "```js",          // 2 inner 3-backtick (shorter) must NOT close the outer
      "just run this",  // 3 still inside the outer fence → NOT flagged
      "```",            // 4 inner close (len 3 < 4) must NOT close the outer
      "````",           // 5 outer close (len 4) → closes
      "simply better",  // 6 now outside → FLAGGED
    ].join("\n"));
    const found = analyzeContentViolations([nested]);
    expect(found.some((f) => /just/i.test(f.term))).toBe(false);
    expect(found.some((f) => f.line === 6 && f.term === "simply")).toBe(true);
  });
});

describe("renderContentViolations", () => {
  it("renders a clean empty state when nothing is flagged", () => {
    expect(renderContentViolations([]).join("\n")).toContain("No placeholders, marketing fluff, or dismissive language");
  });
  it("renders a tally + table and caps at 40 with a remainder", () => {
    const many = Array.from({ length: 45 }, (_, i) => sf(`docs/d${i}.md`, "revolutionary"));
    const md = renderContentViolations(analyzeContentViolations(many)).join("\n");
    expect(md).toContain("## Detected Content Violations (deterministic)");
    expect(md).toContain("| MARKETING | 45 |");
    expect(md).toContain("+5 more");
  });
});
