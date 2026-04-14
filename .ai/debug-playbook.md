# AXIS Toolbox — Debug Playbook

## Symptom-to-Root-Cause Decision Trees

### Tree 1: Snapshot Ingestion Fails

```
Snapshot upload returns error
├── HTTP 413 → File exceeds 500MB limit
│   └── Fix: Reduce repo size, use .gitignore filtering
├── HTTP 400 → Invalid input format
│   ├── ZIP corrupt → Re-create archive
│   ├── GitHub URL invalid → Check URL format (must be public or have token)
│   └── Missing required fields → Check POST body matches snapshot_protocol.yaml
├── HTTP 500 → Server-side failure
│   ├── SQLite write error
│   │   ├── Disk full → Check /data volume on Render (1GB limit)
│   │   ├── WAL checkpoint stuck → POST /v1/db/maintenance
│   │   └── Schema mismatch → Check migration state
│   └── Parser crash
│       ├── Unsupported file encoding → Check repo for binary files in source paths
│       └── Circular import resolution → Check repo-parser import walker
└── Timeout → Repo too large for processing window
    └── Fix: Use CLI (axis analyze) for large repos — no HTTP timeout
```

### Tree 2: Generator Produces Empty/Wrong Output

```
Generated file is empty or incorrect
├── File is completely empty
│   ├── Context map missing → Check context-engine ran successfully
│   ├── Generator template error → Check generator-core template engine
│   └── Snapshot not in "ready" status → GET /v1/snapshots/:id, check status
├── File has wrong content
│   ├── Wrong language detected
│   │   ├── Check repo-parser language detection (60+ extensions)
│   │   └── Framework misidentified → Check framework-detector.ts patterns
│   ├── Stale context → Re-run snapshot (context may be from previous version)
│   └── Template variable unresolved → Check generator template for {{variable}} remnants
└── File has partial content
    ├── Generator interrupted → Check API server logs for timeout
    ├── Insufficient repo data → Small repos may not populate all generators
    └── Determinism test fails → Run vitest determinism suite
```

### Tree 3: API Returns Unexpected Error Codes

```
API error (not 2xx)
├── 401 Unauthorized
│   ├── API key missing → Add X-API-Key header
│   ├── API key revoked → Check /v1/account/keys
│   └── Key expired → Create new key
├── 403 Forbidden
│   ├── Tier insufficient → Check account tier vs. program access
│   ├── Quota exceeded → GET /v1/account/quota
│   └── Program not entitled → POST /v1/account/programs to add
├── 404 Not Found
│   ├── Endpoint typo → Check OpenAPI spec at /v1/docs
│   └── Resource deleted → Check snapshot/project still exists
├── 429 Too Many Requests
│   ├── Free tier: 60 req/min → Wait or upgrade
│   └── Pro tier: 120 req/min → Check for runaway automation
└── 500 Internal Server Error
    ├── Check /v1/health/ready → Database or dependency down
    ├── Check server logs → Render dashboard or Docker logs
    └── POST /v1/db/maintenance → Attempt auto-repair
```

### Tree 4: Web Dashboard Not Loading

```
Web SPA fails to load or is broken
├── Blank white page
│   ├── Build failed → Check Cloudflare Pages build logs
│   ├── CORS error → Check CORS_ORIGIN env var matches web domain
│   └── API unreachable → Check Render health endpoint
├── Data not appearing
│   ├── API returning empty → Check snapshot status
│   ├── Auth token expired → Re-authenticate
│   └── Wrong API URL → Check web .env for API base URL
├── UI components broken
│   ├── React hydration error → Check server/client markup mismatch
│   ├── CSS not loading → Check Vite build output
│   └── Command palette (Ctrl+K) not working → Check event listener binding
└── Performance issues
    ├── Large generated files → Lazy-load file viewer
    ├── Too many snapshots → Paginate dashboard
    └── Syntax highlighting slow → Check code viewer library
```

### Tree 5: CLI Not Working

```
axis command fails
├── "command not found"
│   ├── Not installed globally → npm link or npx
│   └── Wrong Node version → Requires Node >= 20
├── "axis analyze" fails
│   ├── Directory doesn't exist → Check path
│   ├── No supported files found → Empty or binary-only repo
│   └── Permission denied → Check file system permissions
├── "axis github" fails
│   ├── GitHub URL unreachable → Check network
│   ├── Private repo without token → Set GITHUB_TOKEN
│   └── Rate limited by GitHub → Wait or use authenticated requests
└── Output wrong/incomplete
    ├── Same as Tree 2 (generator issues)
    └── Different output than web → Check CLI uses same generator-core version
```

### Tree 6: Billing/Account Issues

