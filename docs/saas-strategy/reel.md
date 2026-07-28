# Reel — `remotion` as a standalone product

**Landing page:** `reel.trustfabric.ai`
**Verdict:** Sellable after narrow work (Tier B)
**Ships:** 5 generated files

---

## The problem it closes

Developer-facing video — release notes, feature demos, changelog reels — needs a motion designer nobody has budget for, so it does not get made.

Generates remotion-script.ts, a scene plan and render config from the repo's own changelog and feature surface.

## What ships today

Verified against the live generator registry (`listAvailableGenerators()`), not from documentation:

- `asset-checklist.md`
- `remotion-script.ts`
- `render-config.json`
- `scene-plan.md`
- `storyboard.md`

## Standalone verdict

Real code output, genuinely novel, but a narrow market. Remotion users are a small slice of a small slice.

## Gap before this can be sold alone

Requires the buyer to already use Remotion. No fallback for teams that want video without adopting a React video framework.

## Pricing thesis

$29/mo, niche. Consider folding into Marketing rather than standing alone.

## Relationship to the Iliad hub

Iliad stays the hub: one call, every program, for buyers who want the whole read.
Reel is the same generators sold to a buyer who has one problem and does not
want the other nineteen. The hub keeps bundle economics; the spoke gets a landing
page, a price and a name someone can search for.

Nothing here forks the generators. A spoke that drifts from the hub's output is a
bug, not a product decision.
