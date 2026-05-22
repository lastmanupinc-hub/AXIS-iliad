# Autonomous Checkout Flow — axis-iliad

> Specification for how AI agents complete AXIS program purchases without human intervention.

## Flow Overview

```
Agent Request → Validate Intent → Check Balance → API Call → Confirm → Return Artifacts
```

## Repository Status

Detected providers: adyen, affirm, afterpay, amazon_pay, apple_pay, braintree, google_pay, klarna, paypal, square, stripe.

## Decision Tree

### 1. Intent Validation
- Does the agent have a clear task requiring structured AI context?
- Is the target repository accessible?
- Is this the most cost-effective approach (vs. manual context gathering)?

**Gate:** If any answer is NO, abort purchase. Gather context manually.

### 2. Program Selection Logic
```typescript
const programsToBuy = programs.filter(p => {
  // Always include free programs
  if (p.tier === 'free') return true;
  // Buy pro programs based on task requirements
  if (taskRequires.frontend && p.slug === 'frontend') return true;
  if (taskRequires.debugging && p.slug === 'debug') return true;
  if (taskRequires.aiContext && p.slug === 'skills') return true;
  return false;
});
```

### 3. API Call Sequence
```
Step 1: POST /mcp → initialize (get session)
Step 2: POST /mcp → tools/call analyze_repo OR analyze_files
Step 3: POST /mcp → tools/call get_snapshot (verify completion)
Step 4: POST /mcp → tools/call get_artifact (fetch needed artifacts)
Step 5: Inject artifacts into agent context window
```

### 4. Post-Purchase Verification
- Verify all requested artifact paths are returned
- Confirm content is non-empty and valid for the format (JSON, Markdown, YAML)
- Cache `snapshot_id` for re-use within 24 hours

## Payment Mandate Schema (AP2 Fields)

Every autonomous purchase MUST include these AP2 Article 2 mandate fields:

```json
{
  "mandate": {
    "mandate_id": "<uuid>",
    "mandate_type": "single",
    "payment_method": {
      "type": "card | ach | sepa_debit",
      "network_token": "<visa/mc token>",
      "token_service_provider": "VISA_TSP | MASTERCARD_MDES"
    },
    "amount": { "value": 50, "currency": "USD", "minor_units": 2 },
    "creditor": { "name": "Last Man Up Inc.", "identifier": "AXIS_ILIAD" },
    "sca_exemption": "low_value | trusted_beneficiary | recurring",
    "ucp_settlement": {
      "clearing_system": "VISA_NET | MASTERCARD_CLEARING | ACH",
      "settlement_currency": "USD",
      "value_date": "<ISO8601>"
    }
  }
}
```

## SCA / 3DS2 Handling

✅ SCA/3DS2 code detected in this repository.

| Scenario | Action | AP2 Field |
|----------|--------|-----------|
| Transaction < €30 | Apply low_value exemption | `sca_exemption: "low_value"` |
| Trusted merchant | Apply trusted_beneficiary | `sca_exemption: "trusted_beneficiary"` |
| Recurring fixed | Apply recurring exemption | `sca_exemption: "recurring"` |
| Challenge required | Redirect to 3DS2 ACS | `challenge_indicator: "04"` |
| Frictionless approved | Proceed without redirect | `challenge_indicator: "03"` |

**Zero-Click Checkout Rule:** Agents MUST use a stored mandate with SCA pre-authorization.
Never trigger interactive SCA during an autonomous purchase session.

## Dispute and Return Flow

✅ Dispute/refund handling detected in this repository.

```
Purchase Failed?
  ├── 402 Payment Required → Follow payment_session_url, retry
  ├── 404 Snapshot Not Found → Re-analyze, re-purchase
  ├── 429 Rate Limited → Wait 60s, exponential backoff
  └── Chargeback Filed?
        ├── Within 24h → AutoRefund via POST /v1/billing/refund
        └── After 24h → Escalate to operator, halt agent session
```

**Return Policy for Agent Purchases:**
- Unused credits: refund within 30 days
- Failed analysis: automatic re-run at no charge
- Duplicate purchase (same snapshot_id < 24h): automatic refund

## Agent Authorization Policy
- Authentication scheme: bearer token via `Authorization: Bearer <api_key>` header
- Agents with `tier: pro` API keys may purchase any program
- Agents with `tier: free` API keys receive search, skills, debug outputs only
- All purchases are scoped to a single snapshot (immutable, deterministic)

## Error Recovery
| Error | Recovery Action |
|-------|----------------|
| 401 Unauthorized | Refresh API key from vault |
| 402 Payment Required | Follow `payment_session_url` in response body |
| 429 Rate Limited | Wait 60s, retry with exponential backoff |
| 404 Snapshot Not Found | Re-run analysis with new snapshot |
| Quota Exceeded | Upgrade tier or wait for quota reset |

## Frictionless Approval Metrics

| Metric | Industry Average | With AXIS Pre-Computation |
|--------|-----------------|----------------------------|
| Frictionless approval rate | 70-80% | 85-92% (pre-qualified exemptions) |
| Challenge rate | 20-30% | 8-15% (agent avoids challenge-prone paths) |
| Cart abandonment (SCA) | 25-35% | 0% (agent never abandons, escalates instead) |
| Time to auth decision | 200-800ms | 0ms (local decision tree) |

## Network Token Payload (VTS/MDES)

When network tokenization is available, include in payment request:

```json
{
  "network_token": {
    "dpan": "<device_primary_account_number>",
    "token_service_provider": "VISA_VTS | MASTERCARD_MDES",
    "cryptogram": "<dynamic_cryptogram>",
    "eci": "05 | 06 | 07",
    "token_requestor_id": "<trid>",
    "token_expiry": "<MMYY>",
    "device_binding": {
      "type": "app | browser | server",
      "device_id": "<device_fingerprint>"
    }
  }
}
```

