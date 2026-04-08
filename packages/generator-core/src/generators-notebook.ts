import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { GeneratedFile } from "./types.js";
import { hasFw, getFw } from "./fw-helpers.js";

// ─── notebook-summary.md ────────────────────────────────────────

export function generateNotebookSummary(ctx: ContextMap): GeneratedFile {
  const id = ctx.project_identity;
  const lines: string[] = [];

  lines.push(`# Notebook Summary — ${id.name}`);
  lines.push("");
  lines.push(`> Research and knowledge notebook for a ${id.type.replace(/_/g, " ")} (${id.primary_language})`);
  lines.push("");

  // Project Synopsis
  lines.push("## Project Synopsis");
  lines.push("");
  lines.push(ctx.ai_context.project_summary);
  lines.push("");

  // Architecture Overview
  lines.push("## Architecture Overview");
  lines.push("");
  lines.push(`- **Files**: ${ctx.structure.total_files} files across ${ctx.structure.total_directories} directories`);
  lines.push(`- **Lines of Code**: ${ctx.structure.total_loc.toLocaleString()}`);
  lines.push(`- **Primary Language**: ${id.primary_language}`);

  const frameworks = ctx.detection.frameworks.map(f => f.name);
  if (frameworks.length > 0) {
    lines.push(`- **Frameworks**: ${frameworks.join(", ")}`);
  }

  const patterns = ctx.architecture_signals.patterns_detected;
  if (patterns.length > 0) {
    lines.push(`- **Patterns**: ${patterns.join(", ")}`);
  }
  lines.push(`- **Separation Score**: ${ctx.architecture_signals.separation_score}/10`);
  lines.push("");

  // Key Concepts
  lines.push("## Key Concepts");
  lines.push("");
  const abstractions = ctx.ai_context.key_abstractions;
  if (abstractions.length > 0) {
    for (const a of abstractions) {
      lines.push(`- ${a}`);
    }
  } else {
    lines.push("No key abstractions detected yet.");
  }
  lines.push("");

  // Conventions
  lines.push("## Conventions");
  lines.push("");
  for (const c of ctx.ai_context.conventions) {
    lines.push(`- ${c}`);
  }
  lines.push("");

  // Warnings & Notes
  const warnings = ctx.ai_context.warnings;
  if (warnings.length > 0) {
    lines.push("## Warnings & Notes");
    lines.push("");
    for (const w of warnings) {
      lines.push(`- ⚠ ${w}`);
    }
    lines.push("");
  }

  // Entry Points
  const entries = ctx.entry_points;
  if (entries.length > 0) {
    lines.push("## Entry Points");
    lines.push("");
    lines.push("| Path | Type | Description |");
    lines.push("|------|------|-------------|");
    for (const e of entries) {
      lines.push(`| \`${e.path}\` | ${e.type} | ${e.description} |`);
    }
    lines.push("");
  }

  // Dependencies snapshot
  const deps = ctx.dependency_graph.external_dependencies;
  if (deps.length > 0) {
    lines.push("## Dependency Snapshot");
    lines.push("");
    lines.push(`Total external dependencies: **${deps.length}**`);
    lines.push("");
    const top = deps.slice(0, 10);
    lines.push("| Package | Version |");
    lines.push("|---------|---------|");
    for (const d of top) {
      lines.push(`| ${d.name} | ${d.version} |`);
    }
    if (deps.length > 10) {
      lines.push(`| ... | +${deps.length - 10} more |`);
    }
    lines.push("");
  }

  return {
    path: "notebook-summary.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "notebook",
    description: "Project knowledge notebook with synopsis, architecture, concepts, and conventions",
  };
}

// ─── source-map.json ────────────────────────────────────────────

