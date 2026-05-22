import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { GeneratedFile, SourceFile } from "./types.js";
import { hasFw, getFw } from "./fw-helpers.js";
import { findFiles, findFile, findEntryPoints, findConfigs, renderExcerpts, extractExports } from "./file-excerpt-utils.js";

// ─── generated-component.tsx ────────────────────────────────────

export function generateComponent(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const frameworks = ctx.detection.frameworks.map(f => f.name);
  const isReact = hasFw(ctx, "React", "Next.js");
  const isSvelte = hasFw(ctx, "Svelte", "SvelteKit");
  const isVue = hasFw(ctx, "Vue", "Nuxt");
  const componentName = id.name.replace(/[^a-zA-Z0-9]/g, "");
  const models = ctx.domain_models;
  const conventions = ctx.ai_context.conventions;

  const lines: string[] = [];

  if (isSvelte) {
    // ─── Svelte component ───
    lines.push(`<!-- Generated component scaffold for ${id.name} -->`);
    lines.push(`<script lang="ts">`);
    lines.push(`  export let title = "${id.name}";`);
    lines.push(`  export let className = "";`);
    lines.push(`</script>`);
    lines.push("");
    lines.push(`<div class="${componentName.toLowerCase()}-container {className}">`);
    lines.push(`  <h2>{title}</h2>`);
    lines.push(`  <div class="${componentName.toLowerCase()}-content">`);
    lines.push(`    <slot />`);
    lines.push(`  </div>`);
    lines.push(`</div>`);
    lines.push("");
    lines.push(`<style>`);
    lines.push(`  .${componentName.toLowerCase()}-container { padding: 1rem; }`);
    lines.push(`</style>`);
  } else if (isVue) {
    // ─── Vue SFC ───
    lines.push(`<!-- Generated component scaffold for ${id.name} -->`);
    lines.push(`<template>`);
    lines.push(`  <div :class="['${componentName.toLowerCase()}-container', className]">`);
    lines.push(`    <h2 v-if="title">{{ title }}</h2>`);
    lines.push(`    <div class="${componentName.toLowerCase()}-content">`);
    lines.push(`      <slot />`);
    lines.push(`    </div>`);
    lines.push(`  </div>`);
    lines.push(`</template>`);
    lines.push("");
    lines.push(`<script setup lang="ts">`);
    lines.push(`defineProps<{ title?: string; className?: string }>()`);
    lines.push(`</script>`);
  } else if (isReact) {
    lines.push(`import React from "react";`);
    lines.push("");
    lines.push(`interface ${componentName}Props {`);
    lines.push("  title?: string;");
    lines.push("  className?: string;");
    lines.push("  children?: React.ReactNode;");
    lines.push("}");
    lines.push("");
    lines.push(`export function ${componentName}({ title, className, children }: ${componentName}Props) {`);
    lines.push(`  return (`);
    lines.push(`    <div className={\`${componentName.toLowerCase()}-container \${className ?? ""}\`}>`);
    lines.push(`      {title && <h2 className="${componentName.toLowerCase()}-title">{title}</h2>}`);
    lines.push(`      <div className="${componentName.toLowerCase()}-content">`);
    lines.push(`        {children}`);
    lines.push(`      </div>`);
    lines.push(`    </div>`);
    lines.push(`  );`);
    lines.push("}");
    lines.push("");
    lines.push(`export default ${componentName};`);
  } else {
    lines.push(`// Generated component scaffold for ${id.name}`);
    lines.push(`// Language: ${id.primary_language}`);
    lines.push("");
    lines.push(`export interface ${componentName}Config {`);
    lines.push("  title: string;");
    lines.push("  container: HTMLElement;");
    lines.push("}");
    lines.push("");
    lines.push(`export function create${componentName}(config: ${componentName}Config) {`);
    lines.push(`  const el = document.createElement("div");`);
    lines.push(`  el.className = "${componentName.toLowerCase()}-container";`);
    lines.push(`  el.innerHTML = \`<h2>\${config.title}</h2><div class="${componentName.toLowerCase()}-content"></div>\`;`);
    lines.push(`  config.container.appendChild(el);`);
    lines.push(`  return el;`);
    lines.push("}");
  }

  // ─── Domain Model Interfaces ─────────────────────────────────
  if (models.length > 0) {
    lines.push("");
    lines.push("// ─── Domain Model Types (from project analysis) ───");
    for (const m of models.slice(0, 8)) {
      lines.push(`// ${m.name} (${m.kind}, ${m.field_count} fields) — ${m.source_file}`);
    }
  }

  // ─── Detected Conventions ────────────────────────────────────
  if (conventions.length > 0) {
    lines.push("");
    lines.push("// ─── Project Conventions ───");
    for (const c of conventions) {
      lines.push(`// • ${c}`);
    }
  }

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const components = findFiles(files, ["*.tsx", "*.jsx", "*.vue", "*.svelte"])
      .filter(f => !f.path.includes(".test.") && !f.path.includes(".spec."));
    if (components.length > 0) {
      lines.push("");
      lines.push("// ─── Reference: existing components found in project ───");
      for (const c of components.slice(0, 5)) {
        const exports = extractExports(c.content);
        if (exports.length > 0) {
          lines.push(`// ${c.path}: ${exports.join(", ")}`);
        }
      }
    }
  }

  return {
    path: "generated-component.tsx",
    content: lines.join("\n"),
    content_type: "text/typescript",
    program: "artifacts",
    description: `Generated ${isReact ? "React" : "vanilla"} component scaffold for ${id.name}`,
  };
}

// ─── dashboard-widget.tsx ──────────────────────────────────────

