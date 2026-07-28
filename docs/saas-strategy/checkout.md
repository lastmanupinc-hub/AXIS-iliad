# Checkout — `agentic-purchasing` as a standalone product

**Landing page:** `checkout.trustfabric.ai`
**Verdict:** Sellable after narrow work (Tier B)
**Ships:** 6 generated files

---

## The problem it closes

An agent that wants to buy something on a user's behalf hits a wall of compliance it cannot reason about: SCA exemptions, AP2 mandates, dispute evidence, network tokenisation. Getting it wrong means chargebacks.

6 generators producing the purchasing playbook, product schema, checkout flow and the AP2/UCP/Visa compliance kit.

## What ships today

Verified against the live generator registry (`listAvailableGenerators()`), not from documentation:

- `agent-purchasing-playbook.md`
- `ap2-interop-samples.json`
- `checkout-flow.md`
- `commerce-registry.json`
- `negotiation-rules.md`
- `product-schema.json`

## Standalone verdict

Already sold as prepare_agentic_purchasing at $0.50/call, so standalone viability is proven. The question is packaging, not existence.

## Gap before this can be sold alone

Documented at length in this repo: packages/ap2 was modelled from public docs and verified only against self-authored golden vectors — never a live counterparty. The compliance claims are untested where it counts.

## Pricing thesis

$99/mo. Compliance buyers are price-insensitive and renewal-sticky.

## Relationship to the Iliad hub

Iliad stays the hub: one call, every program, for buyers who want the whole read.
Checkout is the same generators sold to a buyer who has one problem and does not
want the other nineteen. The hub keeps bundle economics; the spoke gets a landing
page, a price and a name someone can search for.

Nothing here forks the generators. A spoke that drifts from the hub's output is a
bug, not a product decision.
