import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { GeneratedFile, SourceFile } from "./types.js";
import { hasFw, getFw } from "./fw-helpers.js";
import { findFiles, renderExcerpts, extractExports } from "./file-excerpt-utils.js";

// ─── superpower-pack.md ─────────────────────────────────────────

export function generateSuperpowerPack(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const frameworks = ctx.detection.frameworks.map(f => f.name);
  const lines: string[] = [];

  lines.push(`# Superpower Pack — ${id.name}`);
  lines.push("");
  lines.push(`> High-leverage development workflows for a ${id.type.replace(/_/g, " ")} (${id.primary_language})`);
  lines.push("");

  // Project Overview
  if (ctx.ai_context.project_summary) {
    lines.push("## Project Overview");
    lines.push("");
    lines.push(ctx.ai_context.project_summary);
    lines.push("");
  }

  // Detected Stack
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

  // Quick Actions
  lines.push("## Quick Actions");
  lines.push("");
  lines.push("Copy-paste-ready commands for common high-value operations:");
  lines.push("");

  // Build & Run
  lines.push("### Build & Run");
  lines.push("");
  const buildTools = ctx.detection.build_tools;
  const pkgManagers = ctx.detection.package_managers;
  const pkgMgr = pkgManagers.includes("pnpm") ? "pnpm" : pkgManagers.includes("yarn") ? "yarn" : "npm";
  lines.push("```bash");
  lines.push(`# Install dependencies`);
  lines.push(`${pkgMgr} install`);
  lines.push("");
  lines.push(`# Build`);
  if (buildTools.includes("vite")) {
    lines.push(`${pkgMgr} run build`);
  } else if (buildTools.includes("webpack")) {
    lines.push(`${pkgMgr} run build`);
  } else if (buildTools.includes("tsc")) {
    lines.push(`npx tsc`);
  } else {
    lines.push(`${pkgMgr} run build`);
  }
  lines.push("");
  lines.push("# Dev server");
  if (hasFw(ctx, "Next.js")) {
    lines.push(`${pkgMgr} run dev`);
  } else if (buildTools.includes("vite")) {
    lines.push(`${pkgMgr} run dev`);
  } else {
    lines.push(`${pkgMgr} start`);
  }
  lines.push("```");
  lines.push("");

  // Testing
  const testFrameworks = ctx.detection.test_frameworks;
  if (testFrameworks.length > 0) {
    lines.push("### Testing");
    lines.push("");
    lines.push("```bash");
    lines.push("# Run all tests");
    if (testFrameworks.includes("vitest")) {
      lines.push(`npx vitest run`);
      lines.push("");
      lines.push("# Watch mode");
      lines.push(`npx vitest`);
      lines.push("");
      lines.push("# Single file");
      lines.push(`npx vitest run <file>`);
    } else if (testFrameworks.includes("jest")) {
      lines.push(`npx jest`);
      lines.push("");
      lines.push("# Watch mode");
      lines.push(`npx jest --watch`);
      lines.push("");
      lines.push("# Single file");
      lines.push(`npx jest <file>`);
    } else if (testFrameworks.includes("pytest")) {
      lines.push(`python -m pytest`);
      lines.push("");
      lines.push("# Verbose");
      lines.push(`python -m pytest -v`);
    } else {
      lines.push(`${pkgMgr} test`);
    }
    lines.push("");
    lines.push("# Coverage");
    if (testFrameworks.includes("vitest")) {
      lines.push(`npx vitest run --coverage`);
    } else if (testFrameworks.includes("jest")) {
      lines.push(`npx jest --coverage`);
    } else if (testFrameworks.includes("pytest")) {
      lines.push(`python -m pytest --cov`);
    }
    lines.push("```");
    lines.push("");
  }

  // Debugging Workflow
  lines.push("### Debugging Workflow");
  lines.push("");
  lines.push("1. **Reproduce** — Create a minimal test case that triggers the bug");
  lines.push("2. **Isolate** — Use dependency hotspots to narrow the search area:");
  lines.push("");
  const hotspots = ctx.dependency_graph.hotspots.slice(0, 5);
  if (hotspots.length > 0) {
    for (const h of hotspots) {
      lines.push(`   - \`${h.path}\` (risk: ${h.risk_score.toFixed(1)}, ${h.inbound_count} inbound, ${h.outbound_count} outbound)`);
    }
    lines.push("");
  }
  lines.push("3. **Trace** — Follow the import chain from entry point to failure");
  lines.push("4. **Fix** — Make the smallest change that resolves the issue");
  lines.push("5. **Verify** — Run the test case + full suite to confirm no regressions");
  lines.push("");

  // Code Review Checklist
  lines.push("## Code Review Checklist");
  lines.push("");
  lines.push("- [ ] Types are correct and meaningful (no `any`, no untyped casts)");
  lines.push("- [ ] Error paths are handled (not just the happy path)");
  lines.push("- [ ] New code has test coverage");
  lines.push("- [ ] No debug artifacts (console.log, TODO, commented code)");
  lines.push("- [ ] Import graph doesn't create new circular dependencies");
  lines.push("- [ ] Changes follow detected conventions:");

  const conventions = ctx.ai_context.conventions;
  for (const c of conventions) {
    lines.push(`  - ${c}`);
  }
  lines.push("");

  // Planning Template
  lines.push("## Planning Template");
  lines.push("");
  lines.push("```markdown");
  lines.push("## Task: [title]");
  lines.push("");
  lines.push("### What");
  lines.push("[One sentence describing the change]");
  lines.push("");
  lines.push("### Why");
  lines.push("[Business or technical reason]");
  lines.push("");
  lines.push("### Files to Touch");
  lines.push("- [ ] file1.ts — [what changes]");
  lines.push("- [ ] file2.ts — [what changes]");
  lines.push("");
  lines.push("### Tests");
  lines.push("- [ ] [test case 1]");
  lines.push("- [ ] [test case 2]");
  lines.push("");
  lines.push("### Risks");
  lines.push("- [potential issue and mitigation]");
  lines.push("```");
  lines.push("");

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const hotspotPaths = ctx.dependency_graph.hotspots
      .sort((a, b) => b.risk_score - a.risk_score)
      .slice(0, 3)
      .map(h => h.path);
    const hotspotFiles = files.filter(f => hotspotPaths.some(hp => f.path.endsWith(hp) || f.path.includes(hp)));
    if (hotspotFiles.length > 0) {
      lines.push(...renderExcerpts("Key Hotspot Files (for Debugging)", hotspotFiles, 20));
    }
  }

  return {
    path: "superpower-pack.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "superpowers",
    description: "High-leverage development workflows, quick actions, and planning templates",
  };
}

