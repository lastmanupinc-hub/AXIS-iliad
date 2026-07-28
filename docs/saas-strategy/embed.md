# Embed — `artifacts` as a standalone product

**Landing page:** `embed.trustfabric.ai`
**Verdict:** Sellable now (Tier A)
**Ships:** 11 generated files

---

## The problem it closes

Turning an internal capability into something another team can drop into their page means writing a component, a widget and an embed snippet — three times, by hand, for every capability.

11 generators emitting generated-component.tsx, dashboard-widget.tsx and embed-snippet.ts against the detected domain models.

## What ships today

Verified against the live generator registry (`listAvailableGenerators()`), not from documentation:

- `artifact-spec.md`
- `capability-map.yaml`
- `component-library.json`
- `context.md`
- `dashboard-widget.tsx`
- `design.md`
- `embed-snippet.ts`
- `generated-component.tsx`
- `index.html`
- `prd.md`
- `tasks.md`

## Standalone verdict

Sellable, with the caveat that generated components need review before use. 5 of 11 outputs are real code.

## Gap before this can be sold alone

React only. A Vue or Svelte shop gets nothing, which caps the market at maybe half the frontend world.

## Pricing thesis

$29/mo.

## Relationship to the Iliad hub

Iliad stays the hub: one call, every program, for buyers who want the whole read.
Embed is the same generators sold to a buyer who has one problem and does not
want the other nineteen. The hub keeps bundle economics; the spoke gets a landing
page, a price and a name someone can search for.

Nothing here forks the generators. A spoke that drifts from the hub's output is a
bug, not a product decision.
