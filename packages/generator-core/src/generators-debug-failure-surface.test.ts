import { describe, it, expect } from "vitest";
import { analyzeFailureSurface, renderFailureSurface } from "./generators-debug.js";
import type { SourceFile } from "./types.js";

const sf = (path: string, content: string): SourceFile => ({ path, content, size: content.length });

describe("analyzeFailureSurface — deterministic static failure-mode scan", () => {
  it("classifies a swallowed side-effect as SILENT and best-effort cleanup as ACCEPTABLE", () => {
    const f = analyzeFailureSurface([
      sf("src/mail.ts", "sendEmail(to).catch(() => {});"),
      sf("src/sandbox.ts", "container.kill().catch(() => {});"),
    ]);
    const byFile = Object.fromEntries(f.map((x) => [x.file, x]));
    expect(byFile["src/mail.ts"].klass).toBe("SILENT");
    expect(byFile["src/mail.ts"].category).toBe("swallowed-async-error");
    expect(byFile["src/sandbox.ts"].klass).toBe("ACCEPTABLE");
  });

  it("flags empty catch as REVIEW and unstructured console.* as OBSERVABILITY", () => {
    const f = analyzeFailureSurface([
      sf("src/parse.ts", "try { doThing(); } catch {}"),
      sf("src/pay.ts", "console.error('charge failed');"),
    ]);
    const cls = Object.fromEntries(f.map((x) => [x.file, x.klass]));
    expect(cls["src/parse.ts"]).toBe("REVIEW");
    expect(cls["src/pay.ts"]).toBe("OBSERVABILITY");
  });

  it("flags type holes and skips test files + console in cli/scripts", () => {
    const f = analyzeFailureSurface([
      sf("src/x.ts", "const y = z as any;"),
      sf("src/x.test.ts", "sendEmail().catch(() => {});"), // test file → skipped entirely
      sf("apps/cli/src/main.ts", "console.log('ok');"), // cli console → not flagged
    ]);
    expect(f.some((x) => x.category === "type-hole" && x.klass === "TYPE_HOLE")).toBe(true);
    expect(f.some((x) => x.file.endsWith(".test.ts"))).toBe(false);
    expect(f.some((x) => x.file.includes("/cli/"))).toBe(false);
  });

  it("is deterministic (same input → identical output)", () => {
    const files = [sf("src/b.ts", "sendEmail().catch(() => {});"), sf("src/a.ts", "x.catch(() => {});")];
    expect(analyzeFailureSurface(files)).toEqual(analyzeFailureSurface(files));
  });

  it("renders a tally + findings table, worst class first", () => {
    const md = renderFailureSurface(
      analyzeFailureSurface([sf("src/a.ts", "x.catch(() => {});"), sf("src/b.ts", "sendEmail().catch(() => {});")]),
    ).join("\n");
    expect(md).toContain("## Failure Surface (deterministic)");
    expect(md).toContain("| Class | Count |");
    expect(md.indexOf("SILENT")).toBeLessThan(md.indexOf("REVIEW")); // worst-first ordering
  });

  it("renders an explicit empty-state when nothing is found", () => {
    expect(renderFailureSurface([]).join("\n")).toContain("No swallowed errors");
  });

  it("detects Go idiomatic silent-failure patterns and skips _test.go", () => {
    const f = analyzeFailureSurface([
      sf("cmd/api/main.go", 'fmt.Println("starting")'),
      sf("internal/x.go", 'panic("boom")'),
      sf("internal/y.go", "if err != nil {}"),
      sf("internal/z.go", "val, _ := doThing()"),
      sf("internal/z_test.go", 'panic("x")'),
    ]);
    const byFile = Object.fromEntries(f.map((x) => [x.file, x]));
    expect(byFile["cmd/api/main.go"].klass).toBe("OBSERVABILITY");
    expect(byFile["internal/x.go"].category).toBe("panic");
    expect(byFile["internal/y.go"].klass).toBe("SILENT");
    expect(byFile["internal/z.go"].category).toBe("discarded-return");
    expect(f.some((x) => x.file.endsWith("_test.go"))).toBe(false);
  });
});
