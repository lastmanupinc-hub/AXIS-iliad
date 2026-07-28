# Runbook — `superpowers` as a standalone product

**Landing page:** `runbook.trustfabric.ai`
**Verdict:** Sellable after narrow work (Tier B)
**Ships:** 8 generated files

---

## The problem it closes

Every team re-invents the same automation — test generation rules, refactor workflows, CI scripts — and none of it is written down anywhere an agent can find it.

8 generators emitting a superpower pack, workflow registry and test-generation rules.

## What ships today

Verified against the live generator registry (`listAvailableGenerators()`), not from documentation:

- `.githooks/pre-push`
- `automation-pipeline.yaml`
- `refactor-checklist.md`
- `superpower-pack.md`
- `test-generation-rules.md`
- `verify-full.sh`
- `verify.sh`
- `workflow-registry.json`

## Standalone verdict

Middling. 2 of 8 outputs are machine-readable; the rest describe workflows rather than performing them.

## Gap before this can be sold alone

The workflow-registry.json is a manifest of things a human or agent could do, not executable automation. To justify a subscription it needs to actually run.

## Pricing thesis

$19/mo, and only after the registry becomes executable.

## Relationship to the Iliad hub

Iliad stays the hub: one call, every program, for buyers who want the whole read.
Runbook is the same generators sold to a buyer who has one problem and does not
want the other nineteen. The hub keeps bundle economics; the spoke gets a landing
page, a price and a name someone can search for.

Nothing here forks the generators. A spoke that drifts from the hub's output is a
bug, not a product decision.
