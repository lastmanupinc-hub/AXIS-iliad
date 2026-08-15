import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { GeneratedFile, SourceFile } from "./types.js";
import { mdText, mdInline } from "./md-sanitize.js";
import { proofDigest } from "./commerce-engines.js";
import { PROGRAM_ORDER, PROGRAM_OUTPUT_COUNTS, bundleOutputs } from "./program-manifest.js";
import {
  CE3_MIN_PRIOR_TRANSACTIONS,
  CE3_MIN_PRIOR_TRANSACTION_AGE_DAYS,
  CE3_LOOKBACK_DAYS,
  CE3_MIN_MATCHING_DATA_ELEMENTS,
  CE3_QUALIFIED_DATA_ELEMENTS,
  CE3_TARGET_REASON_CODES,
} from "@axis/agentic-compliance";
import {
  demoKeyPair,
  signMandate,
  encodeMandate,
  verifyMandate,
  signTapMessage,
  encodeTapMessage,
  verifyTapMessage,
  signUcpMessage,
  encodeUcpMessage,
  verifyUcpMessage,
  type IntentMandate,
  type CartMandate,
  type PaymentMandate,
  type TapTokenMessage,
  type UcpSettlementMessage,
} from "@axis/ap2";

/**
 * Canonical counts — must equal `listAvailableGenerators().length` and the
 * unique program count from GENERATOR_PROGRAMS. The counts.consistency.test
 * pins these to TOTAL_GENERATORS / TOTAL_PROGRAMS from ./generate.js so any
 * drift fails CI.
 */
const ARTIFACT_COUNT = 147; // +3 verify-gate (verify.sh, verify-full.sh, .githooks/pre-push); +1 ap2-interop-samples.json (WO-07); +1 model-cascade.md (H7.1); +1 architecture-diagram.d2 (app_24); +1 seo-head-tags.html (app_30)
const PROGRAM_COUNT = 21;

/**
 * Program: agentic-purchasing
 * Generates 6 artifacts that enable AI agents to autonomously discover, evaluate,
 * and purchase AXIS analysis programs for any codebase.
 */

// ─── AP2 / TAP / UCP real signed samples (WO-07) ───────────────────
//
// Fixed IDs + a fixed clock (NOT ctx.generated_at, NOT Date.now()) plus the
// @axis/ap2 deterministic demo keypair (see @axis/ap2's jws.ts) — so the same
// analysis input always renders BYTE-IDENTICAL output for this section,
// independent of the repository being analyzed (a determinism gate; see
// ap2-interop.test.ts). This is a demo identity only — real integrations
// MUST use generateEd25519() (or an equivalent real keypair) plus a real
// secret store, never this fixed seed.

const AP2_DEMO_INTENT: IntentMandate = {
  kind: "intent",
  version: "ap2/1",
  id: "intent_axis_demo_001",
  user_id: "agent_demo_001",
  description: "Autonomous purchase of an AXIS analysis program",
  constraints: { max_amount: { currency: "USD", value: "5.00" } },
  created_at: "2026-01-01T00:00:00.000Z",
  expires_at: "2026-01-08T00:00:00.000Z",
};

const AP2_DEMO_CART: CartMandate = {
  kind: "cart",
  version: "ap2/1",
  id: "cart_axis_demo_001",
  intent_ref: AP2_DEMO_INTENT.id,
  merchant_id: "AXIS_ILIAD",
  items: [
    {
      sku: "program-agentic-purchasing",
      name: "AXIS agentic-purchasing program",
      quantity: 1,
      unit_price: { currency: "USD", value: "0.50" },
    },
  ],
  total: { currency: "USD", value: "0.50" },
  created_at: "2026-01-01T00:01:00.000Z",
};

const AP2_DEMO_PAYMENT: PaymentMandate = {
  kind: "payment",
  version: "ap2/1",
  id: "payment_axis_demo_001",
  cart_ref: AP2_DEMO_CART.id,
  method: { type: "token", token_ref: "tok_axis_demo_001" },
  amount: { currency: "USD", value: "0.50" },
  created_at: "2026-01-01T00:02:00.000Z",
};

const TAP_DEMO_TOKEN: TapTokenMessage = {
  kind: "tap.token",
  version: "tap/1",
  token_id: "token_axis_demo_001",
  event: "provision",
  token_requestor_id: "trid_axis_demo_001",
  dpan_last4: "4242",
  mandate_ref: AP2_DEMO_CART.id,
  occurred_at: "2026-01-01T00:03:00.000Z",
};

const UCP_DEMO_SETTLEMENT: UcpSettlementMessage = {
  kind: "ucp.settlement",
  version: "ucp/1",
  settlement_id: "settlement_axis_demo_001",
  payment_ref: AP2_DEMO_PAYMENT.id,
  clearing_system: "VISA_NET",
  amount: { currency: "USD", value: "0.50" },
  value_date: "2026-01-02",
  settlement_finality: "final",
};

// Residual honesty caveat — MUST stay in both the rendered artifact and the
// ap2-interop-samples.json generator output (guarded by ap2-interop.test.ts).
// "Interoperability" here means "produces and verifies well-formed,
// cryptographically-signed messages matching the modeled schemas" — NOT
// certified network interoperability.
const AP2_SCOPE_CAVEAT =
  "Scope: these samples are produced and verified by @axis/ap2's real encode/sign/verify codecs — " +
  "conformant to AXIS's TypeScript encoding of the public AP2 mandate schema, and to TAP/UCP message " +
  "shapes modeled from public documentation (neither protocol has a public wire schema to conform " +
  "against). Verified only against self-authored, frozen golden-vector fixtures — NOT certified " +
  "against an official AP2/TAP/UCP conformance suite, nor exercised against a live Visa/Mastercard " +
  "network or counterparty.";

// This entire compliance kit (CE 3.0, SCA/3DS2 exemptions, the Visa dispute
// lifecycle, network tokenization) is card-network scoped — every mechanic
// below assumes a card rail with an issuer, an acquirer, and a chargeback
// process. AXIS's OTHER payment rail (direct on-chain USDC settlement, see
// docs/x402/CONTRACT.md) has none of that: no issuer, no SCA challenge, no
// chargeback to dispute. This note exists so a reader who ALSO accepts that
// rail doesn't read a card-specific compliance section as a claim about it.
const RAIL_APPLICABILITY_NOTE =
  "> **Rail scope**: this section is card-network specific (Visa/Mastercard rules, issuer/acquirer " +
  "roles, chargeback process). If you also accept direct on-chain USDC payments (e.g. via x402), " +
  "none of this applies there — that rail has no chargebacks, no SCA challenge, and no dispute " +
  "lifecycle to manage. Treat this section as scoped to card transactions only.";

interface Ap2Samples {
  signedIntent: ReturnType<typeof signMandate<IntentMandate>>;
  signedCart: ReturnType<typeof signMandate<CartMandate>>;
  signedPayment: ReturnType<typeof signMandate<PaymentMandate>>;
  signedTap: ReturnType<typeof signTapMessage>;
  signedUcp: ReturnType<typeof signUcpMessage>;
  publicKey: string;
}

/** Build (and sign) the fixed demo sample set once — every caller gets the
 *  same deterministic bytes since the keypair, IDs, and timestamps are fixed. */
function buildAp2Samples(): Ap2Samples {
  const kp = demoKeyPair();
  return {
    signedIntent: signMandate(AP2_DEMO_INTENT, kp.privateKey, kp.publicKeySpkiB64),
    signedCart: signMandate(AP2_DEMO_CART, kp.privateKey, kp.publicKeySpkiB64),
    signedPayment: signMandate(AP2_DEMO_PAYMENT, kp.privateKey, kp.publicKeySpkiB64),
    signedTap: signTapMessage(TAP_DEMO_TOKEN, kp.privateKey, kp.publicKeySpkiB64),
    signedUcp: signUcpMessage(UCP_DEMO_SETTLEMENT, kp.privateKey, kp.publicKeySpkiB64),
    publicKey: kp.publicKeySpkiB64,
  };
}

// ─── Commerce Signal Detection ────────────────────────────────────

export interface CommerceSignals {
  detected_providers: string[];
  has_checkout: boolean;
  has_recurring: boolean;
  has_sca: boolean;
  has_dispute_handling: boolean;
  has_webhooks: boolean;
  has_tap_protocol: boolean;
  has_network_tokenization: boolean;
  has_mandate_management: boolean;
  total_payment_files: number;
}

const PROVIDER_PATTERNS: Record<string, RegExp> = {
  stripe:     /stripe/i,
  paypal:     /paypal/i,
  adyen:      /adyen/i,
  braintree:  /braintree/i,
  square:     /squareup|square\.com/i,
  apple_pay:  /apple.?pay/i,
  google_pay: /google.?pay/i,
  amazon_pay: /amazon.?pay/i,
  klarna:     /klarna/i,
  affirm:     /affirm/i,
  afterpay:   /afterpay|clearpay/i,
};

export function detectCommerceSignals(files: SourceFile[] | undefined): CommerceSignals {
  if (!files || files.length === 0) {
    return { detected_providers: [], has_checkout: false, has_recurring: false, has_sca: false, has_dispute_handling: false, has_webhooks: false, has_tap_protocol: false, has_network_tokenization: false, has_mandate_management: false, total_payment_files: 0 };
  }

  const providers = new Set<string>();
  const paymentPaths = new Set<string>();
  let hasCheckout = false;
  let hasRecurring = false;
  let hasSCA = false;
  let hasDispute = false;
  let hasWebhooks = false;
  let hasTAP = false;
  let hasNetworkToken = false;
  let hasMandate = false;

  for (const file of files) {
    const combined = `${file.path} ${file.content}`;
    for (const [name, pat] of Object.entries(PROVIDER_PATTERNS)) {
      if (pat.test(combined)) { providers.add(name); paymentPaths.add(file.path); }
    }
    if (/checkout|cart|basket|order.?total|purchase|buy.?now/i.test(combined)) { hasCheckout = true; paymentPaths.add(file.path); }
    if (/subscription|recurring|mandate|installment|billing.?cycle|renew/i.test(combined)) hasRecurring = true;
    if (/3ds|threeds|sca|strong.?auth|challenge|frictionless|psd2/i.test(combined)) hasSCA = true;
    if (/dispute|chargeback|refund|reversal|return.?policy/i.test(combined)) hasDispute = true;
    if (/webhook|event.?handler|payment.?event|ipn/i.test(combined)) hasWebhooks = true;
    if (/tap.?protocol|token.?action|action.?protocol|tap.?api/i.test(combined)) hasTAP = true;
    if (/network.?token|pan.?token|dpan|fpan|token.?requestor|token.?service.?provider|mdes|vts/i.test(combined)) hasNetworkToken = true;
    if (/mandate.?id|mandate.?type|mandate.?reference|sepa.?mandate|bacs.?mandate|mandate.?management/i.test(combined)) hasMandate = true;
  }

  return {
    detected_providers: [...providers].sort(),
    has_checkout: hasCheckout,
    has_recurring: hasRecurring,
    has_sca: hasSCA,
    has_dispute_handling: hasDispute,
    has_webhooks: hasWebhooks,
    has_tap_protocol: hasTAP,
    has_network_tokenization: hasNetworkToken,
    has_mandate_management: hasMandate,
    total_payment_files: paymentPaths.size,
  };
}

// Per-provider EVIDENCE from the analyzed repo — what actually co-occurs in the
// files that mention a given provider. This replaces hardcoded provider "facts"
// (e.g. "stripe supports tokenization") with what THIS codebase demonstrably
// contains, so the playbook never asserts a capability the repo can't back up.
interface ProviderEvidence { files: number; tokenization: boolean; mandateTypes: string; sca: boolean }
function detectProviderEvidence(provider: string, files: SourceFile[] | undefined): ProviderEvidence {
  const pat = PROVIDER_PATTERNS[provider as keyof typeof PROVIDER_PATTERNS];
  const matched = (files ?? []).filter((f) => pat && pat.test(`${f.path} ${f.content}`));
  const blob = matched.map((f) => f.content).join("\n");
  const parts: string[] = [];
  if (/mandate/i.test(blob)) parts.push("mandate");
  if (/subscription|recurring|renew|installment/i.test(blob)) parts.push("recurring");
  if (/one.?time|one.?off|single.?payment|setup.?intent/i.test(blob)) parts.push("single");
  return {
    files: matched.length,
    tokenization: /network.?token|pan.?token|dpan|fpan|token.?requestor|token.?service|mdes|vts/i.test(blob),
    mandateTypes: parts.join(", "),
    sca: /3ds|threeds|\bsca\b|strong.?auth|psd2|challenge|frictionless/i.test(blob),
  };
}

// ─── Verification Proof Generator ─────────────────────────────────

