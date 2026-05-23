import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { GeneratedFile, SourceFile } from "./types.js";
import { hasFw, getFw } from "./fw-helpers.js";
import { findFiles, findFile, findEntryPoints, findConfigs, renderExcerpts, extractExports } from "./file-excerpt-utils.js";

// ─── generated-component.tsx ────────────────────────────────────

export function generateComponent(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const isReact = hasFw(ctx, "React", "Next.js");
  const isSvelte = hasFw(ctx, "Svelte", "SvelteKit");
  const isVue = hasFw(ctx, "Vue", "Nuxt");
  // Normalize to PascalCase so the symbol is a valid React component identifier.
  // The previous lowercase fallback ("axisiliad") would be parsed as an HTML
  // element by the JSX transform, not a component.
  const rawName = id.name.replace(/[^a-zA-Z0-9]+/g, " ").trim().split(/\s+/)
    .map(w => (w[0]?.toUpperCase() ?? "") + w.slice(1).toLowerCase())
    .join("") || "App";
  const componentName = rawName[0]?.match(/[A-Z]/) ? rawName : "App" + rawName;
  const kebab = componentName.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  const routes = ctx.routes;
  const models = ctx.domain_models;
  const entryPoints = ctx.entry_points;

  const lines: string[] = [];

  if (isSvelte) {
    lines.push(`<!-- ${id.name} — Svelte app shell. Renders a header, error boundary,`);
    lines.push(`     and a grid of detected routes / domain models. Pair with /theme.css. -->`);
    lines.push(`<script lang="ts">`);
    lines.push(`  let title = "${id.name}";`);
    lines.push(`  let routes = ${JSON.stringify(routes.slice(0, 12).map(r => `${r.method.toUpperCase()} ${r.path}`))};`);
    lines.push(`  let models = ${JSON.stringify(models.slice(0, 8).map(m => m.name))};`);
    lines.push(`</script>`);
    lines.push("");
    lines.push(`<main class="${kebab}-app">`);
    lines.push(`  <header><h1>{title}</h1></header>`);
    lines.push(`  <section><h2>Routes</h2><ul>{#each routes as r}<li>{r}</li>{/each}</ul></section>`);
    lines.push(`  <section><h2>Models</h2><ul>{#each models as m}<li>{m}</li>{/each}</ul></section>`);
    lines.push(`</main>`);
    lines.push("");
    lines.push(`<style>`);
    lines.push(`  .${kebab}-app { font-family: var(--font-sans, system-ui); padding: 2rem; }`);
    lines.push(`  .${kebab}-app section { margin-top: 1.5rem; }`);
    lines.push(`</style>`);
  } else if (isVue) {
    lines.push(`<!-- ${id.name} — Vue 3 app shell paired with /theme.css. -->`);
    lines.push(`<template>`);
    lines.push(`  <main :class="['${kebab}-app']">`);
    lines.push(`    <header><h1>{{ title }}</h1></header>`);
    lines.push(`    <section><h2>Routes</h2><ul><li v-for="r in routes" :key="r">{{ r }}</li></ul></section>`);
    lines.push(`    <section><h2>Models</h2><ul><li v-for="m in models" :key="m">{{ m }}</li></ul></section>`);
    lines.push(`  </main>`);
    lines.push(`</template>`);
    lines.push("");
    lines.push(`<script setup lang="ts">`);
    lines.push(`const title = "${id.name}";`);
    lines.push(`const routes = ${JSON.stringify(routes.slice(0, 12).map(r => `${r.method.toUpperCase()} ${r.path}`))};`);
    lines.push(`const models = ${JSON.stringify(models.slice(0, 8).map(m => m.name))};`);
    lines.push(`</script>`);
    lines.push("");
    lines.push(`<style scoped>`);
    lines.push(`.${kebab}-app { font-family: var(--font-sans, system-ui); padding: 2rem; }`);
    lines.push(`.${kebab}-app section { margin-top: 1.5rem; }`);
    lines.push(`</style>`);
  } else if (isReact) {
    // Full App-shaped React component: error boundary + header + sections
    // driven by detected routes, domain models, and entry points. No
    // `import React` — modern JSX transform handles it. Renders only data
    // derived from the snapshot, no Lorem-ipsum filler.
    const routeData = routes.slice(0, 12).map(r => ({
      method: r.method.toUpperCase(),
      path: r.path,
      source: r.source_file,
    }));
    const modelData = models.slice(0, 8).map(m => ({
      name: m.name,
      kind: m.kind,
      fields: m.field_count,
      source: m.source_file,
    }));
    const entryData = entryPoints.slice(0, 6).map(e => ({
      path: e.path,
      type: e.type,
    }));

    lines.push(`/**`);
    lines.push(` * ${id.name} — App shell.`);
    lines.push(` *`);
    lines.push(` * Top-level React component for the generated app. Mounted by index.html`);
    lines.push(` * and paired with /theme.css. Wraps content in an error boundary so a`);
    lines.push(` * failure in any section does not blank the whole UI.`);
    lines.push(` *`);
    lines.push(` * The data tables (routes / models / entry points) are extracted from the`);
    lines.push(` * snapshot at generation time. Edit freely once the project is bootstrapped.`);
    lines.push(` */`);
    lines.push(`import { Component, type ReactNode } from "react";`);
    lines.push("");
    lines.push(`type Route = { method: string; path: string; source: string };`);
    lines.push(`type Model = { name: string; kind: string; fields: number; source: string };`);
    lines.push(`type Entry = { path: string; type: string };`);
    lines.push("");
    lines.push(`const ROUTES: Route[] = ${JSON.stringify(routeData, null, 2)};`);
    lines.push(`const MODELS: Model[] = ${JSON.stringify(modelData, null, 2)};`);
    lines.push(`const ENTRY_POINTS: Entry[] = ${JSON.stringify(entryData, null, 2)};`);
    lines.push("");
    lines.push(`// ─── ErrorBoundary ─────────────────────────────────────────────`);
    lines.push(`// React requires a class for getDerivedStateFromError. This thin`);
    lines.push(`// wrapper is the only class in the file; everything else is a`);
    lines.push(`// function component.`);
    lines.push(`class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {`);
    lines.push(`  state = { error: null as Error | null };`);
    lines.push(`  static getDerivedStateFromError(error: Error) { return { error }; }`);
    lines.push(`  componentDidCatch(error: Error) { console.error("${componentName} crash:", error); }`);
    lines.push(`  render() {`);
    lines.push(`    if (this.state.error) {`);
    lines.push(`      return (`);
    lines.push(`        <div role="alert" className="${kebab}-error">`);
    lines.push(`          <h2>Something went wrong</h2>`);
    lines.push(`          <pre>{this.state.error.message}</pre>`);
    lines.push(`          <button onClick={() => this.setState({ error: null })}>Reset</button>`);
    lines.push(`        </div>`);
    lines.push(`      );`);
    lines.push(`    }`);
    lines.push(`    return this.props.children;`);
    lines.push(`  }`);
    lines.push(`}`);
    lines.push("");
    lines.push(`function Section({ title, children }: { title: string; children: ReactNode }) {`);
    lines.push(`  return (`);
    lines.push(`    <section className="${kebab}-section">`);
    lines.push(`      <h2 className="${kebab}-section-title">{title}</h2>`);
    lines.push(`      {children}`);
    lines.push(`    </section>`);
    lines.push(`  );`);
    lines.push(`}`);
    lines.push("");
    lines.push(`function Routes() {`);
    lines.push(`  if (ROUTES.length === 0) return <p className="${kebab}-empty">No HTTP routes detected.</p>;`);
    lines.push(`  return (`);
    lines.push(`    <table className="${kebab}-table">`);
    lines.push(`      <thead><tr><th>Method</th><th>Path</th><th>Source</th></tr></thead>`);
    lines.push(`      <tbody>`);
    lines.push(`        {ROUTES.map((r) => (`);
    lines.push(`          <tr key={r.method + " " + r.path}>`);
    lines.push(`            <td><code>{r.method}</code></td>`);
    lines.push(`            <td><code>{r.path}</code></td>`);
    lines.push(`            <td><code>{r.source}</code></td>`);
    lines.push(`          </tr>`);
    lines.push(`        ))}`);
    lines.push(`      </tbody>`);
    lines.push(`    </table>`);
    lines.push(`  );`);
    lines.push(`}`);
    lines.push("");
    lines.push(`function Models() {`);
    lines.push(`  if (MODELS.length === 0) return <p className="${kebab}-empty">No domain models detected.</p>;`);
    lines.push(`  return (`);
    lines.push(`    <ul className="${kebab}-list">`);
    lines.push(`      {MODELS.map((m) => (`);
    lines.push(`        <li key={m.name}>`);
    lines.push(`          <strong>{m.name}</strong> <span className="${kebab}-meta">({m.kind}, {m.fields} fields)</span> <code>{m.source}</code>`);
    lines.push(`        </li>`);
    lines.push(`      ))}`);
    lines.push(`    </ul>`);
    lines.push(`  );`);
    lines.push(`}`);
    lines.push("");
    lines.push(`function EntryPoints() {`);
    lines.push(`  if (ENTRY_POINTS.length === 0) return <p className="${kebab}-empty">No entry points detected.</p>;`);
    lines.push(`  return (`);
    lines.push(`    <ul className="${kebab}-list">`);
    lines.push(`      {ENTRY_POINTS.map((e) => (`);
    lines.push(`        <li key={e.path}><code>{e.path}</code> <span className="${kebab}-meta">— {e.type}</span></li>`);
    lines.push(`      ))}`);
    lines.push(`    </ul>`);
    lines.push(`  );`);
    lines.push(`}`);
    lines.push("");
    lines.push(`export function ${componentName}() {`);
    lines.push(`  return (`);
    lines.push(`    <ErrorBoundary>`);
    lines.push(`      <main className="${kebab}-app">`);
    lines.push(`        <header className="${kebab}-header">`);
    lines.push(`          <h1 className="${kebab}-title">${componentName}</h1>`);
    lines.push(`          <p className="${kebab}-tagline">${(id.description ?? "Generated by Axis Artifacts.").replace(/"/g, '\\"')}</p>`);
    lines.push(`        </header>`);
    lines.push(`        <Section title="Routes">`);
    lines.push(`          <Routes />`);
    lines.push(`        </Section>`);
    lines.push(`        <Section title="Domain Models">`);
    lines.push(`          <Models />`);
    lines.push(`        </Section>`);
    lines.push(`        <Section title="Entry Points">`);
    lines.push(`          <EntryPoints />`);
    lines.push(`        </Section>`);
    lines.push(`      </main>`);
    lines.push(`    </ErrorBoundary>`);
    lines.push(`  );`);
    lines.push(`}`);
    lines.push("");
    lines.push(`export default ${componentName};`);
  } else {
    // Vanilla TS path. Render an App-shaped factory that builds a static DOM
    // tree instead of a tiny div+h2 placeholder.
    lines.push(`/**`);
    lines.push(` * ${id.name} — vanilla DOM app factory.`);
    lines.push(` * Language: ${id.primary_language}`);
    lines.push(` */`);
    lines.push("");
    lines.push(`export interface ${componentName}Options { mount: HTMLElement }`);
    lines.push("");
    lines.push(`const ROUTES = ${JSON.stringify(routes.slice(0, 12).map(r => `${r.method.toUpperCase()} ${r.path}`))};`);
    lines.push(`const MODELS = ${JSON.stringify(models.slice(0, 8).map(m => m.name))};`);
    lines.push("");
    lines.push(`export function create${componentName}({ mount }: ${componentName}Options) {`);
    lines.push(`  const root = document.createElement("main");`);
    lines.push(`  root.className = "${kebab}-app";`);
    lines.push(`  root.innerHTML = \`<header><h1>${componentName}</h1></header>`);
    lines.push(`    <section><h2>Routes</h2><ul>\${ROUTES.map(r => "<li><code>" + r + "</code></li>").join("")}</ul></section>`);
    lines.push(`    <section><h2>Models</h2><ul>\${MODELS.map(m => "<li>" + m + "</li>").join("")}</ul></section>\`;`);
    lines.push(`  mount.appendChild(root);`);
    lines.push(`  return root;`);
    lines.push(`}`);
  }

  return {
    path: "generated-component.tsx",
    content: lines.join("\n") + "\n",
    content_type: "text/typescript",
    program: "artifacts",
    description: `App-shaped ${isReact ? "React" : isSvelte ? "Svelte" : isVue ? "Vue" : "vanilla"} component for ${id.name}: error boundary, header, and sections driven by the snapshot's routes / models / entry points. Mounts at <div id=\"root\">. Pairs with theme.css.`,
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

// ─── capability-map.yaml ────────────────────────────────────────
// Catalog of third-party-resell capabilities AXIS currently fronts (or
// plans to front) as `iliad_*` MCP tools, with the AXIS-owned
// replication path for each. The capability registry is hand-curated
// from the resell-tool strategy; the detection layer reads ctx +
// package.json signals to mark which of these capabilities the
// analyzed repo already depends on, so consumers see "you use OpenAI
// + Stripe + Resend — here's what AXIS-owned equivalents look like."

interface ResellProvider {
  /** Official product name shown to humans. */
  name: string;
  /** Public URL agents can resolve to the homepage. */
  url: string;
  /** Per-call retail pricing summary. Approximate; for capability-mapping context, not billing. */
  retail_pricing: string;
}

interface ResellCapability {
  /** Slug used as the YAML key and as part of the AXIS-branded MCP tool name. */
  id: string;
  /** Human-readable capability name. */
  name: string;
  /** AXIS-branded tool name. Empty string means the tool has not been minted yet. */
  axis_brand_tool: string;
  /** Pricing-tier slug from @axis/mpp that backs this resell tool, if minted. */
  pricing_tier: string | null;
  /**
   * Current ownership status:
   *   - `live_proxy`     — AXIS forwards to a third-party provider with AXIS auth + billing.
   *   - `planned_proxy`  — capability is on the roadmap; no AXIS surface yet.
   *   - `planned_owned`  — AXIS-owned implementation planned but not shipped.
   *   - `owned`          — AXIS-owned implementation shipped inside Iliad.
   *   - `sibling_owned`  — AXIS platform owns it, but in a sibling process
   *                        (e.g. AXIS Foundry for 3D / image generation). Iliad
   *                        does NOT expose an MCP tool for it; agents are
   *                        directed to the sibling process via `sibling_process`.
   */
  status: "live_proxy" | "planned_proxy" | "planned_owned" | "owned" | "sibling_owned";
  /**
   * When status is `sibling_owned`, names the sibling AXIS process responsible
   * for this capability and where to find it. Omitted for all other statuses.
   */
  sibling_process?: {
    /** Process name, e.g. "AXIS Foundry". */
    name: string;
    /** Repo URL or platform location. */
    url: string;
    /** Short note on why the sibling owns it (architectural rationale). */
    rationale: string;
  };
  /** One-line capability summary. */
  summary: string;
  /** Third-party providers that supply this capability today (in priority order). */
  providers: ResellProvider[];
  /** Detection signals — regexes / env var names / file paths that imply the repo uses this capability. */
  detection: {
    /** Package.json dependency patterns. */
    deps?: string[];
    /** Env-var names. */
    envs?: string[];
    /** Source-file content regex patterns (any match = detected). */
    content_patterns?: string[];
  };
  /** Inputs the AXIS-owned tool accepts (when minted). */
  inputs: Array<{ name: string; type: string; required: boolean; description: string }>;
  /** Outputs the AXIS-owned tool returns. */
  outputs: Array<{ name: string; type: string; description: string }>;
  /** Concrete plan for the AXIS-owned implementation. */
  replication_plan: {
    runtime: string;
    persistence: string | null;
    key_dependencies: string[];
    differentiators: string[];
    estimated_effort: "small" | "medium" | "large";
  };
  /** Why an MCP-first AXIS-owned version beats reselling. */
  axis_advantages: string[];
}

const RESELL_CAPABILITIES: ResellCapability[] = [
  {
    id: "web_research",
    name: "Web scrape (single URL → clean markdown)",
    axis_brand_tool: "iliad_web_research",
    pricing_tier: "iliad_web_research",
    status: "live_proxy",
    summary: "Fetch a URL, strip chrome and boilerplate, return reader-friendly markdown plus structured metadata.",
    providers: [
      { name: "Firecrawl", url: "https://firecrawl.dev", retail_pricing: "$15/mo Hobby (1k pages), $89/mo Standard (10k)" },
      { name: "ScrapingBee", url: "https://www.scrapingbee.com", retail_pricing: "$49/mo (150k credits)" },
      { name: "Apify", url: "https://apify.com", retail_pricing: "pay-as-you-go ~$0.25/1k pages" },
    ],
    detection: {
      deps: ["firecrawl", "@mendable/firecrawl-js", "puppeteer", "playwright", "cheerio"],
      envs: ["FIRECRAWL_API_KEY", "SCRAPINGBEE_API_KEY"],
      content_patterns: ["firecrawl\\.dev", "scrapingbee\\.com"],
    },
    inputs: [
      { name: "url", type: "string", required: true, description: "URL to scrape." },
      { name: "format", type: "\"markdown\" | \"html\" | \"json\"", required: false, description: "Output format. Defaults to markdown." },
      { name: "include_links", type: "boolean", required: false, description: "Emit a links[] array alongside content." },
    ],
    outputs: [
      { name: "markdown", type: "string", description: "Reader-friendly markdown with chrome stripped." },
      { name: "title", type: "string", description: "Page title (og:title, then <title>, then h1)." },
      { name: "links", type: "string[]", description: "Outbound links, when include_links=true." },
      { name: "fetched_at", type: "string (ISO 8601)", description: "Timestamp of the scrape." },
    ],
    replication_plan: {
      runtime: "Cloudflare Workers + Browser Rendering API, or self-hosted Playwright pool on RunPod",
      persistence: "Cloudflare KV cache, 24h TTL keyed by SHA-256(url)",
      key_dependencies: ["playwright", "@cloudflare/puppeteer", "readability (Mozilla) for content extraction", "cheerio (fallback)"],
      differentiators: [
        "Network-wide 24h cache — popular URLs return free at full speed",
        "Deterministic output — same URL + same fetched_at returns the same markdown",
        "MCP-native return shape — no client SDK required, just JSON",
      ],
      estimated_effort: "medium",
    },
    axis_advantages: [
      "No per-page Firecrawl markup — wholesale infrastructure cost ~$0.001/page vs ~$0.01 retail",
      "Cache hits are pure margin and instant for agents",
      "First-class MCP error envelope on render failures (Firecrawl returns raw 500s)",
    ],
  },
  {
    id: "web_crawl",
    name: "Domain crawl (follow links to N pages)",
    axis_brand_tool: "iliad_web_research_crawl",
    pricing_tier: "iliad_web_research_crawl",
    status: "live_proxy",
    summary: "Crawl up to N pages from a single domain, deduplicating URLs and returning each page's markdown.",
    providers: [
      { name: "Firecrawl", url: "https://firecrawl.dev", retail_pricing: "100-page crawl ≈ $1 retail" },
      { name: "Apify Web Scraper", url: "https://apify.com", retail_pricing: "$0.40/1k pages on shared proxy" },
    ],
    detection: {
      deps: ["firecrawl", "@mendable/firecrawl-js", "playwright-crawler", "crawlee"],
      envs: ["FIRECRAWL_API_KEY"],
      content_patterns: ["firecrawl.*crawl", "crawlee"],
    },
    inputs: [
      { name: "domain", type: "string", required: true, description: "Root domain to crawl. URLs outside the domain are not followed." },
      { name: "max_pages", type: "number", required: false, description: "Cap on pages returned. Lite mode = 5, standard = up to 100." },
      { name: "include_paths", type: "string[]", required: false, description: "Glob patterns restricting which paths to crawl." },
    ],
    outputs: [
      { name: "pages", type: "Array<{url, title, markdown, fetched_at}>", description: "Crawled pages." },
      { name: "skipped", type: "Array<{url, reason}>", description: "URLs that hit the path filter or fetch errors." },
    ],
    replication_plan: {
      runtime: "Same Playwright pool as iliad_web_research, with a BFS queue keyed by hostname",
      persistence: "KV cache + per-domain robots.txt cache, 1h TTL",
      key_dependencies: ["playwright", "robots-parser", "p-queue for concurrency control"],
      differentiators: [
        "Respects robots.txt and rate-limits per-host",
        "Resumable: pass a previous crawl_id to continue where it stopped",
        "Returns sitemap-derived structure even on JavaScript-rendered sites",
      ],
      estimated_effort: "medium",
    },
    axis_advantages: [
      "Crawl + dedupe + cache run in one round-trip on AXIS infra; on Firecrawl each page is a separate billed call",
      "Resume tokens are an AXIS abstraction — no equivalent on Firecrawl",
    ],
  },
  {
    id: "llm_inference",
    name: "Chat completion / structured-output LLM call",
    axis_brand_tool: "iliad_llm_inference",
    pricing_tier: "$0.02 standard / $0.01 lite per call (in-process inference; no upstream per-token API fee). Requires operator-configured GGUF model at AXIS_LLM_MODEL_PATH.",
    status: "owned",
    summary: "Run a prompt through an LLM and return text or JSON, with optional structured-output schema enforcement.",
    providers: [
      { name: "OpenAI", url: "https://openai.com", retail_pricing: "$2.50/1M input · $10/1M output (gpt-4o)" },
      { name: "Anthropic", url: "https://anthropic.com", retail_pricing: "$3/1M input · $15/1M output (sonnet)" },
      { name: "Replicate (open-weights)", url: "https://replicate.com", retail_pricing: "~$0.50/1M tokens (llama-3.1-70b)" },
    ],
    detection: {
      deps: ["openai", "@anthropic-ai/sdk", "ai", "@ai-sdk/openai", "@ai-sdk/anthropic", "ollama"],
      envs: ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "REPLICATE_API_TOKEN", "GROQ_API_KEY"],
      content_patterns: ["openai\\.com", "anthropic\\.com", "chat\\.completions", "messages\\.create"],
    },
    inputs: [
      { name: "messages", type: "Array<{role, content}>", required: true, description: "Standard chat-completion messages." },
      { name: "model_tier", type: "\"fast\" | \"balanced\" | \"deep\"", required: false, description: "AXIS routes to the cheapest model that meets the tier." },
      { name: "response_schema", type: "JSON Schema", required: false, description: "Force structured output." },
    ],
    outputs: [
      { name: "content", type: "string | object", description: "Text or parsed structured output." },
      { name: "model_used", type: "string", description: "Concrete backend the router picked." },
      { name: "tokens", type: "{input, output}", description: "Token counts for billing." },
    ],
    replication_plan: {
      runtime: "Edge router (Cloudflare Workers AI for fast tier; Bedrock / vLLM on RunPod for balanced; OpenAI/Anthropic passthrough for deep)",
      persistence: "Prompt-cache via @axis/snapshots so identical (messages, schema) returns cached output",
      key_dependencies: ["@cloudflare/ai", "vllm (RunPod)", "llama.cpp for local CPU fallback"],
      differentiators: [
        "Tier-based routing — agents say \"fast/balanced/deep\" not \"gpt-4o vs sonnet\"",
        "Prompt-cache keyed by snapshot_id — agents that ask the same question twice in a session pay once",
        "Deterministic mode (temperature=0 + seed) is a first-class flag, not a model-specific quirk",
      ],
      estimated_effort: "large",
    },
    axis_advantages: [
      "Single billing surface across providers — agents don't manage 4 API keys",
      "Automatic failover when a provider rate-limits",
      "Compliance: structured output is validated against the schema before it leaves AXIS infra",
    ],
  },
  {
    id: "embeddings",
    name: "Vector embeddings for semantic search and RAG",
    axis_brand_tool: "iliad_embeddings",
    pricing_tier: null,
    status: "live_proxy",
    summary: "AXIS-branded wrapper around OpenAI /v1/embeddings (configurable model via OPENAI_EMBEDDING_MODEL). Pairs natively with iliad_vector_database — same auth + billing surface, no juggling third-party SDKs. Future swap to fastembed-ONNX is a module-internal change.",
    providers: [
      { name: "OpenAI", url: "https://openai.com", retail_pricing: "$0.02/1M tokens (text-embedding-3-small)" },
      { name: "Cohere", url: "https://cohere.com", retail_pricing: "$0.10/1M tokens (embed-english-v3)" },
      { name: "Voyage AI", url: "https://www.voyageai.com", retail_pricing: "$0.05/1M (voyage-3)" },
    ],
    detection: {
      deps: ["openai", "cohere-ai", "voyageai", "@xenova/transformers", "fastembed", "@chroma/chroma"],
      envs: ["OPENAI_API_KEY", "COHERE_API_KEY", "VOYAGE_API_KEY"],
      content_patterns: ["embeddings\\.create", "/v1/embeddings", "voyageai", "cohere.*embed", "fastembed"],
    },
    inputs: [
      { name: "input", type: "string | string[]", required: true, description: "Text or batch of texts to embed." },
      { name: "dimensions", type: "number", required: false, description: "Vector size. Defaults to 1024." },
    ],
    outputs: [
      { name: "vectors", type: "number[][]", description: "Dense vectors. Length matches input array length." },
      { name: "model_used", type: "string", description: "Concrete embedding model used." },
    ],
    replication_plan: {
      runtime: "fastembed (ONNX) on Cloudflare Workers for the small tier; vLLM serving BAAI/bge-large on RunPod for the high-recall tier",
      persistence: "Embedding cache keyed by SHA-256(input + model). Hits are free.",
      key_dependencies: ["fastembed", "onnxruntime-web", "bge-large-en-v1.5"],
      differentiators: [
        "Sub-50ms p95 on cached inputs",
        "Single endpoint serves all dimensions via Matryoshka truncation",
        "Free tier: 1M tokens/month — most projects never pay",
      ],
      estimated_effort: "medium",
    },
    axis_advantages: [
      "Wholesale infrastructure cost on open-weights is ~$0.002/1M tokens vs $0.02 retail (10× margin)",
      "Caching makes most production RAG workloads effectively free",
      "Same API surface as the LLM inference router — one auth token, one billing line",
    ],
  },
  {
    id: "image_generation",
    name: "Generative visual asset creation (2D images + 3D models)",
    axis_brand_tool: "",
    pricing_tier: null,
    status: "sibling_owned",
    sibling_process: {
      name: "AXIS Foundry",
      url: "https://github.com/lastmanupinc-hub/AXIS-Foundry",
      rationale:
        "Generative visual assets are owned by AXIS Foundry — an AI-native 3D resources foundry " +
        "(avatars, props, vehicles, environments, VFX, weapons/armor) with its own canonical contract " +
        "system, 17-stage production pipeline, and marketplace integration. Iliad intentionally does " +
        "NOT mint an iliad_image_generation tool because the platform-level capability is delivered by " +
        "the Foundry sibling process — agents that need visual generation should call Foundry directly.",
    },
    summary:
      "Generative visual asset creation. Owned at the platform level by AXIS Foundry (3D-first: " +
      "avatars + props + vehicles + environments + VFX + weapons/armor; 2D images follow). Not " +
      "exposed via Iliad MCP — call Foundry directly.",
    providers: [
      { name: "AXIS Foundry (sibling process)", url: "https://github.com/lastmanupinc-hub/AXIS-Foundry", retail_pricing: "Internal AXIS pricing — see Foundry's own pricing surface" },
      { name: "Replicate (external fallback)", url: "https://replicate.com", retail_pricing: "~$0.003/image (sdxl), ~$0.04/image (flux-pro)" },
      { name: "OpenAI DALL-E (external fallback)", url: "https://openai.com", retail_pricing: "$0.04 / image (dall-e-3 1024x1024)" },
    ],
    detection: {
      deps: ["replicate", "openai", "@fal-ai/serverless-client"],
      envs: ["REPLICATE_API_TOKEN", "OPENAI_API_KEY", "FAL_KEY"],
      content_patterns: ["images\\.generate", "/v1/images", "replicate.*flux", "fal\\.ai"],
    },
    inputs: [
      { name: "prompt", type: "string", required: true, description: "Visual prompt (3D asset description for Foundry, text-to-image prompt for external fallbacks)." },
      { name: "asset_kind", type: "AVATAR | PROP | VEHICLE | ENVIRONMENT | VFX | WEAPON_ARMOR | CHARACTER_ACCESSORY | GENERIC | IMAGE_2D", required: false, description: "Foundry asset taxonomy. Defaults to AVATAR (Foundry's production path)." },
    ],
    outputs: [
      { name: "asset_url", type: "string", description: "URL of the generated asset (GLB for 3D via Foundry; PNG for 2D image fallback)." },
      { name: "provenance", type: "object", description: "Foundry's CanonicalAssetContract — versioned, SHA-256-hashed, marketplace-ready." },
    ],
    replication_plan: {
      runtime: "AXIS Foundry — pure Python 3.11+, zero runtime deps. 17-stage avatar pipeline (classify → normalize → repair → 65-bone rig → skin → validate → facial → texture → animate → LOD → preview → export).",
      persistence: "Foundry's own provenance store (SHA-256-hashed contracts per stage); marketplace listings via TrustFabric / PAI payloads.",
      key_dependencies: ["axis-foundry (sibling process, MIT)", "GoldenSlice workflow runtime"],
      differentiators: [
        "3D-first — Iliad's catalog peers ship 2D-only; Foundry ships production-grade rigged 3D assets (humanoid 65-bone, quadruped 52-bone, mech 35-bone)",
        "12,447-outcome regression suite — 12,443 pass, 3 skip, 1 xfail with strict CI provenance auditing",
        "Cross-engine export — Unity, Unreal, Godot, Roblox",
        "Marketplace-ready outputs including TrustFabric / PAI listing payloads",
      ],
      estimated_effort: "small",
    },
    axis_advantages: [
      "Sibling-process architecture: Iliad stays focused on codebase intelligence + MCP surface; Foundry stays focused on visual generation. Each ships independently.",
      "Foundry's CanonicalAssetContract drops directly into AXIS marketplace + Visa CE3.0 evidence bundles — provenance is first-class, not retrofitted.",
      "Open-source MIT — operators can self-host the entire generation pipeline.",
    ],
  },
  {
    id: "text_to_speech",
    name: "Text-to-speech audio synthesis",
    axis_brand_tool: "",
    pricing_tier: null,
    status: "planned_proxy",
    summary: "Synthesize text to speech in a selected voice; outputs MP3 or Opus.",
    providers: [
      { name: "ElevenLabs", url: "https://elevenlabs.io", retail_pricing: "$0.18/1k chars (Creator)" },
      { name: "OpenAI TTS", url: "https://openai.com", retail_pricing: "$15/1M chars (tts-1)" },
      { name: "Cartesia (Sonic)", url: "https://cartesia.ai", retail_pricing: "$0.065/1k chars" },
    ],
    detection: {
      deps: ["elevenlabs", "@elevenlabs/elevenlabs-js", "openai", "@cartesia/cartesia-js"],
      envs: ["ELEVENLABS_API_KEY", "OPENAI_API_KEY", "CARTESIA_API_KEY"],
      content_patterns: ["elevenlabs\\.io", "audio\\.speech", "cartesia\\.ai"],
    },
    inputs: [
      { name: "text", type: "string", required: true, description: "Text to speak." },
      { name: "voice", type: "string", required: false, description: "Voice slug. AXIS publishes 8 stock voices." },
      { name: "format", type: "\"mp3\" | \"opus\" | \"wav\"", required: false, description: "Audio codec. Defaults to mp3." },
    ],
    outputs: [
      { name: "audio_url", type: "string", description: "24h-signed URL pointing at the rendered audio." },
      { name: "duration_seconds", type: "number", description: "Rendered audio length." },
    ],
    replication_plan: {
      runtime: "Coqui XTTS-v2 (open-weights) on RunPod; F5-TTS for the prosody-controlled tier",
      persistence: "R2-backed output, cache keyed by SHA-256(text + voice + format)",
      key_dependencies: ["xtts-v2", "f5-tts", "opus-encoder"],
      differentiators: [
        "Voice clone from 6-second sample is opt-in, gated by content-policy review",
        "Cache hits for marketing copy / podcast intros are free after first render",
        "Output is C2PA-signed; useful for any commerce-related voice prompts",
      ],
      estimated_effort: "medium",
    },
    axis_advantages: [
      "Open-weights inference ≈ $0.005/1k chars vs $0.18 (36× margin)",
      "No ElevenLabs character cap — AXIS amortizes long-form synthesis cost across cache hits",
    ],
  },
  {
    id: "speech_to_text",
    name: "Audio transcription with diarization",
    axis_brand_tool: "",
    pricing_tier: null,
    status: "planned_proxy",
    summary: "Transcribe audio to text with speaker diarization and timestamp segmentation.",
    providers: [
      { name: "Deepgram", url: "https://deepgram.com", retail_pricing: "$0.0043/min (Nova-3)" },
      { name: "OpenAI Whisper", url: "https://openai.com", retail_pricing: "$0.006/min (whisper-1)" },
      { name: "AssemblyAI", url: "https://www.assemblyai.com", retail_pricing: "$0.0065/min (Universal-2)" },
    ],
    detection: {
      deps: ["@deepgram/sdk", "openai", "assemblyai"],
      envs: ["DEEPGRAM_API_KEY", "OPENAI_API_KEY", "ASSEMBLYAI_API_KEY"],
      content_patterns: ["audio\\.transcriptions", "deepgram\\.com", "assemblyai\\.com"],
    },
    inputs: [
      { name: "audio_url", type: "string", required: true, description: "URL to audio file." },
      { name: "diarize", type: "boolean", required: false, description: "Emit speaker labels per segment. Defaults to false." },
    ],
    outputs: [
      { name: "transcript", type: "string", description: "Full transcript text." },
      { name: "segments", type: "Array<{start, end, speaker, text}>", description: "Timestamped segments." },
    ],
    replication_plan: {
      runtime: "whisper.cpp on Cloudflare Workers (CPU) for short audio; faster-whisper on RunPod GPU for long audio",
      persistence: "Transcript cache keyed by SHA-256(audio bytes)",
      key_dependencies: ["whisper.cpp", "faster-whisper", "pyannote-audio (diarization)"],
      differentiators: [
        "Audio fingerprint cache — re-transcribing the same recording is free",
        "Diarization is open-weights (pyannote) — no third-party dependency",
        "Returns word-level timestamps even on the free tier",
      ],
      estimated_effort: "medium",
    },
    axis_advantages: [
      "Open-weights whisper-large-v3 inference ≈ $0.0005/min vs $0.0043 retail (8× margin)",
      "GDPR-friendly — audio never leaves AXIS infra",
    ],
  },
  {
    id: "document_parsing",
    name: "PDF / Office document → structured Markdown",
    axis_brand_tool: "",
    pricing_tier: null,
    status: "planned_proxy",
    summary: "Convert PDFs, DOCX, PPTX, and HTML into clean Markdown with extracted tables and headings.",
    providers: [
      { name: "LlamaParse", url: "https://www.llamaindex.ai", retail_pricing: "$0.003/page (Free tier 1k pages/day)" },
      { name: "Unstructured.io", url: "https://unstructured.io", retail_pricing: "$0.10/page (Serverless API)" },
      { name: "Mathpix", url: "https://mathpix.com", retail_pricing: "$0.012/page (Convert API)" },
    ],
    detection: {
      deps: ["llamaparse", "unstructured-client", "mathpix-markdown-it", "pdf-parse", "pdfjs-dist"],
      envs: ["LLAMA_CLOUD_API_KEY", "UNSTRUCTURED_API_KEY", "MATHPIX_API_KEY"],
      content_patterns: ["llamaparse", "unstructured\\.io", "pdf-parse"],
    },
    inputs: [
      { name: "document_url", type: "string", required: true, description: "URL to PDF, DOCX, PPTX, or HTML." },
      { name: "extract_tables", type: "boolean", required: false, description: "Emit a tables[] array alongside the markdown." },
    ],
    outputs: [
      { name: "markdown", type: "string", description: "Structured markdown with H1-H6 hierarchy preserved." },
      { name: "tables", type: "Array<{rows: string[][], page}>", description: "Detected tables." },
      { name: "page_count", type: "number", description: "Total pages parsed." },
    ],
    replication_plan: {
      runtime: "Marker (open-weights, MIT) running on RunPod for PDF; mammoth for DOCX; pptxgenjs for PPTX",
      persistence: "Parse cache keyed by SHA-256(document bytes)",
      key_dependencies: ["marker-pdf", "mammoth", "pptx2html", "tesseract.js for image-only PDFs"],
      differentiators: [
        "Marker handles math + scientific tables better than Unstructured's free tier",
        "Cache-keyed by document hash so re-parsing the same RFP is free",
        "AXIS provenance: every output ships a manifest of which extractor ran per page",
      ],
      estimated_effort: "medium",
    },
    axis_advantages: [
      "Marker inference ≈ $0.0001/page vs $0.10/page Unstructured retail",
      "Open-weights stack avoids LlamaParse's commercial usage restrictions",
    ],
  },
  {
    id: "web_search",
    name: "Web search results (organic + answer boxes)",
    axis_brand_tool: "",
    pricing_tier: null,
    status: "planned_proxy",
    summary: "Run a search query and return organic results plus answer-box / featured-snippet data.",
    providers: [
      { name: "Tavily", url: "https://tavily.com", retail_pricing: "$0.005/query (Pro)" },
      { name: "Brave Search", url: "https://search.brave.com/help/api", retail_pricing: "$3/1k queries (Pro plan)" },
      { name: "SerpAPI", url: "https://serpapi.com", retail_pricing: "$50/mo (5k searches)" },
    ],
    detection: {
      deps: ["@tavily/core", "tavily", "brave-search", "serpapi"],
      envs: ["TAVILY_API_KEY", "BRAVE_API_KEY", "SERPAPI_API_KEY"],
      content_patterns: ["tavily\\.com", "search\\.brave\\.com", "serpapi\\.com"],
    },
    inputs: [
      { name: "query", type: "string", required: true, description: "Search query." },
      { name: "max_results", type: "number", required: false, description: "Cap on organic results. Defaults to 10." },
      { name: "site", type: "string", required: false, description: "Restrict to a domain (e.g. 'docs.python.org')." },
    ],
    outputs: [
      { name: "results", type: "Array<{url, title, snippet}>", description: "Organic results in rank order." },
      { name: "answer_box", type: "{text, source} | null", description: "Featured-snippet content when present." },
    ],
    replication_plan: {
      runtime: "SearXNG metasearch on RunPod, fronted by AXIS-owned crawler index for popular queries",
      persistence: "Query result cache, 24h TTL keyed by SHA-256(query + site)",
      key_dependencies: ["searxng", "@elastic/elasticsearch (for own-index queries)"],
      differentiators: [
        "AXIS owns the index for the top 10k programming queries — sub-50ms response, no third-party calls",
        "Result rankings are transparent (we publish the weighting) — Brave/Tavily are black boxes",
        "Cache deduplicates near-identical queries within a session",
      ],
      estimated_effort: "large",
    },
    axis_advantages: [
      "Cached-hit cost ≈ free; cold-query cost ≈ $0.0005 vs $0.005 Tavily (10× margin)",
      "No rate-limit ceiling for paid customers",
    ],
  },
  {
    id: "code_sandbox",
    name: "Sandboxed code execution",
    axis_brand_tool: "iliad_code_sandbox",
    pricing_tier: "$0.05 standard / $0.02 lite per call (covers Docker container spawn + teardown overhead at ~1-2s cold start). Requires a reachable Docker daemon — Render standard services don't expose /var/run/docker.sock; deploy on a host with Docker access.",
    status: "owned",
    summary: "Execute untrusted Python / Node / shell code in an isolated sandbox and return stdout, stderr, and exit code.",
    providers: [
      { name: "E2B", url: "https://e2b.dev", retail_pricing: "$0.07/hr (Compute Time)" },
      { name: "Modal", url: "https://modal.com", retail_pricing: "$0.000056/CPU-sec ($0.20/hr)" },
      { name: "Daytona", url: "https://daytona.io", retail_pricing: "$0.10/hr (Cloud sandbox)" },
    ],
    detection: {
      deps: ["@e2b/sdk", "@e2b/code-interpreter", "modal", "daytona-sdk"],
      envs: ["E2B_API_KEY", "MODAL_TOKEN_ID", "DAYTONA_API_KEY"],
      content_patterns: ["e2b\\.dev", "modal\\.com", "code_interpreter", "daytona-sdk", "@e2b/"],
    },
    inputs: [
      { name: "language", type: "\"python\" | \"node\" | \"bash\"", required: true, description: "Runtime language." },
      { name: "code", type: "string", required: true, description: "Code to execute." },
      { name: "timeout_seconds", type: "number", required: false, description: "Wall-clock limit. Defaults to 30, max 600." },
    ],
    outputs: [
      { name: "stdout", type: "string", description: "Captured stdout." },
      { name: "stderr", type: "string", description: "Captured stderr." },
      { name: "exit_code", type: "number", description: "Process exit code." },
      { name: "duration_ms", type: "number", description: "Actual wall-clock time used." },
    ],
    replication_plan: {
      runtime: "Firecracker microVMs on AXIS-owned bare metal; alternatively gVisor on AWS Fargate Spot",
      persistence: "Snapshot the sandbox filesystem after each run; pass snapshot_id back to chain calls within a session",
      key_dependencies: ["firecracker", "containerd", "vsock-server for stdin/stdout streaming"],
      differentiators: [
        "Sub-200ms cold start (Firecracker boots fast)",
        "Filesystem snapshot return value — agents can chain runs without re-uploading data",
        "Network egress disabled by default; agents opt in per-run with explicit allowlist",
      ],
      estimated_effort: "large",
    },
    axis_advantages: [
      "Bare-metal Firecracker cost ≈ $0.01/hr per concurrent sandbox vs $0.07 E2B (7× margin)",
      "Filesystem snapshots are an AXIS abstraction — no equivalent on E2B/Modal",
      "Egress firewall is a first-class flag, important for the compliance posture",
    ],
  },
  {
    id: "object_storage",
    name: "Signed-URL object storage (uploads + downloads)",
    axis_brand_tool: "iliad_object_storage",
    pricing_tier: null,
    status: "owned",
    summary: "AXIS-owned signed-URL minter (R2-backed, SigV4, account-scoped key prefixes). Live as the iliad_object_storage MCP tool — first member of the owned tier.",
    providers: [
      { name: "AWS S3", url: "https://aws.amazon.com/s3/", retail_pricing: "$0.023/GB-month + egress" },
      { name: "Cloudflare R2", url: "https://www.cloudflare.com/products/r2/", retail_pricing: "$0.015/GB-month, zero egress" },
      { name: "Backblaze B2", url: "https://www.backblaze.com/b2/", retail_pricing: "$0.006/GB-month, $0.01/GB egress" },
    ],
    detection: {
      deps: ["@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner", "@cloudflare/r2", "minio"],
      envs: ["AWS_ACCESS_KEY_ID", "R2_ACCESS_KEY_ID", "S3_BUCKET", "R2_BUCKET"],
      content_patterns: ["s3\\.amazonaws\\.com", "r2\\.cloudflarestorage\\.com", "presignedUrl", "getSignedUrl"],
    },
    inputs: [
      { name: "key", type: "string", required: true, description: "Object key." },
      { name: "operation", type: "\"put\" | \"get\"", required: true, description: "Pre-sign upload or download." },
      { name: "ttl_seconds", type: "number", required: false, description: "Signed-URL lifetime. Defaults to 3600 (1h)." },
    ],
    outputs: [
      { name: "url", type: "string", description: "Pre-signed URL." },
      { name: "expires_at", type: "string (ISO 8601)", description: "URL expiry timestamp." },
    ],
    replication_plan: {
      runtime: "Cloudflare R2 fronted by an AXIS-owned signing service (zero-egress is the killer feature)",
      persistence: "R2 buckets per account, lifecycle rules per tier",
      key_dependencies: ["@aws-sdk/s3-request-presigner (R2 is S3-compatible)", "@cloudflare/r2"],
      differentiators: [
        "Zero egress fees — predictable cost regardless of download volume",
        "Account-scoped buckets with audit logging baked in",
        "MCP-native signed-URL minting — no need to install an SDK",
      ],
      estimated_effort: "small",
    },
    axis_advantages: [
      "R2's zero-egress model means AXIS-owned object storage is materially cheaper than S3 once download volume crosses ~10 GB/account/month",
      "Already trusted infra (Cloudflare) — no new ops surface to monitor",
    ],
  },
  {
    id: "transactional_email",
    name: "Transactional email (auth, receipts, notifications)",
    axis_brand_tool: "iliad_transactional_email",
    pricing_tier: null,
    status: "live_proxy",
    summary: "AXIS-branded wrapper around Resend /emails. Agents send arbitrary subject + body_html/body_text content; all messages ship from RESEND_FROM_ADDRESS (verified domain). Internal welcome/upgrade/usage-alert emails keep their template-bound pipeline. Future swap to a self-hosted MTA is a module-internal change.",
    providers: [
      { name: "Resend", url: "https://resend.com", retail_pricing: "$20/mo (50k emails) — current AXIS provider" },
      { name: "Postmark", url: "https://postmarkapp.com", retail_pricing: "$15/mo (10k)" },
      { name: "AWS SES", url: "https://aws.amazon.com/ses/", retail_pricing: "$0.10/1k emails" },
    ],
    detection: {
      deps: ["resend", "postmark", "@aws-sdk/client-sesv2", "nodemailer"],
      envs: ["RESEND_API_KEY", "POSTMARK_API_TOKEN", "AWS_REGION"],
      content_patterns: ["resend\\.com", "postmark", "sendmail"],
    },
    inputs: [
      { name: "to", type: "string | string[]", required: true, description: "Recipient(s)." },
      { name: "subject", type: "string", required: true, description: "Email subject." },
      { name: "body", type: "{html?, text?}", required: true, description: "HTML or plaintext body." },
    ],
    outputs: [
      { name: "message_id", type: "string", description: "Provider-assigned message ID." },
      { name: "delivered_to", type: "string[]", description: "Recipients the provider accepted." },
    ],
    replication_plan: {
      runtime: "haraka or postal MTA on a hardened VPS, with R2-backed bounce / complaint log; AWS SES as the relay-of-last-resort",
      persistence: "Per-account suppression list (bounces, complaints) in the existing snapshot DB",
      key_dependencies: ["haraka or postal", "@aws-sdk/client-sesv2 (relay)"],
      differentiators: [
        "Bounces and complaints surface directly in AXIS dashboards — no third-party log mining",
        "Per-tenant DKIM signing key — emails ship under the customer's domain when configured",
        "Suppression list shared across all AXIS tools (RAG outputs, marketing pack, etc.)",
      ],
      estimated_effort: "medium",
    },
    axis_advantages: [
      "Owning the MTA + relay split avoids Resend's per-email markup at scale (~$0.001/email vs $0.0004 own cost)",
      "Bounce + complaint data feeds the deliverability scoring used by the marketing program",
    ],
  },
  {
    id: "vector_database",
    name: "Vector database (semantic-search store)",
    axis_brand_tool: "iliad_vector_database",
    pricing_tier: null,
    status: "owned",
    summary: "AXIS-owned vector store (SQLite-backed flat search with cosine similarity, per-namespace account isolation). Live as the iliad_vector_database MCP tool. Targets ≤10k vectors per namespace today; LanceDB-on-R2 upgrade is a future module swap with stable public signatures.",
    providers: [
      { name: "Pinecone", url: "https://pinecone.io", retail_pricing: "$0.096/hr p2.x1 + storage" },
      { name: "Qdrant Cloud", url: "https://qdrant.tech", retail_pricing: "$25/mo (4GB starter)" },
      { name: "Weaviate Cloud", url: "https://weaviate.io", retail_pricing: "$25/mo (Sandbox+)" },
    ],
    detection: {
      deps: ["@pinecone-database/pinecone", "@qdrant/qdrant-js", "weaviate-ts-client", "@lancedb/lancedb"],
      envs: ["PINECONE_API_KEY", "QDRANT_API_KEY", "WEAVIATE_API_KEY"],
      content_patterns: ["pinecone\\.io", "qdrant\\.io", "weaviate", "vectorStore"],
    },
    inputs: [
      { name: "operation", type: "\"upsert\" | \"query\"", required: true, description: "Insert vectors or find nearest neighbors." },
      { name: "namespace", type: "string", required: false, description: "Logical isolation key. Defaults to the account ID." },
      { name: "vectors", type: "Array<{id, vector, metadata}>", required: false, description: "Vectors to upsert." },
      { name: "query", type: "{vector, top_k, filter?}", required: false, description: "Query parameters." },
    ],
    outputs: [
      { name: "upserted", type: "number", description: "Vectors written (upsert mode)." },
      { name: "matches", type: "Array<{id, score, metadata}>", description: "Nearest neighbors (query mode)." },
    ],
    replication_plan: {
      runtime: "LanceDB (Apache 2.0, columnar) backed by R2; Qdrant on a small VPS as the high-recall tier",
      persistence: "LanceDB stores natively on R2 — no separate persistence layer",
      key_dependencies: ["@lancedb/lancedb", "qdrant (self-hosted)"],
      differentiators: [
        "Columnar storage on R2 means free egress when serving results to the inference router",
        "Account-scoped namespaces enforced server-side (no \"oops queried wrong index\" bugs)",
        "Hybrid search (vector + BM25) is a built-in operation, not a separate API call",
      ],
      estimated_effort: "medium",
    },
    axis_advantages: [
      "LanceDB-on-R2 storage cost ≈ $0.015/GB-month vs Pinecone's $0.096/hr per p2.x1 (orders of magnitude cheaper at low scale)",
      "No per-pod fees — query throughput scales with the inference router instead",
      "Same auth + billing surface as the rest of the AXIS tool stack",
    ],
  },
  {
    id: "analytics",
    name: "Product analytics (events + funnels + cohorts)",
    axis_brand_tool: "iliad_analytics",
    pricing_tier: "Free up to 10k events/mo, $0.01/100 events thereafter; query operations $0.01/call",
    status: "owned",
    summary: "Record arbitrary user events and query funnels, cohorts, and retention curves.",
    providers: [
      { name: "PostHog Cloud", url: "https://posthog.com", retail_pricing: "$0/mo (1M events) → $0.00031/event (Scale)" },
      { name: "Plausible", url: "https://plausible.io", retail_pricing: "$9/mo (10k pageviews)" },
      { name: "Mixpanel", url: "https://mixpanel.com", retail_pricing: "$0.83/MTU (Growth)" },
    ],
    detection: {
      deps: ["posthog-js", "posthog-node", "@plausible/analytics", "mixpanel", "@segment/analytics-node"],
      envs: ["POSTHOG_API_KEY", "PLAUSIBLE_API_KEY", "MIXPANEL_TOKEN", "SEGMENT_WRITE_KEY"],
      content_patterns: ["posthog", "plausible", "mixpanel\\.com", "segment\\.io"],
    },
    inputs: [
      { name: "operation", type: "\"capture\" | \"query\"", required: true, description: "Record an event or run an analytics query." },
      { name: "event", type: "{name, distinct_id, properties}", required: false, description: "Event payload (capture mode)." },
      { name: "query", type: "{funnel?, cohort?, retention?}", required: false, description: "Analytics query (query mode)." },
    ],
    outputs: [
      { name: "result", type: "object", description: "Capture confirmation or query results." },
    ],
    replication_plan: {
      runtime: "PostHog OSS (Elastic 2.0) self-hosted on a small VPS for the long term — same UI, no metered billing",
      persistence: "PostgreSQL + ClickHouse stack (PostHog defaults), R2 cold storage for events > 90 days",
      key_dependencies: ["posthog-ee (self-hosted)", "clickhouse", "kafka for ingestion buffer"],
      differentiators: [
        "Identical PostHog query API — migrate by changing the host, no schema changes",
        "Account-scoped projects with billing-line attribution baked in",
        "Free tier covers what the proxy currently includes (1M events/month) — same UX as PostHog Cloud",
      ],
      estimated_effort: "medium",
    },
    axis_advantages: [
      "PostHog OSS at our scale costs ≈ $50/mo VPS + storage vs $1k+/mo PostHog Cloud at the same event volume",
      "Self-hosted means session-replay PII never leaves AXIS infra — material compliance win",
    ],
  },
];

function detectCapabilityUsage(cap: ResellCapability, files?: SourceFile[]): {
  detected: boolean;
  evidence: string[];
} {
  const evidence: string[] = [];
  if (!files || files.length === 0) return { detected: false, evidence };

  // ─── package.json check (root AND every workspace package.json) ──────
  // Monorepo workspace deps live in apps/*/package.json and packages/*/
  // package.json, not the root. Scanning all of them catches Firecrawl in
  // apps/api/package.json, OpenAI in apps/cli/package.json, etc.
  if (cap.detection.deps && cap.detection.deps.length > 0) {
    const pkgFiles = files.filter(f =>
      /(^|\/)package\.json$/i.test(f.path) &&
      !/(^|\/)node_modules\//i.test(f.path),
    );
    const seen = new Set<string>();
    for (const pkg of pkgFiles) {
      let deps: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(pkg.content) as Record<string, unknown>;
        deps = {
          ...((parsed.dependencies as Record<string, unknown>) ?? {}),
          ...((parsed.devDependencies as Record<string, unknown>) ?? {}),
          ...((parsed.peerDependencies as Record<string, unknown>) ?? {}),
        };
      } catch {
        continue;
      }
      for (const dep of cap.detection.deps) {
        if (deps[dep] && !seen.has(dep)) {
          evidence.push(`${pkg.path} depends on "${dep}"`);
          seen.add(dep);
        }
      }
    }
  }

  // ─── env-var declarations in env.ts / settings.py / .env* ────────────
  if (cap.detection.envs && cap.detection.envs.length > 0) {
    const envSources = files.filter(f =>
      /(^|\/)\.env(\.[\w.-]+)?$/i.test(f.path) ||
      /(^|\/)env\.(ts|js|mjs|cjs|tsx)$/i.test(f.path) ||
      /(^|\/)settings\.py$/i.test(f.path) ||
      /(^|\/)config\/.*\.(ts|js|py)$/i.test(f.path),
    );
    const seen = new Set<string>();
    for (const src of envSources) {
      for (const env of cap.detection.envs) {
        if (seen.has(env)) continue;
        // Match either `KEY=value` (env file) or "KEY"/process.env.KEY (source).
        const re = new RegExp(`(^|[^A-Z_])${env}(\\s*=|\"|')`);
        if (re.test(src.content)) {
          evidence.push(`${src.path} references ${env}`);
          seen.add(env);
        }
      }
    }
  }

  // ─── source content patterns (full scan, capped at first 200 files) ──
  // Was previously 30, but in a 500-file monorepo that misses API handlers
  // sitting in apps/api/src/*. 200 covers all reasonable mid-size repos
  // while staying deterministic.
  if (cap.detection.content_patterns && cap.detection.content_patterns.length > 0) {
    const sample = files.slice(0, 200);
    for (const pattern of cap.detection.content_patterns) {
      const re = new RegExp(pattern, "i");
      const hit = sample.find(f => re.test(f.content));
      if (hit) {
        evidence.push(`source references /${pattern}/ (e.g. ${hit.path})`);
        break;
      }
    }
  }

  return { detected: evidence.length > 0, evidence };
}

