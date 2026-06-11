// Canonical body shared by AGENTS.md / CLAUDE.md / GEMINI.md, plus the
// condensed imperative rule list shared by .cursorrules / copilot-instructions.
// Everything here is derived from repo analysis — no boilerplate claims,
// no external URLs, deterministic output.

import type { RepoAnalysis } from "../pipeline.js";
import type { ContextMap } from "../vendor/context-engine/types.js";
import { findEntryPoints, findConfigs, renderExcerpts, hasFw } from "./utils.js";

/** Full canonical body (H2 sections). Emitters prepend marker + H1. */
export function buildCanonicalBody(analysis: RepoAnalysis): string[] {
  const ctx = analysis.contextMap;
  const files = analysis.files;
  const id = ctx.project_identity;
  const ai = ctx.ai_context;
  const lines: string[] = [];

  // Overview
  lines.push("## Overview");
  lines.push("");
  lines.push(ai.project_summary);
  if (id.description) {
    lines.push("");
    lines.push(id.description);
  }
  lines.push("");

  // Commands
  const pm = ctx.detection.package_managers[0] ?? "npm";
  lines.push("## Commands");
  lines.push("");
  lines.push(`- Install: \`${pm} install\``);
  if (ctx.detection.build_tools.length > 0) lines.push(`- Build: \`${pm} run build\``);
  if (ctx.detection.test_frameworks.length > 0) lines.push(`- Test: \`${pm} test\``);
  lines.push(`- Dev: \`${pm} run dev\``);
  if (hasFw(ctx, "Prisma")) lines.push(`- DB migrate: \`${pm} exec prisma migrate dev\``);
  lines.push("");

  // Stack
  const stack: string[] = [];
  for (const fw of ctx.detection.frameworks) {
    stack.push(`- ${fw.name}${fw.version ? ` ${fw.version}` : ""}`);
  }
  if (ctx.detection.ci_platform) stack.push(`- CI: ${ctx.detection.ci_platform}`);
  if (ctx.detection.deployment_target) stack.push(`- Deploy: ${ctx.detection.deployment_target}`);
  if (stack.length > 0) {
    lines.push("## Stack");
    lines.push("");
    lines.push(...stack);
    lines.push("");
  }

  // Structure
  if (ai.key_abstractions.length > 0) {
    lines.push("## Structure");
    lines.push("");
    for (const a of ai.key_abstractions) {
      lines.push(`- ${a}`);
    }
    lines.push("");
  }

  // Architecture
  if (ctx.architecture_signals.patterns_detected.length > 0 || ctx.architecture_signals.layer_boundaries.length > 0) {
    lines.push("## Architecture");
    lines.push("");
    for (const p of ctx.architecture_signals.patterns_detected) {
      lines.push(`- ${p.replace(/_/g, " ")}`);
    }
    if (ctx.architecture_signals.layer_boundaries.length > 0) {
      lines.push("");
      lines.push("Respect these layer separations:");
      lines.push("");
      for (const l of ctx.architecture_signals.layer_boundaries) {
        lines.push(`- **${l.layer}**: ${l.directories.join(", ")}`);
      }
    }
    lines.push("");
  }

  // Conventions
  if (ai.conventions.length > 0) {
    lines.push("## Conventions");
    lines.push("");
    for (const c of ai.conventions) {
      lines.push(`- ${c}`);
    }
    lines.push("");
  }

  // Do NOT
  lines.push("## Do NOT");
  lines.push("");
  for (const rule of buildDoNotRules(ctx)) {
    lines.push(`- ${rule}`);
  }
  lines.push("");

  // Domain models
  if (ctx.domain_models.length > 0) {
    lines.push("## Domain Models");
    lines.push("");
    lines.push("| Model | Kind | Fields | Source |");
    lines.push("|-------|------|--------|--------|");
    for (const m of ctx.domain_models.slice(0, 20)) {
      lines.push(`| \`${m.name}\` | ${m.kind} | ${m.field_count} | ${m.source_file} |`);
    }
    if (ctx.domain_models.length > 20) {
      lines.push(`| *… ${ctx.domain_models.length - 20} more* | | | |`);
    }
    lines.push("");
    lines.push("When modifying domain models, update all downstream consumers (handlers, validators, tests).");
    lines.push("");
  }

  // SQL schema
  if (ctx.sql_schema.length > 0) {
    lines.push("## Database Tables");
    lines.push("");
    lines.push("| Table | Columns | Foreign Keys |");
    lines.push("|-------|---------|-------------|");
    for (const t of ctx.sql_schema.slice(0, 15)) {
      lines.push(`| \`${t.name}\` | ${t.column_count} | ${t.foreign_key_count} |`);
    }
    lines.push("");
  }

  // Warnings
  if (ai.warnings.length > 0) {
    lines.push("## Known Issues");
    lines.push("");
    for (const w of ai.warnings) {
      lines.push(`- ${w}`);
    }
    lines.push("");
  }

  // Key source files (excerpts)
  const entries = findEntryPoints(files);
  lines.push(...renderExcerpts("Key Source Files", entries.slice(0, 4), 30));

  // Config excerpts
  const configs = findConfigs(files);
  lines.push(...renderExcerpts("Configuration", configs.slice(0, 3), 20));

  return lines;
}