function buildVerificationProof(signals: CommerceSignals, generatorName: string): string {
  const checks = [
    { name: "payment_provider_integration", passed: signals.detected_providers.length > 0, evidence: signals.detected_providers.join(", ") || "none" },
    { name: "checkout_flow_implementation", passed: signals.has_checkout, evidence: signals.has_checkout ? "checkout patterns detected" : "not detected" },
    { name: "sca_3ds2_handling", passed: signals.has_sca, evidence: signals.has_sca ? "SCA/3DS2 code found" : "not detected" },
    { name: "dispute_resolution_flow", passed: signals.has_dispute_handling, evidence: signals.has_dispute_handling ? "dispute/refund patterns found" : "not detected" },
    { name: "webhook_event_processing", passed: signals.has_webhooks, evidence: signals.has_webhooks ? "webhook handlers found" : "not detected" },
    { name: "network_tokenization", passed: signals.has_network_tokenization, evidence: signals.has_network_tokenization ? "token patterns found" : "not detected" },
    { name: "mandate_management", passed: signals.has_mandate_management, evidence: signals.has_mandate_management ? "mandate patterns found" : "not detected" },
    { name: "tap_protocol_support", passed: signals.has_tap_protocol, evidence: signals.has_tap_protocol ? "TAP protocol references found" : "not detected" },
  ];
  const passed = checks.filter(c => c.passed).length;
  const total = checks.length;
  const rows = checks.map(c => `| ${c.name} | ${c.passed ? "PASS" : "FAIL"} | ${c.evidence} |`).join("\n");

  return [
    `## Verification Proof`,
    ``,
    `> Generator: \`${generatorName}\``,
    `> Checks passed: ${passed}/${total}`,
    `> Compliance grade: ${passed >= 6 ? "A" : passed >= 4 ? "B" : passed >= 2 ? "C" : "D"}`,
    ``,
    `> Methodology: this grade is a keyword-signal scan of the repository, useful as a checklist`,
    `> starting point. It is NOT a certification, audit, or legal/compliance advice.`,
    ``,
    `| Check | Status | Evidence |`,
    `|-------|--------|----------|`,
    rows,
  ].join("\n");
}

// ─── TAP/AP2/UCP Interop Schemas ──────────────────────────────────

function buildAP2ComplianceScoring(signals: CommerceSignals): string {
  const art2 = (signals.detected_providers.length > 0 ? 5 : 0) + (signals.has_mandate_management ? 5 : 0) + (signals.has_checkout ? 5 : 0);
  const art6 = (signals.has_sca ? 5 : 0) + (signals.has_recurring ? 5 : 0) + (signals.has_mandate_management ? 5 : 0);
  const art7 = (signals.has_dispute_handling ? 5 : 0) + (signals.has_webhooks ? 5 : 0) + (signals.has_dispute_handling && signals.has_webhooks ? 5 : 0);
  const art11 = (signals.has_tap_protocol ? 5 : 0) + (signals.has_network_tokenization ? 5 : 0) + (signals.has_mandate_management ? 5 : 0);
  const total = art2 + art6 + art7 + art11;
  const grade = total >= 50 ? "A" : total >= 35 ? "B" : total >= 20 ? "C" : "D";

  return [
    `## AP2 Readiness Scoring — Capability Assessment`,
    ``,
    `> Methodology: the scores below come from a keyword-signal scan of this repository.`,
    `> Use them as a checklist starting point — they are NOT a certification, audit, or legal/compliance advice.`,
    ``,
    `| Capability Area | Focus | Score | Max | Details |`,
    `|-----------------|-------|-------|-----|---------|`,
    `| Mandate Format | Payment structure | ${art2}/15 | 15 | ${art2 >= 10 ? "Mandate schema detected" : art2 >= 5 ? "Partial mandate support" : "No mandate structure"} |`,
    `| Agent Spending Rules | Spending limits | ${art6}/15 | 15 | ${art6 >= 10 ? "SCA + recurring + mandate" : art6 >= 5 ? "Partial SCA coverage" : "No spending controls"} |`,
    `| Dispute Handling | Evidence + resolution | ${art7}/15 | 15 | ${art7 >= 10 ? "Full dispute automation" : art7 >= 5 ? "Basic dispute handling" : "No dispute flow"} |`,
    `| Token Lifecycle | TAP + tokenization | ${art11}/15 | 15 | ${art11 >= 10 ? "TAP + network tokens active" : art11 >= 5 ? "Partial token support" : "No token lifecycle"} |`,
    `| **Total** | | **${total}/60** | **60** | **Grade: ${grade}** |`,
    ``,
    `### Compliance Risk`,
    ``,
    total < 20
      ? `> ⚠️ **MAJOR GAPS** — most scanned signal areas are missing. Prioritize mandate format and SCA handling. Consult your acquirer and current card-network bulletins for program requirements.`
      : total < 35
        ? `> ⚠️ **MODERATE GAPS** — key signal areas missing. Address dispute handling and token lifecycle before production.`
        : total < 50
          ? `> ✅ **GOOD COVERAGE** — core signal areas detected. Strengthen dispute automation and token lifecycle for fuller coverage.`
          : `> ✅ **FULL SIGNAL COVERAGE** — all scanned areas detected. Remember this is a keyword-level scan, not a compliance certification.`,
  ].join("\n");
}

function buildCompellingEvidence3Section(signals: CommerceSignals): string {
  return [
    `## Compelling Evidence 3.0 (CE 3.0) — Auto-Generated Payloads`,
    ``,
    RAIL_APPLICABILITY_NOTE,
    ``,
    `CE 3.0 reduces fraud-related chargebacks by proving legitimate cardholder engagement.`,
    `AXIS auto-generates the evidence payload structure — agents fill transaction-specific fields at dispute time.`,
    ``,
    `### CE 3.0 Evidence Template`,
    ``,
    `\`\`\`json`,
    `{`,
    `  "compelling_evidence_3": {`,
    `    "version": "3.0",`,
    `    "dispute_id": "<from_issuer_notification>",`,
    `    "original_transaction": {`,
    `      "transaction_id": "<original_txn_id>",`,
    `      "date": "<ISO8601>",`,
    `      "amount_cents": "<amount>",`,
    `      "currency": "USD",`,
    `      "merchant_id": "<your_merchant_id>"`,
    `    },`,
    `    "prior_undisputed_transactions": [`,
    `      {`,
    `        "transaction_id": "<prior_txn_1>",`,
    `        "date": "<ISO8601>",`,
    `        "amount_cents": "<amount>",`,
    `        "ip_address": "<same_or_similar_ip>",`,
    `        "device_id": "<same_device_fingerprint>",`,
    `        "shipping_address_match": true`,
    `      }`,
    `    ],`,
    `    "match_criteria": {`,
    `      "ip_address_match": "${CE3_MIN_MATCHING_DATA_ELEMENTS}+ prior transactions from same IP within ${CE3_LOOKBACK_DAYS} days",`,
    `      "device_fingerprint_match": "${CE3_MIN_MATCHING_DATA_ELEMENTS}+ prior transactions from same device",`,
    `      "shipping_address_match": "Delivery to same address as prior undisputed orders",`,
    `      "minimum_prior_transactions": ${CE3_MIN_PRIOR_TRANSACTIONS},`,
    `      "minimum_prior_transaction_age_days": ${CE3_MIN_PRIOR_TRANSACTION_AGE_DAYS},`,
    `      "lookback_window_days": ${CE3_LOOKBACK_DAYS}`,
    `    },`,
    `    "agent_automation": {`,
    `      "auto_collect_ip": ${signals.has_checkout},`,
    `      "auto_collect_device_id": ${signals.has_checkout},`,
    `      "auto_match_prior_txns": ${signals.has_dispute_handling && signals.has_webhooks}`,
    `    }`,
    `  }`,
    `}`,
    `\`\`\``,
    ``,
    `### CE 3.0 Automation Readiness`,
    ``,
    `| Capability | Status | Impact |`,
    `|-----------|--------|--------|`,
    `| IP collection at checkout | ${signals.has_checkout ? "✅ Ready" : "❌ Add to checkout"} | Required for CE 3.0 IP matching |`,
    `| Device fingerprinting | ${signals.has_checkout ? "⚠️ Verify impl" : "❌ Not detected"} | Required for CE 3.0 device matching |`,
    `| Transaction history query | ${signals.has_webhooks ? "✅ Webhook-fed" : "❌ No event source"} | Required if lookback > 120 days |`,
    `| Auto-payload assembly | ${signals.has_dispute_handling && signals.has_webhooks ? "✅ Automatable" : "⚠️ Manual assembly"} | Enables scripted evidence assembly at dispute time |`,
  ].join("\n");
}

function buildDisputeEvidenceChecklist(): string {
  return [
    `## Dispute Evidence Checklist (CE 3.0)`,
    ``,
    `Visa Compelling Evidence 3.0 (CE 3.0) lets merchants remediate qualifying card-not-present`,
    `fraud disputes by documenting a prior history with the same customer. This checklist describes`,
    `WHAT evidence is required — it makes no prediction about dispute outcomes, which depend on`,
    `issuer review and are not something AXIS can estimate.`,
    ``,
    `### CE 3.0 Evidence Requirements`,
    ``,
    `- [ ] Two or more prior undisputed transactions on the same payment credential`,
    `- [ ] Each prior transaction is older than 120 days (and within 365 days) of the disputed transaction`,
    `- [ ] Each prior transaction matches the disputed transaction on at least 2 qualified data elements:`,
    `  - Device ID / device fingerprint`,
    `  - IP address`,
    `  - Customer email address`,
    `  - Shipping address`,
    `  - Customer account/login ID`,
    `- [ ] Merchandise or service description for each transaction`,
    ``,
    `### Evidence to Assemble per Dispute Category`,
    ``,
    `| Reason Code | Category | Evidence to Assemble |`,
    `|------------|----------|----------------------|`,
    `| 10.x | Fraud | CE 3.0 package (above) where eligible; 3DS authentication logs |`,
    `| 13.1 | Merch Not Received | Delivery confirmation, tracking, signed receipt |`,
    `| 13.2 | Cancelled Recurring | Mandate record, cancellation-request history |`,
    `| 13.3 | Not As Described | Product documentation, customer communication |`,
    `| 13.6 | Credit Not Processed | Refund/credit records |`,
    `| 13.7 | Cancelled Service | Terms of service, usage logs |`,
    ``,
    `### Represent vs. Refund`,
    ``,
    `Whether to represent a dispute or issue a refund is a business decision that depends on`,
    `evidence quality, amounts at stake, and your operator's risk tolerance. Follow your`,
    `operator's dispute policy — AXIS does not publish win-rate estimates.`,
  ].join("\n");
}

function buildLighterScaSection(signals: CommerceSignals): string {
  return [
    `## Lighter SCA Paths — Agent-Optimized Flow`,
    ``,
    RAIL_APPLICABILITY_NOTE,
    ``,
    `Goal: minimize friction for autonomous agent purchases. Prefer exemptions over challenges.`,
    ``,
    `### Agent SCA Decision Tree`,
    ``,
    `\`\`\``,
    `Transaction arrives:`,
    renderScaDecisionTreeBranches(),
    `  └─ None apply? → Request frictionless 3DS2 first`,
    `       ├─ Issuer approves frictionless? → PROCEED (no redirect)`,
    `       └─ Issuer requires challenge? → ABORT agent flow, escalate to operator`,
    `\`\`\``,
    ``,
    `### Exemption Priority for Agents (prefer top → bottom)`,
    ``,
    `> Priority order below is AXIS's recommended agent-optimized preference — PSD2/EBA RTS defines these paths but assigns no priority ordering of its own; issuers/acquirers may apply their own order.`,
    ``,
    renderScaExemptionMatrix(),
    ``,
    `### Provider-Specific SCA Thresholds`,
    ``,
    `| Network | Low-Value Threshold | TRA Cap |`,
    `|---------|--------------------|---------|`,
    `| Visa | €30 (PSD2 RTS) | Up to €500, tiered by acquirer fraud rate |`,
    `| Mastercard | €30 (PSD2 RTS) | Up to €500, tiered by acquirer fraud rate |`,
    `| Amex | €30 (PSD2 RTS) | Up to €500, tiered by acquirer fraud rate |`,
    ``,
    `> Thresholds are set by the PSD2 RTS and depend on your acquirer's reference fraud rate — verify current values with your acquirer before relying on an exemption.`,
    ``,
    `### What This Artifact Provides`,
    ``,
    `The exemption decision tree above is pre-computed into this artifact, so agents can apply it`,
    `locally without extra API calls at decision time. AXIS does not handle card data, so using this`,
    `artifact adds no PCI scope. Exemption eligibility is ultimately decided by your acquirer and`,
    `the issuer — treat the tree as a starting point, not a guarantee.`,
    ``,
    signals.has_sca ? `Your repo: ✅ SCA code detected — wire the decision tree into your existing flow.` : `Your repo: ❌ No SCA code detected — the decision tree is generated as a starting point.`,
  ].join("\n");
}

