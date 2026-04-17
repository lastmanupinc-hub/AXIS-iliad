# Template Pack — axis-iliad

Generated: 2026-04-17T13:25:43.236Z

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 16 top-level directories. It defines 163 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

Obsidian note templates for consistent knowledge capture.

## Template: Decision Record

```markdown
---
type: decision
project: axis-iliad
date: {{date}}
status: proposed | accepted | deprecated
---
# Decision: {{title}}

## Context
What is the issue we're deciding on?

## Options Considered
1. Option A — description, pros, cons
2. Option B — description, pros, cons

## Decision
What we decided and why.

## Consequences
What changes as a result of this decision.

## Related
- [[architecture-summary]]
- [[]]
```

## Template: Meeting Notes

```markdown
---
type: meeting
project: axis-iliad
date: {{date}}
attendees: 
---
# Meeting: {{title}}

## Agenda
- 

## Notes
- 

## Action Items
- [ ] Item — @owner — due: 

## Decisions Made
- See [[decision-record-{{date}}]]
```

## Template: Bug Investigation

```markdown
---
type: investigation
project: axis-iliad
date: {{date}}
severity: low | medium | high | critical
status: investigating | root-caused | resolved
---
# Bug: {{title}}

## Symptoms
What was observed?

## Reproduction Steps
1. 

## Root Cause
See [[root-cause-checklist]] for systematic analysis.

## Fix
What was changed and why.

## Prevention
- [ ] Regression test added
- [ ] Monitoring updated
```

## Template: Technical Concept

```markdown
---
type: concept
project: axis-iliad
tags: ["apps/ (monorepo_apps)", "packages/ (monorepo_packages)", "payment-processing-output/ (project_directory)"]
---
# {{title}}

## Definition
One-paragraph explanation of this concept.

## In This Project
How this concept applies specifically to axis-iliad.

## Related Concepts
- [[]]

## Code References
- `path/to/file.ts` — description
```

## Template: Sprint Retrospective

```markdown
---
type: retrospective
project: axis-iliad
date: {{date}}
sprint: 
---
# Retro: Sprint {{sprint}}

## What Went Well
- 

## What Could Improve
- 

## Action Items
- [ ] 

## Metrics
| Metric | Target | Actual |
|--------|--------|--------|
| Velocity | | |
| Bugs Fixed | | |
| Tests Added | | |
```

## Source File Summary

Total source files: 500
Config files: apps/api/package.json, apps/api/tsconfig.json, apps/cli/package.json, apps/cli/tsconfig.json, apps/web/package.json, apps/web/tsconfig.json, apps/web/vite.config.ts, package.json, packages/context-engine/package.json, packages/context-engine/tsconfig.json, packages/generator-core/package.json, packages/generator-core/tsconfig.json, packages/repo-parser/package.json, packages/repo-parser/tsconfig.json, packages/sdk/package.json, packages/sdk/tsconfig.json, packages/snapshots/package.json, packages/snapshots/tsconfig.json
