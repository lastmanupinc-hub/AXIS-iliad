import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { GeneratedFile } from "./types.js";
import { hasFw, getFw } from "./fw-helpers.js";

// ─── generated-component.tsx ────────────────────────────────────

export function generateComponent(ctx: ContextMap): GeneratedFile {
  const id = ctx.project_identity;
  const frameworks = ctx.detection.frameworks.map(f => f.name);
  const isReact = hasFw(ctx, "React", "Next.js");
  const componentName = id.name.replace(/[^a-zA-Z0-9]/g, "");

  const lines: string[] = [];

  if (isReact) {
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
    lines.push(`// Framework: ${frameworks[0] ?? id.primary_language}`);
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

  return {
    path: "generated-component.tsx",
    content: lines.join("\n"),
    content_type: "text/typescript",
    program: "artifacts",
    description: `Generated ${isReact ? "React" : "vanilla"} component scaffold for ${id.name}`,
  };
}

// ─── dashboard-widget.tsx ──────────────────────────────────────

export function generateDashboardWidget(ctx: ContextMap): GeneratedFile {
  const id = ctx.project_identity;
  const frameworks = ctx.detection.frameworks.map(f => f.name);
  const languages = ctx.detection.languages;
  const entryPoints = ctx.entry_points;
  const hotspots = ctx.dependency_graph.hotspots;
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

  return {
    path: "dashboard-widget.tsx",
    content: lines.join("\n"),
    content_type: "text/typescript",
    program: "artifacts",
    description: `Dashboard widget showing ${id.name} project stats and metrics`,
  };
}

// ─── embed-snippet.ts ──────────────────────────────────────────

export function generateEmbedSnippet(ctx: ContextMap): GeneratedFile {
  const id = ctx.project_identity;
  const conventions = ctx.ai_context.conventions;
  const warnings = ctx.ai_context.warnings;
  const abstractions = ctx.ai_context.key_abstractions;

  const lines: string[] = [];

  lines.push("/**");
  lines.push(` * Embeddable context snippet for ${id.name}`);
  lines.push(` * Generated by AXIS Toolbox`);
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

  return {
    path: "embed-snippet.ts",
    content: lines.join("\n"),
    content_type: "text/typescript",
    program: "artifacts",
    description: "Embeddable TypeScript snippet for injecting project context into AI prompts",
  };
}

// ─── artifact-spec.md ──────────────────────────────────────────

export function generateArtifactSpec(ctx: ContextMap, profile: RepoProfile): GeneratedFile {
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
  lines.push("## Project Overview");
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

  return {
    path: "artifact-spec.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "artifacts",
    description: `Full artifact specification for ${id.name} with architecture, metrics, and generation rules`,
  };
}

// ─── component-library.json ─────────────────────────────────────

export function generateComponentLibrary(ctx: ContextMap): GeneratedFile {
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
    framework: hasReact ? "react" : frameworks[0]?.name ?? id.primary_language,
    styling: hasTailwind ? "tailwind" : "css-modules",
    total_components: components.length,
    categories: [...new Set(components.map(c => c.category))],
    components,
  };

  return {
    path: "component-library.json",
    content: JSON.stringify(library, null, 2),
    content_type: "application/json",
    program: "artifacts",
    description: "Component library specification with props, variants, and usage guidance",
  };
}