export function generateDashboardWidget(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const frameworks = ctx.detection.frameworks.map(f => f.name);
  const languages = ctx.detection.languages;
  const entryPoints = ctx.entry_points;
  const hotspots = ctx.dependency_graph.hotspots;
  const routes = ctx.routes;
  const models = ctx.domain_models;
  const signals = ctx.architecture_signals;
  const isReact = hasFw(ctx, "React", "Next.js");

  const lines: string[] = [];

  if (isReact) {
    lines.push(`import React from "react";`);
    lines.push("");
    lines.push("interface DashboardData {");
    lines.push("  project: string;");
    lines.push("  type: string;");
    lines.push("  language: string;");
    lines.push("  entryPoints: number;");
    lines.push("  hotspots: number;");
    lines.push("  frameworks: string[];");
    lines.push("}");
    lines.push("");
    lines.push("const data: DashboardData = {");
    lines.push(`  project: ${JSON.stringify(id.name)},`);
    lines.push(`  type: ${JSON.stringify(id.type)},`);
    lines.push(`  language: ${JSON.stringify(id.primary_language)},`);
    lines.push(`  entryPoints: ${entryPoints.length},`);
    lines.push(`  hotspots: ${hotspots.length},`);
    lines.push(`  frameworks: ${JSON.stringify(frameworks)},`);
    lines.push("};");
    lines.push("");
    lines.push("function StatCard({ label, value }: { label: string; value: string | number }) {");
    lines.push("  return (");
    lines.push('    <div className="stat-card">');
    lines.push('      <span className="stat-label">{label}</span>');
    lines.push('      <span className="stat-value">{value}</span>');
    lines.push("    </div>");
    lines.push("  );");
    lines.push("}");
    lines.push("");
    lines.push("export function DashboardWidget() {");
    lines.push("  return (");
    lines.push('    <div className="dashboard-widget">');
    lines.push(`      <h2>{data.project} Dashboard</h2>`);
    lines.push('      <div className="stat-grid">');
    lines.push('        <StatCard label="Type" value={data.type} />');
    lines.push('        <StatCard label="Language" value={data.language} />');
    lines.push('        <StatCard label="Entry Points" value={data.entryPoints} />');
    lines.push('        <StatCard label="Hotspots" value={data.hotspots} />');

    // Language breakdown
    for (const lang of languages.slice(0, 3)) {
      lines.push(`        <StatCard label="${lang.name}" value={\`\${${JSON.stringify(lang.loc_percent)}}%\`} />`);
    }

    lines.push("      </div>");
    lines.push('      <div className="framework-tags">');
    lines.push("        {data.frameworks.map(f => (");
    lines.push('          <span key={f} className="tag">{f}</span>');
    lines.push("        ))}");
    lines.push("      </div>");
    lines.push("    </div>");
    lines.push("  );");
    lines.push("}");
    lines.push("");
    lines.push("export default DashboardWidget;");
  } else {
    lines.push(`// Dashboard widget for ${id.name}`);
    lines.push("");
    lines.push("export const dashboardData = {");
    lines.push(`  project: ${JSON.stringify(id.name)},`);
    lines.push(`  type: ${JSON.stringify(id.type)},`);
    lines.push(`  language: ${JSON.stringify(id.primary_language)},`);
    lines.push(`  entryPoints: ${entryPoints.length},`);
    lines.push(`  hotspots: ${hotspots.length},`);
    lines.push(`  frameworks: ${JSON.stringify(frameworks)},`);
    lines.push("};");
  }

  // ─── Hotspot Risk Table ──────────────────────────────────────
  if (hotspots.length > 0) {
    lines.push("");
    lines.push("// ─── Dependency Hotspots (highest risk) ───");
    lines.push("// Path | Inbound | Outbound | Risk Score");
    for (const h of hotspots.slice(0, 10)) {
      lines.push(`// ${h.path} | ${h.inbound_count} in | ${h.outbound_count} out | risk ${h.risk_score.toFixed(2)}`);
    }
  }

  // ─── Entry Points ────────────────────────────────────────────
  if (entryPoints.length > 0) {
    lines.push("");
    lines.push("// ─── Entry Points ───");
    for (const ep of entryPoints) {
      lines.push(`// [${ep.type}] ${ep.path} — ${ep.description}`);
    }
  }

  // ─── Route Distribution ──────────────────────────────────────
  if (routes.length > 0) {
    const methodCounts = new Map<string, number>();
    for (const r of routes) {
      methodCounts.set(r.method, (methodCounts.get(r.method) ?? 0) + 1);
    }
    lines.push("");
    lines.push(`// ─── API Surface: ${routes.length} routes ───`);
    for (const [method, count] of [...methodCounts.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`// ${method}: ${count} endpoints`);
    }
  }

  // ─── Domain Models ───────────────────────────────────────────
  if (models.length > 0) {
    lines.push("");
    lines.push(`// ─── Domain Models: ${models.length} entities ───`);
    for (const m of models.slice(0, 10)) {
      lines.push(`// ${m.name} (${m.kind}, ${m.field_count} fields) — ${m.source_file}`);
    }
  }

  // ─── Architecture Health ─────────────────────────────────────
  if (signals.patterns_detected.length > 0 || signals.separation_score > 0) {
    lines.push("");
    lines.push("// ─── Architecture Health ───");
    lines.push(`// Separation score: ${signals.separation_score.toFixed(2)}`);
    if (signals.patterns_detected.length > 0) {
      lines.push(`// Patterns: ${signals.patterns_detected.join(", ")}`);
    }
    if (signals.layer_boundaries.length > 0) {
      lines.push(`// Layer boundaries: ${signals.layer_boundaries.length}`);
      for (const lb of signals.layer_boundaries.slice(0, 5)) {
        lines.push(`//   ${lb.layer} (${lb.directories.length} dirs)`);
      }
    }
  }

  // ─── Warnings ────────────────────────────────────────────────
  if (ctx.ai_context.warnings.length > 0) {
    lines.push("");
    lines.push("// ─── Warnings ───");
    for (const w of ctx.ai_context.warnings) {
      lines.push(`// ⚠ ${w}`);
    }
  }

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    lines.push("");
    lines.push("// Source file metrics");
    lines.push(`// Total source files scanned: ${files.length}`);
    const configs = findConfigs(files);
    if (configs.length > 0) {
      lines.push(`// Config files: ${configs.map(c => c.path).join(", ")}`);
    }
  }

  return {
    path: "dashboard-widget.tsx",
    content: lines.join("\n"),
    content_type: "text/typescript",
    program: "artifacts",
    description: `Dashboard widget showing ${id.name} project stats and metrics`,
  };
}

// ─── embed-snippet.ts ──────────────────────────────────────────