// ─── workflow-registry.json ─────────────────────────────────────

export function generateWorkflowRegistry(ctx: ContextMap, profile: RepoProfile, files?: SourceFile[]): GeneratedFile {
  const frameworks = ctx.detection.frameworks.map(f => f.name);
  const testFws = ctx.detection.test_frameworks;
  const pkgManagers = ctx.detection.package_managers;
  const pkgMgr = pkgManagers.includes("pnpm") ? "pnpm" : pkgManagers.includes("yarn") ? "yarn" : "npm";

  const workflows: Array<{
    id: string;
    name: string;
    category: string;
    trigger: string;
    steps: string[];
    applicable: boolean;
  }> = [];

  // Core workflows
  workflows.push({
    id: "full-build-verify",
    name: "Full Build & Verify",
    category: "build",
    trigger: "Before commit / Before PR",
    steps: [
      `${pkgMgr} install`,
      `${pkgMgr} run build`,
      testFws.includes("vitest") ? "npx vitest run" : testFws.includes("jest") ? "npx jest" : `${pkgMgr} test`,
      "npx tsc --noEmit",
    ],
    applicable: true,
  });

  workflows.push({
    id: "quick-test",
    name: "Quick Test Loop",
    category: "testing",
    trigger: "During development",
    steps: testFws.includes("vitest")
      ? ["npx vitest --changed"]
      : testFws.includes("jest")
        ? ["npx jest --onlyChanged"]
        : [`${pkgMgr} test`],
    applicable: testFws.length > 0,
  });

  workflows.push({
    id: "dependency-audit",
    name: "Dependency Audit",
    category: "maintenance",
    trigger: "Weekly / Before release",
    steps: [
      `${pkgMgr} audit`,
      `${pkgMgr} outdated`,
      "Review dependency hotspots in optimization-rules.md",
    ],
    applicable: true,
  });

  workflows.push({
    id: "new-feature",
    name: "New Feature Workflow",
    category: "planning",
    trigger: "Starting a new feature",
    steps: [
      "Create branch from main",
      "Write failing test first",
      "Implement minimum viable change",
      "Run full test suite",
      "Review against code review checklist",
      "Commit with descriptive message",
      "Open PR",
    ],
    applicable: true,
  });

  workflows.push({
    id: "hotfix",
    name: "Hotfix Workflow",
    category: "incident",
    trigger: "Production issue detected",
    steps: [
      "Create hotfix branch from main",
      "Write test that reproduces the bug",
      "Apply minimal fix",
      "Run full test suite",
      "Fast-track review",
      "Merge and deploy",
      "Update incident log",
    ],
    applicable: true,
  });

  // Framework-specific workflows
  if (hasFw(ctx, "Next.js")) {
    workflows.push({
      id: "nextjs-page-creation",
      name: "New Next.js Page",
      category: "feature",
      trigger: "Adding a new route/page",
      steps: [
        "Create app/<route>/page.tsx",
        "Add metadata export for SEO",
        "Create loading.tsx for Suspense",
        "Add to sitemap if public",
        "Write integration test",
      ],
      applicable: true,
    });
  }

  if (hasFw(ctx, "Prisma")) {
    workflows.push({
      id: "schema-migration",
      name: "Prisma Schema Migration",
      category: "database",
      trigger: "Schema change needed",
      steps: [
        "Edit prisma/schema.prisma",
        "npx prisma migrate dev --name <description>",
        "npx prisma generate",
        "Update affected queries",
        "Run tests",
      ],
      applicable: true,
    });
  }

  const registry = {
    project: ctx.project_identity.name,
    generated_at: ctx.generated_at,
    project_summary: ctx.ai_context.project_summary || null,
    detected_stack: ctx.detection.frameworks.map(fw => ({
      name: fw.name,
      version: fw.version ?? null,
      confidence: fw.confidence,
    })),
    total_workflows: workflows.length,
    workflows,
    source_config_files: null as string[] | null,
  };

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const cfgFiles = findFiles(files, ["*.yml", "*.yaml", "*Makefile*", "*Dockerfile*", "*docker-compose*", "*.json"])
      .filter(f => !f.path.includes("node_modules"));
    if (cfgFiles.length > 0) {
      registry.source_config_files = cfgFiles.slice(0, 15).map(f => f.path);
    }
  }

  return {
    path: "workflow-registry.json",
    content: JSON.stringify(registry, null, 2),
    content_type: "application/json",
    program: "superpowers",
    description: "Registry of reusable development workflows with steps and triggers",
  };
}

