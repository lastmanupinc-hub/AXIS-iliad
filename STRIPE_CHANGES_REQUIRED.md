# Stripe Changes Required (Exact)

This runbook lists exactly what must be configured in Stripe and in deployment env vars for this repository.

It now includes both billing surfaces:
- Subscription checkout (Pro and Suite)
- Per-call resold tools via x402/MPP (including new Firecrawl tools)

## 1) Stripe Dashboard: Create/Verify Prices

The API checkout endpoint reads two recurring Stripe Price IDs:
- `STRIPE_PRICE_ID_PAID` for tier `paid`
- `STRIPE_PRICE_ID_SUITE` for tier `suite`

Code references:
- `POST /v1/checkout` reads these env vars and fails if missing: `apps/api/src/stripe.ts`
- tier validation only allows `paid` or `suite`: `apps/api/src/stripe.ts`

### Required Stripe objects

1. Product: Axis Pro
- Billing: Recurring
- Amount: USD $29.00 monthly
- Save resulting `price_...` ID as `STRIPE_PRICE_ID_PAID`

2. Product: Axis Enterprise Suite
- Billing: Recurring
- Amount: USD $99.00 monthly
- Save resulting `price_...` ID as `STRIPE_PRICE_ID_SUITE`

Important:
- Keep products/prices **active**. Inactive products/prices cause checkout creation to fail with upstream Stripe errors.

## 1.1) New Resold Tools (Firecrawl) - Stripe Impact

New paid tools now sold through this API:
- MCP tool: `iliad_web_research` -> endpoint `POST /v1/research/scrape`
- MCP tool: `iliad_web_research_crawl` -> endpoint `POST /v1/research/crawl`

Configured prices in code:
- `iliad_web_research`: $0.10 standard, $0.05 lite
- `iliad_web_research_crawl`: $0.25 standard, $0.12 lite

Important Stripe detail:
- These resold tools are charged through the x402/MPP Stripe payment flow, not through Stripe Checkout subscription price objects.
- So there are **no additional Stripe Products/Prices to create** for these two tools.
- They require a working Stripe secret key for MPP charging.

Code references:
- Tool pricing registry: `packages/mpp/src/index.ts`
- Firecrawl handlers use `getPricingTier(...)`: `apps/api/src/handlers.ts`
- Firecrawl MCP registration and pricing copy: `apps/api/src/mcp-server.ts`

## 2) Stripe Dashboard: Webhook Endpoint

Create one webhook endpoint for the API:
- Endpoint URL: `https://axis-api-6c7z.onrender.com/v1/webhooks/stripe`

Subscribe to exactly these events (the handler only processes these):
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

Code reference for handled event list:
- `HANDLED_EVENTS` in `apps/api/src/stripe.ts`

After creating webhook endpoint:
- Copy signing secret (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`

## 3) Stripe API Key Scope

Set `STRIPE_SECRET_KEY` to a valid secret key (`sk_live_...` in production).

The current code uses Stripe API directly for:
- Create checkout session: `POST https://api.stripe.com/v1/checkout/sessions`
- Cancel subscription at period end: `POST https://api.stripe.com/v1/subscriptions/{id}`

And also uses Stripe through x402/MPP runtime for per-call tool charges:
- `analyze_repo`, `analyze_files`, `prepare_agentic_purchasing`, `improve_my_agent_with_axis`
- `iliad_web_research`, `iliad_web_research_crawl` (new resold tools)

Code reference:
- `apps/api/src/stripe.ts`
- `apps/api/src/mpp.ts`

## 4) Deployment Env Vars (Required)

Set these in Render service env vars:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID_PAID`
- `STRIPE_PRICE_ID_SUITE`
- `AXIS_WEB_URL` (already used for checkout success/cancel redirects)
- `MPP_SECRET_KEY` (strongly recommended for stable x402 challenge signing across restarts)

Current state note:
- `render.yaml` already includes `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`
- `render.yaml` currently does **not** include `STRIPE_PRICE_ID_PAID` or `STRIPE_PRICE_ID_SUITE`
- `render.yaml` already includes `MPP_SECRET_KEY` (good for x402/MPP stability)

## 4.1) Exact Stripe Changes for New Resold Tools

For the new Firecrawl resale tools, make these Stripe-side checks:

1. Ensure `STRIPE_SECRET_KEY` is live and valid in production env.
2. Ensure MPP/x402 is enabled in your Stripe account used by this key.
3. No new Stripe Product or Price object is needed for:
	- `iliad_web_research`
	- `iliad_web_research_crawl`
4. Validate by triggering each endpoint with auth and confirming paid-path behavior:
	- `POST /v1/research/scrape`
	- `POST /v1/research/crawl`

Expected behavior:
- If payment/credits are insufficient, API responds with x402 negotiation payload.
- After payment, retry succeeds and returns Firecrawl data.

## 5) Redirect URLs Used by Checkout

The checkout session currently uses:
- success URL: `${AXIS_WEB_URL}/#account` (or CORS_ORIGIN fallback)
- cancel URL: `${AXIS_WEB_URL}/#plans`

Code reference:
- `resolveCheckoutBaseUrl` + URL assembly in `apps/api/src/stripe.ts`

## 6) Quick Validation Steps

1. Create account and API key:
- `POST /v1/accounts`

2. Start checkout:
- `POST /v1/checkout` with body `{ "tier": "paid" }`
- Expect `201` + `checkout_url`

3. Complete Stripe checkout in browser.

4. Verify webhook delivery in Stripe dashboard:
- Endpoint should receive `checkout.session.completed` and `customer.subscription.*`

5. Verify subscription API:
- `GET /v1/account/subscription` should show active subscription

6. Verify new resold tool charges:
- Call `POST /v1/research/scrape` with a real URL and auth.
- Call `POST /v1/research/crawl` with a real URL and auth.
- Confirm price negotiation reflects:
	- scrape: 10 cents standard / 5 cents lite
	- crawl: 25 cents standard / 12 cents lite

## 7) Optional but Recommended

- Use Stripe test mode first (`sk_test_...`) with test prices and test webhook secret.
- Keep production and test values separated by environment.
- Rotate webhook secret and API key periodically.

---

If you want, I can also generate a second file with a copy-paste “Render env var block” (exact keys, placeholders, and where each value comes from in Stripe UI).
