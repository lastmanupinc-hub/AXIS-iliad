# Grain — `frontend` as a standalone product

**Landing page:** `grain.trustfabric.ai`
**Verdict:** Not sellable standalone yet (Tier C)
**Ships:** 4 generated files

---

## The problem it closes

UI drifts. Six developers produce six spacing scales, four button variants and three ideas about what 'primary' means, and nobody notices until it is expensive.

Audits the existing UI and writes down the conventions it finds — frontend-rules.md, component-guidelines.md, layout-patterns.md, ui-audit.md.

## What ships today

Verified against the live generator registry (`listAvailableGenerators()`), not from documentation:

- `component-guidelines.md`
- `frontend-rules.md`
- `layout-patterns.md`
- `ui-audit.md`

## Standalone verdict

NOT sellable standalone as specified, and this is the one to read carefully given the v0 comparison. All four outputs are markdown. v0 generates working UI; Grain generates a document describing your UI. Those are different products and the market will not confuse them in our favour.

## Gap before this can be sold alone

The whole product. To compete anywhere near v0 this must emit components, not commentary — and Embed (artifacts) already does that better. Either merge Grain into Embed, or give it a real generator.

## Pricing thesis

Not sellable at any price in current form.

## Relationship to the Iliad hub

Iliad stays the hub: one call, every program, for buyers who want the whole read.
Grain is the same generators sold to a buyer who has one problem and does not
want the other nineteen. The hub keeps bundle economics; the spoke gets a landing
page, a price and a name someone can search for.

Nothing here forks the generators. A spoke that drifts from the hub's output is a
bug, not a product decision.
