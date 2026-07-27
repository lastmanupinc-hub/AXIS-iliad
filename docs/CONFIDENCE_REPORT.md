# Confidence Report + PENDING-OWNER Table

**Phase T.3 deliverable.** One honest page: what is verified solid, what is merely monitored, every
owner-only item, and the loop's actual convergence evidence.

Generated 2026-07-27 against HEAD `00db278`. Companion to
[`PLATFORM_TREE.md`](./PLATFORM_TREE.md) and [`ROI_CANDIDATES.md`](./ROI_CANDIDATES.md).

---

## 0. Convergence evidence — read this before anything else

Phase T's spec calls this document the *"ready for new verticals" attestation* and adds: **"it may
not overstate."** So the first thing it must report is the one thing a reader would most want to
assume, and must not.

**The loop did NOT converge. The convergence gate was paused by owner directive.**

- The rule (`HARDEN_POLISH_LOOP.md`): *two consecutive Phase A audit cycles with zero new confirmed
  findings* → Phase T → declare ready.
- **Actual dry-count: 0.** Frozen, not satisfied.
- Recent cycles found **5, 4, and 9** confirmed findings (cycles 26, 27, 28). The trend is not
  toward zero.
- On 2026-07-27 the owner directed: *"two connect [consecutive] runs will never converge there will
  always be another bug. pause the convergence two pass gate until I start it again and continue as
  if it's complete."*

The reasoning is sound — under continuous adversarial audit a live codebase asymptotically always
yields findings, so the gate defers Phase T indefinitely. But the consequence must be stated
plainly: **this document is a snapshot of a system still under active audit, not a certificate that
auditing finished.** Phase A is paused, not cancelled, and resumes when the owner restarts it.

Phase T itself found **6 new integrity defects** that no prior cycle had caught (listed in §3). That
is direct evidence the finding stream had not run dry.

---

## 1. What is verified solid

Verified means: confirmed this pass from repository contents, a passing test, or a live probe —
not inferred from documentation.

| Area | Evidence |
|---|---|
| **Production is up and serving** | Live probe 2026-07-27: 22/22 surfaces returned 200 — health, ready, all `.well-known/*`, llms.txt, for-agents, openapi, sitemap, robots, plus the web app and the new `/feedback` page |
| **MCP transport works** | `tools/list` over live HTTP returns a 108 KB catalog |
| **Data layer** | 46 tables at schema version 40; migrations run at boot and **fail open** so a migration error degrades readiness rather than killing the service; SQLite fully retired and CI-enforced |
| **Counts are structurally honest** | 142 artifacts / 20 programs verified **two independent ways** (`PROGRAM_OUTPUT_COUNTS` sum and `Object.keys(REGISTRY).length`). Four guard suites fail CI on any drift between code-derived counts and public copy — they caught 6 stale claims during this phase alone |
| **Determinism** | Structurally enforced: generators cannot read wall-clock; three separate suites assert byte-identical repeat runs |
| **Money path fails safe** | Every unprovisioned backend returns `_not_configured` and the charge is **never captured**. Lite caps are enforced pre-charge in both dispatch paths, so a lite-priced caller cannot obtain standard behavior |
| **Test suite scale** | 359 `*.test.ts` + 43 `*.test.tsx` = **402 files** vitest executes; ~7,324 statically-declared cases; run against a real `postgres:16` in CI |
| **Architecture boundaries** | No `apps/web` → `apps/api` imports, no `packages/` → `apps/` imports, no dependency cycles — asserted, not assumed |
| **API surface documented** | OpenAPI ↔ router bijection tested against the **live router instance**, not a source regex |
| **SSRF defense** | Blocklist covers loopback, RFC1918, link-local, CGNAT, IPv6 ULA, and cloud metadata `169.254.169.254` |
| **Compliance code is self-policing** | Every unimplemented capability is already labeled in-code (`NotImplementedError`, `_not_configured`, `SCOPE HONESTY`). The exposure is in prose that repeats package descriptions, not in the code |

---

## 2. What is monitored, not guaranteed