function buildTapInteropSection(signals: CommerceSignals): string {
  // (The static scaExemptionRows table that used to live here was replaced by
  // WO-06's engine-rendered renderScaExemptionMatrix() in the return body.)

  // Real, signed samples — built + verified by @axis/ap2, NOT static literals.
  // encodeMandate/encodeTapMessage/encodeUcpMessage produce the exact canonical
  // wire bytes embedded below; ap2-interop.test.ts re-parses each ```json block
  // from the RENDERED artifact and re-validates it with validateMandate /
  // validateTapMessage / validateUcpMessage.
  const samples = buildAp2Samples();
  const intentValid = verifyMandate(samples.signedIntent).valid;
  const cartValid = verifyMandate(samples.signedCart).valid;
  const paymentValid = verifyMandate(samples.signedPayment).valid;
  const tapValid = verifyTapMessage(samples.signedTap).valid;
  const ucpValid = verifyUcpMessage(samples.signedUcp).valid;

  const sigLine = (jws: { protected: string; signature: string }, publicKey: string, valid: boolean) =>
    `Signature (detached JWS, alg=EdDSA): \`protected=${jws.protected}\` \`signature=${jws.signature.slice(0, 24)}…\` \`public_key=${publicKey.slice(0, 24)}…\` — verify() valid: ${valid ? "✅ true" : "❌ false"}`;

  return [
    `## TAP / AP2 / UCP Interoperability`,
    ``,
    `Every JSON block below is the REAL output of \`@axis/ap2\`'s \`encode*\` functions for a fixed`,
    `demo sample — not a hand-typed literal. Each one round-trips through \`decode*\`/\`validate*\``,
    `and is signed with a detached JWS (EdDSA/Ed25519) that \`verify*\` confirms. ${AP2_SCOPE_CAVEAT}`,
    ``,
    `### Token Action Protocol (TAP) Integration`,
    ``,
    `TAP status: ${signals.has_tap_protocol ? "✅ TAP protocol references detected" : "⚠️ No TAP integration — implement token lifecycle management"}`,
    `Network tokenization: ${signals.has_network_tokenization ? "✅ Detected" : "❌ Not detected — verify availability with your PSP if you plan to use network tokens"}`,
    ``,
    `Signed sample TAP token-lifecycle message (\`encodeTapMessage\` output):`,
    ``,
    "```json",
    encodeTapMessage(TAP_DEMO_TOKEN),
    "```",
    ``,
    sigLine(samples.signedTap.jws, samples.publicKey, tapValid),
    ``,
    `| TAP Event | Meaning |`,
    `|-----------|---------|`,
    `| provision | POST /tokens — request DPAN from TSP (Visa VTS or Mastercard MDES) |`,
    `| activate | Token status ACTIVE after device binding verification |`,
    `| suspend | On fraud signal → status SUSPENDED, pending review |`,
    `| resume | After review clear → status ACTIVE, resume transactions |`,
    `| delete | On card expiry/replacement → de-provision token |`,
    ``,
    `> AXIS network-tokenization capability (honest scope): the token lifecycle above is an`,
    `> EXECUTABLE state machine (illegal transitions rejected) plus a live Stripe network-token`,
    `> READ adapter — \`is_network_token\` is true only when Stripe reports a provisioned network`,
    `> token, never inferred from co-badging metadata. Direct VTS/MDES provisioning is`,
    `> capability-gated behind a network-issued Token Requestor ID (AXIS_VTS_TOKEN_REQUESTOR_ID /`,
    `> AXIS_MDES_TOKEN_REQUESTOR_ID) and returns a structured \`_not_configured\` envelope until`,
    `> Visa/Mastercard onboarding exists — NOT unconditional live VTS+MDES.`,
    ``,
    `### SCA Exemption Decision Matrix`,
    ``,
    renderScaExemptionMatrix(),
    ``,
    `> Exemption definitions and thresholds come from PSD2 and its regulatory technical standards — verify current rules with your acquirer. Priority order is AXIS's recommended agent-optimized preference, not a regulatory mandate.`,
    ``,
    `### AP2 Mandate Lifecycle`,
    ``,
    "```",
    `CREATE → mandate_id assigned, status=pending_authorization`,
    `  └─ SCA CHALLENGE → cardholder authenticates`,
    `       └─ AUTHORIZE → status=active, first_collection_date set`,
    `            └─ COLLECT → settlement via configured clearing path`,
    `                 └─ AMEND → amount/schedule change, re-SCA if material`,
    `                      └─ CANCEL → status=cancelled, no further collections`,
    "```",
    ``,
    `Signed sample Intent mandate (\`encodeMandate\` output):`,
    ``,
    "```json",
    encodeMandate(AP2_DEMO_INTENT),
    "```",
    ``,
    sigLine(samples.signedIntent.jws, samples.publicKey, intentValid),
    ``,
    `Signed sample Cart mandate, referencing the Intent above (\`encodeMandate\` output):`,
    ``,
    "```json",
    encodeMandate(AP2_DEMO_CART),
    "```",
    ``,
    sigLine(samples.signedCart.jws, samples.publicKey, cartValid),
    ``,
    `Signed sample Payment mandate, referencing the Cart above (\`encodeMandate\` output):`,
    ``,
    "```json",
    encodeMandate(AP2_DEMO_PAYMENT),
    "```",
    ``,
    sigLine(samples.signedPayment.jws, samples.publicKey, paymentValid),
    ``,
    `### UCP Settlement Path`,
    ``,
    `Signed sample UCP settlement message (\`encodeUcpMessage\` output):`,
    ``,
    "```json",
    encodeUcpMessage(UCP_DEMO_SETTLEMENT),
    "```",
    ``,
    sigLine(samples.signedUcp.jws, samples.publicKey, ucpValid),
    ``,
    `| Field | Meaning |`,
    `|-------|---------|`,
    `| clearing_system | VISA_NET \\| MASTERCARD_CLEARING \\| ACH \\| SEPA_SCT |`,
    `| value_date | Calendar date settlement is expected to post (T+1 domestic, T+2 cross-border is typical, but varies by rail) |`,
    `| settlement_finality | "final" once irrevocable after the clearing cutoff; "pending" before that |`,
    ``,
    `> Dispute windows (120 days from settlement is typical for Visa/Mastercard) and representment deadlines (45 days is typical) are network-published policy, not fields this message type carries — verify current values with your acquirer.`,
  ].join("\n");
}

/**
 * ap2-interop-samples.json — real, signed AP2/TAP/UCP message samples produced
 * and verified by @axis/ap2, proving the codec end-to-end (not static literals).
 */
export function generateAp2InteropSamples(
  ctx: ContextMap,
  _profile: RepoProfile,
  files?: SourceFile[],
): GeneratedFile {
  const signals = detectCommerceSignals(files);
  const samples = buildAp2Samples();

  const payload = {
    schema_version: "1.0",
    product: "Axis' Iliad",
    generated_for: ctx.project_identity.name,
    generated_at: ctx.generated_at.split("T")[0],
    codec_package: "@axis/ap2",
    scope_caveat: AP2_SCOPE_CAVEAT,
    determinism_note:
      "Samples below use a FIXED demo keypair + fixed IDs/timestamps — byte-identical across every run of this generator, independent of the analyzed repository. Real integrations MUST use generateEd25519() (or an equivalent real keypair) plus a real secret store, never this demo keypair.",
    repo_commerce_signals: {
      has_tap_protocol: signals.has_tap_protocol,
      has_network_tokenization: signals.has_network_tokenization,
      has_mandate_management: signals.has_mandate_management,
    },
    public_key: samples.publicKey,
    ap2_mandates: {
      intent: { mandate: samples.signedIntent.mandate, jws: samples.signedIntent.jws, verified: verifyMandate(samples.signedIntent).valid },
      cart: { mandate: samples.signedCart.mandate, jws: samples.signedCart.jws, verified: verifyMandate(samples.signedCart).valid },
      payment: { mandate: samples.signedPayment.mandate, jws: samples.signedPayment.jws, verified: verifyMandate(samples.signedPayment).valid },
    },
    tap_token: { message: samples.signedTap.message, jws: samples.signedTap.jws, verified: verifyTapMessage(samples.signedTap).valid },
    ucp_settlement: { message: samples.signedUcp.message, jws: samples.signedUcp.jws, verified: verifyUcpMessage(samples.signedUcp).valid },
  };

  return {
    path: "ap2-interop-samples.json",
    content: JSON.stringify(payload, null, 2),
    content_type: "application/json",
    program: "agentic-purchasing",
    description: "Real, signed AP2/TAP/UCP message samples produced and verified by @axis/ap2 — proves the codec end-to-end, not static literals",
  };
}

function buildDisputeFlowSection(signals: CommerceSignals): string {
  return [
    `## Dispute Resolution & Chargeback Flow`,
    ``,
    RAIL_APPLICABILITY_NOTE,
    ``,
    `Dispute handling: ${signals.has_dispute_handling ? "✅ Detected in codebase" : "⚠️ Not detected — implement before production"}`,
    ``,
    `### Visa Dispute Lifecycle (VROL/RDR/CDRN)`,
    ``,
    `\`\`\``,
    `Transaction → Cardholder Dispute Filed`,
    `  ├─ Pre-Dispute (CDRN/RDR)`,
    `  │    ├─ Collaboration: Issuer notifies via CDRN within 72h`,
    `  │    ├─ Rapid Dispute Resolution: Auto-refund if merchant enrolled in RDR`,
    `  │    └─ Agent action: Check CDRN alerts, auto-respond within SLA`,
    `  ├─ Chargeback (Allocation/Collaboration)`,
    `  │    ├─ Reason code mapped (e.g., 10.4=fraud, 13.1=merch_error)`,
    `  │    ├─ Evidence required: transaction_receipt, delivery_proof, auth_log`,
    `  │    └─ Agent action: Gather evidence, submit representment within 30 days`,
    `  ├─ Pre-Arbitration`,
    `  │    ├─ Issuer rejects representment`,
    `  │    └─ Agent action: Accept loss or escalate to arbitration ($500 fee)`,
    `  └─ Arbitration (Final)`,
    `       └─ Visa decides. Losing party pays $500 filing fee.`,
    `\`\`\``,
    ``,
    `### Agent Dispute Automation Rules`,
    ``,
    `| Dispute Amount | Auto-Action | Reason |`,
    `|---------------|-------------|--------|`,
    `| < $5.00 | Auto-refund | Cost of representment exceeds recovery |`,
    `| $5–$50, no delivery proof | Auto-refund | Low win probability without evidence |`,
    `| $5–$50, has proof | Auto-represent | Submit evidence package |`,
    `| > $50 | Represent + escalate | Gather evidence, notify operator |`,
    `| Fraud (reason 10.x) | Block customer token, represent | Prevent further losses |`,
    ``,
    `### Evidence Package Schema`,
    ``,
    `\`\`\`json`,
    `{`,
    `  "dispute_evidence": {`,
    `    "dispute_id": "<provider_dispute_id>",`,
    `    "transaction_id": "<original_txn_id>",`,
    `    "reason_code": "10.4 | 13.1 | 13.2 | 13.3 | 13.6 | 13.7",`,
    `    "evidence_type": "receipt | delivery_confirmation | auth_log | customer_communication",`,
    `    "documents": [`,
    `      { "type": "transaction_receipt", "format": "pdf | json", "required": true },`,
    `      { "type": "delivery_proof", "format": "tracking_url | signed_receipt", "required": false },`,
    `      { "type": "3ds_auth_log", "format": "json", "required_if": "fraud_dispute" },`,
    `      { "type": "customer_communication", "format": "text", "required": false }`,
    `    ],`,
    `    "submission_deadline_days": 30,`,
    `    "representment_window_days": 45`,
    `  }`,
    `}`,
    `\`\`\``,
  ].join("\n");
}

// ─── 1. Agent Purchasing Playbook ────────────────────────────────

// ─── Public API: Compliance Grade ────────────────────────────────
//
// gradeCompliance() runs 8 distinct MULTI-SIGNAL validators over the submitted
// source files. Each validator requires >=2 co-occurring signals to "pass" —
// a single incidental keyword can, at most, earn "warn" — and every check
// carries a weight, an evidence trail, and actionable remediation. This is
// deterministic STATIC source-signal analysis of submitted files; it is NOT a
// certification, audit, PCI assessment, or live card-network certification,
// and it cannot verify runtime behavior, real network-token enrollment, or
// cryptographically-signed mandates. See `methodology` on the result.

export type CheckStatus = "pass" | "warn" | "fail";

export interface ComplianceCheck {
  name:
    | "sca_readiness"
    | "ap2_mandate_validity"
    | "tokenization_posture"
    | "ce3_readiness"
    | "dispute_rail_wiring"
    | "idempotency_receipt"
    | "budget_negotiation"
    | "refund_cancel_path";
  title: string;
  status: CheckStatus;
  weight: number;
  score: number;
  evidence: string[];
  remediation: string;
}

