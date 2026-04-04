import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { GeneratedFile } from "./types.js";

// ─── .ai/optimization-rules.md ──────────────────────────────────

export function generateOptimizationRules(ctx: ContextMap): GeneratedFile {
  const id = ctx.project_identity;
  const lines: string[] = [];

  lines.push(`# Optimization Rules — ${id.name}`);
  lines.push("");
  lines.push(`> Prompt and context efficiency guidelines for a ${id.type.replace(/_/g, " ")} (${id.primary_language})`);
  lines.push("");

  // Context Window Budget
  lines.push("## Context Window Budget");
  lines.push("");
  const totalLoc = ctx.structure.total_loc;
  const totalFiles = ctx.structure.total_files;
  const avgLoc = totalFiles > 0 ? Math.round(totalLoc / totalFiles) : 0;
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total files | ${totalFiles} |`);
  lines.push(`| Total LOC | ${totalLoc.toLocaleString()} |`);
  lines.push(`| Average LOC / file | ${avgLoc} |`);
  lines.push(`| Estimated token count | ~${Math.round(totalLoc * 4.5).toLocaleString()} |`);
  lines.push("");
  if (totalLoc > 50000) {
    lines.push("**Warning:** This project exceeds most context windows. Use selective context loading.");
    lines.push("");
  } else if (totalLoc > 10000) {
    lines.push("**Note:** This project fits in large context windows (128K+) but should still use focused context for best results.");
    lines.push("");
  } else {
    lines.push("This project comfortably fits in modern context windows. Include full source when feasible.");
    lines.push("");
  }

  // High-Value Files (priority for context inclusion)
  lines.push("## High-Value Files");
  lines.push("");
  lines.push("Include these files first when constructing prompts — they carry the most architectural signal:");
  lines.push("");

  const hotspots = ctx.dependency_graph.hotspots
    .sort((a, b) => b.risk_score - a.risk_score)
    .slice(0, 10);
  if (hotspots.length > 0) {
    lines.push("### Dependency Hotspots");
    lines.push("");
    lines.push("| File | Inbound | Outbound | Risk |");
    lines.push("|------|---------|----------|------|");
    for (const h of hotspots) {
      lines.push(`| \`${h.path}\` | ${h.inbound_count} | ${h.outbound_count} | ${h.risk_score.toFixed(1)} |`);
    }
    lines.push("");
  }

  const entryPoints = ctx.entry_points.slice(0, 8);
  if (entryPoints.length > 0) {
    lines.push("### Entry Points");
    lines.push("");
    for (const ep of entryPoints) {
      lines.push(`- \`${ep.path}\` — ${ep.description} (${ep.type})`);
    }
    lines.push("");
  }

  // Low-Value Files (exclude from prompts)
  lines.push("## Low-Value Files (Exclude from Prompts)");
  lines.push("");
  lines.push("These file types add noise without architectural value:");
  lines.push("");
  const excludePatterns = [
    "*.lock, *.lockb (dependency lockfiles)",
    "*.min.js, *.min.css (minified bundles)",
    "*.map (source maps)",
    "dist/, build/, .next/, out/ (build artifacts)",
    "node_modules/ (dependencies)",
    ".git/ (version control)",
    "*.svg, *.png, *.jpg (binary assets)",
    "coverage/ (test coverage reports)",
  ];
  for (const p of excludePatterns) {
    lines.push(`- ${p}`);
  }
  lines.push("");

  // Framework-Specific Prompt Strategies
  lines.push("## Prompt Strategy");
  lines.push("");
  const frameworks = ctx.detection.frameworks.map(f => f.name);
  if (frameworks.includes("Next.js")) {
    lines.push("### Next.js Projects");
    lines.push("");
    lines.push("1. Always include `next.config.*` and `tsconfig.json` for project constraints");
    lines.push("2. Include the relevant `app/` or `pages/` route file for route-specific work");
    lines.push("3. Include shared layout files (`layout.tsx`) for UI consistency context");
    lines.push("4. Reference `package.json` dependencies to prevent hallucinated imports");
    lines.push("");
  }
  if (frameworks.includes("React")) {
    lines.push("### React Projects");
    lines.push("");
    lines.push("1. Include component files and their direct imports (1 hop)");
    lines.push("2. Include shared type definitions and utility modules");
    lines.push("3. Include CSS/styling config (tailwind.config, theme files) for style-aware generation");
    lines.push("");
  }
  if (frameworks.includes("Prisma")) {
    lines.push("### Prisma / Database");
    lines.push("");
    lines.push("1. Always include `schema.prisma` for any database-related prompts");
    lines.push("2. Include migration files when debugging schema changes");
    lines.push("3. Reference generated client types for type-safe queries");
    lines.push("");
  }

  // Conventions as Context
  const conventions = ctx.ai_context.conventions;
  if (conventions.length > 0) {
    lines.push("## Conventions to Embed in Prompts");
    lines.push("");
    lines.push("Include these as system-level constraints when generating code:");
    lines.push("");
    for (const c of conventions) {
      lines.push(`- ${c}`);
    }
    lines.push("");
  }

  // Architecture Patterns
  const patterns = ctx.architecture_signals.patterns_detected;
  if (patterns.length > 0) {
    lines.push("## Architecture Patterns");
    lines.push("");
    lines.push("Reference these patterns in prompts for architectural consistency:");
    lines.push("");
    for (const p of patterns) {
      lines.push(`- ${p}`);
    }
    lines.push("");
  }

  // Warnings
  const warnings = ctx.ai_context.warnings;
  if (warnings.length > 0) {
    lines.push("## Optimization Warnings");
    lines.push("");
    for (const w of warnings) {
      lines.push(`- ⚠️ ${w}`);
    }
    lines.push("");
  }

  return {
    path: ".ai/optimization-rules.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "optimization",
    description: "Prompt and context efficiency rules based on project analysis",
  };
}