// ─── test-generation-rules.md ───────────────────────────────────

export function generateTestGenerationRules(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const testFws = ctx.detection.test_frameworks;
  const frameworks = ctx.detection.frameworks.map(f => f.name);
  const lines: string[] = [];

  lines.push(`# Test Generation Rules — ${id.name}`);
  lines.push("");
  lines.push(`> Testing conventions and generation rules for a ${id.type.replace(/_/g, " ")}`);
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

  // Test framework
  lines.push("## Test Framework");
  lines.push("");
  if (testFws.length > 0) {
    lines.push(`Detected: **${testFws.join(", ")}**`);
  } else {
    lines.push("No test framework detected. Recommended: vitest (TypeScript), pytest (Python), or jest (JavaScript).");
  }
  lines.push("");

  // File naming
  lines.push("## File Naming Convention");
  lines.push("");
  if (testFws.includes("vitest") || testFws.includes("jest")) {
    lines.push("- Test files: `<module>.test.ts` or `<module>.spec.ts`");
    lines.push("- Co-locate with source: `src/store.ts` → `src/store.test.ts`");
    lines.push("- Alternatively: `__tests__/<module>.test.ts`");
  } else if (testFws.includes("pytest")) {
    lines.push("- Test files: `test_<module>.py` or `<module>_test.py`");
    lines.push("- Place in `tests/` directory mirroring source structure");
  }
  lines.push("");

  // Test structure
  lines.push("## Test Structure");
  lines.push("");
  const models = ctx.domain_models;
  const firstModel = models.length > 0 ? models[0] : null;
  const exampleName = firstModel ? firstModel.name : "MyModel";
  const exampleVar = exampleName.charAt(0).toLowerCase() + exampleName.slice(1);
  if (testFws.includes("vitest") || testFws.includes("jest")) {
    const importLine = testFws.includes("vitest") ? "import { describe, it, expect, beforeEach } from 'vitest';" : "import { describe, it, expect, beforeEach } from '@jest/globals';";
    lines.push("```typescript");
    lines.push(importLine);
    lines.push(`import type { ${exampleName} } from '..';`);
    lines.push("");
    lines.push(`describe('${exampleName}', () => {`);
    lines.push(`  let ${exampleVar}: ${exampleName};`);
    lines.push("");
    lines.push("  beforeEach(() => {");
    lines.push(`    ${exampleVar} = make${exampleName}();`);
    lines.push("  });");
    lines.push("");
    lines.push("  it('should <expected behavior> when <condition>', () => {");
    lines.push("    // Arrange");
    lines.push(`    const input = make${exampleName}({ /* override fields */ });`);
    lines.push("");
    lines.push("    // Act");
    lines.push(`    const result = process${exampleName}(input);`);
    lines.push("");
    lines.push("    // Assert");
    lines.push("    expect(result).toEqual(expected);");
    lines.push("  });");
    lines.push("});");
    lines.push("```");
  } else if (testFws.includes("pytest")) {
    lines.push("```python");
    lines.push(`def test_${exampleVar}_should_behave_when_condition():`);
    lines.push("    # Arrange");
    lines.push(`    obj = make_${exampleVar}()`);
    lines.push("    # Act");
    lines.push(`    result = process_${exampleVar}(obj)`);
    lines.push("    # Assert");
    lines.push("    assert result == expected");
    lines.push("```");
  }
  lines.push("");

  // Domain model test targets
  if (models.length > 0) {
    lines.push("## Domain Model Test Targets");
    lines.push("");
    lines.push("These models were detected in the codebase. Each should have factory helpers and unit tests:");
    lines.push("");
    lines.push("| Model | Kind | Fields | Source |");
    lines.push("|-------|------|--------|--------|");
    for (const m of models.slice(0, 15)) {
      lines.push(`| \`${m.name}\` | ${m.kind} | ${m.field_count} | \`${m.source_file}\` |`);
    }
    if (models.length > 15) lines.push(`| *... and ${models.length - 15} more* | | | |`);
    lines.push("");

    lines.push("### Factory Helper Pattern");
    lines.push("");
    lines.push("Create a factory file (`test-factories.ts`) with sensible defaults for each model:");
    lines.push("");
    if (testFws.includes("vitest") || testFws.includes("jest")) {
      lines.push("```typescript");
      for (const m of models.slice(0, 3)) {
        const v = m.name.charAt(0).toLowerCase() + m.name.slice(1);
        lines.push(`export function make${m.name}(overrides: Partial<${m.name}> = {}): ${m.name} {`);
        lines.push("  return {");
        lines.push("    // fill in required fields with sensible test defaults");
        lines.push(`    ...overrides,`);
        lines.push("  };");
        lines.push("}");
        lines.push("");
      }
      lines.push("```");
    } else if (testFws.includes("pytest")) {
      lines.push("```python");
      for (const m of models.slice(0, 3)) {
        const snake = m.name.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
        lines.push(`def make_${snake}(**kwargs):`);
        lines.push("    defaults = {");
        lines.push("        # fill in required fields with sensible test defaults");
        lines.push("    }");
        lines.push("    return {**defaults, **kwargs}");
        lines.push("");
      }
      lines.push("```");
    }
    lines.push("");

    // High-field-count models → likely complex, need edge-case coverage
    const complexModels = models.filter(m => m.field_count >= 5).sort((a, b) => b.field_count - a.field_count);
    if (complexModels.length > 0) {
      lines.push("### High-Complexity Models (prioritize edge-case coverage)");
      lines.push("");
      for (const m of complexModels.slice(0, 5)) {
        lines.push(`- **\`${m.name}\`** (${m.field_count} fields) — test with partial input, null fields, and boundary values`);
      }
      lines.push("");
    }
  }

  // Test categories
  lines.push("## Test Categories");
  lines.push("");
  lines.push("### Unit Tests");
  lines.push("- Test individual functions and methods in isolation");
  lines.push("- Mock external dependencies (database, API, file system)");
  lines.push("- Target: every exported function should have at least one unit test");
  lines.push("- Speed: < 10ms per test");
  lines.push("");
  lines.push("### Integration Tests");
  lines.push("- Test module interactions with real dependencies where possible");
  lines.push("- Use in-memory databases (SQLite :memory:) instead of mocks when available");
  lines.push("- Test API endpoints with real HTTP requests");
  lines.push("- Speed: < 500ms per test");
  lines.push("");

  if (hasFw(ctx, "Next.js", "React")) {
    lines.push("### Component Tests");
    lines.push("- Use @testing-library/react for component rendering");
    lines.push("- Test user interactions, not implementation details");
    lines.push("- Test accessibility: check roles, labels, keyboard navigation");
    lines.push("- Avoid testing CSS classes — test visible behavior");
    lines.push("");
  }

  // What to test
  lines.push("## What to Test");
  lines.push("");
  lines.push("### Always Test");
  lines.push("- Public API surface (exported functions)");
  lines.push("- Error handling paths");
  lines.push("- Edge cases: empty input, null, boundary values");
  lines.push("- Data transformations and calculations");
  lines.push("- State transitions");
  lines.push("");
  lines.push("### Skip Testing");
  lines.push("- Private implementation details (test through public API)");
  lines.push("- Third-party library behavior");
  lines.push("- Simple type definitions");
  lines.push("- Configuration files");
  lines.push("");

  // Assertions
  lines.push("## Assertion Patterns");
  lines.push("");
  lines.push("| Pattern | When to Use | Example |");
  lines.push("|---------|------------|---------|");
  lines.push("| `toEqual` | Object/array equality | `expect(result).toEqual({ id: 1 })` |");
  lines.push("| `toBe` | Primitive or reference equality | `expect(status).toBe('ready')` |");
  lines.push("| `toContain` | Array/string inclusion | `expect(list).toContain('item')` |");
  lines.push("| `toThrow` | Error handling | `expect(() => fn()).toThrow()` |");
  lines.push("| `toBeGreaterThan` | Numeric bounds | `expect(count).toBeGreaterThan(0)` |");
  lines.push("| `toBeTruthy` | Existence check | `expect(result).toBeTruthy()` |");
  lines.push("");

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const testFiles = findFiles(files, ["*.test.ts", "*.spec.ts", "*.test.tsx", "*.spec.tsx", "test_*.py", "*_test.py", "*.test.js", "*.spec.js"]);
    if (testFiles.length > 0) {
      lines.push("## Detected Test Files");
      lines.push("");
      lines.push("| File | Lines |");
      lines.push("|------|-------|");
      for (const tf of testFiles.slice(0, 12)) {
        lines.push(`| \`${tf.path}\` | ${tf.content.split("\n").length} |`);
      }
      lines.push("");

      const exemplar = testFiles.find(f => {
        const len = f.content.split("\n").length;
        return len >= 10 && len <= 100;
      });
      if (exemplar) {
        lines.push(...renderExcerpts("Reference Test", [exemplar], 40));
      }
    }

    const sourceFiles = findFiles(files, ["*.ts", "*.tsx", "*.js", "*.jsx", "*.py"])
      .filter(f => !f.path.includes(".test.") && !f.path.includes(".spec.") && !f.path.includes("test_"));
    const untestedExports: string[] = [];
    for (const sf of sourceFiles.slice(0, 20)) {
      const exports = extractExports(sf.content);
      if (exports.length > 0) {
        const hasTest = testFiles.some(tf => tf.path.includes(sf.path.replace(/\.[^.]+$/, "")));
        if (!hasTest) {
          untestedExports.push(`\`${sf.path}\` — ${exports.join(", ")}`);
        }
      }
    }
    if (untestedExports.length > 0) {
      lines.push("## Untested Exports");
      lines.push("");
      lines.push("These source files export functions without matching test files:");
      lines.push("");
      for (const ue of untestedExports.slice(0, 10)) {
        lines.push(`- ${ue}`);
      }
      lines.push("");
    }
  }

  return {
    path: "test-generation-rules.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "superpowers",
    description: "Testing conventions and rules for generating project-consistent tests",
  };
}

