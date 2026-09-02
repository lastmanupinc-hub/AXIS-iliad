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
   `buildMcpPaymentRequiredError`) behaves exactly as it always has. **The
   code default and the live production value are different questions** —
   `render.yaml` (Blueprint-managed, autoSync) has pinned this flag to
   `"true"` since 2026-07-06, so the deployed prod service runs with in-band
   settlement ON. Confirm current live state via Render's own API before
   trusting either this doc or `render.yaml` as current truth — dashboard
   overrides can diverge from the blueprint. **Ship changes to this chain in
   staging with the flag ON before touching production's value.**
2. **Method + tool-name shape.** Must be `tools/call` with a string `name`.
3. **Lite-mode caps** (`applyLiteCaps`, `lite-caps.ts`). A call the cap table
   REJECTS never reaches this gate's charge logic — dispatch returns the
   rejection with nothing charged and the Idempotency-Key (if any) left
   unclaimed, so a corrected retry can reuse it.
4. **`decideInbandGate(tool, args, mode)`** (`mcp-tool-impls.ts`) must return
   `{settle: true}`. This is the single scope authority: `free_op` (billing
   depends on `args`/`mode` and this call is free), `not_provisioned` (the
   backend env isn't configured — the real `runX` would return
   `_not_configured` without charging), `runtime_metered` (billability is only
   knowable from a post-run probe — 5 tools stay on plan-credit metering,
   incl. `iliad_web_research_crawl` since cycle 24: its price is per-page and
   the pre-dispatch preview can't know the page count), and `not_in_scope`
   (free/discovery tools, unknown names) all fall through.
5. **Auth.** `auth.account` must resolve (a real API key). Anonymous falls
   through to dispatch's normal free/limit path — the in-band gate never
   collects cash from an unauthenticated caller.
6. **Idempotency claim** (`gateIdempotency`). A replay or hash-mismatch never
   re-charges; an `in_progress` claim returns a retryable "already processing"
   error without charging. Only a fresh `claimed` outcome proceeds.
7. **`previewMcpToolOverage` → `overageCents > 0`.** A call fully covered by
   included plan credits ($0 overage) falls through — dispatch meters it via
   plan credits, exactly as an uncharged call always has. **This is also why
   `ping_payment` (Phase 1) cannot reuse this chain**: it is intentionally
   $0 on every call, so it would never reach step 8 through this path. See
   "The probe's own gate" below.
8. **`settleOverageCash`** (`cashier.ts`) — the shared cash-collection tail
   (also used by the REST cashier). In order:
   - `overageCents <= 0` → `{status: 200}`, nothing owed (dead code on this
     path given step 7, but the function itself is reused by the REST
     cashier where the caller doesn't pre-filter).
   - 5th-call-free pool → `{status: 200}`, a referral free call consumed.
   - `PAID_WALLET_MODE != "off"` and PAI'D configured → attempt the wallet
     rail (`settleOverageViaPaidWallet`): a debit success is `{status: 200}`;
     insufficient credits or an ambiguous PAI'D error is `{status: 402}`
     (this is the FIRST point a real 402 can be written to `res`); `read`/
     `shadow` modes, or `enforce` with the wallet call itself unreachable,
     fall through to the next bullet instead of returning here.
   - `chargeMpp` (mppx: Tempo USDC + Stripe SPT, whichever the client's
     `Accept-Payment` header or the server's rail preference selects) — a
     real payment-rail challenge/settle round trip. `{status: 402}` writes
     the actual x402 `WWW-Authenticate: Payment ...` challenge; `{status:
     200}` sets the `Payment-Receipt` header. `null` (no `STRIPE_SECRET_KEY`
     at all) means the rail isn't configured — the in-band gate itself
     returns `false` and dispatch throws its own normal 402-negotiation
     instead (a DIFFERENT 402 body than this gate would have written).
9. **Credential accepted** → `markInbandSettled(req, overageCents)` → the
   in-band gate returns `false` (nothing written to `res` yet) → `dispatch`
   runs the tool for real → `captureMcpToolCredits` sees the `settled: true`
   marker and draws down included credits for analytics without charging
   twice (the cash side is recorded separately, in `payment_receipts` or —
   as of Phase 0 — a `payment_funnel_events` challenge row when a 402 was
   written instead).

## The probe's own gate (ping_payment, Phase 1 — NOT part of the chain above)

`ping_payment` never touches `decideInbandGate`, `settleOverageCash`,
`chargeMpp`, or any real payment rail — a genuine $0 charge is meaningless to
those rails (Stripe rejects zero-amount PaymentIntents; a 0-FC wallet debit is
a no-op), and the whole point of the probe is to be safely retriable with
nothing of value at stake. Its own gate, in `runPingPayment`
(`mcp-tool-impls.ts`), is exactly one check: does `Authorization` carry
something other than the normal `Bearer <api_key>` scheme (the same signal a
real MPP retry sends — see mpp.ts's file header and `billing.ts`'s
`resolveAuth`)? No → write the challenge (reusing the real
`build402NegotiationBody` shape, so the vocabulary is identical to every real
paid tool's 402). Yes → settle at $0, unconditionally, for any caller —
including fully anonymous ones — and record the event to
`payment_funnel_events` either way.

## Env flags

| Flag | Default | Effect |
|---|---|---|
| `AXIS_MCP_INBAND_SETTLEMENT` | off in code (unset/anything but `"true"`/`"1"`) — **but `render.yaml` has pinned it to `"true"` in prod since 2026-07-06**; verify live state via Render's API, don't trust this table alone | Master switch for the whole ordered chain above. **Ship staging-first**: flip it on in a non-production environment, watch `GET /v1/stats`'s `x402_challenges_issued`/`paid_settlements` (Phase 0) move as expected, before touching production. |
| `PAID_WALLET_MODE` | `off` | `off` / `read` / `shadow` / `enforce` — see `docs/MCP_PAID_ACCESS_DESIGN.md`'s phased rollout section for the full detail; only relevant when `AXIS_MCP_INBAND_SETTLEMENT` is also on. |
| `AXIS_PAYMENT_PROBE_ENABLED` | on (unset, or any value other than exactly `"false"`) | Operator kill-switch for `ping_payment`'s dispatch. Set to `"false"` to disable the probe (e.g. if it becomes an abuse vector — it is the one tool callable by a fully anonymous caller with zero rate-limit-relevant cost signal). Gates the tool's **behavior only**, not its catalog listing — `tools/list` still advertises `ping_payment` either way, so catalog-honesty (every tool ships what `tools/list` advertises) is unaffected; a disabled call returns a clear, non-2xx-shaped tool error explaining why, not a silent no-op. |

`AXIS_FORCE_OVERAGE_FOR_TEST_ACCOUNTS` (mentioned in the original strategy as
an optional future flag to force early overage on new test accounts, so the
first real paid call demonstrates the loop immediately) is **not implemented**
— tracked here as a known future option, not built in this phase.

## Circle / W3S key-network mismatch guard — OUT OF SCOPE for this repo

The strategy this phase implements describes a `CIRCLE_DEFAULT_BLOCKCHAIN`
config check refusing a LIVE key against a testnet (or vice versa) before
calling Circle's W3S API. **No Circle/W3S client code, and no Go backend of
any kind, exists anywhere in this repository** (`axis-iliad` / AXIS Toolbox)
— confirmed by search. That guard belongs in PAI'D's own separate repository
(*redacted 2026-09-02: this section previously named PAI'D's internal file
paths and a Circle error code — see `docs/MCP_PAID_ACCESS_DESIGN.md` for the
current, redacted summary of what that investigation found*) — it is not
something this repo can or should implement.
This repo's own on-chain rail is Tempo/USDC via `mppx` (`TEMPO_RECIPIENT_ADDRESS`
/ `TEMPO_TESTNET` in `mpp.ts`), not Circle — there is no equivalent
mainnet/testnet key-mismatch class of bug possible here today, since Tempo's
network selection is a single boolean env var read server-side, never a
caller-supplied key whose "live-ness" could disagree with it. Building Circle
guard code in this repository would not close the gap the strategy describes;
it would need to happen in PAI'D's own repo, against its own config layer.
