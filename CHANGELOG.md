# Changelog

All notable changes to the Axis Toolbox project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2025-07-21

### Added
- **GitHub Token Management** — Encrypted per-account token storage (AES-256-GCM), CRUD endpoints (`POST/GET/DELETE /v1/account/github-token`), auto-retrieval during `github/analyze`, validation/invalidation tracking.
- **Billing Audit Trail** — `tier_changes` table, `logTierChange()` with proration calculation, `GET /v1/billing/history`, `GET /v1/billing/proration` preview endpoint.
- **DB Migration v8** — `github_tokens` table (encrypted storage, scopes, validity, usage timestamps) + `tier_changes` table (from/to tier, reason, proration, metadata).
- **Test Coverage Analysis** — @vitest/coverage-v8, 43 gap-targeted tests bringing coverage to 91.5% statements, 92.2% lines. version-store, billing-store, tier-audit, github-token-store all at 97%+.
- **Agentic Purchasing Program** — 18th program with 5 generators: agent-purchasing-playbook.md, product-schema.json, checkout-flow.md, negotiation-rules.md, commerce-registry.json. AP2/UCP/Visa IC compliance, SCA thresholds, network tokenization, commerce registry with graduated readiness scoring. 86 total generators.
- **Referral System** — 3 SQLite tables, 12 functions, chargeWithDiscounts() at all 7 billing sites.
- **HEAD Conformance** — Router HEAD→GET aliasing for all routes.
- **Performance Benchmarks** — 2 vitest bench suites (parser pipeline + storage operations) covering parseRepo, FTS5 search/index, snapshot creation, webhook HMAC, generator storage. All critical paths <100ms for 200-file repos.
- **CI Pipeline Hardening** — Coverage reporting (vitest/coverage-v8, 92%+ line coverage), dependency audit (`pnpm audit`), Docker build validation job with health check verification.
- **Database Maintenance** — `walCheckpoint`, `vacuum`, `integrityCheck`, `getDbStats`, `purgeStaleData`, `runMaintenance` utilities. `GET /v1/db/stats` and `POST /v1/db/maintenance` API endpoints.
- **Health Probes** — `GET /v1/health/live` (liveness), `GET /v1/health/ready` (readiness with DB connectivity check).
- **Prometheus Metrics** — `GET /v1/metrics` with uptime, request/error counters, HTTP status buckets, memory usage, and DB table row counts.
- **DB Migration Framework** — `schema_migrations` table, versioned SQL migrations, `runMigrations`/`getSchemaVersion` functions.
- **Persistent Rate Limiter** — SQLite-backed sliding window with in-memory hot path, `bindRateLimiterDb`/`flushToDb`/`unbindRateLimiterDb`.
- **File Content Search API** — `POST /v1/search/index`, `POST /v1/search/query`, `GET /v1/search/:id/stats` with ranked LIKE matching.
- **OpenAPI 3.1 Specification** — `GET /v1/docs` serving complete spec for all 102 endpoints.
- **Static Analysis** — Go ecosystem (go.mod, Chi/Gin/Echo/Fiber), SQL schema extraction, domain model extraction (Go/TS/Python), multi-signal project type scorer, cross-boundary separation scoring.
- **Determinism Proof** — Pipeline produces byte-identical output on consecutive runs (6 determinism tests).

### Fixed
- Pre-existing `@types/better-sqlite3` missing from `apps/api` dev dependencies.
- Version inconsistency across packages (harmonized to 0.4.0).

### Changed
- CI workflow now includes coverage reporting, dependency audit, and Docker build validation stages.
- `vitest.config.ts` updated with v8 coverage provider and threshold configuration.
- `.gitignore` updated to exclude `coverage/` directory.

## [0.3.0] - 2025-07-20

### Added
- **Handler Factory** — `PROGRAM_OUTPUTS` map + `makeProgramHandler` factory replaces 15 copy-paste handlers (~600 LOC removed).
- **ZIP Export Engine** — Zero-dep ZIP builder (`node:zlib`, custom CRC32), `GET /v1/projects/:id/export?program=X`.
- **Web UI** — Hash-based SPA routing (upload/dashboard/plans/account), nav bar, pricing page, account dashboard, program launcher (17 cards), Toast notifications, Command Palette (Ctrl+K), StatusBar with health polling.
- **CLI Auth** — `axis auth login/status/logout`, `~/.axis/config.json` persistence with AES-256-GCM encryption.
- **Freemium SaaS Billing** — API keys (SHA-256 hashed), 3-tier quotas (free/paid/suite), per-program metering, 8 billing endpoints.
- **Marketing Funnel** — 11-stage funnel tracking, plan catalog, enterprise seats, contextual upgrade prompts, aggregate analytics, 9 funnel handlers.
- **Security Hardening** — 7 OWASP headers, IP rate limiter (60/120 req/min), path traversal guard, abort handler, email validation, ZIP sanitization.
- **Request Logging** — Structured JSON-line logger, UUID request IDs (X-Request-Id), 22 error codes, request timing.
- **Body Schema Validation** — `typeof`/`Array.isArray` at all POST boundaries.
- **Graceful Shutdown** — Connection tracking, drain with timeout, SIGTERM/SIGINT handlers, health 503 during shutdown.
- **Environment Validation** — `validateEnv`/`requireValidEnv` with type checking, defaults, error collection.
- **Dockerfile** — Multi-stage build (deps→builder→runner), non-root user, HEALTHCHECK.
- **docker-compose.yml** — Production + dev profiles with persistent volume.

## [0.2.0] - 2025-07-19

### Added
- **17 Programs** — All 17 program generators complete (81 generators total across search, debug, skills, frontend, SEO, optimization, theme, brand, superpowers, marketing, notebook, obsidian, MCP, artifacts, remotion, canvas, algorithmic). 18th program (Agentic Purchasing) added in v0.4.0.
- **19 Depth Generators** — Second layer of richer outputs for all programs.
- **CLI** — `apps/cli` with scanner, runner, writer. `axis analyze .` and `axis github <url>`.
- **GitHub URL Intake** — Tarball fetch + custom POSIX tar parser + gunzip.
- **Web GitHub Mode** — Mode toggle (Upload Files / GitHub URL) on UploadPage.
- **Shared GitHub Module** — `packages/snapshots/src/github.ts` shared between API and CLI.

## [0.1.0] - 2025-07-18

### Added
- Initial project structure with 7 packages in pnpm monorepo.
- `packages/snapshots` — Intake, storage, lifecycle.
- `packages/repo-parser` — 60+ language detection, framework detection, import graph.
- `packages/context-engine` — Context-map + repo-profile generation.
- `packages/generator-core` — Generator framework with per-program output generation.
- `apps/api` — HTTP server with custom zero-dep router.
- `apps/web` — React SPA with Vite.
- Core programs: search, debug, skills, frontend with initial generators.
