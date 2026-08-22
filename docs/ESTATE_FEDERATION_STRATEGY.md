# Estate Federation Strategy

**Goal (owner directive, 2026-08-22):** every AXIS estate application — PAI'D
(paid.trustfabric.ai), AXIS Foundry (avatar.jonathanarvay.com), AXIS Launch
(jonathanarvay.com), TrustFabric (named "tf.trustfabric.ai" in the directive;
see §5.1 — the registry says tf.jonathanarvay.com), and whatever comes next —
fully usable and crawlable by AI agents looking for tools, with as many of
their functions as possible callable through the Iliad MCP, while staying
**excluded from the Iliad webapp's human-facing pages** (each property has its
own standalone website and markets itself).

Interpretation applied throughout, stated so it can be vetoed: "excluded from
the webapp" means excluded from the **human** product pages (McpPage tool
registry, ForAgentsPage's human mirror, Programs/Docs/Plans). The
**agent-facing** surfaces the API serves — `/llms.txt`, `/.well-known/*`,
`/for-agents` JSON, MCP `tools/list` — deliberately DO carry estate entries,
because "crawlable by AI agents looking for tools" is the whole point.

Grounded in a 2026-08-22 recon pass (live probes + file:line sweeps of both
repos), then **adversarially verified the same day** by a 3-lens workflow
(citation audit, estate-law consistency, completeness critic); every surviving
citation below was re-opened against the working tree, and this revision
incorporates all confirmed findings — including one that materially changed
§1.2.4 and §7.

---

## 1. Verified current state

### 1.1 The properties, probed live (2026-08-22 — network observations, re-probe to re-verify)

