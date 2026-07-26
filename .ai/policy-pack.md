# Policy Pack — axis-iliad

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
  - convention: "Linter configured"
  - convention: "Formatter configured"
  - convention: "pnpm workspaces"
  - convention: "Makefile build"
```

## Policy: Boundary Enforcement

```yaml
id: boundary-enforcement
scope: architecture-layers
rules:
  - layer: presentation
    directories: [apps]
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

## Policy: Testing Requirements (recommended baseline)

```yaml
id: testing-requirements
scope: all-changes
recommended_rules:
  - new_code_requires_tests: true
  - bug_fixes_require_regression_tests: true
  - target_min_test_coverage: 80%   # a suggested target, not a measured value
  - avoid_skipped_tests_in_ci: true
  - test_frameworks: [vitest]
```

## Policy: Framework-Specific Rules

### React

- Use functional components with hooks only (no class components)
- Keep components small and pure; lift state deliberately
- No inline styles — use design tokens or your styling system

## Detected Project Configs

- `.prettierrc.json`
- `package.json`
- `tsconfig.base.json`
- `vitest.config.ts`
- `mcp/tsconfig.package.template.json`
- `mcp/tsconfig.root.template.json`
- `apps/api/package.json`
- `apps/api/tsconfig.json`
- *… 19 more config files*

## Config Contents

### `.prettierrc.json`

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100
}

```

### `package.json`

```json
{
  "name": "axis-iliad",
  "version": "0.5.3",
  "private": true,
  "type": "module",
  "description": "Axis' Iliad - one API call that turns any codebase into 142 deterministic AI-agent-ready artifacts (AGENTS.md, CLAUDE.md, design tokens, Visa CE 3.0 compliance kit, MCP configs, and more)",
  "keywords": [
    "ai",
    "agents",
    "mcp",
    "codebase-analysis",
    "artifact-generation",
    "agents-md",
    "claude-md",
    "cursorrules",
... (53 more lines)
```

### `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "noUnusedLocals": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "dist",
... (5 more lines)
```


---

## ⟳ Continue the loop

- **You are here:** `policy-pack.md` — agent step 53 of 71.
- **Next:** `model-cascade.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