export function generateSourceMap(ctx: ContextMap): GeneratedFile {
  const id = ctx.project_identity;

  const languageBreakdown: Record<string, { files: number; percentage: number }> = {};
  for (const lang of ctx.detection.languages) {
    languageBreakdown[lang.name] = {
      files: lang.file_count,
      percentage: lang.loc_percent,
    };
  }

  const layers: Record<string, string[]> = {};
  for (const lb of ctx.architecture_signals.layer_boundaries) {
    layers[lb.layer] = lb.directories;
  }

  const hotspots = ctx.dependency_graph.hotspots.map(h => ({
    path: h.path,
    risk_score: h.risk_score,
    inbound: h.inbound_count,
    outbound: h.outbound_count,
  }));

  const sourceMap = {
    project: id.name,
    generated_at: new Date().toISOString(),
    structure: {
      total_files: ctx.structure.total_files,
      total_directories: ctx.structure.total_directories,
      total_loc: ctx.structure.total_loc,
    },
    languages: languageBreakdown,
    layers,
    entry_points: ctx.entry_points.map(e => ({
      path: e.path,
      type: e.type,
    })),
    routes: ctx.routes.map(r => ({
      path: r.path,
      method: r.method,
      source: r.source_file,
    })),
    hotspots,
    internal_import_count: ctx.dependency_graph.internal_imports.length,
    external_dependency_count: ctx.dependency_graph.external_dependencies.length,
  };

  return {
    path: "source-map.json",
    content: JSON.stringify(sourceMap, null, 2),
    content_type: "application/json",
    program: "notebook",
    description: "Structured source map with file layout, languages, layers, and hotspots",
  };
}

// ─── study-brief.md ─────────────────────────────────────────────

export function generateStudyBrief(ctx: ContextMap): GeneratedFile {
  const id = ctx.project_identity;
  const lines: string[] = [];

  lines.push(`# Study Brief — ${id.name}`);
  lines.push("");
  lines.push("> Structured learning guide for understanding this codebase");
  lines.push("");

  // Prerequisites
  lines.push("## Prerequisites");
  lines.push("");
  lines.push(`Before diving into this codebase, you should be comfortable with:`);
  lines.push("");
  lines.push(`- **${id.primary_language}** — the primary language`);

  const frameworks = ctx.detection.frameworks.map(f => f.name);
  for (const fw of frameworks.slice(0, 5)) {
    lines.push(`- **${fw}** — used framework`);
  }

  const buildTools = ctx.detection.build_tools;
  if (buildTools.length > 0) {
    lines.push(`- **Build tools**: ${buildTools.join(", ")}`);
  }
  lines.push("");

  // Reading Order
  lines.push("## Recommended Reading Order");
  lines.push("");
  lines.push("### Phase 1: Orientation");
  lines.push("");
  lines.push("1. Read the project README and any CONTRIBUTING.md");
  lines.push("2. Understand the top-level directory structure:");
  lines.push("");
  for (const dir of ctx.structure.top_level_layout.slice(0, 8)) {
    lines.push(`   - \`${dir.name}\` — ${dir.purpose} (${dir.file_count} files)`);
  }
  lines.push("");

  lines.push("### Phase 2: Entry Points");
  lines.push("");
  const entries = ctx.entry_points;
  if (entries.length > 0) {
    lines.push("Start with these files to understand the application flow:");
    lines.push("");
    for (const e of entries) {
      lines.push(`- \`${e.path}\` — ${e.description}`);
    }
  } else {
    lines.push("Identify the main entry point by checking package.json `main` or `bin` fields.");
  }
  lines.push("");

  lines.push("### Phase 3: Core Abstractions");
  lines.push("");
  const abstractions = ctx.ai_context.key_abstractions;
  if (abstractions.length > 0) {
    lines.push("These are the key concepts to understand:");
    lines.push("");
    for (const a of abstractions) {
      lines.push(`- **${a}**`);
    }
  } else {
    lines.push("Identify core abstractions by following imports from entry points.");
  }
  lines.push("");

  lines.push("### Phase 4: Data Flow");
  lines.push("");
  lines.push("Trace the flow of data through the system:");
  lines.push("");
  const routes = ctx.routes;
  if (routes.length > 0) {
    lines.push("Key routes to trace:");
    lines.push("");
    for (const r of routes.slice(0, 5)) {
      lines.push(`- \`${r.method} ${r.path}\` → \`${r.source_file}\``);
    }
  } else {
    lines.push("- Follow the primary entry point → processing → output chain");
  }
  lines.push("");

  lines.push("### Phase 5: Testing");
  lines.push("");
  const testFws = ctx.detection.test_frameworks;
  if (testFws.length > 0) {
    lines.push(`Test framework: **${testFws.join(", ")}**`);
    lines.push("");
    lines.push("- Run the test suite to verify your environment");
    lines.push("- Read test files — they're the best documentation of expected behavior");
    lines.push("- Modify one test, break it, fix it — confirm your understanding");
  } else {
    lines.push("No test framework detected. Consider adding tests as you learn.");
  }
  lines.push("");

  // Study Questions
  lines.push("## Study Questions");
  lines.push("");
  lines.push("Answer these to confirm understanding:");
  lines.push("");
  lines.push(`1. What is the primary purpose of ${id.name}?`);
  lines.push("2. What happens when a request enters the system?");
  lines.push("3. Where is state stored and how is it managed?");
  lines.push("4. What are the key boundaries between modules?");
  lines.push("5. What would break if you renamed the primary entry point?");
  lines.push("");

  return {
    path: "study-brief.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "notebook",
    description: "Structured learning guide with reading order, prerequisites, and study questions",
  };
}

