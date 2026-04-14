# Policy Pack — axis-toolbox

AI governance policies for code generation, review, and compliance.

## Policy: Code Generation Rules

```yaml
id: code-generation
scope: all-ai-generated-code
rules:
  - language: TypeScript
  - strict_types: true
  - no_any_types: true
  - no_stub_implementations: true
  - no_placeholder_data: true
  - convention: "TypeScript strict mode"
  - convention: "pnpm workspaces"
```

## Policy: Boundary Enforcement

```yaml
id: boundary-enforcement
scope: architecture-layers
rules:
  - layer: presentation
    directories: [apps, frontend]
    allowed_imports: same-layer-or-below
```

## Policy: Security Baseline

```yaml
id: security-baseline
scope: all-code
rules:
  - no_hardcoded_secrets: true
  - no_eval: true
  - no_innerHTML: true
  - validate_all_inputs: true
  - parameterize_queries: true
  - use_env_vars_for_config: true
  - no_debug_logging_in_production: true
```

## Policy: Testing Requirements

```yaml
id: testing-requirements
scope: all-changes
rules:
  - new_code_requires_tests: true
  - bug_fixes_require_regression_tests: true
  - minimum_test_coverage: 80%
  - no_skipped_tests_in_ci: true
  - test_frameworks: [vitest]
```

## Policy: Known Warnings

These project-specific warnings must be addressed in all AI-generated code:

- ⚠️ No CI/CD pipeline detected
- ⚠️ No lockfile found — dependency versions may be inconsistent

## Policy: Framework-Specific Rules

### React

- Use functional components only
- Prefer server components where possible (Next.js App Router)
- No inline styles — use design tokens or Tailwind

## Detected Project Configs

- `apps/api/package.json`
- `apps/api/tsconfig.json`
- `apps/cli/package.json`
- `apps/cli/tsconfig.json`
- `apps/web/package.json`
- `apps/web/tsconfig.json`
- `apps/web/vite.config.ts`
- `package.json`

## Config Contents

### `apps/api/package.json`

```json
{
  "name": "@axis/api",
  "version": "0.4.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "node --test dist/**/*.test.js"
  },
  "dependencies": {
    "@axis/context-engine": "workspace:*",
    "@axis/generator-core": "workspace:*",
    "@axis/repo-parser": "workspace:*",
... (11 more lines)
```

### `apps/api/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}

```

### `apps/cli/package.json`

```json
{
  "name": "@axis/cli",
  "version": "0.4.0",
  "private": true,
  "type": "module",
  "bin": {
    "axis": "./bin/axis.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/cli.js"
  },
  "dependencies": {
    "@axis/snapshots": "workspace:*",
    "@axis/repo-parser": "workspace:*",
... (8 more lines)
```
