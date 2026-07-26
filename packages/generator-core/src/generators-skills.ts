import type { ContextMap } from "@axis/context-engine";
import type { GeneratedFile, SourceFile } from "./types.js";
import { findEntryPoints, findConfigs, renderExcerpts, extractExports } from "./file-excerpt-utils.js";
import { hasFw } from "./fw-helpers.js";
// Prompt-injection defense: these artifacts are agent-instruction files, so
// EVERY repo/manifest-derived string must be sanitized for its sink context —
// mdText (prose/headings/lists), mdInline (table cells), mdCode (code spans),
// cfgValue (.cursorrules key = "value"), yamlFlowScalar (inside ```yaml fences).
import { mdText, mdInline, mdCode, mdCellCode, mdBlock, cfgValue, yamlFlowScalar } from "./md-sanitize.js";
// displayRoutes moved to the shared route-utils module (also used by the debug
// program). Re-exported here so existing importers keep resolving it from skills.
import { displayRoutes } from "./route-utils.js";
export { displayRoutes } from "./route-utils.js";

/**
 * Resolve the package manager to put in generated commands. The parser only
 * populates `package_managers` when it finds a LOCKFILE — a repo with none but a
 * `packageManager:` field or a workspace (this monorepo declares `pnpm@…` with no
 * committed lock) would otherwise be told to run `npm`, which breaks a pnpm/yarn
 * workspace (`workspace:*` deps resolve differently). Order: detected → package.json
 * `packageManager` field → lockfile name → npm. Pure + deterministic.
 */
