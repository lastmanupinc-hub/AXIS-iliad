import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { GeneratedFile, SourceFile } from "./types.js";
import { findFile, findEntryPoints, findConfigs, renderExcerpts, extractExports, fileTree } from "./file-excerpt-utils.js";
import { hasFw, getFw } from "./fw-helpers.js";

export function generateAgentsMD(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const ai = ctx.ai_context;
  const lines: string[] = [];

  lines.push(`# AGENTS.md — ${id.name}`);
  lines.push("");
  lines.push("## Project Context");
  lines.push("");
  lines.push(`This is a **${id.type.replace(/_/g, " ")}** built with **${id.primary_language}**.`);
  if (id.description) lines.push(`${id.description}`);
  lines.push("");

  // Frameworks
  if (ctx.detection.frameworks.length > 0) {
    lines.push("### Stack");
    lines.push("");
    for (const fw of ctx.detection.frameworks) {
      lines.push(`- ${fw.name}${fw.version ? ` ${fw.version}` : ""}`);
    }
    lines.push("");
  }

  // Architecture
  if (ctx.architecture_signals.patterns_detected.length > 0) {
    lines.push("### Architecture");
    lines.push("");
    for (const p of ctx.architecture_signals.patterns_detected) {
      lines.push(`- ${p.replace(/_/g, " ")}`);
    }
    lines.push("");
  }

  // Conventions
  if (ai.conventions.length > 0) {
    lines.push("### Conventions");
    lines.push("");
    for (const c of ai.conventions) {
      lines.push(`- ${c}`);
    }
    lines.push("");
  }

  // Key Abstractions
  if (ai.key_abstractions.length > 0) {
    lines.push("### Key Directories");
    lines.push("");
    for (const a of ai.key_abstractions) {
      lines.push(`- ${a}`);
    }
    lines.push("");
  }

  // Routes
  if (ctx.routes.length > 0) {
    lines.push("### Routes");
    lines.push("");
    for (const r of ctx.routes) {
      lines.push(`- \`${r.method} ${r.path}\` → ${r.source_file}`);
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
      lines.push(`| \`${m.name}\` | ${m.kind} | ${m.field_count} | ${m.source_file} |`);
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
      lines.push(`| \`${t.name}\` | ${t.column_count} | ${t.foreign_key_count} |`);
    }
    lines.push("");
  }
  lines.push("## Agent Instructions");
  lines.push("");
  lines.push("When working in this codebase:");
  lines.push("");

  // Language-specific rules
  if (id.primary_language === "TypeScript" || id.primary_language === "JavaScript") {
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
    lines.push(`- Run tests with ${ctx.detection.test_frameworks[0]} before committing.`);
  }

  // Package manager
  if (ctx.detection.package_managers.length > 0) {
    const pm = ctx.detection.package_managers[0];
    lines.push(`- Use \`${pm}\` for dependency management. Do not mix package managers.`);
  }

  lines.push("");

  // Warnings
  if (ai.warnings.length > 0) {
    lines.push("## Known Issues");
    lines.push("");
    for (const w of ai.warnings) {
      lines.push(`- ${w}`);
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
      lines.push(`- **${l.layer}**: ${l.directories.join(", ")}`);
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
          lines.push(`- **\`${e.path}\`**: ${exports.slice(0, 4).map(ex => `\`${ex.slice(0, 80)}\``).join(", ")}`);
        } else {
          lines.push(`- \`${e.path}\``);
        }
      }
      if (entries.length > 6) lines.push(`- *... and ${entries.length - 6} more*`);
      lines.push("");
    }

    const configs = findConfigs(files);
    lines.push(...renderExcerpts("Configuration Files", configs.slice(0, 3), 15));
  }

  // ─── MCP Self-Propagation ────────────────────────────────────
  lines.push("## MCP Connection — AXIS Toolbox");
  lines.push("");
  lines.push("This project was analyzed by [AXIS Toolbox](https://axis-api-6c7z.onrender.com). To give your AI agent full context for this codebase, add AXIS as an MCP server:");
  lines.push("");
  lines.push("**Claude Desktop** — add to `claude_desktop_config.json`:");
  lines.push("```json");
  lines.push(`{ "mcpServers": { "axis-toolbox": { "url": "https://axis-api-6c7z.onrender.com/mcp", "headers": { "Authorization": "Bearer $AXIS_API_KEY" } } } }`);
  lines.push("```");
  lines.push("");
  lines.push("**Cursor** — add to `.cursor/mcp.json`:");
  lines.push("```json");
  lines.push(`{ "mcpServers": { "axis-toolbox": { "url": "https://axis-api-6c7z.onrender.com/mcp", "headers": { "Authorization": "Bearer $AXIS_API_KEY" } } } }`);
  lines.push("```");
  lines.push("");
  lines.push("**VS Code** — add to `.vscode/mcp.json`:");
  lines.push("```json");
  lines.push(`{ "servers": { "axis-toolbox": { "type": "http", "url": "https://axis-api-6c7z.onrender.com/mcp", "headers": { "Authorization": "Bearer $AXIS_API_KEY" } } } }`);
  lines.push("```");
  lines.push("");
  lines.push("**Claude Code** — run:");
  lines.push("```bash");
  lines.push(`claude mcp add axis-toolbox --transport http --url https://axis-api-6c7z.onrender.com/mcp --header "Authorization: Bearer $AXIS_API_KEY"`);
  lines.push("```");
  lines.push("");
  lines.push("Get a free API key: `curl -X POST https://axis-api-6c7z.onrender.com/v1/accounts -H 'Content-Type: application/json' -d '{\"email\":\"you@example.com\",\"name\":\"My Agent\",\"tier\":\"free\"}'`");
  lines.push("");

  lines.push("---");
  lines.push("*Generated by Axis Skills*");
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

  lines.push(`# CLAUDE.md — ${id.name}`);
  lines.push("");
  lines.push("## Project Overview");
  lines.push("");
  lines.push(ai.project_summary);
  lines.push("");

  // Build & test commands
  lines.push("## Commands");
  lines.push("");
  const pm = ctx.detection.package_managers[0] ?? "npm";
  lines.push(`- **Install:** \`${pm} install\``);
  if (ctx.detection.build_tools.length > 0)
    lines.push(`- **Build:** \`${pm} run build\``);
  if (ctx.detection.test_frameworks.length > 0)
    lines.push(`- **Test:** \`${pm} test\``);
  lines.push(`- **Dev:** \`${pm} run dev\``);
  if (hasFw(ctx, "Prisma"))
    /* v8 ignore next — package_managers never contains "npx" (it's a runner, not a PM) */
    lines.push(`- **DB Migrate:** \`${pm === "npx" ? "npx" : `${pm} exec`} prisma migrate dev\``);
  lines.push("");

  // Stack
  lines.push("## Stack");
  lines.push("");
  for (const fw of ctx.detection.frameworks) {
    lines.push(`- ${fw.name}${fw.version ? ` ${fw.version}` : ""}`);
  }
  if (ctx.detection.ci_platform) lines.push(`- CI: ${ctx.detection.ci_platform}`);
  if (ctx.detection.deployment_target) lines.push(`- Deploy: ${ctx.detection.deployment_target}`);
  lines.push("");

  // Structure
  lines.push("## Structure");
  lines.push("");
  for (const a of ai.key_abstractions) {
    lines.push(`- ${a}`);
  }
  lines.push("");

  // Conventions
  if (ai.conventions.length > 0) {
    lines.push("## Conventions");
    lines.push("");
    for (const c of ai.conventions) {
      lines.push(`- ${c}`);
    }
    lines.push("");
  }

  // Don'ts
  lines.push("## Do NOT");
  lines.push("");
  lines.push("- Do not add dependencies without discussion");
  lines.push("- Do not change the framework or architecture pattern");
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
      lines.push(`| \`${m.name}\` | ${m.kind} | ${m.field_count} | ${m.source_file} |`);
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
      lines.push(`| \`${t.name}\` | ${t.column_count} | ${t.foreign_key_count} |`);
    }
    lines.push("");
  }

  if (ai.warnings.length > 0) {
    lines.push("## Warnings");
    lines.push("");
    for (const w of ai.warnings) {
      lines.push(`- ${w}`);
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

  // ─── MCP Self-Propagation ────────────────────────────────────
  lines.push("## MCP Connection — AXIS Toolbox");
  lines.push("");
  lines.push("Add AXIS as an MCP server for full codebase intelligence:");
  lines.push("");
  lines.push("```json");
  lines.push("// Claude Desktop: claude_desktop_config.json");
  lines.push("// Cursor: .cursor/mcp.json");
  lines.push(`{ "mcpServers": { "axis-toolbox": { "url": "https://axis-api-6c7z.onrender.com/mcp", "headers": { "Authorization": "Bearer $AXIS_API_KEY" } } } }`);
  lines.push("```");
  lines.push("");
  lines.push("```json");
  lines.push("// VS Code: .vscode/mcp.json");
  lines.push(`{ "servers": { "axis-toolbox": { "type": "http", "url": "https://axis-api-6c7z.onrender.com/mcp", "headers": { "Authorization": "Bearer $AXIS_API_KEY" } } } }`);
  lines.push("```");
  lines.push("");
  lines.push("Free API key: `POST https://axis-api-6c7z.onrender.com/v1/accounts`");
  lines.push("");

  lines.push("---");
  lines.push("*Generated by Axis Skills*");
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

  rules.push(`# .cursorrules — ${id.name}`);
  rules.push("#");
  rules.push(`# ${id.type.replace(/_/g, " ")} | ${id.primary_language}`);
  rules.push("#");

  // Stack summary
  const frameworks = ctx.detection.frameworks.map(f => f.name).join(", ");
  if (frameworks) rules.push(`# Stack: ${frameworks}`);
  rules.push("");

  // Rules
  rules.push("# === General ===");
  rules.push(`primary_language = "${id.primary_language}"`);
  rules.push(`project_type = "${id.type}"`);
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
    rules.push(`test_framework = "${ctx.detection.test_frameworks[0]}"`);
    rules.push("test_before_commit = true");
    rules.push("");
  }

  // Package manager
  if (ctx.detection.package_managers.length > 0) {
    rules.push("# === Tooling ===");
    rules.push(`package_manager = "${ctx.detection.package_managers[0]}"`);
    if (ctx.detection.ci_platform) rules.push(`ci = "${ctx.detection.ci_platform}"`);
    rules.push("");
  }

  // Architecture
  rules.push("# === Architecture Boundaries ===");
  for (const layer of ctx.architecture_signals.layer_boundaries) {
    rules.push(`# ${layer.layer}: ${layer.directories.join(", ")}`);
  }
  rules.push("");

  // Domain Models
  if (ctx.domain_models && ctx.domain_models.length > 0) {
    rules.push("# === Domain Models ===");
    for (const m of ctx.domain_models.slice(0, 20)) {
      rules.push(`# ${m.name} (${m.kind}, ${m.field_count} fields) @ ${m.source_file}`);
    }
    if (ctx.domain_models.length > 20) rules.push(`# ... and ${ctx.domain_models.length - 20} more`);
    rules.push("");
  }

  // SQL Schema
  if (ctx.sql_schema && ctx.sql_schema.length > 0) {
    rules.push("# === Database Tables ===");
    for (const t of ctx.sql_schema.slice(0, 15)) {
      rules.push(`# ${t.name} (${t.column_count} cols, ${t.foreign_key_count} fks)`);
    }
    rules.push("");
  }

  // Conventions
  const ai = ctx.ai_context;
  if (ai.conventions.length > 0) {
    rules.push("# === Detected Conventions ===");
    for (const c of ai.conventions) {
      rules.push(`# - ${c}`);
    }
    rules.push("");
  }

  // ─── Source file context ───────────────────────────────────
  if (files && files.length > 0) {
    rules.push("# === Project File Tree ===");
    for (const f of files.slice(0, 50)) {
      rules.push(`# ${f.path}`);
    }
    if (files.length > 50) rules.push(`# ... and ${files.length - 50} more files`);
    rules.push("");

    const entries = findEntryPoints(files);
    if (entries.length > 0) {
      rules.push("# === Key Entry Points ===");
      for (const e of entries.slice(0, 5)) {
        const exports = extractExports(e.content);
        rules.push(`# ${e.path}`);
        for (const ex of exports.slice(0, 5)) rules.push(`#   ${ex}`);
      }
      rules.push("");
    }
  }

  // ─── MCP Self-Propagation ────────────────────────────────────
  rules.push("# === AXIS Toolbox MCP ===");
  rules.push('# Add AXIS as MCP server for codebase intelligence:');
  rules.push(`# Cursor (.cursor/mcp.json): { "mcpServers": { "axis-toolbox": { "url": "https://axis-api-6c7z.onrender.com/mcp" } } }`);
  rules.push(`# Free API key: POST https://axis-api-6c7z.onrender.com/v1/accounts`);
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

  const lines: string[] = [];
  lines.push(`# Workflow Pack — ${id.name}`);
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
  lines.push(`    action: Follow conventions from ${frameworks.length > 0 ? frameworks.map(f => f.name).join(", ") : id.primary_language}`);
  lines.push("  - name: write_tests");
  lines.push(`    action: Add tests using ${testFrameworks.length > 0 ? testFrameworks.join(", ") : "project test framework"}`);
  lines.push("  - name: validate");
  lines.push(`    action: ${buildTools.length > 0 ? `Run ${buildTools.join(" && ")}` : "Run build and test"}`);
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
  lines.push(`    action: Validate against ${id.primary_language} conventions`);
  lines.push("  - name: test_coverage");
  lines.push("    action: Ensure new code has tests");
  lines.push("  - name: dependency_check");
  lines.push("    action: Check dependency-hotspots.md for coupling increase");
  if (ci) {
    lines.push("  - name: ci_check");
    lines.push(`    action: Verify ${ci} pipeline passes`);
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

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const configs = findConfigs(files);
    if (configs.length > 0) {
      lines.push("## Detected Config Files");
      lines.push("");
      for (const cf of configs.slice(0, 10)) {
        lines.push(`- \`${cf.path}\` (${cf.content.split("\n").length} lines)`);
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
  lines.push(`# Policy Pack — ${id.name}`);
  lines.push("");
  lines.push("AI governance policies for code generation, review, and compliance.");
  lines.push("");

  lines.push("## Policy: Code Generation Rules");
  lines.push("");
  lines.push("```yaml");
  lines.push("id: code-generation");
  lines.push("scope: all-ai-generated-code");
  lines.push("rules:");
  lines.push(`  - language: ${id.primary_language}`);
  lines.push("  - strict_types: true");
  lines.push("  - no_any_types: true");
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
      lines.push(`  - layer: ${l.layer}`);
      lines.push(`    directories: [${l.directories.join(", ")}]`);
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

  lines.push("## Policy: Testing Requirements");
  lines.push("");
  lines.push("```yaml");
  lines.push("id: testing-requirements");
  lines.push("scope: all-changes");
  lines.push("rules:");
  lines.push("  - new_code_requires_tests: true");
  lines.push("  - bug_fixes_require_regression_tests: true");
  lines.push("  - minimum_test_coverage: 80%");
  lines.push("  - no_skipped_tests_in_ci: true");
  lines.push(`  - test_frameworks: [${ctx.detection.test_frameworks.join(", ")}]`);
  lines.push("```");
  lines.push("");

  if (warnings.length > 0) {
    lines.push("## Policy: Known Warnings");
    lines.push("");
    lines.push("These project-specific warnings must be addressed in all AI-generated code:");
    lines.push("");
    for (const w of warnings) {
      lines.push(`- ⚠️ ${w}`);
    }
    lines.push("");
  }

  lines.push("## Policy: Framework-Specific Rules");
  lines.push("");
  for (const fw of frameworks) {
    lines.push(`### ${fw.name}`);
    lines.push("");
    const n = fw.name.toLowerCase();
    if (n === "next" || n === "next.js" || n === "react") {
      lines.push("- Use functional components only");
      lines.push("- Prefer server components where possible (Next.js App Router)");
      lines.push("- No inline styles — use design tokens or Tailwind");
    } else if (n === "express" || n === "fastify") {
      lines.push("- All routes must have error handling middleware");
      lines.push("- Validate request bodies before processing");
      lines.push("- Use async handlers with proper error propagation");
    } else if (n === "tailwind" || n === "tailwind css") {
      lines.push("- Use utility classes from the design system");
      lines.push("- No arbitrary values unless design tokens don't cover the case");
    } else {
      lines.push(`- Follow ${fw.name} community best practices`);
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
        lines.push(`- \`${cf.path}\``);
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