export function generateEmbedSnippet(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const conventions = ctx.ai_context.conventions;
  const warnings = ctx.ai_context.warnings;
  const abstractions = ctx.ai_context.key_abstractions;

  const lines: string[] = [];

  lines.push("/**");
  lines.push(` * Embeddable context snippet for ${id.name}`);
  lines.push(` * Generated by Axis' Iliad`);
  lines.push(` * Drop this into any AI prompt to inject project context`);
  lines.push(" */");
  lines.push("");
  lines.push("export const PROJECT_CONTEXT = {");
  lines.push(`  name: ${JSON.stringify(id.name)},`);
  lines.push(`  type: ${JSON.stringify(id.type)},`);
  lines.push(`  language: ${JSON.stringify(id.primary_language)},`);
  lines.push(`  description: ${JSON.stringify(id.description)},`);
  lines.push("} as const;");
  lines.push("");

  lines.push("export const CONVENTIONS = [");
  for (const c of conventions) {
    lines.push(`  ${JSON.stringify(c)},`);
  }
  lines.push("] as const;");
  lines.push("");

  lines.push("export const WARNINGS = [");
  for (const w of warnings) {
    lines.push(`  ${JSON.stringify(w)},`);
  }
  lines.push("] as const;");
  lines.push("");

  lines.push("export const KEY_ABSTRACTIONS = [");
  for (const a of abstractions) {
    lines.push(`  ${JSON.stringify(a)},`);
  }
  lines.push("] as const;");
  lines.push("");

  lines.push("/**");
  lines.push(" * Inject into an AI prompt as a system-level context block.");
  lines.push(" * Usage: embedProjectContext() returns a formatted string.");
  lines.push(" */");
  lines.push("export function embedProjectContext(): string {");
  lines.push("  const sections = [");
  lines.push("    `# Project: ${PROJECT_CONTEXT.name}`,");
  lines.push("    `Type: ${PROJECT_CONTEXT.type} | Language: ${PROJECT_CONTEXT.language}`,");
  lines.push("    `Description: ${PROJECT_CONTEXT.description}`,");
  lines.push("    \"\",");
  lines.push("    \"## Conventions\",");
  lines.push("    ...CONVENTIONS.map(c => `- ${c}`),");
  lines.push("    \"\",");
  lines.push("    \"## Warnings\",");
  lines.push("    ...WARNINGS.map(w => `- ${w}`),");
  lines.push("    \"\",");
  lines.push("    \"## Key Abstractions\",");
  lines.push("    ...KEY_ABSTRACTIONS.map(a => `- ${a}`),");
  lines.push("  ];");
  lines.push("  return sections.join(\"\\n\");");
  lines.push("}");

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const entries = findEntryPoints(files);
    if (entries.length > 0) {
      lines.push("");
      lines.push("export const ENTRY_POINTS = [");
      for (const ep of entries.slice(0, 6)) {
        const exports = extractExports(ep.content);
        lines.push(`  { path: ${JSON.stringify(ep.path)}, exports: ${JSON.stringify(exports.slice(0, 5))} },`);
      }
      lines.push("] as const;");
    }
  }

  return {
    path: "embed-snippet.ts",
    content: lines.join("\n"),
    content_type: "text/typescript",
    program: "artifacts",
    description: "Embeddable TypeScript snippet for injecting project context into AI prompts",
  };
}

// ─── artifact-spec.md ──────────────────────────────────────────

export function generateArtifactSpec(ctx: ContextMap, profile: RepoProfile, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const frameworks = ctx.detection.frameworks.map(f => f.name);
  const languages = ctx.detection.languages;
  const entryPoints = ctx.entry_points;
  const hotspots = ctx.dependency_graph.hotspots;
  const patterns = ctx.architecture_signals.patterns_detected;
  const layers = ctx.architecture_signals.layer_boundaries;

  const lines: string[] = [];

  lines.push(`# Artifact Specification — ${id.name}`);
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  if (ctx.ai_context.project_summary) {
    lines.push("## Project Overview");
    lines.push("");
    lines.push(ctx.ai_context.project_summary);
    lines.push("");
  }

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

  lines.push("## Project Identity");
  lines.push("");
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| Name | ${id.name} |`);
  lines.push(`| Type | ${id.type} |`);
  lines.push(`| Language | ${id.primary_language} |`);
  lines.push(`| Frameworks | ${frameworks.join(", ") || "None detected"} |`);
  lines.push("");

  lines.push("## Language Distribution");
  lines.push("");
  for (const lang of languages) {
    const bar = "█".repeat(Math.max(1, Math.round(lang.loc_percent / 5)));
    lines.push(`- **${lang.name}**: ${lang.loc_percent}% ${bar} (${lang.file_count} files, ${lang.loc} LOC)`);
  }
  lines.push("");

  lines.push("## Architecture");
  lines.push("");
  if (patterns.length > 0) {
    lines.push("### Patterns Detected");
    for (const p of patterns) {
      lines.push(`- ${p}`);
    }
    lines.push("");
  }
  if (layers.length > 0) {
    lines.push("### Layer Boundaries");
    for (const l of layers) {
      lines.push(`- **${l.layer}**: ${l.directories.join(", ")}`);
    }
    lines.push("");
  }

  lines.push("## Entry Points");
  lines.push("");
  if (entryPoints.length > 0) {
    lines.push("| Path | Type | Description |");
    lines.push("|------|------|-------------|");
    for (const ep of entryPoints) {
      lines.push(`| \`${ep.path}\` | ${ep.type} | ${ep.description} |`);
    }
  } else {
    lines.push("No entry points detected.");
  }
  lines.push("");

  lines.push("## Hotspots");
  lines.push("");
  if (hotspots.length > 0) {
    lines.push("| Path | Inbound | Outbound | Risk |");
    lines.push("|------|---------|----------|------|");
    for (const h of hotspots.slice(0, 10)) {
      lines.push(`| \`${h.path}\` | ${h.inbound_count} | ${h.outbound_count} | ${h.risk_score.toFixed(1)} |`);
    }
  } else {
    lines.push("No hotspots detected.");
  }
  lines.push("");

  lines.push("## Artifact Generation Rules");
  lines.push("");
  lines.push("When generating artifacts for this project:");
  lines.push("");
  lines.push(`1. **Component artifacts** should use ${frameworks[0] ?? id.primary_language} conventions`);
  lines.push(`2. **Widget artifacts** should render project metrics from real data`);
  lines.push(`3. **Embed snippets** should include all conventions and warnings`);
  lines.push(`4. **File naming** should follow ${id.primary_language} conventions`);
  lines.push(`5. **Architecture score**: ${ctx.architecture_signals.separation_score}/100`);
  lines.push("");

  lines.push("## Dependencies (Top 10)");
  lines.push("");
  const deps = ctx.dependency_graph.external_dependencies.slice(0, 10);
  if (deps.length > 0) {
    for (const d of deps) {
      lines.push(`- \`${d.name}\` @ ${d.version}`);
    }
  } else {
    lines.push("No external dependencies detected.");
  }
  lines.push("");

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const entries = findEntryPoints(files);
    if (entries.length > 0) {
      lines.push("## Source Entry Points");
      lines.push("");
      lines.push("| File | Exports |");
      lines.push("|------|---------|");
      for (const ep of entries.slice(0, 8)) {
        const exports = extractExports(ep.content);
        lines.push(`| \`${ep.path}\` | ${exports.join(", ") || "default"} |`);
      }
      lines.push("");

      const exemplar = entries.find(f => {
        const len = f.content.split("\n").length;
        return len >= 5 && len <= 80 && extractExports(f.content).length > 0;
      });
      if (exemplar) {
        lines.push(...renderExcerpts("Reference Entry Point", [exemplar], 30));
      }
    }

    const components = findFiles(files, ["*.tsx", "*.jsx", "*.vue", "*.svelte"])
      .filter(f => !f.path.includes(".test.") && !f.path.includes(".spec."));
    if (components.length > 0) {
      lines.push("## Component Signatures");
      lines.push("");
      for (const c of components.slice(0, 10)) {
        const exports = extractExports(c.content);
        if (exports.length > 0) {
          lines.push(`- \`${c.path}\`: ${exports.join(", ")}`);
        }
      }
      lines.push("");
    }
  }

  return {
    path: "artifact-spec.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "artifacts",
    description: `Full artifact specification for ${id.name} with architecture, metrics, and generation rules`,
  };
}