function resolvePackageManager(ctx: ContextMap, files?: SourceFile[]): string {
  const detected = ctx.detection.package_managers[0];
  if (detected) return detected;
  if (files) {
    const base = (p: string) => p.split("/").pop() ?? p;
    const pkg = files.find(f => base(f.path) === "package.json" && !f.path.includes("node_modules"));
    const field = pkg?.content.match(/"packageManager"\s*:\s*"([a-z]+)@/i);
    if (field) return field[1].toLowerCase();
    const has = (name: string) => files.some(f => base(f.path) === name);
    if (has("pnpm-lock.yaml") || has("pnpm-workspace.yaml")) return "pnpm";
    if (has("yarn.lock")) return "yarn";
    if (has("bun.lockb")) return "bun";
    if (has("package-lock.json")) return "npm";
  }
  return "npm";
}

export function generateAgentsMD(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const ai = ctx.ai_context;
  const lines: string[] = [];

  lines.push(`# AGENTS.md — ${mdText(id.name)}`);
  lines.push("");
  lines.push("## Project Context");
  lines.push("");
  lines.push(`This is a **${mdText(id.type.replace(/_/g, " "))}** built with **${mdText(id.primary_language)}**.`);
  if (id.description) lines.push(mdBlock(id.description));
  lines.push("");

  // Frameworks
  if (ctx.detection.frameworks.length > 0) {
    lines.push("### Stack");
    lines.push("");
    for (const fw of ctx.detection.frameworks) {
      lines.push(`- ${mdText(fw.name)}${fw.version ? ` ${mdText(fw.version)}` : ""}`);
    }
    lines.push("");
  }

  // Architecture
  if (ctx.architecture_signals.patterns_detected.length > 0) {
    lines.push("### Architecture");
    lines.push("");
    for (const p of ctx.architecture_signals.patterns_detected) {
      lines.push(`- ${mdText(p.replace(/_/g, " "))}`);
    }
    lines.push("");
  }

  // Conventions
  if (ai.conventions.length > 0) {
    lines.push("### Conventions");
    lines.push("");
    for (const c of ai.conventions) {
      lines.push(`- ${mdText(c)}`);
    }
    lines.push("");
  }

  // Key Abstractions
  if (ai.key_abstractions.length > 0) {
    lines.push("### Key Directories");
    lines.push("");
    for (const a of ai.key_abstractions) {
      lines.push(`- ${mdText(a)}`);
    }
    lines.push("");
  }

  // Routes (deduplicated by method+path — prefer a non-test source file, capped at 50)
  if (ctx.routes.length > 0) {
    const display = displayRoutes(ctx.routes);
    const capped = display.slice(0, 50);
    lines.push("### Routes");
    lines.push("");
    for (const r of capped) {
      lines.push(`- \`${mdCode(r.method)} ${mdCode(r.path)}\` → ${mdText(r.source_file)}`);
    }
    if (display.length > 50) {
      lines.push(`- *… ${display.length - 50} more (see OpenAPI spec or \`/v1/docs\`)*`);
    }
    lines.push("");
  }

  // Domain Models
  if (ctx.domain_models && ctx.domain_models.length > 0) {
    lines.push("### Domain Models");
    lines.push("");
    lines.push("| Model | Kind | Fields | Source |");
    lines.push("|-------|------|--------|--------|");
    for (const m of ctx.domain_models.slice(0, 20)) {
      lines.push(`| \`${mdCellCode(m.name)}\` | ${mdInline(m.kind)} | ${m.field_count} | ${mdInline(m.source_file)} |`);
    }
    if (ctx.domain_models.length > 20) {
      lines.push(`| *… ${ctx.domain_models.length - 20} more* | | | |`);
    }
    lines.push("");
    lines.push("When modifying domain models, update all downstream consumers (handlers, validators, tests).");
    lines.push("");
  }

  // SQL Schema
  if (ctx.sql_schema && ctx.sql_schema.length > 0) {
    lines.push("### Database Tables");
    lines.push("");
    lines.push("| Table | Columns | Foreign Keys |");
    lines.push("|-------|---------|-------------|");
    for (const t of ctx.sql_schema.slice(0, 15)) {
      lines.push(`| \`${mdCellCode(t.name)}\` | ${t.column_count} | ${t.foreign_key_count} |`);
    }
    if (ctx.sql_schema.length > 15) {
      lines.push(`| *… ${ctx.sql_schema.length - 15} more* | | |`);
    }
    lines.push("");
  }
  lines.push("## Agent Instructions");
  lines.push("");
  lines.push("When working in this codebase:");
  lines.push("");

  // Language-specific rules. Framework rules below apply to both TS and JS, but
  // "use strict TypeScript / avoid `any`" is only honest for a TypeScript repo —
  // asserting it for a pure-JavaScript project is false guidance and would
  // contradict the (TS-gated) CLAUDE.md Do-NOT for the same repo.
  if (id.primary_language === "TypeScript" || id.primary_language === "JavaScript") {
    if (id.primary_language === "TypeScript")
      lines.push("- Use strict TypeScript. Avoid `any` types.");
    if (hasFw(ctx, "Next.js")) {
      lines.push("- Follow Next.js App Router conventions. Use `app/` directory structure.");
      lines.push("- Server Components by default. Add `'use client'` only when needed.");
    }
    if (hasFw(ctx, "React"))
      lines.push("- Prefer functional components with hooks over class components.");
    if (hasFw(ctx, "Tailwind CSS", "tailwind"))
      lines.push("- Use Tailwind utility classes. Avoid custom CSS unless extending the design system.");
    if (hasFw(ctx, "Prisma"))
      lines.push("- Use Prisma client for database access. Keep schema.prisma as source of truth.");
  }
  if (id.primary_language === "Python") {
    lines.push("- Follow PEP 8 conventions.");
    if (hasFw(ctx, "Django"))
      lines.push("- Follow Django project structure conventions.");
    if (hasFw(ctx, "FastAPI"))
      lines.push("- Use Pydantic models for request/response validation.");
  }

  // Testing
  if (ctx.detection.test_frameworks.length > 0) {
    lines.push(`- Run tests with ${mdText(ctx.detection.test_frameworks[0])} before committing.`);
  }

  // Package manager
  if (ctx.detection.package_managers.length > 0) {
    const pm = ctx.detection.package_managers[0];
    lines.push(`- Use \`${mdCode(pm)}\` for dependency management. Do not mix package managers.`);
  }

  lines.push("");

  // Warnings
  if (ai.warnings.length > 0) {
    lines.push("## Known Issues");
    lines.push("");
    for (const w of ai.warnings) {
      lines.push(`- ${mdText(w)}`);
    }
    lines.push("");
  }

  // Layer boundaries
  if (ctx.architecture_signals.layer_boundaries.length > 0) {
    lines.push("## Architecture Boundaries");
    lines.push("");
    lines.push("Respect these layer separations:");
    lines.push("");
    for (const l of ctx.architecture_signals.layer_boundaries) {
      lines.push(`- **${mdText(l.layer)}**: ${l.directories.map(mdText).join(", ")}`);
    }
    lines.push("");
  }

  // ─── Source file context ───────────────────────────────────
  if (files && files.length > 0) {
    const entries = findEntryPoints(files);
    if (entries.length > 0) {
      lines.push("## Key Entry Points");
      lines.push("");
      for (const e of entries.slice(0, 6)) {
        const exports = extractExports(e.content);
        if (exports.length > 0) {
          lines.push(`- **\`${mdCode(e.path)}\`**: ${exports.slice(0, 4).map(ex => `\`${mdCode(ex.slice(0, 80))}\``).join(", ")}`);
        } else {
          lines.push(`- \`${mdCode(e.path)}\``);
        }
      }
      if (entries.length > 6) lines.push(`- *... and ${entries.length - 6} more*`);
      lines.push("");
    }

    const configs = findConfigs(files);
    lines.push(...renderExcerpts("Configuration Files", configs.slice(0, 3), 15));
  }

  lines.push("<!-- Generated by axis-iliad skills program. Regenerate after significant code changes. -->");
  lines.push("");

  return {
    path: "AGENTS.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "skills",
    description: "AI agent instructions tailored to this project's stack and conventions",
  };
}