// ─── research-threads.md ────────────────────────────────────────

export function generateResearchThreads(ctx: ContextMap): GeneratedFile {
  const id = ctx.project_identity;
  const lines: string[] = [];

  lines.push(`# Research Threads — ${id.name}`);
  lines.push("");
  lines.push("> Open research questions and investigation threads for the codebase");
  lines.push("");

  // Architecture threads
  lines.push("## Architecture Threads");
  lines.push("");

  const patterns = ctx.architecture_signals.patterns_detected;
  const score = ctx.architecture_signals.separation_score;

  lines.push(`### Thread 1: Architectural Fitness (Score: ${score}/10)`);
  lines.push("");
  if (score >= 7) {
    lines.push("Architecture separation is strong. Research focus:");
    lines.push("- Can any layers be further decomposed for independent deployment?");
    lines.push("- Are there hidden coupling points not reflected in the score?");
  } else if (score >= 4) {
    lines.push("Architecture separation is moderate. Research focus:");
    lines.push("- Which layer boundaries are weakest?");
    lines.push("- What refactoring would yield the highest separation improvement?");
  } else {
    lines.push("Architecture separation is low. Research focus:");
    lines.push("- Should modular boundaries be introduced?");
    lines.push("- What is the minimum viable modularization that reduces coupling?");
  }
  if (patterns.length > 0) {
    lines.push("");
    lines.push(`Detected patterns: ${patterns.join(", ")}`);
  }
  lines.push("");

  // Dependency threads
  const hotspots = ctx.dependency_graph.hotspots;
  if (hotspots.length > 0) {
    lines.push("### Thread 2: Dependency Hotspots");
    lines.push("");
    lines.push("High-risk files that warrant investigation:");
    lines.push("");
    for (const h of hotspots.slice(0, 5)) {
      lines.push(`- **\`${h.path}\`** — risk ${h.risk_score.toFixed(1)}`);
      lines.push(`  - Question: Is this file doing too many things? Can responsibilities be split?`);
    }
    lines.push("");
  }

  // Technology threads
  lines.push("### Thread 3: Technology Choices");
  lines.push("");
  lines.push("Open questions about the current technology stack:");
  lines.push("");

  const deps = ctx.dependency_graph.external_dependencies;
  const frameworks = ctx.detection.frameworks.map(f => f.name);

  if (frameworks.length > 0) {
    lines.push(`- Are the chosen frameworks (${frameworks.join(", ")}) still the best fit for the project's direction?`);
  }
  lines.push(`- Are there dependencies that could be removed or replaced with lighter alternatives?`);
  lines.push(`- External dependency count: ${deps.length} — is this sustainable?`);
  lines.push("");

  // Performance threads
  lines.push("### Thread 4: Performance");
  lines.push("");
  lines.push("Investigation areas:");
  lines.push("");
  lines.push(`- What is the baseline performance metric for ${id.name}?`);
  lines.push("- Are there obvious bottlenecks in the critical path?");

  const routes = ctx.routes;
  if (routes.length > 0) {
    lines.push(`- Which of the ${routes.length} routes are most latency-sensitive?`);
  }
  lines.push("- What caching strategies would have the highest impact?");
  lines.push("");

  // Testing threads
  lines.push("### Thread 5: Test Coverage");
  lines.push("");
  const testFws = ctx.detection.test_frameworks;
  if (testFws.length > 0) {
    lines.push(`Test framework: ${testFws.join(", ")}`);
    lines.push("");
    lines.push("Open questions:");
    lines.push("- What is the current test coverage percentage?");
    lines.push("- Which modules have zero test coverage?");
    lines.push("- Are integration tests covering the critical user paths?");
  } else {
    lines.push("No test framework detected. Primary research thread: which testing strategy best fits this project?");
  }
  lines.push("");

  // Future Direction
  lines.push("## Future Direction Threads");
  lines.push("");

  const warnings = ctx.ai_context.warnings;
  if (warnings.length > 0) {
    lines.push("### Known Issues to Investigate");
    lines.push("");
    for (const w of warnings) {
      lines.push(`- ${w}`);
    }
    lines.push("");
  }

  lines.push("### Scaling Questions");
  lines.push("");
  lines.push("- What is the current bottleneck for scaling?");
  lines.push("- What would change if usage grew 10x?");
  lines.push(`- Is the ${id.type.replace(/_/g, " ")} architecture suited for the next 6 months of growth?`);
  lines.push("");

  return {
    path: "research-threads.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "notebook",
    description: "Open research questions and investigation threads for continuous improvement",
  };
}

