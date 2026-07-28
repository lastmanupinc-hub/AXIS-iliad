# Poster — `canvas` as a standalone product

**Landing page:** `poster.trustfabric.ai`
**Verdict:** Not sellable standalone yet (Tier C)
**Ships:** 5 generated files

---

## The problem it closes

Architecture diagrams are drawn once, go stale immediately, and are never redrawn because the tool is painful.

Generates a canvas spec, social pack and poster layouts from the architecture read.

## What ships today

Verified against the live generator registry (`listAvailableGenerators()`), not from documentation:

- `asset-guidelines.md`
- `brand-board.md`
- `canvas-spec.json`
- `poster-layouts.md`
- `social-pack.md`

## Standalone verdict

Not sellable standalone. 1 of 5 outputs is structured, and diagram-from-code is a solved space (Mermaid, Structurizr, Excalidraw).

## Gap before this can be sold alone

We emit a spec rather than an image. The last mile — actually rendering something you can put in a README — is missing.

## Pricing thesis

Bundle with Atlas as visual output for the architecture read.

## Relationship to the Iliad hub

Iliad stays the hub: one call, every program, for buyers who want the whole read.
Poster is the same generators sold to a buyer who has one problem and does not
want the other nineteen. The hub keeps bundle economics; the spoke gets a landing
page, a price and a name someone can search for.

Nothing here forks the generators. A spoke that drifts from the hub's output is a
bug, not a product decision.
