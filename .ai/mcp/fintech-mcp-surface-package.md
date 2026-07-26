# Fintech MCP Surface Package — axis-iliad

Generated: 1970-01-01T00:00:00.000Z

## Objective

This package defines the initial MCP surface for an agent that does more than audit integrations: it hardens malformed or partially finished fintech repositories into regulator-aware, API-callable software for institutional deployment.

## Why This Repo Qualifies

- Routes detected: 174
- Domain models detected: 278
- SQL tables detected: 0
- Trust Fabric detected: yes
- Fintech dependency hints: none directly detected

## Target Package Structure

```text
mcp/
  server/
    index.ts
    transport/http.ts
    auth/bearer.ts
    tools/harden-partial-repo.ts
    tools/generate-regulatory-controls.ts
    tools/derive-domain-schema.ts
    tools/build-api-surface.ts
    tools/assemble-evidence-pack.ts
    resources/compliance-controls.ts
    resources/domain-models.ts
    resources/ledger-invariants.ts
    prompts/repair-fintech-repo.ts
    prompts/ship-bank-grade-api.ts
  contracts/
    tool-schemas.ts
    control-matrix.ts
    evidence-package.ts
```

## Core Tool Contracts

| Tool | Purpose | Output |
|------|---------|--------|
| `harden_partial_repo` | Normalize malformed project structure, fill missing layers, and reconcile partial implementations | patch plan + generated file set |
| `derive_domain_schema` | Infer payment, ledger, mandate, dispute, and evidence entities from routes, models, and docs | typed domain schema |
| `generate_regulatory_controls` | Create control matrix for KYC, AML, sanctions, PCI, auditability, and data retention | control bundle |
| `build_api_surface` | Produce institution-facing API endpoints, handlers, validators, and contracts | callable API surface |
| `assemble_evidence_pack` | Generate dispute/compliance evidence package definitions and audit output | evidence package manifest |
| `validate_ledger_invariants` | Check debit/credit balance, settlement status, and event lineage rules | invariant report |

## Compliance-Aware Resources

This section defines the compliance-aware runtime contracts required for regulator-facing fintech operations.
- `fintech://controls/matrix` — control definitions for onboarding, transaction monitoring, disputes, and evidence retention.
- `fintech://schema/domain` — canonical domain schema for ledger accounts, transactions, mandates, settlements, and cases.
- `fintech://audit/trail` — event lineage and immutable audit requirements.
- `fintech://evidence/packages` — evidence package definitions for disputes, onboarding reviews, and regulator responses.

## Prompt Surface

- `repair_partial_fintech_repo` — map incomplete folders and replace gaps with compliant implementation scaffolding.
- `implement_compliant_payment_api` — generate handlers, validators, and audit hooks for institution-facing payment endpoints.
- `upgrade_third_party_connector` — wrap existing fintech vendors in bank-grade internal contracts rather than treating them as the system of record.

## Compliance Domains To Encode In The Server

1. Identity and onboarding controls: KYC, KYB, sanctions, beneficial ownership, missing-document recovery.
2. Payment execution controls: auth, capture, returns, settlement states, webhook authenticity, idempotency.
3. Ledger controls: double-entry integrity, reversal lineage, suspense handling, balance snapshots, reconciliation evidence.
4. Mandate controls: AP2/PSD2-style mandate lifecycle, exemptions, recurring fixed payment provenance.
5. Audit and evidence controls: immutable audit logs, case timelines, dispute artifacts, regulator-ready evidence packaging.

## Server Skeleton

```ts
export function registerFintechTools(server: McpServer) {
  server.tool("harden_partial_repo", hardenPartialRepoSchema, hardenPartialRepo);
  server.tool("derive_domain_schema", deriveDomainSchemaSchema, deriveDomainSchema);
  server.tool("generate_regulatory_controls", controlSchema, generateRegulatoryControls);
  server.tool("build_api_surface", apiSurfaceSchema, buildApiSurface);
  server.tool("assemble_evidence_pack", evidenceSchema, assembleEvidencePack);
  server.resource("fintech://schema/domain", readFintechDomainSchema);
  server.resource("fintech://controls/matrix", readControlMatrix);
}
```

## Buildout Phases

