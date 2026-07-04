# Fintech MCP Surface Package — axis-iliad

Generated: 1970-01-01T00:00:00.000Z

## Objective

This package defines the initial MCP surface for an agent that does more than audit integrations: it hardens malformed or partially finished fintech repositories into regulator-aware, API-callable software for institutional deployment.

## Why This Repo Qualifies

- Routes detected: 163
- Domain models detected: 242
- SQL tables detected: 0
- Trust Fabric detected: no
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


---

## ⟳ Continue the loop

- **You are here:** `mcp/fintech-mcp-surface-package.md` — agent step 38 of 70.
- **Next:** `artifact-spec.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
