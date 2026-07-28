# Postmortem — `debug` as a standalone product

**Landing page:** `postmortem.trustfabric.ai`
**Verdict:** Not sellable standalone yet (Tier C)
**Ships:** 4 generated files

---

## The problem it closes

An incident starts and nobody can find the runbook, because there isn't one. The tracing rules live in one engineer's head and they are asleep.

Produces a debug playbook, incident template, root-cause checklist and tracing rules from the repo's actual error surface.

## What ships today

Verified against the live generator registry (`listAvailableGenerators()`), not from documentation:

- `debug-playbook.md`
- `incident-template.md`
- `root-cause-checklist.md`
- `tracing-rules.md`

## Standalone verdict

Not sellable standalone. 0 of 4 outputs are machine-consumable — it is four markdown documents.

## Gap before this can be sold alone

No integration with anything that observes incidents. PagerDuty, Sentry and Datadog own this workflow and generate their own runbooks from real telemetry. We generate ours from static code.

## Pricing thesis

Bundle into Onboard. A debug playbook is onboarding material, not a product.

## Relationship to the Iliad hub

Iliad stays the hub: one call, every program, for buyers who want the whole read.
Postmortem is the same generators sold to a buyer who has one problem and does not
want the other nineteen. The hub keeps bundle economics; the spoke gets a landing
page, a price and a name someone can search for.

Nothing here forks the generators. A spoke that drifts from the hub's output is a
bug, not a product decision.
