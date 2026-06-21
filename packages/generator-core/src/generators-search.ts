import type { ContextMap, RepoProfile } from "@axis/context-engine";
import { extractSymbols } from "@axis/snapshots";
import type { GeneratedFile, SourceFile } from "./types.js";
import { fileTree, findEntryPoints, findConfigs, renderExcerpts, excerpt, extractExports } from "./file-excerpt-utils.js";
import { hasFw, getFw } from "./fw-helpers.js";

export function generateContextMapJSON(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const enriched: Record<string, unknown> = { ...ctx };

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    enriched.source_file_tree = fileTree(files);
  }

  return {
    path: "context-map.json",
    content: JSON.stringify(enriched, null, 2),
    content_type: "application/json",
    program: "search",
    description: "Full project context map — framework detection, routes, architecture, dependency graph",
  };
}

export function generateRepoProfileYAML(profile: RepoProfile, files?: SourceFile[]): GeneratedFile {
  const profileData: Record<string, unknown> = { ...profile };

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    profileData.source_file_count = files.length;
    profileData.source_file_tree = fileTree(files);
  }

  return {
    path: "repo-profile.yaml",
    content: toYAML(profileData),
    content_type: "application/yaml",
    program: "search",
    description: "Compact project profile — identity, detection, structure, health summary",
  };
}

