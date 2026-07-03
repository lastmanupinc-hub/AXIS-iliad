import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { GeneratedFile, SourceFile } from "./types.js";
import { hasFw, getFw } from "./fw-helpers.js";
import { findFiles, detectStyleFiles, renderExcerpts, fileTree, extractExports } from "./file-excerpt-utils.js";
// Injection defense. theme.css interpolates into CSS block comments (cssComment
// breaks `*/`); theme-guidelines.md uses md-sanitize; the 3 JSON files are
// JSON.stringify(obj) (contained by construction).
import { mdText, mdInline, mdCode, cssComment } from "./md-sanitize.js";
import { displayRoutes } from "./route-utils.js";
import { detectStyling, componentFileEntries } from "./theme-detect.js";

// ─── .ai/design-tokens.json ────────────────────────────────────

export function generateDesignTokens(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const frameworks = ctx.detection.frameworks;

  // Styling approach — shared detector so this JSON, the guidelines doc, and the
  // dark-mode tokens can never disagree about the same repo.
  const { hasTailwind, hasCssModules, hasStyledComponents, hasSass, approach: stylingApproach } = detectStyling(ctx);

  // Base color palette (adaptive to detected stack)
  // Averionics palette — HUD cyan primary, cool cockpit-slate neutrals, instrument amber.
  const colors: Record<string, Record<string, string>> = {
    primary: {
      "50": "#ecfeff", "100": "#cffafe", "200": "#a5f3fc", "300": "#67e8f9",
      "400": "#22d3ee", "500": "#06b6d4", "600": "#0891b2", "700": "#0e7490",
      "800": "#155e75", "900": "#164e63", "950": "#083344",
    },
    neutral: {
      "50": "#f4f7fa", "100": "#e8edf3", "200": "#cfd9e4", "300": "#aebccd",
      "400": "#7e8ea3", "500": "#5b6b81", "600": "#44566b", "700": "#324153",
      "800": "#1b2733", "900": "#0d141d", "950": "#070b11",
    },
    accent: { "500": "#0a8aa6", "600": "#0e7490" },
    amber: { "500": "#b06a00", "600": "#8a5300" },
    success: { "500": "#0f9d58", "600": "#0c7a45" },
    warning: { "500": "#b06a00", "600": "#8a5300" },
    error: { "500": "#d23b3b", "600": "#b02e2e" },
  };

  const spacing = {
    "0": "0px", "1": "0.25rem", "2": "0.5rem", "3": "0.75rem",
    "4": "1rem", "5": "1.25rem", "6": "1.5rem", "8": "2rem",
    "10": "2.5rem", "12": "3rem", "16": "4rem", "20": "5rem",
    "24": "6rem", "32": "8rem", "40": "10rem", "48": "12rem",
  };

  const typography = {
    font_families: {
      sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      serif: "Georgia, Cambria, 'Times New Roman', Times, serif",
      mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
    },
    font_sizes: {
      xs: "0.75rem", sm: "0.875rem", base: "1rem", lg: "1.125rem",
      xl: "1.25rem", "2xl": "1.5rem", "3xl": "1.875rem", "4xl": "2.25rem",
      "5xl": "3rem", "6xl": "3.75rem",
    },
    line_heights: {
      none: "1", tight: "1.25", snug: "1.375", normal: "1.5", relaxed: "1.625", loose: "2",
    },
    font_weights: {
      light: "300", normal: "400", medium: "500", semibold: "600", bold: "700", extrabold: "800",
    },
    letter_spacing: {
      tighter: "-0.05em", tight: "-0.025em", normal: "0em", wide: "0.025em", wider: "0.05em",
    },
  };

  const borderRadius = {
    none: "0px", sm: "0.125rem", base: "0.25rem", md: "0.375rem",
    lg: "0.5rem", xl: "0.75rem", "2xl": "1rem", full: "9999px",
  };

  const shadows = {
    sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    base: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
    md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
    lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
  };

  const tokens = {
    $schema: "https://design-tokens.github.io/community-group/format/",
    project: id.name,
    generated_at: ctx.generated_at,
    styling_approach: stylingApproach,
    project_type: id.type,
    primary_language: id.primary_language,
    detected_stack: {
      frameworks: frameworks.map(f => ({ name: f.name, version: f.version ?? null, confidence: f.confidence })),
      has_tailwind: hasTailwind,
      has_css_modules: hasCssModules,
      has_css_in_js: hasStyledComponents,
      has_sass: hasSass,
    },
    languages: ctx.detection.languages.slice(0, 8).map(l => ({ name: l.name, file_count: l.file_count, loc_percent: l.loc_percent })),
    architecture: {
      separation_score: ctx.architecture_signals.separation_score,
      patterns: ctx.architecture_signals.patterns_detected,
      total_files: ctx.structure.total_files,
      total_loc: ctx.structure.total_loc,
    },
    colors,
    spacing,
    typography,
    border_radius: borderRadius,
    shadows,
    breakpoints: {
      sm: "640px", md: "768px", lg: "1024px", xl: "1280px", "2xl": "1536px",
    },
    z_index: {
      dropdown: 1000, sticky: 1020, fixed: 1030, modal_backdrop: 1040,
      modal: 1050, popover: 1060, tooltip: 1070,
    },
    motion: {
      duration: {
        instant: "50ms", fast: "100ms", normal: "200ms", slow: "300ms", slower: "500ms",
      },
      easing: {
        default: "cubic-bezier(0.4, 0, 0.2, 1)",
        in: "cubic-bezier(0.4, 0, 1, 1)",
        out: "cubic-bezier(0, 0, 0.2, 1)",
        in_out: "cubic-bezier(0.4, 0, 0.2, 1)",
        bounce: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      reduce_motion: "@media (prefers-reduced-motion: reduce)",
    },
    opacity: {
      "0": "0", "5": "0.05", "10": "0.1", "25": "0.25",
      "50": "0.5", "75": "0.75", "90": "0.9", "100": "1",
    },
    surfaces: {
      page: { bg: "neutral.50", text: "neutral.900", border: "neutral.200" },
      card: { bg: "white", text: "neutral.800", border: "neutral.200", shadow: "shadows.base" },
      elevated: { bg: "white", text: "neutral.800", border: "neutral.100", shadow: "shadows.lg" },
      inset: { bg: "neutral.100", text: "neutral.700", border: "neutral.200" },
      overlay: { bg: "white", text: "neutral.900", shadow: "shadows.lg", backdrop: "rgba(0,0,0,0.4)" },
    },
    source_theme_files: null as string[] | null,
  };

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const themeFiles = detectStyleFiles(files);
    if (themeFiles.length > 0) {
      tokens.source_theme_files = themeFiles.slice(0, 15).map(f => f.path);
    }
  }

  return {
    path: "design-tokens.json",
    content: JSON.stringify(tokens, null, 2),
    content_type: "application/json",
    program: "theme",
    description: "Design token system derived from project stack and styling approach",
  };
}