// ─── prompt-diff-report.md ──────────────────────────────────────

export function generatePromptDiffReport(ctx: ContextMap, profile: RepoProfile): GeneratedFile {
  const id = ctx.project_identity;
  const lines: string[] = [];

  lines.push(`# Prompt Diff Report — ${id.name}`);
  lines.push("");
  lines.push(`> Before/after recommendations for prompt quality improvement`);
  lines.push("");

  // Scoring dimensions
  const scores: Array<{ dimension: string; before: number; after: number; recommendation: string }> = [];

  // 1. Context Precision
  const totalFiles = ctx.structure.total_files;
  const hotspotCount = ctx.dependency_graph.hotspots.length;
  const contextBefore = totalFiles > 50 ? 30 : totalFiles > 20 ? 50 : 70;
  const contextAfter = Math.min(95, contextBefore + (hotspotCount > 0 ? 30 : 15));
  scores.push({
    dimension: "Context Precision",
    before: contextBefore,
    after: contextAfter,
    recommendation: hotspotCount > 0
      ? `Use dependency hotspot analysis to select the ${Math.min(hotspotCount, 10)} highest-signal files instead of including entire directories.`
      : "Project is small enough for full-context inclusion. Include all source files in prompts.",
  });

  // 2. Convention Compliance
  const conventionCount = ctx.ai_context.conventions.length;
  const convBefore = conventionCount > 0 ? 40 : 70;
  const convAfter = conventionCount > 0 ? 90 : 75;
  scores.push({
    dimension: "Convention Compliance",
    before: convBefore,
    after: convAfter,
    recommendation: conventionCount > 0
      ? `Embed ${conventionCount} detected conventions as system-level constraints in every code generation prompt.`
      : "No strong conventions detected. Consider adding .cursorrules or CLAUDE.md to establish them.",
  });

  // 3. Dependency Awareness
  const depCount = ctx.dependency_graph.external_dependencies.length;
  const depBefore = depCount > 20 ? 30 : depCount > 10 ? 50 : 70;
  const depAfter = Math.min(90, depBefore + 30);
  scores.push({
    dimension: "Dependency Awareness",
    before: depBefore,
    after: depAfter,
    recommendation: depCount > 20
      ? `Reference package.json in prompts to constrain imports to the ${depCount} actual dependencies. Prevents hallucinated package references.`
      : "Include package.json to ensure generated code uses existing dependencies.",
  });

  // 4. Architecture Alignment
  const archPatterns = ctx.architecture_signals.patterns_detected.length;
  const sepScore = ctx.architecture_signals.separation_score;
  const archBefore = archPatterns > 0 ? 40 : 60;
  const archAfter = archPatterns > 0 ? 85 : 65;
  scores.push({
    dimension: "Architecture Alignment",
    before: archBefore,
    after: archAfter,
    recommendation: archPatterns > 0
      ? `Reference ${archPatterns} detected patterns (separation score: ${sepScore}/100) in architectural prompts to maintain layer boundaries.`
      : "No strong architecture patterns detected. Define layer boundaries to improve prompt-generated code placement.",
  });

  // 5. Route Awareness
  const routeCount = ctx.routes.length;
  const routeBefore = routeCount > 10 ? 35 : routeCount > 0 ? 55 : 80;
  const routeAfter = routeCount > 0 ? 85 : 80;
  scores.push({
    dimension: "Route Awareness",
    before: routeBefore,
    after: routeAfter,
    recommendation: routeCount > 0
      ? `Include route map (${routeCount} routes) in prompts when working on API or page code to prevent duplicate endpoints.`
      : "No routes detected — route-aware prompting not applicable.",
  });

  // Summary table
  lines.push("## Score Summary");
  lines.push("");
  lines.push("| Dimension | Before | After | Delta |");
  lines.push("|-----------|--------|-------|-------|");
  let totalBefore = 0;
  let totalAfter = 0;
  for (const s of scores) {
    const delta = s.after - s.before;
    lines.push(`| ${s.dimension} | ${s.before}/100 | ${s.after}/100 | +${delta} |`);
    totalBefore += s.before;
    totalAfter += s.after;
  }
  const avgBefore = Math.round(totalBefore / scores.length);
  const avgAfter = Math.round(totalAfter / scores.length);
  lines.push(`| **Overall** | **${avgBefore}/100** | **${avgAfter}/100** | **+${avgAfter - avgBefore}** |`);
  lines.push("");

  // Detailed recommendations
  lines.push("## Recommendations");
  lines.push("");
  for (const s of scores) {
    lines.push(`### ${s.dimension}`);
    lines.push("");
    lines.push(s.recommendation);
    lines.push("");
  }

  // Token budget recommendation
  lines.push("## Token Budget Guidance");
  lines.push("");
  const estimatedTokens = Math.round(ctx.structure.total_loc * 4.5);
  if (estimatedTokens > 100000) {
    lines.push(`Estimated full-project tokens: ~${estimatedTokens.toLocaleString()}`);
    lines.push("");
    lines.push("**Selective context required.** Use this priority order:");
    lines.push("1. Active file being modified");
    lines.push("2. Direct imports / dependencies (1 hop)");
    lines.push("3. Dependency hotspots from optimization-rules.md");
    lines.push("4. Type definitions and interfaces");
    lines.push("5. Test files (for TDD context)");
  } else if (estimatedTokens > 30000) {
    lines.push(`Estimated full-project tokens: ~${estimatedTokens.toLocaleString()}`);
    lines.push("");
    lines.push("**Partial context viable.** Include:");
    lines.push("- All source files (skip node_modules, lockfiles, build output)");
    lines.push("- Configuration files for constraint context");
    lines.push("- Test files relevant to current work");
  } else {
    lines.push(`Estimated full-project tokens: ~${estimatedTokens.toLocaleString()}`);
    lines.push("");
    lines.push("**Full context viable.** This project fits comfortably in a single prompt.");
  }
  lines.push("");

  return {
    path: "prompt-diff-report.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "optimization",
    description: "Before/after analysis of prompt quality with actionable recommendations",
  };
}