// ─── component-library.json ─────────────────────────────────────

export function generateComponentLibrary(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const frameworks = ctx.detection.frameworks;
  const languages = ctx.detection.languages;
  const deps = ctx.dependency_graph.external_dependencies;
  const routes = ctx.routes;

  const hasTailwind = hasFw(ctx, "Tailwind CSS", "tailwind");
  const hasReact = hasFw(ctx, "React", "Next.js");

  // Build a component library spec from project context
  const components: Array<{
    name: string;
    category: string;
    props: Array<{ name: string; type: string; required: boolean }>;
    variants: string[];
    usage: string;
  }> = [];

  // Core primitives
  components.push({
    name: "Button",
    category: "primitives",
    props: [
      { name: "variant", type: "'primary' | 'secondary' | 'ghost' | 'danger'", required: false },
      { name: "size", type: "'sm' | 'md' | 'lg'", required: false },
      { name: "loading", type: "boolean", required: false },
      { name: "disabled", type: "boolean", required: false },
      { name: "children", type: "ReactNode", required: true },
    ],
    variants: ["primary", "secondary", "ghost", "danger"],
    usage: "Primary actions, form submissions, navigation triggers",
  });

  components.push({
    name: "Input",
    category: "primitives",
    props: [
      { name: "type", type: "'text' | 'email' | 'password' | 'number'", required: false },
      { name: "label", type: "string", required: true },
      { name: "error", type: "string", required: false },
      { name: "placeholder", type: "string", required: false },
    ],
    variants: ["default", "error", "disabled"],
    usage: "Form fields, search inputs, data entry",
  });

  components.push({
    name: "Card",
    category: "layout",
    props: [
      { name: "title", type: "string", required: false },
      { name: "padding", type: "'sm' | 'md' | 'lg'", required: false },
      { name: "hoverable", type: "boolean", required: false },
      { name: "children", type: "ReactNode", required: true },
    ],
    variants: ["default", "elevated", "bordered", "interactive"],
    usage: "Content containers, list items, dashboard widgets",
  });

  components.push({
    name: "Badge",
    category: "primitives",
    props: [
      { name: "variant", type: "'info' | 'success' | 'warning' | 'error' | 'neutral'", required: false },
      { name: "children", type: "ReactNode", required: true },
    ],
    variants: ["info", "success", "warning", "error", "neutral"],
    usage: "Status indicators, labels, counts",
  });

  components.push({
    name: "Modal",
    category: "overlay",
    props: [
      { name: "open", type: "boolean", required: true },
      { name: "onClose", type: "() => void", required: true },
      { name: "title", type: "string", required: true },
      { name: "children", type: "ReactNode", required: true },
    ],
    variants: ["default", "danger", "fullscreen"],
    usage: "Confirmations, forms, detail views",
  });

  components.push({
    name: "Table",
    category: "data-display",
    props: [
      { name: "columns", type: "Column[]", required: true },
      { name: "data", type: "Row[]", required: true },
      { name: "sortable", type: "boolean", required: false },
      { name: "loading", type: "boolean", required: false },
    ],
    variants: ["default", "compact", "striped"],
    usage: "Data listings, reports, admin views",
  });

  // Add route-derived page components
  const pageRoutes = routes.filter(r => !r.path.startsWith("/api") && r.method === "GET");
  for (const r of pageRoutes.slice(0, 4)) {
    const name = r.path === "/" ? "HomePage" :
      r.path.split("/").filter(Boolean).map(s =>
        s.charAt(0).toUpperCase() + s.slice(1).replace(/[-_]/g, "")
      ).join("") + "Page";
    components.push({
      name,
      category: "pages",
      props: [
        { name: "params", type: "Record<string, string>", required: false },
      ],
      variants: ["default", "loading", "error"],
      usage: `Page component for route ${r.path}`,
    });
  }

  const library = {
    project: id.name,
    generated_at: new Date().toISOString(),
    project_summary: ctx.ai_context.project_summary || null,
    detected_stack: ctx.detection.frameworks.map(fw => ({
      name: fw.name,
      version: fw.version ?? null,
      confidence: fw.confidence,
    })),
    framework: hasReact ? "react" : frameworks[0]?.name ?? id.primary_language,
    styling: hasTailwind ? "tailwind" : "css-modules",
    total_components: components.length,
    categories: [...new Set(components.map(c => c.category))],
    components,
    // ─── Source File Analysis ──────────────────────────────────
    source_components: files && files.length > 0 ? (() => {
      const compFiles = findFiles(files, ["*.tsx", "*.jsx", "*.vue", "*.svelte"])
        .filter(f => !f.path.includes(".test.") && !f.path.includes(".spec."));
      return compFiles.slice(0, 12).map(f => ({
        path: f.path,
        exports: extractExports(f.content),
        size: f.size,
      }));
    })() : null,
  };

  return {
    path: "component-library.json",
    content: JSON.stringify(library, null, 2),
    content_type: "application/json",
    program: "artifacts",
    description: "Component library specification with props, variants, and usage guidance",
  };
}