// Superset of the OLD shape — old {grade, checks_passed, checks_total} keys
// are preserved so existing readers of computeComplianceGrade()'s return
// value keep working unmodified.
export interface ComplianceGradeResult {
  grade: "A" | "B" | "C" | "D";
  checks_passed: number;
  checks_total: 8;
  score: number;
  checks: ComplianceCheck[];
  methodology: string;
}

const COMPLIANCE_METHODOLOGY =
  "Deterministic static source-signal analysis of the submitted files — a checklist " +
  "starting point, not a live compliance audit, PCI assessment, or card-network " +
  "certification. This is NOT a certification. It cannot verify runtime behavior, " +
  "real network-token enrollment, or cryptographically-signed mandates.";

function checkScore(status: CheckStatus, weight: number): number {
  return status === "pass" ? weight : status === "warn" ? Math.round(weight / 2) : 0;
}

// Generic "primary AND secondary" validator: pass requires both regex groups
// to match somewhere in the combined file blob; warn requires exactly one;
// fail requires neither. Covers 4 of the 8 checks whose rule is a plain
// two-signal AND (sca_readiness, idempotency_receipt, budget_negotiation,
// refund_cancel_path) — the other 4 need bespoke logic (mandate generic/
// specific split, tokenization antipattern, CE 3.0 four-way count, dispute
// three-way AND) and are implemented as their own functions below.
function twoSignalCheck(
  name: ComplianceCheck["name"],
  title: string,
  weight: number,
  blob: string,
  primary: RegExp,
  secondary: RegExp,
  remediationFail: string,
  remediationWarn: string,
  remediationPass: string,
): ComplianceCheck {
  const p = primary.exec(blob);
  const s = secondary.exec(blob);
  let status: CheckStatus;
  let evidence: string[];
  let remediation: string;
  if (p && s) {
    status = "pass";
    evidence = [p[0], s[0]];
    remediation = remediationPass;
  } else if (p || s) {
    status = "warn";
    evidence = [(p ?? s)![0]];
    remediation = remediationWarn;
  } else {
    status = "fail";
    evidence = [];
    remediation = remediationFail;
  }
  return { name, title, status, weight, score: checkScore(status, weight), evidence, remediation };
}

// AP2 mandate validity: pass needs a SPECIFIC mandate identifier (mandate_id
// / mandate_type) plus a bounding field (max_amount/spending_limit/expires/
// valid_until/scope). Any mandate keyword alone (specific or generic) without
// a bound is "warn" — a mandate with no spend/time limit is a real risk, not
// a pass. No mandate keyword at all is "fail".
function ap2MandateValidityCheck(blob: string): ComplianceCheck {
  const weight = 16;
  const specific = /mandate[_\s-]?id|mandate[_\s-]?type/i.exec(blob);
  const bound = /max_amount|spending_limit|\bexpires\b|valid_until|\bscope\b/i.exec(blob);
  const generic = /\bmandate\b/i.exec(blob);
  let status: CheckStatus;
  let evidence: string[];
  let remediation: string;
  if (specific && bound) {
    status = "pass";
    evidence = [specific[0], bound[0]];
    remediation = "Mandate has an identifier and a spend/time bound — keep enforcing max_amount/expiry on every mandate.";
  } else if (specific || generic) {
    status = "warn";
    evidence = [(specific ?? generic)![0]];
    remediation = "Mandate keyword found but no bounding field (max_amount/spending_limit/expires/valid_until/scope) detected — add an explicit spend or time bound to every mandate object.";
  } else {
    status = "fail";
    evidence = [];
    remediation = "No AP2 mandate object detected — add a mandate_id/mandate_type with max_amount and expires/valid_until fields before enabling autonomous purchase.";
  }
  return { name: "ap2_mandate_validity", title: "AP2 Mandate Validity", status, weight, score: checkScore(status, weight), evidence, remediation };
}

// Tokenization posture: a raw-PAN storage antipattern is an automatic FAIL —
// it overrides any network-token keyword found elsewhere in the same repo
// (a repo that both vaults raw PAN and namedrops "network_token" is not
// posture-compliant). Absent the antipattern, an actual network-token
// signal (VTS/MDES/DPAN) is a pass; a generic/provider-vaulted "token"
// mention alone is a weaker warn signal; no signal at all is a fail.
function tokenizationPostureCheck(blob: string): ComplianceCheck {
  const weight = 16;
  const antipattern = /card_number\s*[:=]|raw_pan\b|store[sd]?[_\s-]?pan\b/i.exec(blob);
  const networkToken = /network[_\s-]?token|\bdpan\b|\bmdes\b|\bvts\b/i.exec(blob);
  const genericToken = /\btoken\b|\bvault(ed)?\b/i.exec(blob);
  let status: CheckStatus;
  let evidence: string[];
  let remediation: string;
  if (antipattern) {
    status = "fail";
    evidence = [];
    remediation = "Raw PAN storage antipattern detected — remove raw card-number persistence and replace with network-tokenized (VTS/MDES/DPAN) references immediately.";
  } else if (networkToken) {
    status = "pass";
    evidence = [networkToken[0]];
    remediation = "Network tokenization detected with no raw-PAN storage antipattern — maintain the current posture.";
  } else if (genericToken) {
    status = "warn";
    evidence = [genericToken[0]];
    remediation = "Only a provider-vaulted token reference detected — migrate to network tokenization (VTS/MDES/DPAN) for stronger portability and lower liability.";
  } else {
    status = "fail";
    evidence = [];
    remediation = "No tokenization posture detected — integrate network tokenization (VTS/MDES/DPAN) or, at minimum, provider-side vaulting; never store raw PAN.";
  }
  return { name: "tokenization_posture", title: "Tokenization Posture", status, weight, score: checkScore(status, weight), evidence, remediation };
}

// CE 3.0 readiness: count how many of the 4 required evidence dimensions are
// present (prior transactions, device/IP fingerprint, AVS/delivery proof,
// an explicit compelling-evidence/CE3 reference). >=2 is a pass (matches CE
// 3.0's own "2+ matching data elements" rule), exactly 1 is warn, 0 is fail.
function ce3ReadinessCheck(blob: string): ComplianceCheck {
  const weight = 10;
  const signals: RegExp[] = [
    /prior_transaction|prior_undisputed|prior_txn/i,
    /device_fingerprint|device_id|ip_address/i,
    /\bavs\b|address_verification|delivery_proof|proof_of_delivery/i,
    /compelling_evidence|\bce3\b|\bce.?3\.0\b/i,
  ];
  const matches = signals.map((re) => re.exec(blob)).filter((m): m is RegExpExecArray => m !== null);
  let status: CheckStatus;
  let remediation: string;
  if (matches.length >= 2) {
    status = "pass";
    remediation = "CE 3.0 readiness signals present across 2+ dimensions — keep collecting prior-transaction and device/IP evidence for every order.";
  } else if (matches.length === 1) {
    status = "warn";
    remediation = "Only one CE 3.0 signal detected — add at least one more of {prior-transaction history, device/IP fingerprint, AVS/delivery confirmation, compelling-evidence assembly} to qualify for CE 3.0 remediation.";
  } else {
    status = "fail";
    remediation = "No CE 3.0 readiness signals detected — implement prior-transaction tracking, device/IP fingerprinting, and delivery confirmation to support future fraud-dispute remediation.";
  }
  const evidence = status === "fail" ? [] : matches.map((m) => m[0]);
  return { name: "ce3_readiness", title: "Compelling Evidence 3.0 Readiness", status, weight, score: checkScore(status, weight), evidence, remediation };
}

// Dispute rail wiring: pass needs THREE co-signals — dispute/chargeback
// detection, an actual network rail (webhook/RDR/CDRN/VROL), and an
// evidence-submission path. Dispute detection alone (no rail, no evidence
// path) is a fail, not a warn — a repo that only mentions "refund" isn't
// "partway wired". Dispute detection PLUS exactly one of the other two is warn.
function disputeRailWiringCheck(blob: string): ComplianceCheck {
  const weight = 14;
  const disputeM = /\bdispute\b|chargeback/i.exec(blob);
  const railM = /\bwebhook\b|\brdr\b|\bcdrn\b|\bvrol\b/i.exec(blob);
  const evidenceM = /evidence_submission|submit_evidence|representment|evidence_package/i.exec(blob);
  let status: CheckStatus;
  let evidence: string[];
  let remediation: string;
  if (disputeM && railM && evidenceM) {
    status = "pass";
    evidence = [disputeM[0], railM[0], evidenceM[0]];
    remediation = "Dispute rail fully wired (dispute detection + network rail + evidence submission) — keep SLA timers current with card-network deadlines.";
  } else if (disputeM && (railM || evidenceM)) {
    status = "warn";
    evidence = [disputeM[0], (railM ?? evidenceM)![0]];
    remediation = "Dispute handling detected but missing a network rail (webhook/RDR/CDRN/VROL) or an evidence-submission path — wire the missing half before relying on this for chargeback response.";
  } else {
    status = "fail";
    evidence = [];
    remediation = "No dispute/chargeback handling wired to a network rail and evidence path — add dispute intake plus a rail (webhook/RDR/CDRN/VROL) and an evidence-submission path.";
  }
  return { name: "dispute_rail_wiring", title: "Dispute Rail Wiring", status, weight, score: checkScore(status, weight), evidence, remediation };
}

/**
 * Run all 8 AP2/Visa compliance validators over a set of source files.
 * Each validator is a pure, deterministic multi-signal check — see the
 * individual check functions and the per-check comments above for the
 * pass/warn/fail rule. Safe to call with undefined/empty — returns grade
 * "D", score 0, and all 8 checks "fail" with empty evidence.
 */
export function gradeCompliance(files: SourceFile[] | undefined): ComplianceGradeResult {
  const blob = (files ?? []).map((f) => `${f.path}\n${f.content}`).join("\n---\n");

  const checks: ComplianceCheck[] = [
    twoSignalCheck(
      "sca_readiness", "SCA / 3DS2 Readiness", 18, blob,
      /\b3ds2?\b|threeds|\bpsd2\b/i,
      /frictionless|\bchallenge\b|\bexemption\b|\btra\b/i,
      "No SCA/3DS2 readiness signals detected — implement 3DS2/PSD2 authentication plus an exemption path (frictionless, challenge, TRA) before processing EU/UK transactions.",
      "Only one SCA signal (a 3DS2/PSD2 reference OR an exemption/frictionless/challenge path) detected — wire the missing half so exemptions are actually evaluated against a real 3DS2/PSD2 flow.",
      "3DS2/PSD2 authentication with a working exemption/frictionless path detected — keep exemption thresholds current with your acquirer.",
    ),
    ap2MandateValidityCheck(blob),
    tokenizationPostureCheck(blob),
    ce3ReadinessCheck(blob),
    disputeRailWiringCheck(blob),
    twoSignalCheck(
      "idempotency_receipt", "Idempotency & Receipt Hygiene", 12, blob,
      /idempotency[_\s-]?key/i,
      /\breceipt\b|\btxn_id\b|\btransaction_id\b/i,
      "No idempotency-key or receipt/txn_id emission detected — add an idempotency_key on every charge call and emit a receipt/txn_id on success.",
      "Only one of {idempotency_key, receipt/txn_id emission} detected — add the missing half so retried purchase calls can't double-charge and every charge has a traceable receipt.",
      "Idempotency-key usage and receipt/txn_id emission both detected — keep enforcing idempotency on every charge path.",
    ),
    twoSignalCheck(
      "budget_negotiation", "Budget Negotiation Conformance", 6, blob,
      /x-agent-budget|budget_per_run|budget_cents/i,
      /x-agent-mode|\blite\b|budget_aware/i,
      "No budget-negotiation signals detected — accept X-Agent-Budget / budget_per_run_cents and X-Agent-Mode: lite to support budget-aware agents.",
      "Only one of {budget header/field, mode/lite negotiation} detected — wire the missing half so agents can actually negotiate a reduced-price run.",
      "Budget header and lite/mode negotiation both detected — keep the reduced-price path in sync with pricing changes.",
    ),
    twoSignalCheck(
      "refund_cancel_path", "Refund / Cancel Path", 8, blob,
      /\brefund\b|\breversal\b/i,
      /\bcancel\w*|\bvoid\b|revoke_mandate/i,
      "No refund/reversal or cancel/void path detected — implement both before enabling autonomous purchase.",
      "Only one of {refund/reversal, cancel/void/revoke_mandate} detected — implement the missing half so a mandate can be both cancelled and refunded.",
      "Refund/reversal and cancel/void paths both detected — keep both in sync with your mandate lifecycle.",
    ),
  ];

  const score = checks.reduce((sum, c) => sum + c.score, 0);
  const grade: "A" | "B" | "C" | "D" = score >= 85 ? "A" : score >= 65 ? "B" : score >= 40 ? "C" : "D";
  const checks_passed = checks.filter((c) => c.status === "pass").length;

  return { grade, checks_passed, checks_total: 8, score, checks, methodology: COMPLIANCE_METHODOLOGY };
}

