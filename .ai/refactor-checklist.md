# Refactor Checklist — axis-toolbox

> Systematic refactoring guide based on codebase analysis

## Project Overview

axis-toolbox is a monorepo built with TypeScript using React. It contains 432 files across 20 top-level directories. It defines 131 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Risk Assessment

| Risk Level | Files | Action |
|-----------|-------|--------|
| High (>5.0) | 0 | Refactor with full test coverage first |
| Medium (2-5) | 0 | Refactor when touching for features |
| Low (<2) | 6 | Refactor opportunistically |

## Pre-Refactor Checklist

Before starting any refactor:

- [ ] Existing tests pass (run full suite)
- [ ] The refactor target has test coverage (add tests if not)
- [ ] The goal is clear: what improves and what stays the same
- [ ] A branch has been created for the refactor
- [ ] No other in-progress work touches the same files

## Refactoring Patterns

### Extract Function
- **When:** A block of code inside a function does one distinct thing
- **How:** Move the block to a named function, pass needed values as parameters
- **Test:** Existing tests still pass + new unit test for extracted function

### Extract Module
- **When:** A file has multiple unrelated responsibilities
- **How:** Move related functions/types to a new file, update imports
- **Test:** All existing imports resolve, no circular dependencies introduced

### Simplify Conditionals
- **When:** Nested if/else chains or complex boolean expressions
- **How:** Extract conditions to named booleans, use early returns, use lookup tables
- **Test:** Cover all branches before and after

### Replace Magic Values
- **When:** Hardcoded strings, numbers, or config values in business logic
- **How:** Extract to named constants or config
- **Test:** Behavior unchanged, constants are importable

## Domain Model Complexity

Models with a high field count are strong candidates for decomposition or value-object extraction:

| Model | Kind | Fields | Source |
|-------|------|--------|--------|
| `ProgramDoc` | interface | 13 ⚠️ large | `apps/web/src/pages/DocsPage.tsx` |
| `ParseResult` | interface | 13 ⚠️ large | `packages/repo-parser/src/types.ts` |
| `RepoProfile` | interface | 12 ⚠️ large | `packages/context-engine/src/types.ts` |
| `StripeSubscription` | interface | 12 ⚠️ large | `packages/snapshots/src/stripe-store.ts` |
| `SubscriptionInfo` | interface | 11 ⚠️ large | `apps/web/src/api.ts` |
| `WebhookDelivery` | interface | 11 ⚠️ large | `packages/snapshots/src/webhook-store.ts` |
| `ContextMap` | interface | 10 ⚠️ large | `packages/context-engine/src/types.ts` |
| `EmailDelivery` | interface | 10 ⚠️ large | `packages/snapshots/src/email-store.ts` |
| `GitHubToken` | interface | 10 ⚠️ large | `packages/snapshots/src/github-token-store.ts` |
| `SnapshotManifest` | interface | 10 ⚠️ large | `packages/snapshots/src/types.ts` |
| *... and 121 more* | | | |

### Decomposition Candidates

- **`ProgramDoc`** (13 fields) — consider extracting related field groups into value objects
- **`ParseResult`** (13 fields) — consider extracting related field groups into value objects
- **`RepoProfile`** (12 fields) — consider extracting related field groups into value objects
- **`StripeSubscription`** (12 fields) — consider extracting related field groups into value objects
- **`SubscriptionInfo`** (11 fields) — consider extracting related field groups into value objects

## Architecture Alignment

Detected patterns to preserve during refactoring:

- monorepo
- containerized

Layer boundaries (do not violate during refactoring):

- **presentation**: apps, frontend

## Post-Refactor Checklist

- [ ] All tests pass
- [ ] No new circular dependencies (check import graph)
- [ ] Build succeeds with no new warnings
- [ ] No dead code left behind (unused imports, unreachable branches)
- [ ] Type coverage maintained or improved
- [ ] Commit message describes what changed and why
