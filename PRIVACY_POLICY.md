# Privacy Policy — Axis Iliad

> **DRAFT — requires review by a qualified attorney before publication. Not legal advice.**
>
> This document is an engineering-drafted baseline grounded in the actual behavior of the
> Axis Iliad codebase as of the draft date. Every claim below maps to a concrete code path
> or deployment configuration. It has NOT been reviewed by counsel and must not be
> published or relied upon until it has been.

**Effective date:** [EFFECTIVE DATE]
**Last updated:** [LAST UPDATED]
**Contact:** [CONTACT EMAIL]

---

## 1. Who We Are

Axis Iliad ("Axis", "we", "us") is a hosted codebase-analysis and artifact-generation
service. The API is served at `https://axis-api-6c7z.onrender.com` and the web dashboard
at `https://axis-iliad.jonathanarvay.com`. The service is also reachable as an MCP
(Model Context Protocol) server at the `/mcp` endpoint.

[LEGAL ENTITY NAME AND REGISTERED ADDRESS — TO BE COMPLETED BY COUNSEL]

## 2. What We Collect and Why

### 2.1 Source code you submit

When you upload files or point Axis at a GitHub repository, the submitted file contents
are stored as a **snapshot** in a SQLite database on a persistent disk attached to our
hosting provider (Render, US — Oregon region). Snapshots exist so that:

- analysis results are reproducible and retrievable (`GET /v1/snapshots/:snapshot_id`),
- generated artifacts can be re-fetched without re-uploading,
- repeat analyses return from cache instead of re-processing.

**Retention:** snapshots are retained until you delete them. You can delete a snapshot at
any time via `DELETE /v1/snapshots/:snapshot_id`, delete a project (and its associated
data) via `DELETE /v1/projects/:project_id`, or use the dashboard. In addition, an
automated maintenance routine periodically purges stale operational data (expired
rate-limit windows, and revoked API keys and seats older than 90 days).

We do not sell, license, or train machine-learning models on your source code.

### 2.2 Code fetched from GitHub on your behalf

If you connect a GitHub repository, Axis fetches repository contents using either GitHub's
public API or a personal-access token you provide. Fetched code is handled identically to
uploaded code (stored as a snapshot, retained until you delete it).

### 2.3 Account information

When you create an account (`POST /v1/accounts`) we store:

- your **name** and **email address**,
- your billing tier and account creation timestamp.

We use your email to operate your account (key recovery, billing notices, transactional
messages). We do not use it for third-party advertising.

### 2.4 API keys

API keys are shown to you **once** at creation. We store only a **SHA-256 hash** of each
key — the raw key is never persisted on our servers. If you lose a key, it cannot be
recovered; you must issue a new one. Revoked keys are purged from the database 90 days
after revocation.

### 2.5 GitHub personal-access tokens

If you store a GitHub personal-access token with Axis (so we can fetch private
repositories on your behalf), the token is stored **encrypted at rest using
AES-256-GCM**. You can list and delete stored tokens at any time
(`GET /v1/account/github-token`, `DELETE /v1/account/github-token/:token_id`).

### 2.6 Payment information

Payments are processed by **Stripe**. Card numbers and other payment-instrument details
are entered directly into Stripe-hosted surfaces and **never touch Axis servers**. We
receive from Stripe only the minimum needed to operate your subscription: customer and
subscription identifiers, plan, billing cycle, and payment-event webhooks (e.g.
`checkout.session.completed`, `invoice.payment_failed`).

### 2.7 Usage and analytics counters

We record per-account usage of the service (which program or tool was run, when, and
billing-relevant counters such as credits consumed and MCP tool-call counts). These
records exist for billing, abuse prevention, rate limiting, and service improvement. We
use **first-party counters only** — we do not embed third-party analytics or advertising
trackers in the API or dashboard.

### 2.8 Logs

Standard service logs (request method/path, status, latency, error details) are written
to our hosting provider's log stream for debugging and security monitoring.

## 3. Cookies and Local Storage

The Axis web dashboard does **not** use third-party advertising cookies.

The dashboard stores the following in your browser's `localStorage`:

- `axis_api_key` — your API key, so you stay signed in,
- `axis_theme` — your light/dark theme preference,
- `axis_last_result` — your most recent analysis result, for fast dashboard reloads.

This data stays in your browser. Clearing your browser storage removes it. Logging out
removes the stored API key.