// ─── prd.md ─────────────────────────────────────────────────────
// Product Requirements Document. Spark-parity scaffolding generator.
// Data-driven from project_identity, routes, domain models, and the
// AI context summary so it reflects the analyzed repo instead of being
// a hollow template.

export function generatePrd(ctx: ContextMap, _profile: RepoProfile, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const ai = ctx.ai_context;
  const frameworks = ctx.detection.frameworks.map(f => f.name);
  const routes = ctx.routes;
  const models = ctx.domain_models;
  const entryPoints = ctx.entry_points;

  const lines: string[] = [];
  lines.push(`# ${id.name} — Product Requirements`);
  lines.push("");
  lines.push(`> ${ai.project_summary || id.description || `A ${id.type.replace(/_/g, " ")} built with ${frameworks.slice(0, 3).join(", ") || id.primary_language}.`}`);
  lines.push("");
  lines.push("## Problem & Context");
  lines.push("");
  if (ai.project_summary) {
    lines.push(ai.project_summary);
  } else {
    lines.push(`${id.name} solves a ${id.type.replace(/_/g, " ")} problem. The current implementation is built in ${id.primary_language}${frameworks.length > 0 ? ` using ${frameworks.slice(0, 3).join(", ")}` : ""}.`);
  }
  lines.push("");
  if (ai.warnings.length > 0) {
    lines.push("**Known gaps & risks (detected in the codebase):**");
    lines.push("");
    for (const w of ai.warnings.slice(0, 5)) lines.push(`- ${w}`);
    lines.push("");
  }

  lines.push("## Goals");
  lines.push("");
  if (routes.length > 0) {
    lines.push(`- Deliver ${routes.length} HTTP endpoint${routes.length === 1 ? "" : "s"} (${new Set(routes.map(r => r.method.toUpperCase())).size} method${new Set(routes.map(r => r.method)).size === 1 ? "" : "s"}) backing the user-facing surface.`);
  }
  if (models.length > 0) {
    lines.push(`- Maintain a stable, typed contract over ${models.length} domain model${models.length === 1 ? "" : "s"} with no breaking changes within a minor version.`);
  }
  if (entryPoints.length > 0) {
    lines.push(`- Keep ${entryPoints.length} entry point${entryPoints.length === 1 ? "" : "s"} (${entryPoints.slice(0, 3).map(e => e.path).join(", ")}${entryPoints.length > 3 ? ", …" : ""}) trivially runnable: \`npm install && npm run dev\` (or equivalent).`);
  }
  if (frameworks.includes("React") || frameworks.includes("Next.js") || frameworks.includes("Vue") || frameworks.includes("Svelte") || frameworks.includes("SvelteKit") || frameworks.includes("Nuxt")) {
    lines.push("- Ship a responsive UI that meets WCAG 2.1 AA accessibility on the primary user flows.");
  }
  lines.push("- Land all changes behind tests; keep the green-build invariant for the main branch.");
  lines.push("");

  lines.push("## Non-Goals");
  lines.push("");
  lines.push("- Backwards compatibility with deprecated APIs or pre-snapshot data formats.");
  if (!frameworks.includes("Next.js") && !frameworks.includes("Nuxt") && !frameworks.includes("SvelteKit")) {
    lines.push("- Server-side rendering (this version is a client-rendered app).");
  }
  if (!ctx.detection.deployment_target) {
    lines.push("- Multi-region deployment (single-region until traffic justifies the cost).");
  }
  lines.push("- Premature optimization — first build it, measure, then optimize.");
  lines.push("");

  if (routes.length > 0) {
    lines.push("## User Stories");
    lines.push("");
    const grouped = new Map<string, typeof routes>();
    for (const r of routes.slice(0, 12)) {
      const seg = r.path.split("/").filter(Boolean)[0] ?? "root";
      const arr = grouped.get(seg) ?? [];
      arr.push(r);
      grouped.set(seg, arr);
    }
    for (const [area, rs] of grouped) {
      lines.push(`### ${area}`);
      for (const r of rs) {
        lines.push(`- As a user, I can call \`${r.method.toUpperCase()} ${r.path}\` (source: \`${r.source_file}\`) and receive a successful, deterministic response.`);
      }
      lines.push("");
    }
  }

  lines.push("## Success Metrics");
  lines.push("");
  lines.push(`- **Build/test health**: \`${frameworks.includes("Go stdlib HTTP") ? "go test ./..." : "npm test"}\` exits 0 on every PR. Coverage trend non-decreasing across releases.`);
  if (routes.length > 0) {
    lines.push(`- **API latency**: p95 ≤ 250ms for each of the ${routes.length} endpoints under nominal load.`);
  }
  lines.push("- **Error budget**: < 1% 5xx responses over a rolling 30-day window.");
  lines.push("- **Time-to-onboard**: a new contributor can run the project locally inside 10 minutes from a clean checkout.");
  lines.push("");

  lines.push("## Constraints");
  lines.push("");
  lines.push(`- Primary language: **${id.primary_language}**. New code follows the existing strict-mode / lint conventions.`);
  if (frameworks.length > 0) lines.push(`- Frameworks: ${frameworks.map(f => `**${f}**`).join(", ")}. Stay on these unless an RFC is opened.`);
  if (ctx.detection.package_managers.length > 0) lines.push(`- Package manager: **${ctx.detection.package_managers[0]}** (lockfile is authoritative — commit it).`);
  if (ctx.detection.deployment_target) lines.push(`- Deployment target: **${ctx.detection.deployment_target}**.`);
  if (ai.conventions.length > 0) {
    lines.push("");
    lines.push("**Engineering conventions:**");
    for (const c of ai.conventions.slice(0, 6)) lines.push(`- ${c}`);
  }
  lines.push("");

  lines.push("## Open Questions");
  lines.push("");
  lines.push("- _Who is the primary user persona, and what is their week-1 success moment?_");
  lines.push("- _What is the smallest releasable slice we can ship behind a flag this week?_");
  lines.push("- _Which existing internal tools or external SaaS will this replace or integrate with?_");
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push("_Generated by Axis Artifacts from the current snapshot. Re-run after every significant scope change._");

  return {
    path: "prd.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "artifacts",
    description: "Product Requirements Document derived from project identity, routes, domain models, and detected conventions",
  };
}

