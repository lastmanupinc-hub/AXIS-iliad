# Stripe Changes Required (Exact)

This runbook lists exactly what must be configured in Stripe and in deployment env vars for this repository.

It now includes both billing surfaces:
- Subscription checkout (Pro and Suite)
- Per-call resold tools via x402/MPP (including new Firecrawl tools)

## Strategy-Faithful Migration Checklist (Blended Credit Model)

Use this checklist to align Stripe with the pricing strategy:
- Free: $0 / 10,000 monthly credits
- Starter: $29 / 75,000 monthly credits
- Pro: $99 / 300,000 monthly credits
- Growth: $299 / 1,200,000 monthly credits
- Annual billing: 20% discount
- Overage: $0.0018 per credit

### 1) Create Stripe products and recurring prices

Create monthly + annual prices for three paid tiers:
1. Starter monthly: $29
2. Starter annual: $278.40
3. Pro monthly: $99
4. Pro annual: $950.40
5. Growth monthly: $299
6. Growth annual: $2,870.40

### 2) Add env vars for each paid tier and billing cycle

Add these to deployment:
- STRIPE_PRICE_ID_STARTER_MONTHLY
- STRIPE_PRICE_ID_STARTER_ANNUAL
- STRIPE_PRICE_ID_PRO_MONTHLY
- STRIPE_PRICE_ID_PRO_ANNUAL
- STRIPE_PRICE_ID_GROWTH_MONTHLY
- STRIPE_PRICE_ID_GROWTH_ANNUAL

Keep existing Stripe vars:
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET

### 3) Extend checkout payload contract

Update API request contract from tier-only to include plan + billing cycle:
- plan: starter | pro | growth
- billing_cycle: monthly | annual

### 4) Update checkout price selection logic

In the checkout handler, map plan + billing_cycle to the six Stripe price IDs.
Fail closed if a selected plan/cycle price is not configured.

### 5) Keep webhook events unchanged

Current webhook event subscriptions remain valid:
- checkout.session.completed
- customer.subscription.created
- customer.subscription.updated
- customer.subscription.deleted
- invoice.payment_failed

### 6) Add credit allowances by plan in backend

Set monthly included credits by plan:
- free: 10,000
- starter: 75,000
- pro: 300,000
- growth: 1,200,000

### 7) Implement overage billing path

When credits are exhausted:
1. Continue serving requests when policy allows
2. Record overage credits consumed
3. Bill overage at $0.0018 per credit
4. For autonomous flows, return x402 challenge with payment metadata when immediate settlement is required

### 8) Update frontend plan labels and checkout mapping

Map checkout actions to:
- Starter -> starter
- Pro -> pro
- Growth -> growth
and send billing_cycle for monthly/annual.

### 9) Validate end-to-end

1. Start checkout for each plan/cycle combination (6 total)
2. Complete Stripe checkout in test mode
3. Verify webhook delivery and subscription state
4. Verify credit ledger and monthly allowance assignment
5. Trigger overage and confirm $0.0018/credit billing logic

## 1) Stripe Dashboard: Create/Verify Prices

The API checkout endpoint now reads six recurring Stripe Price IDs, plus legacy aliases:
- `STRIPE_PRICE_ID_STARTER` / `STRIPE_PRICE_ID_STARTER_ANNUAL`
- `STRIPE_PRICE_ID_PRO` / `STRIPE_PRICE_ID_PRO_ANNUAL`
- `STRIPE_PRICE_ID_GROWTH` / `STRIPE_PRICE_ID_GROWTH_ANNUAL`
- legacy aliases still accepted: `STRIPE_PRICE_ID_PAID`, `STRIPE_PRICE_ID_PAID_ANNUAL`, `STRIPE_PRICE_ID_SUITE`

Code references:
- `POST /v1/checkout` reads these env vars and fails if missing: `apps/api/src/stripe.ts`
- checkout validation now accepts `plan_id: starter | pro | growth` (legacy `tier` aliases are still accepted): `apps/api/src/stripe.ts`

### Required Stripe objects

1. Product: Axis Starter
- Billing: Recurring
- Amount: USD $29.00 monthly
- Annual amount: USD $278.40 yearly
- Save resulting `price_...` IDs as `STRIPE_PRICE_ID_STARTER` and `STRIPE_PRICE_ID_STARTER_ANNUAL`

2. Product: Axis Pro
- Billing: Recurring
- Amount: USD $99.00 monthly
- Annual amount: USD $950.40 yearly
- Save resulting `price_...` IDs as `STRIPE_PRICE_ID_PRO` and `STRIPE_PRICE_ID_PRO_ANNUAL`

3. Product: Axis Growth
- Billing: Recurring
- Amount: USD $299.00 monthly
- Annual amount: USD $2,870.40 yearly
- Save resulting `price_...` IDs as `STRIPE_PRICE_ID_GROWTH` and `STRIPE_PRICE_ID_GROWTH_ANNUAL`

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
- `STRIPE_PRICE_ID_STARTER`
- `STRIPE_PRICE_ID_STARTER_ANNUAL`
- `STRIPE_PRICE_ID_PRO`
- `STRIPE_PRICE_ID_PRO_ANNUAL`
- `STRIPE_PRICE_ID_GROWTH`
- `STRIPE_PRICE_ID_GROWTH_ANNUAL`
- optional legacy aliases for older deployments:
	- `STRIPE_PRICE_ID_PAID`
	- `STRIPE_PRICE_ID_PAID_ANNUAL`
	- `STRIPE_PRICE_ID_SUITE`
- `AXIS_WEB_URL` (already used for checkout success/cancel redirects)
- `MPP_SECRET_KEY` (strongly recommended for stable x402 challenge signing across restarts)

Current state note:
- `render.yaml` already includes `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`
- `render.yaml` currently does **not** include the new `STRIPE_PRICE_ID_STARTER*`, `STRIPE_PRICE_ID_PRO*`, or `STRIPE_PRICE_ID_GROWTH*` keys
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
- `POST /v1/checkout` with body `{ "plan_id": "starter" }`
- Expect `201` + `checkout_url`

3. Repeat with `plan_id: pro` and `plan_id: growth` to validate all plan/cycle combinations.

4. Complete Stripe checkout in browser.

5. Verify webhook delivery in Stripe dashboard:
- Endpoint should receive `checkout.session.completed` and `customer.subscription.*`

6. Verify subscription API:
- `GET /v1/account/subscription` should show active subscription

7. Verify new resold tool charges:
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