## 4. Subprocessors

We share data with the following service providers, strictly to operate the service:

| Subprocessor | Purpose | Data involved |
|---|---|---|
| **Render** (US) | Application hosting; persistent disk holding the SQLite database | All service data at rest |
| **Cloudflare** | Web frontend hosting / CDN; object storage (R2) where used | Web traffic; objects you store via the storage tool |
| **GitHub** | OAuth sign-in, repository fetching, webhooks (push / pull-request events for installed apps) | GitHub identity, repository contents you connect |
| **Stripe** | Payment processing and subscription billing | Payment details (held by Stripe, not by us), billing metadata |
| **OpenAI** | Embeddings proxy (`iliad_embeddings` tool) | Text you submit to the embeddings tool is forwarded to OpenAI's API |
| **Resend** | Transactional email delivery | Recipient address and message content of emails you send through the email tool, plus our own account emails |
| **Firecrawl** | Web research proxy (`iliad_web_research`, `iliad_web_research_crawl` tools) | URLs and crawl parameters you submit to those tools |

We do not sell personal information to any party. A current subprocessor list will be
maintained at [SUBPROCESSOR PAGE URL].

## 5. Data Deletion

- **Snapshots / projects:** self-serve, immediate — `DELETE /v1/snapshots/:snapshot_id`,
  `DELETE /v1/projects/:project_id`, or the dashboard.
- **Stored GitHub tokens:** self-serve — `DELETE /v1/account/github-token/:token_id`.
- **Webhooks:** self-serve — `DELETE /v1/account/webhooks/:webhook_id`.
- **Full account deletion:** email [CONTACT EMAIL] from your account email address. We
  will delete your account record, API key hashes, stored tokens, snapshots, and usage
  records within [30] days, except where retention is required for legal, tax, or
  fraud-prevention purposes (e.g., billing records retained per applicable law).

## 6. Your Rights — GDPR (EEA/UK Users)

If you are in the European Economic Area or the United Kingdom, you have the right to:

- **Access** the personal data we hold about you,
- **Rectify** inaccurate personal data,
- **Erase** your personal data ("right to be forgotten"),
- **Restrict or object to** processing,
- **Data portability** (receive your data in a machine-readable format),
- **Withdraw consent** at any time where processing is based on consent,
- **Lodge a complaint** with your local supervisory authority.

Our lawful bases for processing are: performance of a contract (operating the service
you signed up for), legitimate interests (security, abuse prevention, service
improvement), and legal obligation (billing/tax records).

To exercise any of these rights, contact [CONTACT EMAIL].

**International transfers:** the service is hosted in the United States (Render, Oregon
region). If you use the service from the EEA/UK, your data is transferred to the US.
[TRANSFER MECHANISM — e.g., Standard Contractual Clauses — TO BE CONFIRMED BY COUNSEL.]

## 7. Your Rights — CCPA/CPRA (California Users)

If you are a California resident, you have the right to:

- **Know** what personal information we collect and how it is used (this policy),
- **Access** the specific pieces of personal information we hold about you,
- **Delete** your personal information (see Section 5),
- **Correct** inaccurate personal information,
- **Non-discrimination** for exercising your rights.

We do **not** sell personal information and do **not** share personal information for
cross-context behavioral advertising, so no "Do Not Sell or Share" opt-out is required.

To exercise these rights, contact [CONTACT EMAIL].

## 8. Security

Measures in effect in the current system:

- API keys stored only as SHA-256 hashes,
- GitHub personal-access tokens encrypted at rest with AES-256-GCM,
- Payment-card data handled exclusively by Stripe (never stored or transmitted through
  Axis servers),
- Webhook payloads verified with HMAC-SHA-256 signatures (GitHub and Stripe),
- TLS in transit for all API and dashboard traffic,
- Periodic automated database maintenance and purge of stale credentials.

No system is perfectly secure. If we become aware of a breach affecting your personal
data, we will notify you as required by applicable law.

## 9. Children

The service is not directed at children under 16, and we do not knowingly collect
personal information from them.

## 10. Changes to This Policy

We will post updates to this page and revise the "Last updated" date. Material changes
will be announced by email to account holders.

## 11. Contact

Questions, rights requests, complaints: [CONTACT EMAIL]

[POSTAL ADDRESS — TO BE COMPLETED BY COUNSEL]
