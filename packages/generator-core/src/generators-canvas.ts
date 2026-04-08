import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { GeneratedFile } from "./types.js";
import { hasFw, getFw } from "./fw-helpers.js";

// ─── canvas-spec.json ───────────────────────────────────────────

export function generateCanvasSpec(ctx: ContextMap, profile: RepoProfile): GeneratedFile {
  const id = ctx.project_identity;
  const frameworks = ctx.detection.frameworks.map(f => f.name);
  const languages = ctx.detection.languages;

  const brandColors = {
    primary: "#6366f1",
    secondary: "#8b5cf6",
    accent: "#06b6d4",
    background: "#0f172a",
    surface: "#1e293b",
    text: "#f8fafc",
    muted: "#94a3b8",
  };

  const spec = {
    project: id.name,
    generated_at: new Date().toISOString(),
    design_system: {
      colors: brandColors,
      typography: {
        heading: { family: "Inter", weight: 700, sizes: [48, 36, 28, 24] },
        body: { family: "Inter", weight: 400, sizes: [16, 14, 12] },
        code: { family: "JetBrains Mono", weight: 400, sizes: [14, 12] },
      },
      spacing: { unit: 8, scale: [4, 8, 12, 16, 24, 32, 48, 64] },
      border_radius: { sm: 4, md: 8, lg: 12, xl: 16 },
    },
    templates: [
      {
        id: "social-og",
        name: "Open Graph Image",
        width: 1200,
        height: 630,
        use_case: "Social media sharing (Twitter, LinkedIn, Facebook)",
        layers: ["background", "logo", "title", "subtitle", "tech-badges"],
      },
      {
        id: "social-square",
        name: "Square Social Post",
        width: 1080,
        height: 1080,
        use_case: "Instagram, social media feeds",
        layers: ["background", "header", "stats-grid", "footer"],
      },
      {
        id: "poster-a4",
        name: "A4 Poster",
        width: 2480,
        height: 3508,
        use_case: "Print-ready poster, presentations",
        layers: ["background", "hero", "architecture-diagram", "stats", "footer"],
      },
      {
        id: "banner-wide",
        name: "Wide Banner",
        width: 1920,
        height: 480,
        use_case: "GitHub readme, website hero",
        layers: ["background", "gradient", "title", "description", "badges"],
      },
    ],
    data_bindings: {
      title: id.name,
      subtitle: id.description,
      type: id.type,
      language: id.primary_language,
      project_summary: ctx.ai_context.project_summary,
      frameworks: ctx.detection.frameworks.map(f => ({
        name: f.name,
        version: f.version ?? null,
        confidence: f.confidence,
      })),
      framework_names: frameworks,
      language_stats: languages.map(l => ({ name: l.name, percent: l.loc_percent, loc: l.loc })),
      architecture_score: ctx.architecture_signals.separation_score,
      patterns: ctx.architecture_signals.patterns_detected,
      layer_boundaries: ctx.architecture_signals.layer_boundaries,
      entry_point_count: ctx.entry_points.length,
      hotspot_count: ctx.dependency_graph.hotspots.length,
      domain_model_count: ctx.domain_models.length,
      route_count: ctx.routes.length,
      total_files: ctx.structure.total_files,
      total_loc: ctx.structure.total_loc,
    },
  };

  return {
    path: "canvas-spec.json",
    content: JSON.stringify(spec, null, 2),
    content_type: "application/json",
    program: "canvas",
    description: "Canvas design specification with templates, design system, and data bindings",
  };
}

// ─── social-pack.md ─────────────────────────────────────────────