export function generateClaudeMD(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const ai = ctx.ai_context;
  const lines: string[] = [];

  lines.push(`# CLAUDE.md — ${mdText(id.name)}`);
  lines.push("");
  lines.push("## Project Overview");
  lines.push("");
  lines.push(mdBlock(ai.project_summary));
  lines.push("");

  // Build & test commands
  lines.push("## Commands");
  lines.push("");
  const pm = resolvePackageManager(ctx, files);
  const pmC = mdCode(pm);
  lines.push(`- **Install:** \`${pmC} install\``);
  if (ctx.detection.build_tools.length > 0)
    lines.push(`- **Build:** \`${pmC} run build\``);
  if (ctx.detection.test_frameworks.length > 0)
    lines.push(`- **Test:** \`${pmC} test\``);
  lines.push(`- **Dev:** \`${pmC} run dev\``);
  if (hasFw(ctx, "Prisma"))
    /* v8 ignore next — package_managers never contains "npx" (it's a runner, not a PM) */
    lines.push(`- **DB Migrate:** \`${pm === "npx" ? "npx" : `${pmC} exec`} prisma migrate dev\``);
  lines.push("");

  // Stack
  lines.push("## Stack");
  lines.push("");
  for (const fw of ctx.detection.frameworks) {
    lines.push(`- ${mdText(fw.name)}${fw.version ? ` ${mdText(fw.version)}` : ""}`);
  }
  if (ctx.detection.ci_platform) lines.push(`- CI: ${mdText(ctx.detection.ci_platform)}`);
  if (ctx.detection.deployment_target) lines.push(`- Deploy: ${mdText(ctx.detection.deployment_target)}`);
  lines.push("");

  // Structure
  lines.push("## Structure");
  lines.push("");
  for (const a of ai.key_abstractions) {
    lines.push(`- ${mdText(a)}`);
  }
  lines.push("");

  // Conventions
  if (ai.conventions.length > 0) {
    lines.push("## Conventions");
    lines.push("");
    for (const c of ai.conventions) {
      lines.push(`- ${mdText(c)}`);
    }
    lines.push("");
  }

  // Don'ts
  lines.push("## Do NOT");
  lines.push("");
  lines.push("- Do not add dependencies without discussion");
  lines.push("- Do not change the framework or architecture pattern");
  // Only assert a TypeScript-strict rule for TypeScript projects — emitting it for
  // a Python/Rust/Go repo is false guidance (dogfooding a JSON-detected tree showed
  // "Do not bypass TypeScript strict mode" landing in a non-TS project's CLAUDE.md).
  if (id.primary_language === "TypeScript")
    lines.push("- Do not bypass TypeScript strict mode");
  if (hasFw(ctx, "Prisma"))
    lines.push("- Do not write raw SQL — use Prisma Client");
  if (hasFw(ctx, "React"))
    lines.push("- Do not use class components");
  lines.push("");

  // Domain Models
  if (ctx.domain_models && ctx.domain_models.length > 0) {
    lines.push("## Data Models");
    lines.push("");
    lines.push("Detected domain model contracts:");
    lines.push("");
    lines.push("| Model | Kind | Fields | Source |");
    lines.push("|-------|------|--------|--------|");
    for (const m of ctx.domain_models.slice(0, 20)) {
      lines.push(`| \`${mdCellCode(m.name)}\` | ${mdInline(m.kind)} | ${m.field_count} | ${mdInline(m.source_file)} |`);
    }
    if (ctx.domain_models.length > 20) {
      lines.push(`| *… ${ctx.domain_models.length - 20} more* | | | |`);
    }
    lines.push("");
  }

  // SQL Schema
  if (ctx.sql_schema && ctx.sql_schema.length > 0) {
    lines.push("## Database Schema");
    lines.push("");
    lines.push("| Table | Columns | Foreign Keys |");
    lines.push("|-------|---------|-------------|");
    for (const t of ctx.sql_schema.slice(0, 15)) {
      lines.push(`| \`${mdCellCode(t.name)}\` | ${t.column_count} | ${t.foreign_key_count} |`);
    }
    if (ctx.sql_schema.length > 15) {
      lines.push(`| *… ${ctx.sql_schema.length - 15} more* | | |`);
    }
    lines.push("");
  }

  // API Surface — the HTTP route inventory an agent needs to place a change
  // correctly. AGENTS.md has long carried this; CLAUDE.md (the file Claude Code
  // reads) lacked it. Same de-duplication as AGENTS.md, capped shorter to stay
  // scannable in the primary instruction file.
  if (ctx.routes.length > 0) {
    const routes = displayRoutes(ctx.routes);
    const ROUTE_CAP = 40;
    lines.push("## API Surface");
    lines.push("");
    lines.push("HTTP routes detected in this codebase:");
    lines.push("");
    for (const r of routes.slice(0, ROUTE_CAP)) {
      lines.push(`- \`${mdCode(r.method)} ${mdCode(r.path)}\` → ${mdText(r.source_file)}`);
    }
    if (routes.length > ROUTE_CAP) {
      lines.push(`- *… ${routes.length - ROUTE_CAP} more (see the OpenAPI spec or \`/v1/docs\`)*`);
    }
    lines.push("");
  }

  if (ai.warnings.length > 0) {
    lines.push("## Warnings");
    lines.push("");
    for (const w of ai.warnings) {
      lines.push(`- ${mdText(w)}`);
    }
    lines.push("");
  }

  // ─── Source file context ───────────────────────────────────
  if (files && files.length > 0) {
    const entries = findEntryPoints(files);
    lines.push(...renderExcerpts("Key Source Files", entries.slice(0, 4), 30));

    const configs = findConfigs(files);
    lines.push(...renderExcerpts("Configuration", configs.slice(0, 3), 20));
  }

  lines.push("<!-- Generated by axis-iliad skills program. Regenerate after significant code changes. -->");
  lines.push("");

  return {
    path: "CLAUDE.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "skills",
    description: "Claude-specific project instructions with commands and conventions",
  };
}