// ─── theme.css ──────────────────────────────────────────────────

export function generateThemeCss(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const lines: string[] = [];

  lines.push("/* ==========================================================================");
  lines.push(`   Theme — ${cssComment(ctx.project_identity.name)}`);
  lines.push("   Auto-generated by Axis Theme. Edit tokens, not this file.");
  lines.push("   ========================================================================== */");
  lines.push("");

  // ─── Project snapshot comment ────────────────────────────────
  const fwStack = ctx.detection.frameworks.slice(0, 4).map(f => cssComment(f.name)).join(", ") || "—";
  /* v8 ignore next */
  const totalLoc = ctx.detection.languages.reduce((sum, l) => sum + (l.loc ?? 0), 0);
  // Dedupe by (method, path) and drop test/README noise so the headline count
  // reflects the real API surface, not the parser's per-mention rows.
  const routes = displayRoutes(ctx.routes);
  const getCount = routes.filter(r => r.method === "GET").length;
  const postCount = routes.filter(r => r.method === "POST").length;
  const otherCount = routes.length - getCount - postCount;
  lines.push("/* ─── Project Snapshot ──────────────────────────────────────");
  lines.push(`   Name:        ${cssComment(ctx.project_identity.name)}`);
  lines.push(`   Type:        ${cssComment(ctx.project_identity.type.replace(/_/g, " "))}`);
  lines.push(`   Language:    ${cssComment(ctx.project_identity.primary_language)}`);
  lines.push(`   Stack:       ${fwStack}`);
  if (totalLoc > 0) {
    lines.push(`   Total LOC:   ${totalLoc.toLocaleString("en-US")}`);
  }
  if (routes.length > 0) {
    lines.push(`   Routes:      ${routes.length} (${getCount} GET · ${postCount} POST${otherCount > 0 ? ` · ${otherCount} other` : ""})`);
  }
  if (ctx.domain_models.length > 0) {
    lines.push(`   Models:      ${ctx.domain_models.length} domain models`);
  }
  lines.push("   ─────────────────────────────────────────────────────── */");
  lines.push("");

  // CSS Custom Properties (light theme)
  lines.push(":root {");
  lines.push("  /* Colors — Primary (averionics HUD cyan) */");
  lines.push("  --color-primary-50: #ecfeff;");
  lines.push("  --color-primary-100: #cffafe;");
  lines.push("  --color-primary-200: #a5f3fc;");
  lines.push("  --color-primary-300: #67e8f9;");
  lines.push("  --color-primary-400: #22d3ee;");
  lines.push("  --color-primary-500: #06b6d4;");
  lines.push("  --color-primary-600: #0891b2;");
  lines.push("  --color-primary-700: #0e7490;");
  lines.push("  --color-primary-800: #155e75;");
  lines.push("  --color-primary-900: #164e63;");
  lines.push("");
  lines.push("  /* Colors — Neutral (cool cockpit slate) */");
  lines.push("  --color-neutral-50: #f4f7fa;");
  lines.push("  --color-neutral-100: #e8edf3;");
  lines.push("  --color-neutral-200: #cfd9e4;");
  lines.push("  --color-neutral-300: #aebccd;");
  lines.push("  --color-neutral-400: #7e8ea3;");
  lines.push("  --color-neutral-500: #5b6b81;");
  lines.push("  --color-neutral-600: #44566b;");
  lines.push("  --color-neutral-700: #324153;");
  lines.push("  --color-neutral-800: #1b2733;");
  lines.push("  --color-neutral-900: #0d141d;");
  lines.push("");
  lines.push("  /* Colors — Semantic + accent (averionics: HUD cyan + instrument amber) */");
  lines.push("  --color-accent: #0a8aa6;");
  lines.push("  --color-accent-ink: #ffffff;");
  lines.push("  --color-amber: #b06a00;");
  lines.push("  --color-success: #0f9d58;");
  lines.push("  --color-warning: #b06a00;");
  lines.push("  --color-error: #d23b3b;");
  lines.push("");
  lines.push("  /* Typography */");
  lines.push("  --font-sans: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;");
  lines.push("  --font-mono: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;");
  lines.push("  --font-size-xs: 0.75rem;");
  lines.push("  --font-size-sm: 0.875rem;");
  lines.push("  --font-size-base: 1rem;");
  lines.push("  --font-size-lg: 1.125rem;");
  lines.push("  --font-size-xl: 1.25rem;");
  lines.push("  --font-size-2xl: 1.5rem;");
  lines.push("  --font-size-3xl: 1.875rem;");
  lines.push("  --font-size-4xl: 2.25rem;");
  lines.push("");
  lines.push("  /* Spacing */");
  lines.push("  --space-1: 0.25rem;");
  lines.push("  --space-2: 0.5rem;");
  lines.push("  --space-3: 0.75rem;");
  lines.push("  --space-4: 1rem;");
  lines.push("  --space-6: 1.5rem;");
  lines.push("  --space-8: 2rem;");
  lines.push("  --space-12: 3rem;");
  lines.push("  --space-16: 4rem;");
  lines.push("");
  lines.push("  /* Border Radius */");
  lines.push("  --radius-sm: 0.125rem;");
  lines.push("  --radius-base: 0.25rem;");
  lines.push("  --radius-md: 0.375rem;");
  lines.push("  --radius-lg: 0.5rem;");
  lines.push("  --radius-xl: 0.75rem;");
  lines.push("  --radius-full: 9999px;");
  lines.push("");
  lines.push("  /* Shadows */");
  lines.push("  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);");
  lines.push("  --shadow-base: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);");
  lines.push("  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);");
  lines.push("  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);");
  lines.push("");
  lines.push("  /* Z-Index */");
  lines.push("  --z-dropdown: 1000;");
  lines.push("  --z-sticky: 1020;");
  lines.push("  --z-fixed: 1030;");
  lines.push("  --z-modal-backdrop: 1040;");
  lines.push("  --z-modal: 1050;");
  lines.push("  --z-tooltip: 1070;");
  lines.push("");
  lines.push("  /* Transitions */");
  lines.push("  --transition-fast: 150ms ease;");
  lines.push("  --transition-base: 200ms ease;");
  lines.push("  --transition-slow: 300ms ease;");
  lines.push("");
  lines.push("  /* Motion */");
  lines.push("  --ease-default: cubic-bezier(0.4, 0, 0.2, 1);");
  lines.push("  --ease-in: cubic-bezier(0.4, 0, 1, 1);");
  lines.push("  --ease-out: cubic-bezier(0, 0, 0.2, 1);");
  lines.push("  --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);");
  lines.push("");
  lines.push("  /* Surfaces (averionics daylight instrument) */");
  lines.push("  --surface-page: #eceff3;");
  lines.push("  --surface-card: #ffffff;");
  lines.push("  --surface-elevated: #ffffff;");
  lines.push("  --surface-inset: #f4f6f9;");
  lines.push("  --surface-overlay-backdrop: rgba(7, 11, 17, 0.45);");
  lines.push("");
  lines.push("  /* Focus Ring + HUD glow */");
  lines.push("  --ring-color: var(--color-accent);");
  lines.push("  --ring-offset: 2px;");
  lines.push("  --ring-width: 2px;");
  lines.push("  --glow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 22%, transparent);");
  lines.push("}");
  lines.push("");

  // Dark theme (averionics night-cockpit) — FULL token parity (every primary +
  // neutral stop, surfaces, semantics, shadows, glow), applied via BOTH the OS
  // preference AND an explicit [data-theme="dark"] toggle so apps with a switch work.
  // The neutral scale inverts (50 = darkest, 900 = lightest) so text tokens stay legible.
  const darkTokens = [
    "--color-primary-50: #083344;",
    "--color-primary-100: #164e63;",
    "--color-primary-200: #155e75;",
    "--color-primary-300: #0e7490;",
    "--color-primary-400: #0891b2;",
    "--color-primary-500: #22d3ee;",
    "--color-primary-600: #67e8f9;",
    "--color-primary-700: #a5f3fc;",
    "--color-primary-800: #cffafe;",
    "--color-primary-900: #ecfeff;",
    "--color-neutral-50: #070b11;",
    "--color-neutral-100: #0d141d;",
    "--color-neutral-200: #141e29;",
    "--color-neutral-300: #1b2733;",
    "--color-neutral-400: #29384a;",
    "--color-neutral-500: #6e8093;",
    "--color-neutral-600: #8b9bb0;",
    "--color-neutral-700: #aebccd;",
    "--color-neutral-800: #cdd9e6;",
    "--color-neutral-900: #d6e2ee;",
    "--color-accent: #22d3ee;",
    "--color-accent-ink: #04131a;",
    "--color-amber: #ffb020;",
    "--color-success: #2ee6a6;",
    "--color-warning: #ffc53d;",
    "--color-error: #ff5d6c;",
    "--surface-page: #070b11;",
    "--surface-card: #0d141d;",
    "--surface-elevated: #141e29;",
    "--surface-inset: #0a0f16;",
    "--surface-overlay-backdrop: rgba(0, 0, 0, 0.7);",
    "--ring-color: var(--color-accent);",
    "--glow: 0 0 0 1px color-mix(in srgb, var(--color-accent) 55%, transparent), 0 0 18px color-mix(in srgb, var(--color-accent) 28%, transparent);",
    "--shadow-sm: 0 1px 2px rgba(0,0,0,0.4);",
    "--shadow-base: 0 1px 2px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.35);",
    "--shadow-md: 0 4px 6px rgba(0,0,0,0.45);",
    "--shadow-lg: 0 10px 18px rgba(0,0,0,0.55);",
  ];
  lines.push("@media (prefers-color-scheme: dark) {");
  lines.push("  :root:not([data-theme='light']) {");
  for (const t of darkTokens) lines.push("    " + t);
  lines.push("  }");
  lines.push("}");
  lines.push("");
  lines.push("/* Explicit toggle — wins regardless of OS preference. */");
  lines.push("[data-theme=\"dark\"] {");
  for (const t of darkTokens) lines.push("  " + t);
  lines.push("}");
  lines.push("");

  // Reduced motion
  lines.push("@media (prefers-reduced-motion: reduce) {");
  lines.push("  *, *::before, *::after {");
  lines.push("    animation-duration: 0.01ms !important;");
  lines.push("    animation-iteration-count: 1 !important;");
  lines.push("    transition-duration: 0.01ms !important;");
  lines.push("    scroll-behavior: auto !important;");
  lines.push("  }");
  lines.push("}");
  lines.push("");

  // Focus utility
  lines.push("/* ─── Focus Ring ──────────────────────────────────────────── */");
  lines.push("");
  lines.push(":focus-visible {");
  lines.push("  outline: var(--ring-width) solid var(--ring-color);");
  lines.push("  outline-offset: var(--ring-offset);");
  lines.push("}");
  lines.push("");

  // Keyframe animations
  lines.push("/* ─── Animations ─────────────────────────────────────────── */");
  lines.push("");
  lines.push("@keyframes fade-in {");
  lines.push("  from { opacity: 0; }");
  lines.push("  to { opacity: 1; }");
  lines.push("}");
  lines.push("");
  lines.push("@keyframes slide-up {");
  lines.push("  from { opacity: 0; transform: translateY(8px); }");
  lines.push("  to { opacity: 1; transform: translateY(0); }");
  lines.push("}");
  lines.push("");
  lines.push("@keyframes slide-down {");
  lines.push("  from { opacity: 0; transform: translateY(-8px); }");
  lines.push("  to { opacity: 1; transform: translateY(0); }");
  lines.push("}");
  lines.push("");
  lines.push("@keyframes scale-in {");
  lines.push("  from { opacity: 0; transform: scale(0.95); }");
  lines.push("  to { opacity: 1; transform: scale(1); }");
  lines.push("}");
  lines.push("");
  lines.push("@keyframes spin {");
  lines.push("  to { transform: rotate(360deg); }");
  lines.push("}");
  lines.push("");
  lines.push("@keyframes pulse {");
  lines.push("  50% { opacity: 0.5; }");
  lines.push("}");
  lines.push("");
  lines.push("@keyframes shimmer {");
  lines.push("  0% { background-position: -200% 0; }");
  lines.push("  100% { background-position: 200% 0; }");
  lines.push("}");
  lines.push("");

  // Utility classes
  lines.push("/* ─── Utilities ──────────────────────────────────────────── */");
  lines.push("");
  lines.push(".animate-fade-in { animation: fade-in var(--transition-base) var(--ease-out); }");
  lines.push(".animate-slide-up { animation: slide-up var(--transition-base) var(--ease-out); }");
  lines.push(".animate-slide-down { animation: slide-down var(--transition-base) var(--ease-out); }");
  lines.push(".animate-scale-in { animation: scale-in var(--transition-fast) var(--ease-bounce); }");
  lines.push(".animate-spin { animation: spin 1s linear infinite; }");
  lines.push(".animate-pulse { animation: pulse 2s var(--ease-default) infinite; }");
  lines.push(".animate-shimmer {");
  lines.push("  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent);");
  lines.push("  background-size: 200% 100%;");
  lines.push("  animation: shimmer 1.5s infinite;");
  lines.push("}");
  lines.push("");

  // ─── Base reset + typography baseline ──────────────────────
  // Drop-in equivalent of an index.css for fresh projects. Sets box-sizing,
  // mounts the font tokens onto html/body, normalizes margins, applies sane
  // defaults to headings/p/code/pre/links/buttons, and respects the focus-ring
  // policy defined above. Safe to override per-component.
  lines.push("/* ─── Base Reset (index.css baseline) ────────────────────── */");
  lines.push("");
  lines.push("*, *::before, *::after { box-sizing: border-box; }");
  lines.push("");
  lines.push("html {");
  lines.push("  font-family: var(--font-sans);");
  lines.push("  font-size: 16px;");
  lines.push("  line-height: 1.5;");
  lines.push("  -webkit-text-size-adjust: 100%;");
  lines.push("  -webkit-font-smoothing: antialiased;");
  lines.push("  -moz-osx-font-smoothing: grayscale;");
  lines.push("  text-rendering: optimizeLegibility;");
  lines.push("  color-scheme: light dark;");
  lines.push("}");
  lines.push("");
  lines.push("body {");
  lines.push("  margin: 0;");
  lines.push("  min-height: 100vh;");
  lines.push("  background: var(--surface-page);");
  lines.push("  color: var(--color-neutral-900);");
  lines.push("  font-size: var(--font-size-base);");
  lines.push("}");
  lines.push("");
  lines.push("h1, h2, h3, h4, h5, h6, p, figure, blockquote, dl, dd { margin: 0; }");
  lines.push("h1 { font-size: var(--font-size-4xl); line-height: 1.15; font-weight: 700; }");
  lines.push("h2 { font-size: var(--font-size-2xl); line-height: 1.25; font-weight: 600; }");
  lines.push("h3 { font-size: var(--font-size-xl);  line-height: 1.3;  font-weight: 600; }");
  lines.push("h4 { font-size: var(--font-size-lg);  line-height: 1.35; font-weight: 600; }");
  lines.push("");
  lines.push("p { max-width: 70ch; }");
  lines.push("");
  lines.push("a {");
  lines.push("  color: var(--color-primary-600);");
  lines.push("  text-decoration-thickness: 0.08em;");
  lines.push("  text-underline-offset: 0.18em;");
  lines.push("}");
  lines.push("a:hover { color: var(--color-primary-700); }");
  lines.push("");
  lines.push("code, kbd, samp, pre {");
  lines.push("  font-family: var(--font-mono);");
  lines.push("  font-size: 0.95em;");
  lines.push("}");
  lines.push("code, kbd, samp {");
  lines.push("  background: var(--surface-inset);");
  lines.push("  border-radius: var(--radius-sm);");
  lines.push("  padding: 0.1em 0.35em;");
  lines.push("}");
  lines.push("pre {");
  lines.push("  background: var(--surface-inset);");
  lines.push("  border-radius: var(--radius-md);");
  lines.push("  padding: var(--space-4);");
  lines.push("  overflow-x: auto;");
  lines.push("}");
  lines.push("pre code { background: transparent; padding: 0; }");
  lines.push("");
  lines.push("img, picture, video, canvas, svg { display: block; max-width: 100%; height: auto; }");
  lines.push("");
  lines.push("button, input, optgroup, select, textarea {");
  lines.push("  font: inherit;");
  lines.push("  color: inherit;");
  lines.push("}");
  lines.push("button {");
  lines.push("  background: transparent;");
  lines.push("  border: 1px solid transparent;");
  lines.push("  cursor: pointer;");
  lines.push("  padding: var(--space-2) var(--space-4);");
  lines.push("  border-radius: var(--radius-md);");
  lines.push("  transition: background var(--transition-fast), border-color var(--transition-fast);");
  lines.push("}");
  lines.push("button:disabled { cursor: not-allowed; opacity: 0.6; }");
  lines.push("");
  lines.push("hr {");
  lines.push("  border: 0;");
  lines.push("  border-top: 1px solid var(--color-neutral-200);");
  lines.push("  margin: var(--space-6) 0;");
  lines.push("}");
  lines.push("");
  lines.push("table { border-collapse: collapse; width: 100%; }");
  lines.push("th, td {");
  lines.push("  text-align: left;");
  lines.push("  padding: var(--space-2) var(--space-3);");
  lines.push("  border-bottom: 1px solid var(--color-neutral-200);");
  lines.push("}");
  lines.push("th { font-weight: 600; }");
  lines.push("");

  // Component reset classes
  lines.push("/* ─── Component Primitives ───────────────────────────────── */");
  lines.push("");
  lines.push(".surface-card {");
  lines.push("  background: var(--surface-card);");
  lines.push("  border: 1px solid var(--color-neutral-200);");
  lines.push("  border-radius: var(--radius-lg);");
  lines.push("  box-shadow: var(--shadow-base);");
  lines.push("}");
  lines.push("");
  lines.push(".surface-elevated {");
  lines.push("  background: var(--surface-elevated);");
  lines.push("  border-radius: var(--radius-xl);");
  lines.push("  box-shadow: var(--shadow-lg);");
  lines.push("}");
  lines.push("");
  lines.push(".surface-inset {");
  lines.push("  background: var(--surface-inset);");
  lines.push("  border-radius: var(--radius-md);");
  lines.push("}");
  lines.push("");
  lines.push(".interactive {");
  lines.push("  cursor: pointer;");
  lines.push("  transition: all var(--transition-fast);");
  lines.push("}");
  lines.push(".interactive:hover { opacity: 0.85; }");
  lines.push(".interactive:active { transform: scale(0.98); }");
  lines.push("");
  lines.push(".truncate {");
  lines.push("  overflow: hidden;");
  lines.push("  text-overflow: ellipsis;");
  lines.push("  white-space: nowrap;");
  lines.push("}");
  lines.push("");
  lines.push(".sr-only {");
  lines.push("  position: absolute; width: 1px; height: 1px;");
  lines.push("  padding: 0; margin: -1px; overflow: hidden;");
  lines.push("  clip: rect(0,0,0,0); white-space: nowrap; border-width: 0;");
  lines.push("}");
  lines.push("");

  // ─── Domain-model component class registry ──────────────────
  // For each detected model we publish a (commented) class hint pointing at
  // the canonical .surface-card / .surface-elevated primitives. We no longer
  // emit a separate 8-line rule per model — they were identical to the
  // primitives and bloated the stylesheet with dead CSS.
  if (ctx.domain_models.length > 0) {
    lines.push("/* ─── Domain Model Component Hints ───────────────────────── */");
    lines.push("/*    Use .surface-card / .surface-elevated for cards backed by these models. */");
    lines.push("/*    Add model-specific tweaks in your own stylesheet, not here.            */");
    lines.push("");
    for (const model of ctx.domain_models.slice(0, 8)) {
      const slug = model.name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
      lines.push(`/*   .${slug}-card    — ${model.name} (${model.kind}, ${model.field_count} fields). Apply .surface-card. */`);
    }
    lines.push("");
  }

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const cssFiles = detectStyleFiles(files);
    if (cssFiles.length > 0) {
      lines.push("/* ─── Detected Style Files ─────────────────────────────── */");
      lines.push("/*");
      for (const cf of cssFiles.slice(0, 10)) {
        lines.push(`   ${cf.path} (${cf.content.split("\n").length} lines)`);
      }
      lines.push("*/");
      lines.push("");
    }
  }

  return {
    path: "theme.css",
    content: lines.join("\n"),
    content_type: "text/css",
    program: "theme",
    description: "CSS custom properties theme with light/dark support",
  };
}

