import { describe, it, expect } from "vitest";
import { mdInline } from "./md-sanitize.js";

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