```
Billing or account problem
├── Can't upgrade tier
│   ├── Payment processing = Grade F → Not yet integrated
│   ├── Account not found → Check account creation endpoint
│   └── Tier already at requested level → GET /v1/account
├── Usage not tracking
│   ├── Metering endpoint not called → Check API middleware
│   ├── SQLite write failed → Check billing table integrity
│   └── Wrong program metered → Check program slug matching
├── Quota shows wrong numbers
│   ├── Cache stale → Force refresh
│   ├── Proration miscalculated → GET /v1/billing/proration
│   └── Multiple accounts → Check account UUID
└── Webhook not firing
    ├── Webhook not created → GET /v1/account/webhooks
    ├── Webhook disabled → POST /v1/account/webhooks/:id/toggle
    ├── Delivery failing → GET /v1/account/webhooks/:id/deliveries
    └── URL unreachable → Check webhook endpoint availability
```

### Tree 7: CI/CD Pipeline Failure

```
GitHub Actions or deployment fails
├── CI tests fail
│   ├── New test failure → Check vitest output for specific assertion
│   ├── Coverage threshold drop → Check coverage report vs 91.5% baseline
│   ├── Node version mismatch → CI runs Node 20 + 22 matrix
│   └── pnpm install fails → Check lockfile consistency
├── Docker build fails
│   ├── Multi-stage build error → Check Dockerfile stage names
│   ├── Node modules not installing → Check .dockerignore
│   └── Health check fails → Container starts but /v1/health not responding
├── Render deploy fails
│   ├── Build timeout → Check Render build logs
│   ├── Port mismatch → Must be PORT=4000 (render.yaml)
│   ├── Volume mount error → Check /data disk config
│   └── Health check fails → /v1/health must return 200 within 60s
└── Cloudflare Pages deploy fails
    ├── Build command wrong → Check build output path
    ├── Environment variables missing → Check Pages settings
    └── React build error → Check Vite build logs
```

### Tree 8: YAML Governance Confusion

```
Session behavior is wrong or inconsistent
├── Wrong work priority
│   ├── begin.yaml not read → Must be first file every session
│   ├── continuation.yaml stale → Update after each completed work
│   └── active_verticals outdated → Check current_focus_vertical
├── Capability grade wrong
│   ├── capability_inventory.yaml not updated → Re-audit
│   ├── Grade A claimed without evidence → Check evidence in continuation.yaml
│   └── Grade F still listed → Check if capability was implemented
├── Remedial action loop stuck
│   ├── automated_remedial_action.yaml not re-read → Must re-read after each task
│   ├── Focus scores not recalculated → Re-run grading formula
│   └── Termination condition met → All focus_scores ≤ 35?
└── Memory hygiene degraded
    ├── MEMORY.yaml not updated on exit → Check exit checklist
    ├── Short-term files not graded → Run 1/2/3 rubric
    └── Cross-folder sync missed → Check cross_folder_sync field
```

---

## Root Cause Checklist

### A — Pipeline & Ingestion
- [ ] A1: Snapshot status is "ready" (not "processing" or "failed")
- [ ] A2: File count within limits (repo not empty, not over 500MB)
- [ ] A3: Language detection returned valid results
- [ ] A4: Framework detection identified at least one framework
- [ ] A5: Context map was generated (not null/empty)
- [ ] A6: Repo profile was generated (not null/empty)

### B — Generator Core
- [ ] B1: Generator template resolves all variables
- [ ] B2: Generator output matches determinism test (byte-identical)
- [ ] B3: All 87 generators complete without error
- [ ] B4: Output files are valid format (JSON parseable, YAML valid, MD renderable)
- [ ] B5: No generator depends on runtime state (must be pure function)

### C — API Server
- [ ] C1: Health endpoint returns 200 (/v1/health)
- [ ] C2: Database is accessible (/v1/health/ready)
- [ ] C3: Rate limiting not exceeded (60/120 req/min)
- [ ] C4: API key valid and not revoked
- [ ] C5: CORS configured correctly for web domain
- [ ] C6: Error codes match documented 22 codes

### D — Database (SQLite)
- [ ] D1: WAL mode enabled (PRAGMA journal_mode = wal)
- [ ] D2: Disk not full (/data volume < 1GB)
- [ ] D3: Tables exist (snapshots, projects, accounts, billings, webhooks)
- [ ] D4: Integrity check passes (PRAGMA integrity_check)
- [ ] D5: VACUUM ran recently (POST /v1/db/maintenance)

### E — Deployment
- [ ] E1: Render container running (health check passing)
- [ ] E2: Cloudflare Pages build succeeded
- [ ] E3: GitHub Actions CI green
- [ ] E4: Environment variables set correctly
- [ ] E5: Persistent volume mounted at /data

### F — YAML Governance
- [ ] F1: begin.yaml read before any work
- [ ] F2: continuation.yaml updated after completed work
- [ ] F3: axis_all_tools.yaml referenced for program specs
- [ ] F4: Session gate conditions all met (8 checks)
- [ ] F5: MEMORY.yaml updated on folder exit
