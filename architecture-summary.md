# AXIS Toolbox — Architecture Summary

## System Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        YAML GOVERNANCE LAYER                            │
│  begin.yaml → continuation.yaml → axis_all_tools.yaml (canonical)      │
│  snapshot_protocol │ automated_remedial_action │ hygiene_and_memory     │
│  memory_generator  │ capability_inventory      │ human_user_audit       │
│  rules_to_compile_snapshot │ static_analysis_phase │ render.yaml        │
└─────────────────────────────────┬────────────────────────────────────────┘
                                  │ governs
          ┌───────────────────────┼──────────────────────┐
          ▼                       ▼                      ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐
│   apps/web       │  │   apps/api       │  │   apps/cli           │
│   React 19       │  │   Zero-dep HTTP  │  │   axis analyze <dir> │
│   Vite 6         │→ │   75+ endpoints  │←─│   axis github <url>  │
│   Dark theme     │  │   Port 4000      │  │                      │
│   Port 5173      │  │   SQLite bind    │  │                      │
└──────────────────┘  └────────┬─────────┘  └──────────────────────┘
                               │
          ┌────────────────────┼──────────────────────┐
          ▼                    ▼                       ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐
│  packages/       │  │  packages/       │  │  packages/           │
│  snapshots       │  │  repo-parser     │  │  context-engine      │
│  ─────────       │  │  ──────────      │  │  ──────────────      │
│  SQLite store    │  │  60+ languages   │  │  context-map.json    │
│  5 tables        │  │  10+ frameworks  │  │  repo-profile.yaml   │
│  WAL mode        │  │  Import resolver │  │  Route extraction    │
│  Billing state   │  │  Go module parse │  │  Arch analysis       │
└──────────────────┘  └──────────────────┘  └──────────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │  packages/           │
                    │  generator-core      │
                    │  ──────────────      │
                    │  81 generators       │
                    │  17 program modules  │
                    │  Template engine     │
                    │  Deterministic output│
                    └──────────────────────┘
                               │
                               ▼
              ┌────────────────────────────────────┐
              │         17 AXIS PROGRAMS           │
              │  Search │ Skills │ Debug            │
              │  Frontend │ SEO │ Optimization      │
              │  Theme │ Brand │ Superpowers        │
              │  Marketing │ Notebook │ Obsidian    │
              │  MCP │ Artifacts │ Remotion         │
              │  Canvas │ Algorithmic               │
              │  ──────────────────                 │
              │  81 generators → structured outputs │
              └────────────────────────────────────┘
```

## Core Invariants

| # | Invariant | Enforcement |
|---|-----------|-------------|
| 1 | Canonical coherence > speed | begin.yaml session gate (8 conditions) |
| 2 | One vertical at a time | begin.yaml work_style: monolithic_vertical_saturation |
| 3 | Evidence required for promotion | continuation.yaml execution_queue entries need commit hash |
| 4 | Snapshot is single source | snapshot_protocol.yaml consumption_contract |
| 5 | continuation.yaml is ground truth | begin.yaml required_read_order |
| 6 | Single highest-ROI per cycle | automated_remedial_action.yaml execution loop |
| 7 | Same input → byte-identical output | 6 determinism tests in vitest |
| 8 | Per-program billing | axis_all_tools.yaml billing model |
| 9 | MEMORY.yaml is constitutional | memory_generator.yaml use_contract |
| 10 | Free gives diagnosis, paid gives execution | axis_all_tools.yaml freemium_policy |

## Execution Pipeline

| Step | Action | Component | Output |
|------|--------|-----------|--------|
| 1 | User uploads repo | apps/web or apps/cli | Raw files |
| 2 | API receives upload | apps/api POST /v1/snapshots | snapshot_record |
| 3 | Ingest & extract | packages/snapshots | raw_file_tree |
| 4 | Parse languages/frameworks | packages/repo-parser | parsed_repo_profile |
| 5 | Build context graph | packages/context-engine | context-map.json + repo-profile.yaml |
| 6 | Store snapshot | packages/snapshots (SQLite) | Persisted snapshot |
| 7 | Fire 81 generators | packages/generator-core | 81 structured outputs |
| 8 | Serve results | apps/api + apps/web | Dashboard + ZIP download |

## Program Tier Map

| Tier | Programs | Generators | Revenue Model |
|------|----------|------------|---------------|
| Free | Search, Skills, Debug | 13 | Acquisition engine |
| Pro | 14 paid programs | 67 | Per-program subscription |
| Bundle | All 17 | 81 | Optional suite pricing |

## Technology Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Runtime | Node.js 20+ | LTS, wide ecosystem |
| Language | TypeScript 5.7 strict | Type safety, refactoring confidence |
| HTTP | Custom zero-dep router | No Express/Fastify — supply chain control |
| Database | SQLite (better-sqlite3, WAL) | Single-file persistence, zero infrastructure |
| Frontend | React 19 + Vite 6 | Modern SPA, fast HMR |
| CSS | Vanilla CSS (dark theme) | No Tailwind — direct control |
| Testing | Vitest 4.1 | Fast, TypeScript-native, coverage |
| Build | pnpm workspaces | Monorepo, strict hoisting |
| CI | GitHub Actions | Node 20/22 matrix, coverage, Docker |
| API Deploy | Render (Docker) | Simple, persistent volume |
| Web Deploy | Cloudflare Pages | Static hosting, edge CDN |

## YAML Governance Cross-Reference

```
begin.yaml ──reads──→ continuation.yaml ──references──→ axis_all_tools.yaml
     │                       │                               │
     │ session gate          │ state ledger                  │ program specs
     │                       │                               │
     ▼                       ▼                               ▼
automated_remedial_action    execution_queue              generator-core
     │                       │                               │
     │ self-audit loop       │ tracks commits                │ 81 generators
     │                       │                               │
     ▼                       ▼                               ▼
hygiene_and_memory ←── memory_generator ←── capability_inventory
     │                       │                               │
     │ behavior routing      │ MEMORY.yaml standard          │ grade tracking
     │                       │                               │
     └───────────────────────┴───────────────────────────────┘
                             │
              snapshot_protocol.yaml + rules_to_compile_snapshot.yaml
                             │
                    (intake + forensic snapshot)
```
