# Prompt Diff Report — axis-iliad

> Before/after recommendations for prompt quality improvement

## Illustrative Prompt-Quality Projection

> These before/after figures are **illustrative targets** derived from repo signals (routes, architecture patterns, dependencies) — not measured prompt-quality scores. Use them as relative guidance for where context helps most, not as metrics.

| Dimension | Before (est.) | Target | Uplift |
|-----------|---------------|--------|--------|
| Context Precision | 30/100 | 60/100 | +30 |
| Convention Compliance | 40/100 | 90/100 | +50 |
| Dependency Awareness | 30/100 | 60/100 | +30 |
| Architecture Alignment | 40/100 | 85/100 | +45 |
| Route Awareness | 35/100 | 85/100 | +50 |
| _Average (illustrative)_ | 35/100 | 76/100 | +41 |

## Recommendations

### Context Precision

Use dependency hotspot analysis to select the 10 highest-signal files instead of including entire directories.

### Convention Compliance

Embed 5 detected conventions as system-level constraints in every code generation prompt.

### Dependency Awareness

Reference package.json in prompts to constrain imports to the 41 actual dependencies. Prevents hallucinated package references.

### Architecture Alignment

Reference 2 detected patterns (separation score: 64/100) in architectural prompts to maintain layer boundaries.

### Route Awareness

Include route map (591 routes) in prompts when working on API or page code to prevent duplicate endpoints.

## Token Budget Guidance

Estimated full-project tokens: ~489,623

**Selective context required.** Use this priority order:
1. Active file being modified
2. Direct imports / dependencies (1 hop)
3. Dependency hotspots from optimization-rules.md
4. Type definitions and interfaces
5. Test files (for TDD context)

## Source-Verified Entry Points

| File | Lines | Exports |
|------|-------|---------|
| `apps/api/src/server.ts` | 552 | export const router = ..., export const app = ... |
| `apps/web/src/App.tsx` | 716 | export function App() { ... } |
| `apps/web/src/main.tsx` | 12 | default |


---

## ⟳ Continue the loop

- **You are here:** `prompt-diff-report.md` — agent step 13 of 71.
- **Next:** `theme-guidelines.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
