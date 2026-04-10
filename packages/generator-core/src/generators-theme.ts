import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { GeneratedFile, SourceFile } from "./types.js";
import { hasFw, getFw } from "./fw-helpers.js";
import { findFiles, renderExcerpts, fileTree, extractExports } from "./file-excerpt-utils.js";

// ─── .ai/design-tokens.json ────────────────────────────────────

export function generateDesignTokens(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const frameworks = ctx.detection.frameworks;
  const fwNames = frameworks.map(f => f.name);

  // Detect styling approach from file tree
  const treeFiles = ctx.structure.file_tree_summary;
  const hasTailwind = treeFiles.some(f => f.path.includes("tailwind.config"));
  const hasCssModules = treeFiles.some(f => f.path.endsWith(".module.css") || f.path.endsWith(".module.scss"));
  const hasStyledComponents = ctx.dependency_graph.external_dependencies.some(
    d => d.name === "styled-components" || d.name === "@emotion/styled" || d.name === "@emotion/react",
  );
  const hasSass = treeFiles.some(f => f.path.endsWith(".scss") || f.path.endsWith(".sass"));

  const stylingApproach = hasTailwind ? "tailwind" :
    hasStyledComponents ? "css-in-js" :
    hasCssModules ? "css-modules" :
    hasSass ? "sass" : "plain-css";

  // Base color palette (adaptive to detected stack)
  const colors: Record<string, Record<string, string>> = {
    primary: {
      "50": "#eff6ff", "100": "#dbeafe", "200": "#bfdbfe", "300": "#93c5fd",
      "400": "#60a5fa", "500": "#3b82f6", "600": "#2563eb", "700": "#1d4ed8",
      "800": "#1e40af", "900": "#1e3a8a", "950": "#172554",
    },
    neutral: {
      "50": "#fafafa", "100": "#f5f5f5", "200": "#e5e5e5", "300": "#d4d4d4",
      "400": "#a3a3a3", "500": "#737373", "600": "#525252", "700": "#404040",
      "800": "#262626", "900": "#171717", "950": "#0a0a0a",
    },
    success: { "500": "#22c55e", "600": "#16a34a" },
    warning: { "500": "#eab308", "600": "#ca8a04" },
    error: { "500": "#ef4444", "600": "#dc2626" },
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
    generated_at: new Date().toISOString(),
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
    const themeFiles = findFiles(files, ["*theme*", "*token*", "*tailwind*", "*variables*", "*.css"]);
    if (themeFiles.length > 0) {
      tokens.source_theme_files = themeFiles.slice(0, 15).map(f => f.path);
    }
  }

  return {
    path: ".ai/design-tokens.json",
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
  lines.push(`   Theme — ${ctx.project_identity.name}`);
  lines.push("   Auto-generated by Axis Theme. Edit tokens, not this file.");
  lines.push("   ========================================================================== */");
  lines.push("");

  // ─── Project snapshot comment ────────────────────────────────
  const fwStack = ctx.detection.frameworks.slice(0, 4).map(f => f.name).join(", ") || "—";
  const totalLoc = ctx.detection.languages.reduce((sum, l) => sum + (l.loc ?? 0), 0);
  const getCount = ctx.routes.filter(r => r.method === "GET").length;
  const postCount = ctx.routes.filter(r => r.method === "POST").length;
  lines.push("/* ─── Project Snapshot ──────────────────────────────────────");
  lines.push(`   Name:        ${ctx.project_identity.name}`);
  lines.push(`   Type:        ${ctx.project_identity.type.replace(/_/g, " ")}`);
  lines.push(`   Language:    ${ctx.project_identity.primary_language}`);
  lines.push(`   Stack:       ${fwStack}`);
  if (totalLoc > 0) {
    lines.push(`   Total LOC:   ${totalLoc.toLocaleString()}`);
  }
  if (ctx.routes.length > 0) {
    lines.push(`   Routes:      ${ctx.routes.length} (${getCount} GET · ${postCount} POST)`);
  }
  if (ctx.domain_models.length > 0) {
    lines.push(`   Models:      ${ctx.domain_models.length} domain models`);
  }
  lines.push("   ─────────────────────────────────────────────────────── */");
  lines.push("");

  // CSS Custom Properties (light theme)
  lines.push(":root {");
  lines.push("  /* Colors — Primary */");
  lines.push("  --color-primary-50: #eff6ff;");
  lines.push("  --color-primary-100: #dbeafe;");
  lines.push("  --color-primary-200: #bfdbfe;");
  lines.push("  --color-primary-300: #93c5fd;");
  lines.push("  --color-primary-400: #60a5fa;");
  lines.push("  --color-primary-500: #3b82f6;");
  lines.push("  --color-primary-600: #2563eb;");
  lines.push("  --color-primary-700: #1d4ed8;");
  lines.push("  --color-primary-800: #1e40af;");
  lines.push("  --color-primary-900: #1e3a8a;");
  lines.push("");
  lines.push("  /* Colors — Neutral */");
  lines.push("  --color-neutral-50: #fafafa;");
  lines.push("  --color-neutral-100: #f5f5f5;");
  lines.push("  --color-neutral-200: #e5e5e5;");
  lines.push("  --color-neutral-300: #d4d4d4;");
  lines.push("  --color-neutral-400: #a3a3a3;");
  lines.push("  --color-neutral-500: #737373;");
  lines.push("  --color-neutral-600: #525252;");
  lines.push("  --color-neutral-700: #404040;");
  lines.push("  --color-neutral-800: #262626;");
  lines.push("  --color-neutral-900: #171717;");
  lines.push("");
  lines.push("  /* Colors — Semantic */");
  lines.push("  --color-success: #22c55e;");
  lines.push("  --color-warning: #eab308;");
  lines.push("  --color-error: #ef4444;");
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
  lines.push("  /* Surfaces */");
  lines.push("  --surface-page: var(--color-neutral-50);");
  lines.push("  --surface-card: #ffffff;");
  lines.push("  --surface-elevated: #ffffff;");
  lines.push("  --surface-inset: var(--color-neutral-100);");
  lines.push("  --surface-overlay-backdrop: rgba(0, 0, 0, 0.4);");
  lines.push("");
  lines.push("  /* Focus Ring */");
  lines.push("  --ring-color: var(--color-primary-500);");
  lines.push("  --ring-offset: 2px;");
  lines.push("  --ring-width: 2px;");
  lines.push("}");
  lines.push("");

  // Dark theme
  lines.push("@media (prefers-color-scheme: dark) {");
  lines.push("  :root {");
  lines.push("    --color-primary-50: #172554;");
  lines.push("    --color-primary-100: #1e3a8a;");
  lines.push("    --color-primary-500: #60a5fa;");
  lines.push("    --color-primary-600: #93c5fd;");
  lines.push("    --color-neutral-50: #0a0a0a;");
  lines.push("    --color-neutral-100: #171717;");
  lines.push("    --color-neutral-200: #262626;");
  lines.push("    --color-neutral-800: #f5f5f5;");
  lines.push("    --color-neutral-900: #fafafa;");
  lines.push("    --surface-page: #0a0a0a;");
  lines.push("    --surface-card: #171717;");
  lines.push("    --surface-elevated: #262626;");
  lines.push("    --surface-inset: #0f0f0f;");
  lines.push("    --surface-overlay-backdrop: rgba(0, 0, 0, 0.7);");
  lines.push("  }");
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

  // ─── Domain-model component stubs ────────────────────────────
  if (ctx.domain_models.length > 0) {
    lines.push("/* ─── Domain Model Component Scaffolds ───────────────────── */");
    lines.push("/*     Auto-derived from project domain models.               */");
    lines.push("/*     Rename and extend these for your actual components.     */");
    lines.push("");
    for (const model of ctx.domain_models.slice(0, 8)) {
      const slug = model.name
        .replace(/([a-z])([A-Z])/g, "$1-$2")
        .toLowerCase();
      lines.push(`/* ${model.name} — ${model.kind} (${model.field_count} fields) */`);
      lines.push(`.${slug}-card {`);
      lines.push("  background: var(--surface-card);");
      lines.push("  border: 1px solid var(--color-neutral-200);");
      lines.push("  border-radius: var(--radius-lg);");
      lines.push("  padding: var(--space-4);");
      lines.push("}");
      lines.push(`.${slug}-surface {`);
      lines.push("  background: var(--surface-elevated);");
      lines.push("  border-radius: var(--radius-md);");
      lines.push("  box-shadow: var(--shadow-sm);");
      lines.push("}");
      lines.push("");
    }
  }

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const cssFiles = findFiles(files, ["*.css", "*.scss", "*.less", "*tailwind*"]);
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
  const frameworks = ctx.detection.frameworks.map(f => f.name);
  const treeFiles = ctx.structure.file_tree_summary;
  const lines: string[] = [];

  // Detect styling signals
  const hasTailwind = treeFiles.some(f => f.path.includes("tailwind.config"));
  const hasCssModules = treeFiles.some(f => f.path.endsWith(".module.css") || f.path.endsWith(".module.scss"));
  const hasStyledComponents = ctx.dependency_graph.external_dependencies.some(
    d => d.name === "styled-components" || d.name === "@emotion/styled",
  );

  lines.push(`# Theme Guidelines — ${id.name}`);
  lines.push("");
  lines.push(`> Design system rules for a ${id.type.replace(/_/g, " ")} built with ${id.primary_language}`);
  lines.push("");

  // Project Overview
  if (ctx.ai_context.project_summary) {
    lines.push("## Project Overview");
    lines.push("");
    lines.push(ctx.ai_context.project_summary);
    lines.push("");
  }

  // Stack Reference
  if (ctx.detection.frameworks.length > 0) {
    lines.push("## Detected Stack");
    lines.push("");
    lines.push("| Framework | Version | Confidence |");
    lines.push("|-----------|---------|------------|");
    for (const fw of ctx.detection.frameworks) {
      lines.push(`| ${fw.name} | ${fw.version ?? "—"} | ${(fw.confidence * 100).toFixed(0)}% |`);
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
      lines.push(`- **${l.layer}**: ${l.directories.join(", ")}`);
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
  lines.push("| Context | Token Range | Example |");
  lines.push("|---------|------------|---------|");
  lines.push("| Background (light) | neutral-50 to neutral-100 | Page backgrounds, cards |");
  lines.push("| Background (dark) | neutral-800 to neutral-900 | Dark mode surfaces |");
  lines.push("| Text (primary) | neutral-900 / neutral-50 (dark) | Body text |");
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
  lines.push("- Heading scale: h1=4xl, h2=3xl, h3=2xl, h4=xl, h5=lg, h6=base");
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
  const componentFiles = treeFiles.filter(f =>
    f.path.includes("component") || f.path.includes("Component") ||
    (f.path.endsWith(".tsx") && !f.path.includes("page") && !f.path.includes("layout") && !f.path.includes("route")),
  );
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
    if (reactFw?.version) lines.push(`> Detected: ${reactFw.name} ${reactFw.version}`);
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
    if (vueFw?.version) lines.push(`> Detected: Vue ${vueFw.version}`);
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

  // Route-Aware Theme Zones
  if (ctx.routes.length > 0) {
    lines.push("## Route Theme Zones");
    lines.push("");
    lines.push("Routes detected — consider zone-based theming:");
    lines.push("");
    for (const r of ctx.routes.slice(0, 12)) {
      lines.push(`- \`${r.path}\` (${r.method}) → ${r.source_file}`);
    }
    if (ctx.routes.length > 12) lines.push(`- … and ${ctx.routes.length - 12} more routes`);
    lines.push("");
  }

  // Domain-Model-Aware Token Naming
  if (ctx.domain_models.length > 0) {
    lines.push("## Domain-Specific Tokens");
    lines.push("");
    lines.push("Consider extending the token system for domain entity states:");
    lines.push("");
    for (const m of ctx.domain_models.slice(0, 8)) {
      lines.push(`- **${m.name}** (${m.kind}): ${m.field_count} fields — ${m.source_file}`);
    }
    lines.push("");
  }

  // Warnings
  if (ctx.ai_context.warnings.length > 0) {
    lines.push("## Warnings");
    lines.push("");
    for (const w of ctx.ai_context.warnings) {
      lines.push(`> ⚠ ${w}`);
    }
    lines.push("");
  }

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const styleFiles = findFiles(files, ["*.css", "*.scss", "*.less", "*tailwind*", "*theme*", "*token*"]);
    if (styleFiles.length > 0) {
      lines.push("## Detected Style Files");
      lines.push("");
      for (const sf of styleFiles.slice(0, 10)) {
        lines.push(`- \`${sf.path}\` (${sf.content.split("\n").length} lines)`);
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
        lines.push(`| \`${cf.path}\` | ${exports.join(", ") || "default"} | ${cf.content.split("\n").length} |`);
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
  const treeFiles = ctx.structure.file_tree_summary;

  // Find component files
  const componentFiles = treeFiles.filter(f =>
    f.type === "file" &&
    (f.path.endsWith(".tsx") || f.path.endsWith(".vue") || f.path.endsWith(".svelte")) &&
    !f.path.includes("test") && !f.path.includes("spec") &&
    !f.path.includes("node_modules"),
  );

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
    generated_at: new Date().toISOString(),
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
  const hasTailwind = hasFw(ctx, "Tailwind CSS", "tailwind");

  // Generate a full dark mode token set derived from the project context
  const tokens = {
    project: id.name,
    generated_at: new Date().toISOString(),
    scheme: "dark",
    detected_stack: {
      frameworks: ctx.detection.frameworks.map(f => `${f.name}${f.version ? " " + f.version : ""}`),
      primary_language: id.primary_language,
      project_type: id.type,
    },
    colors: {
      background: {
        base: "#0f172a",
        surface: "#1e293b",
        elevated: "#334155",
        overlay: "rgba(0, 0, 0, 0.6)",
      },
      foreground: {
        primary: "#f8fafc",
        secondary: "#94a3b8",
        muted: "#64748b",
        inverse: "#0f172a",
      },
      brand: {
        primary: "#38bdf8",
        "primary-hover": "#7dd3fc",
        secondary: "#fb923c",
        "secondary-hover": "#fdba74",
        accent: "#a78bfa",
      },
      semantic: {
        success: "#4ade80",
        "success-bg": "rgba(74, 222, 128, 0.1)",
        warning: "#fbbf24",
        "warning-bg": "rgba(251, 191, 36, 0.1)",
        error: "#f87171",
        "error-bg": "rgba(248, 113, 113, 0.1)",
        info: "#60a5fa",
        "info-bg": "rgba(96, 165, 250, 0.1)",
      },
      border: {
        default: "#334155",
        focus: "#38bdf8",
        subtle: "#1e293b",
      },
    },
    surfaces: {
      page: { bg: "#0a0a0a", text: "#fafafa", border: "#262626" },
      card: { bg: "#171717", text: "#f5f5f5", border: "#262626", shadow: "0 1px 3px rgba(0,0,0,0.4)" },
      elevated: { bg: "#262626", text: "#f5f5f5", border: "#404040", shadow: "0 10px 15px rgba(0,0,0,0.5)" },
      inset: { bg: "#0f0f0f", text: "#d4d4d4", border: "#262626" },
      overlay: { bg: "#171717", text: "#fafafa", shadow: "0 10px 15px rgba(0,0,0,0.6)", backdrop: "rgba(0,0,0,0.7)" },
    },
    shadows: {
      sm: "0 1px 2px rgba(0, 0, 0, 0.3)",
      md: "0 4px 6px rgba(0, 0, 0, 0.4)",
      lg: "0 10px 15px rgba(0, 0, 0, 0.5)",
      glow: "0 0 20px rgba(56, 189, 248, 0.15)",
    },
    motion: {
      note: "Dark mode may warrant subtler motion. Reduce glow/shadow transitions in dark contexts.",
      transition_overrides: {
        shadow_transition: "box-shadow 200ms ease",
        glow_on_focus: "0 0 0 3px rgba(56, 189, 248, 0.25)",
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
        example: "--color-bg-base: #0f172a",
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
    const darkFiles = findFiles(files, ["*dark*", "*theme*", "*color*", "*.css", "*.scss"]);
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