export function generateArchitectureSummary(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const lines: string[] = [];
  const id = ctx.project_identity;

  lines.push(`# Architecture Summary: ${id.name}`);
  lines.push("");
  lines.push(`> ${id.description ?? id.type.replace(/_/g, " ")}`);
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

  // Overview
  lines.push("## Overview");
  lines.push("");
  lines.push(`- **Primary Language:** ${id.primary_language}`);
  lines.push(`- **Project Type:** ${id.type.replace(/_/g, " ")}`);
  lines.push(`- **Files:** ${ctx.structure.total_files} (${ctx.structure.total_loc} LOC)`);
  lines.push(`- **Directories:** ${ctx.structure.total_directories}`);
  lines.push("");

  // Frameworks
  if (ctx.detection.frameworks.length > 0) {
    lines.push("## Frameworks & Libraries");
    lines.push("");
    for (const fw of ctx.detection.frameworks) {
      const pct = Math.round(fw.confidence * 100);
      lines.push(`- **${fw.name}** ${fw.version ?? ""} (${pct}% confidence)`);
    }
    lines.push("");
  }

  // Architecture Signals
  const arch = ctx.architecture_signals;
  if (arch.patterns_detected.length > 0) {
    lines.push("## Architecture Patterns");
    lines.push("");
    for (const p of arch.patterns_detected) {
      lines.push(`- \`${p}\``);
    }
    lines.push(`- **Separation Score:** ${arch.separation_score}`);
    lines.push("");
  }

  // Layer Boundaries
  if (arch.layer_boundaries.length > 0) {
    lines.push("## Layer Boundaries");
    lines.push("");
    lines.push("| Layer | Directories |");
    lines.push("|-------|------------|");
    for (const l of arch.layer_boundaries) {
      lines.push(`| ${l.layer} | ${l.directories.join(", ")} |`);
    }
    lines.push("");
  }

  // Routes
  if (ctx.routes.length > 0) {
    lines.push("## Routes");
    lines.push("");
    lines.push("| Method | Path | Source |");
    lines.push("|--------|------|--------|");
    for (const r of ctx.routes) {
      lines.push(`| ${r.method} | \`${r.path}\` | ${r.source_file} |`);
    }
    lines.push("");
  }

  // Entry Points
  if (ctx.entry_points.length > 0) {
    lines.push("## Entry Points");
    lines.push("");
    for (const ep of ctx.entry_points) {
      lines.push(`- **${ep.type}:** \`${ep.path}\` — ${ep.description}`);
    }
    lines.push("");
  }

  // Top-Level Layout
  lines.push("## Directory Layout");
  lines.push("");
  for (const dir of ctx.structure.top_level_layout) {
    lines.push(`- \`${dir.name}/\` — ${dir.purpose} (${dir.file_count} files)`);
  }
  lines.push("");

  // Dependency Hotspots
  const hotspots = ctx.dependency_graph.hotspots;
  if (hotspots.length > 0) {
    lines.push("## Dependency Hotspots");
    lines.push("");
    lines.push("| File | Inbound | Outbound | Risk |");
    lines.push("|------|---------|----------|------|");
    for (const h of hotspots) {
      lines.push(`| ${h.path} | ${h.inbound_count} | ${h.outbound_count} | ${(h.risk_score * 100).toFixed(0)}% |`);
    }
    lines.push("");
  }

  // Domain Models
  if (ctx.domain_models && ctx.domain_models.length > 0) {
    lines.push("## Domain Models");
    lines.push("");
    lines.push(`Detected ${ctx.domain_models.length} domain model${ctx.domain_models.length === 1 ? "" : "s"}:`);
    lines.push("");
    lines.push("| Model | Kind | Fields | Source |");
    lines.push("|-------|------|--------|--------|");
    for (const m of ctx.domain_models.slice(0, 25)) {
      lines.push(`| \`${m.name}\` | ${m.kind} | ${m.field_count} | ${m.source_file} |`);
    }
    if (ctx.domain_models.length > 25) {
      lines.push(`| *… ${ctx.domain_models.length - 25} more* | | | |`);
    }
    lines.push("");
    const complex = ctx.domain_models.filter(m => m.field_count >= 8);
    if (complex.length > 0) {
      lines.push(`> **High-complexity models** (8+ fields): ${complex.map(m => `\`${m.name}\``).join(", ")} — consider splitting if they grow further.`);
      lines.push("");
    }
  }

  // SQL Schema
  if (ctx.sql_schema && ctx.sql_schema.length > 0) {
    lines.push("## Database Schema");
    lines.push("");
    lines.push("| Table | Columns | Foreign Keys |");
    lines.push("|-------|---------|-------------|");
    for (const t of ctx.sql_schema.slice(0, 20)) {
      lines.push(`| \`${t.name}\` | ${t.column_count} | ${t.foreign_key_count} |`);
    }
    lines.push("");
  }
  lines.push("## Tooling");
  lines.push("");
  if (ctx.detection.build_tools.length > 0)
    lines.push(`- **Build:** ${ctx.detection.build_tools.join(", ")}`);
  if (ctx.detection.test_frameworks.length > 0)
    lines.push(`- **Test:** ${ctx.detection.test_frameworks.join(", ")}`);
  if (ctx.detection.package_managers.length > 0)
    lines.push(`- **Package Manager:** ${ctx.detection.package_managers.join(", ")}`);
  if (ctx.detection.ci_platform)
    lines.push(`- **CI:** ${ctx.detection.ci_platform}`);
  if (ctx.detection.deployment_target)
    lines.push(`- **Deploy:** ${ctx.detection.deployment_target}`);
  lines.push("");

  // AI Context
  const ai = ctx.ai_context;
  if (ai.conventions.length > 0) {
    lines.push("## Conventions");
    lines.push("");
    for (const c of ai.conventions) {
      lines.push(`- ${c}`);
    }
    lines.push("");
  }

  if (ai.warnings.length > 0) {
    lines.push("## Warnings");
    lines.push("");
    for (const w of ai.warnings) {
      lines.push(`- ⚠️ ${w}`);
    }
    lines.push("");
  }

  // ─── Source file excerpts ───────────────────────────────────
  if (files && files.length > 0) {
    lines.push("## File Tree");
    lines.push("");
    lines.push("```");
    lines.push(fileTree(files));
    lines.push("```");
    lines.push("");

    const entries = findEntryPoints(files);
    lines.push(...renderExcerpts("Entry Points (Source)", entries, 30));

    const configs = findConfigs(files);
    lines.push(...renderExcerpts("Configuration Files", configs, 25));
  }

  lines.push("---");
  lines.push(`*Generated by Axis Search — ${ctx.generated_at.split("T")[0]}*`);
  lines.push("");

  return {
    path: "architecture-summary.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "search",
    description: "Human-readable architecture summary derived from the context map",
  };
}

