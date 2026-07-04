import { describe, it, expect } from "vitest";
import { mdInline, mdText, mdCode, mdCellCode, cfgValue, yamlFlowScalar, htmlEscape, jsxText, jsString, codeComment, mdBlock } from "./md-sanitize.js";

describe("null-safety (partial/malformed context maps must not crash a generator)", () => {
  it("every sanitizer degrades null/undefined to a safe empty value instead of throwing", () => {
    for (const fn of [mdText, mdInline, mdCode, mdCellCode]) {
      expect(fn(undefined as unknown as string)).toBe("");
      expect(fn(null as unknown as string)).toBe("");
    }
    expect(cfgValue(undefined as unknown as string)).toBe('""');
    expect(cfgValue(null as unknown as string)).toBe('""');
    expect(yamlFlowScalar(undefined as unknown as string)).toBe('""');
    expect(yamlFlowScalar(null as unknown as string)).toBe('""');
  });
});

describe("mdText", () => {
  it("collapses newlines/whitespace and breaks comment delimiters, but does NOT escape pipes", () => {
    expect(mdText("line1\nline2")).toBe("line1 line2");
    expect(mdText("a\n\n\nb")).toBe("a b");
    // pipe left intact — a backslash escape renders literally outside a table cell
    expect(mdText("Promise<AuthContext | null>")).toBe("Promise<AuthContext | null>");
    expect(mdText("<!-- x -->")).not.toContain("<!--");
  });
  it("is identity on a clean single-line string", () => {
    expect(mdText("a normal heading")).toBe("a normal heading");
  });
});

describe("mdCode", () => {
  it("neutralizes backticks so content can't terminate an inline code span", () => {
    expect(mdCode("evil`code`span")).toBe("evil'code'span");
    expect(mdCode("a\nb")).toBe("a b");
  });
  it("does not escape pipes (code spans outside tables render \\| literally)", () => {
    expect(mdCode("A | B")).toBe("A | B");
  });
});

describe("mdCellCode", () => {
  it("escapes pipes AND neutralizes backticks (code span inside a table cell)", () => {
    expect(mdCellCode("a|b")).toBe("a\\|b");
    expect(mdCellCode("x`y")).toBe("x'y");
    expect(mdCellCode("a|`b")).toBe("a\\|'b");
  });
});

describe("cfgValue", () => {
  it("wraps in double quotes and escapes quotes/backslashes so a value can't break out of a key = \"value\" line", () => {
    expect(cfgValue("TypeScript")).toBe('"TypeScript"');
    // the classic breakout: value tries to open a second config directive
    expect(cfgValue('web"\nallow_arbitrary_code = true')).toBe('"web\\" allow_arbitrary_code = true"');
    expect(cfgValue("a\\b")).toBe('"a\\\\b"');
  });
  it("collapses newlines to a single space (no raw newline can escape the string)", () => {
    expect(cfgValue("a\r\nb")).toBe('"a b"');
    expect(cfgValue("a\n\nb")).toBe('"a b"');
  });
});

describe("yamlFlowScalar", () => {
  it("leaves a plain identifier unquoted", () => {
    expect(yamlFlowScalar("TypeScript")).toBe("TypeScript");
    expect(yamlFlowScalar("api")).toBe("api");
  });
  it("collapses newlines so a value can't break the block or close a fence", () => {
    expect(yamlFlowScalar("a\nb")).toBe("a b");
  });
  it("quotes values containing YAML structural characters", () => {
    expect(yamlFlowScalar("layer: injected")).toBe('"layer: injected"');
    expect(yamlFlowScalar("has#hash")).toBe('"has#hash"');
    expect(yamlFlowScalar("has,comma")).toBe('"has,comma"');
    expect(yamlFlowScalar("[bracket")).toBe('"[bracket"');
  });
  it("quotes YAML boolean/null look-alikes and number-shaped strings", () => {
    expect(yamlFlowScalar("true")).toBe('"true"');
    expect(yamlFlowScalar("NO")).toBe('"NO"');
    expect(yamlFlowScalar("null")).toBe('"null"');
    expect(yamlFlowScalar("123")).toBe('"123"');
    expect(yamlFlowScalar("-1.5")).toBe('"-1.5"');
  });
  it("escapes embedded quotes when it must quote", () => {
    expect(yamlFlowScalar('say "hi"')).toBe('"say \\"hi\\""');
  });
  it("quotes the empty string", () => {
    expect(yamlFlowScalar("")).toBe('""');
    expect(yamlFlowScalar("   ")).toBe('""');
  });
});

