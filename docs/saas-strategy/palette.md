# Palette — `theme` as a standalone product

**Landing page:** `palette.trustfabric.ai`
**Verdict:** Sellable now (Tier A)
**Ships:** 5 generated files

---

## The problem it closes

Design tokens drift from the code that uses them. The Figma file says one thing, theme.css says another, and dark mode was bolted on afterwards by someone who has left.

Extracts design-tokens.json, theme.css, dark-mode-tokens.json and a component-theme map from the actual stylesheets.

## What ships today

Verified against the live generator registry (`listAvailableGenerators()`), not from documentation:

- `component-theme-map.json`
- `dark-mode-tokens.json`
- `design-tokens.json`
- `theme-guidelines.md`
- `theme.css`

## Standalone verdict

Sellable. 4 of 5 outputs are directly consumable, and theme.css can be dropped straight into a build.

## Gap before this can be sold alone

No Figma or design-tool round-trip. Tokens flow out of code but never back in, so the drift this fixes will re-open.

## Pricing thesis

$19/mo. Sits naturally alongside Grain (frontend) as a design-system bundle.

## Relationship to the Iliad hub

Iliad stays the hub: one call, every program, for buyers who want the whole read.
Palette is the same generators sold to a buyer who has one problem and does not
want the other nineteen. The hub keeps bundle economics; the spoke gets a landing
page, a price and a name someone can search for.

Nothing here forks the generators. A spoke that drifts from the hub's output is a
bug, not a product decision.
