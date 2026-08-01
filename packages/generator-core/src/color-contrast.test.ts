import { describe, it, expect } from "vitest";
import { wcagContrastRatio, wcagLevel, formatRatio } from "./color-contrast.js";

describe("wcagContrastRatio", () => {
  it("computes the textbook black-on-white ratio (21:1)", () => {
    expect(wcagContrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
  });

  it("computes 1:1 for two identical colors", () => {
    expect(wcagContrastRatio("#22d3ee", "#22d3ee")).toBeCloseTo(1, 5);
  });

  it("is symmetric — order of the two colors doesn't matter", () => {
    const a = wcagContrastRatio("#d6e2ee", "#070b11");
    const b = wcagContrastRatio("#070b11", "#d6e2ee");
    expect(a).toBeCloseTo(b, 10);
  });

  it("expands 3-digit hex shorthand the same as its 6-digit equivalent", () => {
    expect(wcagContrastRatio("#000", "#fff")).toBeCloseTo(wcagContrastRatio("#000000", "#ffffff"), 10);
  });

  it("weights channels per the WCAG formula (0.2126 R / 0.7152 G / 0.0722 B), not a naive average", () => {
    // Pure red and pure green each max exactly one channel — under a naive
    // (r+g+b)/3 average they'd have IDENTICAL luminance (ratio 1:1, wrong);
    // the real WCAG weights make green contribute far more luminance than red,
    // giving a real, non-trivial ratio (~2.9:1).
    const ratio = wcagContrastRatio("#ff0000", "#00ff00");
    expect(ratio).toBeGreaterThan(2.5);
    expect(ratio).toBeLessThan(3.5);
  });

  it("matches a known real-world pair within a reasonable tolerance (#d6e2ee on #070b11, this repo's actual dark-mode foreground/background)", () => {
    // Independently verified against the standard WCAG relative-luminance formula.
    const ratio = wcagContrastRatio("#d6e2ee", "#070b11");
    expect(ratio).toBeGreaterThan(14);
    expect(ratio).toBeLessThan(16);
  });

  it("composites a translucent rgba() color over the given backing color before computing contrast", () => {
    // A fully-opaque red on white vs a 50%-alpha red over white backing should differ —
    // proving alpha is actually applied, not ignored.
    const opaque = wcagContrastRatio("rgba(255, 0, 0, 1)", "#ffffff");
    const translucent = wcagContrastRatio("rgba(255, 0, 0, 0.1)", "#ffffff", "#ffffff");
    expect(translucent).toBeLessThan(opaque); // 10%-alpha red over white looks almost white — low contrast
  });

  it("throws a clear error on an unrecognized color format instead of silently returning a wrong ratio", () => {
    expect(() => wcagContrastRatio("not-a-color", "#ffffff")).toThrow(/unrecognized color format/);
  });
});

describe("wcagLevel", () => {
  it("classifies AAA at >= 7:1", () => {
    expect(wcagLevel(7)).toBe("AAA");
    expect(wcagLevel(15.3)).toBe("AAA");
  });
  it("classifies AA at >= 4.5:1 and < 7:1", () => {
    expect(wcagLevel(4.5)).toBe("AA");
    expect(wcagLevel(6.9)).toBe("AA");
  });
  it("classifies fail below 4.5:1", () => {
    expect(wcagLevel(4.49)).toBe("fail");
    expect(wcagLevel(1)).toBe("fail");
  });
});

describe("formatRatio", () => {
  it("formats to one decimal place with a trailing :1", () => {
    expect(formatRatio(15.3333)).toBe("15.3:1");
    expect(formatRatio(1)).toBe("1.0:1");
  });
});
