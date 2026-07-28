# Onboard — `skills` as a standalone product

**Landing page:** `onboard.trustfabric.ai`
**Verdict:** Sellable now (Tier A)
**Ships:** 6 generated files

---

## The problem it closes

A new agent dropped into an unfamiliar repo burns its first several thousand tokens rediscovering what the team already knows: the framework, the conventions, the things you must not do. Every session pays that tax again, and every agent pays it separately.

Generates the files agents actually read on startup — AGENTS.md, CLAUDE.md, .cursorrules — from the real repo rather than a template, so the tax is paid once and committed.

## What ships today

Verified against the live generator registry (`listAvailableGenerators()`), not from documentation:

- `.cursorrules`
- `AGENTS.md`
- `CLAUDE.md`
- `model-cascade.md`
- `policy-pack.md`
- `workflow-pack.md`

## Standalone verdict

Sellable today, and it is already the revenue wedge (see the iliad-md CLI). The registry marks this 0/6 'runnable', which is misleading: unlike frontend or marketing, this program's markdown IS the deliverable. An agent consumes AGENTS.md directly. Nothing is advisory about it.

## Gap before this can be sold alone

No per-framework depth. The same six files come out whether the repo is Rails or Next.js. Competitors will differentiate on framework-specific convention detection.

## Pricing thesis

$9/mo solo, $29/mo team. Cheap, high-frequency, re-run on every significant merge — this is the subscription that survives churn.

## Relationship to the Iliad hub

Iliad stays the hub: one call, every program, for buyers who want the whole read.
Onboard is the same generators sold to a buyer who has one problem and does not
want the other nineteen. The hub keeps bundle economics; the spoke gets a landing
page, a price and a name someone can search for.

Nothing here forks the generators. A spoke that drifts from the hub's output is a
bug, not a product decision.