/**
 * Back-compat alias for gradeCompliance(). The return value is a strict
 * superset of the old { grade, checks_passed, checks_total } shape, so
 * existing readers of computeComplianceGrade() keep working unmodified.
 * Prefer gradeCompliance() in new code — it makes the checks[] and score
 * fields explicit at the call site.
 */
export function computeComplianceGrade(files: SourceFile[] | undefined): ComplianceGradeResult {
  return gradeCompliance(files);
}

// ─── Public API: SCA Exemption Decision Engine (WO-06) ───────────────
//
// Decision-support only, NOT an authorization oracle:
//  1. The priority ORDER below is AXIS's recommended agent-optimized preference,
//     not a regulatory mandate — issuers/acquirers may apply their own order.
//  2. TRA caps reflect published EBA RTS Art. 15 fraud-rate bands, but real
//     eligibility depends on the acquirer's LIVE reference fraud rate.
//  3. Final exemption eligibility is decided by the acquirer/issuer — always
//     verify current values/rules with your acquirer before relying on a path.
//  4. `merchant_initiated` and `one_leg_out` are PSD2 "out of scope" categories,
//     not formal PSD2-RTS exemptions — they are included here because they are
//     additional lighter-than-3DS2 paths an agent can prefer, not because the
//     regulation labels them "exemptions". See each rule's `label`/`condition`.

/** Context an agent (or the checkout flow) supplies for a single transaction. */
export interface ScaExemptionContext {
  amount_eur: number;                 // transaction amount in EUR (required)
  is_secure_corporate?: boolean;      // dedicated/lodged corporate card program (RTS Art 16)
  is_merchant_initiated?: boolean;    // MIT w/ stored credential + original SCA reference (out of SCA scope)
  is_recurring_fixed?: boolean;       // fixed-amount subsequent collection (RTS Art 13)
  is_trusted_beneficiary?: boolean;   // merchant on cardholder trusted list (RTS Art 12)
  is_one_leg_out?: boolean;           // payer or payee outside the EEA (SCA not mandated territorially)
  has_prior_sca?: boolean;            // a prior SCA exists; REQUIRED for recurring_fixed & trusted_beneficiary
  tra_acquirer_fraud_bps?: number;    // acquirer reference fraud rate in basis points (RTS Art 15 bands)
}

export type ScaExemptionName =
  | "low_value"
  | "secure_corporate"
  | "merchant_initiated"
  | "recurring_fixed"
  | "trusted_beneficiary"
  | "transaction_risk_analysis"
  | "one_leg_out"
  | "3ds2_challenge"; // terminal fallback -- SCA required

export interface ScaExemptionRule {
  name: ScaExemptionName;
  priority: number;                   // 1..7
  label: string;
  condition: string;                  // human-readable predicate description
  max_amount_eur: number | null;      // null = unlimited / N/A
}

export interface ScaDecision {
  exemption: ScaExemptionName;        // chosen path (or "3ds2_challenge")
  priority: number;                   // rank of chosen path; 8 for the challenge fallback
  sca_required: boolean;              // true only for the "3ds2_challenge" fallback
  rationale: string;                  // why this path was chosen
  fallback: ScaExemptionName;         // next path if this exemption is refused ("3ds2_challenge" when none apply)
  tra_cap_eur?: number;                // present when the TRA path was chosen or considered (fraud rate supplied)
  candidates: ScaExemptionName[];     // all applicable exemptions, in priority order
}

/**
 * Canonical, deterministic 7-priority ordering (AXIS's recommended agent-optimized
 * order — NOT a regulatory mandate; PSD2/EBA RTS defines exemptions but assigns no
 * priority ordering of its own). Every static SCA table in this file is rendered
 * from this single constant via `renderScaExemptionMatrix` so the three tables
 * cannot drift out of sync with each other.
 */
export const SCA_EXEMPTION_ORDER: readonly ScaExemptionRule[] = [
  {
    name: "low_value",
    priority: 1,
    label: "Low-value transaction",
    condition: "Transaction amount is at or below €30 (PSD2 RTS Art. 11)",
    max_amount_eur: 30,
  },
  {
    name: "secure_corporate",
    priority: 2,
    label: "Secure corporate payment",
    condition: "Payment made through a dedicated/lodged corporate card program (PSD2 RTS Art. 16)",
    max_amount_eur: null,
  },
  {
    name: "merchant_initiated",
    priority: 3,
    label: "Merchant-initiated transaction (out of SCA scope, not a formal RTS exemption)",
    condition: "Merchant-initiated transaction (MIT) using a stored credential with an original SCA reference",
    max_amount_eur: null,
  },
  {
    name: "recurring_fixed",
    priority: 4,
    label: "Recurring fixed-amount collection",
    condition: "Fixed-amount subsequent collection under a mandate, with a prior SCA on file (PSD2 RTS Art. 13)",
    max_amount_eur: null,
  },
  {
    name: "trusted_beneficiary",
    priority: 5,
    label: "Trusted beneficiary",
    condition: "Merchant is on the cardholder's trusted-beneficiary list, added after a prior SCA (PSD2 RTS Art. 12)",
    max_amount_eur: null,
  },
  {
    name: "transaction_risk_analysis",
    priority: 6,
    label: "Transaction risk analysis (TRA)",
    condition: "Acquirer's reference fraud rate qualifies the transaction for an EBA RTS Art. 15 fraud-rate-band cap",
    max_amount_eur: 500,
  },
  {
    name: "one_leg_out",
    priority: 7,
    label: "One-leg-out transaction (territorial scope, not a formal RTS exemption)",
    condition: "Payer or payee is located outside the EEA, so SCA is not territorially mandated for this leg",
    max_amount_eur: null,
  },
];

/**
 * EBA RTS Art. 15 fraud-rate bands, mapped to the TRA exemption's amount cap.
 * Returns 500 | 250 | 100 | 0 (0 = not TRA-eligible at that fraud rate, or no
 * fraud rate supplied). These are the PUBLISHED thresholds — real eligibility
 * still depends on the acquirer's live reference fraud rate; verify with your
 * acquirer before relying on this cap.
 */
export function traCapEur(acquirerFraudBps: number | undefined): number {
  if (acquirerFraudBps === undefined) return 0;
  if (acquirerFraudBps <= 1) return 500;
  if (acquirerFraudBps <= 6) return 250;
  if (acquirerFraudBps <= 13) return 100;
  return 0;
}

function scaRuleApplies(rule: ScaExemptionRule, ctx: ScaExemptionContext): boolean {
  switch (rule.name) {
    case "low_value":
      return ctx.amount_eur <= (rule.max_amount_eur ?? Number.POSITIVE_INFINITY);
    case "secure_corporate":
      return ctx.is_secure_corporate === true;
    case "merchant_initiated":
      return ctx.is_merchant_initiated === true;
    case "recurring_fixed":
      return ctx.is_recurring_fixed === true && ctx.has_prior_sca === true;
    case "trusted_beneficiary":
      return ctx.is_trusted_beneficiary === true && ctx.has_prior_sca === true;
    case "transaction_risk_analysis": {
      const cap = traCapEur(ctx.tra_acquirer_fraud_bps);
      return cap > 0 && ctx.amount_eur <= cap;
    }
    case "one_leg_out":
      return ctx.is_one_leg_out === true;
    default:
      return false;
  }
}

function scaRationale(name: ScaExemptionName, ctx: ScaExemptionContext, traCap?: number): string {
  switch (name) {
    case "low_value":
      return `Transaction amount (€${ctx.amount_eur}) is at or below the €30 low-value exemption threshold (PSD2 RTS Art. 11); SCA not required.`;
    case "secure_corporate":
      return `Payment is routed through a dedicated/lodged secure corporate card program (PSD2 RTS Art. 16); SCA not required.`;
    case "merchant_initiated":
      return `Merchant-initiated transaction (MIT) using a stored credential with an original SCA reference is out of SCA scope; SCA not required.`;
    case "recurring_fixed":
      return `Fixed-amount recurring collection with a prior SCA on file (PSD2 RTS Art. 13); this subsequent collection is exempt.`;
    case "trusted_beneficiary":
      return `Merchant is on the cardholder's trusted-beneficiary list, added after a prior SCA (PSD2 RTS Art. 12); SCA not required.`;
    case "transaction_risk_analysis":
      return `Acquirer transaction-risk analysis qualifies this €${ctx.amount_eur} transaction under the €${traCap ?? traCapEur(ctx.tra_acquirer_fraud_bps)} EBA RTS Art. 15 fraud-band cap; SCA not required.`;
    case "one_leg_out":
      return `Transaction has one leg outside the EEA (payer or payee); SCA is not territorially mandated for this leg. This is a territorial-scope condition, not a formal RTS exemption — verify with your acquirer.`;
    case "3ds2_challenge":
      return `No lighter SCA path applies to this transaction; a 3DS2 SCA challenge is required.`;
  }
}

/**
 * Pure, deterministic SCA exemption decision. Evaluates every rule in
 * SCA_EXEMPTION_ORDER (priority 1 → 7) and returns the highest-priority
 * applicable path, its full candidate list (priority-ascending), and a
 * fallback. Falls back to a mandatory "3ds2_challenge" (sca_required: true)
 * when no lighter path applies.
 *
 * Decision-support only — see the file-level honesty caveats above.
 */
export function decideScaExemption(ctx: ScaExemptionContext): ScaDecision {
  const candidates: ScaExemptionName[] = [];
  for (const rule of SCA_EXEMPTION_ORDER) {
    if (scaRuleApplies(rule, ctx)) candidates.push(rule.name);
  }

  const traConsidered = ctx.tra_acquirer_fraud_bps !== undefined;
  const traCapValue = traConsidered ? traCapEur(ctx.tra_acquirer_fraud_bps) : undefined;

  if (candidates.length === 0) {
    return {
      exemption: "3ds2_challenge",
      priority: 8,
      sca_required: true,
      rationale: scaRationale("3ds2_challenge", ctx),
      fallback: "3ds2_challenge",
      candidates,
      ...(traCapValue !== undefined ? { tra_cap_eur: traCapValue } : {}),
    };
  }

  const chosenName = candidates[0]!;
  const chosenRule = SCA_EXEMPTION_ORDER.find(r => r.name === chosenName)!;
  const fallback: ScaExemptionName = candidates[1] ?? "3ds2_challenge";

  return {
    exemption: chosenName,
    priority: chosenRule.priority,
    sca_required: false,
    rationale: scaRationale(chosenName, ctx, traCapValue),
    fallback,
    candidates,
    ...(traCapValue !== undefined ? { tra_cap_eur: traCapValue } : {}),
  };
}

/**
 * Renders the priority matrix (markdown table) from SCA_EXEMPTION_ORDER —
 * the single source for every "SCA Exemption Decision Matrix" / "Exemption
 * Priority" table in this file's rendered artifacts (checkout-flow.md and
 * agent-purchasing-playbook.md). Columns map 1:1 to ScaExemptionRule fields
 * (no invented "agent action" / "fallback" columns not modeled on the rule).
 */
export function renderScaExemptionMatrix(): string {
  const header = [
    `| Priority | Exemption | Label | Condition | Max Amount (EUR) |`,
    `|----------|-----------|-------|-----------|-------------------|`,
  ];
  const rows = SCA_EXEMPTION_ORDER.map(r =>
    `| ${r.priority} | \`${r.name}\` | ${r.label} | ${r.condition} | ${r.max_amount_eur === null ? "Unlimited" : `€${r.max_amount_eur}`} |`,
  );
  return [...header, ...rows].join("\n");
}

/**
 * Ascii decision-tree branches for the "Agent SCA Decision Tree" section,
 * generated from SCA_EXEMPTION_ORDER so it cannot fall out of sync with the
 * priority table produced by renderScaExemptionMatrix.
 */
function renderScaDecisionTreeBranches(): string {
  return SCA_EXEMPTION_ORDER
    .map(r => `  ├─ ${r.label}? → ${r.name.toUpperCase()} (no SCA)`)
    .join("\n");
}

