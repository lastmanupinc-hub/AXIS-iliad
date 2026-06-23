# E9 — Commerce Integration: design contract

**Tool:** `prepare_agentic_purchasing` (engineer mode) · **Branch:** `feat/engineer-e9-commerce` · **Status:** design (pre-build)

The engineer upgrade turns the tool's output from **descriptive compliance docs** into a **working integration**: deployable code + a runnable test + a submittable evidence pack. Today's 5 artifacts (playbook, product-schema, checkout-flow, negotiation-rules, commerce-registry) are all markdown/JSON that *describe* what an x402/AP2/PAI'D integration should look like — none is runnable.

## Guardrails (why this is safe to build)

| Concern | Resolution |
|---|---|
| MTL / money-transmitter | AXIS **generates code the customer deploys** to their own infra, wired to **their own** PAI'D account (env referenced by NAME, never embedded). AXIS never processes or settles funds. Matches the "settle to owner's own Stripe" constraint. |
| Determinism (`determinism.test.ts`) | Every engineer artifact is a **pure function of (ContextMap, RepoProfile, SourceFiles)** — no clock/random — and is appended in `runPreparePurchasing` (engineer-gated, like hygiene), so the 5 standard artifacts + the generator-core determinism test are untouched. |
| No-AI-without-contract | Fully deterministic/templated. No LLM. |
| Honesty | The current generator disclaims win-rate prediction. The engineer pack **keeps that stance** — see the scope question on #4. |

## Engineer artifact bundle (appended only when `X-Agent-Mode: engineer`)

1. **`x402-paid-endpoint.ts`** — a deployable route, framework auto-detected from the repo (Express / Hono / Next route handler). It: (a) emits the x402 **402 payment-required challenge** (the `build402NegotiationBody` shape, templated for the caller), (b) verifies an **AP2 mandate** (signature + constraints), (c) calls **PAI'D `createCheckoutSession`** for settlement and verifies the webhook signature. References `PAID_API_KEY` / `PAID_WEBHOOK_SECRET` by name.
2. **`x402-endpoint.test.ts`** — a runnable **vitest** spec exercising a mock `402 → mandate-verify → settle` round-trip with an injected fetch (no live calls, no keys).
3. **`ce3-evidence.json` + `ce3-evidence.schema.json`** — a **field-complete, schema-validatable Compelling Evidence 3.0 pack** (target codes 10.2/10.3/10.4), assembled from detected commerce signals — upgrading today's `<placeholder>` template into a concrete document + a JSON Schema that validates it.
4. **`dispute-readiness.{ts,md}`** *(see scope question)* — a **transparent, deterministic evidence-completeness score** (NOT a black-box win-rate prediction): inputs = CE 3.0 field completeness + per-reason-code evidence coverage → a documented 0–100 readiness score + the specific gaps. Honest framing that *extends* (doesn't contradict) the current "no outcome prediction" stance.

## Pricing

Re-add `prepare_agentic_purchasing.engineer_cents` (the flagship designer price, $250) — removed earlier as unbuilt, now shipping. The ladder test (`engineer > standard`) and the implemented-set test update accordingly.

## Test plan (no live keys)

- Each artifact builder is pure → unit-tested with hand-built ContextMap/signals fixtures (endpoint contains the 402/mandate/settle pieces; the test file is itself valid; the CE 3.0 JSON validates against its schema; the readiness score is monotonic in evidence completeness).
- Engineer-gating: standard `prepare_agentic_purchasing` is byte-identical to today; engineer mode appends the bundle; the price follows the header.
- Determinism: same inputs → byte-identical bundle.

## Scope question

The ledger lists a **"win-probability sim"** as part of E9, but the generator currently *disclaims* win-rate prediction on purpose. Two ways to honor the intent:
- **Build #4 as a transparent dispute-readiness score** (recommended) — deterministic, explainable (evidence-completeness, not outcome odds), consistent with the honest stance.
- **Skip #4** — ship the 3 concrete integration deliverables (endpoint + test + CE 3.0 pack) and keep the "no prediction" stance untouched.