| Area | The gap |
|---|---|
| **Alerting** | **Nothing pages.** `ALERT_WEBHOOK_URL` is undeclared, so the evaluator no-ops. The only live signal is a 30-minute synthetic that files a GitHub issue — no pager, no email, no Slack |
| **Web-origin outage detection** | The synthetic's web check is **permanently suppressed** from alerting because Cloudflare challenges GitHub runner IPs. A web outage is caught only indirectly |
| **Metrics** | `/v1/metrics` is served; **no scraper is configured anywhere in the repo**. Counters are in-process and reset on restart |
| **Logs** | JSON to stdout → Render's log stream. No shipper, no aggregator, no APM, no tracing. Retention is whatever the `starter` plan gives |
| **Deploy trigger** | `autoDeploy` is undeclared; auto-deploy-on-push relies on a Render dashboard default |
| **Web deploy** | Two competing paths documented; the Actions path is `continue-on-error: true`, so a broken deploy does not fail CI |
| **Coverage** | Enforced floor is **60%**, not the 91.5% that appears in marketing copy |
| **19 owner-set env values** | `sync: false` — unverifiable from this repo. On 2026-07-26 one of them (`RESEND_FROM_ADDRESS`) turned out to be dashboard-only and one Blueprint sync from silently killing all email |

---

## 3. Defects Phase T found that prior audit cycles missed

Reported here rather than buried, because they bear directly on how much the audit history should be
trusted.

| # | Defect | Severity |
|---|---|---|
| 1 | Programs page advertises **37 output filenames with no generator**; free `skills` list is 5/5 fictional. Unguarded — count-honesty pins scalars, never filename lists | **High** — false promise, free tier, first thing a new customer sees |
| 2 | **No threshold alerting in production** | **High** — operational blindness |
| 3 | `/v1/openapi` advertised in MCP registry metadata, **404s live** | Medium — breaks agent integration |
| 4 | `attestation.json` makes a **provably false integrity claim** (epoch timestamp, stale merkle root) yet is attached to every Release | Medium-High |
| 5 | `LAUNCH_CLAIMS.yaml:77-79` asserts *"205 test files"*, `status: verified`, `verified_at: 2026-07-02`. Re-running **the claim's own stated command** (`*.test.ts`, excluding node_modules/dist) gives **359**; counting the `.tsx` files vitest actually executes gives **402**. Stale by 154 either way | Medium — a stale claim inside the very registry built to prevent stale claims |
| 6 | `REPLICATE_API_TOKEN` / `FASTIO_API_KEY` provisioned as production secrets with **zero integration code** | Low-Medium |

Common thread: **every one is a claim-vs-reality drift in a surface the guard tests do not cover.**
The guards are excellent at scalar counts and route bijection; they do not cover filename lists,
provisioned-but-unused secrets, or the freshness of the claims registry itself. That is the shape of
the next guard to build.

---

## 4. PENDING-OWNER table

Everything blocked on a decision, credential, or third party. Nothing here is fixable by engineering
alone.

### 4a. Credentials and configuration

