// ─── WCAG contrast math (hand-rolled, no external dep) ──────────
//
// generateDarkModeTokens used to hardcode its contrast_ratios block as literal
// strings ("15.3:1") with a comment admitting they were "approximate...
// re-verify after you restyle the tokens" — i.e. never actually computed from
// the real token values, so they'd silently go stale (or simply be wrong) the
// moment anyone changed a color. This computes the real WCAG 2.x ratio from
// the actual hex/rgba values every time. No color-math package: this repo's
// generators reachable from the offline CLI's module graph must import zero
// runtime npm dependencies (apps/cli/build.mjs enforces it — see
// verify-harness.ts's header for the concrete build failure this avoids), and
// the relative-luminance formula is short enough to not need one anyway.

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseHex(hex: string): Rgb {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function parseRgbFunc(value: string): { rgb: Rgb; alpha: number } | null {
  const m = value.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/i);
  if (!m) return null;
  return {
    rgb: { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) },
    alpha: m[4] !== undefined ? Number(m[4]) : 1,
  };
}

function parseColor(value: string): { rgb: Rgb; alpha: number } {
  if (value.startsWith("#")) return { rgb: parseHex(value), alpha: 1 };
  const parsed = parseRgbFunc(value);
  if (!parsed) throw new Error(`color-contrast: unrecognized color format "${value}"`);
  return parsed;
}

/** Alpha-composites a translucent color over an opaque backing color. */
function compositeOver(fg: { rgb: Rgb; alpha: number }, bg: Rgb): Rgb {
  const a = fg.alpha;
  return {
    r: fg.rgb.r * a + bg.r * (1 - a),
    g: fg.rgb.g * a + bg.g * (1 - a),
    b: fg.rgb.b * a + bg.b * (1 - a),
  };
}

function srgbChannelToLinear(c: number): number {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

function relativeLuminance(rgb: Rgb): number {
  return 0.2126 * srgbChannelToLinear(rgb.r) + 0.7152 * srgbChannelToLinear(rgb.g) + 0.0722 * srgbChannelToLinear(rgb.b);
}

/**
 * WCAG 2.x contrast ratio between two colors — hex (#rgb/#rrggbb) or
 * rgb()/rgba(). A translucent color has no contrast ratio on its own, so its
 * alpha is composited over `compositeBackground` (default white) first, the
 * same as a browser would render it against that backing surface. Returns a
 * value from 1 (no contrast) to 21 (pure black on pure white).
 */
export function wcagContrastRatio(colorA: string, colorB: string, compositeBackground = "#ffffff"): number {
  const backing = parseColor(compositeBackground).rgb;
  const a = parseColor(colorA);
  const b = parseColor(colorB);
  const rgbA = a.alpha < 1 ? compositeOver(a, backing) : a.rgb;
  const rgbB = b.alpha < 1 ? compositeOver(b, backing) : b.rgb;
  const lA = relativeLuminance(rgbA);
  const lB = relativeLuminance(rgbB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

export type WcagLevel = "AAA" | "AA" | "fail";

/** WCAG 2.x level for normal-size text: AA >= 4.5:1, AAA >= 7:1. */
export function wcagLevel(ratio: number): WcagLevel {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  return "fail";
}

export function formatRatio(ratio: number): string {
  return `${ratio.toFixed(1)}:1`;
}
