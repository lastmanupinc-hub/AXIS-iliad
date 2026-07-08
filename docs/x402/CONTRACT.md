# x402 / MPP Contract (AXIS Ecosystem)

Version: 1.0 · Updated: 2026-07-08

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
  "accepted_payment_schemes": ["mppx/stripe", "x402/usdc/base"],
  "payment_url": "https://iliad.trustfabric.ai/billing",
  "x402": {
    "amount": "500000",
    "asset": "USDC",
    "network": "base",
    "payTo": "<recipient_address_or_null>"
  },
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
| `accepted_payment_schemes` | Yes | e.g. `mppx/stripe`, `x402/usdc/base` |
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