// ─── cost-estimate.json ─────────────────────────────────────────

export function generateCostEstimate(ctx: ContextMap, profile: RepoProfile): GeneratedFile {
  const totalLoc = ctx.structure.total_loc;
  const totalFiles = ctx.structure.total_files;

  // Token estimation: ~4.5 tokens per line of code (empirical average)
  const tokensPerLoc = 4.5;
  const fullProjectTokens = Math.round(totalLoc * tokensPerLoc);

  // Per-language breakdown
  const languageBreakdown = ctx.detection.languages.map(lang => {
    const langFiles = ctx.structure.file_tree_summary.filter(f => f.language === lang.name);
    const langLoc = langFiles.reduce((sum, f) => sum + f.loc, 0);
    return {
      language: lang.name,
      files: langFiles.length,
      loc: langLoc,
      estimated_tokens: Math.round(langLoc * tokensPerLoc),
      percentage: totalLoc > 0 ? Math.round((langLoc / totalLoc) * 100) : 0,
    };
  }).filter(l => l.loc > 0);

  // Cost models (approximate $/1M tokens as of 2025)
  const models = [
    { name: "GPT-4o", input_per_1m: 2.50, output_per_1m: 10.00 },
    { name: "GPT-4o-mini", input_per_1m: 0.15, output_per_1m: 0.60 },
    { name: "Claude Sonnet 4", input_per_1m: 3.00, output_per_1m: 15.00 },
    { name: "Claude Haiku 3.5", input_per_1m: 0.80, output_per_1m: 4.00 },
    { name: "Gemini 2.5 Pro", input_per_1m: 1.25, output_per_1m: 10.00 },
  ];

  // Estimate costs per operation type
  const operations = [
    {
      name: "full_project_context",
      description: "Include entire project source as context",
      input_tokens: fullProjectTokens,
      output_tokens: 2000,
    },
    {
      name: "selective_context",
      description: "Include top 10 files + config as context",
      input_tokens: Math.min(fullProjectTokens, Math.round(fullProjectTokens * 0.25)),
      output_tokens: 2000,
    },
    {
      name: "single_file_edit",
      description: "Edit one file with minimal context",
      input_tokens: Math.min(fullProjectTokens, 5000),
      output_tokens: 1500,
    },
    {
      name: "code_review",
      description: "Review a diff with project context",
      input_tokens: Math.round(fullProjectTokens * 0.4),
      output_tokens: 3000,
    },
  ];

  const costMatrix = operations.map(op => ({
    operation: op.name,
    description: op.description,
    input_tokens: op.input_tokens,
    output_tokens: op.output_tokens,
    costs: models.map(m => ({
      model: m.name,
      input_cost: Number(((op.input_tokens / 1_000_000) * m.input_per_1m).toFixed(4)),
      output_cost: Number(((op.output_tokens / 1_000_000) * m.output_per_1m).toFixed(4)),
      total_cost: Number((
        (op.input_tokens / 1_000_000) * m.input_per_1m +
        (op.output_tokens / 1_000_000) * m.output_per_1m
      ).toFixed(4)),
    })),
  }));

  // Optimization opportunities
  const optimizations: string[] = [];
  if (fullProjectTokens > 100000) {
    optimizations.push("Use selective context — full project exceeds most context windows");
  }
  if (ctx.dependency_graph.hotspots.length > 5) {
    optimizations.push(`Focus on ${ctx.dependency_graph.hotspots.length} dependency hotspots for efficient context selection`);
  }
  if (languageBreakdown.length > 3) {
    optimizations.push("Filter context by language when working in a specific tech stack layer");
  }
  const configFiles = ctx.structure.file_tree_summary.filter(f => f.role === "config");
  if (configFiles.length > 0) {
    optimizations.push(`Include ${configFiles.length} config files (low token cost, high constraint value)`);
  }

  const estimate = {
    project: ctx.project_identity.name,
    generated_at: new Date().toISOString(),
    summary: {
      total_files: totalFiles,
      total_loc: totalLoc,
      estimated_total_tokens: fullProjectTokens,
      primary_language: ctx.project_identity.primary_language,
    },
    language_breakdown: languageBreakdown,
    cost_matrix: costMatrix,
    optimization_opportunities: optimizations,
    notes: [
      "Token estimates use ~4.5 tokens/line empirical average",
      "Actual costs vary by prompt structure and model behavior",
      "Output token estimates are approximate for typical operations",
      "Costs are per-operation — multiply by expected daily/weekly frequency",
    ],
  };

  return {
    path: "cost-estimate.json",
    content: JSON.stringify(estimate, null, 2),
    content_type: "application/json",
    program: "optimization",
    description: "Token cost estimates per model and operation type",
  };
}
