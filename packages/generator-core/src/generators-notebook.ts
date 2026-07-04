import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { GeneratedFile, SourceFile } from "./types.js";
import { findEntryPoints, findConfigs, renderExcerpts, extractExports, fileTree } from "./file-excerpt-utils.js";
import { mdText, mdInline, mdCode, mdCellCode } from "./md-sanitize.js";

// Curated docs URLs for common frameworks; any package not listed falls back to
// its npm registry page (URL-encoded so scoped names like @scope/pkg resolve).
// This keeps citations pointing at real documentation for the ACTUAL detected
// stack instead of a generic web search for anything outside a hardcoded few.
const DOCS_URLS: Record<string, string> = {
  react: "https://react.dev",
  next: "https://nextjs.org/docs",
  "next.js": "https://nextjs.org/docs",
  vue: "https://vuejs.org/guide",
  "vue.js": "https://vuejs.org/guide",
  svelte: "https://svelte.dev/docs",
  sveltekit: "https://svelte.dev/docs/kit",
  astro: "https://docs.astro.build",
  solid: "https://www.solidjs.com/docs",
  solidjs: "https://www.solidjs.com/docs",
  remix: "https://remix.run/docs",
  angular: "https://angular.dev",
  nest: "https://docs.nestjs.com",
  nestjs: "https://docs.nestjs.com",
  express: "https://expressjs.com/en/guide",
  fastify: "https://fastify.dev/docs/latest",
  tailwind: "https://tailwindcss.com/docs",
  "tailwind css": "https://tailwindcss.com/docs",
  prisma: "https://www.prisma.io/docs",
  vite: "https://vite.dev",
  django: "https://docs.djangoproject.com",
  flask: "https://flask.palletsprojects.com",
};

/** Docs URL for a detected framework/package: curated docs if known, else its npm page. */
function getDocsUrl(name: string): string {
  return DOCS_URLS[name.toLowerCase()] ?? `https://www.npmjs.com/package/${encodeURIComponent(name)}`;
}

// Curated official-docs URLs for common languages. Unknown languages fall back to
// a URL-ENCODED search (so `C++` / `C#` don't produce a malformed link), which is
// honestly a search, not a curated reference.
const LANG_DOCS: Record<string, string> = {
  typescript: "https://www.typescriptlang.org/docs",
  javascript: "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
  python: "https://docs.python.org/3/",
  go: "https://go.dev/doc/",
  rust: "https://doc.rust-lang.org/book/",
  java: "https://docs.oracle.com/en/java/",
  ruby: "https://www.ruby-lang.org/en/documentation/",
  "c#": "https://learn.microsoft.com/en-us/dotnet/csharp/",
  csharp: "https://learn.microsoft.com/en-us/dotnet/csharp/",
  php: "https://www.php.net/docs.php",
  swift: "https://www.swift.org/documentation/",
  kotlin: "https://kotlinlang.org/docs/home.html",
  "c++": "https://en.cppreference.com/w/",
  cpp: "https://en.cppreference.com/w/",
  c: "https://en.cppreference.com/w/c",
  scala: "https://docs.scala-lang.org/",
  elixir: "https://elixir-lang.org/docs.html",
};

/** Language reference URL: curated official docs if known, else an encoded search. */
function getLanguageRef(name: string): string {
  return LANG_DOCS[name.toLowerCase()] ?? `https://www.google.com/search?q=${encodeURIComponent(name + " language reference")}`;
}

// ─── notebook-summary.md ────────────────────────────────────────