export function generateCursorRules(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const rules: string[] = [];

  rules.push(`# .cursorrules — ${mdText(id.name)}`);
  rules.push("#");
  rules.push(`# ${mdText(id.type.replace(/_/g, " "))} | ${mdText(id.primary_language)}`);
  rules.push("#");

  // Stack summary
  const frameworks = ctx.detection.frameworks.map(f => mdText(f.name)).join(", ");
  if (frameworks) rules.push(`# Stack: ${frameworks}`);
  rules.push("");

  // Rules
  rules.push("# === General ===");
  rules.push(`primary_language = ${cfgValue(id.primary_language)}`);
  rules.push(`project_type = ${cfgValue(id.type)}`);
  rules.push("");

  // Framework-specific rules
  if (hasFw(ctx, "Next.js")) {
    rules.push("# === Next.js ===");
    rules.push('routing = "app_router"');
    rules.push('default_component_type = "server"');
    rules.push('client_directive = "use client — only when client interactivity needed"');
    rules.push("");
  }

  if (hasFw(ctx, "React")) {
    rules.push("# === React ===");
    rules.push('component_style = "functional"');
    rules.push('state_management = "hooks"');
    rules.push("class_components = false");
    rules.push("");
  }

  if (hasFw(ctx, "Tailwind CSS", "tailwind")) {
    rules.push("# === Styling ===");
    rules.push('css_framework = "tailwind"');
    rules.push("custom_css = false");
    rules.push('class_strategy = "utility-first"');
    rules.push("");
  }

  if (hasFw(ctx, "Prisma")) {
    rules.push("# === Database ===");
    rules.push('orm = "prisma"');
    rules.push("raw_sql = false");
    rules.push('schema_location = "prisma/schema.prisma"');
    rules.push("");
  }

  // Testing
  if (ctx.detection.test_frameworks.length > 0) {
    rules.push("# === Testing ===");
    rules.push(`test_framework = ${cfgValue(ctx.detection.test_frameworks[0])}`);
    rules.push("test_before_commit = true");
    rules.push("");
  }

  // Package manager
  if (ctx.detection.package_managers.length > 0) {
    rules.push("# === Tooling ===");
    rules.push(`package_manager = ${cfgValue(ctx.detection.package_managers[0])}`);
    if (ctx.detection.ci_platform) rules.push(`ci = ${cfgValue(ctx.detection.ci_platform)}`);
    rules.push("");
  }

  // Architecture
  rules.push("# === Architecture Boundaries ===");
  for (const layer of ctx.architecture_signals.layer_boundaries) {
    rules.push(`# ${mdText(layer.layer)}: ${layer.directories.map(mdText).join(", ")}`);
  }
  rules.push("");

  // Domain Models
  if (ctx.domain_models && ctx.domain_models.length > 0) {
    rules.push("# === Domain Models ===");
    for (const m of ctx.domain_models.slice(0, 20)) {
      rules.push(`# ${mdText(m.name)} (${mdText(m.kind)}, ${m.field_count} fields) @ ${mdText(m.source_file)}`);
    }
    if (ctx.domain_models.length > 20) rules.push(`# ... and ${ctx.domain_models.length - 20} more`);
    rules.push("");
  }

  // SQL Schema
  if (ctx.sql_schema && ctx.sql_schema.length > 0) {
    rules.push("# === Database Tables ===");
    for (const t of ctx.sql_schema.slice(0, 15)) {
      rules.push(`# ${mdText(t.name)} (${t.column_count} cols, ${t.foreign_key_count} fks)`);
    }
    if (ctx.sql_schema.length > 15) {
      rules.push(`# … ${ctx.sql_schema.length - 15} more tables`);
    }
    rules.push("");
  }

  // Conventions
  const ai = ctx.ai_context;
  if (ai.conventions.length > 0) {
    rules.push("# === Detected Conventions ===");
    for (const c of ai.conventions) {
      rules.push(`# - ${mdText(c)}`);
    }
    rules.push("");
  }

  // ─── Source file context ───────────────────────────────────
  if (files && files.length > 0) {
    rules.push("# === Project File Tree ===");
    for (const f of files.slice(0, 50)) {
      rules.push(`# ${mdText(f.path)}`);
    }
    if (files.length > 50) rules.push(`# ... and ${files.length - 50} more files`);
    rules.push("");

    const entries = findEntryPoints(files);
    if (entries.length > 0) {
      rules.push("# === Key Entry Points ===");
      for (const e of entries.slice(0, 5)) {
        const exports = extractExports(e.content);
        rules.push(`# ${mdText(e.path)}`);
        for (const ex of exports.slice(0, 5)) rules.push(`#   ${mdText(ex)}`);
      }
      rules.push("");
    }
  }

  rules.push("# Generated by axis-iliad skills program. Regenerate after significant code changes.");
  rules.push("");

  return {
    path: ".cursorrules",
    content: rules.join("\n"),
    content_type: "text/plain",
    program: "skills",
    description: "Cursor IDE rules derived from project detection and conventions",
  };
}

