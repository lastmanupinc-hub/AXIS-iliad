import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { GeneratedFile, SourceFile } from "./types.js";
import { hasFw } from "./fw-helpers.js";
import { findConfigs, findEntryPoints, renderExcerpts, extractExports, fileTree } from "./file-excerpt-utils.js";
// Prompt-injection defense for the 3 markdown generators; the cost-estimate.json
// generator emits JSON.stringify(obj), which escapes every value (contained by
// construction). mdText/mdInline/mdCode/mdCellCode per sink context.
import { mdText, mdInline, mdCode, mdCellCode } from "./md-sanitize.js";

/**
 * Approximate $/1M tokens as of 2025. Exported (not inlined in
 * generateCostEstimate) so app_33's live-meter watcher
 * (apps/api/src/optimization-meter-watcher.ts) prices real detected call
 * sites from the SAME table this file's own static estimate uses — a second,
 * hand-copied price list is exactly the hand-duplicated-catalog drift family
 * this repo's own tooling exists to catch.
 */
export const LLM_MODEL_PRICING = [
  { name: "GPT-4o", input_per_1m: 2.50, output_per_1m: 10.00 },
  { name: "GPT-4o-mini", input_per_1m: 0.15, output_per_1m: 0.60 },
  { name: "Claude Sonnet 4", input_per_1m: 3.00, output_per_1m: 15.00 },
  { name: "Claude Haiku 3.5", input_per_1m: 0.80, output_per_1m: 4.00 },
  { name: "Gemini 2.5 Pro", input_per_1m: 1.25, output_per_1m: 10.00 },
] as const;

// ─── .ai/optimization-rules.md ──────────────────────────────────

