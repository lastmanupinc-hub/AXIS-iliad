import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { GeneratedFile } from "./types.js";
import { hasFw, getFw } from "./fw-helpers.js";

// ─── superpower-pack.md ─────────────────────────────────────────

export function generateSuperpowerPack(ctx: ContextMap): GeneratedFile {
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

  return {
    path: "superpower-pack.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "superpowers",
    description: "High-leverage development workflows, quick actions, and planning templates",
  };
}

// ─── workflow-registry.json ─────────────────────────────────────

export function generateWorkflowRegistry(ctx: ContextMap, profile: RepoProfile): GeneratedFile {
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
    generated_at: new Date().toISOString(),
    total_workflows: workflows.length,
    workflows,
  };

  return {
    path: "workflow-registry.json",
    content: JSON.stringify(registry, null, 2),
    content_type: "application/json",
    program: "superpowers",
    description: "Registry of reusable development workflows with steps and triggers",
  };
}

// ─── test-generation-rules.md ───────────────────────────────────

export function generateTestGenerationRules(ctx: ContextMap): GeneratedFile {
  const id = ctx.project_identity;
  const testFws = ctx.detection.test_frameworks;
  const frameworks = ctx.detection.frameworks.map(f => f.name);
  const lines: string[] = [];

  lines.push(`# Test Generation Rules — ${id.name}`);
  lines.push("");
  lines.push(`> Testing conventions and generation rules for a ${id.type.replace(/_/g, " ")}`);
  lines.push("");

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
  if (testFws.includes("vitest") || testFws.includes("jest")) {
    lines.push("```typescript");
    lines.push("import { describe, it, expect } from 'vitest';");
    lines.push("");
    lines.push("describe('<ModuleName>', () => {");
    lines.push("  it('should <expected behavior> when <condition>', () => {");
    lines.push("    // Arrange");
    lines.push("    const input = makeTestInput();");
    lines.push("");
    lines.push("    // Act");
    lines.push("    const result = functionUnderTest(input);");
    lines.push("");
    lines.push("    // Assert");
    lines.push("    expect(result).toEqual(expected);");
    lines.push("  });");
    lines.push("});");
    lines.push("```");
  }
  lines.push("");

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

  return {
    path: "test-generation-rules.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "superpowers",
    description: "Testing conventions and rules for generating project-consistent tests",
  };
}

// ─── refactor-checklist.md ──────────────────────────────────────

export function generateRefactorChecklist(ctx: ContextMap): GeneratedFile {
  const id = ctx.project_identity;
  const hotspots = ctx.dependency_graph.hotspots;
  const lines: string[] = [];

  lines.push(`# Refactor Checklist — ${id.name}`);
  lines.push("");
  lines.push("> Systematic refactoring guide based on codebase analysis");
  lines.push("");

  // Risk Assessment
  lines.push("## Risk Assessment");
  lines.push("");
  if (hotspots.length > 0) {
    const highRisk = hotspots.filter(h => h.risk_score > 5);
    const medRisk = hotspots.filter(h => h.risk_score > 2 && h.risk_score <= 5);
    lines.push(`| Risk Level | Files | Action |`);
    lines.push(`|-----------|-------|--------|`);
    lines.push(`| High (>5.0) | ${highRisk.length} | Refactor with full test coverage first |`);
    lines.push(`| Medium (2-5) | ${medRisk.length} | Refactor when touching for features |`);
    lines.push(`| Low (<2) | ${hotspots.length - highRisk.length - medRisk.length} | Refactor opportunistically |`);
    lines.push("");

    if (highRisk.length > 0) {
      lines.push("### High-Risk Files");
      lines.push("");
      for (const h of highRisk.slice(0, 5)) {
        lines.push(`- **\`${h.path}\`** — risk ${h.risk_score.toFixed(1)} (${h.inbound_count} inbound, ${h.outbound_count} outbound)`);
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

  return {
    path: "refactor-checklist.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "superpowers",
    description: "Systematic refactoring guide based on dependency analysis and architecture signals",
  };
}

// ─── automation-pipeline.yaml ───────────────────────────────────

export function generateAutomationPipeline(ctx: ContextMap, profile: RepoProfile): GeneratedFile {
  const id = ctx.project_identity;
  const ci = ctx.detection.ci_platform;
  const buildTools = ctx.detection.build_tools;
  const testFrameworks = ctx.detection.test_frameworks;
  const pkgManagers = ctx.detection.package_managers;

  const lines: string[] = [];
  lines.push("# Automation Pipeline");
  lines.push(`# Project: ${id.name}`);
  lines.push(`# Generated: ${new Date().toISOString()}`);
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

  return {
    path: "automation-pipeline.yaml",
    content: lines.join("\n"),
    content_type: "text/yaml",
    program: "superpowers",
    description: "Full CI/CD automation pipeline with stages, caching, security scanning, and deployment",
  };
}
