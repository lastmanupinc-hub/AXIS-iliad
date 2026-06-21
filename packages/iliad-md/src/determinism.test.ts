import { describe, it, expect } from "vitest";
import { analyzeFiles } from "./pipeline.js";
import { ALL_TARGETS } from "./targets.js";
import { fixtureFiles } from "./fixture.test-helper.js";

describe("determinism", () => {
  it("two independent runs over the same files produce byte-identical output", () => {
    const first = analyzeFiles(fixtureFiles(), "fixture-app");
    const second = analyzeFiles(fixtureFiles(), "fixture-app");
    for (const target of ALL_TARGETS) {
      const a = target.emit(first);
      const b = target.emit(second);
      expect(Buffer.from(a, "utf-8").equals(Buffer.from(b, "utf-8")), target.name).toBe(true);
    }
  });

  it("input file order does not affect output bytes", () => {
    const ordered = analyzeFiles(fixtureFiles(), "fixture-app");
    const reversed = analyzeFiles([...fixtureFiles()].reverse(), "fixture-app");
    for (const target of ALL_TARGETS) {
      expect(target.emit(reversed), target.name).toBe(target.emit(ordered));
    }
  });

  it("output contains no wall-clock timestamps", () => {
    const analysis = analyzeFiles(fixtureFiles(), "fixture-app");
    const year = String(new Date().getFullYear());
    for (const target of ALL_TARGETS) {
      const content = target.emit(analysis);
      expect(content, target.name).not.toContain(year);
      expect(content, target.name).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    }
  });
});
