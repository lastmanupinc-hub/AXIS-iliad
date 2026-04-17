# Prompt Diff Report — axis-iliad

> Before/after recommendations for prompt quality improvement

## Score Summary

| Dimension | Before | After | Delta |
|-----------|--------|-------|-------|
| Context Precision | 30/100 | 60/100 | +30 |
| Convention Compliance | 40/100 | 90/100 | +50 |
| Dependency Awareness | 30/100 | 60/100 | +30 |
| Architecture Alignment | 40/100 | 85/100 | +45 |
| Route Awareness | 35/100 | 85/100 | +50 |
| **Overall** | **35/100** | **76/100** | **+41** |

## Recommendations

### Context Precision

Use dependency hotspot analysis to select the 7 highest-signal files instead of including entire directories.

### Convention Compliance

Embed 1 detected conventions as system-level constraints in every code generation prompt.

### Dependency Awareness

Reference package.json in prompts to constrain imports to the 26 actual dependencies. Prevents hallucinated package references.

### Architecture Alignment

Reference 2 detected patterns (separation score: 0.65/100) in architectural prompts to maintain layer boundaries.

### Route Awareness

Include route map (473 routes) in prompts when working on API or page code to prevent duplicate endpoints.

## Token Budget Guidance

Estimated full-project tokens: ~556,520

**Selective context required.** Use this priority order:
1. Active file being modified
2. Direct imports / dependencies (1 hop)
3. Dependency hotspots from optimization-rules.md
4. Type definitions and interfaces
5. Test files (for TDD context)

## Source-Verified Entry Points

| File | Lines | Exports |
|------|-------|---------|
| `apps/api/src/server.ts` | 432 | export const app = ... |
| `apps/web/src/App.tsx` | 326 | export function App() { ... } |
| `apps/web/src/main.tsx` | 11 | default |
| `packages/context-engine/src/index.ts` | 3 | export type { ... }, export { ... } |
| `packages/generator-core/src/index.ts` | 21 | export type { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... } |
| `packages/repo-parser/src/index.ts` | 10 | export type { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export type { ... }, export { ... }, export type { ... } |