1. Detect missing fintech layers and generate internal contracts before touching provider adapters.
2. Establish domain schema and audit trail model as the source of truth.
3. Generate compliant API endpoints and validation logic for institution-facing usage.
4. Attach dispute/evidence generation, mandate controls, and reconciliation invariants.
5. Only then map third-party fintech vendors behind internal abstractions.

## Fintech Source Signals

### `docs/payment-gates.md`

```markdown
# Payment Gates — x402/MPP Ordered Chain (x402 onboarding program, Phase 3)

Single source of truth for how a metered MCP tool call either gets collected
in-band (real cash, on the same `tools/call` an agent already lives on) or
falls back to plan-credit metering. Read this before touching any of
`mcp-server.ts`'s `settleMcpCallInband`, `mcp-runtime.ts`, `mcp-tool-impls.ts`'s
`decideInbandGate`, or `cashier.ts`'s `settleOverageCash` — the gate order
below IS the contract those files implement; if you change one, update this.

## The ordered gate chain (real money — a normal metered tool)

Every `POST /mcp` carrying a `tools/call` passes through `settleMcpCallInband`
(`mcp-server.ts`) BEFORE `dispatch` runs. Each step below can short-circuit to
"fall through to dispatch's normal plan-credit metering" — a 402 is only ever
written to `res` by step 6 below, never earlier.

1. **`AXIS_MCP_INBAND_SETTLEMENT` flag** (`inbandSettlementEnabled()`,
   `mcp-runtime.ts`). Off (code default, unset/anything but `"true"`/`"1"`) →
   the in-band gate is a no-op for every call; dispatch metering
   (authorize/capture against plan credits, 402 via
... (111 more lines)
```

### `apps/api/H1_INBAND_SETTLEMENT.md`

```markdown
# H1 — In-band settlement on the MCP surface

**What it does:** turns the MCP `402 Payment Required` an agent hits at a paid tool into
a *completed purchase* — collected in-band, on the JSON-RPC POST the agent already uses.
Before H1 the MCP surface could **meter and reject** but not **collect** (the only cash
path, `chargeMpp`, was wired to the REST/human surface). H1 closes that last mile.

**Flag:** `AXIS_MCP_INBAND_SETTLEMENT` — **code default OFF** (`inbandSettlementEnabled()`
in `mcp-runtime.ts` returns `false` for an unset/any-other value). Off ⇒ the MCP surface
still returns the 402 negotiation error exactly as before H1. **Live production state is
a separate question from the code default** — `render.yaml` (Blueprint-managed,
autoSync) has pinned this flag to `"true"` since 2026-07-06, so the deployed prod
service has it ON; confirm current live state via Render's own API before treating
either this doc's "default OFF" or that pin as current truth.

## The seam

The cash tail of the REST cashier (`chargeWithDiscounts`) was extracted into a single
shared function so both surfaces collect through the same rail:

... (102 more lines)
```

### `packaging/trust-fabric/attestation.json`

```json
{
  "schema_version": "1.0",
  "certlib_profile": "certlib-offline-v1",
  "generated_at": "1970-01-01T00:00:00.000Z",
  "snapshot_id": "cli-dc287bfb6acf261b63d4f30ec497f13b",
  "project_id": "cli-a45515042b8b8ca8795f2aba22574e2c",
  "product_name": "axis-iliad",
  "package_root": "./",
  "attests": "Build & configuration artifacts that ship byte-for-byte (Dockerfile, docker-compose, CI/release workflows, LICENSE, Makefile, package manifests). Markdown docs are excluded — the autonomy loop appends a footer to each after generation, so their shipped bytes are not knowable here.",
  "merkle_root": "530402debdbd410d0374e13b32d802e113700cd69ea7bd2b110d1397c203fc18",
  "signature": {
    "algorithm": "sha256-pseudo-signature",
    "signer": "axis-closer",
    "value": "716d7e6b68d828093ed5c36106efa79ffea30265c44009b1c52bc7d55b758618"
  },
  "leaf_count": 9,
  "leaves": [
    {
      "path": "packaging/LICENSE",
      "digest": "7db02c9214aeae701d5d9105e2a05e24aa5796568ef10aca87cee3793158d09e"
... (35 more lines)
```