// ─── refactor-checklist.md ──────────────────────────────────────

export function generateRefactorChecklist(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const hotspots = ctx.dependency_graph.hotspots;
  const lines: string[] = [];

  lines.push(`# Refactor Checklist — ${id.name}`);
  lines.push("");
  lines.push("> Systematic refactoring guide based on codebase analysis");
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

  // Risk Assessment
  lines.push("## Risk Assessment");
  lines.push("");
  if (hotspots.length > 0) {
    // risk_score is a 0–1 fraction (engine.ts: min(total/20, 1)) — the old
    // >5 / >2 thresholds assumed a 0–10 scale and could never fire, so every
    // repo's Risk Assessment read all-Low regardless of coupling.
    const highRisk = hotspots.filter(h => h.risk_score > 0.7);
    const medRisk = hotspots.filter(h => h.risk_score > 0.4 && h.risk_score <= 0.7);
    lines.push(`| Risk Level | Files | Action |`);
    lines.push(`|-----------|-------|--------|`);
    lines.push(`| High (>70%) | ${highRisk.length} | Refactor with full test coverage first |`);
    lines.push(`| Medium (40–70%) | ${medRisk.length} | Refactor when touching for features |`);
    lines.push(`| Low (≤40%) | ${hotspots.length - highRisk.length - medRisk.length} | Refactor opportunistically |`);
    lines.push("");

    if (highRisk.length > 0) {
      lines.push("### High-Risk Files");
      lines.push("");
      for (const h of highRisk.slice(0, 5)) {
        lines.push(`- **\`${h.path}\`** — risk ${(h.risk_score * 100).toFixed(0)}% (${h.inbound_count} inbound, ${h.outbound_count} outbound)`);
        lines.push(`  - Break into smaller modules if possible`);
        lines.push(`  - Add comprehensive tests before modifying`);
      }
      lines.push("");
    }
  } else {
    lines.push("No dependency hotspots detected. Codebase has even dependency distribution.");
    lines.push("");
  }

  // Pre-Refactor Checklist
  lines.push("## Pre-Refactor Checklist");
  lines.push("");
  lines.push("Before starting any refactor:");
  lines.push("");
  lines.push("- [ ] Existing tests pass (run full suite)");
  lines.push("- [ ] The refactor target has test coverage (add tests if not)");
  lines.push("- [ ] The goal is clear: what improves and what stays the same");
  lines.push("- [ ] A branch has been created for the refactor");
  lines.push("- [ ] No other in-progress work touches the same files");
  lines.push("");

  // Refactoring Patterns
  lines.push("## Refactoring Patterns");
  lines.push("");

  lines.push("### Extract Function");
  lines.push("- **When:** A block of code inside a function does one distinct thing");
  lines.push("- **How:** Move the block to a named function, pass needed values as parameters");
  lines.push("- **Test:** Existing tests still pass + new unit test for extracted function");
  lines.push("");

  lines.push("### Extract Module");
  lines.push("- **When:** A file has multiple unrelated responsibilities");
  lines.push("- **How:** Move related functions/types to a new file, update imports");
  lines.push("- **Test:** All existing imports resolve, no circular dependencies introduced");
  lines.push("");

  lines.push("### Simplify Conditionals");
  lines.push("- **When:** Nested if/else chains or complex boolean expressions");
  lines.push("- **How:** Extract conditions to named booleans, use early returns, use lookup tables");
  lines.push("- **Test:** Cover all branches before and after");
  lines.push("");

  lines.push("### Replace Magic Values");
  lines.push("- **When:** Hardcoded strings, numbers, or config values in business logic");
  lines.push("- **How:** Extract to named constants or config");
  lines.push("- **Test:** Behavior unchanged, constants are importable");
  lines.push("");

  // Domain Model Complexity
  const domainModels = ctx.domain_models;
  if (domainModels.length > 0) {
    lines.push("## Domain Model Complexity");
    lines.push("");
    lines.push("Models with a high field count are strong candidates for decomposition or value-object extraction:");
    lines.push("");
    lines.push("| Model | Kind | Fields | Source |");
    lines.push("|-------|------|--------|--------|");
    const sortedModels = [...domainModels].sort((a, b) => b.field_count - a.field_count);
    for (const m of sortedModels.slice(0, 10)) {
      const flag = m.field_count >= 10 ? " ⚠️ large" : m.field_count >= 6 ? " consider splitting" : "";
      lines.push(`| \`${m.name}\` | ${m.kind} | ${m.field_count}${flag} | \`${m.source_file}\` |`);
    }
    if (domainModels.length > 10) lines.push(`| *... and ${domainModels.length - 10} more* | | | |`);
    lines.push("");

    const largeModels = sortedModels.filter(m => m.field_count >= 8);
    if (largeModels.length > 0) {
      lines.push("### Decomposition Candidates");
      lines.push("");
      for (const m of largeModels.slice(0, 5)) {
        lines.push(`- **\`${m.name}\`** (${m.field_count} fields) — consider extracting related field groups into value objects`);
      }
      lines.push("");
    }

    // Interface vs class split
    const interfaces = domainModels.filter(m => m.kind === "interface" || m.kind === "type");
    const classes = domainModels.filter(m => m.kind === "class" || m.kind === "struct");
    if (interfaces.length > 0 && classes.length > 0) {
      lines.push(`**Model balance**: ${interfaces.length} interface/type definitions, ${classes.length} class/struct definitions.`);
      if (classes.length > interfaces.length * 2) {
        lines.push("Consider extracting shared field sets into shared interfaces to reduce duplication.");
      }
      lines.push("");
    }
  }

  // Architecture Signals
  const patterns = ctx.architecture_signals.patterns_detected;
  if (patterns.length > 0) {
    lines.push("## Architecture Alignment");
    lines.push("");
    lines.push("Detected patterns to preserve during refactoring:");
    lines.push("");
    for (const p of patterns) {
      lines.push(`- ${p}`);
    }
    lines.push("");
    const layers = ctx.architecture_signals.layer_boundaries;
    if (layers.length > 0) {
      lines.push("Layer boundaries (do not violate during refactoring):");
      lines.push("");
      for (const l of layers) {
        lines.push(`- **${l.layer}**: ${l.directories.join(", ")}`);
      }
      lines.push("");
    }
  }

  // Post-Refactor Checklist
  lines.push("## Post-Refactor Checklist");
  lines.push("");
  lines.push("- [ ] All tests pass");
  lines.push("- [ ] No new circular dependencies (check import graph)");
  lines.push("- [ ] Build succeeds with no new warnings");
  lines.push("- [ ] No dead code left behind (unused imports, unreachable branches)");
  lines.push("- [ ] Type coverage maintained or improved");
  lines.push("- [ ] Commit message describes what changed and why");
  lines.push("");

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const hotspotPaths = hotspots
      .filter(h => h.risk_score > 5)
      .sort((a, b) => b.risk_score - a.risk_score)
      .slice(0, 4)
      .map(h => h.path);
    const hotspotFiles = files.filter(f => hotspotPaths.some(hp => f.path.endsWith(hp) || f.path.includes(hp)));
    if (hotspotFiles.length > 0) {
      lines.push("## High-Risk File Export Surface");
      lines.push("");
      lines.push("Use these exports to identify module split boundaries:");
      lines.push("");
      for (const hf of hotspotFiles) {
        const exports = extractExports(hf.content);
        if (exports.length > 0) {
          lines.push(`### \`${hf.path}\``);
          lines.push("");
          for (const e of exports.slice(0, 12)) {
            lines.push(`- \`${e}\``);
          }
          lines.push("");
        }
      }

      lines.push(...renderExcerpts("High-Risk File Source", hotspotFiles, 25));
    }
  }

  return {
    path: "refactor-checklist.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "superpowers",
    description: "Systematic refactoring guide based on dependency analysis and architecture signals",
  };
}

