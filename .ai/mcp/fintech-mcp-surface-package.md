# Fintech MCP Surface Package — axis-iliad

Generated: 2026-05-22T17:35:44.798Z

## Objective

This package defines the initial MCP surface for an agent that does more than audit integrations: it hardens malformed or partially finished fintech repositories into regulator-aware, API-callable software for institutional deployment.

## Why This Repo Qualifies

- Routes detected: 497
- Domain models detected: 243
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

### `packaging/trust-fabric/attestation.json`

```json
{
  "schema_version": "1.0",
  "certlib_profile": "certlib-offline-v1",
  "generated_at": "2026-05-14T02:05:27.493Z",
  "snapshot_id": "56f35484-90df-4fed-bd85-90b7545be9e3",
  "project_id": "86360ec8-d5a3-4358-a674-b16fa514c555",
  "product_name": "axis-iliad",
  "package_root": "./",
  "merkle_root": "844e749796c4e71db7dfad6f53c2b9b52713f536bb4bef38db413b04aa10a7ea",
  "signature": {
    "algorithm": "sha256-pseudo-signature",
    "signer": "axis-closer",
    "value": "2d2c1bdae3c3a416508e77a0b47719a349e9d8f9a0b5bf3e41a992a76b6fff02"
  },
  "leaf_count": 16,
  "leaves": [
    {
      "path": "packaging/README.md",
      "digest": "8553a09bf613ed6e33797a70306cd4dd7071f461810233143aa14f86b8c55b33"
    },
... (62 more lines)
```

### `packaging/trust-fabric/merkle-proof.json`

```json
{
  "schema_version": "1.0",
  "merkle_root": "844e749796c4e71db7dfad6f53c2b9b52713f536bb4bef38db413b04aa10a7ea",
  "levels": [
    [
      "8553a09bf613ed6e33797a70306cd4dd7071f461810233143aa14f86b8c55b33",
      "29700c9588423ac52334b22f0e2ee1c8e4bc209c707fd5942a962dd21dcaf5aa",
      "70b546d385fbc884fc3cbb175b4d93a337e009aee45c0172e4cc5216e7cdd41c",
      "380c90bc582d62a9d036197c03e74998c3e044343b9e393f8432ab4ea20925d9",
      "6dd546c11faa8c18a736fd5e393e53e2912d374580d96d7222864d163fe36326",
      "d84e9611f8c846d1795759a9a3ae4085fcff64ae41649e13710b95d728102e1a",
      "c7dfedabee4365a402d0f80a8b1f8fb02123c941f0f678da035ef3311fada4bc",
      "85107397389e420a0bdd1ba206dd23b8bfc89be07241126c815d37b75ad87e17",
      "e6439f9926b7ceae54a6a0296be089d08559f3299d9e409f3663b893d5e60cd2",
      "c57503dfa79212216132b78f4fb0cc53d5350116322988fd0cb50f22b629172f",
      "657e8ac7a3bd31e2f9df62afde809ca51e8cb11dbf6bccdc8ec24a26107a74ee",
      "010d316b255c019086fe969bfc80773eeaa0e7f4a4e7c3f730296f50767e6a5f",
      "bc2c1a1a2b6f8d237fdef31db7ce508886a6d7d626d6eece95d1b3fe45645ba8",
      "7564678c350bad4e43369a892c78e0616ae56ba7d93ebb377618eca556b58cbd",
      "40a01b06b6389c21f04dd3831d7586483778069aff3ec10a8b55b825b2150aec",
... (114 more lines)
```

### `payment-processing-output/ab-test-plan.md`

```markdown
# A/B Test Plan — avery-pay-platform

Generated: 2026-04-05T07:37:21.804Z

## Test Framework Setup

**Recommended**: Client-side feature flag with cookie persistence
- Set variant on first visit, persist in cookie
- Read variant cookie before rendering

## Priority Tests

### Test 1: Landing Page Hero

| Parameter | Value |
|-----------|-------|
| Target page | / |
| Hypothesis | A benefit-driven headline increases signup rate |
| Primary metric | Signup conversion rate |
| Secondary metric | Time on page, scroll depth |
... (57 more lines)
```

### `payment-processing-output/AGENTS.md`

```markdown
# AGENTS.md — avery-pay-platform

## Project Context

This is a **static site** built with **Go**.
PAI'D is **two systems in one repo**:

### Stack

- Svelte

### Architecture

- containerized

### Conventions

- TypeScript strict mode

### Key Directories
... (42 more lines)
```

### `payment-processing-output/architecture-summary.md`

```markdown
# Architecture Summary: avery-pay-platform

> PAI'D is **two systems in one repo**:

## Overview

- **Primary Language:** Go
- **Project Type:** static site
- **Files:** 1829 (417166 LOC)
- **Directories:** 328

## Frameworks & Libraries

- **Svelte**  (30% confidence)

## Architecture Patterns

- `containerized`
- **Separation Score:** 0

... (70 more lines)
```

### `payment-processing-output/artifact-spec.md`

```markdown
# Artifact Specification — avery-pay-platform

Generated: 2026-04-05T07:37:21.795Z

## Project Overview

| Field | Value |
|-------|-------|
| Name | avery-pay-platform |
| Type | static_site |
| Language | Go |
| Frameworks | Svelte |

## Language Distribution

- **Go**: 73.4% ███████████████ (1054 files, 303678 LOC)
- **YAML**: 9.6% ██ (129 files, 39835 LOC)
- **Svelte**: 6.6% █ (196 files, 27505 LOC)
- **TypeScript**: 4.2% █ (167 files, 17577 LOC)
- **Markdown**: 3.4% █ (66 files, 14091 LOC)
... (53 more lines)
```
