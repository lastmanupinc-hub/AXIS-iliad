# Iliad as a Compounding Asset — the Agentic-Design Strategy

**Thesis: analysis is a transaction; memory is a relationship.** Today Iliad is a
deterministic *oracle* — same repo ⇒ byte-identical output. That determinism is why
agents trust it, and it's also the ceiling: the 100th run is worth exactly what the
1st was. This strategy adds the **accrual layer**: four axes along which every
additional use makes the next use more valuable, so the product an account holds
after six months is one nobody can cold-start — *including a competitor*.

> Positioning line: **"The first analysis orients your agent. The hundredth makes
> the agent yours."**

Every pillar below names the primitive **already in the repo** it builds on
(verified 2026-07-01), then the accrual feature to build. Roadmap items are marked
**[BUILD]** — nothing here claims to exist unless it does.

---

## The core tension, resolved first

Compounding usually means *learning*, and learning usually breaks *determinism* —
Iliad's moat. The resolution: **output = deterministic f(snapshot, memory)**.
Memory (history, decisions, conventions) becomes an explicit, versioned **input**,
not hidden state. Same snapshot + same memory ⇒ byte-identical output, still. And
memory is always **exportable** — the zero-lock-in promise is *why* users will
trust us to hold it. The switching cost is what you'd *lose*, never what we hold
hostage.

---

## Pillar 1 — Time: from analyzer to watchtower

**Exists:** snapshot lineage per project ordered by time (`store.ts:90`);
version list/diff endpoints (`server.ts:173-175`); GitHub webhook → background
re-snapshot on push (`server.ts:213`); deterministic outputs that make diffs
meaningful.

**[BUILD] Delta intelligence.** On every re-analysis of a known project, ship a
`delta.md` artifact: failure-surface delta (debug findings appeared/resolved),
hotspot churn, dependency drift, route/model additions, conventions changes —
a *narrative of change*, computed from real snapshot diffs (never inferred).
The webhook makes this ambient: push code → Iliad reports what changed about the
codebase's health, unprompted. **[BUILD]** a weekly digest (Resend email plumbing
exists) for the human; the agent reads `delta.md` directly.

**Why it compounds:** a delta is only possible *because of history*. Every
snapshot makes the next one more valuable, and no competitor can backfill the
history an account has accrued here.

## Pillar 2 — State: the project brain

**Exists:** the begin-loop already records `decisions`, `evidence_log`, and
`open_questions_for_human` — but only *locally*, inside the artifact bundle
(`autonomy-loop.ts`). Account-scoped stateful primitives are live: vector DB,
analytics, BM25 search index, object storage (all namespaced `acct:<id>:`).

**[BUILD] Server-side per-project memory** — decisions made ("don't re-litigate"),
conventions confirmed by the human, goals stated, evidence of what worked. Then
**weave memory into generation**: AGENTS.md / CLAUDE.md / begin.yaml emitted with
the project's actual decision history baked in. A brand-new agent session — any
vendor's agent — inherits everything every prior session learned. That is the
"agentic design asset": Iliad designs the agent's operating context and then
*keeps it current*.

Mechanics note: adding an MCP memory tool bumps `MCP_TOOL_COUNT` — do it honestly
(counts.ts + CI guard), or extend existing tools (`get_snapshot`/`analyze_*`)
with memory read/write instead.

## Pillar 3 — Usage: the funnel that learns

**Exists:** the program funnel ships `recommended-next-programs.md` (static
adjacency + repo-grounded boosts); every MCP call is intent-captured
(`mcp-server.ts:108`) and counted per tool; MyAnalytics page exists.

**[BUILD]** Usage-aware recommendations (what this account hasn't run that
accounts with similar repos got value from), account-visible trends in
MyAnalytics, and an **intent-driven roadmap**: what agents *ask for* that we
don't serve is the highest-signal demand data we own. Review it monthly; build
the top ask; tell the accounts that asked.

## Pillar 4 — Breadth: fleet intelligence

**Exists:** accounts hold many projects; team seats exist.

**[BUILD]** Org-level artifacts once an account has ≥2 repos: cross-repo
conventions report, an org-wide CLAUDE.md ("this is how *we* build"), portfolio
health view. Each repo added makes every other repo's analysis sharper — breadth
compounding, and the natural expansion motion for teams.

## Pillar 5 — Economics aligned with accrual

**Exists:** `meterPersistenceOp` is exported but **deliberately uncalled**
(`snapshots/index.ts:144`) — the reserved metering surface for exactly this;
persistence credits + PAI'D credit-wallet integration (dark, `PAID_WALLET_MODE`);
engineer-tier premium pattern; referral credits.

**The pricing story:** the *transaction* stays cheap/free (one-shot deterministic
analysis — the trust-builder and top-of-funnel). The *relationship* is what's
paid: history retention, delta intelligence, project memory, fleet views. Price
attaches to value accrued, not compute spent — and churn becomes irrational,
because leaving means abandoning the accrued asset (which we still let you
export; trust is the product).

---

## Sequencing

| Phase | Ship | Builds on | Effort |
|-------|------|-----------|--------|
| **Now** | `delta.md` on re-analysis + wire `meterPersistenceOp` + usage-aware funnel v1 | lineage, diff endpoints, funnel | days |
| **Next** | Webhook watchtower digest + server-side project memory read into AGENTS.md/CLAUDE.md generation | webhook, Resend, stateful primitives, begin-loop | 1–2 weeks |
| **Later** | Fleet artifacts; outcome-feedback loop (evidence_log → context tuning); memory-aware `improve_my_agent_with_axis` | seats, begin-loop evidence | quarter |

**KPIs that measure compounding (not vanity):** time-to-second-snapshot; % of
active projects with ≥3 snapshots; webhook attach rate; `delta.md` read rate via
`get_artifact`; memory writes+reads per agent session; retention split
(has-history vs one-shot cohorts); persistence-credit spend. **North star: % of
active projects with ≥3 snapshots and ≥1 memory write** — "compounding accounts,"
the accounts for whom leaving means losing something.

## What we will NOT do

- **Break determinism** — memory is a versioned input; f(snapshot, memory) stays
  reproducible. No hidden model state in the output path.
- **Manufacture lock-in** — everything (history, memory, artifacts) is exportable,
  always. The moat is accrued value, not captivity.
- **Fabricate insight** — deltas come from real diffs; trends from real snapshots
  (the verify-docs-vs-runtime discipline applies to generated artifacts too).
- **Inflate the catalog** — new tools go through counts.ts + CI honesty gates.
- **Touch money rails** — PAI'D owns money-in and the wallet; Iliad reads/debits
  only (see MCP_PAID_ACCESS_DESIGN.md).

---

*Strategy of 2026-07-01, grounded in the MCP surface audit of the same date: the
stateful primitives are live but underused as an accrual layer; the fix list from
that audit (closer/deploy metering decision, canonical host, -32700) should ride
along with Phase "Now".*