// ─── automation-pipeline.yaml ───────────────────────────────────

export function generateAutomationPipeline(ctx: ContextMap, profile: RepoProfile, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const ci = ctx.detection.ci_platform;
  const buildTools = ctx.detection.build_tools;
  const testFrameworks = ctx.detection.test_frameworks;
  const pkgManagers = ctx.detection.package_managers;

  const lines: string[] = [];
  lines.push("# Automation Pipeline");
  lines.push(`# Project: ${id.name}`);
  lines.push(`# Generated: ${ctx.generated_at}`);
  if (ctx.ai_context.project_summary) {
    lines.push(`# Summary: ${ctx.ai_context.project_summary.split("\n")[0]}`);
  }
  lines.push("");

  lines.push("pipeline:");
  lines.push(`  name: ${JSON.stringify(id.name + "-automation")}`);
  lines.push(`  ci_platform: ${ci || "github-actions"}`);
  lines.push(`  package_manager: ${pkgManagers[0] ?? "npm"}`);
  lines.push("");

  lines.push("  stages:");
  lines.push("");

  // Stage 1: Install
  lines.push("    - name: install");
  lines.push("      description: Install dependencies");
  lines.push("      commands:");
  const pm = pkgManagers[0] ?? "npm";
  lines.push(`        - ${pm} install`);
  lines.push("      cache:");
  lines.push("        key: dependencies");
  lines.push(`        paths: [${pm === "pnpm" ? "~/.pnpm-store" : "node_modules"}]`);
  lines.push("");

  // Stage 2: Lint
  lines.push("    - name: lint");
  lines.push("      description: Static analysis and linting");
  lines.push("      depends_on: [install]");
  lines.push("      commands:");
  if (buildTools.includes("eslint")) {
    lines.push(`        - ${pm === "pnpm" ? "pnpm" : "npx"} eslint .`);
  }
  lines.push(`        - ${pm === "pnpm" ? "pnpm" : "npx"} tsc --noEmit`);
  lines.push("      fail_fast: true");
  lines.push("");

  // Stage 3: Test
  lines.push("    - name: test");
  lines.push("      description: Run test suite");
  lines.push("      depends_on: [install]");
  lines.push("      parallel_with: [lint]");
  lines.push("      commands:");
  if (testFrameworks.length > 0) {
    lines.push(`        - ${pm === "pnpm" ? "pnpm" : "npx"} ${testFrameworks[0]} run`);
  } else {
    lines.push(`        - ${pm} test`);
  }
  lines.push("      coverage:");
  lines.push("        minimum: 80");
  lines.push("        report_format: lcov");
  lines.push("");

  // Stage 4: Build
  lines.push("    - name: build");
  lines.push("      description: Build production artifacts");
  lines.push("      depends_on: [lint, test]");
  lines.push("      commands:");
  lines.push(`        - ${pm === "pnpm" ? "pnpm -r" : pm} build`);
  lines.push("      artifacts:");
  lines.push("        paths: [dist/, build/]");
  lines.push("        retention: 30d");
  lines.push("");

  // Stage 5: Security
  lines.push("    - name: security_scan");
  lines.push("      description: Dependency vulnerability audit");
  lines.push("      depends_on: [install]");
  lines.push("      parallel_with: [lint, test]");
  lines.push("      commands:");
  lines.push(`        - ${pm} audit --audit-level=high`);
  lines.push("      allow_failure: true");
  lines.push("");

  // Stage 6: Deploy
  lines.push("    - name: deploy_staging");
  lines.push("      description: Deploy to staging environment");
  lines.push("      depends_on: [build]");
  lines.push("      trigger: branch:main");
  lines.push("      environment: staging");
  lines.push("      commands:");
  lines.push("        - echo \"Deploy to staging\"");
  lines.push("      rollback:");
  lines.push("        automatic: true");
  lines.push("        on_failure: revert_to_previous");
  lines.push("");

  lines.push("    - name: deploy_production");
  lines.push("      description: Deploy to production");
  lines.push("      depends_on: [deploy_staging]");
  lines.push("      trigger: manual");
  lines.push("      environment: production");
  lines.push("      approval_required: true");
  lines.push("      commands:");
  lines.push("        - echo \"Deploy to production\"");
  lines.push("      rollback:");
  lines.push("        automatic: false");
  lines.push("        runbook: \"See incident-template.md\"");
  lines.push("");

  lines.push("  notifications:");
  lines.push("    on_failure:");
  lines.push("      - channel: slack");
  lines.push("        message: \"Pipeline failed on {{branch}} — {{stage}}\"");
  lines.push("    on_success:");
  lines.push("      - channel: slack");
  lines.push("        message: \"{{branch}} deployed to {{environment}}\"");
  lines.push("");

  lines.push("  schedules:");
  lines.push("    - name: nightly_security");
  lines.push("      cron: \"0 2 * * *\"");
  lines.push("      stages: [install, security_scan]");
  lines.push("    - name: weekly_full");
  lines.push("      cron: \"0 4 * * 1\"");
  lines.push("      stages: [install, lint, test, build]");
  lines.push("");

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const ciFiles = findFiles(files, ["*.yml", "*.yaml", "*Dockerfile*", "*docker-compose*", "*Makefile*"]);
    if (ciFiles.length > 0) {
      lines.push("  # ─── Detected CI / Config Files ─────────────────────");
      lines.push("  source_files:");
      for (const cf of ciFiles.slice(0, 12)) {
        lines.push(`    - path: ${JSON.stringify(cf.path)}`);
        lines.push(`      lines: ${cf.content.split("\n").length}`);
      }
      lines.push("");
    }
  }

  return {
    path: "automation-pipeline.yaml",
    content: lines.join("\n"),
    content_type: "text/yaml",
    program: "superpowers",
    description: "Full CI/CD automation pipeline with stages, caching, security scanning, and deployment",
  };
}
