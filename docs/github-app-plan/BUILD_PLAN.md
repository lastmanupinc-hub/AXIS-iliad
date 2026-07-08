# GitHub App + Marketplace Listing — Build Plan

**Goal:** a real, installable GitHub App ("Axis Iliad Compliance") that runs on every push/PR,
posts a Check Run with an AP2/Visa compliance grade, and is listed (eventually paid) on GitHub
Marketplace. Scope is the **existing, already-drafted manifest** (`.github/app-manifest.json`)
— a focused compliance-check bot, not "wrap the whole Iliad API as an App." Keep it that size;
broadening scope is a separate decision, not assumed here.

**Sequencing constraint (why this hasn't started yet):** Web Wave 2 is actively editing
`apps/api`/`apps/web` in the same checkout as of this doc. Starting App code in parallel would
directly collide (two editors, one working tree — the exact class of pain the Phase-2 worktree
merges cost earlier in this build program). **Code work here starts only after the current web
wave lands and merges.**

**The owner/AI split (read this before either of us moves):** this project has a hard ceiling I
cannot script past — GitHub's manifest-to-App conversion, org 2FA, domain verification, the
Marketplace Developer Agreement, and the final review submission are all interactive/legal steps
tied to your GitHub identity. I build every piece of code to the point where your only remaining
action is a click or a signature — matching how every other credential/dashboard step in this
build program has worked (Stripe, Resend, Cloudflare Pages).

---

## Ground truth (verified against the live repo)

- `.github/app-manifest.json` — real, filled-out: name "Axis Iliad Compliance", webhook →
  `axis-api-6c7z.onrender.com/v1/github/webhook`, redirect/callback →
  `iliad.trustfabric.ai/install/github/callback`, events `[push, pull_request]`, permissions
  `{checks:write, contents:read, metadata:read, pull_requests:read}`. **Nothing consumes it** —
  no manifest-flow exchange endpoint, no `GITHUB_APP_ID`/private key anywhere, no callback page.
- `apps/api/src/oauth.ts` — the *only* live GitHub integration is login OAuth (`read:user
  user:email`, no repo scope). Separate concern from the App; leave it alone.
- `apps/api/src/github-webhook.ts` — already handles `ping, push, pull_request, installation,
  installation_repositories` and HMAC-verifies `X-Hub-Signature-256`, but fetches source via a
  static `GITHUB_TOKEN` PAT fallback, not an installation token — because no App/installation
  exists yet to issue one. This is the seam the real App plugs into.
- `.github/actions/compliance-check/action.yml` — already calls the live API for a grade; useful
  reference for what the Check Run's grading call should look like server-side.
- `packaging/manifests/github-marketplace-listing.md` — generic `closer`-program boilerplate
  (describes `git clone && make install`, not an App). **Do not reuse as-is** — WO-G7 replaces it.
- `key.txt` — zero GitHub-App-shaped secrets today (App ID, private key, webhook secret, App
  client ID/secret are all distinct from the existing OAuth `GITHUB_CLIENT_ID/SECRET`).

## Verified external requirements (GitHub, as of 2026-07-07)

- Marketplace only lists **GitHub Apps** and **Actions** — confirmed current, no other category.
- **Paid plans need 100 installs first** (free listings are exempt from this gate) — so the
  realistic launch sequence is: ship free-only, cross 100 installs, *then* submit for paid plans.
- GitHub becomes **merchant of record** for App purchases: their billing (not Stripe/PAI'D), a
  flat 5% cut, $500 payout floor, Marketplace *purchase-event* webhooks you must handle.
- Requires org-wide 2FA, a verified domain, and accepting the **GitHub Marketplace Developer
  Agreement** — all owner-only.
- Submission review is manual, no published SLA (community reports: 1–6 weeks typical).

### Precisely verified, 2026-07-07: the account-type wall (new, changes paid-path sequencing)

Checked directly against the live GitHub API (`gh api graphql`, introspection + a real query against
this repo's actual owner) rather than assumed from docs. Three findings, all confirmed:

1. **`lastmanupinc-hub` is a personal User account, not an Organization** —
   `repositoryOwner(login: "lastmanupinc-hub") { __typename }` returns `"User"`, node ID prefix
   `U_…`. Every requirement below hinges on this.
2. **Personal accounts cannot sell on Marketplace at all, full stop** — confirmed via GitHub's own
   "Requirements for listing an app" + "Applying for publisher verification" docs: *"If you want to
   sell an app that's owned by your personal account, first you'll need to transfer the app to an
   organization."* Free listings have no such restriction. This means the paid path's real first
   step isn't 2FA or domain verification — it's **deciding whether to create a GitHub Organization**
   (e.g. for "Last Man Up INC") **and transfer the App to it**. That decision doesn't exist yet and
   is squarely the owner's to make (name, who else gets ownership/billing visibility, whether it's
   worth doing before 100 installs are even in hand).
3. **Both gating settings are Organization-only, and neither is API-settable, for different
   reasons — confirmed by direct schema introspection, not inference:**
   - **Org-wide 2FA requirement:** `PATCH /orgs/{org}` (REST) does not accept a 2FA field at all —
     `two_factor_requirement_enabled` is response-only. On the GraphQL side, the *only* mutation
     that sets a 2FA requirement is `updateEnterpriseTwoFactorAuthenticationRequiredSetting` — scoped
     to `Enterprise`, not the plain `Organization` type a Marketplace publisher would have. There is
     no API path for a regular org, and none for a personal account either (a personal account's 2FA
     is just that one person's own security-settings toggle — enrollment itself, e.g. registering a
     TOTP app or security key, has never been API-exposed by GitHub for any account type, which is
     the correct call security-wise).
   - **Verified domain:** the mutations genuinely exist and are real
     (`addVerifiableDomain(ownerId, domain)` → returns a `verificationToken` + `dnsHostName` to place
     as a DNS TXT record → `verifyVerifiableDomain(id)` checks it and flips `isVerified`). I already
     have the DNS-side capability this needs (Cloudflare API access to the `trustfabric.ai` zone,
     same mechanism used for Resend's records earlier). **But** `AddVerifiableDomainInput.ownerId`
     is typed against a `VerifiableDomainOwner` union whose only members are `Organization` and
     `Enterprise` — introspection confirms `User` is not a possible type. There is no `ownerId` I
     could pass for a personal account; it's not a permissions gap, the mutation doesn't apply.
   - **Organization creation itself is also web-UI-only** — no public `POST` endpoint creates a new
     GitHub.com organization (only GitHub Enterprise *Server's* admin API has that, irrelevant here).
     So even the unlock step for the two settings above can't be scripted.

**Net effect on sequencing:** none of this blocks or changes WO-G1–G5, G7, G8 — the **free listing
path needs no organization and nothing above applies to it**, so it proceeds exactly as planned once
Web Wave 2 clears. It *does* mean WO-G6's "activate at 100 installs" framing was slightly optimistic:
the real gate before any paid submission is an owner decision (create an org? transfer the App to
it?) that has to happen first, and — like App creation — that first click has to be yours; I can't
shortcut it by finding a broader token scope, because the operation itself has no API surface at any
scope. I'll flag this as a decision point once free-tier install numbers make the paid path worth
discussing, not before.

---

## Work-orders

### WO-G1 · App-from-manifest exchange + credential capture — **S**, code-only until the click
- **Target:** a page (`/install/github/create` or similar) that POSTs `.github/app-manifest.json`
  to GitHub's manifest flow (`https://github.com/settings/apps/new?state=...` with the manifest
  in a form per GitHub's documented flow), and a server route that receives the resulting `code`
  and exchanges it via `POST https://api.github.com/app-manifests/{code}/conversions` for the
  real `id`, `pem` (private key), `webhook_secret`, `client_id`, `client_secret`.
- **Files:** `apps/api/src/github-app.ts` (new — the exchange + JWT signing module),
  `apps/web/src/pages/InstallGithubAppPage.tsx` (new), a new API route.
- **Acceptance:** offline/mocked test proving the conversion-response shape maps correctly into
  the credential set; a manual test doc explaining exactly what the owner clicks.
- **OWNER STEP (not scriptable):** actually clicking "Create GitHub App" on GitHub's page —
  this is tied to your GitHub login/org. I hand you the exact URL/flow; you click once.

### WO-G2 · Credential storage — **S**
- Once WO-G1's exchange returns real credentials (from the owner's one click), store them the
  same way every other secret has been handled this session: owner pastes into `key.txt`, I read
  + write to the `axis-api` Render env (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`,
  `GITHUB_APP_WEBHOOK_SECRET`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`), never
  printed/committed. Mirrors the Stripe/Resend pattern exactly.

### WO-G3 · JWT App-auth + installation-token exchange — **M**
- **Target:** `signAppJwt()` (App-level auth, `jsonwebtoken` already a dependency, currently
  unused for this) + `getInstallationToken(installationId)` (`POST
  /app/installations/{id}/access_tokens`), replacing `github-webhook.ts`'s static `GITHUB_TOKEN`
  PAT fallback with real per-installation tokens.
- **Acceptance:** unit tests against mocked GitHub API responses; the PAT fallback stays as a
  last-resort path (never removed, just no longer primary) for repos with no App installed.

### WO-G4 · Installation callback + storage — **M**
- **Target:** implement `/install/github/callback` (referenced in the manifest today but doesn't
  exist) — captures `installation_id` + `setup_action` from GitHub's redirect, associates it with
  an AXIS account (linking installation → account_id), a new `github_app_installations` table in
  `@axis/snapshots` (PG migration).
- **Acceptance:** webhook `installation`/`installation_repositories` events + the callback both
  correctly populate/update the same table; uninstall removes it.

### WO-G5 · Check Run compliance flow — **M**
- **Target:** on `push`/`pull_request` webhook (now installation-token-authenticated), run the
  compliance grade (reuse `gradeCompliance`/the real engines from this build program's earlier
  work — NOT the old keyword-scan path) and POST a Check Run (`checks:write`) with the grade,
  mirroring `.github/actions/compliance-check/action.yml`'s existing call shape.
- **Acceptance:** a mocked push event produces a Check Run POST with the correct conclusion/grade
  mapping; a failing grade doesn't block the PR (informational check, not a required gate) unless
  explicitly configured otherwise later.

### WO-G6 · Marketplace Purchase webhook (billing) — **L**, build now / activate at 100 installs
- **Target:** handle GitHub's `marketplace_purchase` event (`purchased`, `changed`,
  `cancelled`, `pending_change`) — map GitHub Marketplace plan IDs to AXIS entitlements, **as a
  channel separate from Stripe/PAI'D**, not a replacement. Free-plan events work immediately;
  paid-plan events are dead code (no traffic) until the 100-install gate is cleared and paid
  plans are actually submitted — build it now so it's not a scramble later.
- **Acceptance:** each event type correctly grants/revokes/updates entitlements in tests; a
  purchase for an unrecognized plan ID fails closed (no entitlement), never silently succeeds.

### WO-G7 · Real listing content — **S**
- **Target:** replace `packaging/manifests/github-marketplace-listing.md`'s generic boilerplate
  with real content describing the actual App (Check Run compliance grading on push/PR, what
  `checks:write`/`contents:read`/`pull_requests:read` are used for for a security-conscious
  installer, free-tier scope, screenshots placeholder list).
- **OWNER STEP:** logo/screenshot assets, and the actual submission form on GitHub — I write the
  copy, you supply visual assets and click submit.

### WO-G8 · Free-tier launch, then the 100-install wait
- Ship WO-G1–G7 as a **free-only** listing first (matches the "free listings are exempt from the
  100-install gate" rule) — this is the fastest path to genuine Marketplace presence. Paid-plan
  submission is a *follow-up*, gated on organic install count, not on more code.

---

## What I will NOT do without a separate, explicit go-ahead
- Click "Create GitHub App" on GitHub's site (WO-G1's owner step).
- Enable org 2FA or click through domain verification.
- Accept the GitHub Marketplace Developer Agreement.
- Click final "Submit for review."
- Set live App credentials into Render before you've pasted them into `key.txt` (same rule as
  every other credential this session).

## Next step
Once Web Wave 2 (P7, P8) lands and merges, I start WO-G1 (the manifest-exchange scaffolding) —
pure code, no live App exists yet, zero risk. I'll hand you the exact one-click URL for the
manifest flow the moment WO-G1's code is ready to receive its result.
