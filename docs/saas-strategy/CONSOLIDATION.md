# Consolidation — 20 programs into 9 applications

This is the execution strategy that consumes the 20 per-program guides beside it.
It answers one question the guides deliberately left open: *if only 6 are sellable
now and 9 are not sellable at all, what actually gets built?*

The answer is **9 standalone applications**, four **parked** programs, and one
**prerequisite** that blocks every monthly price in the portfolio.

---

## The prerequisite, before any product

**An account has exactly one `tier`.** There is no concept of "owns Socket but not
Palette". Every spoke in this strategy assumes per-product entitlement, and the
schema cannot express it.

This is not a launch detail — it is the gate. Selling nine products against a
one-tier account model means either nine separate accounts per customer, or an
entitlement check that cannot be written. It is scored as the highest-ROI candidate
below for that reason, and nothing else should start first.

Second gate, already dated: **recurring billing turns on 2026-08-15** with the Terms
change. Seven of the nine products below are priced monthly and are unbillable until
then. One-time products (Crate) and the free product (Atlas) can ship before it.

---

## The nine applications

Each absorbs its weaker neighbours rather than launching beside them. Mergers are
listed as *absorbs*, and they are the whole reason the count is 9 and not 20.

| # | Product | Subdomain | Absorbs | Price | Gate |
|---|---|---|---|---|---|
| 1 | **Onboard** | `onboard.` | `skills` + `notebook` + `debug` | $9–29/mo | entitlement, recurring |
| 2 | **Socket** | `socket.` | `mcp` | $29/mo | entitlement, recurring |
| 3 | **Runway** | `runway.` | `deploy` | $19/mo | entitlement, recurring, **build-verify** |
| 4 | **Crate** | `crate.` | `closer` | $49 one-time | entitlement only |
| 5 | **Palette** | `palette.` | `theme` | $19/mo | entitlement, recurring |
| 6 | **Embed** | `embed.` | `artifacts` + `frontend` + `seo` | $29/mo | entitlement, recurring, **Grain merge** |
| 7 | **Atlas** | `atlas.` | `search` + `canvas` | **free** | none — ship first |
| 8 | **Checkout** | `checkout.` | `agentic-purchasing` | $99/mo | entitlement, recurring, **ap2 verification** |
| 9 | **Reach** | `reach.` | `marketing` + `brand` | $29/mo | entitlement, recurring |

### Parked — not in the first nine

- **Burn** (`optimization`) — estimates are static. Needs live provider usage APIs to
  be worth money. Real problem, wrong implementation. Revisit after Tier A revenue.
- **Runbook** (`superpowers`) — the workflow registry describes automation instead of
  running it. Park until executable.
- **Reel** (`remotion`) — requires the buyer already uses Remotion. Fold into Reach
  as a feature, not a product.
- **Seed** (`algorithmic`) — highest code density, least obvious buyer. This is an
  art-tools product in a developer portfolio. Spin out or shelve.

Parking four programs is a decision, not an oversight. Each has a named reason and a
condition under which it un-parks.

---

## Build order

Sequenced so that each step unblocks the next, and so the first shipped thing needs
the fewest gates.

**Phase 0 — unblock**
1. Per-product entitlement in the schema. Blocks all eight paid products.
2. A single product registry: one module mapping program → product → price →
   subdomain. Nine products hand-maintained in nine places is the drift this repo
   keeps rediscovering.

**Phase 1 — ship the ungated**
3. **Atlas**, free. No entitlement needed, no recurring billing needed. It is the
   architecture read every other product consumes, so it is also the funnel. Ship it
   first and instrument conversion from it.
4. **Crate**, one-time $49. Needs entitlement but not recurring billing.

**Phase 2 — close the two credibility gaps**
5. **Runway build verification.** We emit Dockerfiles and never build one. Converting
   "here is a Dockerfile" into "here is a Dockerfile, and we built it" is the single
   strongest claim available in this portfolio and almost nobody else can make it.
6. **Grain merge.** `frontend` emits four markdown files; v0 emits working UI.
   Merge into Embed so the combined product generates components *and* the rules
   they follow. Do not launch prose against a code generator.

**Phase 3 — the monthly products (post 2026-08-15)**
7. Onboard, Socket, Runway, Palette, Embed — in that order. Onboard first because it
   is already the revenue wedge with the highest re-run frequency.

**Phase 4 — the specialist**
8. **Checkout** at $99/mo, *after* `packages/ap2` is verified against a live
   counterparty. Compliance buyers are precisely the segment that will find a
   self-disclosed "never tested against a real counterparty" note.
9. **Reach**, last. Weakest of the nine and the most replaceable by incumbents.

---

## What makes a spoke, concretely

Every spoke is the same four things. This is deliberately mechanical so the ninth
costs a fraction of the first.

1. **A product entry** in the registry (program set, price, subdomain, tier).
2. **A landing page** at `<name>.trustfabric.ai`, generated by our own `seo` and
   `marketing` programs against the product's own artifact list. We should be the
   first customer of the programs we are selling.
3. **A scoped entitlement** — purchasing Socket grants Socket, not the bundle.
4. **A filtered run** — the spoke calls the same generators as the hub with the
   program set narrowed. No forked generator code, ever. A spoke whose output drifts
   from the hub's is a bug.

The hub keeps bundle economics for buyers who want all twenty. The spokes reach the
much larger population who will never buy twenty to solve one.

---

## Honest risks

- **Nine landing pages is nine DNS/TLS/Pages setups.** The existing `axis-web`
  Git-connect required manual browser-only OAuth by the owner. This multiplies a
  chore that is already known to need a human.
- **Per-product entitlement touches billing.** The riskiest schema change in the
  system, on the path that takes money.
- **Cannibalisation is unmeasured.** If most hub buyers only ever wanted one program,
  spokes convert $0.50 bundle sales into $19/mo subscriptions and that is a win. If
  hub buyers want breadth, spokes fragment a working product. Atlas-first exists
  partly to measure this before the paid spokes commit.
- **Four parked programs still cost maintenance.** They ship in the hub bundle and
  must keep working, without a product owner.
