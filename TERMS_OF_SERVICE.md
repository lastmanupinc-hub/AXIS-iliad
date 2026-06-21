# Terms of Service — Axis Iliad

> **DRAFT — requires review by a qualified attorney before publication. Not legal advice.**
>
> This document is an engineering-drafted baseline grounded in the actual behavior of the
> Axis Iliad service as of the draft date. It has NOT been reviewed by counsel and must
> not be published or relied upon until it has been.

**Effective date:** [EFFECTIVE DATE]
**Last updated:** [LAST UPDATED]
**Contact:** [CONTACT EMAIL]

---

## 1. The Service

Axis Iliad ("Axis", "we", "us") is a hosted **codebase analysis and artifact generation**
service. You submit source code — by direct upload or by connecting a GitHub repository —
and Axis analyzes it and generates structured artifacts (for example: `AGENTS.md`,
`CLAUDE.md`, `.cursorrules`, debug playbooks, MCP configurations, design tokens, and
agentic-commerce readiness reports). The service is available via a REST API, a web
dashboard, an MCP (Model Context Protocol) server endpoint, a CLI, and a GitHub App /
GitHub Action integration.

**Pricing.** The service offers:

- a **free tier** with limited monthly usage,
- **per-call pricing** for individual paid tool runs (standard and reduced-price "lite"
  mode; per-tool prices are published in the tool catalog and negotiated via the x402
  payment flow for agent callers),
- **subscription plans** (monthly or annual) with included monthly credit allowances and
  metered overage billed per credit.

Current prices are published on the pricing page and in the API's discovery endpoints.
We may change prices prospectively with notice; changes do not apply retroactively to an
already-paid billing period.

## 2. Accounts and API Keys

You are responsible for safeguarding your API keys and for all activity under them. API
keys are displayed once at creation and stored by us only as cryptographic hashes; we
cannot recover a lost key, only issue a new one. You must provide accurate account
information and keep it current.

## 3. Acceptable Use

You agree not to:

- submit code or content you do not have the right to submit,
- use the service to analyze, generate, or distribute malware or material that violates
  applicable law,
- attempt to bypass billing, rate limits, metering, or authentication,
- probe, scan, or disrupt the service or its infrastructure beyond ordinary API use,
- resell or white-label the service without a separate written agreement,
- use the web-research, email, or other proxied tools to violate third-party terms,
  send spam, or harvest personal data unlawfully.

We may suspend or throttle accounts engaged in abuse, with notice where practicable.

## 4. Your Code and Generated Artifacts (Intellectual Property)

- **Your code stays yours.** You retain all ownership of source code and other content
  you submit. You grant us only the limited license needed to store, process, and analyze
  it for the purpose of providing the service to you, for as long as you keep it stored
  with us.
- **Generated artifacts are yours.** As between you and Axis, you own the artifacts the
  service generates from your code, and you may use them for any purpose. We claim no
  copyright or other proprietary interest in your generated artifacts.
- **The service itself remains ours.** The Axis software, generators, models of analysis,
  templates, and documentation remain our property. Nothing in these terms transfers any
  right in the service to you.

## 5. ⚠️ Compliance Artifacts Are Informational — Not Advice, Not Certification

**THIS SECTION IS IMPORTANT. PLEASE READ IT CAREFULLY.**

Some Axis outputs relate to regulatory, payment-network, or compliance topics — for
example: compliance "grades", purchasing-readiness scores, SCA-exemption decision
matrices, dispute-evidence checklists, AP2/UCP/TAP interoperability notes, and similar
artifacts.

**These outputs are automated, informational signal-scans of your code and
configuration. They are NOT:**

- legal advice,
- compliance advice or a compliance program,
- a certification, attestation, or audit of any kind,
- a guarantee that any payment network (including Visa or Mastercard), regulator,
  acquirer, or counterparty will accept, approve, or treat your system in any
  particular way.

A "grade" or "passing" result means only that an automated scan found certain textual
and structural signals in the materials you submitted. It does not mean your system is
compliant with PSD2, SCA, PCI DSS, card-network rules, GDPR, CCPA, or any other legal or
contractual regime. **You must engage qualified legal, compliance, and security
professionals before relying on any compliance-related output for a real-world decision.**
We disclaim all liability for decisions made in reliance on compliance-related artifacts.

## 6. Disclaimer of Warranties

THE SERVICE AND ALL OUTPUTS ARE PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, ACCURACY, OR UNINTERRUPTED OPERATION.
GENERATED ARTIFACTS ARE PRODUCED BY AUTOMATED ANALYSIS AND MAY CONTAIN ERRORS OR
OMISSIONS; YOU ARE RESPONSIBLE FOR REVIEWING THEM BEFORE USE.

## 7. Limitation of Liability

TO THE MAXIMUM EXTENT PERMITTED BY LAW: (a) NEITHER PARTY IS LIABLE FOR INDIRECT,
INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, REVENUE,
DATA, OR GOODWILL; AND (b) OUR TOTAL AGGREGATE LIABILITY ARISING OUT OF OR RELATING TO
THE SERVICE IS CAPPED AT THE GREATER OF (i) THE AMOUNTS YOU PAID US IN THE TWELVE (12)
MONTHS BEFORE THE EVENT GIVING RISE TO LIABILITY, OR (ii) ONE HUNDRED US DOLLARS
(US $100). THESE LIMITS DO NOT APPLY WHERE PROHIBITED BY LAW, OR TO LIABILITY THAT
CANNOT LAWFULLY BE LIMITED.

## 8. Billing, Renewals, and Refunds

- Subscriptions renew automatically each billing cycle (monthly or annual) until
  cancelled. You can cancel at any time; cancellation takes effect at the end of the
  current billing period.
- Per-call charges and metered overage are billed as incurred.
- Payment processing is handled by Stripe; you agree to Stripe's applicable terms for
  the payment flow.
- **Refunds:** [REFUND POLICY PLACEHOLDER — decide before launch. Options to present to
  counsel: (1) no refunds except where required by law; (2) pro-rated refunds of unused
  full months on annual plans; (3) 14-day money-back on first subscription purchase.
  Per-call charges for completed runs are generally non-refundable since the compute is
  consumed on delivery.]

## 9. Termination

- **By you:** stop using the service and/or delete your account at any time (see the
  Privacy Policy for the deletion path).
- **By us:** we may suspend or terminate accounts for material breach of these terms
  (including non-payment and acceptable-use violations), with notice where practicable,
  or where required by law. We may discontinue the service with [30] days' notice; in
  that case we will refund any prepaid amounts covering the period after discontinuation.
- On termination, your right to use the service ends. You should export generated
  artifacts and delete stored snapshots before account closure; we will delete remaining
  account data per the Privacy Policy.

## 10. Changes to These Terms

We may update these terms prospectively. Material changes will be announced by email or
in-product notice at least [14] days before they take effect. Continued use after the
effective date constitutes acceptance.

## 11. Governing Law and Disputes

[GOVERNING LAW / VENUE / ARBITRATION CLAUSE — TO BE COMPLETED BY COUNSEL.]

## 12. Contact

[CONTACT EMAIL]
[LEGAL ENTITY NAME AND POSTAL ADDRESS — TO BE COMPLETED BY COUNSEL]
