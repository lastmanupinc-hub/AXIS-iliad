# @axis/closer

A revenue operating system for AXIS programs. Not a CRM.

Iliad hosts it so every AXIS program calls one closer — PAI'D is client #1
(high-risk merchant acquisition).

```
IDENTIFIED → QUALIFIED → DECISION_MAKER_FOUND → READY_TO_CONTACT → CONTACTED
  → ENGAGED → MEETING → PROPOSAL → ONBOARDING → LIVE → REVENUE
```

## Why this is not a CRM

A CRM stores a stage and asks a human to keep it true. That is the failure
mode: the board drifts from reality, and maintaining it becomes the job.

Here, **nothing stores a stage.**

- `events` is an append-only log of facts: *we emailed them*, *they replied*,
  *they signed*.
- `stage` is a **pure fold over that log** — the furthest stage whose entry
  condition the events satisfy (`stages.ts#deriveState`).
- `next_action` is a **pure function** of (stage, elapsed time, signals)
  (`next-action.ts#nextAction`).

Consequences that fall out for free:

- A card cannot go stale, because nobody moves cards.
- Appending one fact advances the pipeline with no other write.
- The daily queue is recomputed on every read, so it never contains a task
  that reality already resolved.
- There is no "set stage" event, deliberately. Adding one would reintroduce
  hand-maintained state and defeat the design.

## The product is the queue, not the board

```ts
import { todayQueue, funnel, funnelSummary } from "@axis/closer";

const q = todayQueue(records, new Date(), { limit: 8 });
for (const item of q) {
  console.log(item.next.action, item.prospect.legal_name, "—", item.next.reason);
}
// contact    Acme CBD Co    — Ready to contact — qualified, decision maker known, channel verified.
// follow_up  Vape Direct    — Attempt 1 sent, no reply — follow up 3d later.
```

`funnelSummary(funnel(records, new Date()))` renders the shape of the business:

```
847 potential merchants identified
↓
126 meet your qualification criteria
↓
43 have identifiable payment decision makers
↓
17 are currently showing strong buying signals
↓
Today: work these 8
```

## Qualify and score are separate on purpose

| | question | shape |
|---|---|---|
| `qualify()` | should we ever spend a minute on this? | hard boolean gate |
| `score()` | of those worth working, who first? | 0–100 rank |

Merging them is what makes CRM scores untrustworthy — a high score built from
weak signals silently promotes junk past a gate that should have rejected it
on a fact.

Two rules that matter:

- **Unknown ≠ disqualified.** A prospect with no vertical yet is *not
  qualified*, and its next action becomes `enrich`. Treating unknown as
  disqualified is how a pipeline quietly discards its own top of funnel.
- **Every score explains itself.** `ScoreResult.reasons` is always populated.
  An unexplainable score is one nobody trusts and nobody can debug.

Signals decay linearly to zero over 30 days — intent is perishable, and a
6-month-old "they got dropped by their processor" is not a reason to call.

## Guardrails

- **Opt-out is absolute.** A `replied` event with `opt_out: true` forces
  `DISQUALIFIED` permanently. A `reopened` event clears a *loss* and a
  *snooze* but never an opt-out — honoring "stop contacting me" is not a
  business decision.
- **Outreach stops.** After `max_attempts` (default 3) with no reply the
  prospect goes quiet rather than being nagged.
- **LIVE is not won.** A merchant who is technically live but has processed
  nothing stays in the queue with `confirm_first_revenue`. That gap is where
  "closed" deals quietly die.

## Neutrality firewall

This package is **demand-side only** — who we sell to. It must never be
imported by, or feed, any payment-routing or pricing decision.

PAI'D's `PARTNER_NETWORK_TREE.yaml` states the rule this mirrors: PSPs compete
per transaction, and commercial standing must never enter rail candidacy. A
prospect's score is a sales artifact and nothing else.

## Determinism

Every function that depends on time takes `now: Date` as a parameter. Nothing
calls `Date.now()` internally, so the whole engine is deterministic and
testable — and a queue built at 09:00 can be reproduced exactly at 17:00.

## Status

The engine is complete and tested (30 tests). Still to land:

- Postgres persistence (migration v47: `closer_prospects`, `closer_events`)
- `/v1/closer/*` API routes in `apps/api` so PAI'D can call it
- Public-source ingestion adapters for the IDENTIFIED stage
