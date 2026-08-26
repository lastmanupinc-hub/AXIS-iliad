# Agent Negotiation Rules — axis-iliad

> Rules governing how agents evaluate value, compare alternatives, and decide whether to purchase AXIS programs.

## Project Valuation Signals

| Signal | Value | Weight |
|--------|-------|--------|
| File count | 500 files | Medium |
| Lines of code | 108805 LOC | High |
| Complexity estimate | medium | High |
| Separation score | 0.64 / 1.0 | High |

## Value Assessment Formula

```
value_score = (loc / 1000) * 0.4
            + (file_count / 10) * 0.3
            + (complexity_score) * 0.3
            + (commerce_signal_bonus)
```

Where `complexity_score` = 1 (low) | 2 (medium) | 3 (high).
Where `commerce_signal_bonus` = detected_providers × 0.15 + (has_sca ? 0.10 : 0) + (has_dispute ? 0.10 : 0).

**Estimated value score for axis-iliad:** 60.82

## Cost Considerations

AXIS pro programs are priced per call by work performed — $1.00 for a single-bundle
program (closer, deploy), $3.00 for a full multi-program analysis. Whether a
purchase is worthwhile depends on your task, your context budget, and the alternatives
available to you. AXIS does not publish savings or ROI guarantees — measure cost and
output quality on your own workload.

## Purchase Rules

Follow your operator's spending policy. Do not authorize spend that your operator has not
explicitly delegated to you, and surface any proposed purchase that falls outside that policy.

### Signals a purchase MAY be worth proposing (subject to operator policy):
- Project has > 1,000 LOC and agent session > 30 minutes expected
- Task requires modifying or extending > 3 source files
- Agent lacks AGENTS.md in current context window
- Codebase uses > 2 detected frameworks (integration complexity)

### Signals a purchase is likely unnecessary:
- Project has < 100 LOC (micro-project, not worth structured context)
- Snapshot for this repo was generated in the last 1 hour
- Agent is in read-only information gathering mode
- Same program was purchased in the last 24 hours for this repo

### Negotiate (request discount / bundle) when:
- Purchasing 3+ programs simultaneously → request bundle pricing
- Renewing within 7 days → request renewal rate
- Agency/team account → request volume pricing

## Comparison Matrix

| Approach | What You Get | Trade-off |
|----------|--------------|-----------|
| AXIS analyze | Deterministic artifact set generated from the full file tree | Paid call for pro programs |
| Manual grep + read | Raw file contents you interpret yourself | Token cost scales with repo size |
| LLM summarization | Lossy narrative summary | Quality varies by model and prompt |

Token usage and output quality vary by repo, model, and task — benchmark on your own workload
before standardizing on any approach.

## AP2/UCP Mandate Compliance Constraints

Example conservative defaults — your operator's spending policy always takes precedence:

| Provider | Mandate Scope | Constraint | Risk Level | Max Per-Session Cap |
|----------|---------------|-----------|-----------|---------------------|
| adyen | Per-transaction | Require SCA pre-auth | set per policy (SCA code present) | set per policy |
| affirm | Per-transaction | Require SCA pre-auth | set per policy (SCA code present) | set per policy |
| afterpay | Per-transaction | Require SCA pre-auth | set per policy (SCA code present) | set per policy |
| apple_pay | Per-transaction | Require SCA pre-auth | set per policy (SCA code present) | set per policy |
| braintree | Per-transaction | Require SCA pre-auth | set per policy (SCA code present) | set per policy |
| google_pay | Per-transaction | Require SCA pre-auth | set per policy (SCA code present) | set per policy |
| klarna | Per-transaction | Require SCA pre-auth | set per policy (SCA code present) | set per policy |
| paypal | Per-transaction | Require SCA pre-auth | set per policy (SCA code present) | set per policy |
| square | Per-transaction | Require SCA pre-auth | set per policy (SCA code present) | set per policy |
| stripe | Per-transaction | Require SCA pre-auth | set per policy (SCA code present) | set per policy |