export function generateNotebookSummary(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const lines: string[] = [];

  lines.push(`# Notebook Summary — ${mdText(id.name)}`);
  lines.push("");
  lines.push(`> Research and knowledge notebook for a ${mdText(id.type.replace(/_/g, " "))} (${mdText(id.primary_language)})`);
  lines.push("");

  // Project Synopsis
  lines.push("## Project Synopsis");
  lines.push("");
  lines.push(mdText(ctx.ai_context.project_summary));
  lines.push("");

  // Architecture Overview
  lines.push("## Architecture Overview");
  lines.push("");
  lines.push(`- **Files**: ${ctx.structure.total_files} files across ${ctx.structure.total_directories} directories`);
  lines.push(`- **Lines of Code**: ${ctx.structure.total_loc.toLocaleString("en-US")}`);
  lines.push(`- **Primary Language**: ${mdText(id.primary_language)}`);

  const frameworks = ctx.detection.frameworks.map(f => f.name);
  if (frameworks.length > 0) {
    lines.push(`- **Frameworks**: ${mdText(frameworks.join(", "))}`);
  }

  const patterns = ctx.architecture_signals.patterns_detected;
  if (patterns.length > 0) {
    lines.push(`- **Patterns**: ${mdText(patterns.join(", "))}`);
  }
  lines.push(`- **Separation Score**: ${ctx.architecture_signals.separation_score.toFixed(2)} / 1.0`);
  lines.push("");

  // Key Concepts — prefer domain models over folder-path abstractions
  lines.push("## Key Concepts");
  lines.push("");
  /* v8 ignore next */
  const domainModels = ctx.domain_models ?? [];
  if (domainModels.length > 0) {
    for (const m of domainModels.slice(0, 10)) {
      lines.push(`- **\`${mdCode(m.name)}\`** — ${mdText(m.kind)} (${m.field_count} fields in \`${mdCode(m.source_file)}\`)`);
    }
  } else {
    const abstractions = ctx.ai_context.key_abstractions;
    if (abstractions.length > 0) {
      for (const a of abstractions) {
        lines.push(`- ${mdText(a)}`);
      }
    } else {
      lines.push("No key abstractions detected yet.");
    }
  }
  lines.push("");

  // Conventions
  lines.push("## Conventions");
  lines.push("");
  for (const c of ctx.ai_context.conventions) {
    lines.push(`- ${mdText(c)}`);
  }
  lines.push("");

  // Warnings & Notes — filter known context-engine false positives
  /* v8 ignore next */
  const filePaths = (ctx.structure.file_tree_summary ?? []).map((f: { path: string }) => f.path);
  const hasCiCd = filePaths.some((p: string) => p.includes(".github/workflow") || p.includes("Dockerfile") || p.includes("render.yaml") || p.includes(".travis") || p.includes("gitlab-ci"));
  const hasLockfile = filePaths.some((p: string) => p.includes("pnpm-lock") || p.includes("package-lock") || p.includes("yarn.lock"));
  /* v8 ignore next */
  const warnings = (ctx.ai_context.warnings ?? []).filter((w: string) => {
    if (w.toLowerCase().includes("ci/cd") && hasCiCd) return false;
    if (w.toLowerCase().includes("lockfile") && hasLockfile) return false;
    return true;
  });
  if (warnings.length > 0) {
    lines.push("## Warnings & Notes");
    lines.push("");
    for (const w of warnings) {
      lines.push(`- ⚠ ${mdText(w)}`);
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
      lines.push(`| \`${mdCellCode(e.path)}\` | ${mdInline(e.type)} | ${mdInline(e.description)} |`);
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
      lines.push(`| ${mdInline(d.name)} | ${mdInline(d.version)} |`);
    }
    if (deps.length > 10) {
      lines.push(`| ... | +${deps.length - 10} more |`);
    }
    lines.push("");
  }

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const entries = findEntryPoints(files);
    if (entries.length > 0) {
      lines.push("## Entry Point Source");
      lines.push("");
      lines.push("| File | Exports |");
      lines.push("|------|---------|");
      for (const ep of entries.slice(0, 6)) {
        const exports = extractExports(ep.content);
        lines.push(`| \`${mdCellCode(ep.path)}\` | ${mdInline(exports.join(", ") || "default")} |`);
      }
      lines.push("");
    }

    const configs = findConfigs(files);
    if (configs.length > 0) {
      lines.push(...renderExcerpts("Configuration Files", configs.slice(0, 3), 15));
    }
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

export function generateSourceMap(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
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
    generated_at: ctx.generated_at,
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
    // ─── Source File Analysis ──────────────────────────────────
    source_file_count: files ? files.length : null,
    file_tree: files && files.length > 0 ? fileTree(files) : null,
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

export function generateStudyBrief(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const lines: string[] = [];

  lines.push(`# Study Brief — ${mdText(id.name)}`);
  lines.push("");
  lines.push("> Structured learning guide for understanding this codebase");
  lines.push("");

  // Prerequisites
  lines.push("## Prerequisites");
  lines.push("");
  lines.push(`Before diving into this codebase, you should be comfortable with:`);
  lines.push("");
  lines.push(`- **${mdText(id.primary_language)}** — the primary language`);

  const frameworks = ctx.detection.frameworks.map(f => f.name);
  for (const fw of frameworks.slice(0, 5)) {
    lines.push(`- **${mdText(fw)}** — used framework`);
  }

  const buildTools = ctx.detection.build_tools;
  if (buildTools.length > 0) {
    lines.push(`- **Build tools**: ${mdText(buildTools.join(", "))}`);
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
    lines.push(`   - \`${mdCode(dir.name)}\` — ${mdText(dir.purpose)} (${dir.file_count} files)`);
  }
  lines.push("");

  lines.push("### Phase 2: Entry Points");
  lines.push("");
  const entries = ctx.entry_points;
  if (entries.length > 0) {
    lines.push("Start with these files to understand the application flow:");
    lines.push("");
    for (const e of entries) {
      lines.push(`- \`${mdCode(e.path)}\` — ${mdText(e.description)}`);
    }
  } else {
    lines.push("Identify the main entry point by checking package.json `main` or `bin` fields.");
  }
  lines.push("");

  lines.push("### Phase 3: Core Domain Models");
  lines.push("");
  const abstractions = ctx.ai_context.key_abstractions;
  if ((ctx.domain_models ?? []).length > 0) {
    lines.push("These are the core data structures that define what the system works with:");
    lines.push("");
    lines.push("| Model | Kind | Fields | File |");
    lines.push("|-------|------|--------|------|");
    for (const m of ctx.domain_models.slice(0, 10)) {
      lines.push(`| \`${mdCellCode(m.name)}\` | ${mdInline(m.kind)} | ${m.field_count} | \`${mdCellCode(m.source_file)}\` |`);
    }
    if (ctx.domain_models.length > 10) {
      lines.push(`| *(+${ctx.domain_models.length - 10} more)* | | | |`);
    }
  } else if (abstractions.length > 0) {
    lines.push("These are the key concepts to understand:");
    lines.push("");
    for (const a of abstractions) {
      lines.push(`- **${mdText(a)}**`);
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
      lines.push(`- \`${mdCode(r.method)} ${mdCode(r.path)}\` → \`${mdCode(r.source_file)}\``);
    }
  } else {
    lines.push("- Follow the primary entry point → processing → output chain");
  }
  lines.push("");

  lines.push("### Phase 5: Testing");
  lines.push("");
  const testFws = ctx.detection.test_frameworks;
  if (testFws.length > 0) {
    lines.push(`Test framework: **${mdText(testFws.join(", "))}**`);
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
  lines.push(`1. What is the primary purpose of ${mdText(id.name)}?`);
  lines.push("2. What happens when a request enters the system?");
  lines.push("3. Where is state stored and how is it managed?");
  lines.push("4. What are the key boundaries between modules?");
  lines.push("5. What would break if you renamed the primary entry point?");
  if ((ctx.domain_models ?? []).length > 0) {
    const topModel = [...ctx.domain_models].sort((a, b) => b.field_count - a.field_count)[0];
    lines.push(`6. Trace the lifecycle of a \`${mdCode(topModel.name)}\` from creation to storage. What touches it?`);
    lines.push(`7. Which domain model has the most dependencies? Is that appropriate?`);
  }
  lines.push("");

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const entries = findEntryPoints(files);
    if (entries.length > 0) {
      lines.push("## Key Files to Read");
      lines.push("");
      lines.push(...renderExcerpts("Entry Point Source", entries.slice(0, 3), 20));
    }

    const configs = findConfigs(files);
    if (configs.length > 0) {
      lines.push(...renderExcerpts("Configuration Overview", configs.slice(0, 2), 15));
    }
  }

  return {
    path: "study-brief.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "notebook",
    description: "Structured learning guide with reading order, prerequisites, and study questions",
  };
}

// ─── research-threads.md ────────────────────────────────────────

export function generateResearchThreads(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const lines: string[] = [];

  lines.push(`# Research Threads — ${mdText(id.name)}`);
  lines.push("");
  lines.push("> Open research questions and investigation threads for the codebase");
  lines.push("");

  // Architecture threads
  lines.push("## Architecture Threads");
  lines.push("");

  const patterns = ctx.architecture_signals.patterns_detected;
  const score = ctx.architecture_signals.separation_score;

  lines.push(`### Thread 1: Architectural Fitness (Score: ${score.toFixed(2)} / 1.0)`);
  lines.push("");
  if (score >= 0.7) {
    lines.push("Architecture separation is strong. Research focus:");
    lines.push("- Can any layers be further decomposed for independent deployment?");
    lines.push("- Are there hidden coupling points not reflected in the score?");
  } else if (score >= 0.4) {
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
    lines.push(`Detected patterns: ${mdText(patterns.join(", "))}`);
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
      lines.push(`- **\`${mdCode(h.path)}\`** — risk ${h.risk_score.toFixed(1)}`);
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
    lines.push(`- Are the chosen frameworks (${mdText(frameworks.join(", "))}) still the best fit for the project's direction?`);
  }
  lines.push(`- Are there dependencies that could be removed or replaced with lighter alternatives?`);
  lines.push(`- External dependency count: ${deps.length} — is this sustainable?`);
  lines.push("");

  // Performance threads
  lines.push("### Thread 4: Performance");
  lines.push("");
  lines.push("Investigation areas:");
  lines.push("");
  lines.push(`- What is the baseline performance metric for ${mdText(id.name)}?`);
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
    lines.push(`Test framework: ${mdText(testFws.join(", "))}`);
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

  // Filter false-positive warnings by cross-checking actual file tree
  const fileTreePaths = (ctx.structure.file_tree_summary ?? []).map(f => f.path);
  const hasCiCd = fileTreePaths.some(p =>
    p.includes(".github/workflow") || p.includes("Dockerfile") ||
    p.includes("render.yaml") || p.includes(".travis") || p.includes("Jenkinsfile"),
  );
  const hasLockfile = fileTreePaths.some(p =>
    p.includes("pnpm-lock") || p.includes("package-lock") || p.includes("yarn.lock"),
  );

  const warnings = (ctx.ai_context.warnings ?? []).filter(w => {
    if (w.toLowerCase().includes("ci/cd") && hasCiCd) return false;
    if (w.toLowerCase().includes("lockfile") && hasLockfile) return false;
    return true;
  });

  if (warnings.length > 0) {
    lines.push("### Known Issues to Investigate");
    lines.push("");
    for (const w of warnings) {
      lines.push(`- ${mdText(w)}`);
    }
    lines.push("");
  }

  // Domain model complexity thread
  if ((ctx.domain_models ?? []).length > 0) {
    // v8 ignore next
    const topModels = [...ctx.domain_models].sort((a, b) => b.field_count - a.field_count).slice(0, 5);
    lines.push("### Domain Model Complexity");
    lines.push("");
    lines.push(`The project defines **${ctx.domain_models.length} domain models**. High field-count models may need documentation or decomposition:`);
    lines.push("");
    for (const m of topModels) {
      lines.push(`- **\`${mdCode(m.name)}\`** — ${mdText(m.kind)}, ${m.field_count} fields (\`${mdCode(m.source_file)}\`)`);
    }
    lines.push("");
    lines.push("Questions to answer:");
    lines.push("- Are all field names self-documenting? Do any need JSDoc?");
    lines.push("- Are there models that could be split into sub-types?");
    lines.push(`- Do models with zero fields represent empty interfaces or placeholders?`);
    lines.push("");
  }

  lines.push("### Scaling Questions");
  lines.push("");
  lines.push("- What is the current bottleneck for scaling?");
  lines.push("- What would change if usage grew 10x?");
  lines.push(`- Is the ${mdText(id.type.replace(/_/g, " "))} architecture suited for the next 6 months of growth?`);
  lines.push("");

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const entries = findEntryPoints(files);
    if (entries.length > 0) {
      lines.push("## Source-Based Threads");
      lines.push("");
      lines.push("### Thread 6: Entry Point Complexity");
      lines.push("");
      lines.push("Entry points to investigate for complexity and coupling:");
      lines.push("");
      for (const ep of entries.slice(0, 5)) {
        const exports = extractExports(ep.content);
        const lineCount = ep.content.split("\n").length;
        lines.push(`- **\`${mdCode(ep.path)}\`** — ${lineCount} lines, exports: ${mdText(exports.join(", ") || "default")}`);
      }
      lines.push("");
    }
  }

  return {
    path: "research-threads.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "notebook",
    description: "Open research questions and investigation threads for continuous improvement",
  };
}

// ─── citation-index.json ────────────────────────────────────────

export function generateCitationIndex(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
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

  // Framework documentation citations — every detected framework gets a real docs
  // URL (or its npm page), with the actual detected version in the title.
  for (const fw of frameworks) {
    citations.push({
      id: `fw-${fw.name}`,
      type: "documentation",
      title: fw.version
        ? `${fw.name} @ ${fw.version} — Official Documentation`
        : `${fw.name} Official Documentation`,
      source: getDocsUrl(fw.name),
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
      source: getLanguageRef(lang.name),
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
      // Detected in the project by static analysis; the source is a locatable
      // search for the pattern (not a prose sentence masquerading as a citation).
      source: `https://www.google.com/search?q=${encodeURIComponent(p + " architecture pattern")}`,
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
      source: `https://www.npmjs.com/package/${encodeURIComponent(d.name)}`,
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
    generated_at: ctx.generated_at,
    total_citations: citations.length,
    by_type: {
      documentation: citations.filter(c => c.type === "documentation").length,
      reference: citations.filter(c => c.type === "reference").length,
      pattern: citations.filter(c => c.type === "pattern").length,
      library: citations.filter(c => c.type === "library").length,
      source: citations.filter(c => c.type === "source").length,
    },
    citations,
    // ─── Source File Analysis ──────────────────────────────────
    source_file_count: files ? files.length : null,
    source_entry_points: files && files.length > 0 ? findEntryPoints(files).slice(0, 6).map(f => ({
      path: f.path,
      exports: extractExports(f.content),
      lines: f.content.split("\n").length,
    })) : null,
  };

  return {
    path: "citation-index.json",
    content: JSON.stringify(index, null, 2),
    content_type: "application/json",
    program: "notebook",
    description: "Structured citation index linking project dependencies, frameworks, and sources",
  };
}