// ─── theme-guidelines.md ────────────────────────────────────────

export function generateThemeGuidelines(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const lines: string[] = [];

  // Styling signals — shared detector so this doc agrees with design-tokens.json
  // and dark-mode-tokens.json (incl. @emotion/react and Sass, previously missed).
  const { hasTailwind, hasCssModules, hasStyledComponents, hasSass } = detectStyling(ctx);

  lines.push(`# Theme Guidelines — ${mdText(id.name)}`);
  lines.push("");
  lines.push(`> Design system rules for a ${mdText(id.type.replace(/_/g, " "))} built with ${mdText(id.primary_language)}`);
  lines.push("");
  lines.push("This pack ships the **averionics** starting aesthetic — a cockpit/instrument system with a");
  lines.push("HUD-cyan accent, instrument amber for caution, cool blue-black panels, monospace data labels");
  lines.push("and a glow focus ring — as a complete **light + dark** theme (`theme.css`). It's a starting");
  lines.push("point: keep the token contract and restyle freely. Reference the cyan primary scale for");
  lines.push("interactive surfaces and `--color-amber` for caution states.");
  lines.push("");

  // Project Overview
  if (ctx.ai_context.project_summary) {
    lines.push("## Project Overview");
    lines.push("");
    lines.push(mdText(ctx.ai_context.project_summary));
    lines.push("");
  }

  // Stack Reference
  if (ctx.detection.frameworks.length > 0) {
    lines.push("## Detected Stack");
    lines.push("");
    lines.push("| Framework | Version | Confidence |");
    lines.push("|-----------|---------|------------|");
    for (const fw of ctx.detection.frameworks) {
      lines.push(`| ${mdInline(fw.name)} | ${fw.version ? mdInline(fw.version) : "—"} | ${(fw.confidence * 100).toFixed(0)}% |`);
    }
    lines.push("");
  }

  // Architecture context for theming decisions
  if (ctx.architecture_signals.layer_boundaries.length > 0) {
    lines.push("## Architecture Context");
    lines.push("");
    lines.push(`Separation score: **${ctx.architecture_signals.separation_score}**/1.0`);
    lines.push("");
    lines.push("Theme tokens should be applied consistently across these layers:");
    lines.push("");
    for (const l of ctx.architecture_signals.layer_boundaries) {
      lines.push(`- **${mdText(l.layer)}**: ${l.directories.map(mdInline).join(", ")}`);
    }
    lines.push("");
  }

  // Styling Approach
  lines.push("## Styling Approach");
  lines.push("");
  if (hasTailwind) {
    lines.push("**Detected: Tailwind CSS**");
    lines.push("");
    lines.push("- Use utility classes as the primary styling method");
    lines.push("- Extract repeated patterns into `@apply` directives or component abstractions");
    lines.push("- Extend the default theme in `tailwind.config` rather than using arbitrary values");
    lines.push("- Use the `theme()` function in custom CSS to reference token values");
    lines.push("- Prefer `cn()` or `clsx()` for conditional class merging");
    lines.push("");
  } else if (hasStyledComponents) {
    lines.push("**Detected: CSS-in-JS**");
    lines.push("");
    lines.push("- Use the ThemeProvider to distribute tokens");
    lines.push("- Access tokens via `props.theme.*` in styled components");
    lines.push("- Avoid inline styles — use styled components for all custom styling");
    lines.push("- Co-locate styled components with their consuming component");
    lines.push("");
  } else if (hasCssModules) {
    lines.push("**Detected: CSS Modules**");
    lines.push("");
    lines.push("- Import CSS modules as `styles` for scoped class names");
    lines.push("- Use CSS custom properties (from theme.css) for token values");
    lines.push("- Keep module files co-located with their components");
    lines.push("- Use `composes` for shared styles between modules");
    lines.push("");
  } else if (hasSass) {
    lines.push("**Detected: Sass / SCSS**");
    lines.push("");
    lines.push("- Import `theme.css` and reference tokens via `var(--token-name)` — don't fork them into Sass variables");
    lines.push("- Mirror the token contract in a Sass map only where you need compile-time math");
    lines.push("- Use `@use` / `@forward` (not the deprecated `@import`) for module composition");
    lines.push("- Keep partials co-located with their components");
    lines.push("");
  } else {
    lines.push("**No CSS framework detected.** Using vanilla CSS custom properties.");
    lines.push("");
    lines.push("- Import `theme.css` at the root of the application");
    lines.push("- Use `var(--token-name)` to reference design tokens");
    lines.push("- Avoid hardcoded colors, spacing, and typography values");
    lines.push("");
  }

  // Color Usage Rules
  lines.push("## Color Usage");
  lines.push("");
  lines.push("> The neutral scale **inverts in dark mode** (`neutral-50` = darkest, `neutral-900` = lightest),");
  lines.push("> so the *same* token names stay legible in both modes — don't swap indices per theme.");
  lines.push("> Prefer the `--surface-*` tokens for backgrounds; they auto-adapt.");
  lines.push("");
  lines.push("| Context | Token | Example |");
  lines.push("|---------|-------|---------|");
  lines.push("| Page background | `--surface-page` (or neutral-50) | Root background — light in light mode, dark in dark |");
  lines.push("| Card / panel background | `--surface-card` / `--surface-elevated` | Cards, popovers |");
  lines.push("| Text (primary) | neutral-900 | Body text — auto-inverts, no per-mode swap |");
  lines.push("| Text (secondary) | neutral-500 to neutral-600 | Labels, captions |");
  lines.push("| Interactive | primary-500 to primary-600 | Buttons, links |");
  lines.push("| Interactive (hover) | primary-600 to primary-700 | Hover states |");
  lines.push("| Success | success-500 | Confirmations, valid states |");
  lines.push("| Warning | warning-500 | Caution indicators |");
  lines.push("| Error | error-500 | Error messages, destructive actions |");
  lines.push("");

  // Typography Rules
  lines.push("## Typography");
  lines.push("");
  lines.push("- Use `font-sans` for UI text and body copy");
  lines.push("- Use `font-mono` for code blocks, terminal output, and technical data");
  lines.push("- Heading scale (as shipped in `theme.css`): h1=4xl, h2=2xl, h3=xl, h4=lg. h5/h6 inherit `base` — set explicitly if you need them larger.");
  lines.push("- Body text: base size (1rem / 16px) with normal line-height (1.5)");
  lines.push("- Small text: sm size for captions, helper text, labels");
  lines.push("- Never use more than 3 font weights on a single page");
  lines.push("");

  // Spacing Rules
  lines.push("## Spacing");
  lines.push("");
  lines.push("- Use the 4-point grid: all spacing should be multiples of `--space-1` (0.25rem)");
  lines.push("- Component padding: `--space-3` to `--space-4` (12–16px)");
  lines.push("- Section gaps: `--space-6` to `--space-8` (24–32px)");
  lines.push("- Page margins: `--space-4` on mobile, `--space-8` on desktop");
  lines.push("- Stack spacing (vertical gaps): `--space-2` to `--space-4`");
  lines.push("");

  // Component Patterns
  lines.push("## Component Patterns");
  lines.push("");
  // Shared canonical predicate — this headline count MUST match
  // component-theme-map.json's total_components for the same repo.
  const componentFiles = componentFileEntries(ctx);
  if (componentFiles.length > 0) {
    lines.push(`Detected ${componentFiles.length} component file(s). Apply these patterns:`);
    lines.push("");
  }
  lines.push("- Buttons: `radius-md`, `primary-500` bg, `space-2` horizontal padding, `space-1` vertical");
  lines.push("- Cards: `radius-lg`, `shadow-base`, `space-4` padding, `neutral-50` bg");
  lines.push("- Inputs: `radius-base`, `neutral-200` border, `space-2` padding, `neutral-50` bg");
  lines.push("- Modals: `radius-xl`, `shadow-lg`, centered with backdrop");
  lines.push("- Badges: `radius-full`, `font-size-xs`, `space-1` padding");
  lines.push("");

  // Framework-Specific Integration
  if (hasFw(ctx, "Next.js", "React")) {
    const reactFw = getFw(ctx, "React") ?? getFw(ctx, "Next.js");
    lines.push("## React Integration");
    lines.push("");
    if (reactFw?.version) lines.push(`> Detected: ${mdInline(reactFw.name)} ${mdInline(reactFw.version)}`);
    lines.push("");
    lines.push("- Import theme.css in `app/layout.tsx` or root `_app.tsx`");
    lines.push("- Use a `ThemeContext` provider for runtime theme switching");
    lines.push("- Expose tokens as TypeScript constants via a `tokens.ts` module");
    lines.push("- Support `prefers-color-scheme` + manual toggle for dark mode");
    lines.push("");
  }
  if (hasFw(ctx, "Vue")) {
    const vueFw = getFw(ctx, "Vue");
    lines.push("## Vue Integration");
    lines.push("");
    if (vueFw?.version) lines.push(`> Detected: Vue ${mdInline(vueFw.version)}`);
    lines.push("");
    lines.push("- Import theme.css in `main.ts` or `App.vue`");
    lines.push("- Use `provide/inject` for theme context");
    lines.push("");
  }

  // Animation & Motion
  lines.push("## Animation & Motion");
  lines.push("");
  lines.push("### Available Animations");
  lines.push("");
  lines.push("| Class | Effect | Duration | Use For |");
  lines.push("|-------|--------|----------|---------|");
  lines.push("| `.animate-fade-in` | Opacity 0→1 | 200ms | Page sections, lazy content |");
  lines.push("| `.animate-slide-up` | Translate Y + fade | 200ms | Cards, list items, toasts |");
  lines.push("| `.animate-slide-down` | Translate Y + fade | 200ms | Dropdowns, menus |");
  lines.push("| `.animate-scale-in` | Scale 0.95→1 + fade | 150ms | Modals, popovers |");
  lines.push("| `.animate-spin` | 360° rotate | 1s loop | Loading spinners |");
  lines.push("| `.animate-pulse` | Opacity pulse | 2s loop | Skeleton loaders |");
  lines.push("| `.animate-shimmer` | Gradient sweep | 1.5s loop | Loading placeholders |");
  lines.push("");
  lines.push("### Motion Rules");
  lines.push("");
  lines.push("- **Entrances**: Use `fade-in` or `slide-up`. Keep under 300ms.");
  lines.push("- **Exits**: Reverse the entrance or use `fade-out` (opacity 1→0).");
  lines.push("- **Hover/focus**: Use `transition: all var(--transition-fast)` — never animate on hover with keyframes.");
  lines.push("- **Loading states**: Prefer `pulse` or `shimmer` over spinner when layout is known.");
  lines.push("- **Reduced motion**: All animations are automatically disabled via `prefers-reduced-motion: reduce`.");
  lines.push("- **Easing**: Default to `--ease-out` for entrances, `--ease-in` for exits, `--ease-bounce` for playful micro-interactions.");
  lines.push("");

  // Responsive Strategy
  lines.push("## Responsive Strategy");
  lines.push("");
  lines.push("### Breakpoints");
  lines.push("");
  lines.push("| Token | Width | Target |");
  lines.push("|-------|-------|--------|");
  lines.push("| `sm` | 640px | Large phones (landscape) |");
  lines.push("| `md` | 768px | Tablets |");
  lines.push("| `lg` | 1024px | Small laptops |");
  lines.push("| `xl` | 1280px | Desktops |");
  lines.push("| `2xl` | 1536px | Large screens |");
  lines.push("");
  lines.push("### Rules");
  lines.push("");
  lines.push("- **Mobile-first**: Write base styles for the smallest screen, then layer up with `min-width` queries.");
  lines.push("- **Container widths**: Cap content at `max-width: 1280px` with auto margins.");
  lines.push("- **Touch targets**: Minimum 44×44px for all interactive elements on mobile.");
  lines.push("- **Spacing**: Use `--space-4` page margins on mobile, `--space-8` on `md+`.");
  lines.push("- **Typography**: Body stays at `base` (1rem). Headings can scale down 1 step on mobile (e.g., `h1` from `4xl` to `3xl`).");
  lines.push("- **Grid**: Prefer CSS Grid with `auto-fit` / `minmax()` for naturally responsive layouts.");
  lines.push("");

  // Surface Semantics
  lines.push("## Surface Hierarchy");
  lines.push("");
  lines.push("| Surface | CSS Class | Use For |");
  lines.push("|---------|-----------|---------|");
  lines.push("| Page | `--surface-page` | Root background |");
  lines.push("| Card | `.surface-card` | Primary content containers |");
  lines.push("| Elevated | `.surface-elevated` | Floating panels, popovers |");
  lines.push("| Inset | `.surface-inset` | Code blocks, secondary areas |");
  lines.push("| Overlay | `--surface-overlay-backdrop` | Modal/dialog backdrops |");
  lines.push("");
  lines.push("Surfaces automatically adapt in dark mode via CSS custom properties.");
  lines.push("");

  // Accessibility
  lines.push("## Accessibility");
  lines.push("");
  lines.push("### Contrast Requirements (WCAG 2.1)");
  lines.push("");
  lines.push("| Level | Ratio | Applies To |");
  lines.push("|-------|-------|------------|");
  lines.push("| AA | 4.5:1 | Normal text (< 18px) |");
  lines.push("| AA | 3:1 | Large text (≥ 18px bold / 24px), UI components, icons |");
  lines.push("| AAA | 7:1 | Enhanced — target for body text on critical pages |");
  lines.push("");
  lines.push("### Token Contrast Reference");
  lines.push("");
  lines.push("| Combination | Approximate Ratio | Grade |");
  lines.push("|-------------|-------------------|-------|");
  lines.push("| neutral-900 on neutral-50 | 18.1:1 | AAA |");
  lines.push("| neutral-900 on neutral-100 | 16.0:1 | AAA |");
  lines.push("| primary-600 on neutral-50 | 5.2:1 | AA |");
  lines.push("| neutral-500 on neutral-50 | 4.6:1 | AA (text) |");
  lines.push("| neutral-400 on neutral-50 | 3.2:1 | AA (large only) |");
  lines.push("| error-500 on white | 4.0:1 | AA (large only) |");
  lines.push("");
  lines.push("### Focus & Interaction");
  lines.push("");
  lines.push("- All interactive elements use `:focus-visible` with a `2px` ring in `--ring-color`.");
  lines.push("- Do not rely on color alone to convey state — pair with icons, text, or shape changes.");
  lines.push("- Use `prefers-reduced-motion` to disable animations (already wired in theme.css).");
  lines.push("- Test with screen readers, keyboard-only navigation, and Windows High Contrast Mode.");
  lines.push("");

  // Route-Aware Theme Zones — deduped + noise-dropped so theming hints reflect
  // real endpoints, not per-mention test/README rows.
  const routeZones = displayRoutes(ctx.routes);
  if (routeZones.length > 0) {
    lines.push("## Route Theme Zones");
    lines.push("");
    lines.push("Routes detected — consider zone-based theming:");
    lines.push("");
    for (const r of routeZones.slice(0, 12)) {
      lines.push(`- \`${mdCode(r.path)}\` (${mdInline(r.method)}) → ${mdText(r.source_file)}`);
    }
    if (routeZones.length > 12) lines.push(`- … and ${routeZones.length - 12} more routes`);
    lines.push("");
  }

  // Domain-Model-Aware Token Naming
  if (ctx.domain_models.length > 0) {
    lines.push("## Domain-Specific Tokens");
    lines.push("");
    lines.push("Consider extending the token system for domain entity states:");
    lines.push("");
    for (const m of ctx.domain_models.slice(0, 8)) {
      lines.push(`- **${mdText(m.name)}** (${mdText(m.kind)}): ${m.field_count} fields — ${mdText(m.source_file)}`);
    }
    lines.push("");
  }

  // Warnings
  if (ctx.ai_context.warnings.length > 0) {
    lines.push("## Warnings");
    lines.push("");
    for (const w of ctx.ai_context.warnings) {
      lines.push(`> ⚠ ${mdText(w)}`);
    }
    lines.push("");
  }

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    // Real stylesheets + design-token sources only (shared detector). The old
    // *theme*/*token* filename glob matched unrelated TS source and tests
    // (generators-theme.ts, github-token-store.ts, *.test.ts) purely by name and
    // excerpted their code into this design doc — noise.
    const styleFiles = detectStyleFiles(files);
    if (styleFiles.length > 0) {
      lines.push("## Detected Style Files");
      lines.push("");
      for (const sf of styleFiles.slice(0, 10)) {
        lines.push(`- \`${mdCode(sf.path)}\` (${sf.content.split("\n").length} lines)`);
      }
      lines.push("");
      lines.push(...renderExcerpts("Style File Contents", styleFiles.slice(0, 3), 20));
    }

    const compFiles = findFiles(files, ["*.tsx", "*.vue", "*.svelte"])
      .filter(f => !f.path.includes(".test.") && !f.path.includes(".spec."));
    if (compFiles.length > 0) {
      lines.push("## Component Style Usage");
      lines.push("");
      lines.push("| Component | Exports | Lines |");
      lines.push("|-----------|---------|-------|");
      for (const cf of compFiles.slice(0, 12)) {
        const exports = extractExports(cf.content);
        lines.push(`| \`${mdCode(cf.path)}\` | ${exports.map(mdInline).join(", ") || "default"} | ${cf.content.split("\n").length} |`);
      }
      lines.push("");
    }
  }

  return {
    path: "theme-guidelines.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "theme",
    description: "Design system rules and usage guidelines for the project theme",
  };
}