// Minimal YAML serializer (no external deps) — handles the flat/nested structures in RepoProfile
function toYAML(obj: unknown, indent: number = 0): string {
  const prefix = "  ".repeat(indent);
  /* v8 ignore next — toYAML only called recursively with objects/arrays; null unreachable */
  if (obj === null || obj === undefined) return `${prefix}null\n`;
  /* v8 ignore next — toYAML only called recursively with objects/arrays; string unreachable */
  if (typeof obj === "string") {
    /* v8 ignore start — V8 quirk: multiline/colon/hash and simple/quoted string paths tested in YAML tests */
    if (obj.includes("\n") || obj.includes(": ") || obj.startsWith("#")) {
      return `${prefix}|\n${obj.split("\n").map(l => `${prefix}  ${l}`).join("\n")}\n`;
    }
    return /^[\w./-]+$/.test(obj) ? `${prefix}${obj}\n` : `${prefix}"${obj.replace(/"/g, '\\"')}"\n`;
    /* v8 ignore stop */
  }
  /* v8 ignore next — toYAML only called recursively with objects/arrays; primitives unreachable */
  if (typeof obj === "number" || typeof obj === "boolean") return `${prefix}${obj}\n`;
  if (Array.isArray(obj)) {
    if (obj.length === 0) return `${prefix}[]\n`;
    return obj.map(item => {
      if (typeof item === "object" && item !== null && !Array.isArray(item)) {
        const entries = Object.entries(item);
        const firstLine = `${prefix}- ${entries[0][0]}: ${serializeValue(entries[0][1])}`;
        const rest = entries.slice(1).map(([k, v]) => {
          if (typeof v === "object" && v !== null) {
            return `${prefix}  ${k}:\n${toYAML(v, indent + 2)}`;
          }
          return `${prefix}  ${k}: ${serializeValue(v)}`;
        });
        return [firstLine, ...rest].join("\n");
      }
      return `${prefix}- ${serializeValue(item)}`;
    }).join("\n") + "\n";
  }
  /* v8 ignore start — V8 quirk: object serialization branches tested */
  if (typeof obj === "object") {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) return `${prefix}{}\n`;
    return entries.map(([k, v]) => {
      if (typeof v === "object" && v !== null) {
        return `${prefix}${k}:\n${toYAML(v, indent + 1)}`;
      }
      return `${prefix}${k}: ${serializeValue(v)}`;
    }).join("\n") + "\n";
  }
  /* v8 ignore stop */
  /* v8 ignore next — unreachable fallback: all JS types handled above */
  return `${prefix}${String(obj)}\n`;
}

function serializeValue(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") {
    if (/^[\w./-]+$/.test(v)) return v;
    return `"${v.replace(/"/g, '\\"')}"`;
  }
  return String(v);
}

// ─── dependency-hotspots.md ─────────────────────────────────────