| # | Item | Blocks | Notes |
|---|---|---|---|
| P1 | **`AXIS_TOKEN_KEY` unset on Render** | GitHub token storage → private-repo features | Fail-closed: it *threw* and caused a live GitHub-login outage on 2026-07-26. Login no longer depends on it (fixed `9b3e2ea`), but storage stays disabled. Needs a 32+ char secret |
| P2 | **`ALERT_WEBHOOK_URL` undeclared** | All threshold alerting | Needs a webhook URL (Slack/Discord/PagerDuty), then pinned in `render.yaml` — not the dashboard |
| P3 | `ADMIN_API_KEY` not in `render.yaml` | All 5 admin endpoints (403 until set) | Includes the MCP-usage dashboard built specifically to yield conversion data |
| P4 | `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | Stable MCP OAuth tokens | Without them every issued token stops verifying on the next restart |
| P5 | `TEMPO_RECIPIENT_ADDRESS` | Token-first x402 payments | Rail verified **OFF** 2026-07-14. Also verify the disclosed testnet asset-constant mismatch first |
| P6 | `R2_*` (four vars) | `iliad_object_storage` | None declared |
| P7 | Confirm `AXIS_MCP_INBAND_SETTLEMENT` live value | In-band cash settlement | Repo declares `"true"`; code default is OFF. Confirm via Render's API, **not docs** |
| P8 | Decide `REPLICATE_API_TOKEN` / `FASTIO_API_KEY` | — | Provisioned secrets with no consuming code. Build or drop |

### 4b. Publishing and distribution

| # | Item | Blocks | Notes |
|---|---|---|---|
| P9 | **npm publish `axis-iliad` CLI** | Top-of-funnel wedge | Repo law **HOLD**. No publish step exists in CI; docs deliberately dark until it runs |
| P10 | MCP registry / Glama / Smithery listings | Agent discovery | Fix the dead `/v1/openapi` first. `Dockerfile.glama` is **broken** (copies 4 of 8 needed packages) while the live listing advertises self-hosting from it |
| P11 | GitHub App + Marketplace | Second funnel | **HOLD** (rule 11) — `docs/github-app-plan/` off-limits without explicit instruction |
| P12 | Resolve `attestation.json` | Release integrity | Either regenerate at ship time or mark `SAMPLE`. Publishing a false attestation is the one excluded option |

### 4c. Money and legal

| # | Item | Blocks | Notes |
|---|---|---|---|
| P13 | **Recurring billing** | The largest revenue gap | `gated(external)` — PAI'D supports one-time charges only; every "subscriber" pays once and keeps the tier forever |
| P14 | Stripe connected-account cutover (`acct_1Ts5YxDwUJERAuEd`) | Settlement topology | **HOLD** — account exists, cutover is an owner decision |
| P15 | PAI'D user-controlled wallets (MTL) | Onboarding third parties | `gated(external)` — counsel. Engineering may proceed; onboarding may not |
| P16 | PAI'D wallet live canary | Enabling the FC wallet rail | Never run — no PAI'D credentials. Explicitly an owner action |
| P17 | Accept legal agreements / enter KYC data | Various | **HOLD** (rule 11) |

### 4d. Repository hygiene

| # | Item | Blocks | Notes |
|---|---|---|---|
| P18 | 13 open Dependabot PRs incl. majors (TypeScript 7, Vite 8, uuid 14, Node 26) | Dependency currency | Repo law: no dependency changes without discussion. Never git-delete a dependabot branch |
| P19 | 116 local / 174 remote branches | Repo clarity | Standing ruling: present the list, delete nothing unilaterally. Remote sweep is irreversible |
| P20 | PR #97 (`feat/launch-prep-1`) | Only branch with unlanded work | Cherry-pick candidates; do not force-land |
| P21 | Remove unused 1 GB `/data` disk | Cost + clarity | Requires confirming from the dashboard that the live disk is empty — no read-only audit can see that |
| P22 | Branch protection on `main` | Safety | Deliberately deferred — it changes the push-equals-deploy workflow both the loop and the operator rely on |
| P23 | Confirm operative Cloudflare deploy path | Deploy clarity | Two documented; Actions path fails silently |
| P24 | Decide `iliad_code_sandbox`'s fate | Catalog honesty | Paid tool that cannot run on this host. Move hosts or delist |

---

## 5. The honest bottom line

**What this system is:** a genuinely substantial, well-tested platform — 160 REST endpoints, 37 MCP
tools, 142 deterministic artifact generators, 402 test files, real architectural guard rails, and an
unusually strong culture of in-code honesty labeling. The engineering discipline is visible
everywhere: capabilities that don't work say so, in the catalog, to the caller.

**What it is not:** finished, converged, or fully observable. Specifically —

- It **cannot bill recurring revenue** and does not claim to internally, though marketing copy reads
  as monthly. **Corrected 2026-07-27:** this was recorded as blocked on PAI'D. It is not. PAI'D's
  live public OpenAPI declares a full subscription resource (`POST /v1/plans`, `POST
  /v1/subscriptions`, pause/resume/cancel, `billing_cycles`), all `200`; Iliad integrates none of
  it and its only `/v1/subscriptions` calls go to Stripe. The largest revenue gap in the platform
  is our own unbuilt integration, gated on two owner decisions (create the plans; decide what
  happens to customers who already paid once and hold their tier permanently). See ROI 1.1.
- It has **no alerting**.
- Its public Programs page **advertises files that do not exist**.
- A meaningful share of the MCP catalog is **`gated(owner)` on infrastructure the host cannot
  provide** (`code-sandbox`) or on models not in the image.
- **Nothing is published to npm**, so the stated top-of-funnel does not exist yet.

**Is it ready for new verticals?** Not as an attestation — the gate that would justify that word was
paused, not passed. The defensible statement is narrower and, I think, more useful:

> The platform's *core* — analysis, generation, storage, the REST and MCP surfaces, and the one live
> payment rail — is verified working and defended by real tests. The gaps are concentrated in
> **observability**, **recurring revenue**, and **distribution**, and every one of them is either a
> Tier-0 item in `ROI_CANDIDATES.md` or an entry in the PENDING-OWNER table above. None of them is
> unknown, and none is hiding.

That is a stronger position than a green checkmark would have described, because it is checkable.