// ─── component-theme-map.json ───────────────────────────────────

export function generateComponentThemeMap(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  // Shared canonical predicate — total_components here MUST match the guidelines
  // "Detected N component file(s)" headline for the same repo. (Uses .test./.spec.
  // infixes, so components like Prospect.tsx / Contest.tsx are no longer dropped.)
  const componentFiles = componentFileEntries(ctx);

  // Classify components by pattern
  const components = componentFiles.map(f => {
    /* v8 ignore next — defensive fallback: path always has filename segment */
    const name = f.path.split("/").pop()?.replace(/\.\w+$/, "") ?? f.path;
    const dir = f.path.split("/").slice(0, -1).join("/");

    // Infer component type from path and name
    let type = "custom";
    const lower = name.toLowerCase();
    if (lower.includes("button") || lower.includes("btn")) type = "interactive";
    else if (lower.includes("input") || lower.includes("select") || lower.includes("textarea") || lower.includes("form")) type = "form";
    else if (lower.includes("card") || lower.includes("panel") || lower.includes("section")) type = "container";
    else if (lower.includes("nav") || lower.includes("header") || lower.includes("footer") || lower.includes("sidebar")) type = "layout";
    else if (lower.includes("modal") || lower.includes("dialog") || lower.includes("drawer")) type = "overlay";
    else if (lower.includes("table") || lower.includes("list") || lower.includes("grid")) type = "data-display";
    else if (lower.includes("icon") || lower.includes("avatar") || lower.includes("badge")) type = "decorative";
    else if (lower.includes("page") || lower.includes("layout") || lower.includes("route")) type = "page";

    // Map to relevant tokens
    const tokenCategories: string[] = ["colors", "typography"];
    if (type === "interactive" || type === "form") tokenCategories.push("spacing", "border_radius", "shadows");
    if (type === "container") tokenCategories.push("spacing", "shadows", "border_radius");
    if (type === "layout") tokenCategories.push("spacing", "breakpoints", "z_index");
    if (type === "overlay") tokenCategories.push("z_index", "shadows", "border_radius");
    if (type === "data-display") tokenCategories.push("spacing", "border_radius");

    return {
      name,
      path: f.path,
      directory: dir,
      component_type: type,
      token_categories: [...new Set(tokenCategories)],
    };
  });

  // Summary by type
  const typeCounts: Record<string, number> = {};
  for (const c of components) {
    typeCounts[c.component_type] = (typeCounts[c.component_type] ?? 0) + 1;
  }

  const themeMap = {
    project: ctx.project_identity.name,
    generated_at: ctx.generated_at,
    detected_stack: ctx.detection.frameworks.map(f => ({
      name: f.name,
      version: f.version ?? null,
      confidence: f.confidence,
    })),
    primary_language: ctx.project_identity.primary_language,
    summary: {
      total_components: components.length,
      by_type: typeCounts,
    },
    components,
    token_usage_guidance: {
      interactive: "Use primary colors for CTAs, neutral for secondary. Apply spacing-2/3 for padding, radius-md.",
      form: "Use neutral borders, radius-base, consistent spacing-2 for padding. Error states use error-500.",
      container: "Use neutral backgrounds, shadow-base/md for elevation, radius-lg, spacing-4 padding.",
      layout: "Use breakpoint tokens for responsive behavior, z-index for stacking, spacing-4+ for margins.",
      overlay: "Use high z-index values, shadow-lg, radius-xl. Backdrop with neutral-900/50 opacity.",
      "data-display": "Use neutral colors for grids/tables, spacing-2 cell padding, radius-base for cells.",
      decorative: "Use restrained color from primary palette. Keep size consistent with typography scale.",
      page: "Use section-level spacing (space-8+), neutral backgrounds, full breakpoint responsiveness.",
      custom: "Apply tokens based on the component's actual role. Default to neutral palette.",
    },
    source_component_files: null as string[] | null,
  };

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const compSrc = findFiles(files, ["*.tsx", "*.vue", "*.svelte"])
      .filter(f => !f.path.includes(".test.") && !f.path.includes(".spec."));
    if (compSrc.length > 0) {
      themeMap.source_component_files = compSrc.slice(0, 20).map(f => f.path);
    }
  }

  return {
    path: "component-theme-map.json",
    content: JSON.stringify(themeMap, null, 2),
    content_type: "application/json",
    program: "theme",
    description: "Maps detected components to design token categories and usage guidance",
  };
}