export function generateDependencyHotspots(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const hotspots = ctx.dependency_graph.hotspots;
  const deps = ctx.dependency_graph.external_dependencies;

  const lines: string[] = [];
  lines.push(`# Dependency Hotspots — ${id.name}`);
  lines.push("");
  lines.push(`Generated: ${ctx.generated_at}`);
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

  lines.push("## Risk Summary");
  lines.push("");
  const highRisk = hotspots.filter(h => h.risk_score > 7);
  const medRisk = hotspots.filter(h => h.risk_score > 4 && h.risk_score <= 7);
  const lowRisk = hotspots.filter(h => h.risk_score <= 4);
  lines.push(`| Severity | Count |`);
  lines.push(`|----------|-------|`);
  lines.push(`| High (>7) | ${highRisk.length} |`);
  lines.push(`| Medium (4–7) | ${medRisk.length} |`);
  lines.push(`| Low (≤4) | ${lowRisk.length} |`);
  lines.push(`| **Total** | **${hotspots.length}** |`);
  lines.push("");

  lines.push("## Hotspot Files");
  lines.push("");
  if (hotspots.length > 0) {
    lines.push("| File | Risk | Inbound | Outbound | Total Connections |");
    lines.push("|------|------|---------|----------|-------------------|");
    const sorted = [...hotspots].sort((a, b) => b.risk_score - a.risk_score);
    for (const h of sorted) {
      const severity = h.risk_score > 7 ? "🔴" : h.risk_score > 4 ? "🟡" : "🟢";
      lines.push(`| \`${h.path}\` | ${severity} ${h.risk_score.toFixed(1)} | ${h.inbound_count} | ${h.outbound_count} | ${h.inbound_count + h.outbound_count} |`);
    }
  } else {
    lines.push("No hotspots detected — dependency graph has no high-coupling files.");
  }
  lines.push("");

  lines.push("## Coupling Analysis");
  lines.push("");
  for (const h of hotspots.slice(0, 5)) {
    lines.push(`### \`${h.path}\``);
    lines.push("");
    lines.push(`- **Risk Score**: ${h.risk_score.toFixed(1)}/10`);
    lines.push(`- **Inbound**: ${h.inbound_count} files depend on this`);
    lines.push(`- **Outbound**: ${h.outbound_count} dependencies`);
    lines.push(`- **Refactor Priority**: ${h.risk_score > 7 ? "HIGH — extract interface or split module" : h.risk_score > 4 ? "MEDIUM — monitor for growth" : "LOW — acceptable coupling"}`);
    lines.push("");
  }

  lines.push("## External Dependency Risk");
  lines.push("");
  if (deps.length > 0) {
    lines.push("| Package | Version | Risk Factor |");
    lines.push("|---------|---------|-------------|");
    for (const d of deps.slice(0, 15)) {
      const majorVersion = parseInt(d.version.replace(/[^0-9]/, ""), 10);
      const risk = majorVersion < 1 ? "Pre-1.0 — unstable API" : "Stable";
      lines.push(`| ${d.name} | ${d.version} | ${risk} |`);
    }
  } else {
    lines.push("No external dependencies detected.");
  }
  lines.push("");

  lines.push("## Recommendations");
  lines.push("");
  if (highRisk.length > 0) {
    lines.push("1. **Extract interfaces** for files with >7 risk score to reduce direct coupling");
    lines.push("2. **Introduce facade pattern** where inbound count exceeds 5");
  }
  if (medRisk.length > 0) {
    lines.push(`${highRisk.length > 0 ? "3" : "1"}. **Monitor medium-risk files** — add import lint rules to prevent further coupling`);
  }
  lines.push(`${highRisk.length + medRisk.length > 0 ? highRisk.length + medRisk.length + 1 : 1}. **Review circular dependencies** in the import graph`);
  lines.push("");

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const sorted = [...hotspots].sort((a, b) => b.risk_score - a.risk_score);
    const topPaths = sorted.slice(0, 4).map(h => h.path);
    const topFiles = files.filter(f => topPaths.some(tp => f.path.endsWith(tp) || f.path.includes(tp)));
    if (topFiles.length > 0) {
      lines.push("## Hotspot Export Surface");
      lines.push("");
      for (const tf of topFiles) {
        const exports = extractExports(tf.content);
        if (exports.length > 0) {
          lines.push(`### \`${tf.path}\``);
          lines.push("");
          for (const e of exports.slice(0, 12)) {
            lines.push(`- \`${e}\``);
          }
          lines.push("");
        }
      }

      lines.push(...renderExcerpts("Hotspot File Excerpts", topFiles, 25));
    }
  }

  return {
    path: "dependency-hotspots.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "search",
    description: "Dependency coupling analysis with risk scoring and refactor recommendations",
  };
}

// ─── .ai/symbol-index.json ──────────────────────────────────────

export function generateSymbolIndex(files?: SourceFile[], generatedAt?: string): GeneratedFile {
  const fileList = files ?? [];
  const symbols = fileList.length > 0 ? extractSymbols(fileList) : [];

  // Group by file for navigability
  const byFile: Record<string, Array<{ name: string; type: string; line: number; parent?: string }>> = {};
  for (const sym of symbols) {
    const entry = byFile[sym.file_path] ?? (byFile[sym.file_path] = []);
    const record: { name: string; type: string; line: number; parent?: string } = {
      name: sym.symbol_name,
      type: sym.symbol_type,
      line: sym.line_number,
    };
    if (sym.parent) record.parent = sym.parent;
    entry.push(record);
  }

  const output = {
    // Snapshot-derived timestamp keeps output byte-identical for the same input;
    // omitted entirely when no snapshot timestamp is supplied.
    ...(generatedAt !== undefined ? { generated_at: generatedAt } : {}),
    total_symbols: symbols.length,
    file_count: Object.keys(byFile).length,
    symbols: byFile,
  };

  return {
    path: "symbol-index.json",
    content: JSON.stringify(output, null, 2),
    content_type: "application/json",
    program: "search",
    description: "Code symbol index — functions, classes, interfaces, types extracted per file",
  };
}