export function generateAgentPurchasingPlaybook(
  ctx: ContextMap,
  _profile: RepoProfile,
  files?: SourceFile[],
): GeneratedFile {
  const name = ctx.project_identity.name;
  const type = ctx.project_identity.type.replace(/_/g, " ");
  const fws = ctx.detection.frameworks.map(f => f.name).join(", ") || "none detected";
  const lang = ctx.project_identity.primary_language;
  const signals = detectCommerceSignals(files);

  const providerList = signals.detected_providers.length > 0
    ? signals.detected_providers.map(p => {
      const n = detectProviderEvidence(p, files).files; // per-provider count, not the global total
      return `- **${p}** detected in ${n} file${n === 1 ? "" : "s"}`;
    }).join("\n")
    : "- No payment providers detected — repo may not yet be payment-enabled";

  const ap2ProviderRows = signals.detected_providers.length > 0
    ? signals.detected_providers.map(p => {
      const ev = detectProviderEvidence(p, files);
      const mandate = ev.files > 0 && ev.mandateTypes ? ev.mandateTypes : "none found in repo";
      // No file count here: ev.files counts provider-matching files, NOT tokenization
      // matches, so "(55 files)" would overstate the tokenization footprint.
      const token = ev.tokenization ? "detected in repo" : "not found — verify with PSP";
      const sca = ev.sca ? "detected in repo" : "not detected — verify (regulatory)";
      return `| ${p} | ${mandate} | ${token} | ${sca} |`;
    }).join("\n")
    : "| (no providers detected) | — | — | — |";

  const content = `# AXIS Agent Purchasing Playbook — ${mdText(name)}

> How an AI agent can autonomously discover, evaluate, and purchase AXIS analysis programs for this codebase.

## Project Context

| Field | Value |
|-------|-------|
| Project | ${mdInline(name)} |
| Type | ${mdInline(type)} |
| Language | ${mdInline(lang)} |
| Frameworks | ${mdInline(fws)} |
| Files | ${ctx.structure.total_files} |

## Repository Commerce Signals

Detection results from \`${ctx.structure.total_files}\` source files:

${providerList}
- Checkout flow code: ${signals.has_checkout ? "✅ Detected" : "❌ Not detected"}
- Recurring/mandate billing: ${signals.has_recurring ? "✅ Detected" : "❌ Not detected"}
- SCA/3DS2 handling: ${signals.has_sca ? "✅ Detected" : "❌ Not detected"}
- Dispute/refund handling: ${signals.has_dispute_handling ? "✅ Detected" : "❌ Not detected"}
- Payment webhooks: ${signals.has_webhooks ? "✅ Detected" : "❌ Not detected"}
- TAP protocol support: ${signals.has_tap_protocol ? "✅ Detected" : "❌ Not detected"}
- Network tokenization (VTS/MDES): ${signals.has_network_tokenization ? "✅ Detected" : "❌ Not detected"}
- Mandate management: ${signals.has_mandate_management ? "✅ Detected" : "❌ Not detected"}

## AP2 Mandate Requirements for Detected Providers

| Provider | Mandate Types | Network Tokenization | SCA Required |
|----------|---------------|---------------------|--------------|
${ap2ProviderRows}

> These cells report what was **detected in this repository** for each provider (patterns co-occurring in the files that reference it) — not the provider's own capabilities. "Not found in repo" means this codebase shows no such code yet; confirm actual support with your PSP.

## What Is AXIS?

Axis' Iliad analyzes codebases and generates ${ARTIFACT_COUNT} structured artifacts across ${PROGRAM_COUNT} programs.
Each program is a separate SKU that produces AI-consumable governance files — AGENTS.md,
.cursorrules, architecture maps, debug playbooks, brand guidelines, design tokens, and more.

Agents can call AXIS directly via the MCP interface at \`POST /mcp\`.

## Step-by-Step: Agent Purchase Flow

### Step 1 — Discover Available Programs
\`\`\`json
POST /mcp
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": { "name": "list_programs", "arguments": {} }
}
\`\`\`

Returns all ${PROGRAM_COUNT} programs with tier (free/pro) and generator counts.
Free programs: search, skills, debug.
Pro programs: all others (${PROGRAM_ORDER.filter(p => !["search", "skills", "debug"].includes(p)).join(", ")}).

### Step 2 — Obtain an API Key (if not already held)
\`\`\`
POST /v1/accounts
{ "name": "<agent-name>", "email": "<agent-email>", "tier": "pro" }
\`\`\`

Store the returned \`api_key.raw_key\` securely.

### Step 3 — Analyze the Repository
\`\`\`json
POST /mcp
Authorization: Bearer <api_key>
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "analyze_repo",
    "arguments": { "github_url": "https://github.com/<owner>/<repo>" }
  }
}
\`\`\`

Returns \`snapshot_id\` and full artifact listing.

### Step 4 — Retrieve Specific Artifacts
\`\`\`json
POST /mcp
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "get_artifact",
    "arguments": { "snapshot_id": "<id>", "path": "AGENTS.md" }
  }
}
\`\`\`

## Recommended Programs for This Project

Based on project type **${mdText(type)}** with ${mdText(lang)}:

${ctx.detection.frameworks.length > 0 ? `- **frontend** — Component guidelines and UI audit (detected ${mdText(fws)})\n` : ""}- **debug** — Debug playbook, incident templates, root cause checklists (free)
- **skills** — AGENTS.md, CLAUDE.md, .cursorrules for AI coding tools (free)
- **optimization** — Token budget plans, cost estimates, prompt diff reports
- **superpowers** — Workflow registry, test generation rules, automation pipeline
- **agentic-purchasing** — This program (commerce artifacts for agent use)

## Autonomous Purchase Decision Rules

An agent SHOULD purchase AXIS programs when:
1. The project requires structured AI context files (always recommend search + skills)
2. Cost-benefit: AXIS generates artifacts worth more in agent tokens than the program cost
3. The agent is initiating a long-lived session on an unfamiliar codebase

An agent SHOULD NOT purchase when:
1. The snapshot is less than 24 hours old and artifacts are still fresh
2. The project has fewer than 10 source files
3. The agent is in read-only information gathering mode
4. Same program was purchased in the last 24 hours for this repo

${buildTapInteropSection(signals)}

${buildDisputeFlowSection(signals)}

${buildCompellingEvidence3Section(signals)}

${buildDisputeEvidenceChecklist()}

${buildLighterScaSection(signals)}

${buildAP2ComplianceScoring(signals)}

${buildVerificationProof(signals, "generateAgentPurchasingPlaybook")}
`;

  return {
    path: "agent-purchasing-playbook.md",
    content,
    content_type: "text/markdown",
    program: "agentic-purchasing",
    description: `Autonomous agent purchasing playbook — discovery, evaluation, and acquisition flow for ${name}`,
  };
}



// ─── 2. Product Schema ────────────────────────────────────────────

export function generateProductSchema(
  ctx: ContextMap,
  _profile: RepoProfile,
  files?: SourceFile[],
): GeneratedFile {
  const signals = detectCommerceSignals(files);
  const schema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    schema_version: "1.0",
    product: "Axis' Iliad",
    generated_for: ctx.project_identity.name,
    generated_at: ctx.generated_at.split("T")[0],
    mcp_endpoint: "POST /mcp",
    repo_commerce_profile: {
      methodology: "Keyword-signal scan of submitted files — a checklist starting point, not a certification, audit, or legal/compliance advice.",
      detected_payment_providers: signals.detected_providers,
      capabilities: {
        checkout_flow: signals.has_checkout,
        recurring_billing: signals.has_recurring,
        sca_3ds2: signals.has_sca,
        dispute_handling: signals.has_dispute_handling,
        payment_webhooks: signals.has_webhooks,
        tap_protocol: signals.has_tap_protocol,
        network_tokenization: signals.has_network_tokenization,
        mandate_management: signals.has_mandate_management,
      },
      ap2_mandate_compliance: {
        mandate_data_format: "AP2 standardized mandate object with payment_method, amount, currency, mandate_type, sca_exemption_reason",
        mandate_lifecycle: "CREATE → AUTHORIZE (SCA) → ACTIVE → COLLECT → AMEND → CANCEL",
        ucp_settlement_path: "UCP settlement instruction with clearing_system, settlement_currency, value_date, settlement_finality",
        visa_intelligent_commerce: "Visa IC — network tokenization via VTS, DPAN provisioning, cryptogram generation, device binding (protocol reference; AXIS's direct VTS/MDES provisioning is capability-gated behind a network-issued Token Requestor ID — its live path is the Stripe network-token read adapter)",
        tap_interop: "Token Action Protocol — provision/activate/suspend/resume/delete lifecycle for network tokens (executable state machine in AXIS; illegal transitions rejected)",
        // Require ACTUAL payment-integration evidence (provider + checkout + a
        // compliance signal), not an incidental keyword — a code-analysis tool that
        // merely MENTIONS Stripe was declared "ready for autonomous purchase".
        ready_for_autonomous_purchase: signals.detected_providers.length > 0 && signals.has_checkout && (signals.has_sca || signals.has_dispute_handling),
      },
      sca_exemption_schema: {
        note: "Exemption definitions and thresholds come from PSD2 and its regulatory technical standards — verify current rules with your acquirer.",
        low_value: { threshold_eur: 30, auto_apply: true },
        trusted_beneficiary: { requires_prior_sca: true },
        recurring_fixed: { sca_on_first: true },
        merchant_initiated: { requires_original_sca_ref: true },
        transaction_risk_analysis: { max_threshold_eur: 500, depends_on: "acquirer fraud rate" },
      },
      dispute_resolution_schema: {
        pre_dispute: { mechanism: "CDRN/RDR", sla_hours: 72 },
        chargeback: { evidence_deadline_days: 30, reason_code_families: ["10.x fraud", "13.x consumer"] },
        representment: { window_days: 45, evidence_types: ["receipt", "delivery_proof", "3ds_auth_log", "communication"] },
        arbitration: { filing_fee_usd: 500, finality: "binding" },
        compelling_evidence_3: {
          version: "3.0",
          qualified_data_elements: CE3_QUALIFIED_DATA_ELEMENTS,
          min_matching_data_elements: CE3_MIN_MATCHING_DATA_ELEMENTS,
          min_prior_transactions: CE3_MIN_PRIOR_TRANSACTIONS,
          min_prior_transaction_age_days: CE3_MIN_PRIOR_TRANSACTION_AGE_DAYS,
          lookback_days: CE3_LOOKBACK_DAYS,
          // CE 3.0 applies to card-absent fraud (10.4) only; 10.2/10.3 are
          // card-present conditions outside its scope.
          target_reason_codes: CE3_TARGET_REASON_CODES,
          auto_assembly_ready: signals.has_dispute_handling && signals.has_webhooks,
        },
      },
      agent_sca_optimization: {
        // Sourced from SCA_EXEMPTION_ORDER (single source of truth, WO-06) so
        // this list can't drift from the rendered SCA Exemption Decision Matrix.
        exemption_priority: SCA_EXEMPTION_ORDER.map(r => r.name),
        frictionless_first: true,
        challenge_escalation: "abort_agent_flow_escalate_to_operator",
      },
      dispute_evidence_requirements: {
        ce3_min_prior_undisputed_transactions: CE3_MIN_PRIOR_TRANSACTIONS,
        ce3_min_prior_transaction_age_days: CE3_MIN_PRIOR_TRANSACTION_AGE_DAYS,
        ce3_lookback_window_days: CE3_LOOKBACK_DAYS,
        ce3_min_matching_data_elements: CE3_MIN_MATCHING_DATA_ELEMENTS,
        ce3_qualified_data_elements: CE3_QUALIFIED_DATA_ELEMENTS,
        represent_vs_refund: "Business decision — follow your operator's dispute policy. AXIS does not publish win-rate estimates.",
      },
    },
    // outputs derive from the generator registry (program-manifest) so this
    // catalog can never drift from what the API actually emits.
    programs: [
      { slug: "search",            tier: "free", description: "Context map, repo profile, architecture summary, dependency hotspots, symbol index, and repo run stats" },
      { slug: "skills",            tier: "free", description: "AGENTS.md, CLAUDE.md, .cursorrules, workflow pack, policy pack, model cascade" },
      { slug: "debug",             tier: "free", description: "Debug playbook, incident template, tracing rules, root cause checklist" },
      { slug: "frontend",          tier: "pro",  description: "Frontend rules, component guidelines, layout patterns, UI audit" },
      { slug: "seo",               tier: "pro",  description: "SEO rules, schema recommendations, route priority map, content audit, meta tag audit" },
      { slug: "optimization",      tier: "pro",  description: "Optimization rules, prompt diff report, cost estimate, token budget plan" },
      { slug: "theme",             tier: "pro",  description: "Design tokens, theme CSS, theme guidelines, component theme map, dark mode tokens" },
      { slug: "brand",             tier: "pro",  description: "Brand guidelines, voice and tone, content constraints, messaging system, channel rulebook" },
      { slug: "superpowers",       tier: "pro",  description: "Superpower pack, workflow registry, test generation rules, refactor checklist, automation pipeline, and the verify gate (verify.sh, verify-full.sh, pre-push hook)" },
      { slug: "marketing",         tier: "pro",  description: "Campaign brief, funnel map, sequence pack, CRO playbook, A/B test plan" },
      { slug: "notebook",          tier: "pro",  description: "Notebook summary, source map, study brief, research threads, citation index" },
      { slug: "obsidian",          tier: "pro",  description: "Obsidian skill pack, vault rules, graph prompt map, linking policy, template pack" },
      { slug: "mcp",               tier: "pro",  description: "MCP config, registry metadata, protocol/types, implementation guides, connector/capability manifests, fintech surface package, and fintech domain schema" },
      { slug: "artifacts",         tier: "pro",  description: "Generated component, dashboard widget, embed snippet, artifact spec, component library, PRD, design doc, tasks breakdown, session context, root index.html, capability map" },
      { slug: "remotion",          tier: "pro",  description: "Remotion script, scene plan, render config, asset checklist, storyboard" },
      { slug: "canvas",            tier: "pro",  description: "Canvas spec, social pack, poster layouts, asset guidelines, brand board" },
      { slug: "algorithmic",       tier: "pro",  description: "Generative sketch, parameter pack, collection map, export manifest, variation matrix" },
      { slug: "agentic-purchasing",tier: "pro",  description: "Purchasing playbook, product schema, checkout flow, negotiation rules, commerce registry" },
      { slug: "closer",            tier: "pro",  description: "Packaging README/LICENSE, Dockerfile, docker-compose, GitHub Actions workflows (CI + release), platform manifests (npm/unreal/vscode/dockerhub/github-marketplace), trust-fabric attestation + merkle proof, packaging report, DISTRIBUTABLE.md, and Makefile" },
      { slug: "deploy",            tier: "pro",  description: "Zero-pipeline-minutes deploy kit covering Render (runtime: image) and Cloudflare (Pages + Containers): stack-aware Dockerfile + .dockerignore, dev compose, render.yaml, GHCR push scripts (bash + ps1), wrangler.pages.toml, wrangler.containers.toml, Cloudflare Worker entry, deploy-cloudflare scripts (bash + ps1), VSCode debug-attach template, and qualification report" },
    ].map(p => ({ slug: p.slug, tier: p.tier, outputs: PROGRAM_OUTPUT_COUNTS[p.slug] ?? 0, description: p.description })),
    purchase_endpoint: "POST /v1/billing/purchase",
    auth: { type: "bearer", header: "Authorization", format: "Bearer <api_key>" },
    agent_quotas: {
      per_session_limit_cents: 10000,
      per_month_limit_cents: 50000,
      tiers: {
        free: { calls_per_month: 3, budget_cents: 0 },
        pro: { calls_per_month: null, budget_cents: 500000 },
      },
    },
    total_programs: PROGRAM_COUNT,
    total_outputs: ARTIFACT_COUNT,
  };

  return {
    path: "product-schema.json",
    content: JSON.stringify(schema, null, 2),
    content_type: "application/json",
    program: "agentic-purchasing",
    description: `Machine-readable AXIS product schema — ${PROGRAM_COUNT} programs, tiers, outputs, repo commerce profile, and AP2/UCP/Visa mandate fields`,
  };
}