// ─── design.md ──────────────────────────────────────────────────
// Architecture + UI/UX decisions. Spark-parity scaffolding generator.

export function generateDesignDoc(ctx: ContextMap, profile: RepoProfile, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const arch = ctx.architecture_signals;
  const frameworks = ctx.detection.frameworks.map(f => f.name);
  const models = ctx.domain_models;
  const routes = ctx.routes;
  const layout = ctx.structure.top_level_layout;
  const hasFrontend = frameworks.some(f => ["React", "Next.js", "Vue", "Nuxt", "Svelte", "SvelteKit"].includes(f));
  const styling = frameworks.find(f => ["Tailwind", "styled-components", "Emotion", "CSS Modules"].includes(f));

  const lines: string[] = [];
  lines.push(`# ${id.name} — Design Doc`);
  lines.push("");
  lines.push(`Architecture, data flow, and UX decisions for ${id.name}. Use this as the source of truth when proposing changes that cross module boundaries.`);
  lines.push("");

  lines.push("## Tech Stack");
  lines.push("");
  lines.push(`- **Language**: ${id.primary_language}`);
  if (frameworks.length > 0) lines.push(`- **Frameworks**: ${frameworks.join(", ")}`);
  if (ctx.detection.build_tools.length > 0) lines.push(`- **Build tools**: ${ctx.detection.build_tools.join(", ")}`);
  if (ctx.detection.test_frameworks.length > 0) lines.push(`- **Test runner**: ${ctx.detection.test_frameworks.join(", ")}`);
  if (ctx.detection.package_managers.length > 0) lines.push(`- **Package manager**: ${ctx.detection.package_managers.join(", ")}`);
  if (ctx.detection.ci_platform) lines.push(`- **CI**: ${ctx.detection.ci_platform}`);
  if (ctx.detection.deployment_target) lines.push(`- **Deploy target**: ${ctx.detection.deployment_target}`);
  lines.push("");

  if (arch.patterns_detected.length > 0 || arch.layer_boundaries.length > 0) {
    lines.push("## Architecture");
    lines.push("");
    if (arch.patterns_detected.length > 0) {
      lines.push("**Patterns detected:**");
      for (const p of arch.patterns_detected) lines.push(`- ${p}`);
      lines.push("");
    }
    if (arch.layer_boundaries.length > 0) {
      lines.push("**Layer boundaries:**");
      for (const b of arch.layer_boundaries.slice(0, 8)) lines.push(`- \`${b}\``);
      lines.push("");
    }
    lines.push(`**Separation score**: ${arch.separation_score}/100 — ${arch.separation_score >= 70 ? "well-separated; cross-layer imports rare" : arch.separation_score >= 40 ? "moderate separation; watch for leaks at the boundary" : "low separation; consider extracting a stable interface layer"}.`);
    lines.push("");
  }

  if (layout.length > 0) {
    lines.push("## Top-Level Layout");
    lines.push("");
    lines.push("| Path | Purpose | Files |");
    lines.push("|------|---------|-------|");
    for (const l of layout.slice(0, 12)) {
      lines.push(`| \`${l.name}/\` | ${l.purpose.replace(/\|/g, "\\|")} | ${l.file_count} |`);
    }
    lines.push("");
  }

  if (routes.length > 0) {
    lines.push("## Data Flow");
    lines.push("");
    lines.push(`Requests enter via ${routes.length} HTTP route${routes.length === 1 ? "" : "s"} and fan out to domain logic backed by ${models.length} typed model${models.length === 1 ? "" : "s"}.`);
    lines.push("");
    lines.push("```");
    lines.push("  Client");
    lines.push("    │");
    lines.push("    ▼");
    lines.push(`  HTTP entry (${routes.length} route${routes.length === 1 ? "" : "s"})`);
    lines.push("    │");
    lines.push("    ▼");
    lines.push(`  Domain layer (${models.length} model${models.length === 1 ? "" : "s"})`);
    if (ctx.sql_schema.length > 0) {
      lines.push("    │");
      lines.push("    ▼");
      lines.push(`  Persistence (${ctx.sql_schema.length} table${ctx.sql_schema.length === 1 ? "" : "s"})`);
    }
    lines.push("```");
    lines.push("");
  }

  if (hasFrontend) {
    lines.push("## UI / UX Decisions");
    lines.push("");
    lines.push(`- **Component model**: ${frameworks.includes("React") || frameworks.includes("Next.js") ? "React function components" : frameworks.includes("Svelte") || frameworks.includes("SvelteKit") ? "Svelte components" : frameworks.includes("Vue") || frameworks.includes("Nuxt") ? "Vue 3 SFCs" : "framework-native components"}. No class components.`);
    if (styling) lines.push(`- **Styling**: ${styling} as the single styling layer — do not mix with another approach.`);
    lines.push("- **Accessibility**: WCAG 2.1 AA on primary flows. Every interactive element ships keyboard-navigable.");
    lines.push("- **State**: prefer co-located state and URL-driven routing; introduce a store only when state spans 3+ unrelated components.");
    lines.push("- **Loading & error states**: every async surface ships explicit loading + error UI, no silent fallbacks.");
    lines.push("");
  }

  lines.push("## Key Decisions");
  lines.push("");
  if (ctx.ai_context.conventions.length > 0) {
    for (const c of ctx.ai_context.conventions.slice(0, 6)) lines.push(`- ${c}`);
  }
  if (ctx.ai_context.conventions.length === 0) {
    lines.push("- Strict typing on every public API surface.");
    lines.push("- Pure functions in domain logic; side effects pushed to the edge.");
    lines.push("- One canonical source of truth per domain model — no parallel definitions.");
  }
  lines.push("");

  lines.push("## Open Questions");
  lines.push("");
  lines.push("- _Authentication and authorization model — bearer tokens, OAuth, session cookies?_");
  lines.push("- _Caching strategy — in-process, Redis, CDN edge?_");
  lines.push("- _Observability stack — logs / metrics / traces backends?_");
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push(`_Generated by Axis Artifacts from snapshot \`${ctx.snapshot_id}\`. Re-run after every structural change._`);

  return {
    path: "design.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "artifacts",
    description: "Architecture, data flow, and UX decisions derived from architecture signals, routes, models, and detected frameworks",
  };
}

// ─── tasks.md ───────────────────────────────────────────────────
// Implementation task breakdown with checkboxes. Phases are derived
// from what's missing/weak in the snapshot rather than a fixed template.