// ─── workflow-pack.md ───────────────────────────────────────────

export function generateWorkflowPack(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const frameworks = ctx.detection.frameworks;
  const testFrameworks = ctx.detection.test_frameworks;
  const buildTools = ctx.detection.build_tools;
  const ci = ctx.detection.ci_platform;
  const pm = resolvePackageManager(ctx, files);

  const lines: string[] = [];
  lines.push(`# Workflow Pack — ${mdText(id.name)}`);
  lines.push("");
  lines.push("Reusable AI-assisted workflows for common development tasks.");
  lines.push("");

  lines.push("## Workflow: Feature Development");
  lines.push("");
  lines.push("```yaml");
  lines.push("name: feature-development");
  lines.push("trigger: \"New feature request\"");
  lines.push("steps:");
  lines.push("  - name: analyze_scope");
  lines.push("    action: Review architecture-summary.md for affected layers");
  lines.push("  - name: plan_implementation");
  lines.push("    action: Identify files to modify using dependency-hotspots.md");
  lines.push("  - name: write_code");
  lines.push(`    action: Follow conventions from ${frameworks.length > 0 ? frameworks.map(f => mdText(f.name)).join(", ") : mdText(id.primary_language)}`);
  lines.push("  - name: write_tests");
  lines.push(`    action: Add tests using ${testFrameworks.length > 0 ? testFrameworks.map(mdText).join(", ") : "project test framework"}`);
  lines.push("  - name: validate");
  // Validation runs the project's build/test SCRIPTS via the package manager —
  // not the bare tool names (`vite && make` isn't a runnable validation step).
  lines.push(`    action: ${buildTools.length > 0 ? `Run \`${mdText(pm)} run build\`${testFrameworks.length > 0 ? ` then \`${mdText(pm)} test\`` : ""}` : "Run build and test"}`);
  lines.push("  - name: review");
  lines.push("    action: Check against component-guidelines.md and frontend-rules.md");
  lines.push("```");
  lines.push("");

  lines.push("## Workflow: Bug Fix");
  lines.push("");
  lines.push("```yaml");
  lines.push("name: bug-fix");
  lines.push("trigger: \"Bug report or failing test\"");
  lines.push("steps:");
  lines.push("  - name: reproduce");
  lines.push("    action: Follow root-cause-checklist.md Step 1");
  lines.push("  - name: isolate");
  lines.push("    action: Use debug-playbook.md triage section");
  lines.push("  - name: trace");
  lines.push("    action: Check tracing-rules.md for log points");
  lines.push("  - name: fix");
  lines.push("    action: Apply minimal change in isolated scope");
  lines.push("  - name: regression_test");
  lines.push("    action: Add test covering the exact failure case");
  lines.push("  - name: verify");
  lines.push("    action: Run full test suite");
  lines.push("```");
  lines.push("");

  lines.push("## Workflow: Code Review");
  lines.push("");
  lines.push("```yaml");
  lines.push("name: code-review");
  lines.push("trigger: \"Pull request opened\"");
  lines.push("steps:");
  lines.push("  - name: architecture_check");
  lines.push("    action: Verify changes respect layer boundaries from architecture-summary.md");
  lines.push("  - name: convention_check");
  lines.push(`    action: Validate against ${mdText(id.primary_language)} conventions`);
  lines.push("  - name: test_coverage");
  lines.push("    action: Ensure new code has tests");
  lines.push("  - name: dependency_check");
  lines.push("    action: Check dependency-hotspots.md for coupling increase");
  if (ci) {
    lines.push("  - name: ci_check");
    lines.push(`    action: Verify ${mdText(ci)} pipeline passes`);
  }
  lines.push("```");
  lines.push("");

  lines.push("## Workflow: Refactor");
  lines.push("");
  lines.push("```yaml");
  lines.push("name: refactor");
  lines.push("trigger: \"Scheduled improvement or tech debt review\"");
  lines.push("steps:");
  lines.push("  - name: identify_targets");
  lines.push("    action: Use refactor-checklist.md and dependency-hotspots.md");
  lines.push("  - name: plan_scope");
  lines.push("    action: Define clear boundaries — one concern per refactor");
  lines.push("  - name: baseline_tests");
  lines.push("    action: Ensure existing tests pass before any changes");
  lines.push("  - name: execute");
  lines.push("    action: Apply changes incrementally with working tests at each step");
  lines.push("  - name: validate");
  lines.push("    action: Run full suite, check for regressions");
  lines.push("```");
  lines.push("");

  lines.push("## Model Cascade");
  lines.push("");
  lines.push("These workflows describe WHAT each step does. `model-cascade.md` maps WHO should run it — which capability tier (planner / executor / mechanical) fits each task type, derived from this repo's own detected signals.");
  lines.push("");

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const configs = findConfigs(files);
    if (configs.length > 0) {
      lines.push("## Detected Config Files");
      lines.push("");
      for (const cf of configs.slice(0, 10)) {
        lines.push(`- \`${mdCode(cf.path)}\` (${cf.content.split("\n").length} lines)`);
      }
      lines.push("");
    }
    const entries = findEntryPoints(files);
    if (entries.length > 0) {
      lines.push(...renderExcerpts("Entry Points", entries.slice(0, 4), 20));
    }
  }

  return {
    path: "workflow-pack.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "skills",
    description: "Reusable AI-assisted development workflows for feature, bugfix, review, and refactor tasks",
  };
}