### `packaging/trust-fabric/merkle-proof.json`

```json
{
  "schema_version": "1.0",
  "merkle_root": "530402debdbd410d0374e13b32d802e113700cd69ea7bd2b110d1397c203fc18",
  "levels": [
    [
      "7db02c9214aeae701d5d9105e2a05e24aa5796568ef10aca87cee3793158d09e",
      "b998a21452923f86e5357c0800b20e1b5f3148fdc40935bd918372e9f8e866c0",
      "a5ab2b574fbbcc845917547f5fcfc58702e285e72cb23178d338cb45910b6c7c",
      "c12f8e291228b123ae41880bd4c282a308287022de7dd560736cdf8c882329e2",
      "af7b9c2a1435fe757537839b0c2d3446e0545dead267b9b7a4695a06dfe71dad",
      "e5cbee85c965b5717bbea83a195e9cb92c59d11566e087024a8f6b4645ffb4c0",
      "c2df0ed39e2f94c2ab6d932c413153fc5b99a8a584f7d9355a349004eeb352fd",
      "328ea322352f1e320d238afb577140d54e895efc3969aee722bfac28e12ec9a6",
      "a0cbce1caeb7b7c589b3d2c64dd72d90a2acc91173bde9784771962d04752cb3"
    ],
    [
      "9f4f7d6599115cd6d987c360d8070bd011a6f8d075ce872a70af3101a1590137",
      "4cd8a4c4daa1736e7a2644964ed4bfd3bf9b70aa62551e7f52b2823423368fd1",
      "ae3f1874665f37517d61158aac82c12e3bed2fbb2c47309c518ae1b98a925839",
      "0da395d912e2b6b8a666aaccc110ccc2582b58f278a30b321a80b8726508722d",
... (70 more lines)
```

### `apps/api/src/cashier-settled-payment.test.ts`

```typescript
/**
 * cashier-settled-payment.test.ts — WO-19 (revenue-mrr-tracker).
 *
 * Proves the wiring the acceptance criteria calls out directly: a `settleOverageCash`
 * call that resolves to `chargeMpp` returning `{status: 200}` persists a
 * `payment_receipts` row via `recordSettledPayment`, decoded from the real mppx
 * `Payment-Receipt` header format (not a stand-in). Everything else (mppx itself,
 * `@axis/snapshots`) is mocked/offline — no live Stripe/Tempo, no DB.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Receipt } from "mppx";

vi.mock("@axis/snapshots", () => ({
  consumeFreeCall: vi.fn(async () => false),
  recordPaidCall: vi.fn(async () => undefined),
  recordSettledPayment: vi.fn(async () => undefined),
  recordPaymentFunnelEvent: vi.fn(async () => undefined),
}));

... (288 more lines)
```

### `apps/api/src/live-settlement.e2e.test.ts`

```typescript
/**
 * live-settlement.e2e.test.ts — gated end-to-end proof of the settlement leg
 * (WO-03 live-collection-fix).
 *
 * Proves, against real Stripe TEST mode, the loop the InstallPage/ForAgents
 * claim describes: "HTTP 402 -> MPP challenge -> Stripe payment -> retry.
 * No human needed." Concretely:
 *
 *   1. An over-quota request to a metered route returns 402 with a
 *      non-empty challengeId (RFC 9457 problem+json body).
 *   2. A follow-up request carrying the payment credential built from that
 *      challenge + a Stripe Shared Payment Token (SPT) returns 200 with a
 *      non-empty `Payment-Receipt` response header.
 *
 * Wire-protocol note ("X-Payment" naming): this repo's own docs
 * (H1_INBAND_SETTLEMENT.md) and the work order refer to the retry
 * credential colloquially as "X-Payment". The actual mppx wire protocol
 * carries it on the standard `Authorization: Payment <base64>` header
 * (see mppx's `Credential.serialize` / `Transport.http().setCredential`) --
 * there is no header literally named `X-Payment`. This test exercises the
... (117 more lines)
```


---

## ⟳ Continue the loop

- **You are here:** `mcp/fintech-mcp-surface-package.md` — agent step 38 of 71.
- **Next:** `artifact-spec.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
