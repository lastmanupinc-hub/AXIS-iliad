# @axis/paid-client

Generic client for the **PAI'D** payment processor — hosted checkout sessions and
Standard-Webhooks signature verification, with env-name-tolerant configuration. Shared
across AXIS merchant apps (Iliad, Odyssey, …) so they don't each maintain a copy.

This package is **app-agnostic**: it knows nothing about plans or tiers. Each app builds its
own `metadata` (tier, plan_id, kind, …) and passes it to `createPaidCheckoutSession`; the
webhook on the app side reads that metadata to fulfil.

## Install

```bash
npm i @axis/paid-client
```

## Usage

```ts
import {
  isPaidConfigured,
  loadPaidConfig,
  createPaidCheckoutSession,
  verifyPaidWebhookSignature,
} from "@axis/paid-client";

// Gate the PAI'D path on config (else fall back to your direct PSP):
if (isPaidConfigured()) {
  const session = await createPaidCheckoutSession({
    amountCents: 2900,
    description: "Pro plan (monthly)",
    successUrl: "https://app.example.com/#account",
    cancelUrl: "https://app.example.com/#plans",
    customerEmail: "buyer@example.com",
    metadata: { tier: "paid", plan_id: "pro", kind: "subscription" }, // YOUR app's shape
  });
  redirect(session.url); // PAI'D hosts the payment page
}

// In your webhook route, verify before trusting the body:
const ok = verifyPaidWebhookSignature({
  rawBody,
  signatureHeader: req.headers["webhook-signature"],
  signingKey: loadPaidConfig().webhookSigningKey!,
});
```

## Environment contract

The resolvers tolerate the name drift across the estate — set whichever your platform uses:

| Purpose | Accepted names (first match wins) |
|---|---|
| Base URL | `PAID_API_BASE_URL` → `PAID_API_URL` → `PAID_BASE_URL` |
| API key | `PAID_API_KEY` |
| Merchant id | `PAID_MERCHANT_ID` → `PAID_ACCOUNT_ID` |
| Webhook secret | `PAID_WEBHOOK_SIGNING_KEY` → `PAID_WEBHOOK_SECRET` |

> The webhook secret **value** must be identical on PAI'D (which signs) and the consumer
> (which verifies), regardless of which name each side stores it under.

## API

- `isPaidConfigured(env?)` / `loadPaidConfig(env?)` — config resolution.
- `resolvePaidBaseUrl(env?)` / `resolvePaidWebhookSecret(env?)` — individual resolvers.
- `createPaidCheckoutSession(input, config?)` → `CheckoutSession` — one-shot hosted checkout.
- `verifyPaidWebhookSignature(opts)` → `boolean` — Standard-Webhooks HMAC verification.
- `PaidError` — thrown on transport/HTTP failure (carries `status`, `body`).
