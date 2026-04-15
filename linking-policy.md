# Linking Policy — axis-toolbox

> Rules for how notes should be interconnected in the knowledge graph

## Project Overview

axis-toolbox is a monorepo built with TypeScript using React. It contains 550+ files across 17 top-level directories. It defines 128 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Link Types

| Link Type | Syntax | When to Use |
|----------|--------|-------------|
| Direct link | `[[Note Name]]` | Referencing a specific note |
| Aliased link | `[[Note Name\|display text]]` | When note name is long or context differs |
| Header link | `[[Note Name#Section]]` | Linking to a specific section |
| Embedded | `![[Note Name]]` | Including note content inline |
| External | `[text](url)` | Linking to external resources |

## Mandatory Links

These links are required to maintain graph integrity:

1. Every code note → `[[axis-toolbox]]` (project hub)
2. Every ADR → the triggering note or issue
3. Every daily note → notes created or modified that day
4. Every bug report → the affected module or file note
5. Every meeting note → action items as linked notes

## Hub Notes

Maintain these high-connectivity notes as navigation anchors:

| Hub | Purpose | Minimum Links |
|-----|---------|--------------|
| `[[axis-toolbox]]` | Project overview | 10+ |
| `[[Architecture]]` | System design | 5+ |
| `[[ADR Index]]` | Decision log | All ADRs |
| `[[Tech Stack]]` | Technology choices | All framework notes |

## Code-to-Vault Mapping

Map high-importance code files to vault notes for traceability:

| Code File | Risk | Vault Note |
|-----------|------|-----------|
| `apps/web/src/App.tsx` | 0.9 | `[[Code/apps-web-src-App]]` |
| `apps/web/src/api.ts` | 0.8 | `[[Code/apps-web-src-api]]` |
| `apps/web/src/pages.test.tsx` | 0.8 | `[[Code/apps-web-src-pages.test]]` |
| `apps/web/src/pages/DashboardPage.tsx` | 0.5 | `[[Code/apps-web-src-pages-DashboardPage]]` |
| `apps/web/src/components/Toast.tsx` | 0.2 | `[[Code/apps-web-src-components-Toast]]` |
| `apps/web/src/components/AxisIcons.tsx` | 0.2 | `[[Code/apps-web-src-components-AxisIcons]]` |
| `apps/web/src/upload-utils.ts` | 0.1 | `[[Code/apps-web-src-upload-utils]]` |

## Anti-Patterns

Avoid these linking mistakes:

- **Orphan notes** — Notes with zero incoming links are invisible in the graph
- **Over-linking** — Don't link every word; link concepts, decisions, and references
- **Dead links** — Regularly check for `[[broken links]]` and fix or create them
- **Circular-only links** — Two notes linking only to each other with no broader connections
- **Flat structure** — Relying only on folders instead of links for organization

## Graph Health Metrics

Track these metrics to ensure vault health:

| Metric | Target | Check Frequency |
|--------|--------|----------------|
| Orphan notes | < 10% of total | Weekly |
| Average links per note | > 3 | Monthly |
| Hub note connectivity | > 10 links | Monthly |
| Dead links | 0 | Weekly |
| Notes without tags | 0 | Weekly |

## Source Entry Points as Hub Note Candidates

- `apps/api/src/server.ts` → exports: export const app = ...
- `apps/web/src/App.tsx` → exports: export function App() { ... }
- `apps/web/src/main.tsx` → exports: default
- `packages/context-engine/src/index.ts` → exports: export type { ... }, export { ... }
- `packages/generator-core/src/index.ts` → exports: export type { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }
