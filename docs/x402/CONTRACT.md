# x402 / MPP Contract (AXIS Ecosystem)

Version: 1.1 · Updated: 2026-07-14

This document defines the **canonical HTTP 402 negotiation envelope** used across Trust Fabric / AXIS projects. The reference implementation is [`@axis/mpp`](../../packages/mpp/README.md) (TypeScript). PAI'D and Foundry implementations must produce byte-compatible JSON for the fields marked **required**.

Spec background: [x402.org](https://www.x402.org) (Coinbase + Cloudflare open standard for agent-native micropayments).

---

## Flow

```
Agent → POST /tool (no payment headers)
Server → 402 + negotiation JSON body
Agent → (a) retry with X-Agent-Budget + X-Agent-Mode: lite
      → (b) pay via payment_url / stablecoin, receive Payment-Receipt
      → (c) retry with X-Payment credential + Authorization
Server → 200 + result (+ Payment-Receipt header on success)
```

---

## Request headers

| Header | Required | Purpose |
|--------|----------|---------|
| `Authorization` | Usually | `Bearer <api_key>` for authenticated tools |
| `X-Agent-Budget` | Negotiation | JSON: `{"budget_per_run_cents":25,"spending_window":"per_call"}` |
| `X-Agent-Mode` | Optional | `lite` or `engineer` for tier selection |
| `X-Payment` | After pay | Settlement credential from PAI'D / mppx challenge |

---

## Response: 402 body (required fields)

When payment is required, respond with **HTTP 402** and `Content-Type: application/json`.

```json
{
  "error": "Payment Required",
  "message": "analyze_repo requires $0.50 MPP credit (or Pro tier) to continue.",
  "price": "0.50",
  "currency": "USD",
  "lite_price": "0.15",
  "accepted_payment_schemes": ["x402/usdc/base", "mppx/tempo", "mppx/stripe"],
  "preferred_payment_scheme": "x402/usdc/base",
  "payment_rails": [
    {
      "scheme": "x402/usdc/base",
      "asset": "USDC",
      "network": "base",
      "price_usd": "0.50",
      "lite_price_usd": "0.15",
      "summary": "USDC on base @ $0.50 per analyze_repo call ($0.15 lite)",
      "settlement": "on-chain, deterministic finality in seconds",
      "intermediaries": "none — direct to recipient address",
      "chargeback_exposure": "none (on-chain settlement is final)",
      "surcharge": "none — listed price is the full cost",
      "preferred": true
    },
    {
      "scheme": "mppx/stripe",
      "asset": "USD",
      "network": "card",
      "price_usd": "0.50",
      "lite_price_usd": "0.15",
      "summary": "Card/Link via Stripe @ $0.50 per analyze_repo call ($0.15 lite)",
      "settlement": "card-network authorization + capture",
      "intermediaries": "card network + issuing bank",
      "chargeback_exposure": "standard card-network dispute rules apply",
      "surcharge": "none — listed price is the full cost",
      "preferred": false
    }
  ],
  "x402": {
    "amount": "500000",
    "asset": "USDC",
    "network": "base",
    "payTo": "<recipient_address_or_null>"
  },
  "payment_url": "https://iliad.trustfabric.ai/billing",
  "retry_after_payment": "Re-send the original request with Authorization after payment completes.",
  "pricing": {
    "standard": { "amount_cents": 50, "currency": "usd" },
    "lite": { "amount_cents": 15, "currency": "usd" }
  },
  "actions": {
    "counter": "Re-send with X-Agent-Budget header",
    "switch_lite": "Re-send with X-Agent-Mode: lite"
  }
}
```

### Field reference

| Field | Required | Notes |
|-------|----------|-------|
| `error` | Yes | Always `"Payment Required"` |
| `price` | Yes | Standard tier, decimal USD string |
| `lite_price` | Yes | Lite tier price string |
| `currency` | Yes | ISO display currency (`USD`) |
| `accepted_payment_schemes` | Yes | Ordered by SERVER PREFERENCE — token/USDC first when a recipient is configured; Stripe is the always-available fallback. A client `Accept-Payment` ranking overrides. |
| `preferred_payment_scheme` | Yes | The single scheme the server prefers (`x402/usdc/<network>` when configured, else `mppx/stripe`) |
| `payment_rails` | Yes | Per-rail economics an agent can evaluate autonomously: `scheme`, `asset`, `network`, `price_usd`, `lite_price_usd`, `summary`, `settlement`, `intermediaries`, `chargeback_exposure`, `surcharge`, `processing_overhead`, `preferred` (+ `why_preferred` on the preferred rail). Agent-facing prices are identical on every rail (no per-rail surcharge); rails differ in settlement mechanics and processing overhead — the card rail carries Stripe's published standard fee (2.9% + $0.30), the USDC rail network gas only, which is why the token rail is preferred. See [`PAYMENTS_COMPLIANCE.md`](./PAYMENTS_COMPLIANCE.md) for the AML/sanctions posture and the discount-not-surcharge rule on any future price differential. |
| `payment_url` | Yes | Human or agent checkout entry |
| `x402` | Yes | Stablecoin block: `amount`, `asset`, `network`, `payTo` |
| `pricing` | Recommended | Structured cents for programmatic parsers |
| `actions` | Recommended | Retry instructions for autonomous agents |

---

## Success: Payment-Receipt

On successful settlement, the server may return:

```
Payment-Receipt: <opaque_receipt_token>
```

Agents should retain this for idempotent retries and audit trails.

---

## Ecosystem registry

See [`ecosystem.registry.yaml`](../../ecosystem.registry.yaml) for cross-project URLs, MCP endpoints, and x402 maturity per product.

---

## Implementations

| Project | Package / module | Status |
|---------|------------------|--------|
| Iliad | `@axis/mpp` | Wired (reference) |
| PAI'D | `go-backend/internal/x402/` (planned) | Settlement orchestration |
| Foundry | `engine/axis_foundry/x402/` (planned) | Paid MCP tools |
| Trust Fabric | TBD | Certification intake |