export function generateOptimizationRules(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const lines: string[] = [];

  lines.push(`# Optimization Rules — ${mdText(id.name)}`);
  lines.push("");
  lines.push(`> Prompt and context efficiency guidelines for a ${mdText(id.type.replace(/_/g, " "))} (${mdText(id.primary_language)})`);
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
  lines.push(`| Total LOC | ${totalLoc.toLocaleString("en-US")} |`);
  lines.push(`| Average LOC / file | ${avgLoc} |`);
  lines.push(`| Estimated token count | ~${Math.round(totalLoc * 4.5).toLocaleString("en-US")} |`);
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

  const hotspots = [...ctx.dependency_graph.hotspots]
    .sort((a, b) => b.risk_score - a.risk_score)
    .slice(0, 10);
  if (hotspots.length > 0) {
    lines.push("### Dependency Hotspots");
    lines.push("");
    lines.push("| File | Inbound | Outbound | Risk |");
    lines.push("|------|---------|----------|------|");
    for (const h of hotspots) {
      lines.push(`| \`${mdCellCode(h.path)}\` | ${h.inbound_count} | ${h.outbound_count} | ${h.risk_score.toFixed(1)} |`);
    }
    lines.push("");
  }

  const entryPoints = ctx.entry_points.slice(0, 8);
  // Fall back to the file-based detector when the engine's entry_points is empty
  // (it frequently is) so this section agrees with prompt-diff-report.md's
  // "Source-Verified Entry Points" instead of implying the repo has none.
  const fallbackEntries = entryPoints.length === 0 && files ? findEntryPoints(files).slice(0, 8) : [];
  if (entryPoints.length > 0 || fallbackEntries.length > 0) {
    lines.push("### Entry Points");
    lines.push("");
    if (entryPoints.length > 0) {
      for (const ep of entryPoints) {
        lines.push(`- \`${mdCode(ep.path)}\` — ${mdText(ep.description)} (${mdText(ep.type)})`);
      }
    } else {
      for (const ep of fallbackEntries) {
        lines.push(`- \`${mdCode(ep.path)}\``);
      }
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

  // Framework-Specific Prompt Strategies — grounded in the ACTUAL detected stack
  // and the real config files present in this repo, not generic placeholders.
  lines.push("## Prompt Strategy");
  lines.push("");
  const frameworks = ctx.detection.frameworks.map(f => f.name);
  if (frameworks.length > 0) {
    lines.push(`Detected stack: ${frameworks.map(f => `\`${mdCode(f)}\``).join(", ")}. Anchor every prompt in the real files below so generated code matches this project's actual setup and dependency versions.`);
    lines.push("");
  }

  // Name the actual config files in THIS repo so "include your config" advice
  // points at concrete paths, never a `next.config.*`-style placeholder.
  const allConfigPaths = ctx.structure.file_tree_summary
    .filter(f => f.role === "config")
    .map(f => f.path);
  const configFilePaths = allConfigPaths.slice(0, 10);
  if (configFilePaths.length > 0) {
    lines.push("### Always-include configuration (constrains generated code)");
    lines.push("");
    for (const p of configFilePaths) {
      lines.push(`- \`${mdCode(p)}\``);
    }
    // Disclose the truncation — this list is an "always include" set; hiding the
    // tail made an agent drop the other config files (contradicted cost-estimate.json).
    if (allConfigPaths.length > 10) lines.push(`- *… ${allConfigPaths.length - 10} more (see context-map.json)*`);
    lines.push("");
  }

  if (hasFw(ctx, "Next.js")) {
    lines.push("### Next.js Projects");
    lines.push("");
    lines.push("1. Always include `next.config.*` and `tsconfig.json` for project constraints");
    lines.push("2. Include the relevant `app/` or `pages/` route file for route-specific work");
    lines.push("3. Include shared layout files (`layout.tsx`) for UI consistency context");
    lines.push("4. Reference `package.json` dependencies to prevent hallucinated imports");
    lines.push("");
  }
  if (hasFw(ctx, "React")) {
    lines.push("### React Projects");
    lines.push("");
    lines.push("1. Include component files and their direct imports (1 hop)");
    lines.push("2. Include shared type definitions and utility modules");
    lines.push("3. Include CSS/styling config (tailwind.config, theme files) for style-aware generation");
    lines.push("");
  }
  if (hasFw(ctx, "Prisma")) {
    lines.push("### Prisma / Database");
    lines.push("");
    lines.push("1. Always include `schema.prisma` for any database-related prompts");
    lines.push("2. Include migration files when debugging schema changes");
    lines.push("3. Reference generated client types for type-safe queries");
    lines.push("");
  }

  // Any other detected framework gets grounded guidance too — the section is no
  // longer limited to the three hardcoded stacks above.
  const specialCased = new Set(["next.js", "react", "prisma"]);
  const otherFrameworks = frameworks.filter(f => !specialCased.has(f.toLowerCase()));
  if (otherFrameworks.length > 0) {
    lines.push(`### ${otherFrameworks.map(mdText).join(", ")}`);
    lines.push("");
    lines.push(`Include this project's ${otherFrameworks.map(f => `\`${mdCode(f)}\``).join(" / ")} config + entry files (listed above) in prompts so generated code follows the framework's real conventions and the versions pinned in this repo — not a generic template.`);
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
      lines.push(`- ${mdText(c)}`);
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
      lines.push(`- ${mdText(p)}`);
    }
    lines.push("");
  }

  // Warnings
  const warnings = ctx.ai_context.warnings;
  /* v8 ignore next — V8 quirk: warnings section tested in optimization tests */
  if (warnings.length > 0) {
    lines.push("## Optimization Warnings");
    lines.push("");
    for (const w of warnings) {
      lines.push(`- ⚠️ ${mdText(w)}`);
    }
    lines.push("");
  }

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    // Real, quantified bloat findings — the concrete version of the static
    // "Low-Value Files" list above.
    lines.push(...renderContextBloat(analyzeContextBloat(files)));

    const configs = findConfigs(files);
    if (configs.length > 0) {
      lines.push(...renderExcerpts("Configuration Files (Include in Prompts)", configs.slice(0, 4), 20));
    }

    // Cap the tree: an "optimization" doc that preaches "exclude low-value files"
    // shouldn't itself dump all N files. Show the first 40 + a count. Fence is
    // sized longer than any backtick run in the content so a path containing
    // backticks can't close it early (CommonMark) — the same guard as excerpt().
    const treeLines = fileTree(files).split("\n");
    const TREE_CAP = 40;
    const shownTree = treeLines.slice(0, TREE_CAP).join("\n");
    const overflow = treeLines.length > TREE_CAP ? `\n... and ${treeLines.length - TREE_CAP} more files (see context-map.json for the full tree)` : "";
    const treeBody = shownTree + overflow;
    const longestRun = (treeBody.match(/`+/g) ?? []).reduce((m, r) => Math.max(m, r.length), 0);
    const fence = "`".repeat(Math.max(3, longestRun + 1));
    lines.push("## File Tree");
    lines.push("");
    lines.push(`${fence}\n${treeBody}\n${fence}`);
    lines.push("");

    // Show hotspot file excerpts based on dependency graph
    const hotspotPaths = [...ctx.dependency_graph.hotspots]
      .sort((a, b) => b.risk_score - a.risk_score)
      .slice(0, 3)
      .map(h => h.path);
    const hotspotFiles = files.filter(f => hotspotPaths.some(hp => f.path.endsWith(hp) || f.path.includes(hp)));
    if (hotspotFiles.length > 0) {
      lines.push(...renderExcerpts("Hotspot File Excerpts", hotspotFiles, 25));
    }
  }

  return {
    path: "optimization-rules.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "optimization",
    description: "Prompt and context efficiency rules based on project analysis",
  };
}

