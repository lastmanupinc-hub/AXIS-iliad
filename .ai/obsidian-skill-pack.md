# Obsidian Skill Pack — axis-toolbox

> Vault workflows, templates, and prompt snippets for a monorepo project

## Project Overview

axis-toolbox is a monorepo built with TypeScript using React. It contains 432 files across 20 top-level directories. It defines 131 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Daily Note Template

```markdown
# {{date:YYYY-MM-DD}} — Dev Log

## Focus
- [ ] Primary task:
- [ ] Secondary task:

## Decisions
- 

## Blockers
- 

## Notes
- 

## axis-toolbox Changes
- Files modified:
- Tests added/changed:
- Commit:
```

## ADR Template

```markdown
# ADR-NNN: [Title]

## Status
[Proposed | Accepted | Deprecated | Superseded]

## Context
[What is the issue that we're seeing that is motivating this decision?]

## Decision
[What is the change that we're proposing and/or doing?]

## Consequences
[What becomes easier or harder as a result?]

## References
- Project: [[axis-toolbox]]
- Related ADRs:
```

## Prompt Snippets

Reusable AI prompt fragments for this project context:

### Project Context Preamble
```
I'm working on axis-toolbox, a monorepo built with TypeScript.
Stack: React.
Conventions: TypeScript strict mode; pnpm workspaces.
```

### Code Review Prompt
```
Review this code change for:
1. Correctness — does it do what it claims?
2. Edge cases — what inputs would break it?
3. Conventions — does it match the project style?
4. Tests — what test cases are missing?
```

### Bug Investigation Prompt
```
In axis-toolbox (TypeScript), I'm seeing [describe bug].
Steps to reproduce: [steps]
Expected: [expected behavior]
Actual: [actual behavior]
Help me trace this from the entry point to the failure.
```

### Domain Model Prompt
```
I'm working with the following domain models in axis-toolbox:
- AuthContext (interface, 3 fields) — defined in apps/api/src/billing.ts
- EnvSpec (interface, 5 fields) — defined in apps/api/src/env.ts
- ValidationError (interface, 2 fields) — defined in apps/api/src/env.ts
- ValidationResult (interface, 3 fields) — defined in apps/api/src/env.ts
- ZipEntry (interface, 4 fields) — defined in apps/api/src/export.ts
- HistogramEntry (interface, 3 fields) — defined in apps/api/src/metrics.ts
- OpenApiSpec (interface, 6 fields) — defined in apps/api/src/openapi.ts
- WindowEntry (interface, 2 fields) — defined in apps/api/src/rate-limiter.ts
  ... and 123 more

When generating code that uses these types, import from their source files and
do not redefine them.
```

## Recommended Vault Structure

```
vault/
├── Projects/
│   └── axis-toolbox/
│       ├── Overview.md
│       ├── Architecture.md
│       ├── ADRs/
│       ├── Meeting Notes/
│       └── Retrospectives/
├── Daily Notes/
├── Templates/
│   ├── Daily Note.md
│   ├── ADR.md
│   └── Bug Report.md
├── Prompts/
│   ├── Context Preamble.md
│   ├── Code Review.md
│   └── Bug Investigation.md
└── References/
```

## Detected Config Files for Vault Import

- `apps/api/package.json`
- `apps/api/tsconfig.json`
- `apps/cli/package.json`
- `apps/cli/tsconfig.json`
- `apps/web/package.json`
- `apps/web/tsconfig.json`