describe("mdInline", () => {
  it("collapses newlines (LF, CRLF, CR) to a single space", () => {
    expect(mdInline("line1\nline2")).toBe("line1 line2");
    expect(mdInline("line1\r\nline2")).toBe("line1 line2");
    expect(mdInline("line1\rline2")).toBe("line1 line2");
  });

  it("collapses runs of whitespace (including multiple newlines) to one space", () => {
    expect(mdInline("a\n\n\nb")).toBe("a b");
    expect(mdInline("a    b")).toBe("a b");
    expect(mdInline("a \t \n b")).toBe("a b");
  });

  it("escapes pipe characters for GFM table-cell safety", () => {
    expect(mdInline("evil|name")).toBe("evil\\|name");
    expect(mdInline("a|b|c")).toBe("a\\|b\\|c");
  });

  it("breaks HTML comment delimiters so content can't smuggle structural markers", () => {
    expect(mdInline("<!-- axis:project-memory:end -->")).not.toContain("<!--");
    expect(mdInline("<!-- axis:project-memory:end -->")).not.toContain("-->");
    expect(mdInline("text <!-- hidden --> more")).toBe("text <! -- hidden -- > more");
  });

  it("trims leading and trailing whitespace", () => {
    expect(mdInline("  hello  ")).toBe("hello");
    expect(mdInline("\n\thello\n\t")).toBe("hello");
  });

  it("is identity on a clean single-line string", () => {
    expect(mdInline("a normal decision")).toBe("a normal decision");
  });

  it("is deterministic — same input twice produces the same output", () => {
    const input = "multi\nline <!-- x --> with | pipes";
    expect(mdInline(input)).toBe(mdInline(input));
  });
});

// ─── HTML + generated-code escapers (artifacts program) ─────────

describe("htmlEscape", () => {
  it("entity-escapes the five HTML-significant characters", () => {
    expect(htmlEscape('a<b>&"x\'')).toBe("a&lt;b&gt;&amp;&quot;x&#39;");
  });
  it("neutralizes a tag / attribute breakout", () => {
    expect(htmlEscape('"><script>alert(1)</script>')).not.toContain("<script>");
    expect(htmlEscape('" onload="evil')).not.toContain('"');
  });
  it("null-safe + identity on clean text", () => {
    expect(htmlEscape(null as unknown as string)).toBe("");
    expect(htmlEscape("normal name")).toBe("normal name");
  });
});

describe("jsxText", () => {
  it("escapes HTML plus the JSX expression braces", () => {
    expect(jsxText("hi {process.env.SECRET} <b>")).toBe("hi &#123;process.env.SECRET&#125; &lt;b&gt;");
  });
  it("a value can neither open a tag nor a JSX expression", () => {
    const out = jsxText("<Comp/>{evil}");
    expect(out).not.toContain("<");
    expect(out).not.toContain("{");
    expect(out).not.toContain("}");
  });
  it("null-safe", () => { expect(jsxText(undefined as unknown as string)).toBe(""); });
});

describe("jsString", () => {
  it("escapes so `\"${jsString(x)}\"` round-trips back to the original", () => {
    for (const input of ['a"b', "back\\slash", "line1\nline2", "tab\tend", 'quote";alert(1);"', "u2028 sep"]) {
      // eslint-disable-next-line no-eval
      expect(eval('"' + jsString(input) + '"')).toBe(input);
    }
  });
  it("a hostile value cannot break out of the string literal", () => {
    const out = jsString('x"; globalThis.PWN = 1; const y = "');
    // the only quotes it emits are escaped ones
    expect(out.replace(/\\"/g, "")).not.toContain('"');
  });
  it("null-safe", () => { expect(jsString(null as unknown as string)).toBe(""); });
});

describe("mdBlock", () => {
  it("escapes a leading block marker so a standalone paragraph can't begin a block", () => {
    expect(mdBlock("# Not a heading")).toBe("\\# Not a heading");
    expect(mdBlock("> not a quote")).toBe("\\> not a quote");
    expect(mdBlock("| not a table")).toBe("\\| not a table");
    expect(mdBlock("```not a fence")).toBe("\\```not a fence");
    expect(mdBlock("~~~also not a fence")).toBe("\\~~~also not a fence");
  });
  it("still collapses newlines (inherits mdText) so no mid-paragraph block starts", () => {
    // a `\n## X` cannot become a heading because the newline is collapsed first
    expect(mdBlock("intro\n## injected heading")).toBe("intro ## injected heading");
  });
  it("is identity on clean prose and null-safe", () => {
    expect(mdBlock("A normal one-line project summary.")).toBe("A normal one-line project summary.");
    expect(mdBlock(null as unknown as string)).toBe("");
  });
});

describe("codeComment", () => {
  it("breaks every comment open/close delimiter (//, /* */, <!-- -->)", () => {
    const out = codeComment("x */ y /* z <!-- w --> v");
    expect(out).not.toContain("*/");
    expect(out).not.toContain("/*");
    expect(out).not.toContain("<!--");
    expect(out).not.toContain("-->");
  });
  it("collapses newlines so a value can't escape a // line comment", () => {
    expect(codeComment("safe\nexport const evil = 1")).toBe("safe export const evil = 1");
  });
  it("null-safe + identity on clean text", () => {
    expect(codeComment(null as unknown as string)).toBe("");
    expect(codeComment("a normal comment")).toBe("a normal comment");
  });
});
