import { describe, it, expect } from "vitest";
import { analyzeFiles } from "./pipeline.js";
import { ALL_TARGETS, selectTargets } from "./targets.js";
import { MARKDOWN_MARKER, HASH_MARKER, hasMarker } from "./marker.js";
import { fixtureFiles } from "./fixture.test-helper.js";

const FORBIDDEN = ["axis", "share-to-earn", "referral", "$0.50", "self-propagation"];

function emitAll(): Map<string, string> {
  const analysis = analyzeFiles(fixtureFiles(), "fixture-app");
  const out = new Map<string, string>();
  for (const t of ALL_TARGETS) {
    out.set(t.name, t.emit(analysis));
  }
  return out;
}

describe("emitters", () => {
  const outputs = emitAll();

  it("emits all five targets", () => {
    expect([...outputs.keys()].sort()).toEqual(["agents", "claude", "copilot", "cursor", "gemini"]);
  });

  it("every markdown target starts with the generated-by marker line", () => {
    for (const name of ["agents", "claude", "copilot", "gemini"]) {
      const content = outputs.get(name)!;
      expect(content.split("\n")[0], name).toBe(MARKDOWN_MARKER);
      expect(hasMarker(content)).toBe(true);
    }
  });

  it(".cursorrules starts with a # comment marker (not markdown)", () => {
    const content = outputs.get("cursor")!;
    expect(content.split("\n")[0]).toBe(HASH_MARKER);
    expect(content).not.toContain("<!--");
    expect(hasMarker(content)).toBe(true);
  });

  it("AGENTS.md contains repo-derived sections", () => {
    const agents = outputs.get("agents")!;
    expect(agents).toContain("# AGENTS.md — fixture-app");
    expect(agents).toContain("## Overview");
    expect(agents).toContain("## Commands");
    expect(agents).toContain("- Install: `pnpm install`");
    expect(agents).toContain("- Test: `pnpm test`");
    expect(agents).toContain("## Stack");
    expect(agents).toContain("- React ^19.1.0");
    expect(agents).toContain("## Conventions");
    expect(agents).toContain("TypeScript strict mode");
    expect(agents).toContain("## Do NOT");
    expect(agents).toContain("Do not use class components");
    expect(agents).toContain("## Domain Models");
    expect(agents).toContain("`Order`");
    expect(agents).toContain("`Customer`");
    expect(agents).toContain("src/models.ts");
    expect(agents).toContain("## Key Source Files");
    expect(agents).toContain("## Configuration");
    expect(agents).toContain("package.json");
  });

  it("CLAUDE.md and GEMINI.md carry the same canonical content with their own headings", () => {
    const agents = outputs.get("agents")!;
    const claude = outputs.get("claude")!;
    const gemini = outputs.get("gemini")!;
    expect(claude).toContain("# CLAUDE.md — fixture-app");
    expect(gemini).toContain("# GEMINI.md — fixture-app");
    // Same canonical body: everything after the intro line matches AGENTS.md
    const body = (s: string) => s.split("## Overview")[1];
    expect(body(claude)).toBe(body(agents));
    expect(body(gemini)).toBe(body(agents));
  });

  it(".cursorrules is condensed imperative rules", () => {
    const cursor = outputs.get("cursor")!;
    expect(cursor).toContain("Use strict TypeScript; avoid `any` types.");
    expect(cursor).toContain("Write functional React components with hooks; never class components.");
    expect(cursor).toContain("Run tests with vitest before committing.");
    expect(cursor).toContain("Use pnpm for dependency management; do not mix package managers.");
    expect(cursor).toContain("Do not add dependencies without discussion.");
    // condensed: meaningfully shorter than the canonical file
    expect(cursor.length).toBeLessThan(outputs.get("agents")!.length);
  });

  it("copilot-instructions.md is condensed markdown rules", () => {
    const copilot = outputs.get("copilot")!;
    expect(copilot).toContain("# Copilot Instructions — fixture-app");
    expect(copilot).toContain("## Rules");
    expect(copilot).toContain("- Use strict TypeScript; avoid `any` types.");
    expect(copilot.length).toBeLessThan(outputs.get("agents")!.length);
  });

  it("contains no AXIS marketing, pricing, or referral content", () => {
    for (const [name, content] of outputs) {
      const lower = content.toLowerCase();
      for (const banned of FORBIDDEN) {
        expect(lower, `${name} must not contain "${banned}"`).not.toContain(banned);
      }
    }
  });

  it("every output ends with exactly one trailing newline", () => {
    for (const [name, content] of outputs) {
      expect(content.endsWith("\n"), name).toBe(true);
      expect(content.endsWith("\n\n"), name).toBe(false);
    }
  });
});

describe("selectTargets", () => {
  it("defaults to all five targets", () => {
    expect(selectTargets().map((t) => t.name)).toEqual(["agents", "claude", "cursor", "copilot", "gemini"]);
    expect(selectTargets("").map((t) => t.name)).toHaveLength(5);
  });

  it("selects a subset and dedupes", () => {
    const targets = selectTargets("claude,agents,claude");
    expect(targets.map((t) => t.name)).toEqual(["claude", "agents"]);
  });

  it("throws on unknown target names", () => {
    expect(() => selectTargets("agents,bogus")).toThrowError(/Unknown target "bogus"/);
  });
});