// ─── 3. Checkout Flow ─────────────────────────────────────────────

export function generateCheckoutFlow(
  ctx: ContextMap,
  _profile: RepoProfile,
  files?: SourceFile[],
): GeneratedFile {
  const name = ctx.project_identity.name;
  const signals = detectCommerceSignals(files);
  const providerNote = signals.detected_providers.length > 0
    ? `Detected providers: ${signals.detected_providers.join(", ")}.`
    : "No payment providers detected — implement provider integration before production.";

  // NOTE: the "Scenario | Action | AP2 Field" table below (in the "SCA / 3DS2
  // Handling" section) is intentionally NOT rendered from SCA_EXEMPTION_ORDER.
  // It maps request/response scenarios (including 3DS2 challenge/frictionless
  // outcomes that are not lighter-SCA paths at all) to AP2 wire fields — a
  // different concern from the 7-priority exemption matrix rendered by
  // renderScaExemptionMatrix() further down via buildLighterScaSection().
  const content = `# Autonomous Checkout Flow — ${mdText(name)}

> Specification for how AI agents complete AXIS program purchases without human intervention.

## Flow Overview

\`\`\`
Agent Request → Validate Intent → Check Balance → API Call → Confirm → Return Artifacts
\`\`\`

## Repository Status

${providerNote}

## Decision Tree

### 1. Intent Validation
- Does the agent have a clear task requiring structured AI context?
- Is the target repository accessible?
- Is this the most cost-effective approach (vs. manual context gathering)?

**Gate:** If any answer is NO, abort purchase. Gather context manually.

### 2. Program Selection Logic
\`\`\`typescript
const programsToBuy = programs.filter(p => {
  // Always include free programs
  if (p.tier === 'free') return true;
  // Buy pro programs based on task requirements
  if (taskRequires.frontend && p.slug === 'frontend') return true;
  if (taskRequires.debugging && p.slug === 'debug') return true;
  if (taskRequires.aiContext && p.slug === 'skills') return true;
  return false;
});
\`\`\`

### 3. API Call Sequence
\`\`\`
Step 1: POST /mcp → initialize (get session)
Step 2: POST /mcp → tools/call analyze_repo OR analyze_files
Step 3: POST /mcp → tools/call get_snapshot (verify completion)
Step 4: POST /mcp → tools/call get_artifact (fetch needed artifacts)
Step 5: Inject artifacts into agent context window
\`\`\`

### 4. Post-Purchase Verification
- Verify all requested artifact paths are returned
- Confirm content is non-empty and valid for the format (JSON, Markdown, YAML)
- Cache \`snapshot_id\` for re-use within 24 hours

## Payment Mandate Schema (AP2 Fields)

Every autonomous purchase MUST include these AP2 mandate fields:

\`\`\`json
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
\`\`\`

## SCA / 3DS2 Handling

${RAIL_APPLICABILITY_NOTE}

${signals.has_sca ? "✅ SCA/3DS2 code detected in this repository." : "⚠️ No SCA/3DS2 code detected — add challenge flow before processing EU/UK transactions."}

| Scenario | Action | AP2 Field |
|----------|--------|-----------|
| Transaction < €30 | Apply low_value exemption | \`sca_exemption: "low_value"\` |
| Trusted merchant | Apply trusted_beneficiary | \`sca_exemption: "trusted_beneficiary"\` |
| Recurring fixed | Apply recurring exemption | \`sca_exemption: "recurring"\` |
| Challenge required | Redirect to 3DS2 ACS | \`challenge_indicator: "04"\` |
| Frictionless approved | Proceed without redirect | \`challenge_indicator: "03"\` |

**Zero-Click Checkout Rule:** Agents MUST use a stored mandate with SCA pre-authorization.
Never trigger interactive SCA during an autonomous purchase session.

## Dispute and Return Flow

${RAIL_APPLICABILITY_NOTE}

${signals.has_dispute_handling ? "✅ Dispute/refund handling detected in this repository." : "⚠️ No dispute handling code detected — implement refund logic before production."}

\`\`\`
Purchase Failed?
  ├── 402 Payment Required → Follow payment_session_url, retry
  ├── 404 Snapshot Not Found → Re-analyze, re-purchase
  ├── 429 Rate Limited → Wait 60s, exponential backoff
  └── Chargeback Filed?
        ├── Within 24h → AutoRefund via POST /v1/billing/refund
        └── After 24h → Escalate to operator, halt agent session
\`\`\`

**Return Policy for Agent Purchases:**
- Unused credits: refund within 30 days
- Failed analysis: automatic re-run at no charge
- Duplicate purchase (same snapshot_id < 24h): automatic refund

## Agent Authorization Policy
- Authentication scheme: bearer token via \`Authorization: Bearer <api_key>\` header
- Agents with \`tier: pro\` API keys may purchase any program
- Agents with \`tier: free\` API keys receive search, skills, debug outputs only
- All purchases are scoped to a single snapshot (immutable, deterministic)

## Error Recovery
| Error | Recovery Action |
|-------|----------------|
| 401 Unauthorized | Refresh API key from vault |
| 402 Payment Required | Follow \`payment_session_url\` in response body |
| 429 Rate Limited | Wait 60s, retry with exponential backoff |
| 404 Snapshot Not Found | Re-run analysis with new snapshot |
| Quota Exceeded | Upgrade tier or wait for quota reset |

## Frictionless Approval Guidance

Frictionless approval rate and challenge rate vary by issuer, region, and transaction profile —
AXIS does not publish approval-rate figures. To reduce challenge friction:

- Pre-qualify SCA exemptions (low_value, trusted_beneficiary, recurring) before initiating payment
- Use stored mandates with prior SCA authorization where available
- Escalate to your operator instead of abandoning when the issuer requires a challenge
- Measure your own approval and challenge rates with your PSP's reporting tools

## Network Token Payload (VTS/MDES)

${RAIL_APPLICABILITY_NOTE}

When network tokenization is available, include in payment request:

\`\`\`json
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
\`\`\`

Network tokenization status: ${signals.has_network_tokenization ? "✅ Detected — DPAN flow available" : "⚠️ Not detected — fall back to PAN-based flow"}

> Honest scope: AXIS ships an executable token-lifecycle state machine and a live Stripe
> network-token READ adapter. Direct VTS/MDES provisioning is capability-gated behind a
> network-issued Token Requestor ID and returns a structured \`_not_configured\` envelope
> until Visa/Mastercard onboarding exists — not unconditional live VTS+MDES.

${buildLighterScaSection(signals)}

${buildCompellingEvidence3Section(signals)}

${buildVerificationProof(signals, "generateCheckoutFlow")}
`;

  return {
    path: "checkout-flow.md",
    content,
    content_type: "text/markdown",
    program: "agentic-purchasing",
    description: "Autonomous checkout flow — zero-click spec, AP2 payment mandate schema, SCA/3DS2 handling, dispute/return flow",
  };
}

// ─── 4. Negotiation Rules ─────────────────────────────────────────

export function generateNegotiationRules(
  ctx: ContextMap,
  profile: RepoProfile,
  files?: SourceFile[],
): GeneratedFile {
  const name = ctx.project_identity.name;
  const fileCount = ctx.structure.total_files;
  const loc = ctx.structure.total_loc;
  const sepScore = profile.health.separation_score;
  const complexity = sepScore < 0.3 ? "high" : sepScore < 0.7 ? "medium" : "low";
  const signals = detectCommerceSignals(files);

  const mandateRows = signals.detected_providers.length > 0
    ? signals.detected_providers.map(p => {
      // Risk level + per-session cap are MERCHANT POLICY, not provider facts.
      // Emit configurable placeholders (grounded in whether SCA code was found for
      // the provider) instead of inventing per-brand risk tiers and dollar caps.
      const ev = detectProviderEvidence(p, files);
      const risk = ev.sca ? "set per policy (SCA code present)" : "set per policy (no SCA code found)";
      return `| ${p} | Per-transaction | Require SCA pre-auth | ${risk} | set per policy |`;
    }).join("\n")
    : "| (none detected) | — | — | — | — |";

  const content = `# Agent Negotiation Rules — ${mdText(name)}

> Rules governing how agents evaluate value, compare alternatives, and decide whether to purchase AXIS programs.

## Project Valuation Signals

| Signal | Value | Weight |
|--------|-------|--------|
| File count | ${fileCount} files | Medium |
| Lines of code | ${loc} LOC | High |
| Complexity estimate | ${complexity} | High |
| Separation score | ${sepScore.toFixed(2)} / 1.0 | High |

## Value Assessment Formula

\`\`\`
value_score = (loc / 1000) * 0.4
            + (file_count / 10) * 0.3
            + (complexity_score) * 0.3
            + (commerce_signal_bonus)
\`\`\`

Where \`complexity_score\` = 1 (low) | 2 (medium) | 3 (high).
Where \`commerce_signal_bonus\` = detected_providers × 0.15 + (has_sca ? 0.10 : 0) + (has_dispute ? 0.10 : 0).

**Estimated value score for ${mdText(name)}:** ${((loc / 1000) * 0.4 + (fileCount / 10) * 0.3 + (complexity === "high" ? 3 : complexity === "medium" ? 2 : 1) * 0.3 + signals.detected_providers.length * 0.15 + (signals.has_sca ? 0.10 : 0) + (signals.has_dispute_handling ? 0.10 : 0)).toFixed(2)}

## Cost Considerations

AXIS pro programs are priced per call ($0.50 standard, $0.15–$0.25 lite mode). Whether a
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
${mandateRows}

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

Network tokenization status: ${signals.has_network_tokenization ? "✅ Detected — agents may use stored DPANs for frictionless negotiation" : "⚠️ Not detected — agents must fall back to PAN-based flows"}
Mandate management: ${signals.has_mandate_management ? "✅ Detected — mandate amendment negotiation enabled" : "⚠️ Not detected — agents cannot negotiate mandate terms"}

${buildDisputeEvidenceChecklist()}

${buildVerificationProof(signals, "generateNegotiationRules")}
`;

  return {
    path: "negotiation-rules.md",
    content,
    content_type: "text/markdown",
    program: "agentic-purchasing",
    description: "Agent negotiation rules — value assessment, AP2/UCP mandate constraints, autonomous purchase bounds, and cost considerations",
  };
}

