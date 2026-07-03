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

  it("word segments, not substrings: 'kill' inside 'skill' must not mask a side-effect swallow as ACCEPTABLE", () => {
    const f = analyzeFailureSurface([
      // 'kill' ⊂ "Skill" — the old substring match classified this ACCEPTABLE
      // ("best-effort cleanup"), hiding a swallowed reward GRANT.
      sf("src/reward.ts", "grantSkillReward(user).catch(() => {});"),
      // camelCase cleanup verb must STILL be recognized.
      sf("src/task.ts", "await taskKill(pid).catch(() => {});"),
    ]);
    const byFile = Object.fromEntries(f.map((x) => [x.file, x]));
    expect(byFile["src/reward.ts"].klass).toBe("SILENT");
    expect(byFile["src/reward.ts"].klass).not.toBe("ACCEPTABLE");
    expect(byFile["src/task.ts"].klass).toBe("ACCEPTABLE");
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

  it("DEVELOP recall: catches sentinel-return swallows and async/function catch handlers (was false-negative)", () => {
    const f = analyzeFailureSurface([
      sf("src/a.ts", "const d = await fetch(u).catch(() => null);"),
      sf("src/b.ts", "load().catch(() => []);"),
      sf("src/c.ts", "sendEmail().catch(async () => {});"),      // async handler + side-effect → SILENT
      sf("src/d.ts", "doThing().catch(function () {});"),
      sf("src/e.ts", "get().catch(() => false);"),
    ]);
    const cat = Object.fromEntries(f.map((x) => [x.file, x]));
    for (const p of ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts", "src/e.ts"]) {
      expect(cat[p], p).toBeDefined();
      expect(cat[p].category).toBe("swallowed-async-error");
    }
    expect(cat["src/c.ts"].klass).toBe("SILENT"); // sendEmail = side-effect
    // a handler that actually handles the error is NOT flagged
    expect(analyzeFailureSurface([sf("src/ok.ts", "x().catch((e) => log(e));")])).toHaveLength(0);
  });

  it("DEVELOP recall: catches a TYPED empty catch and a two-line empty catch (was false-negative)", () => {
    const f = analyzeFailureSurface([
      sf("src/typed.ts", "try { doThing(); } catch (e: unknown) {}"),
      sf("src/split.ts", "try {\n  parse();\n} catch (e) {\n}"),
    ]);
    const cat = Object.fromEntries(f.map((x) => [x.file, x.category]));
    expect(cat["src/typed.ts"]).toBe("empty-catch");
    expect(cat["src/split.ts"]).toBe("empty-catch");
  });

  it("DEVELOP recall: catches a Go SOLE '_ = f()' discard and a two-line empty error block (was false-negative)", () => {
    const f = analyzeFailureSurface([
      sf("internal/a.go", "_ = os.Remove(tmp)"),
      sf("internal/b.go", "if err != nil {\n}"),
    ]);
    const cat = Object.fromEntries(f.map((x) => [x.file, x.category]));
    expect(cat["internal/a.go"]).toBe("discarded-return");
    expect(cat["internal/b.go"]).toBe("empty-error-check");
    // a comparison `_ == x` is not a discard
    expect(analyzeFailureSurface([sf("internal/c.go", "if _ == x {}")]).some((x) => x.category === "discarded-return")).toBe(false);
  });

  it("DEVELOP precision: commented-out code is not flagged (was false-positive)", () => {
    const f = analyzeFailureSurface([
      sf("src/x.ts", "// legacy: sendEmail().catch(() => {})\nconst y = 1;"),
      sf("src/y.ts", " * @example doThing().catch(() => {})"),
    ]);
    expect(f).toHaveLength(0);
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
