# Linking Policy — axis-iliad

> Rules for how notes should be interconnected in the knowledge graph

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 16 top-level directories. It defines 242 domain models.

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

1. Every code note → `[[axis-iliad]]` (project hub)
2. Every ADR → the triggering note or issue
3. Every daily note → notes created or modified that day
4. Every bug report → the affected module or file note
5. Every meeting note → action items as linked notes

## Hub Notes

Maintain these high-connectivity notes as navigation anchors:

| Hub | Purpose | Minimum Links |
|-----|---------|--------------|
| `[[axis-iliad]]` | Project overview | 10+ |
| `[[Architecture]]` | System design | 5+ |
| `[[ADR Index]]` | Decision log | All ADRs |
| `[[Tech Stack]]` | Technology choices | All framework notes |

## Code-to-Vault Mapping

Map high-importance code files to vault notes for traceability:

| Code File | Risk | Vault Note |
|-----------|------|-----------|
| `apps/api/src/router.ts` | 1.0 | `[[Code/apps-api-src-router]]` |
| `apps/api/src/test-helpers.ts` | 1.0 | `[[Code/apps-api-src-test-helpers]]` |
| `apps/api/src/billing.ts` | 1.0 | `[[Code/apps-api-src-billing]]` |
| `apps/api/src/handlers.ts` | 1.0 | `[[Code/apps-api-src-handlers]]` |
| `apps/api/src/rate-limiter.ts` | 1.0 | `[[Code/apps-api-src-rate-limiter]]` |
| `apps/api/src/logger.ts` | 1.0 | `[[Code/apps-api-src-logger]]` |
| `apps/api/src/server.ts` | 1.0 | `[[Code/apps-api-src-server]]` |
| `apps/web/src/App.tsx` | 1.0 | `[[Code/apps-web-src-App]]` |

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


---

## ⟳ Continue the loop

- **You are here:** `linking-policy.md` — agent step 30 of 70.
- **Next:** `protocol-spec.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
