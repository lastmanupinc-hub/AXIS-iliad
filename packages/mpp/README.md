# @axis/mpp

> Machine Payments Protocol (MPP) — x402 budget negotiation and AP2 pricing utilities for MCP servers and AI-agent endpoints.

[![npm version](https://img.shields.io/npm/v/@axis/mpp.svg)](https://www.npmjs.com/package/@axis/mpp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

`@axis/mpp` is the open-source protocol primitive extracted from [Axis' Iliad](https://axis-iliad.jonathanarvay.com). It lets any Node.js HTTP server speak the **x402 / Machine Payments Protocol** so AI agents can negotiate price, downgrade to a lite tier, and retry without a human in the loop.

```
agent → request
       ← 402 Payment Required + negotiation body
agent → request with X-Agent-Budget / X-Agent-Mode / MPP credential
       ← 200 OK
```

No Stripe SDK, no crypto wallet, no MCP framework required to use this package. Bring your own charging primitive — `@axis/mpp` handles only the **negotiation, pricing, and 402 response shape**.

---

## Install

```bash
npm install @axis/mpp
# or
pnpm add @axis/mpp
# or
yarn add @axis/mpp
```

Requires Node.js 20+.

---

## 5-line quickstart (any HTTP server)

```ts
import { parseAgentBudget, negotiatePrice, build402NegotiationBody } from "@axis/mpp";

const budget = parseAgentBudget(req);
const { amount_cents, mode, accepted } = negotiatePrice(budget ?? {}, "analyze_repo");
if (!accepted) {
  res.writeHead(402, { "Content-Type": "application/json" });
  res.end(JSON.stringify(build402NegotiationBody("analyze_repo", budget)));
}
```

That's the entire protocol surface. Charge however you want (Stripe, USDC, internal credits) once `accepted === true`.

---

## Framework recipes

### Express

```ts
import express from "express";
import { parseAgentBudget, negotiatePrice, build402NegotiationBody } from "@axis/mpp";

const app = express();

app.post("/v1/my-tool", async (req, res) => {
  const budget = parseAgentBudget(req);
  const negotiation = negotiatePrice(budget ?? {}, "my_tool");

  if (!negotiation.accepted) {
    return res
      .status(402)
      .json(build402NegotiationBody("my_tool", budget, { message: negotiation.reason }));
  }

  // charge however you like — Stripe, USDC, internal credits
  // await charge(req.user, negotiation.amount_cents);

  res.json({ ok: true, mode: negotiation.mode, price_cents: negotiation.amount_cents });
});
```

### Hono

```ts
import { Hono } from "hono";
import { parseAgentBudget, negotiatePrice, build402NegotiationBody } from "@axis/mpp";

const app = new Hono();

app.post("/v1/my-tool", async (c) => {
  // Hono → adapt the Web Request to a node-like shape for parseAgentBudget
  const req = { headers: Object.fromEntries(c.req.raw.headers) } as never;
  const budget = parseAgentBudget(req);
  const negotiation = negotiatePrice(budget ?? {}, "my_tool");

  if (!negotiation.accepted) {
    return c.json(build402NegotiationBody("my_tool", budget), 402);
  }

  return c.json({ ok: true, mode: negotiation.mode, price_cents: negotiation.amount_cents });
});
```

### Fastify

```ts
import Fastify from "fastify";
import { parseAgentBudget, negotiatePrice, build402NegotiationBody } from "@axis/mpp";

const app = Fastify();

app.post("/v1/my-tool", async (req, reply) => {
  const budget = parseAgentBudget(req.raw);
  const negotiation = negotiatePrice(budget ?? {}, "my_tool");

  if (!negotiation.accepted) {
    reply.code(402);
    return build402NegotiationBody("my_tool", budget);
  }

  return { ok: true, mode: negotiation.mode, price_cents: negotiation.amount_cents };
});
```

### Bare Node.js

```ts
import { createServer } from "node:http";
import { parseAgentBudget, negotiatePrice, build402NegotiationBody } from "@axis/mpp";

createServer((req, res) => {
  const budget = parseAgentBudget(req);
  const negotiation = negotiatePrice(budget ?? {}, "my_tool");

  if (!negotiation.accepted) {
    res.writeHead(402, { "Content-Type": "application/json" });
    res.end(JSON.stringify(build402NegotiationBody("my_tool", budget)));
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, mode: negotiation.mode }));
}).listen(3000);
```

---

## API

### `parseAgentBudget(req: IncomingMessage): AgentBudget | undefined`

Reads the `X-Agent-Budget` header from a Node.js request and returns a validated `AgentBudget`. Returns `undefined` if the header is absent or malformed (no exceptions thrown).

Header format:

```
X-Agent-Budget: {"budget_per_run_cents":25,"spending_window":"per_call"}
```

Accepted fields: `budget_per_run_cents`, `spending_window` (`per_call` | `hourly` | `daily` | `monthly`), `max_monthly_cents`, `wallet_id`, `agent_type`.

### `resolveAgentMode(req: IncomingMessage): "standard" | "lite"`

Reads `X-Agent-Mode`. Returns `"lite"` only when the header equals `"lite"`; otherwise `"standard"`.

### `negotiatePrice(budget, tool): { amount_cents, mode, accepted, reason }`

Picks the best price for a tool given an agent's budget. Falls back to lite-mode pricing when the budget is below standard, and returns `accepted: false` when the budget cannot meet even the lite tier.

### `build402NegotiationBody(tool, budget?, options?): Record<string, unknown>`

Returns the full 402 JSON body to send back to the agent. Includes:

- Standard and lite pricing
- Accepted payment schemes (Stripe MPP, USDC on Base, mppx/Tempo)
- Retry instructions (headers + paths)
- Free-alternative tools the agent can call without payment
- Optional `referral_token` for share-to-earn micro-discounts
- Commerce-readiness value summary (when used with Axis' Iliad)

### `getPricingTier(tool: string): PricingTier`

Look up the canonical pricing tier for a tool name, resolving legacy aliases (e.g. `prepare_for_agentic_purchasing` → `prepare_agentic_purchasing`).

### Constants

- `PRICING_TIERS` — full pricing registry for Axis' Iliad tools and the `default` fallback
- `LEGACY_TOOL_ALIASES` — alias map for tools renamed across versions

---

## Pricing tier registry

The default registry covers Axis' Iliad's tool surface. To use `@axis/mpp` with your own tools, either:

1. **Reuse the `default` tier** — anything not in `PRICING_TIERS` falls back to `default` (standard $0.50, lite $0.25).
2. **Wrap `getPricingTier`** with your own registry and pass the result to `negotiatePrice`.

The library is intentionally side-effect-free — no global state, no env reads except inside `build402NegotiationBody` for payment-recipient URLs.

---

## Environment variables (optional)

Used only by `build402NegotiationBody` when present:

| Variable                  | Effect                                                                   |
| ------------------------- | ------------------------------------------------------------------------ |
| `TEMPO_RECIPIENT_ADDRESS` | Adds `mppx/tempo` and `x402/usdc/<network>` to `accepted_payment_schemes` |
| `TEMPO_TESTNET=true`      | Uses `base-sepolia` instead of `base` for the USDC network               |
| `WEB_BASE_URL`            | Overrides the default `payment_url` / `checkout_url`                     |

---

## Why MPP?

| Without MPP                                                                                  | With `@axis/mpp`                                                                                |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Agents hit `429 Too Many Requests` and abandon                                               | Agents receive a structured 402 with payment options                                            |
| No standard for "I can pay $0.15 but not $0.50"                                              | `X-Agent-Budget` header negotiation                                                             |
| No standard for "give me the cheaper version"                                                | `X-Agent-Mode: lite` header                                                                     |
| Each MCP server reinvents pricing JSON                                                       | Shared `build402NegotiationBody` shape across the ecosystem                                     |
| Stripe Checkout requires a browser redirect                                                  | Agents retry headlessly with an MPP credential or budget header                                 |

---

## Related

- [`mppx`](https://www.npmjs.com/package/mppx) — runtime payment validation layer (Stripe / USDC). Use `@axis/mpp` for protocol shape and `mppx` for actual charging.
- [Axis' Iliad](https://axis-iliad.jonathanarvay.com) — the reference implementation; calls `@axis/mpp` from all paid handlers.
- [x402 specification](https://www.x402.org) — open standard this package implements.

---

## License

MIT — see [LICENSE](./LICENSE).