// ─── policy-pack.md ─────────────────────────────────────────────

export function generatePolicyPack(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const frameworks = ctx.detection.frameworks;
  const conventions = ctx.ai_context.conventions;
  const warnings = ctx.ai_context.warnings;
  const layers = ctx.architecture_signals.layer_boundaries;

  const lines: string[] = [];
  lines.push(`# Policy Pack — ${mdText(id.name)}`);
  lines.push("");
  lines.push("AI governance policies for code generation, review, and compliance.");
  lines.push("");

  lines.push("## Policy: Code Generation Rules");
  lines.push("");
  lines.push("```yaml");
  lines.push("id: code-generation");
  lines.push("scope: all-ai-generated-code");
  lines.push("rules:");
  lines.push(`  - language: ${yamlFlowScalar(id.primary_language)}`);
  // strict_types / no_any_types are TypeScript type-system rules. Plain
  // JavaScript has no type annotations, so asserting them for a JS repo is as
  // dishonest as it is for Python/Rust/Go — and it would contradict AGENTS.md,
  // which emits "Use strict TypeScript" for TypeScript only. Gate identically.
  // The stub/placeholder rules below are language-agnostic and always apply.
  if (id.primary_language === "TypeScript") {
    lines.push("  - strict_types: true");
    lines.push("  - no_any_types: true");
  }
  lines.push("  - no_stub_implementations: true");
  lines.push("  - no_placeholder_data: true");
  for (const c of conventions.slice(0, 5)) {
    lines.push(`  - convention: ${JSON.stringify(c)}`);
  }
  lines.push("```");
  lines.push("");

  lines.push("## Policy: Boundary Enforcement");
  lines.push("");
  lines.push("```yaml");
  lines.push("id: boundary-enforcement");
  lines.push("scope: architecture-layers");
  lines.push("rules:");
  if (layers.length > 0) {
    for (const l of layers) {
      lines.push(`  - layer: ${yamlFlowScalar(l.layer)}`);
      lines.push(`    directories: [${l.directories.map(yamlFlowScalar).join(", ")}]`);
      lines.push("    allowed_imports: same-layer-or-below");
    }
  } else {
    lines.push("  - no-layers-detected: true");
    lines.push("  - fallback: enforce-module-boundaries-by-directory");
  }
  lines.push("```");
  lines.push("");

  lines.push("## Policy: Security Baseline");
  lines.push("");
  lines.push("```yaml");
  lines.push("id: security-baseline");
  lines.push("scope: all-code");
  lines.push("rules:");
  lines.push("  - no_hardcoded_secrets: true");
  lines.push("  - no_eval: true");
  lines.push("  - no_innerHTML: true");
  lines.push("  - validate_all_inputs: true");
  lines.push("  - parameterize_queries: true");
  lines.push("  - use_env_vars_for_config: true");
  lines.push("  - no_debug_logging_in_production: true");
  lines.push("```");
  lines.push("");

  lines.push("## Policy: Testing Requirements (recommended baseline)");
  lines.push("");
  // These are a RECOMMENDED baseline to adopt — not measured facts about the repo.
  // The coverage target + no-skip rule are aspirational (this generator can't read
  // the project's actual coverage or CI skip status), so they're framed as targets.
  lines.push("```yaml");
  lines.push("id: testing-requirements");
  lines.push("scope: all-changes");
  lines.push("recommended_rules:");
  lines.push("  - new_code_requires_tests: true");
  lines.push("  - bug_fixes_require_regression_tests: true");
  lines.push("  - target_min_test_coverage: 80%   # a suggested target, not a measured value");
  lines.push("  - avoid_skipped_tests_in_ci: true");
  lines.push(`  - test_frameworks: [${ctx.detection.test_frameworks.map(yamlFlowScalar).join(", ")}]`);
  lines.push("```");
  lines.push("");

  if (warnings.length > 0) {
    lines.push("## Policy: Known Warnings");
    lines.push("");
    lines.push("These project-specific warnings must be addressed in all AI-generated code:");
    lines.push("");
    for (const w of warnings) {
      lines.push(`- ⚠️ ${mdText(w)}`);
    }
    lines.push("");
  }

  lines.push("## Policy: Framework-Specific Rules");
  lines.push("");
  for (const fw of frameworks) {
    lines.push(`### ${mdText(fw.name)}`);
    lines.push("");
    const n = fw.name.toLowerCase();
    if (n === "next" || n === "next.js") {
      lines.push("- Use functional components only");
      lines.push("- Prefer server components where possible (Next.js App Router)");
      lines.push("- No inline styles — use design tokens or Tailwind");
    } else if (n === "react") {
      // Plain React (Vite/CRA/etc.) — NOT Next.js. Server Components / App Router
      // are Next-only; asserting them for a bare React app is false guidance.
      lines.push("- Use functional components with hooks only (no class components)");
      lines.push("- Keep components small and pure; lift state deliberately");
      lines.push("- No inline styles — use design tokens or your styling system");
    } else if (n === "express" || n === "fastify") {
      lines.push("- All routes must have error handling middleware");
      lines.push("- Validate request bodies before processing");
      lines.push("- Use async handlers with proper error propagation");
    } else if (n === "tailwind" || n === "tailwind css") {
      lines.push("- Use utility classes from the design system");
      lines.push("- No arbitrary values unless design tokens don't cover the case");
    } else {
      lines.push(`- Follow ${mdText(fw.name)} community best practices`);
    }
    lines.push("");
  }

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const configs = findConfigs(files);
    if (configs.length > 0) {
      lines.push("## Detected Project Configs");
      lines.push("");
      for (const cf of configs.slice(0, 8)) {
        lines.push(`- \`${mdCode(cf.path)}\``);
      }
      if (configs.length > 8) {
        lines.push(`- *… ${configs.length - 8} more config files*`);
      }
      lines.push("");
      lines.push(...renderExcerpts("Config Contents", configs.slice(0, 3), 15));
    }
  }

  return {
    path: "policy-pack.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "skills",
    description: "AI governance policies for code generation, boundaries, security, and testing",
  };
}

