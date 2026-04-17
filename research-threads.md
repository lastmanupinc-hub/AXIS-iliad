# Research Threads — axis-iliad

> Open research questions and investigation threads for the codebase

## Architecture Threads

### Thread 1: Architectural Fitness (Score: 0.65/10)

Architecture separation is low. Research focus:
- Should modular boundaries be introduced?
- What is the minimum viable modularization that reduces coupling?

Detected patterns: monorepo, containerized

### Thread 2: Dependency Hotspots

High-risk files that warrant investigation:

- **`apps/web/src/App.tsx`** — risk 0.9
  - Question: Is this file doing too many things? Can responsibilities be split?
- **`apps/web/src/api.ts`** — risk 0.8
  - Question: Is this file doing too many things? Can responsibilities be split?
- **`apps/web/src/pages.test.tsx`** — risk 0.8
  - Question: Is this file doing too many things? Can responsibilities be split?
- **`apps/web/src/pages/DashboardPage.tsx`** — risk 0.6
  - Question: Is this file doing too many things? Can responsibilities be split?
- **`apps/web/src/components/Toast.tsx`** — risk 0.2
  - Question: Is this file doing too many things? Can responsibilities be split?

### Thread 3: Technology Choices

Open questions about the current technology stack:

- Are the chosen frameworks (React) still the best fit for the project's direction?
- Are there dependencies that could be removed or replaced with lighter alternatives?
- External dependency count: 26 — is this sustainable?

### Thread 4: Performance

Investigation areas:

- What is the baseline performance metric for axis-iliad?
- Are there obvious bottlenecks in the critical path?
- Which of the 473 routes are most latency-sensitive?
- What caching strategies would have the highest impact?

### Thread 5: Test Coverage

Test framework: vitest

Open questions:
- What is the current test coverage percentage?
- Which modules have zero test coverage?
- Are integration tests covering the critical user paths?

## Future Direction Threads

### Known Issues to Investigate

- No lockfile found — dependency versions may be inconsistent

### Domain Model Complexity

The project defines **163 domain models**. High field-count models may need documentation or decomposition:

- **`ProgramDoc`** — interface, 13 fields (`apps/web/src/pages/DocsPage.tsx`)
- **`ParseResult`** — interface, 13 fields (`packages/repo-parser/src/types.ts`)
- **`RepoProfile`** — interface, 12 fields (`packages/context-engine/src/types.ts`)
- **`StripeSubscription`** — interface, 12 fields (`packages/snapshots/src/stripe-store.ts`)
- **`SubscriptionInfo`** — interface, 11 fields (`apps/web/src/api.ts`)

Questions to answer:
- Are all field names self-documenting? Do any need JSDoc?
- Are there models that could be split into sub-types?
- Do models with zero fields represent empty interfaces or placeholders?

### Scaling Questions

- What is the current bottleneck for scaling?
- What would change if usage grew 10x?
- Is the monorepo architecture suited for the next 6 months of growth?

## Source-Based Threads

### Thread 6: Entry Point Complexity

Entry points to investigate for complexity and coupling:

- **`apps/api/src/server.ts`** — 432 lines, exports: export const app = ...
- **`apps/web/src/App.tsx`** — 326 lines, exports: export function App() { ... }
- **`apps/web/src/main.tsx`** — 11 lines, exports: default
- **`packages/context-engine/src/index.ts`** — 3 lines, exports: export type { ... }, export { ... }
- **`packages/generator-core/src/index.ts`** — 21 lines, exports: export type { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }
