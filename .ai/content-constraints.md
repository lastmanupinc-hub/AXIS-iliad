# Content Constraints — axis-iliad

> Enforceable rules for AI-generated and human-written content

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 16 top-level directories. It defines 242 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Hard Constraints (Never Violate)

1. **No hallucinated features.** Only reference capabilities that exist in the codebase.
2. **No version mismatches.** When referencing a dependency, use the version from package.json.
3. **No broken code examples.** Every code snippet must compile/run against the current project.
4. **No external URLs** unless verified reachable. Link to docs, not blog posts.
5. **No placeholder text** in shipped content. "Lorem ipsum", "TODO", and "TBD" are defects.
6. **Snake_case for data, kebab-case for URLs, PascalCase for components.**

## Soft Constraints (Prefer Unless Explicitly Overridden)

1. Prefer active voice over passive
2. Prefer present tense ("generates" not "will generate")
3. Prefer specific numbers over vague quantities ("8 files" not "several files")
4. Prefer short sentences (under 25 words)
5. Prefer bullet lists over dense paragraphs for multi-point content
6. One idea per paragraph

## AI Content Generation Constraints

When using AI to generate content for this project:

1. Always include project name and type in the system prompt
2. Reference the detected tech stack to prevent framework confusion
3. Include these constraints as system-level rules in every generation prompt
4. Validate generated code against the project's TypeScript/lint config
5. Strip marketing language ("revolutionary", "cutting-edge", "game-changing")
6. Never generate content that implies features the project doesn't have

## Project-Specific Conventions

Detected from codebase analysis — enforce in all generated content:

- TypeScript strict mode
- Linter configured
- Formatter configured
- Makefile build

## Controlled Terminology

| Use This | Not This | Reason |
|----------|----------|--------|
| snapshot | upload, submission | Canonical term for project input |
| context map | analysis, scan | Canonical term for parsed output |
| generator | creator, builder | Canonical term for output producers |
| program | feature, module, tool | Product-level unit |
| project | repo, codebase | User's input concept |
| output file | artifact, result | What generators produce |

## Formatting Standards

- Markdown: ATX headings (`#`), fenced code blocks with language tags
- JSON: 2-space indent, trailing newline
- YAML: 2-space indent, no trailing spaces
- Code: Follow project's ESLint/Prettier config
- File names: kebab-case for outputs, PascalCase for components

## Detected Formatting Configs

- `.prettierrc.json`
- `apps/api/package.json`
- `apps/api/tsconfig.json`
- `apps/cli/package.json`
- `apps/cli/tsconfig.json`

## Detected Content Violations (deterministic)

> Static scan of the repo's docs (`*.md`, README/CONTRIBUTING/CHANGELOG) against the rules above — grep + a fixed table, **no AI**. Fenced code blocks are skipped. `PLACEHOLDER` = a shipped placeholder/marker (a hard-constraint defect); `MARKETING` = fluff to strip; `DISMISSIVE` = "simple/effortless/just …" (a Forbidden Pattern).

| Class | Count |
|-------|-------|
| PLACEHOLDER | 1 |
| MARKETING | 3 |
| DISMISSIVE | 2 |

| File | Line | Term | Class |
|------|------|------|-------|
| `TERMS_OF_SERVICE.md` | 125 | PLACEHOLDER | PLACEHOLDER |
| `AXIS_DEMO_REPORT.md` | 89 | revolutionary | MARKETING |
| `launch-content.md` | 101 | seamlessly | MARKETING |
| `launch-content.md` | 161 | seamless | MARKETING |
| `HARDENING_AUDIT.md` | 30 | simple | DISMISSIVE |
| `docs/MERCHANT_INTEGRATION_DOGFOODING.md` | 76 | simple | DISMISSIVE |


---

## ⟳ Continue the loop

- **You are here:** `content-constraints.md` — agent step 17 of 70.
- **Next:** `superpower-pack.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