| Property | Agent surface today |
|---|---|
| **paid.trustfabric.ai** | **Frontend: none.** SPA catch-all serves index.html for every path — `/.well-known/mcp.json`, `/llms.txt`, `/agent.json` are all fake 200s returning HTML (worse than 404s: crawlers cache HTML as JSON; PAI'D confirmed and accepted the fix same day — queued their side). Only real file: an allow-all `robots.txt`. **MCP: EXISTS** — `api.paid.jonathanarvay.com/v1/mcp` verified live by PAI'D 2026-08-22 (JSON-RPC, protocol 2025-06-18, Bearer agent-keys, six tools at HEAD; see the answered ticket in `begin.yaml` outbox for auth details and the three-blessed-tools constraint). |
| **avatar.jonathanarvay.com** (Foundry) | Unverifiable from this machine (§1.4), but the repo documents a live 14-tool MCP server (`engine/axis_foundry/mcp_server.py:1228-1428`), per-tool x402 USDC pricing (`engine/axis_foundry/portal/x402_gateway.py:212-225`), `server.json` (registry name `com.jonathanarvay/axis-avatar-foundry`, remote `https://api.avatar.jonathanarvay.com/mcp`, **no auth block**), `/.well-known/mcp.json`, and a registry-publication runbook. Best-equipped sibling. |
| **jonathanarvay.com** (Launch) | Unverifiable from here (§1.4). Per the tickets it filed into our inbox (2026-08-10), it shipped the estate's Cloudflare Agent-Readiness *reference implementation* — likely the most compliant property. |
| **TrustFabric** | The owner directive names `tf.trustfabric.ai`, which is **NXDOMAIN** (checked 2026-08-22). But `ecosystem.registry.yaml:61-67`'s `trust_fabric` entry lists `tf.jonathanarvay.com` (which **resolves** to Cloudflare IPs — unverifiable further from here per §1.4) and, oddly, `paid.trustfabric.ai` (which also appears under the `paid` entry — a pre-existing registry data quirk the typed module will surface). The blocker is therefore **naming reconciliation + owner definition**, not simply "no DNS" — see §5.1. |
| **Iliad itself** | Rich self-describing surfaces (`axis.json`, `llms.txt`, `capabilities.json`, `/for-agents`, 37 MCP tools, MCP-registry listing) — with **zero estate awareness**: the live `axis.json` (`handleWellKnown`, `apps/api/src/handlers.ts:2714-2790`) contains no sibling mention. |

### 1.2 What already exists in-repo (the strategy builds on these, not from scratch)

1. **`ecosystem.registry.yaml`** (repo root, `schema_version: "1.0"`) — a full
   4-project estate registry: `iliad` (:10-31), `paid` (:33-46, incl.
   `mcp_url: https://api.paid.jonathanarvay.com/v1/mcp` at :41 — unverified),
   `foundry` (:48-59), `trust_fabric` (:61-71). **Read by no code** (verified
   by grep). Its header (:3) claims it is "Consumed by Iliad
   discover_commerce_tools…" — false by this repo's own honesty standards.
   Non-code references that must be updated when it is retired/regenerated:
   `README.md:19`, `docs/x402/CONTRACT.md:134`, `docs/x402/STRATEGY.md:167`,
   `.cursorrules:107`, plus generated `.ai/*` copies.
2. **`PLANNED_CAPABILITIES` machinery** — `apps/api/src/mcp-tools.ts:27-32`
   (currently an empty array) with the full typed pipeline intact: entries
   spread into `MCP_TOOLS` (:1460-1497); the dispatcher's `default:` case
   answers calls to any `PLANNED_CAPABILITY_NAMES` member with a structured
   envelope (`mcp-server.ts:445-453`, envelope builder
   `mcp-tool-impls.ts:168-180`); each entry carried a
   `recommended_provider: {name, url}`. **Zero-build hook for honest estate
   stubs** — and, symmetrically, the natural **tombstone** shape when a shipped
   estate tool is ever retired (§7).
3. **`sibling_owned` capability status** —
   `packages/generator-core/src/generators-artifacts.ts:1392-1409` defines a
   typed `sibling_process: {name, url, rationale}` slot, instantiated for
   `image_generation` → Foundry (:1592-1642).
4. **The sibling-delegation doctrine — which this strategy REVISES, not
   extends.** Four surfaces currently state, as law, that Iliad does *not*
   mint tools for sibling-owned capabilities: `apps/api/src/counts.ts:19-24`
   ("the count drops when a capability is delegated to a sibling… Iliad does
   not mint a tool for capabilities it doesn't own"); the `sibling_owned`
   JSDoc (`generators-artifacts.ts:1392-1395`, "Iliad does NOT expose an MCP
   tool for it"); the `image_generation` entry summary (:1604-1610,
   "intentionally does NOT mint an iliad_image_generation tool"); and the MCP
   docs note (`mcp-server.ts:175-183`, "not look for an
   iliad_image_generation tool that won't exist"). The estate stubs (§2a) and
   Foundry proxies (§2b) **invert** that rule by owner directive. None of the
   four surfaces is test-guarded (comments/JSDoc/prose), so nothing fails CI
   when they go stale — **est_02 explicitly includes rewriting all four** to
   state the new doctrine (Iliad may mint estate-flagged tools for
   sibling-owned capabilities; the count treats them per §4), or they become
   precisely the stale-comment drift this repo keeps rediscovering.
5. **PAI'D wired at the money layer** — `packages/paid-client/src/index.ts`
   (`resolvePaidBaseUrl` :49-55 tolerates all three estate env-var names; its
   docstring says "the estate"), consumed by `apps/api/src/cashier.ts:85-233`.
   Federation exists for **money**; nothing exists for **tools**.
6. **The proxy-tool template** — `iliad_transactional_email` is the one
   genuinely live external proxy (→ Resend): definition
   `mcp-tools.ts:985-1034`; pricing `packages/mpp/src/index.ts:216-227`
   ($0.02/$0.01); auth wall → `_not_configured` envelope (never charge when
   unconfigured) → arg guards → `authorizeMcpToolCredits` → external call
   with `AbortController` timeout and normalized errors (`email.ts:67,
   122-161`) → `captureMcpToolCredits` only on success
   (`mcp-tool-impls.ts:328-399`). **Hard rule inherited:** external calls use
   authorize/capture, never combined `meterMcpToolCredits`
   (`apps/api/src/mcp-runtime.ts:367-373`).

### 1.3 Where tools surface, and the exclusion chokepoint

Every derived tool listing flows through `deriveMcpToolCatalog()`
(`apps/api/src/mcp-tool-impls.ts:2389-2412`). Human-webapp exposure:

| Surface | Source | Exclusion mechanism |
|---|---|---|
| `McpPage.tsx` tool registry (:272-334) | **Live** `POST /mcp tools/list` | Client-side filter on an estate marker carried in tool `_meta`/annotations (the page bypasses the catalog, so the marker must ride the wire) |
| `McpPage.tsx`/`ForAgentsPage.tsx` counts | `TOOL_COUNT` (`apps/web/src/config.ts:73`) | Copy decision — §5.3, with the full guard list in §4 |
| `ForAgentsPage.tsx` tool `<ul>` (:192-212) | Hand-maintained, **CI-forced complete** by `count-honesty.test.ts:130-135` | Guard becomes a derived estate split: estate tools asserted PRESENT in the API's `/for-agents` JSON and ABSENT from the human page — pinned both directions |
| `DocsPage`/`Plans`/`Commerce`/`Playground` | No tool names | Nothing to do |

Agent-facing surfaces (`/for-agents` JSON `handlers.ts:3542+`, `llms.txt`
:3067-3160, `capabilities.json` :2984-3063, `axis.json` :2714-2790, MCP
`initialize`) **include** estate entries.

### 1.4 Side-finding requiring owner attention

A `safebrowse.io` web filter intercepts this machine's connections to every
`jonathanarvay.com` host: plaintext answers on 443, port-80 302s to
`safebrowse.io/warn.html`. DNS resolves to legitimate Cloudflare IPs — the
interception is in the network path. If that filter product has the domain
miscategorized, **agents behind similar filters bounce off half the estate**.
Checking/appealing the categorization is cheap and directly serves the
crawlability goal. (It also means nothing on those hosts could be
live-verified from this machine — including `tf.jonathanarvay.com`.)

---

## 2. Architecture: three layers, discovery-first

### Layer 1 — Estate registry: one typed source of truth, served everywhere

**Location: `packages/generator-core/src/estate-registry.ts`** — beside
`product-registry.ts`, matching its discipline exactly. NOT `apps/api/src`:
generator-core is an upstream workspace package, and the
`RESELL_CAPABILITIES.sibling_process` entries (§1.2.3) live in generator-core
— placing the registry downstream in apps/api would make it unimportable from
the very file that must be guard-tested against it (dependency inversion).
With the registry in generator-core: apps/api imports it (already depends on
the package), and a guard test pins every `sibling_process` entry to a
registry row — collapsing what would otherwise be FOUR places describing
sibling ownership (registry, ecosystem.yaml, RESELL_CAPABILITIES, generated
capability-map) down to one source and three guarded derivations.

Schema (per entry):

```
id, name, domains[], api_base, status: "live" | "planned" | "unverified",
mcp?: { url, transport, auth: "none" | "bearer" | "x402", registry_name },
payment?: { rail: "x402-evm" | "mppx" | "paid-wallet", notes },
tools?: [{ name, summary, price_usd, pricing_model }],   // VENDORED snapshot
tools_source?: { manifest_url?, vendored_at, sync_guard }, // see §3.2
capabilities_summary, discovery: { llms_txt?, well_known?, for_agents? },
webapp_surface: "agent-only",
health?: { probe_url, last_status }                        // see §6
```

The per-tool block resolves an internal inconsistency verification caught: the
original sketch had no tool/price fields, yet Layer 2 derived prices from the
registry and `discover_estate_tools` promised "Foundry's 14 tools with
prices." Provenance decision: **vendored snapshot with a cross-repo sync
guard** (§3.2) — not live-fetch, which would put an outbound-fetch
(SSRF/availability/injection) surface on a free no-auth tool.

Served/consumed as:
- **`/.well-known/axis-estate.json`** (new route) — the canonical estate
  manifest every sibling hard-links. Because it is a load-bearing cross-repo
  contract: it carries `schema_version` (the yaml it replaces already had
  one), a documented additive-only compatibility rule, and Cache-Control
  guidance for crawlers. One URL; property #5 is one registry row.
- **`discover_estate_tools`** — new **free, no-auth** MCP tool returning the
  registry + vendored per-property tool summaries. One connection to Iliad
  teaches an agent where every sibling lives, what it does, and how to pay it.
- Estate blocks folded into `axis.json`, `llms.txt`, `/for-agents` JSON,
  `capabilities.json`, and one sentence in the MCP `initialize` instructions.
- `ecosystem.registry.yaml` becomes **generated from** the typed module (or is
  retired, updating all references in §1.2.1) so its header finally tells the
  truth.

### Layer 2 — Callable functions: stubs first, then real proxies

**2a. Immediate: `PLANNED_CAPABILITIES` estate stubs.** Repopulate the empty
array with estate entries whose envelope carries the sibling's **direct** MCP
endpoint and pricing — an honest, machine-actionable redirect *today*, before
any proxy ships. Stubs are members of `MCP_TOOLS`, so they pay the full count
cascade (`counts-consistency.test.ts:22-24` pins
`MCP_TOOL_COUNT === MCP_TOOLS.length`) and they **depend on the est_02
exclusion flag landing first** — otherwise `count-honesty.test.ts:130-135`
forces every stub name onto the human ForAgentsPage, the exact page the owner
excluded them from.

**2b. Foundry proxies — the real product, three waves.** All follow the
`iliad_transactional_email` template, substituting Foundry's MCP for Resend;
definitions/prices derive from the Layer-1 registry (guard test pins proxy
list ↔ registry rows).

- **Wave 1 — synchronous, cheap, proves the rail:** `axis_validate` ($0.25),
  `axis_inspect` ($0.10), `roblox_compliance_check` ($0.25), `axis_compare`
  ($0.10), `axis_manifest_verify` ($0.10).
- **Wave 2 — mesh-transform tools** ($0.50-1.50): `repair_mesh`,
  `retarget_animation`, `axis_process`, `post_process_mesh`, `axis_export`.
  Constraint: `post_process_mesh` takes inline base64 GLB — multi-MB through
  two MCP hops. Answer: the existing `iliad_object_storage` R2 rail (agent
  uploads via presigned URL; the proxy hands Foundry a fetchable URL). The
  ticket asks Foundry for URL inputs **with the safety constraint stated**:
  restricted to the estate's R2 storage hosts / presigned-URL shape — a
  generic "accept URLs" implementation would hand every Foundry caller an
  SSRF primitive against Foundry's own backend. We invented the requirement;
  we own specifying it safely.
- **Wave 3 — the async generate pair:** `estate_foundry_generate`
  ($5.00/$6.00 base + polygon-tier dynamic pricing, via
  `authorizeMcpToolCreditsForAmount`, `mcp-runtime.ts:342-349`) +
  `estate_foundry_status` (free, mirroring Foundry's own free poll).
  Settlement mechanics in §3.

**2c. PAI'D — agent-as-buyer only, per PAI'D's own recorded decision
(ANSWERED 2026-08-22, same day — full reply on the outbox ticket).** The MTL
boundary, precisely: **not gated** — Iliad paying Foundry through PAI'D rails
(first-party money movement between owner-controlled accounts; the estate
already does it, and Foundry's gateway already documents settling through
PAI'D's CDP account, `x402_gateway.py:80-86`). **Gated on counsel** — PAI'D
*merchant-side* functions, excluded as assumed. Their blessed set:
- **Listed now (read-only):** `get_quote`, `list_providers`,
  `get_payment_intent` — the ONLY PAI'D tools estate-facing metadata may
  carry today.
- **Conditional:** `execute_payment` — exists and is per-key policy-gated,
  but their CAND-COH-009 records it currently skips the sanctions/
  payer-screening chokepoint. **Corrected trigger (PAI'D, same day):**
  COH-009+COH-013 closing makes it *eligible*, nothing more — activation of a
  money-moving tool is a human authorization decision, so listing waits for a
  second, explicit founder-sign-off confirmation from PAI'D. Two signals will
  arrive; estate metadata moves only on the second. Never listed early.
- **Struck by founder rule:** wallet top-up (stored value = custody/
  licensing) and any new checkout-initiation tool. Do not re-propose.
Their MCP endpoint is real: `api.paid.jonathanarvay.com/v1/mcp` (Bearer
agent-keys; sandbox keys deny execute_payment, $1 cap, 24h).

**2d. Launch + TrustFabric.** Launch: Layer-1 entry + reciprocal links; no
callable functions identified (none invented); **executable today** via the
informal peer channel — the real open decision is whether to add
`axis_launch` to `known_repos` (§5.7), not an owner gate. TrustFabric:
`planned`, blocked on §5.1's naming reconciliation + definition — blocker
recorded with the exact checks run (tf.trustfabric.ai NXDOMAIN;
tf.jonathanarvay.com resolves but is filter-blocked from this machine) per
`blocked_candidate_law`.

### Layer 3 — Per-property agent-readiness kits (direct crawlability)

| Property | Needs | Channel |
|---|---|---|
| PAI'D | Everything: real `llms.txt` + `.well-known/*` (today the SPA fakes 200s), Content-Signal, `server.json` + registry publication if they expose MCP, confirmation whether `api.paid.jonathanarvay.com/v1/mcp` exists | Inter-repo ticket |
| Foundry | Registry publication per their `MCP_REGISTRY_RUNBOOK.md`; `llms.txt` + Content-Signal; estate cross-link; server-to-server auth expectations | Inter-repo ticket |
| Launch | Reciprocal estate links in its already-shipped discovery files | Peer message / owner relay (§5.7) |
| TrustFabric | Stand-up first | Owner (§5.1) |

Reciprocity rule: every property links the ONE canonical `axis-estate.json`
rather than duplicating its content.

### Canonical-path ruling (so est_04/05 survive `refusal_surface`)

After Wave 3, Foundry generation is reachable two ways. This is **not** a
forbidden parallel path; the two doors serve disjoint populations, and the
doc rules it explicitly: **direct Foundry MCP is canonical for
x402-capable agents** (cheaper — no margin; advertised first by
`discover_estate_tools`); **the Iliad proxy is canonical for agents that
cannot speak x402-EVM** (mppx/plan-credit/PAI'D-wallet agents, for whom the
direct door does not functionally exist). `discover_estate_tools` states both
doors and the price difference honestly — hiding the cheaper direct path to
protect margin would be the dishonest-catalog pattern this repo exists to
prevent.

---

## 3. Payment architecture for cross-app calls

### 3.1 Pass-through is dead — three verified blockers

1. **Wire protocols differ.** Iliad speaks mppx/PaymentAuth — the
   `wire_protocol_note` at `apps/api/src/handlers.ts:2882` states it is
   "…NOT x402.org's v1 (X-PAYMENT…) or v2 (PAYMENT-SIGNATURE…) conventions"
   (see also `apps/api/src/mpp.ts:19-20`). Foundry speaks x402-foundation
   exact/EVM (`engine/axis_foundry/portal/x402_gateway.py:381-403`). A
   credential minted for one is not presentable to the other.
2. **Settlement rails differ.** Stripe SPT + Tempo USDC + PAI'D Fabric
   Credits (Iliad) vs. on-chain USDC on Base via CDP facilitator (Foundry).
3. **Settlement windows differ.** Foundry's generate tools defer settlement
   up to 1800 s until the GPU job completes (`x402_gateway.py:61-69,109-112`);
   Iliad's `AuthorizedCharge` (`mcp-runtime.ts:221-227`) lives one HTTP
   request and has no deferred representation.

**Design: Iliad charges the agent, calls Foundry with Iliad's own estate
credential, settles Iliad→Foundry through PAI'D** — the estate's common
settlement layer, already half-wired on both ends (`paid-client`'s
three-env-name tolerance; Foundry's CDP-key note;
`ecosystem.registry.yaml:58` `consumes: paid`).

### 3.2 Cross-repo price integrity (verification finding, high)

An Iliad-side guard pinning proxies ↔ registry rows protects nothing if the
registry itself drifts from Foundry's real prices (`X402_TOOL_PRICES`,
`x402_gateway.py:212-225`; token ladder `_tiered_generate_price`,
:305-336) — margin goes silently negative, and Wave-3 dynamic pricing would
otherwise mean hand-replicating Foundry's token ladder across two repos, the
exact drift family this repo most documents. Two mechanisms, both required:
1. **Sync guard (CI):** Foundry serves a machine-readable price manifest
   (asked in the ticket — it already has the table as code); an Iliad guard
   diffs the registry's vendored `tools[]` snapshot against it, failing loud
   on drift — the same vendor-sync pattern this repo already applies to
   vendored code.
2. **Call-time verification (runtime):** the proxy compares Foundry's quoted
   x402 price against the registry row before paying and **fails closed on
   mismatch** — never silently absorbing a price increase.
Margin policy is the owner's (§5.2); placeholder proposal cost+10%, whole
cents (`packages/mpp/src/index.ts:329-345` post-mortem).

### 3.3 The ambiguous-submission window (verification finding, high)

`cashier.ts:180-231` already codifies the estate's doctrine for exactly this
class: 4xx = provably-not-landed (safe), 5xx/network/abort = **ambiguous —
fail closed, record compensation, never retry onto another rail**, with a
stable idempotency key so a retry dedupes (`cashier.ts:126-145`). The Foundry
hop imports that doctrine wholesale. But Foundry's gateway currently has **no
idempotency mechanism at all** (verified: only the CDP JWT nonce) — a retried
submission is a fresh signed x402 authorization = a second GPU job = a second
USDC settlement. And the asymmetric case is silent margin loss: ambiguous
submit → Iliad doesn't capture the agent → the job completes anyway →
Foundry settles Iliad's deferred authorization → Iliad paid ~$5 for a call it
never billed. Therefore:
- The Foundry ticket's **first** protocol ask is idempotent submission (a
  client-reference key honored on replay) + job-lookup-by-client-reference,
  closing both directions of the window.
- Until that exists, Wave 3 does not ship (Waves 1-2 are synchronous and
  small-dollar; ambiguous outcomes there fail closed and are reconciled by
  the §6 probe against Foundry's job/settlement records).
- **Capture policy:** capture-on-successful-submission; terminal-failure
  compensation via a **new** wiring (an async job-status transition writing an
  owed-compensation entry — the compensator exists, `mcp-server.ts:8,313,470`,
  but nothing today triggers it from a later, separate HTTP request; est_05
  budgets this as new work, not a reuse). Caveat inherited from the machinery:
  compensation is plan-credit; for charges cash-settled in-band it is not a
  cash refund — which is one reason estate proxies are **excluded from
  in-band settlement in v1** (below).

### 3.4 Pre-payment paths and the one-shot agent

On the plan-credit rail, authorize is preview-only (`mcp-runtime.ts:284-317`
"never reserves or moves money") and capture follows success — Foundry-down
costs the agent nothing. But the H1 in-band cash gate and x402 both collect
**before** dispatch, and compensation is lazy (granted on the account's next
call — `mcp-server.ts:462-490`): a one-shot agent paying cash for a proxy
call while Foundry is down is charged and never automatically made whole.
**v1 rule: estate proxies are excluded from `decideInbandGate`'s
guaranteed-billable set** (`mcp-tool-impls.ts:3900`) — their success is never
guaranteed pre-dispatch by definition, so they stay on authorize/capture.

### 3.5 Estate credential custody (verification finding)

x402 exact/EVM means Iliad holds a **signing key over a hot USDC wallet on a
public web server**. This estate is otherwise custody-obsessed
(`cashier.ts:66-83` fail-closed owner allowlist; the PAI'D MTL finding), so
the wallet gets the same treatment, specified in est_04 not deferred: a
per-call price ceiling and a daily spend cap enforced Iliad-side before
signing; a documented rotation path; defined low-balance behavior (the proxy
returns a structured `_estate_unavailable` envelope — never a charge, never a
bare 502); and a registry guard asserting every `mcp.url`/`api_base` sits
under an estate apex domain, so a typo'd/squatted row can never point the
signing key at a wrong host. Which wallet (PAI'D-brokered path) remains the
owner's §5.6 — custody design does not wait for it.

### 3.6 Relay integrity

Sibling tool output relayed through Iliad's envelope is third-party content
wearing Iliad's brand — including user-supplied mesh metadata/filenames echoed
in Foundry validation reports (instruction-shaped text inside a trusted tool
result). Estate proxies wrap relayed payloads in a structured
`_estate_relay: {source, retrieved_at}` field with a treat-as-data note —
mirroring how this codebase already treats shared-artifact titles and comments
as untrusted — rather than splicing sibling text bare into `toolOk`.

---

## 4. Webapp exclusion — the concrete mechanism

1. `estate: boolean` on `McpToolCatalogEntry` (`mcp-tool-impls.ts:2371-2376`)
   + an `_meta` estate marker on the tool definitions (riding `tools/list` to
   `McpPage.tsx`, which bypasses the catalog).
   The flag gates **six** surfaces from that one place (confirmed by a
   follow-up repo-wide sweep): `handleWellKnown:2781`,
   `handleCapabilities:3055`, `handleSkillsIndex:3348` (the
   `/.well-known/{skills,agent-skills}/index.json` axis-mcp skill — full
   derived catalog), `handleDocsMd:3432` (`/v1/docs.md` — every tool name,
   derived), `handleForAgents:3617+3776`, and the count-honesty tests
   policing README + ForAgentsPage. All agent-facing among them inherit
   estate entries with **zero manual edits**. Exactly two surfaces bypass
   the catalog and need their own handling: `llms.txt` (`handlers.ts:3089`
   reads `MCP_TOOLS` directly — agent-facing, so estate tools flow there
   anyway; no exclusion needed, just know the mechanism differs) and
   `McpPage.tsx:277` (live `tools/list` → the `_meta` marker + client
   filter above).
2. Human surfaces filter; agent surfaces keep everything.
3. Guards pin the split **both directions** (present in agent surfaces,
   absent from human surfaces) — derived from the flag, never a hand-list.
4. **Complete guard inventory for the count change** (verification closed a
   gap here — two guards beyond the obvious ones break the moment human copy
   diverges from `MCP_TOOL_COUNT`):
   `counts-consistency.test.ts:22-24` (`MCP_TOOL_COUNT === MCP_TOOLS.length`);
   `count-honesty.test.ts:130-135` (ForAgentsPage completeness — becomes
   non-estate-derived); `count-honesty.test.ts:263-264` (**pins web
   `TOOL_COUNT === MCP_TOOL_COUNT` outright** — must change under any split
   copy); `count-honesty.test.ts:59-62` (**the toolClaims sweep over README,
   index.html, examples, and every `.tsx` under apps/web/src** — any rendered
   non-estate count anywhere in web copy fails CI until the extractor/corpus
   is taught the split). est_02 names all four so none arrives as surprise
   red CI mid-cascade. Count-copy semantics decision at §5.3.

---

## 5. Open decisions (owner) and standing gates

| # | Decision / gate | Blocking |
|---|---|---|
| 1 | **TrustFabric naming + definition**: directive says tf.trustfabric.ai (NXDOMAIN); registry says tf.jonathanarvay.com (resolves) + paid.trustfabric.ai (also under `paid` — data quirk). Which is canonical, and what is the property? | est_08 |
| 2 | Margin policy on Foundry proxies (proposal: cost+10%, whole cents) | est_04 pricing |
| 3 | ~~Count-copy semantics~~ **DECIDED 2026-08-22, in est_02 itself** (owner-overridable): derived non-estate count, not "N Iliad + M estate" — the human webapp's TOOL_COUNT excludes estate tools entirely rather than disclosing a count of them, since surfacing ANY estate number on the excluded surface is in tension with "excluded from the webapp" (§Interpretation). All four §4.4 guards updated to match. | ~~est_02~~ resolved |
| 4 | safebrowse.io categorization check for jonathanarvay.com | Crawlability of half the estate |
| 5 | ~~PAI'D exposable-surface decision~~ **ANSWERED 2026-08-22** (§2c: three read tools now; execute_payment on their COH-009 trigger; top-up/checkout struck) | ~~est_06~~ resolved |
| 6 | Which wallet Iliad uses to pay Foundry (custody design proceeds regardless, §3.5) | est_04 execution |
| 7 | Add `axis_launch` to `known_repos` (formalizing the channel it already uses informally)? | est_07 |
| 8 | **`ALERT_WEBHOOK_URL`** — deferred for Iliad alone as accepted risk; federation multiplies the blast radius to *paid cross-app calls failing silently*. Re-raised as a federation prerequisite. | est_04+ |

Standing laws honored: sibling repos change only via inter-repo tickets;
`blocked_candidate_law` (exact failing check + unblock condition on every
blocker); count-honesty cascade on every tool addition; authorize/capture for
all external calls; no customer-credential brokering in v1.

---

## 6. Health & monitoring (new section — verification finding, high)

Nothing in this estate pages today (`alerting.ts:96-102` no-ops without
`ALERT_WEBHOOK_URL`; owner-accepted for Iliad alone). Federation changes the
calculus: a dead sibling means **paid** proxy calls failing and
`discover_estate_tools` advertising a corpse at the estate's front door
indefinitely, since registry `status` is a hand-set constant. Minimum
shipped with est_04, not after:
- A sibling **liveness probe** (existing `live-probe` pattern) feeding a
  runtime health overlay on registry rows; `discover_estate_tools` and
  `axis-estate.json` report `status` + `last_checked` honestly.
- A **circuit breaker** on proxy dispatch: after N consecutive failures the
  proxy fast-fails with the `_estate_unavailable` envelope (no charge, no
  full-timeout burn) until a probe succeeds.
- Cross-app failures logged with a dedicated event so they are *visible*
  even before anything pages; §5.8 re-raises paging itself.

---

## 7. Execution: candidates, tickets, and de-rollout

Candidates land in `begin.yaml` as `est_01..est_08` (scored per `roi_policy`;
est_01 carries the `portfolio_leverage_multiplier`). Dependency edges are
explicit — verification caught one that was silently missing:

- **est_01** — estate registry module (in **generator-core**, §Layer 1) +
  `/.well-known/axis-estate.json` (versioned) + `discover_estate_tools`
  (free) + surface folds + `ecosystem.registry.yaml` honesty fix (all §1.2.1
  references) + `sibling_process`↔registry guard. Unblocks all.
- **est_02** — estate flag + webapp-exclusion split + all four §4.4 guards +
  count cascade + **rewriting the four §1.2.4 doctrine surfaces**.
- **est_03** — `PLANNED_CAPABILITIES` estate stubs. **Depends est_02** (the
  ForAgentsPage guard would otherwise force stubs onto the human page).
- **est_04** — Foundry Wave-1 proxies + credential custody (§3.5) + health
  probe/circuit breaker (§6). Ticket-gated on auth + blessing.
- **est_05** — Foundry Wave-2 (R2 URL handoff w/ SSRF constraint) + Wave-3
  (idempotency-gated per §3.3; new compensation wiring). Depends est_04.
- **est_06** — PAI'D surface per their ticket answer + their L3 kit.
- **est_07** — Launch reciprocal links. Executable now via peer channel;
  decision §5.7 is the only open item — a
  required-architectural-decision block, not an owner gate.
- **est_08** — TrustFabric. Blocked: §5.1 (checks recorded 2026-08-22:
  tf.trustfabric.ai NXDOMAIN; tf.jonathanarvay.com resolves,
  filter-blocked from the dev machine; unblocks on owner naming + definition).

**De-rollout** (verification: rollout had no inverse): retiring a shipped
estate tool converts it to a `PLANNED_CAPABILITIES`-style tombstone envelope
(name keeps answering `tools/list` callers honestly for one deprecation
window, pointing at the direct sibling endpoint or the retirement reason)
before deletion pays the downward count cascade. A sibling going dark
long-term flips its registry `status` — surfaces update automatically.

**Tickets — FILED 2026-08-22** (both inboxes; matching entries in this repo's
own outbox per `notify_protocol`, so the providers have a write-back target):
- `TICKET-AXIS_TOOLBOX-estate-federation-20260822` → Foundry: idempotent
  submission + job-lookup-by-client-reference (the §3.3 window — first ask);
  machine-readable price manifest (§3.2); server-to-server auth for
  `api.avatar.jonathanarvay.com/mcp`; URL inputs **constrained to estate R2
  presigned URLs** (§2b); rate-limit expectations for a single hot Iliad
  credential (noisy-neighbor + 429 mapping); registry publication per their
  runbook; estate cross-link once `axis-estate.json` is live.
- `TICKET-AXIS_TOOLBOX-agent-surface-20260822` → PAI'D: **ANSWERED same day,
  status confirmed** — see §2c for the blessed/conditional/struck sets, the
  outbox ticket for the full reply, and est_01 for the registry-wide
  authoring-time liveness check their reply's flag added to our scope (our
  mcp_url claim being true was luck, not verification). Their discovery kit
  is queued on their side.

---

*Written and adversarially verified 2026-08-22 (3-lens workflow; all
confirmed findings incorporated — including the §1.2.4 doctrine-inversion
correction, the §3.2/§3.3 money-integrity gaps, and the §6 monitoring
section). Live-probe claims are same-day network observations; re-probe to
re-verify. This document states no global artifact counts; tool counts and
prices cited are point-in-time and guarded elsewhere.*
