# Agentic-Asset Program — Governance Package

This directory governs the implementation of `docs/AGENTIC_ASSET_STRATEGY.md`
(the compounding-asset strategy) by an **executing model — Claude Sonnet 5** —
under architecture decisions already made by the planning model. The package is
designed so a Sonnet 5 session can be pointed at it cold and produce mergeable,
verified PRs without re-deriving strategy or architecture.

## The operating model (who does what)

| Role | Owner | Deliverable |
|------|-------|-------------|
| Strategy + architecture decisions | Planning model (done — see EXECUTION_PLAN.md §Architecture Decisions) | Contracts, file targets, sequencing |
| **Code, tests, PRs** | **Sonnet 5** (this package governs it) | One work order → one branch → one PR |
| Review + merge + money/infra | Human owner | Merges; anything touching payments, auth, deploy |

## Files

- **CONSTITUTION.md** — the rules of engagement: invariants, verification
  protocol, escalation, git/PR discipline. Read first, every session.
- **EXECUTION_PLAN.md** — the full strategy → architecture decisions → epics.
- **WORK_ORDERS.yaml** — the ordered task queue. One entry = one PR. The
  executor updates `status` + `evidence` after each task (this file is the
  program's memory).
- **specs/SPEC-XX-\*.md** — per-work-order technical specs with exact contracts,
  file lists, and acceptance commands.

## Kickoff prompt (paste into a Claude Code session running Sonnet 5)

```text
You are the executing engineer for the Agentic-Asset program in this repo.

Read, in order:
1. docs/agentic-asset/CONSTITUTION.md   (your rules — binding)
2. docs/agentic-asset/WORK_ORDERS.yaml  (the queue)
3. The spec of the FIRST work order whose status is "open" and whose
   depends_on are all "done".

Then execute exactly that one work order following the constitution's loop:
branch → write the spec's tests first → implement to the spec's contracts →
run every acceptance command → update WORK_ORDERS.yaml (status, evidence) →
commit → push → open a PR. Do not start a second work order in the same
session. If any STOP condition in the constitution triggers, stop and report
instead of improvising.
```

## Standing guardrails (duplicated in the constitution because they matter)

- Sonnet 5 **never** touches payment rails, the PAI'D wallet path, auth/OAuth,
  `render.yaml`, or `.github/workflows/` — those are owner/planning-model lane.
- Determinism is load-bearing: generator-core functions are pure
  `f(inputs) → output`. Time, randomness, and network are surface concerns.
- Every PR must pass the repo's honesty gates (`count-honesty`,
  `strategic-docs-honesty`) and the full acceptance list of its work order.