// ─── citation-index.json ────────────────────────────────────────

export function generateCitationIndex(ctx: ContextMap): GeneratedFile {
  const id = ctx.project_identity;
  const deps = ctx.dependency_graph.external_dependencies;
  const frameworks = ctx.detection.frameworks;
  const languages = ctx.detection.languages;
  const entryPoints = ctx.entry_points;
  const patterns = ctx.architecture_signals.patterns_detected;

  const citations: Array<{
    id: string;
    type: string;
    title: string;
    source: string;
    relevance: string;
    tags: string[];
  }> = [];

  // Framework documentation citations
  for (const fw of frameworks) {
    const n = fw.name.toLowerCase();
    citations.push({
      id: `fw-${fw.name}`,
      type: "documentation",
      title: `${fw.name} Official Documentation`,
      source: n === "next" || n === "next.js" ? "https://nextjs.org/docs" :
        n === "react" ? "https://react.dev" :
        n === "vue" || n === "vue.js" ? "https://vuejs.org/guide" :
        n === "express" ? "https://expressjs.com/en/guide" :
        n === "tailwind" || n === "tailwind css" ? "https://tailwindcss.com/docs" :
        n === "prisma" ? "https://www.prisma.io/docs" :
        `https://www.google.com/search?q=${fw.name}+documentation`,
      relevance: "primary",
      tags: ["framework", fw.name, "documentation"],
    });
  }

  // Language reference citations
  for (const lang of languages.slice(0, 3)) {
    citations.push({
      id: `lang-${lang.name.toLowerCase()}`,
      type: "reference",
      title: `${lang.name} Language Reference`,
      source: lang.name === "TypeScript" ? "https://www.typescriptlang.org/docs" :
        lang.name === "JavaScript" ? "https://developer.mozilla.org/en-US/docs/Web/JavaScript" :
        lang.name === "Python" ? "https://docs.python.org/3/" :
        `https://www.google.com/search?q=${lang.name}+reference`,
      relevance: lang.loc_percent > 30 ? "primary" : "secondary",
      tags: ["language", lang.name.toLowerCase()],
    });
  }

  // Pattern-related citations
  for (const p of patterns) {
    citations.push({
      id: `pattern-${p.toLowerCase().replace(/\s+/g, "-")}`,
      type: "pattern",
      title: `${p} Pattern Reference`,
      source: `Architecture pattern detected in project`,
      relevance: "contextual",
      tags: ["architecture", "pattern", p.toLowerCase()],
    });
  }

  // Key dependency citations
  for (const d of deps.slice(0, 10)) {
    citations.push({
      id: `dep-${d.name}`,
      type: "library",
      title: `${d.name} @ ${d.version}`,
      source: `https://www.npmjs.com/package/${d.name}`,
      relevance: "reference",
      tags: ["dependency", d.name],
    });
  }

  // Entry point citations
  for (const ep of entryPoints.slice(0, 5)) {
    citations.push({
      id: `entry-${ep.path.replace(/[^a-zA-Z0-9]/g, "-")}`,
      type: "source",
      title: `Entry point: ${ep.path}`,
      source: ep.path,
      relevance: "primary",
      tags: ["source", ep.type, "entry-point"],
    });
  }

  const index = {
    project: id.name,
    generated_at: new Date().toISOString(),
    total_citations: citations.length,
    by_type: {
      documentation: citations.filter(c => c.type === "documentation").length,
      reference: citations.filter(c => c.type === "reference").length,
      pattern: citations.filter(c => c.type === "pattern").length,
      library: citations.filter(c => c.type === "library").length,
      source: citations.filter(c => c.type === "source").length,
    },
    citations,
  };

  return {
    path: "citation-index.json",
    content: JSON.stringify(index, null, 2),
    content_type: "application/json",
    program: "notebook",
    description: "Structured citation index linking project dependencies, frameworks, and sources",
  };
}