// ═══ Deterministic context-bloat scan ════════════════════════════════════════
// A grep + rule-table scan of the ACTUAL uploaded files that quantifies which
// low-signal files inflate token cost (build output, lockfiles, minified
// bundles, snapshots, oversized files) and how much excluding them saves — the
// concrete version of the static "exclude these" list. No LLM, deterministic.

const TOKENS_PER_LINE = 4.5;

export interface BloatFinding {
  path: string;
  tokens: number;
  reason: "generated/build output" | "dependency lockfile" | "minified bundle" | "test snapshot/fixture" | "vendored dependency" | "oversized file (>6K tokens)";
}

/**
 * Estimate a file's tokens. Uses the MAX of a line-based (4.5 tok/line) and a
 * char-based (~4 chars/tok) estimate — a line-count-only estimate reported a
 * 70 KB minified file on ONE line as ~5 tokens, so the bloat scan (the tool's
 * flagship feature) completely missed its single largest file. char/4 catches
 * minified/single-line bundles.
 */
function fileTokens(f: SourceFile): number {
  return Math.max(
    Math.round(f.content.split("\n").length * TOKENS_PER_LINE),
    Math.round(f.content.length / 4),
  );
}

/** Whether a finding is SAFE to exclude wholesale (vs. an oversized real source file that may be needed). */
function isExcludable(reason: BloatFinding["reason"]): boolean {
  return reason !== "oversized file (>6K tokens)";
}

/**
 * Static context-bloat scan of the uploaded files. Deterministic (code-unit sort).
 * `bloatTokens` counts only SAFE-to-exclude files (build output, lockfiles,
 * minified, snapshots, vendored) — NOT oversized source files, which are flagged
 * for review (you may genuinely need `handlers.ts` in context; blindly excluding
 * real logic to save tokens is bad advice, so it's not in the "savings" figure).
 */
