# Atlas — `search` as a standalone product

**Landing page:** `atlas.trustfabric.ai`
**Verdict:** Sellable after narrow work (Tier B)
**Ships:** 6 generated files

---

## The problem it closes

Nobody can hold a 500-file codebase in their head, and neither can a model with a finite context window. Both need a map before they can act.

Produces context-map.json, repo-profile.yaml and architecture-summary.md — the structural read everything else in the portfolio is built on.

## What ships today

Verified against the live generator registry (`listAvailableGenerators()`), not from documentation:

- `architecture-summary.md`
- `context-map.json`
- `dependency-hotspots.md`
- `repo-profile.yaml`
- `repo-run-stats.json`
- `symbol-index.json`

## Standalone verdict

Real output, but this is the hub's own input. Selling it standalone competes with giving it away as the on-ramp to everything else.

## Gap before this can be sold alone

Strategic, not technical: this is the best free tier we have. Charging for it would close the funnel that feeds every other program.

## Pricing thesis

Free. Deliberately. It is the demo that sells the rest.

## Relationship to the Iliad hub

Iliad stays the hub: one call, every program, for buyers who want the whole read.
Atlas is the same generators sold to a buyer who has one problem and does not
want the other nineteen. The hub keeps bundle economics; the spoke gets a landing
page, a price and a name someone can search for.

Nothing here forks the generators. A spoke that drifts from the hub's output is a
bug, not a product decision.