/** Repo-derived "do not" rules. */
export function buildDoNotRules(ctx: ContextMap): string[] {
  const rules: string[] = [];
  rules.push("Do not add dependencies without discussion");
  rules.push("Do not change the framework or architecture pattern");
  if (ctx.detection.languages.some((l) => l.name === "TypeScript")) {
    rules.push("Do not bypass TypeScript strict mode");
  }
  if (hasFw(ctx, "Prisma")) {
    rules.push("Do not write raw SQL — use Prisma Client");
  }
  if (hasFw(ctx, "React")) {
    rules.push("Do not use class components");
  }
  if (ctx.detection.package_managers.length > 0) {
    rules.push(`Do not mix package managers — use ${ctx.detection.package_managers[0]}`);
  }
  return rules;
}

/** Condensed imperative rules for .cursorrules and copilot-instructions. */
export function buildImperativeRules(ctx: ContextMap): string[] {
  const id = ctx.project_identity;
  const rules: string[] = [];

  if (ctx.detection.languages.some((l) => l.name === "TypeScript")) {
    rules.push("Use strict TypeScript; avoid `any` types.");
  }
  if (id.primary_language === "Python") {
    rules.push("Follow PEP 8 conventions.");
  }
  if (hasFw(ctx, "Next.js")) {
    rules.push("Follow Next.js App Router conventions; default to Server Components, add 'use client' only when client interactivity is needed.");
  }
  if (hasFw(ctx, "React")) {
    rules.push("Write functional React components with hooks; never class components.");
  }
  if (hasFw(ctx, "Tailwind CSS", "tailwind")) {
    rules.push("Style with Tailwind utility classes; avoid custom CSS unless extending the design system.");
  }
  if (hasFw(ctx, "Prisma")) {
    rules.push("Access the database through Prisma Client; prisma/schema.prisma is the source of truth.");
  }
  if (hasFw(ctx, "Django")) {
    rules.push("Follow Django project structure conventions.");
  }
  if (hasFw(ctx, "FastAPI")) {
    rules.push("Use Pydantic models for request/response validation.");
  }
  if (ctx.detection.test_frameworks.length > 0) {
    rules.push(`Run tests with ${ctx.detection.test_frameworks[0]} before committing.`);
  }
  if (ctx.detection.package_managers.length > 0) {
    rules.push(`Use ${ctx.detection.package_managers[0]} for dependency management; do not mix package managers.`);
  }
  rules.push("Do not add dependencies without discussion.");
  rules.push("Do not change the framework or architecture pattern.");
  for (const l of ctx.architecture_signals.layer_boundaries) {
    rules.push(`Respect the ${l.layer} layer boundary: ${l.directories.join(", ")}.`);
  }
  return rules;
}