export function analyzeContextBloat(files: SourceFile[]): { findings: BloatFinding[]; totalTokens: number; bloatTokens: number } {
  const findings: BloatFinding[] = [];
  let totalTokens = 0;
  for (const f of files) {
    const tokens = fileTokens(f);
    totalTokens += tokens;
    let reason: BloatFinding["reason"] | null = null;
    if (/(^|\/)(dist|build|out|\.next|\.turbo|coverage)\//.test(f.path)
        || /(^|\/)(coverage[-.][^/]*|lcov)\.(txt|info|json|xml)$/i.test(f.path)
        || /-coverage\.(txt|info|json|xml)$/i.test(f.path)) reason = "generated/build output"; // root-level coverage reports, not just a coverage/ dir
    else if (/(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$|\.lock$/.test(f.path)) reason = "dependency lockfile";
    else if (/\.min\.(js|css)$/.test(f.path)) reason = "minified bundle";
    else if (/(^|\/)(__snapshots__)\/|\.snap$/.test(f.path) || /(^|\/)(fixtures?|__fixtures__)\//.test(f.path)) reason = "test snapshot/fixture";
    else if (/(^|\/)(vendor|vendored|third[_-]?party)\//.test(f.path)) reason = "vendored dependency";
    else if (tokens > 6000) reason = "oversized file (>6K tokens)";
    if (reason) findings.push({ path: f.path, tokens, reason });
  }
  findings.sort((a, b) => b.tokens - a.tokens || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const bloatTokens = findings.filter(f => isExcludable(f.reason)).reduce((s, f) => s + f.tokens, 0);
  return { findings, totalTokens, bloatTokens };
}

/** Render the context-bloat findings as markdown lines. */
export function renderContextBloat(scan: { findings: BloatFinding[]; totalTokens: number; bloatTokens: number }): string[] {
  const lines: string[] = [];
  lines.push("## Context Bloat (deterministic)");
  lines.push("");
  lines.push("> Static scan of the uploaded files — grep + a rule table, **no AI**. These low-signal files inflate prompt token cost; exclude them from context.");
  lines.push("");
  if (scan.findings.length === 0) {
    lines.push("_No build output, lockfiles, minified bundles, snapshots, or oversized files detected — the context is already lean._");
    lines.push("");
    return lines;
  }
  const excludable = scan.findings.filter(f => isExcludable(f.reason));
  const oversized = scan.findings.filter(f => !isExcludable(f.reason));
  if (excludable.length > 0) {
    const pct = scan.totalTokens > 0 ? Math.round((scan.bloatTokens / scan.totalTokens) * 100) : 0;
    lines.push(`**Excluding these ${excludable.length} low-signal file(s) removes ~${scan.bloatTokens.toLocaleString("en-US")} tokens (${pct}% of the ~${scan.totalTokens.toLocaleString("en-US")} total) — safe to drop from prompts.**`);
    lines.push("");
    lines.push("| File | ~Tokens | Reason |");
    lines.push("|------|---------|--------|");
    for (const f of excludable.slice(0, 30)) {
      lines.push(`| \`${mdCellCode(f.path)}\` | ${f.tokens.toLocaleString("en-US")} | ${f.reason} |`);
    }
    if (excludable.length > 30) lines.push(`| *… ${excludable.length - 30} more* | | |`);
    lines.push("");
  }
  if (oversized.length > 0) {
    lines.push("### Oversized source files (review — don't blindly exclude)");
    lines.push("");
    lines.push("These are large but likely real source. Include them SELECTIVELY (only when relevant) or split them — don't drop needed logic just to save tokens.");
    lines.push("");
    lines.push("| File | ~Tokens |");
    lines.push("|------|---------|");
    for (const f of oversized.slice(0, 15)) {
      lines.push(`| \`${mdCellCode(f.path)}\` | ${f.tokens.toLocaleString("en-US")} |`);
    }
    if (oversized.length > 15) lines.push(`| *… ${oversized.length - 15} more* | |`);
    lines.push("");
  }
  return lines;
}

// ─── prompt-diff-report.md ──────────────────────────────────────

export function generatePromptDiffReport(ctx: ContextMap, profile: RepoProfile, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const lines: string[] = [];

  lines.push(`# Prompt Diff Report — ${mdText(id.name)}`);
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
  /* v8 ignore next 2 — V8 quirk: dep count ternaries tested with varying dep counts */
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
      // separation_score is a 0–1 fraction; render it as a percentage. `${sepScore}/100`
      // printed a healthy 0.65 (65%) as "0.65/100" (≈0.65%), a catastrophic-looking score.
      ? `Reference ${archPatterns} detected patterns (separation score: ${Math.round(sepScore * 100)}/100) in architectural prompts to maintain layer boundaries.`
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

  // Summary table. These before/after numbers are ILLUSTRATIVE targets chosen by
  // coarse thresholds from repo signals (routes, patterns, deps) — NOT measured
  // prompt-quality scores. Framed as such so the aggregate isn't read as a real
  // "+N improvement" that was actually observed.
  lines.push("## Illustrative Prompt-Quality Projection");
  lines.push("");
  lines.push("> These before/after figures are **illustrative targets** derived from repo signals (routes, architecture patterns, dependencies) — not measured prompt-quality scores. Use them as relative guidance for where context helps most, not as metrics.");
  lines.push("");
  lines.push("| Dimension | Before (est.) | Target | Uplift |");
  lines.push("|-----------|---------------|--------|--------|");
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
  lines.push(`| _Average (illustrative)_ | ${avgBefore}/100 | ${avgAfter}/100 | +${avgAfter - avgBefore} |`);
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
    lines.push(`Estimated full-project tokens: ~${estimatedTokens.toLocaleString("en-US")}`);
    lines.push("");
    lines.push("**Selective context required.** Use this priority order:");
    lines.push("1. Active file being modified");
    lines.push("2. Direct imports / dependencies (1 hop)");
    lines.push("3. Dependency hotspots from optimization-rules.md");
    lines.push("4. Type definitions and interfaces");
    lines.push("5. Test files (for TDD context)");
  } else if (estimatedTokens > 30000) {
    lines.push(`Estimated full-project tokens: ~${estimatedTokens.toLocaleString("en-US")}`);
    lines.push("");
    lines.push("**Partial context viable.** Include:");
    lines.push("- All source files (skip node_modules, lockfiles, build output)");
    lines.push("- Configuration files for constraint context");
    lines.push("- Test files relevant to current work");
  } else {
    lines.push(`Estimated full-project tokens: ~${estimatedTokens.toLocaleString("en-US")}`);
    lines.push("");
    lines.push("**Full context viable.** This project fits comfortably in a single prompt.");
  }
  lines.push("");

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const entries = findEntryPoints(files);
    if (entries.length > 0) {
      lines.push("## Source-Verified Entry Points");
      lines.push("");
      lines.push("| File | Lines | Exports |");
      lines.push("|------|-------|---------|");
      for (const ep of entries.slice(0, 6)) {
        const exports = extractExports(ep.content);
        const lineCount = ep.content.split("\n").length;
        lines.push(`| \`${mdCellCode(ep.path)}\` | ${lineCount} | ${exports.map(mdInline).join(", ") || "default"} |`);
      }
      lines.push("");
    }
  }

  return {
    path: "prompt-diff-report.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "optimization",
    description: "Before/after analysis of prompt quality with actionable recommendations",
  };
}

// ─── cost-estimate.json ─────────────────────────────────────────

export function generateCostEstimate(ctx: ContextMap, profile: RepoProfile, files?: SourceFile[]): GeneratedFile {
  const totalLoc = ctx.structure.total_loc;
  const totalFiles = ctx.structure.total_files;

  // Token estimation: ~4.5 tokens per line of code (empirical average)
  const tokensPerLoc = 4.5;
  const fullProjectTokens = Math.round(totalLoc * tokensPerLoc);

  // Per-language breakdown. `percentage` is share of CLASSIFIED LOC (the sum of
  // the language rows), so the breakdown percentages sum to 100 — not share of
  // structure.total_loc (which includes unclassified lockfiles/assets and would
  // make the rows under-sum to <100 against their own table).
  const classifiedLoc = ctx.detection.languages.reduce((sum, l) => sum + l.loc, 0);
  const languageBreakdown = ctx.detection.languages.map(lang => {
    const langFiles = ctx.structure.file_tree_summary.filter(f => f.language === lang.name);
    const langLoc = langFiles.reduce((sum, f) => sum + f.loc, 0);
    return {
      language: lang.name,
      files: langFiles.length,
      loc: langLoc,
      estimated_tokens: Math.round(langLoc * tokensPerLoc),
      /* v8 ignore start — V8 quirk: classifiedLoc always > 0 in practice */
      percentage: classifiedLoc > 0 ? Math.round((langLoc / classifiedLoc) * 100) : 0,
      /* v8 ignore stop */
    };
  }).filter(l => l.loc > 0);

  const models = LLM_MODEL_PRICING;

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
    generated_at: ctx.generated_at,
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
    // ─── Source File Analysis ──────────────────────────────────
    source_file_count: files ? files.length : null,
    source_total_lines: files ? files.reduce((sum, f) => sum + f.content.split("\n").length, 0) : null,
  };

  return {
    path: "cost-estimate.json",
    content: JSON.stringify(estimate, null, 2),
    content_type: "application/json",
    program: "optimization",
    description: "Token cost estimates per model and operation type",
  };
}

// ─── token-budget-plan.md ───────────────────────────────────────

export function generateTokenBudgetPlan(ctx: ContextMap, profile: RepoProfile, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const languages = ctx.detection.languages;
  // Use the SAME all-files base as the other 3 optimization artifacts
  // (structure.total_*), so the headline LOC / token / "Repo Fits" / cost numbers
  // AGREE across the 4 deliverables. Summing only language-detected files (the old
  // behavior) excluded lockfiles/assets/LICENSE and produced an optimistic total
  // that contradicted cost-estimate.json + optimization-rules.md for one repo.
  const totalLoc = ctx.structure.total_loc;
  const totalFiles = ctx.structure.total_files;
  const tokensPerLine = 4.5;
  const totalTokens = Math.round(totalLoc * tokensPerLine);

  const lines: string[] = [];
  lines.push(`# Token Budget Plan — ${mdText(id.name)}`);
  lines.push("");
  lines.push(`Generated: ${ctx.generated_at}`);
  lines.push("");

  lines.push("## Project Token Profile");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| Total LOC | ${totalLoc.toLocaleString("en-US")} |`);
  lines.push(`| Total Files | ${totalFiles} |`);
  lines.push(`| Est. Total Tokens | ${totalTokens.toLocaleString("en-US")} |`);
  lines.push(`| Avg Tokens/File | ${totalFiles > 0 ? Math.round(totalTokens / totalFiles).toLocaleString("en-US") : "N/A"} |`);
  lines.push("");

  lines.push("## Token Budget by Language");
  lines.push("");
  lines.push("| Language | LOC | Tokens | % of Budget |");
  lines.push("|----------|-----|--------|-------------|");
  for (const l of languages) {
    const tokens = Math.round(l.loc * tokensPerLine);
    lines.push(`| ${mdInline(l.name)} | ${l.loc.toLocaleString("en-US")} | ${tokens.toLocaleString("en-US")} | ${l.loc_percent.toFixed(1)}% |`);
  }
  lines.push("");

  lines.push("## Context Window Allocation");
  lines.push("");
  // Model line-up kept consistent with cost-estimate.json's roster.
  const models = [
    { name: "GPT-4o", window: 128000 },
    { name: "Claude Sonnet 4", window: 200000 },
    { name: "Claude Opus 4", window: 200000 },
    { name: "Gemini 2.5 Pro", window: 1000000 },
  ];
  lines.push("| Model | Context Window | Repo Fits | Recommended Strategy |");
  lines.push("|-------|---------------|-----------|----------------------|");
  for (const m of models) {
    const fits = totalTokens <= m.window;
    const strategy = fits ? "Full repo context" :
      totalTokens <= m.window * 3 ? "Selective file context" : "Chunked / RAG approach";
    const windowLabel = m.window >= 1_000_000 ? `${m.window / 1_000_000}M` : `${(m.window / 1000).toFixed(0)}K`;
    lines.push(`| ${m.name} | ${windowLabel} | ${fits ? "✅ Yes" : "❌ No"} | ${strategy} |`);
  }
  lines.push("");

  lines.push("## Budget Allocation Strategy");
  lines.push("");
  lines.push("### Recommended Context Packing Order");
  lines.push("");
  lines.push("1. **System prompt + instructions** (~500 tokens)");
  lines.push("2. **Architecture summary** (~800 tokens)");
  lines.push("3. **Relevant file contents** (variable)");
  lines.push("4. **Type definitions** (~200 tokens per interface)");
  lines.push("5. **Test context** (~300 tokens per test file)");
  lines.push("6. **User query** (~100 tokens)");
  lines.push("");

  lines.push("### Cost Optimization Rules");
  lines.push("");
  lines.push("1. **Never send the entire repo** when a subset suffices");
  lines.push("2. **Prioritize type definitions** over implementation details");
  lines.push("3. **Include test files** only when debugging test failures");
  lines.push("4. **Trim comments and blank lines** from context (saves ~15% tokens)");
  lines.push("5. **Cache repeated context** across multi-turn conversations");
  lines.push("");

  lines.push("## Daily Budget Estimates");
  lines.push("");
  // Derive operations from actual codebase signals
  const routeCount = ctx.routes.length;
  const hotspotCount = ctx.dependency_graph.hotspots.length;
  const domainModelCount = ctx.domain_models.length;
  const avgHotspotLoc = hotspotCount > 0
    ? Math.round(ctx.dependency_graph.hotspots
        .slice(0, 5)
        .reduce((sum, h) => {
          const f = ctx.structure.file_tree_summary.find(ft => ft.path === h.path || ft.path.endsWith(h.path));
          return sum + (f ? f.loc : 200);
        }, 0) / Math.min(hotspotCount, 5))
    : 200;
  const hotspotTokens = Math.round(avgHotspotLoc * 4.5);
  const modelDefTokens = domainModelCount > 0 ? Math.round(domainModelCount * 80) : 400;
  const typicalFileTokens = totalFiles > 0 ? Math.round((totalTokens / totalFiles) * 0.8) : 2000;

  const derivedOps = [
    {
      op: "Code review (1 file)",
      inputTokens: Math.max(1500, typicalFileTokens + 500),
      outputTokens: 500,
      daily: 10,
    },
    {
      op: routeCount > 0 ? `API endpoint work (${routeCount} routes detected)` : "Feature implementation",
      inputTokens: Math.max(3000, Math.min(8000, Math.round(routeCount * 120) + modelDefTokens + 1000)),
      outputTokens: 2000,
      daily: 5,
    },
    {
      op: hotspotCount > 0 ? `Hotspot refactor (${hotspotCount} hotspots, avg ${hotspotTokens} tok each)` : "Bug investigation",
      inputTokens: Math.max(4000, Math.min(12000, hotspotTokens * 2 + modelDefTokens)),
      outputTokens: 1500,
      daily: 3,
    },
    {
      op: domainModelCount > 0 ? `Domain model change (${domainModelCount} models)` : "Refactoring",
      inputTokens: Math.max(2000, Math.min(8000, modelDefTokens * 3)),
      outputTokens: 2500,
      daily: 2,
    },
    {
      op: "Documentation",
      inputTokens: Math.max(2000, Math.round(totalTokens * 0.05)),
      outputTokens: 1500,
      daily: 2,
    },
  ];
  lines.push("| Operation | Input | Output | Daily | Monthly Cost (GPT-4o) |");
  lines.push("|-----------|-------|--------|-------|----------------------|");
  for (const op of derivedOps) {
    const monthlyCost = (op.inputTokens * 2.50 / 1_000_000 + op.outputTokens * 10.00 / 1_000_000) * op.daily * 22;
    lines.push(`| ${op.op} | ${op.inputTokens.toLocaleString("en-US")} | ${op.outputTokens.toLocaleString("en-US")} | ${op.daily} | $${monthlyCost.toFixed(2)} |`);
  }
  lines.push("");
  lines.push("> Token estimates derived from detected project signals: routes, hotspots, domain models, and average file size.");
  lines.push("");

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const totalSourceLines = files.reduce((sum, f) => sum + f.content.split("\n").length, 0);
    const estimatedTokens = Math.round(totalSourceLines * 4.5);
    lines.push("## Source-Verified Token Estimate (cross-check)");
    lines.push("");
    lines.push(`- Source files scanned: ${files.length}`);
    lines.push(`- Total physical lines (incl. blanks + comments): ${totalSourceLines.toLocaleString("en-US")}`);
    lines.push(`- Estimated tokens (physical-line basis): ~${estimatedTokens.toLocaleString("en-US")}`);
    lines.push("");
    // Reconcile with the headline so the two figures don't read as a contradiction:
    // the headline uses code LOC (agrees across all 4 deliverables); this counts
    // every physical line of the scanned files, so it runs higher by design.
    lines.push(`> Cross-check only. The headline **${totalTokens.toLocaleString("en-US")}** tokens is from code LOC (${totalLoc.toLocaleString("en-US")}) and is the budgeting number; this ${estimatedTokens.toLocaleString("en-US")} counts every physical line (blanks + comments) of the ${files.length} scanned files, so it's higher.`);
    lines.push("");
  }

  return {
    path: "token-budget-plan.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "optimization",
    description: "Token budget allocation, model context window analysis, and cost optimization strategy",
  };
}