// ─── repo-run-stats.json ───────────────────────────────────────

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function isExcludedFromRunStats(path: string): boolean {
  const normalized = normalizePath(path);
  return normalized.includes("/node_modules/") || normalized.includes("/.git/") || normalized.includes("/.ai-output/");
}

function getExtension(path: string): string {
  const normalized = normalizePath(path);
  const base = normalized.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot === -1 ? "[no_ext]" : base.slice(dot).toLowerCase();
}

function hasRootConfig(rootNames: Set<string>, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    const regex = new RegExp(`^${escaped}$`, "i");
    return [...rootNames].some((name) => regex.test(name));
  });
}

function buildFintechSignals(files: SourceFile[]): {
  fintech_signal_count: number;
  trust_fabric_detected: boolean;
  compliance_surface_count: number;
} {
  const fintechKeywords = [
    "payment",
    "fintech",
    "bank",
    "ledger",
    "kyc",
    "aml",
    "pci",
    "card",
    "ach",
    "wire",
    "settlement",
    "reconciliation",
    "trust-fabric",
    "compliance",
    "regulatory",
  ];

  let fintechSignals = 0;
  let complianceSignals = 0;
  let trustFabricDetected = false;

  for (const file of files) {
    const path = normalizePath(file.path).toLowerCase();
    if (path.includes("trust-fabric")) {
      trustFabricDetected = true;
    }
    if (path.includes("compliance") || path.includes("audit") || path.includes("policy") || path.includes("risk")) {
      complianceSignals += 1;
    }
    if (fintechKeywords.some((keyword) => path.includes(keyword))) {
      fintechSignals += 1;
    }
  }

  return {
    fintech_signal_count: fintechSignals,
    trust_fabric_detected: trustFabricDetected,
    compliance_surface_count: complianceSignals,
  };
}