export function generateSocialPack(ctx: ContextMap): GeneratedFile {
  const id = ctx.project_identity;
  const frameworks = ctx.detection.frameworks.map(f => f.name);
  const languages = ctx.detection.languages;

  const lines: string[] = [];

  lines.push(`# Social Pack — ${id.name}`);
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  if (ctx.ai_context.project_summary) {
    lines.push("## Project Summary");
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

  lines.push("## Open Graph Image (1200×630)");
  lines.push("");
  lines.push("### Layout");
  lines.push("```");
  lines.push("┌──────────────────────────────────────────┐");
  lines.push("│  [gradient background]                    │");
  lines.push("│                                           │");
  lines.push(`│     ${id.name}                            │`);
  lines.push(`│     ${(id.description ?? "").slice(0, 50)}...     │`);
  lines.push("│                                           │");
  lines.push(`│     [${frameworks.slice(0, 4).join("] [")}]    │`);
  lines.push("│                                           │");
  lines.push("│     Powered by AXIS Toolbox               │");
  lines.push("└──────────────────────────────────────────┘");
  lines.push("```");
  lines.push("");

  lines.push("### Copy Variants");
  lines.push("");
  lines.push(`1. **Technical**: "${id.name} — ${id.type} built with ${id.primary_language}"`);
  lines.push(`2. **Marketing**: "${id.name}: ${id.description}"`);
  lines.push(`3. **Minimal**: "${id.name}"`);
  lines.push("");

  lines.push("## Square Post (1080×1080)");
  lines.push("");
  lines.push("### Content");
  lines.push("");
  lines.push("| Stat | Value |");
  lines.push("|------|-------|");
  for (const lang of languages.slice(0, 3)) {
    lines.push(`| ${lang.name} | ${lang.loc_percent}% |`);
  }
  lines.push(`| Frameworks | ${frameworks.length} |`);
  lines.push(`| Architecture Score | ${ctx.architecture_signals.separation_score}/100 |`);
  lines.push("");

  lines.push("## Twitter/X Card");
  lines.push("");
  lines.push("### Thread Template");
  lines.push("");
  lines.push(`🧵 1/ Just analyzed ${id.name} with @AxisToolbox`);
  lines.push("");
  lines.push(`📊 2/ Tech stack: ${frameworks.slice(0, 3).join(", ") || id.primary_language}`);
  lines.push(`Architecture score: ${ctx.architecture_signals.separation_score}/100`);
  lines.push("");
  lines.push(`🔍 3/ Found ${ctx.entry_points.length} entry points and ${ctx.dependency_graph.hotspots.length} hotspots`);
  lines.push("");
  lines.push(`🎯 4/ Key patterns: ${ctx.architecture_signals.patterns_detected.slice(0, 3).join(", ") || "Custom architecture"}`);
  lines.push("");

  lines.push("## LinkedIn Post");
  lines.push("");
  lines.push(`📋 Project Analysis: ${id.name}`);
  lines.push("");
  lines.push(`I ran ${id.name} through AXIS Toolbox and here's what it found:`);
  lines.push("");
  lines.push(`• Type: ${id.type}`);
  lines.push(`• Primary Language: ${id.primary_language}`);
  lines.push(`• Frameworks: ${frameworks.join(", ") || "None"}`);
  lines.push(`• Architecture Score: ${ctx.architecture_signals.separation_score}/100`);
  lines.push("");

  return {
    path: "social-pack.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "canvas",
    description: "Social media templates with layouts, copy variants, and thread templates",
  };
}

// ─── poster-layouts.md ──────────────────────────────────────────

export function generatePosterLayouts(ctx: ContextMap): GeneratedFile {
  const id = ctx.project_identity;
  const frameworks = ctx.detection.frameworks.map(f => f.name);
  const languages = ctx.detection.languages;
  const patterns = ctx.architecture_signals.patterns_detected;
  const layers = ctx.architecture_signals.layer_boundaries;

  const lines: string[] = [];

  lines.push(`# Poster Layouts — ${id.name}`);
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  lines.push("## Layout A: Tech Overview (A4 Portrait)");
  lines.push("");
  lines.push("### Zones");
  lines.push("```");
  lines.push("┌─────────────────────────┐");
  lines.push("│      HERO ZONE          │  ← Project name, logo, tagline");
  lines.push("│                         │");
  lines.push("├─────────────────────────┤");
  lines.push("│  STATS    │  LANGUAGE   │  ← Key metrics, language pie chart");
  lines.push("│  GRID     │  BREAKDOWN  │");
  lines.push("├─────────────────────────┤");
  lines.push("│      ARCHITECTURE       │  ← Patterns, layers, score");
  lines.push("│      DIAGRAM            │");
  lines.push("├─────────────────────────┤");
  lines.push("│  FRAMEWORK BADGES       │  ← Tech stack badges");
  lines.push("├─────────────────────────┤");
  lines.push("│      FOOTER             │  ← AXIS branding, date");
  lines.push("└─────────────────────────┘");
  lines.push("```");
  lines.push("");

  lines.push("### Data for Zones");
  lines.push("");
  lines.push("**Hero Zone**");
  lines.push(`- Title: ${id.name}`);
  lines.push(`- Subtitle: ${id.description}`);
  lines.push(`- Type Badge: ${id.type}`);
  lines.push("");
  lines.push("**Stats Grid**");
  lines.push(`- Entry Points: ${ctx.entry_points.length}`);
  lines.push(`- Hotspots: ${ctx.dependency_graph.hotspots.length}`);
  lines.push(`- Architecture Score: ${ctx.architecture_signals.separation_score}/100`);
  lines.push(`- Dependencies: ${ctx.dependency_graph.external_dependencies.length}`);
  lines.push("");
  lines.push("**Language Breakdown**");
  for (const lang of languages) {
    lines.push(`- ${lang.name}: ${lang.loc_percent}% (${lang.loc} LOC)`);
  }
  lines.push("");

  if (patterns.length > 0 || layers.length > 0) {
    lines.push("**Architecture Diagram**");
    if (patterns.length > 0) {
      lines.push(`- Patterns: ${patterns.join(", ")}`);
    }
    if (layers.length > 0) {
      for (const l of layers) {
        lines.push(`- ${l.layer}: ${l.directories.join(", ")}`);
      }
    }
    lines.push("");
  }

  lines.push("**Framework Badges**");
  for (const fw of ctx.detection.frameworks) {
    lines.push(`- ${fw.name}${fw.version ? " " + fw.version : ""}`);
  }
  lines.push("");

  if (ctx.domain_models.length > 0) {
    lines.push("**Domain Models**");
    for (const m of ctx.domain_models.slice(0, 6)) {
      lines.push(`- ${m.name} (${m.kind}, ${m.field_count} fields)`);
    }
    lines.push("");
  }

  lines.push("## Layout B: Minimal Card (Landscape)");
  lines.push("");
  lines.push("### Zones");
  lines.push("```");
  lines.push("┌──────────────────────────────────────────┐");
  lines.push("│  LOGO  │  PROJECT NAME & TYPE  │  SCORE  │");
  lines.push("│        │  Framework badges      │  ##/100 │");
  lines.push("└──────────────────────────────────────────┘");
  lines.push("```");
  lines.push("");
  lines.push(`- Name: ${id.name}`);
  lines.push(`- Type: ${id.type}`);
  lines.push(`- Score: ${ctx.architecture_signals.separation_score}/100`);
  lines.push(`- Badges: ${frameworks.join(", ") || id.primary_language}`);
  lines.push("");

  lines.push("## Layout C: Data Dashboard");
  lines.push("");
  lines.push("### Zones");
  lines.push("```");
  lines.push("┌────────────┬────────────┬────────────┐");
  lines.push("│  LANGUAGES │ FRAMEWORKS │  HOTSPOTS  │");
  lines.push("│  pie chart │   list     │   table    │");
  lines.push("├────────────┴────────────┴────────────┤");
  lines.push("│         DEPENDENCY GRAPH              │");
  lines.push("│         (node visualization)          │");
  lines.push("└──────────────────────────────────────┘");
  lines.push("```");
  lines.push("");

  return {
    path: "poster-layouts.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "canvas",
    description: "Poster layout templates with zones, data bindings, and visual structure",
  };
}

// ─── asset-guidelines.md ────────────────────────────────────────

export function generateCanvasAssetGuidelines(ctx: ContextMap): GeneratedFile {
  const id = ctx.project_identity;
  const frameworks = ctx.detection.frameworks.map(f => f.name);

  const lines: string[] = [];

  lines.push(`# Asset Guidelines — ${id.name}`);
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  lines.push("## Color System");
  lines.push("");
  lines.push("| Role | Hex | Usage |");
  lines.push("|------|-----|-------|");
  lines.push("| Primary | #6366f1 | CTAs, links, active states |");
  lines.push("| Secondary | #8b5cf6 | Gradients, accents |");
  lines.push("| Accent | #06b6d4 | Highlights, badges |");
  lines.push("| Background | #0f172a | Dark canvas base |");
  lines.push("| Surface | #1e293b | Cards, panels |");
  lines.push("| Text | #f8fafc | Primary text |");
  lines.push("| Muted | #94a3b8 | Secondary text, labels |");
  lines.push("");

  lines.push("## Typography");
  lines.push("");
  lines.push("| Level | Font | Weight | Size |");
  lines.push("|-------|------|--------|------|");
  lines.push("| H1 | Inter | 700 | 48px |");
  lines.push("| H2 | Inter | 700 | 36px |");
  lines.push("| H3 | Inter | 700 | 28px |");
  lines.push("| Body | Inter | 400 | 16px |");
  lines.push("| Code | JetBrains Mono | 400 | 14px |");
  lines.push("| Caption | Inter | 400 | 12px |");
  lines.push("");

  lines.push("## Icon & Badge Rules");
  lines.push("");
  lines.push("- Framework badges: pill shape, accent background, white text");
  lines.push("- Stat icons: 24×24, stroke style, muted color");
  lines.push("- Logo: SVG preferred, minimum 32×32 display size");
  lines.push("- Separator lines: 1px, muted color, 50% opacity");
  lines.push("");

  lines.push("## Required Assets");
  lines.push("");
  lines.push("### Logos & Icons");
  lines.push(`- [ ] ${id.name} logo (SVG, light + dark variants)`);
  lines.push("- [ ] AXIS Toolbox watermark (SVG, low opacity)");
  for (const fw of frameworks.slice(0, 6)) {
    lines.push(`- [ ] ${fw} icon (SVG or PNG)`);
  }
  lines.push("");

  lines.push("### Backgrounds");
  lines.push("- [ ] Dark gradient (primary → secondary, 135deg)");
  lines.push("- [ ] Noise texture overlay (PNG, 5% opacity)");
  lines.push("- [ ] Grid pattern (SVG, muted color, 10% opacity)");
  lines.push("");

  lines.push("## Export Specifications");
  lines.push("");
  lines.push("| Format | DPI | Color Space | Use Case |");
  lines.push("|--------|-----|-------------|----------|");
  lines.push("| PNG | 72 | sRGB | Web, social media |");
  lines.push("| PNG | 300 | sRGB | Print |");
  lines.push("| SVG | — | sRGB | Scalable assets |");
  lines.push("| WebP | 72 | sRGB | Web (optimized) |");
  lines.push("| PDF | 300 | CMYK | Print-ready |");
  lines.push("");

  lines.push("## Spacing & Layout");
  lines.push("");
  lines.push("- Base unit: 8px");
  lines.push("- Margins: 32px (desktop), 16px (social)");
  lines.push("- Card padding: 24px");
  lines.push("- Badge padding: 8px 16px");
  lines.push("- Section gap: 32px");
  lines.push("- Border radius: 8px (cards), 4px (badges)");
  lines.push("");

  return {
    path: "asset-guidelines.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "canvas",
    description: "Design asset guidelines with colors, typography, spacing, and export specifications",
  };
}

// ─── brand-board.md ─────────────────────────────────────────────

export function generateBrandBoard(ctx: ContextMap): GeneratedFile {
  const id = ctx.project_identity;
  const frameworks = ctx.detection.frameworks;
  const languages = ctx.detection.languages;
  const deps = ctx.dependency_graph.external_dependencies;
  const abstractions = ctx.ai_context.key_abstractions;

  const lines: string[] = [];
  lines.push(`# Brand Board — ${id.name}`);
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("Comprehensive visual identity reference for all project-branded outputs.");
  lines.push("");

  if (ctx.ai_context.project_summary) {
    lines.push("## Project Summary");
    lines.push("");
    lines.push(ctx.ai_context.project_summary);
    lines.push("");
  }

  // Color Palette
  lines.push("## Color Palette");
  lines.push("");
  lines.push("### Primary Colors");
  lines.push("");
  lines.push("| Role | Hex | HSL | Usage |");
  lines.push("|------|-----|-----|-------|");
  lines.push("| Brand Primary | `#2563EB` | 217° 91% 53% | Headers, CTAs, primary actions |");
  lines.push("| Brand Secondary | `#7C3AED` | 263° 83% 58% | Accents, secondary labels |");
  lines.push("| Brand Accent | `#06B6D4` | 188° 95% 43% | Links, highlights, interactive |");
  lines.push("");
  lines.push("### Semantic Colors");
  lines.push("");
  lines.push("| Role | Light | Dark | Usage |");
  lines.push("|------|-------|------|-------|");
  lines.push("| Success | `#16A34A` | `#22C55E` | Passing tests, healthy metrics |");
  lines.push("| Warning | `#D97706` | `#FBBF24` | Risk indicators, cautions |");
  lines.push("| Error | `#DC2626` | `#EF4444` | Failures, critical hotspots |");
  lines.push("| Info | `#2563EB` | `#60A5FA` | Neutral information |");
  lines.push("");
  lines.push("### Neutrals");
  lines.push("");
  lines.push("| Weight | Hex | Usage |");
  lines.push("|--------|-----|-------|");
  lines.push("| 50 | `#F8FAFC` | Page background |");
  lines.push("| 100 | `#F1F5F9` | Card background |");
  lines.push("| 300 | `#CBD5E1` | Borders |");
  lines.push("| 500 | `#64748B` | Body text (secondary) |");
  lines.push("| 700 | `#334155` | Body text (primary) |");
  lines.push("| 900 | `#0F172A` | Headings |");
  lines.push("| 950 | `#020617` | Dark mode background |");
  lines.push("");

  // Typography
  lines.push("## Typography");
  lines.push("");
  lines.push("| Role | Family | Weight | Size | Line Height |");
  lines.push("|------|--------|--------|------|-------------|");
  lines.push("| Display | Inter | 800 | 48px / 3rem | 1.1 |");
  lines.push("| Heading 1 | Inter | 700 | 36px / 2.25rem | 1.2 |");
  lines.push("| Heading 2 | Inter | 600 | 24px / 1.5rem | 1.3 |");
  lines.push("| Heading 3 | Inter | 600 | 20px / 1.25rem | 1.4 |");
  lines.push("| Body | Inter | 400 | 16px / 1rem | 1.6 |");
  lines.push("| Small | Inter | 400 | 14px / 0.875rem | 1.5 |");
  lines.push("| Code | JetBrains Mono | 400 | 14px / 0.875rem | 1.7 |");
  lines.push("| Caption | Inter | 500 | 12px / 0.75rem | 1.5 |");
  lines.push("");

  // Logo Usage
  lines.push("## Logo & Mark");
  lines.push("");
  lines.push(`### Project: ${id.name}`);
  lines.push("");
  lines.push("| Variant | Usage | Min Size | Clear Space |");
  lines.push("|---------|-------|----------|-------------|");
  lines.push("| Full Logo | Hero, splash, docs header | 120px wide | 1× mark height |");
  lines.push("| Mark Only | Favicon, avatar, small UI | 24px | 0.5× mark width |");
  lines.push("| Wordmark | Inline references, footer | 80px wide | 0.5× cap height |");
  lines.push("");
  lines.push("**Forbidden**: Don't stretch, rotate, recolor, add effects, or place on busy backgrounds.");
  lines.push("");

  // Imagery Direction
  lines.push("## Imagery & Illustration");
  lines.push("");
  lines.push("### Style Keywords");
  lines.push("");
  const styleKeywords = [
    "Clean", "Technical", "Precise", "Structured",
    id.primary_language, ...frameworks.slice(0, 2).map(f => f.name),
  ];
  lines.push(styleKeywords.map(k => `\`${k}\``).join(" · "));
  lines.push("");
  lines.push("### Visual Language");
  lines.push("");
  lines.push("| Element | Guideline |");
  lines.push("|---------|-----------|");
  lines.push("| Diagrams | Use brand colors, 2px strokes, rounded corners (8px) |");
  lines.push("| Screenshots | Full-bleed or device-framed, light + dark variants |");
  lines.push("| Icons | Outline style, 24px base grid, 1.5px stroke |");
  lines.push("| Charts | Brand-primary for primary series, secondary for comparisons |");
  lines.push("| Code blocks | Dark theme (slate-950 bg), syntax highlighting with brand accent |");
  lines.push("");

  // Tech Identity
  lines.push("## Tech Identity Elements");
  lines.push("");
  lines.push("### Stack Badge Bar");
  lines.push("");
  for (const fw of frameworks.slice(0, 6)) {
    lines.push(`- \`${fw.name}\``);
  }
  for (const l of languages.slice(0, 3)) {
    lines.push(`- \`${l.name}\` — ${l.loc_percent.toFixed(0)}% of codebase`);
  }
  lines.push("");

  if (abstractions.length > 0) {
    lines.push("### Key Abstractions for Branding");
    lines.push("");
    for (const a of abstractions.slice(0, 5)) {
      lines.push(`- **${a}** — candidate for conceptual branding element`);
    }
    lines.push("");
  }

  if (ctx.domain_models.length > 0) {
    lines.push("### Domain Models");
    lines.push("");
    lines.push("Consider domain-specific iconography for:");
    lines.push("");
    for (const m of ctx.domain_models.slice(0, 6)) {
      lines.push(`- **${m.name}** (${m.kind}) — ${m.field_count} fields, from ${m.source_file}`);
    }
    lines.push("");
  }

  if (ctx.ai_context.warnings.length > 0) {
    lines.push("### Brand Warnings");
    lines.push("");
    for (const w of ctx.ai_context.warnings) {
      lines.push(`> ⚠ ${w}`);
    }
    lines.push("");
  }

  // Spacing & Layout Tokens
  lines.push("## Spacing & Layout Tokens");
  lines.push("");
  lines.push("| Token | Value | Usage |");
  lines.push("|-------|-------|-------|");
  lines.push("| `space-xs` | 4px | Tight gaps, icon padding |");
  lines.push("| `space-sm` | 8px | Inline spacing |");
  lines.push("| `space-md` | 16px | Component padding |");
  lines.push("| `space-lg` | 24px | Section gaps |");
  lines.push("| `space-xl` | 32px | Layout margins |");
  lines.push("| `space-2xl` | 48px | Page sections |");
  lines.push("| `radius-sm` | 4px | Buttons, inputs |");
  lines.push("| `radius-md` | 8px | Cards |");
  lines.push("| `radius-lg` | 16px | Modals, panels |");
  lines.push("| `radius-full` | 9999px | Avatars, badges |");
  lines.push("");

  // Social / OG Templates
  lines.push("## Social & OG Image Templates");
  lines.push("");
  lines.push("| Template | Size | Elements |");
  lines.push("|----------|------|----------|");
  lines.push(`| OG Image | 1200×630 | Brand bg, "${id.name}" heading, description, stack badges |`);
  lines.push(`| Twitter Card | 1200×600 | Brand gradient, project mark, tagline |`);
  lines.push("| GitHub Social | 1280×640 | Minimal, mark + wordmark centered |");
  lines.push("| LinkedIn Banner | 1584×396 | Brand gradient, wordmark left-aligned |");
  lines.push("");

  return {
    path: "brand-board.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "canvas",
    description: "Comprehensive visual identity board with colors, typography, logos, and imagery direction",
  };
}