// ─── 5. Commerce Registry ─────────────────────────────────────────

export function generateCommerceRegistry(
  ctx: ContextMap,
  _profile: RepoProfile,
  files?: SourceFile[],
): GeneratedFile {
  const signals = detectCommerceSignals(files);
  // Graduated readiness score — weighted rubric with depth tiers
  // Graduated tiers — both non-zero branches returned 20, so a single incidental
  // provider keyword scored the full 20 points (same as 11 providers).
  const providerDepth = signals.detected_providers.length > 2 ? 20 : signals.detected_providers.length > 0 ? 10 : 0;
  const checkoutDepth = signals.has_checkout ? 15 : 0;
  const recurringDepth = signals.has_recurring && signals.has_mandate_management ? 12 : signals.has_recurring ? 10 : 0;
  const scaDepth = signals.has_sca && signals.has_mandate_management ? 15 : signals.has_sca ? 12 : 0;
  const disputeDepth = signals.has_dispute_handling && signals.has_webhooks ? 13 : signals.has_dispute_handling ? 10 : 0;
  const tokenDepth = signals.has_tap_protocol && signals.has_network_tokenization ? 10 : signals.has_tap_protocol || signals.has_network_tokenization ? 6 : 0;
  const mandateDepth = signals.has_mandate_management ? 5 : 0;
  const webhookDepth = signals.has_webhooks ? 10 : 0;
  const ap2ReadyScore = Math.min(100, providerDepth + checkoutDepth + recurringDepth + scaDepth + disputeDepth + tokenDepth + mandateDepth + webhookDepth);

  const registry = {
    registry_version: "1.0",
    product: "Axis' Iliad",
    project: ctx.project_identity.name,
    generated_at: ctx.generated_at.split("T")[0],
    axis_base_url: "https://api.axis-iliad.com",
    mcp_endpoint: "POST /mcp",
    repo_commerce_signals: {
      detected_providers: signals.detected_providers,
      has_checkout: signals.has_checkout,
      has_recurring: signals.has_recurring,
      has_sca: signals.has_sca,
      has_dispute_handling: signals.has_dispute_handling,
      has_webhooks: signals.has_webhooks,
      has_tap_protocol: signals.has_tap_protocol,
      has_network_tokenization: signals.has_network_tokenization,
      has_mandate_management: signals.has_mandate_management,
      total_payment_files: signals.total_payment_files,
    },
    ap2_compliance_assessment: {
      methodology: "Keyword-signal scan of repository files — a checklist starting point, not a certification, audit, or legal/compliance advice.",
      readiness_score: ap2ReadyScore,
      max_score: 100,
      // Signal-coverage language, not a readiness/certification claim — a keyword scan
      // that merely finds payment TERMS must not be reported as "production-ready".
      // Mirrors buildAP2ComplianceScoring's "signal coverage" wording.
      interpretation: ap2ReadyScore >= 70 ? "strong-signal-coverage" : ap2ReadyScore >= 40 ? "partial-signal-coverage" : "minimal-signal-coverage",
      gaps: [
        ...(!signals.detected_providers.length ? ["No payment provider integration detected"] : []),
        ...(!signals.has_checkout ? ["No checkout flow implementation detected"] : []),
        ...(!signals.has_sca ? ["SCA/3DS2 handling not detected — required for EU/UK PSD2 compliance"] : []),
        ...(!signals.has_dispute_handling ? ["No dispute/refund handling detected — implement dispute and refund flows before production"] : []),
        ...(!signals.has_webhooks ? ["No payment webhooks — needed for mandate event processing"] : []),
        ...(!signals.has_network_tokenization ? ["Network tokenization not detected — verify availability with your PSP if you plan to use network tokens"] : []),
        ...(!signals.has_mandate_management ? ["No mandate management detected — needed for recurring mandate workflows"] : []),
      ],
      visa_intelligent_commerce: {
        // Evidence-only (matching the playbook's stated policy) — the mere presence
        // of a provider NAME can't back a tokenization capability.
        network_tokenization: signals.has_network_tokenization ? "detected" : "not-detected-verify-with-psp",
        token_service_provider: signals.has_network_tokenization ? "integration-detected" : "requires-manual-verification",
        device_binding: "out-of-scope-for-static-analysis",
        tap_protocol: signals.has_tap_protocol ? "detected" : "not-detected",
      },
      dispute_readiness: {
        has_dispute_code: signals.has_dispute_handling,
        // Report the raw signal — Visa CDRN capability requires Verifi/Visa
        // enrollment; it can't be inferred from a generic webhook/event handler.
        pre_dispute_mechanism: signals.has_webhooks ? "webhook-event-source-present" : "not-detected",
        rapid_dispute_resolution: "requires-enrollment-verification",
        evidence_automation: signals.has_dispute_handling && signals.has_webhooks ? "automatable" : "manual-required",
        compelling_evidence_3: {
          // Derived, not a constant true stamped on every repo (incl. zero-dispute ones).
          supported: signals.has_dispute_handling,
          auto_assembly_ready: signals.has_dispute_handling && signals.has_webhooks,
          // CE 3.0 applies to the card-absent fraud condition 10.4 ONLY — 10.2/10.3
          // are card-present conditions outside CE 3.0 scope.
          target_reason_codes: CE3_TARGET_REASON_CODES,
          evidence_requirements: {
            min_prior_undisputed_transactions: CE3_MIN_PRIOR_TRANSACTIONS,
            min_prior_transaction_age_days: CE3_MIN_PRIOR_TRANSACTION_AGE_DAYS,
            lookback_window_days: CE3_LOOKBACK_DAYS,
            min_matching_data_elements: CE3_MIN_MATCHING_DATA_ELEMENTS,
            qualified_data_elements: CE3_QUALIFIED_DATA_ELEMENTS,
          },
        },
        represent_vs_refund: "Business decision — follow your operator's dispute policy. AXIS does not publish win-rate estimates.",
      },
      verification_proof: {
        checks_passed: [
          signals.detected_providers.length > 0, signals.has_checkout, signals.has_sca,
          signals.has_dispute_handling, signals.has_webhooks, signals.has_network_tokenization,
          signals.has_mandate_management, signals.has_tap_protocol,
        ].filter(Boolean).length,
        checks_total: 8,
        grade: (() => {
          const p = [
            signals.detected_providers.length > 0, signals.has_checkout, signals.has_sca,
            signals.has_dispute_handling, signals.has_webhooks, signals.has_network_tokenization,
            signals.has_mandate_management, signals.has_tap_protocol,
          ].filter(Boolean).length;
          return p >= 6 ? "A" : p >= 4 ? "B" : p >= 2 ? "C" : "D";
        })(),
      },
    },
    // WO-13: engine-derived decisions with a reproducibility proof. Every
    // number in this block is CALLED from the real engines (gradeCompliance /
    // decideScaExemption / renderScaExemptionMatrix — the same functions the
    // grade_compliance / sca_exemption_decision MCP tools expose) rather than
    // recomputed inline, and the sha256 proof over canonical inputs+outputs
    // makes identical inputs verifiably yield identical decisions.
    verified_decisions: (() => {
      const compliance = gradeCompliance(files);
      const scaSamples = [
        { input: { amount_eur: 20 }, decision: decideScaExemption({ amount_eur: 20 }) },
        { input: { amount_eur: 400, tra_acquirer_fraud_bps: 1 }, decision: decideScaExemption({ amount_eur: 400, tra_acquirer_fraud_bps: 1 }) },
        { input: { amount_eur: 1000 }, decision: decideScaExemption({ amount_eur: 1000 }) },
      ];
      const scaMatrixMd = renderScaExemptionMatrix();
      return {
        compliance,
        sca_samples: scaSamples,
        sca_matrix_digest: proofDigest(["renderScaExemptionMatrix() markdown"], scaMatrixMd),
        engines: {
          compliance: "@axis/generator-core gradeCompliance(files) — also exposed as the grade_compliance MCP tool",
          sca: "@axis/generator-core decideScaExemption(ctx) — also exposed as the sca_exemption_decision MCP tool",
          matrix: "@axis/generator-core renderScaExemptionMatrix() — single source for every SCA matrix table",
        },
        proof: proofDigest(
          ["repo_commerce_signals", "compliance_grade", "sca_samples"],
          { signals, compliance, sca_samples: scaSamples },
        ),
      };
    })(),
    // Each bundle's `outputs` is derived from its `programs` via the shared
    // registry (bundleOutputs), and pro-all enumerates PROGRAM_ORDER — so the
    // catalog can never claim a program count or output total the API can't back.
    catalog: [
      {
        id: "free-bundle",
        name: "Free Analysis Bundle",
        programs: ["search", "skills", "debug"],
        tier: "free",
        price_cents: 0,
        description: `Context map, AGENTS.md, debug playbook, and ${bundleOutputs(["search", "skills", "debug"]) - 3} more artifacts — no purchase required`,
      },
      {
        id: "pro-all",
        name: `Pro Complete (All ${PROGRAM_COUNT} Programs)`,
        programs: [...PROGRAM_ORDER],
        tier: "pro",
        price_cents: 5000,
        description: `All ${ARTIFACT_COUNT} structured artifacts across ${PROGRAM_COUNT} programs — full AI-native governance layer`,
      },
      {
        id: "dev-essentials",
        name: "Developer Essentials",
        programs: ["search", "skills", "debug", "frontend", "optimization", "superpowers"],
        tier: "pro",
        price_cents: 2500,
        description: "Core development artifacts: context, AI rules, debug, frontend, optimization, and superpowers",
      },
      {
        id: "brand-marketing",
        name: "Brand & Marketing Suite",
        programs: ["brand", "marketing", "seo", "canvas"],
        tier: "pro",
        price_cents: 2000,
        description: "Brand guidelines, marketing playbooks, SEO rules, and visual design artifacts",
      },
    ].map(b => ({
      id: b.id,
      name: b.name,
      programs: b.programs,
      outputs: bundleOutputs(b.programs),
      tier: b.tier,
      price_cents: b.price_cents,
      price_interval: "per_call",
      description: b.description,
      api_call: { method: "tools/call", tool: "analyze_repo", requires_auth: true },
    })),
    agent_endpoints: [
      { path: "/mcp",                          method: "POST", description: "MCP Streamable HTTP — primary agent interface (JSON-RPC 2.0)" },
      { path: "/mcp",                          method: "GET",  description: "MCP SSE — server-initiated messages" },
      { path: "/v1/accounts",                  method: "POST", description: "Create account and get API key" },
      { path: "/v1/account",                   method: "GET",  description: "Get current account info (requires auth)" },
      { path: "/v1/programs",                  method: "GET",  description: "List all programs and their outputs" },
    ],
    auth: {
      type: "bearer",
      header: "Authorization",
      format: "Bearer <raw_key>",
      obtain: "POST /v1/accounts → api_key.raw_key",
    },
    agent_quotas: {
      per_session_limit_cents: 10000,
      per_month_limit_cents: 50000,
      tiers: {
        free: { calls_per_month: 3, budget_cents: 0 },
        pro: { calls_per_month: null, budget_cents: 500000 },
      },
    },
    mandate_lifecycle_events: [
      { event: "CREATE", description: "Mandate ID assigned, status=pending_authorization" },
      { event: "AUTHORIZE", description: "SCA challenge completed, status=active" },
      { event: "COLLECT", description: "Payment collected via the configured clearing system" },
      { event: "AMEND", description: "Amount or schedule changed, re-SCA if material" },
      { event: "SUSPEND", description: "Temporarily paused, no collections" },
      { event: "RESUME", description: "Reactivated after suspension" },
      { event: "CANCEL", description: "Terminated, no further collections" },
    ],
    liability_risk: {
      note: "Non-compliance consequences (fines, enrollment deadlines, program requirements) vary by acquirer, card network, and region — consult your acquirer and current network bulletins.",
      psd2_sca_enforcement: "active",
      // A keyword scan cannot verdict a repo's liability risk, and "more payment
      // keywords → lower risk" is an unfounded inference that contradicts the note
      // above. Emit an action, not a fabricated low/moderate/high grade.
      risk_level: "assess-with-acquirer",
    },
  };

  return {
    path: "commerce-registry.json",
    content: JSON.stringify(registry, null, 2),
    content_type: "application/json",
    program: "agentic-purchasing",
    description: "Agent commerce registry — repo commerce signals, heuristic AP2 readiness assessment, network tokenization profile, and AXIS catalog",
  };
}