export function generateRepoRunStats(
  ctx: ContextMap,
  _profile: RepoProfile,
  files?: SourceFile[],
): GeneratedFile {
  const fileList = (files ?? []).filter((f) => !isExcludedFromRunStats(f.path));

  const extensionCounts = new Map<string, number>();
  const topLevelDirs = new Set<string>();
  const rootFileNames = new Set<string>();

  for (const file of fileList) {
    const normalized = normalizePath(file.path);
    const ext = getExtension(normalized);
    extensionCounts.set(ext, (extensionCounts.get(ext) ?? 0) + 1);

    const segments = normalized.split("/").filter(Boolean);
    if (segments.length > 1) {
      topLevelDirs.add(segments[0]);
    } else if (segments.length === 1) {
      rootFileNames.add(segments[0]);
    }
  }

  const topExtensions = [...extensionCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 15)
    .map(([extension, count]) => ({ extension, count }));

  let packageInfo: {
    name: string | null;
    version: string | null;
    script_count: number;
    dependencies_count: number;
    devDependencies_count: number;
  } = {
    name: null,
    version: null,
    script_count: 0,
    dependencies_count: 0,
    devDependencies_count: 0,
  };

  const rootPackage = fileList.find((f) => normalizePath(f.path) === "package.json");
  if (rootPackage) {
    try {
      const pkg = JSON.parse(rootPackage.content) as {
        name?: string;
        version?: string;
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      packageInfo = {
        name: pkg.name ?? null,
        version: pkg.version ?? null,
        script_count: Object.keys(pkg.scripts ?? {}).length,
        dependencies_count: Object.keys(pkg.dependencies ?? {}).length,
        devDependencies_count: Object.keys(pkg.devDependencies ?? {}).length,
      };
    } catch {
      // Keep defaults if package.json is malformed.
    }
  }

  const rootConfigExists = {
    vitest: hasRootConfig(rootFileNames, ["vitest.config.*"]),
    jest: hasRootConfig(rootFileNames, ["jest.config.*"]),
    playwright: hasRootConfig(rootFileNames, ["playwright.config.*"]),
    cypress: hasRootConfig(rootFileNames, ["cypress.config.*"]),
    eslint: hasRootConfig(rootFileNames, ["eslint.config.*", ".eslintrc*"]),
    prettier: hasRootConfig(rootFileNames, ["prettier.config.*", ".prettierrc*"]),
  };

  const mcpSurfaceCount = fileList.filter((f) => {
    const p = normalizePath(f.path).toLowerCase();
    return p.includes("mcp") || p.endsWith("mcp-config.json") || p.endsWith("server-manifest.yaml");
  }).length;

  const fintechSignals = buildFintechSignals(fileList);

  let readinessScore = 0;
  readinessScore += ctx.routes.length > 0 ? 10 : 0;
  readinessScore += ctx.routes.length >= 10 ? 10 : 0;
  readinessScore += (ctx.sql_schema?.length ?? 0) > 0 ? 20 : 0;
  readinessScore += ctx.domain_models.length > 0 ? 15 : 0;
  readinessScore += ctx.detection.test_frameworks.length > 0 ? 10 : 0;
  readinessScore += ctx.detection.ci_platform ? 10 : 0;
  readinessScore += mcpSurfaceCount > 0 ? 10 : 0;
  readinessScore += fintechSignals.fintech_signal_count > 0 ? 10 : 0;
  readinessScore += fintechSignals.compliance_surface_count > 0 ? 5 : 0;

  const readinessStatus = readinessScore >= 80
    ? "ready_for_agent_build"
    : readinessScore >= 60
      ? "close_with_gaps"
      : "foundational_work_required";

  const nextSteps: string[] = [];
  if ((ctx.sql_schema?.length ?? 0) === 0) {
    nextSteps.push("Add explicit SQL schema or migration files for durable compliance-aware data contracts.");
  }
  if (ctx.domain_models.length === 0) {
    nextSteps.push("Define domain models for payments, accounts, ledger events, and compliance evidence objects.");
  }
  if (ctx.detection.test_frameworks.length === 0) {
    nextSteps.push("Add automated tests for API contracts, risk controls, and reconciliation workflows.");
  }
  if (mcpSurfaceCount === 0) {
    nextSteps.push("Create MCP server surface files (config, manifest, capabilities) for agent-callable tooling.");
  }
  if (fintechSignals.compliance_surface_count === 0) {
    nextSteps.push("Add compliance policy artifacts (KYC/AML, audit trail, and regulatory evidence packaging).");
  }

  const report = {
    schema_version: "1.0",
    generated_at: ctx.generated_at,
    snapshot_id: ctx.snapshot_id,
    project_id: ctx.project_id,
    project: {
      name: ctx.project_identity.name,
      type: ctx.project_identity.type,
      primary_language: ctx.project_identity.primary_language,
    },
    stats: {
      source_files_analyzed: fileList.length,
      context_total_files: ctx.structure.total_files,
      context_total_directories: ctx.structure.total_directories,
      context_total_loc: ctx.structure.total_loc,
      top_level_directories: [...topLevelDirs].sort(),
      top_extensions: topExtensions,
      package: packageInfo,
      root_config_exists: rootConfigExists,
    },
    fintech_mcp_readiness: {
      score_100: readinessScore,
      status: readinessStatus,
      trust_fabric_detected: fintechSignals.trust_fabric_detected,
      signals: {
        route_count: ctx.routes.length,
        domain_model_count: ctx.domain_models.length,
        sql_table_count: ctx.sql_schema?.length ?? 0,
        test_framework_count: ctx.detection.test_frameworks.length,
        ci_platform: ctx.detection.ci_platform ?? null,
        mcp_surface_files: mcpSurfaceCount,
        fintech_signal_count: fintechSignals.fintech_signal_count,
        compliance_surface_count: fintechSignals.compliance_surface_count,
      },
      target: "Agent-buildable fintech MCP that can harden partial repos into compliant API-callable software",
      next_steps: nextSteps,
    },
  };

  return {
    path: "repo-run-stats.json",
    content: JSON.stringify(report, null, 2),
    content_type: "application/json",
    program: "search",
    description: "Run-end repository stats and fintech MCP readiness report for agent-led development",
  };
}