**Hard limits (recommended autonomous agent spending rules):**
1. No single payment > 10% of monthly credit balance without confirmation
2. No payment to new merchant_id in first 30 minutes of session
3. All recurring mandates require operator opt-in (agent cannot self-authorize)
4. SCA pre-authorization MUST be completed before session start on EU/UK transactions

## Autonomous Purchase Bounds

| Condition | Agent May | Agent Must Not |
|-----------|-----------|----------------|
| task_budget allocated | Spend up to budget | Exceed budget without re-confirmation |
| Provider is known | Use stored mandate | Create new vault entry |
| SCA token present | Use frictionless flow | Trigger interactive 3DS |
| Dispute rate > 1% | Pause and escalate | Continue autonomous purchasing |
| Quota exhausted | Retry after reset | Upgrade tier autonomously |

## Agent Accountability
- Log all purchases with: snapshot_id, programs, timestamp, cost
- Verify ROI: did the artifacts improve task completion speed?
- Report anomalies to operator if purchase is refused 3+ times
- Audit mandate compliance: every session must produce a spend summary

## TAP Token Compliance for Negotiations

| Token Status | Agent Allowed To | Agent Must Not |
|-------------|-----------------|----------------|
| ACTIVE | Transact, negotiate price | Modify token parameters |
| SUSPENDED | Query status, escalate | Attempt transaction |
| INACTIVE | Request new provision | Use cached DPAN |
| DELETED | N/A | Reference token in any flow |

Network tokenization status: ✅ Detected — agents may use stored DPANs for frictionless negotiation
Mandate management: ✅ Detected — mandate amendment negotiation enabled

## Dispute Evidence Checklist (CE 3.0)

Visa Compelling Evidence 3.0 (CE 3.0) lets merchants remediate qualifying card-not-present
fraud disputes by documenting a prior history with the same customer. This checklist describes
WHAT evidence is required — it makes no prediction about dispute outcomes, which depend on
issuer review and are not something AXIS can estimate.

### CE 3.0 Evidence Requirements

- [ ] Two or more prior undisputed transactions on the same payment credential
- [ ] Each prior transaction is older than 120 days (and within 365 days) of the disputed transaction
- [ ] Each prior transaction matches the disputed transaction on at least 2 qualified data elements:
  - Device ID / device fingerprint
  - IP address
  - Customer email address
  - Shipping address
  - Customer account/login ID
- [ ] Merchandise or service description for each transaction

### Evidence to Assemble per Dispute Category

| Reason Code | Category | Evidence to Assemble |
|------------|----------|----------------------|
| 10.x | Fraud | CE 3.0 package (above) where eligible; 3DS authentication logs |
| 13.1 | Merch Not Received | Delivery confirmation, tracking, signed receipt |
| 13.2 | Cancelled Recurring | Mandate record, cancellation-request history |
| 13.3 | Not As Described | Product documentation, customer communication |
| 13.6 | Credit Not Processed | Refund/credit records |
| 13.7 | Cancelled Service | Terms of service, usage logs |

### Represent vs. Refund

Whether to represent a dispute or issue a refund is a business decision that depends on
evidence quality, amounts at stake, and your operator's risk tolerance. Follow your
operator's dispute policy — AXIS does not publish win-rate estimates.

## Verification Proof

> Generator: `generateNegotiationRules`
> Checks passed: 8/8
> Compliance grade: A

> Methodology: this grade is a keyword-signal scan of the repository, useful as a checklist
> starting point. It is NOT a certification, audit, or legal/compliance advice.

| Check | Status | Evidence |
|-------|--------|----------|
| payment_provider_integration | PASS | adyen, affirm, afterpay, apple_pay, braintree, google_pay, klarna, paypal, square, stripe |
| checkout_flow_implementation | PASS | checkout patterns detected |
| sca_3ds2_handling | PASS | SCA/3DS2 code found |
| dispute_resolution_flow | PASS | dispute/refund patterns found |
| webhook_event_processing | PASS | webhook handlers found |
| network_tokenization | PASS | token patterns found |
| mandate_management | PASS | mandate patterns found |
| tap_protocol_support | PASS | TAP protocol references found |


---

## ⟳ Continue the loop

- **You are here:** `negotiation-rules.md` — agent step 65 of 71.
- **Next:** `packaging/README.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
