# Model Cascade — axis-iliad

A higher-capability model plans and writes acceptance-criteria-complete work orders; a mid-capability model executes them; a small, cheap model does the mechanical remainder. Each tier only ever runs the cheapest model that clears its own quality bar. This file is the deterministic map from task types detected in this repo to the tier that should own them, plus the contract between tiers — derived from real repo signals, not invented.

## Capability tiers

| Tier | Class | Owns |
|---|---|---|
| Planner | frontier-class | Cross-cutting design, architecture decisions, adversarial verification |
| Executor | mid-class | Test-backed implementation, code review, most day-to-day changes |
| Mechanical | small-class | Repetitive edits, formatting, CI-failure triage, boilerplate |

## Task types detected for this repo

| Task type | Tier | Why |
|---|---|---|
| CI failure triage | Mechanical | github_actions pipeline detected — most failures are a known-shape error to interpret, not a design decision |
| Test-backed implementation | Executor | vitest detected — a change and its test are one unit of work, no cross-cutting judgment needed |
| Cross-cutting design + adversarial verification | Planner | monorepo, containerized detected — a change here can silently break a sibling package/service, so the tier that plans it should also verify it |
| New feature implementation | Executor | Follows existing patterns; escalate to Planner only if no existing pattern fits |
| Formatting, renames, boilerplate | Mechanical | No design judgment required |

## Delegation contract

- Each tier writes work orders **with acceptance criteria** for the tier below — not vague instructions.
- Verification of a unit of work runs **at or above** the tier that implemented it — a tier never grades its own homework alone.
- A tier that cannot meet its own acceptance criteria escalates one tier up, carrying the failure context (what was tried, what failed, why) forward — not a bare "this didn't work."

## Cost rule

Run every unit of work on the lowest-token-cost tier that clears its quality bar. Escalate one tier after two failed attempts at the same tier, carrying the failure context forward so the escalation doesn't restart from zero.

## Honest limits

"Planner" / "Executor" / "Mechanical" are capability CLASSES, not vendor SKUs or specific model names — this file makes no pricing claims and no benchmark claims. Which actual model fills which tier is a choice made at run time, outside this document's scope.

---

## ⟳ Continue the loop

- **You are here:** `model-cascade.md` — agent step 54 of 71.
- **Next:** `layout-patterns.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
