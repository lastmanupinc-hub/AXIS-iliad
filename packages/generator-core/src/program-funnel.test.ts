import { describe, it, expect } from "vitest";
import { buildNextPrograms, appendProgramFunnel } from "./program-funnel.js";
import type { ContextMap } from "@axis/context-engine";
import type { GeneratorResult, GeneratedFile } from "./types.js";

const ctx = (over: Record<string, unknown> = {}): ContextMap =>
  ({
    project_identity: { name: "acme" },
    detection: { frameworks: [], languages: [] },
    routes: [],
    ...over,
  }) as unknown as ContextMap;

const mdFile = (program: string, path: string): GeneratedFile =>
  ({ path, content: "x", content_type: "text/markdown", program, description: "d" }) as GeneratedFile;

describe("buildNextPrograms", () => {
  it("recommends adjacency of what ran and never re-recommends a run program", () => {
    const next = buildNextPrograms(new Set(["debug"]), ctx());
    expect(next).not.toContain("debug");
    expect(next[0]).toBe("optimization"); // debug → optimization, mcp, agentic-purchasing
    expect(next.length).toBeLessThanOrEqual(3);
  });

  it("is deterministic (same input → identical output)", () => {
    expect(buildNextPrograms(new Set(["mcp"]), ctx())).toEqual(buildNextPrograms(new Set(["mcp"]), ctx()));
  });

  it("falls back to moat defaults when the run programs have no known adjacency", () => {
    expect(buildNextPrograms(new Set(["unknown-prog"]), ctx())).toContain("mcp");
  });

  it("does not recommend anything already run", () => {
    const run = new Set(["debug", "optimization", "mcp"]);
    const next = buildNextPrograms(run, ctx());
    for (const p of next) expect(run.has(p)).toBe(false);
  });

  // ─── Usage-aware ranking (SPEC-03) ─────────────────────────────

  it("no accountUsage arg ⇒ output identical to the pre-personalization baseline", () => {
    expect(buildNextPrograms(new Set(["debug"]), ctx())).toEqual(["optimization", "mcp", "agentic-purchasing"]);
  });

  it("stable-partitions untried programs ahead of already-tried ones", () => {
    // Baseline (no usage): optimization, mcp, agentic-purchasing.
    const next = buildNextPrograms(new Set(["debug"]), ctx(), 3, { optimization: 5, mcp: 0 });
    expect(next.indexOf("mcp")).toBeLessThan(next.indexOf("optimization"));
    expect(next[0]).toBe("mcp"); // untried programs keep their relative order, first up
  });

  it("is deterministic with accountUsage (same inputs twice → identical)", () => {
    const usage = { optimization: 5, mcp: 0 };
    expect(buildNextPrograms(new Set(["debug"]), ctx(), 3, usage)).toEqual(
      buildNextPrograms(new Set(["debug"]), ctx(), 3, usage),
    );
  });
});

describe("appendProgramFunnel", () => {
  const result = (files: GeneratedFile[]): GeneratorResult => ({ files }) as GeneratorResult;

  it("appends a deterministic recommended-next-programs.md and is idempotent", () => {
    const g = result([mdFile("debug", "debug-playbook.md")]);
    appendProgramFunnel(g, ctx());
    const funnel = g.files.find((f) => f.path === "recommended-next-programs.md");
    expect(funnel).toBeTruthy();
    expect(funnel!.content).toContain("Run these next");
    expect(funnel!.content).toContain("optimization"); // debug → optimization
    expect(funnel!.content).toContain("acme");
    const n = g.files.length;
    appendProgramFunnel(g, ctx()); // idempotent — already present
    expect(g.files.length).toBe(n);
  });

  it("is a no-op on an empty package", () => {
    const g = result([]);
    appendProgramFunnel(g, ctx());
    expect(g.files.length).toBe(0);
  });

  it("adds the personalization line only when accountUsage is provided", () => {
    const withUsage = result([mdFile("debug", "debug-playbook.md")]);
    appendProgramFunnel(withUsage, ctx(), { optimization: 5, mcp: 0 });
    const personalized = withUsage.files.find((f) => f.path === "recommended-next-programs.md")!;
    expect(personalized.content).toContain("Ranked for this account");

    const withoutUsage = result([mdFile("debug", "debug-playbook.md")]);
    appendProgramFunnel(withoutUsage, ctx());
    const plain = withoutUsage.files.find((f) => f.path === "recommended-next-programs.md")!;
    expect(plain.content).not.toContain("Ranked for this account");
  });
});
