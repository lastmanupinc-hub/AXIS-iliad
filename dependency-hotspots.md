# AXIS Toolbox — Dependency Hotspots

## Ranked Hotspot Index

| Rank | File/Module | Hotspot Score | Risk | Why |
|------|------------|---------------|------|-----|
| 1 | `packages/generator-core/` | 9.5 | Critical | All 87 generators depend on this engine. Template change = 18 programs affected |
| 2 | `apps/api/src/handlers.ts` | 9.0 | Critical | 102 endpoint handlers in single file. Every API feature change touches this |
| 3 | `packages/snapshots/src/store.ts` | 8.5 | Critical | SQLite persistence — all data reads/writes flow through here |
| 4 | `continuation.yaml` | 8.0 | High | Ground truth for all session state. Every session reads AND writes |
| 5 | `axis_all_tools.yaml` | 7.5 | High | Golden source for all 18 program specs. Adding/changing any program starts here |
| 6 | `packages/repo-parser/src/parser.ts` | 7.0 | High | 60+ language detection rules. All snapshot intake depends on correct parsing |
| 7 | `packages/context-engine/src/context-map.ts` | 6.5 | High | Context graph builder — all generators consume its output |
| 8 | `begin.yaml` | 6.0 | Medium | Session gate + optimization policy. Changes affect all development behavior |
| 9 | `apps/web/src/App.tsx` | 5.5 | Medium | SPA entry point. All UI features route through here |
| 10 | `automated_remedial_action.yaml` | 5.0 | Medium | Self-audit loop — governs remediation priority for entire project |

## Coupling Map

```
                    ┌─────────────────────┐
                    │  axis_all_tools.yaml │ (program definitions)
                    └────────┬────────────┘
                             │ defines
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                   ▼
┌──────────────────┐  ┌──────────────┐  ┌──────────────────┐
│ generator-core   │  │ apps/api     │  │ apps/web         │
│ (80 generators)  │  │ (endpoints)  │  │ (UI surfaces)    │
└────────┬─────────┘  └──────┬───────┘  └──────────────────┘
         │ reads              │ queries
         ▼                    ▼
┌──────────────────┐  ┌──────────────┐
│ context-engine   │  │ snapshots    │
│ (context graph)  │→ │ (SQLite)     │
└────────┬─────────┘  └──────────────┘
         │ parses from
         ▼
┌──────────────────┐
│ repo-parser      │
│ (lang detection) │
└──────────────────┘
```

## Change Frequency Risk Matrix

| Component | Change Frequency | Coupling Breadth | Risk = Freq × Breadth |
|-----------|-----------------|------------------|----------------------|
| generator-core | High (new generators, template changes) | 17 programs × 80 generators | **Critical** |
| handlers.ts | High (new endpoints per feature) | 75+ routes | **Critical** |
| store.ts | Medium (schema changes) | All data consumers | **High** |
| continuation.yaml | Very High (every session) | Session continuity | **High** |
| repo-parser | Medium (new languages/frameworks) | All snapshot intake | **High** |
| context-engine | Low-Medium (architecture stable) | All generators | **Medium** |
| begin.yaml | Low (policy rarely changes) | Development methodology | **Medium** |
| apps/web | Medium (UI features) | User-facing only | **Medium** |
| render.yaml | Very Low (deployment stable) | Production infra | **Low** |
| capability_inventory | Low (grade changes only) | Audit/tracking | **Low** |

## Architectural Risks

### 1. handlers.ts Monolith
102 endpoint handlers in a single file. High cognitive load, merge conflict risk, and difficulty in isolating endpoint-specific tests. **Recommendation**: Split into route-grouped handler modules (auth, billing, program endpoints, admin, webhooks).

### 2. Generator-Core Single Point
All 87 generators pass through one template engine. A regression in the engine affects all 18 programs simultaneously. **Recommendation**: Per-program integration tests that validate output structure.

### 3. SQLite Single-Writer
WAL mode helps reads but writes are still serialized. Under load, snapshot ingestion could bottleneck. **Recommendation**: Acceptable for current scale (single instance on Render). Monitor write latency as usage grows.

### 4. YAML Governance Coupling
12 YAML files with cross-references create a knowledge graph that only works if read in the right order (begin → continuation → axis_all_tools). **Recommendation**: Document the read order in a single index file. The begin.yaml `required_read_order` partially addresses this.
