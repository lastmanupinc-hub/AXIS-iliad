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

Embed 4 detected conventions as system-level constraints in every code generation prompt.

### Dependency Awareness

Reference package.json in prompts to constrain imports to the 27 actual dependencies. Prevents hallucinated package references.

### Architecture Alignment

Reference 2 detected patterns (separation score: 0.65/100) in architectural prompts to maintain layer boundaries.

### Route Awareness

Include route map (497 routes) in prompts when working on API or page code to prevent duplicate endpoints.

## Token Budget Guidance

Estimated full-project tokens: ~596,444

**Selective context required.** Use this priority order:
1. Active file being modified
2. Direct imports / dependencies (1 hop)
3. Dependency hotspots from optimization-rules.md
4. Type definitions and interfaces
5. Test files (for TDD context)

## Source-Verified Entry Points

| File | Lines | Exports |
|------|-------|---------|
| `apps/api/src/server.ts` | 458 | export const app = ... |
| `apps/web/src/App.tsx` | 490 | export function App() { ... } |
| `apps/web/src/main.tsx` | 11 | default |
| `packages/context-engine/src/index.ts` | 3 | export type { ... }, export { ... } |
| `packages/generator-core/src/index.ts` | 40 | export type { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export { ... }, export type { ... }, export { ... } |
| `packages/mpp/src/index.ts` | 325 | export type ChargeOptions = ..., export type MppResult = ..., export interface AgentBudget { ... }, export interface PricingTier { ... }, export interface Build402Options { ... }, export const PRICING_TIERS: Record<string, PricingTier> = ..., export const LEGACY_TOOL_ALIASES: Record<string, string> = ..., export function getPricingTier(tool: string): PricingTier { ... }, export function negotiatePrice(, export function build402NegotiationBody(, export function parseAgentBudget(req: IncomingMessage): AgentBudget | undefined { ... }, export function resolveAgentMode(req: IncomingMessage): "standard" | "lite" { ... } |
