# Research Threads — axis-iliad

> Open research questions and investigation threads for the codebase

## Architecture Threads

### Thread 1: Architectural Fitness (Score: 0.64 / 1.0)

Architecture separation is moderate. Research focus:
- Which layer boundaries are weakest?
- What refactoring would yield the highest separation improvement?

Detected patterns: monorepo, containerized

### Thread 2: Dependency Hotspots

High-risk files that warrant investigation:

- **`apps/api/src/router.ts`** — risk 1.0
  - Question: Is this file doing too many things? Can responsibilities be split?
- **`apps/api/src/test-helpers.ts`** — risk 1.0
  - Question: Is this file doing too many things? Can responsibilities be split?
- **`apps/api/src/billing.ts`** — risk 1.0
  - Question: Is this file doing too many things? Can responsibilities be split?
- **`apps/api/src/handlers.ts`** — risk 1.0
  - Question: Is this file doing too many things? Can responsibilities be split?
- **`apps/api/src/rate-limiter.ts`** — risk 1.0
  - Question: Is this file doing too many things? Can responsibilities be split?

### Thread 3: Technology Choices

Open questions about the current technology stack:

- Are the chosen frameworks (React) still the best fit for the project's direction?
- Are there dependencies that could be removed or replaced with lighter alternatives?
- External dependency count: 41 — is this sustainable?

### Thread 4: Performance

Investigation areas:

- What is the baseline performance metric for axis-iliad?
- Are there obvious bottlenecks in the critical path?
- Which of the 174 routes are most latency-sensitive?
- What caching strategies would have the highest impact?

### Thread 5: Test Coverage

Test framework: vitest

Open questions:
- What is the current test coverage percentage?
- Which modules have zero test coverage?
- Are integration tests covering the critical user paths?

## Future Direction Threads

### Domain Model Complexity

The project defines **278 domain models**. High field-count models may need documentation or decomposition:

- **`ContextMap`** — interface, 61 fields (`apps/web/src/api.ts`)
- **`AdminRevenue`** — interface, 29 fields (`apps/web/src/api.ts`)
- **`RepoProfile`** — interface, 26 fields (`apps/web/src/api.ts`)
- **`AnalyzeQuickResponse`** — interface, 24 fields (`apps/web/src/api.ts`)
- **`RouteContext`** — interface, 24 fields (`apps/web/src/routes.tsx`)

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

- **`apps/api/src/server.ts`** — 552 lines, exports: export const router = ..., export const app = ...
- **`apps/web/src/App.tsx`** — 716 lines, exports: export function App() { ... }
- **`apps/web/src/main.tsx`** — 12 lines, exports: (no exports)


---

## ⟳ Continue the loop

- **You are here:** `research-threads.md` — agent step 27 of 71.
- **Next:** `obsidian-skill-pack.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