// ─── dark-mode-tokens.json ──────────────────────────────────────

export function generateDarkModeTokens(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const frameworks = ctx.detection.frameworks;
  // Shared tailwind signal (config file OR detected framework) — matches
  // design-tokens.json's has_tailwind and the guidelines' styling section.
  const { hasTailwind } = detectStyling(ctx);

  // Generate a full dark mode token set derived from the project context
  const tokens = {
    project: id.name,
    generated_at: ctx.generated_at,
    scheme: "dark",
    detected_stack: {
      frameworks: ctx.detection.frameworks.map(f => `${f.name}${f.version ? " " + f.version : ""}`),
      primary_language: id.primary_language,
      project_type: id.type,
    },
    colors: {
      background: {
        base: "#070b11",
        surface: "#0d141d",
        elevated: "#141e29",
        overlay: "rgba(0, 0, 0, 0.7)",
      },
      foreground: {
        primary: "#d6e2ee",
        secondary: "#8b9bb0",
        muted: "#6e8093",
        inverse: "#070b11",
      },
      brand: {
        primary: "#22d3ee",
        "primary-hover": "#67e8f9",
        secondary: "#ffb020",
        "secondary-hover": "#ffc53d",
        accent: "#22d3ee",
      },
      semantic: {
        success: "#2ee6a6",
        "success-bg": "rgba(46, 230, 166, 0.1)",
        warning: "#ffc53d",
        "warning-bg": "rgba(255, 197, 61, 0.1)",
        error: "#ff5d6c",
        "error-bg": "rgba(255, 93, 108, 0.1)",
        info: "#22d3ee",
        "info-bg": "rgba(34, 211, 238, 0.1)",
      },
      border: {
        default: "#1b2733",
        focus: "#22d3ee",
        subtle: "#141e29",
      },
    },
    surfaces: {
      page: { bg: "#070b11", text: "#d6e2ee", border: "#1b2733" },
      card: { bg: "#0d141d", text: "#d6e2ee", border: "#1b2733", shadow: "0 1px 2px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.35)" },
      elevated: { bg: "#141e29", text: "#d6e2ee", border: "#29384a", shadow: "0 10px 18px rgba(0,0,0,0.55)" },
      inset: { bg: "#0a0f16", text: "#aebccd", border: "#1b2733" },
      overlay: { bg: "#0d141d", text: "#d6e2ee", shadow: "0 10px 18px rgba(0,0,0,0.6)", backdrop: "rgba(0,0,0,0.7)" },
    },
    shadows: {
      sm: "0 1px 2px rgba(0, 0, 0, 0.3)",
      md: "0 4px 6px rgba(0, 0, 0, 0.4)",
      lg: "0 10px 15px rgba(0, 0, 0, 0.5)",
      glow: "0 0 20px rgba(34, 211, 238, 0.15)",
    },
    motion: {
      note: "Dark mode may warrant subtler motion. Reduce glow/shadow transitions in dark contexts.",
      transition_overrides: {
        shadow_transition: "box-shadow 200ms ease",
        glow_on_focus: "0 0 0 3px rgba(34, 211, 238, 0.25)",
      },
    },
    implementation: {
      css_strategy: hasTailwind ? "tailwind-dark-class" : "css-custom-properties",
      toggle_attribute: "data-theme=\"dark\"",
      media_query: "@media (prefers-color-scheme: dark)",
      tailwind_config: hasTailwind ? {
        darkMode: "class",
        extend_colors: "Map tokens above to theme.extend.colors in tailwind.config",
      } : null,
      css_variables: {
        prefix: "--color",
        example: "--color-bg-base: #070b11",
        selector: ":root[data-theme='dark']",
      },
    },
    contrast_ratios: {
      "primary-on-base": { ratio: "15.3:1", passes: "AAA" },
      "secondary-on-base": { ratio: "7.2:1", passes: "AA" },
      "muted-on-base": { ratio: "4.6:1", passes: "AA" },
      "brand-on-surface": { ratio: "8.1:1", passes: "AAA" },
      "error-on-error-bg": { ratio: "5.4:1", passes: "AA" },
    },
    source_theme_files: null as string[] | null,
  };

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const darkFiles = detectStyleFiles(files);
    if (darkFiles.length > 0) {
      tokens.source_theme_files = darkFiles.slice(0, 15).map(f => f.path);
    }
  }

  return {
    path: "dark-mode-tokens.json",
    content: JSON.stringify(tokens, null, 2),
    content_type: "application/json",
    program: "theme",
    description: "Dark mode design tokens with colors, shadows, contrast ratios, and implementation strategy",
  };
}