export function generateTasksMd(ctx: ContextMap, profile: RepoProfile, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const frameworks = ctx.detection.frameworks.map(f => f.name);
  const hasTests = ctx.detection.test_frameworks.length > 0;
  const hasCi = Boolean(ctx.detection.ci_platform);
  const hasDocker = Boolean(files?.some(f => /(^|\/)(dockerfile|docker-compose\.ya?ml)$/i.test(f.path)));
  const hasReadme = Boolean(files?.some(f => /^readme\.md$/i.test(f.path)));
  const hasLicense = Boolean(files?.some(f => /^license(\.\w+)?$/i.test(f.path)));
  const routes = ctx.routes;
  const models = ctx.domain_models;
  const warnings = ctx.ai_context.warnings;

  const lines: string[] = [];
  lines.push(`# ${id.name} — Implementation Tasks`);
  lines.push("");
  lines.push("Tasks are ordered by phase. Check items off as they land. New tasks land at the bottom of their phase — don't re-order completed items.");
  lines.push("");

  lines.push("## Phase 0 — Foundations");
  lines.push("");
  lines.push(`- [${hasReadme ? "x" : " "}] README with one-line description, install, run, and contributing instructions`);
  lines.push(`- [${hasLicense ? "x" : " "}] LICENSE file at repo root`);
  lines.push(`- [${ctx.detection.package_managers.length > 0 ? "x" : " "}] Lockfile committed (\`${ctx.detection.package_managers[0] ?? "pnpm/yarn/npm/bun"}\`)`);
  lines.push(`- [${hasTests ? "x" : " "}] Test runner configured (${ctx.detection.test_frameworks[0] ?? "vitest / jest / go test / pytest"})`);
  lines.push(`- [${hasCi ? "x" : " "}] CI pipeline runs on every PR (${ctx.detection.ci_platform ?? "GitHub Actions"})`);
  lines.push(`- [${hasDocker ? "x" : " "}] Container build (Dockerfile + docker-compose for local validation)`);
  lines.push("");

  lines.push("## Phase 1 — Core Domain");
  lines.push("");
  if (models.length > 0) {
    lines.push(`- [x] ${models.length} domain model${models.length === 1 ? "" : "s"} defined`);
    for (const m of models.slice(0, 6)) {
      lines.push(`  - \`${m.name}\` (${m.kind}, ${m.field_count} field${m.field_count === 1 ? "" : "s"}, \`${m.source_file}\`)`);
    }
  } else {
    lines.push("- [ ] Define the core domain models (entities, value objects, DTOs)");
  }
  lines.push("- [ ] Pure-function business logic with no I/O side effects");
  lines.push("- [ ] Validation at every system boundary (input parsing, deserialization)");
  lines.push("");

  lines.push("## Phase 2 — Entry Points & API Surface");
  lines.push("");
  if (routes.length > 0) {
    lines.push(`- [x] ${routes.length} HTTP route${routes.length === 1 ? "" : "s"} registered`);
    for (const r of routes.slice(0, 8)) {
      lines.push(`  - \`${r.method.toUpperCase()} ${r.path}\` — \`${r.source_file}\``);
    }
    if (routes.length > 8) lines.push(`  - …and ${routes.length - 8} more`);
  } else {
    lines.push("- [ ] Define the HTTP / gRPC / CLI entry points");
  }
  lines.push("- [ ] Each endpoint has at least one integration test covering the happy path + one error path");
  lines.push("- [ ] Error responses follow a single canonical shape (status code + machine-readable code + human message)");
  lines.push("");

  if (frameworks.some(f => ["React", "Next.js", "Vue", "Svelte", "SvelteKit", "Nuxt"].includes(f))) {
    lines.push("## Phase 3 — UI");
    lines.push("");
    lines.push("- [ ] Root layout / App shell with global error boundary");
    lines.push("- [ ] Theme tokens wired through (design-tokens.json → CSS variables)");
    lines.push("- [ ] Loading + empty + error states on every async surface");
    lines.push("- [ ] Keyboard-navigable on every interactive element");
    lines.push("- [ ] Lighthouse / Web Vitals budget defined and enforced in CI");
    lines.push("");
  }

  lines.push("## Phase 4 — Operations");
  lines.push("");
  lines.push(`- [${hasDocker ? "x" : " "}] Container build documented and reproducible`);
  lines.push("- [ ] `/health` endpoint exposes liveness + readiness");
  lines.push("- [ ] Structured logs (JSON lines) with request IDs");
  lines.push("- [ ] Metrics endpoint (Prometheus / OpenMetrics format)");
  lines.push("- [ ] Runbook for the top 3 alert conditions");
  lines.push("- [ ] Graceful shutdown handler (SIGTERM drain timeout)");
  lines.push("");

  lines.push("## Phase 5 — Hardening");
  lines.push("");
  for (const w of warnings.slice(0, 6)) {
    lines.push(`- [ ] ${w}`);
  }
  if (warnings.length === 0) {
    lines.push("- [ ] Run dependency audit (`pnpm audit` / `npm audit` / `pip-audit`) and fix anything ≥ HIGH");
    lines.push("- [ ] Rate-limit untrusted endpoints");
    lines.push("- [ ] Secrets management — no credentials in source, env-driven config only");
  }
  lines.push("");

  lines.push("## Phase 6 — Release & Distribution");
  lines.push("");
  lines.push("- [ ] Version bump strategy documented (semver / calver)");
  lines.push("- [ ] CHANGELOG.md updated for every release");
  lines.push("- [ ] Release workflow attests the build and publishes to the registry");
  lines.push("- [ ] Rollback procedure tested at least once before the first paid customer");
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push("_Generated by Axis Artifacts. Tasks marked complete are inferred from snapshot signals — verify each on first read._");

  return {
    path: "tasks.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "artifacts",
    description: "Phase-based implementation task breakdown with checkbox state inferred from snapshot signals (tests, CI, Docker, routes, etc.)",
  };
}

// ─── context.md ─────────────────────────────────────────────────
// Session context / progress log — the document an agent loads first
// when resuming work. Derived from snapshot metadata, entry points,
// and the AI context summary.