// ─── model-cascade.md ───────────────────────────────────────────
// H7.1: teaches the model-cascade delegation pattern this very loop embodies —
// a higher-capability tier plans + verifies, a mid-capability tier executes,
// a small/cheap tier does the mechanical remainder — as a deterministic map
// from THIS repo's own detected task-type signals to the tier that should own
// each one. No LLM calls at generation time: the artifact TEACHES the cascade,
// it is not produced by one. Tier names are capability CLASSES, never vendor
// SKUs — see the "Honest limits" section below, and keep it that way.

const CASCADE_INFRA_PATTERNS = ["monorepo", "frontend_backend_split", "containerized", "serverless"];

export function generateModelCascade(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const hasCi = ctx.detection.ci_platform !== null;
  const hasTests = ctx.detection.test_frameworks.length > 0;
  const patterns = ctx.architecture_signals.patterns_detected;
  const infraPatterns = patterns.filter(p => CASCADE_INFRA_PATTERNS.includes(p));
  const hasMultiPartArchitecture = infraPatterns.length > 0;
  const hasMultipleFrameworks = ctx.detection.frameworks.length > 1;
  const lowSeparation = ctx.architecture_signals.separation_score < 0.5;

  const lines: string[] = [];
  lines.push(`# Model Cascade — ${mdText(id.name)}`);
  lines.push("");
  lines.push(
    "A higher-capability model plans and writes acceptance-criteria-complete work " +
    "orders; a mid-capability model executes them; a small, cheap model does the " +
    "mechanical remainder. Each tier only ever runs the cheapest model that clears " +
    "its own quality bar. This file is the deterministic map from task types " +
    "detected in this repo to the tier that should own them, plus the contract " +
    "between tiers — derived from real repo signals, not invented.",
  );
  lines.push("");

  lines.push("## Capability tiers");
  lines.push("");
  lines.push("| Tier | Class | Owns |");
  lines.push("|---|---|---|");
  lines.push("| Planner | frontier-class | Cross-cutting design, architecture decisions, adversarial verification |");
  lines.push("| Executor | mid-class | Test-backed implementation, code review, most day-to-day changes |");
  lines.push("| Mechanical | small-class | Repetitive edits, formatting, CI-failure triage, boilerplate |");
  lines.push("");

  lines.push("## Task types detected for this repo");
  lines.push("");
  lines.push("| Task type | Tier | Why |");
  lines.push("|---|---|---|");
  if (hasCi) {
    lines.push(`| CI failure triage | Mechanical | ${mdInline(ctx.detection.ci_platform!)} pipeline detected — most failures are a known-shape error to interpret, not a design decision |`);
  }
  if (hasTests) {
    lines.push(`| Test-backed implementation | Executor | ${mdInline(ctx.detection.test_frameworks.join(", "))} detected — a change and its test are one unit of work, no cross-cutting judgment needed |`);
  }
  if (hasMultiPartArchitecture) {
    lines.push(`| Cross-cutting design + adversarial verification | Planner | ${mdInline(infraPatterns.join(", "))} detected — a change here can silently break a sibling package/service, so the tier that plans it should also verify it |`);
  }
  if (hasMultipleFrameworks) {
    lines.push(`| Framework/tooling migration | Planner | ${ctx.detection.frameworks.length} frameworks detected — a migration decision affects every consumer, not a local edit |`);
  }
  if (lowSeparation) {
    lines.push(`| Refactoring across layer boundaries | Planner | separation score ${ctx.architecture_signals.separation_score.toFixed(2)} (low) — layers are already coupled, an edit here risks an unreviewed cross-layer break |`);
  }
  lines.push("| New feature implementation | Executor | Follows existing patterns; escalate to Planner only if no existing pattern fits |");
  lines.push("| Formatting, renames, boilerplate | Mechanical | No design judgment required |");
  lines.push("");

  lines.push("## Delegation contract");
  lines.push("");
  lines.push("- Each tier writes work orders **with acceptance criteria** for the tier below — not vague instructions.");
  lines.push("- Verification of a unit of work runs **at or above** the tier that implemented it — a tier never grades its own homework alone.");
  lines.push("- A tier that cannot meet its own acceptance criteria escalates one tier up, carrying the failure context (what was tried, what failed, why) forward — not a bare \"this didn't work.\"");
  lines.push("");

  lines.push("## Cost rule");
  lines.push("");
  lines.push(
    "Run every unit of work on the lowest-token-cost tier that clears its quality bar. " +
    "Escalate one tier after two failed attempts at the same tier, carrying the failure " +
    "context forward so the escalation doesn't restart from zero.",
  );
  lines.push("");

  lines.push("## Honest limits");
  lines.push("");
  lines.push(
    "\"Planner\" / \"Executor\" / \"Mechanical\" are capability CLASSES, not vendor SKUs or " +
    "specific model names — this file makes no pricing claims and no benchmark claims. " +
    "Which actual model fills which tier is a choice made at run time, outside this " +
    "document's scope.",
  );

  return {
    path: "model-cascade.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "skills",
    description: "Deterministic model-tier delegation map (planner/executor/mechanical) derived from this repo's own detected task-type signals",
  };
}