export function generateCapabilityMap(
  ctx: ContextMap,
  _profile: RepoProfile,
  files?: SourceFile[],
): GeneratedFile {
  const detections = RESELL_CAPABILITIES.map(cap => ({
    cap,
    detection: detectCapabilityUsage(cap, files),
  }));

  // YAML-ish output. Hand-rolled so we don't pull in a YAML dep — small,
  // deterministic, and matches the format other AXIS YAML artifacts use.
  const lines: string[] = [];
  lines.push("# capability-map.yaml");
  lines.push("# AXIS resell-tool catalog + in-house replication plan.");
  lines.push(`# Generated for ${ctx.project_identity.name} (snapshot ${ctx.snapshot_id}).`);
  lines.push(`# Generated at: ${ctx.generated_at}`);
  lines.push("");
  lines.push("meta:");
  lines.push(`  project: "${ctx.project_identity.name}"`);
  lines.push(`  snapshot_id: "${ctx.snapshot_id}"`);
  lines.push(`  generated_at: "${ctx.generated_at}"`);
  lines.push(`  capability_count: ${RESELL_CAPABILITIES.length}`);
  lines.push(`  capabilities_detected_in_repo: ${detections.filter(d => d.detection.detected).length}`);
  lines.push("");

  lines.push("status_legend:");
  lines.push("  live_proxy:    \"Shipping today as an iliad_* MCP tool that proxies to a third party.\"");
  lines.push("  planned_proxy: \"Capability identified; AXIS-branded proxy planned but not built.\"");
  lines.push("  planned_owned: \"Capability identified; AXIS-owned implementation planned (skip the proxy step).\"");
  lines.push("  owned:         \"AXIS-owned implementation shipping; no third-party dependency.\"");
  lines.push("");

  lines.push("capabilities:");
  for (const { cap, detection } of detections) {
    lines.push(`  - id: ${cap.id}`);
    lines.push(`    name: "${escapeYamlString(cap.name)}"`);
    lines.push(`    status: ${cap.status}`);
    lines.push(`    axis_brand_tool: "${cap.axis_brand_tool}"`);
    lines.push(`    pricing_tier: ${cap.pricing_tier ? `"${cap.pricing_tier}"` : "null"}`);
    lines.push(`    summary: "${escapeYamlString(cap.summary)}"`);
    lines.push(`    detected_in_repo: ${detection.detected}`);
    if (detection.evidence.length > 0) {
      lines.push("    detection_evidence:");
      for (const e of detection.evidence) lines.push(`      - "${escapeYamlString(e)}"`);
    }
    lines.push("    third_party_providers:");
    for (const p of cap.providers) {
      lines.push(`      - name: "${p.name}"`);
      lines.push(`        url: "${p.url}"`);
      lines.push(`        retail_pricing: "${escapeYamlString(p.retail_pricing)}"`);
    }
    lines.push("    inputs:");
    for (const i of cap.inputs) {
      lines.push(`      - name: ${i.name}`);
      lines.push(`        type: "${escapeYamlString(i.type)}"`);
      lines.push(`        required: ${i.required}`);
      lines.push(`        description: "${escapeYamlString(i.description)}"`);
    }
    lines.push("    outputs:");
    for (const o of cap.outputs) {
      lines.push(`      - name: ${o.name}`);
      lines.push(`        type: "${escapeYamlString(o.type)}"`);
      lines.push(`        description: "${escapeYamlString(o.description)}"`);
    }
    lines.push("    replication_plan:");
    lines.push(`      runtime: "${escapeYamlString(cap.replication_plan.runtime)}"`);
    lines.push(`      persistence: ${cap.replication_plan.persistence ? `"${escapeYamlString(cap.replication_plan.persistence)}"` : "null"}`);
    lines.push(`      estimated_effort: ${cap.replication_plan.estimated_effort}`);
    lines.push("      key_dependencies:");
    for (const d of cap.replication_plan.key_dependencies) lines.push(`        - "${escapeYamlString(d)}"`);
    lines.push("      differentiators:");
    for (const d of cap.replication_plan.differentiators) lines.push(`        - "${escapeYamlString(d)}"`);
    lines.push("    axis_advantages:");
    for (const a of cap.axis_advantages) lines.push(`      - "${escapeYamlString(a)}"`);
    lines.push("");
  }

  // Quick-reference summary at the bottom so agents can scan without parsing
  // the whole YAML body.
  lines.push("summary:");
  lines.push("  by_status:");
  const byStatus: Record<string, number> = {};
  for (const c of RESELL_CAPABILITIES) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
  for (const status of Object.keys(byStatus).sort()) {
    lines.push(`    ${status}: ${byStatus[status]}`);
  }
  lines.push("  recommended_next_owned:");
  // Cheapest-to-build + highest-margin items first.
  const recs = RESELL_CAPABILITIES
    .filter(c => c.status === "planned_proxy" || c.status === "planned_owned")
    .sort((a, b) => {
      const order = { small: 0, medium: 1, large: 2 } as const;
      return order[a.replication_plan.estimated_effort] - order[b.replication_plan.estimated_effort];
    })
    .slice(0, 5);
  for (const r of recs) {
    lines.push(`    - id: ${r.id}`);
    lines.push(`      effort: ${r.replication_plan.estimated_effort}`);
    lines.push(`      reason: "${escapeYamlString(r.axis_advantages[0] ?? "")}"`);
  }

  return {
    path: "capability-map.yaml",
    content: lines.join("\n") + "\n",
    content_type: "application/yaml",
    program: "artifacts",
    description: `Resell-tool capability registry: ${RESELL_CAPABILITIES.length} capabilities catalogued with status, detected-in-repo flag, third-party providers, AXIS-branded tool slug, replication plan, and per-capability MCP-native advantages.`,
  };
}

function escapeYamlString(s: string): string {
  // Conservative escape: backslashes first (must come before adding more),
  // then double-quotes; trim whitespace control chars to keep YAML valid.
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "\\\"")
    .replace(/[ -]/g, " ");
}