export function generateContextMd(ctx: ContextMap, profile: RepoProfile, _files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const structure = ctx.structure;
  const routes = ctx.routes;
  const models = ctx.domain_models;
  const entryPoints = ctx.entry_points;
  const conventions = ctx.ai_context.conventions;
  const warnings = ctx.ai_context.warnings;

  const lines: string[] = [];
  lines.push(`# ${id.name} — Session Context`);
  lines.push("");
  lines.push(`Last updated: \`${ctx.generated_at}\`  ·  Snapshot: \`${ctx.snapshot_id}\``);
  lines.push("");
  lines.push("Load this file at the start of every working session. It's the agent-readable progress log — what's done, what's in flight, and where to look next.");
  lines.push("");

  lines.push("## Snapshot Stats");
  lines.push("");
  lines.push(`- **Files**: ${structure.total_files.toLocaleString()}`);
  lines.push(`- **Directories**: ${structure.total_directories.toLocaleString()}`);
  lines.push(`- **Lines of code**: ${structure.total_loc.toLocaleString()}`);
  lines.push(`- **Primary language**: ${id.primary_language}`);
  if (ctx.detection.frameworks.length > 0) {
    lines.push(`- **Frameworks**: ${ctx.detection.frameworks.map(f => f.name).join(", ")}`);
  }
  lines.push("");

  lines.push("## What's Done");
  lines.push("");
  if (entryPoints.length > 0) {
    lines.push(`- ${entryPoints.length} entry point${entryPoints.length === 1 ? "" : "s"} wired up`);
  }
  if (routes.length > 0) {
    lines.push(`- ${routes.length} HTTP route${routes.length === 1 ? "" : "s"} registered (${new Set(routes.map(r => r.method.toUpperCase())).size} method${new Set(routes.map(r => r.method)).size === 1 ? "" : "s"})`);
  }
  if (models.length > 0) {
    lines.push(`- ${models.length} domain model${models.length === 1 ? "" : "s"} defined and typed`);
  }
  if (ctx.detection.test_frameworks.length > 0) {
    lines.push(`- Test runner configured: ${ctx.detection.test_frameworks.join(", ")}`);
  }
  if (ctx.detection.ci_platform) {
    lines.push(`- CI pipeline live on ${ctx.detection.ci_platform}`);
  }
  if (ctx.detection.deployment_target) {
    lines.push(`- Deployment target: ${ctx.detection.deployment_target}`);
  }
  lines.push("");

  lines.push("## What's In Progress");
  lines.push("");
  lines.push("- _Fill this in at the start of each session — bullet the tasks you're carrying over from last time._");
  lines.push("");

  if (warnings.length > 0) {
    lines.push("## Watch List");
    lines.push("");
    lines.push("Signals flagged by the analyzer that may warrant attention:");
    lines.push("");
    for (const w of warnings.slice(0, 6)) lines.push(`- ${w}`);
    lines.push("");
  }

  lines.push("## Key Files for Newcomers");
  lines.push("");
  if (entryPoints.length > 0) {
    for (const e of entryPoints.slice(0, 5)) {
      lines.push(`- \`${e.path}\` — ${e.description || e.type}`);
    }
  }
  if (entryPoints.length === 0) {
    lines.push(`- (No entry points auto-detected. Add the file your runtime starts from to one of the conventional locations: \`src/index.ts\`, \`src/server.ts\`, \`cmd/<name>/main.go\`, etc.)`);
  }
  lines.push("");

  if (conventions.length > 0) {
    lines.push("## Conventions to Follow");
    lines.push("");
    for (const c of conventions.slice(0, 6)) lines.push(`- ${c}`);
    lines.push("");
  }

  lines.push("## Next Session Checklist");
  lines.push("");
  lines.push("Before you log off, update this section so the next session resumes cleanly:");
  lines.push("");
  lines.push("- [ ] What did I finish?");
  lines.push("- [ ] What did I learn that isn't in the code yet?");
  lines.push("- [ ] What's the next concrete step (file + function + line)?");
  lines.push("- [ ] Any blockers waiting on external input?");
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push("_Generated by Axis Artifacts. The What's In Progress, Next Session Checklist, and free-text notes are owned by the human. Snapshot stats and the Done / Watch list refresh on every re-run._");

  return {
    path: "context.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "artifacts",
    description: "Session-context document — snapshot stats, completed scope, watch list, key files, and a human-edited progress log",
  };
}

// ─── index.html ─────────────────────────────────────────────────
// Root HTML for the generated component. Paired with generated-component.tsx
// — drops a Vite/CRA-style root that mounts the component at <div id="root">.

export function generateIndexHtml(ctx: ContextMap, _profile: RepoProfile, _files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const description = id.description || ctx.ai_context.project_summary || `${id.name} — generated by Axis Artifacts.`;
  // Truncate description to a reasonable meta-tag length without slicing inside an entity.
  const metaDescription = description.length > 160
    ? description.slice(0, 157).replace(/[\s,;]+\S*$/, "") + "…"
    : description;
  const escape = (s: string) => s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  const lines: string[] = [
    "<!doctype html>",
    "<html lang=\"en\">",
    "  <head>",
    "    <meta charset=\"UTF-8\" />",
    "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0, viewport-fit=cover\" />",
    "    <meta name=\"color-scheme\" content=\"light dark\" />",
    `    <meta name=\"theme-color\" content=\"#0f172a\" media=\"(prefers-color-scheme: dark)\" />`,
    `    <meta name=\"theme-color\" content=\"#ffffff\" media=\"(prefers-color-scheme: light)\" />`,
    `    <meta name=\"description\" content=\"${escape(metaDescription)}\" />`,
    `    <meta property=\"og:title\" content=\"${escape(id.name)}\" />`,
    `    <meta property=\"og:description\" content=\"${escape(metaDescription)}\" />`,
    `    <meta property=\"og:type\" content=\"website\" />`,
    "    <link rel=\"icon\" type=\"image/svg+xml\" href=\"/favicon.svg\" />",
    "    <link rel=\"stylesheet\" href=\"/theme.css\" />",
    `    <title>${escape(id.name)}</title>`,
    "  </head>",
    "  <body>",
    "    <noscript>",
    `      <p>${escape(id.name)} requires JavaScript to run. Enable it or fall back to the API at <code>/api</code>.</p>`,
    "    </noscript>",
    "    <div id=\"root\"></div>",
    "    <script type=\"module\" src=\"/src/main.tsx\"></script>",
    "  </body>",
    "</html>",
  ];

  return {
    path: "index.html",
    content: lines.join("\n") + "\n",
    content_type: "text/html",
    program: "artifacts",
    description: "Root HTML document with viewport, theme-color, OG tags, JS-required noscript fallback, and module-script mount for the generated component",
  };
}