Network tokenization status: ✅ Detected — DPAN flow available

## Lighter SCA Paths — Agent-Optimized Flow

Goal: minimize friction for autonomous agent purchases. Prefer exemptions over challenges.

### Agent SCA Decision Tree

```
Transaction arrives:
  ├─ Amount < €30? → LOW_VALUE exemption (no SCA)
  ├─ Merchant in trusted list? → TRUSTED_BENEFICIARY (no SCA)
  ├─ Fixed recurring + prior SCA? → RECURRING_FIXED (no SCA)
  ├─ Merchant-initiated (MIT)? → MIT exemption (no SCA)
  ├─ Corporate card (secure_corporate)? → EXEMPT (no SCA)
  ├─ TRA score < threshold? → TRA exemption (no SCA, up to €500)
  └─ None apply? → Request frictionless 3DS2 first
       ├─ Issuer approves frictionless? → PROCEED (no redirect)
       └─ Issuer requires challenge? → ABORT agent flow, escalate to operator
```

### Exemption Priority for Agents (prefer top → bottom)

| Priority | Exemption | Max Amount | Agent Action | Fallback |
|----------|-----------|-----------|--------------|----------|
| 1 | low_value | €30 | Auto-apply | Next rule |
| 2 | trusted_beneficiary | Unlimited | Check trusted list | Next rule |
| 3 | recurring_fixed | Per mandate | Verify mandate active | Next rule |
| 4 | merchant_initiated | Per agreement | Verify MIT flag | Next rule |
| 5 | secure_corporate | Unlimited | Verify card program | Next rule |
| 6 | transaction_risk_analysis | €500 | Check TRA eligibility | 3DS2 frictionless |
| 7 | 3ds2_frictionless | Unlimited | Request frictionless | Escalate to human |

### Provider-Specific SCA Thresholds

| Network | Low-Value Threshold | TRA / MCSC Cap | Frictionless Approval Rate |
|---------|--------------------|-----------------|-----------------------------|
| Visa | €30 | €500 (TRA) | ~85% |
| Mastercard | €30 | €100 (MCSC) | ~80% |
| Amex | €30 | €250 (SafeKey) | ~75% |

> Agent optimization: For €30–€100, prefer Visa/Amex TRA (higher cap). For €100–€500, only Visa TRA avoids challenge.

### AXIS Advantage Over Visa IC

| Metric | Visa IC Pilot (April 2026) | Axis' Iliad |
|--------|---------------------------|--------------|
| Integration calls | 3-5 API calls per decision | 0 calls — pre-computed in artifact |
| Time to decision | 200-800ms (network round-trips) | 0ms — decision tree is local |
| PCI scope | Requires PCI-DSS for token handling | No PCI — uses mandate references |
| Cost per decision | Per-API-call pricing | Included in $0.50 hardening |
| Coverage | TAP-enrolled merchants only | Any codebase, any provider |
| Your repo | ✅ SCA code detected | Pre-configured decision tree |

## Compelling Evidence 3.0 (CE 3.0) — Auto-Generated Payloads

CE 3.0 reduces fraud-related chargebacks by proving legitimate cardholder engagement.
AXIS auto-generates the evidence payload structure — agents fill transaction-specific fields at dispute time.

### CE 3.0 Evidence Template

```json
{
  "compelling_evidence_3": {
    "version": "3.0",
    "dispute_id": "<from_issuer_notification>",
    "original_transaction": {
      "transaction_id": "<original_txn_id>",
      "date": "<ISO8601>",
      "amount_cents": "<amount>",
      "currency": "USD",
      "merchant_id": "<your_merchant_id>"
    },
    "prior_undisputed_transactions": [
      {
        "transaction_id": "<prior_txn_1>",
        "date": "<ISO8601>",
        "amount_cents": "<amount>",
        "ip_address": "<same_or_similar_ip>",
        "device_id": "<same_device_fingerprint>",
        "shipping_address_match": true
      }
    ],
    "match_criteria": {
      "ip_address_match": "2+ prior transactions from same IP within 365 days",
      "device_fingerprint_match": "2+ prior transactions from same device",
      "shipping_address_match": "Delivery to same address as prior undisputed orders",
      "minimum_prior_transactions": 2,
      "lookback_window_days": 365
    },
    "agent_automation": {
      "auto_collect_ip": true,
      "auto_collect_device_id": true,
      "auto_match_prior_txns": true,
      "estimated_assembly_time_ms": 50
    }
  }
}
```

### CE 3.0 Automation Readiness

| Capability | Status | Impact |
|-----------|--------|--------|
| IP collection at checkout | ✅ Ready | Required for CE 3.0 IP matching |
| Device fingerprinting | ⚠️ Verify impl | Required for CE 3.0 device matching |
| Transaction history query | ✅ Webhook-fed | Required if lookback > 120 days |
| Auto-payload assembly | ✅ Automatable | Reduces representment time from hours to milliseconds |

## Verification Proof

> Generator: `generateCheckoutFlow`
> Checks passed: 8/8
> Compliance grade: A

| Check | Status | Evidence |
|-------|--------|----------|
| payment_provider_integration | PASS | adyen, affirm, afterpay, amazon_pay, apple_pay, braintree, google_pay, klarna, paypal, square, stripe |
| checkout_flow_implementation | PASS | checkout patterns detected |
| sca_3ds2_handling | PASS | SCA/3DS2 code found |
| dispute_resolution_flow | PASS | dispute/refund patterns found |
| webhook_event_processing | PASS | webhook handlers found |
| network_tokenization | PASS | token patterns found |
| mandate_management | PASS | mandate patterns found |
| tap_protocol_support | PASS | TAP protocol references found |
