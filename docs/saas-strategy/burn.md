# Burn — `optimization` as a standalone product

**Landing page:** `burn.trustfabric.ai`
**Verdict:** Not sellable standalone yet (Tier C)
**Ships:** 4 generated files

---

## The problem it closes

Nobody knows what their agent stack costs until the invoice arrives, and by then the wasteful prompt has run ten thousand times.

Produces a cost estimate, a token-budget plan, optimization rules and a prompt-diff report.

## What ships today

Verified against the live generator registry (`listAvailableGenerators()`), not from documentation:

- `cost-estimate.json`
- `optimization-rules.md`
- `prompt-diff-report.md`
- `token-budget-plan.md`

## Standalone verdict

Not sellable yet, but the closest of the Tier C programs to viable — cost-estimate.json is real and the problem is genuinely urgent and growing.

## Gap before this can be sold alone

Estimates are static. Real cost tooling reads live usage from provider APIs and shows actual spend. Ours reasons about code and guesses.

## Pricing thesis

$29/mo IF wired to live provider usage. Zero until then.

## Relationship to the Iliad hub

Iliad stays the hub: one call, every program, for buyers who want the whole read.
Burn is the same generators sold to a buyer who has one problem and does not
want the other nineteen. The hub keeps bundle economics; the spoke gets a landing
page, a price and a name someone can search for.

Nothing here forks the generators. A spoke that drifts from the hub's output is a
bug, not a product decision.
