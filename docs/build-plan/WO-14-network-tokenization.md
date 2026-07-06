# WO-14 · network-tokenization

**Claim it makes true:** visa_compliance_kit: "VTS/MDES network tokenization".

**Tier:** B_client_external_gated · **Effort:** L · **Package:** apps/api (owned capability + MCP tool) and packages/generator-core (evidence honesty + E9 artifact via apps/api/src/commerce-integration.ts)

**Verify verdict:** implementable_by_sonnet5=`False` · fully_closes_claim=`False` · confidence=`high`
**Missing for codeability:** The pure-software parts (lifecycle state machine A, capability gate, _not_configured envelope, MCP tool impl) are precisely specified and an agent could make them compile and pass the listed tests. But literal adherence to the spec yields wrong/dishonest output, and correct completion needs design judgment the spec doesn't supply: (1) The CLAUDE.md file target is wrong -- the visa_compliance_kit/'VTS+MDES' string is in the PARENT No Fate Platform/CLAUDE.md (axis-odyssey), not AXIS Toolbox/CLAUDE.md; the agent must locate the real claim surface (also the generated markdown at generators-agentic-purchasing.ts:571/990/1139). (2) MCP registration requires editing mcp-server.ts (import :50 + switch/case dispatch :308), which is NOT in the files list. (3) The named test file mcp-tools.test.ts does not exist; the tool count 29->30 must be updated in counts.ts and ~6 hardcoded '29' literals in mcp-server.test.ts (incl. a test-title string), not the file the spec names. (4) Wiring emitStripeNetworkTokenAdapter into buildCommerceIntegrationBundle (as target_state demands) breaks commerce-integration.test.ts:127's toEqual(5-artifact) assertion whose fixture already carries a stripe signal -- undisclosed. (5) Most importantly, the agent must decide what to do about Stripe not exposing network-token status, since the specified field mapping is factually incorrect (see spec_overclaims).
**Spec overclaims flagged:** Part (B) 'buildable-live default that reads the network token Stripe already provisions': Stripe's public PaymentMethod API does not expose network-token status/DPAN. card.network_token.used is not a documented Stripe field, and card.networks.available is co-badging metadata present on nearly every card PM -- not a tokenization signal. The specified mapping is always-false (first leg) or always-true (second leg) against real Stripe, so 'is_network_token set correctly' is unachievable via this path.; 'fully exercisable in tests via injectable fetch' -- the tests stub a fabricated response shape the author invented, so green tests are circular and prove nothing about live Stripe behavior.; files list omits mcp-server.ts (dispatch wiring) and names a non-existent mcp-tools.test.ts; acceptance #8's 'no drift -> CI green' hides that the count is pinned across counts.ts + ~6 literals in mcp-server.test.ts.; acceptance #11 claims to update the visa_compliance_kit string in AXIS Toolbox/CLAUDE.md, but that string is not in that file -- editing it would not touch the claim being remediated.; The framing that this makes 'VTS/MDES network tokenization' honestly true overstates it: VTS and MDES both remain gated (return _not_configured, no live tokenization), so the claim is reframed/weakened, not fulfilled -- and even the 'stripe=live' leg it leans on does not actually read a network token.
**Hidden external gates:** Stripe does not expose network-token provisioning status or the DPAN on the public PaymentMethod object; Stripe Network Tokens is an opaque/internal, account-feature-gated (limited-access) product -- so even with a live STRIPE_SECRET_KEY and a tokenized PM, the adapter cannot read the field it targets. The spec's gate #4 understates this as merely needing 'a real key + a PM with a network token'.; Direct VTS requires a Visa-issued Token Requestor ID + VTS API credentials (network onboarding) -- correctly listed.; Direct MDES requires a Mastercard Token Requestor ID + MDES credentials -- correctly listed.; Direct PAN provisioning pulls the operator into PCI-DSS scope -- correctly listed, but this is exactly why the 'safe' Stripe path is offered, and that Stripe path doesn't actually surface a network token, so the honest capability delivered is a lifecycle state machine + a card-metadata reader, not network tokenization.

## Current state
The "VTS/MDES network tokenization" claim (CLAUDE.md visa_compliance_kit + generated agentic-purchasing markdown) is descriptive-only. No tokenization client, no executable lifecycle state machine, no VTS/MDES adapter, no Stripe-network-token adapter exist. What exists: (1) `has_network_tokenization` is a pure regex heuristic over repo files at packages/generator-core/src/generators-agentic-purchasing.ts:77 and :110 (pattern `network.?token|dpan|fpan|token.?requestor|mdes|vts`), defaulting false at :52; it only renders markdown ("token patterns found"/"not detected") and one compliance-check row at :125. (2) The "token lifecycle" (provision/activate/suspend/resume/delete) is a JSON string literal embedded inside markdown (:374-380, :969-990) -- not code. (3) commerce-integration.ts (apps/api/src/commerce-integration.ts:1-27) is the E9 deployable-artifact seam: pure `(ContextMap, CommerceSignals) => CommerceArtifact[]`, wired to the customer's own PAI'D. (4) Real payment code is apps/api/src/mpp.ts:71-84 (`stripe.charge({ paymentMethodTypes:["card","link"] })` via mppx) and apps/api/src/stripe.ts (webhook/checkout); neither provisions or reads network tokens. (5) The owned-capability template is apps/api/src/llm-inference.ts -- `isLlmConfigured()` gate + `_not_configured` envelope, tool registered in mcp-tools.ts:1004 and wired in mcp-tool-impls.ts:629 (`runLlmInference`, import at :29-33).

## Target state (== the claim is literally true)
A real network-tokenization module exists with three parts, each independently testable: (A) an executable lifecycle state machine (provisioned->active->suspended->resume->active->deleted) as pure transition functions that throw on illegal transitions; (B) a Stripe-network-token adapter -- the BUILDABLE-LIVE default -- that reads the network token Stripe already provisions, via a live `GET https://api.stripe.com/v1/payment_methods/{id}` call (STRIPE_SECRET_KEY, already an env in the repo) and maps `card.network_token` / `card.networks` into a provider-agnostic `NetworkToken` with `is_network_token` set correctly; (C) direct VTS/MDES provisioning behind a capability flag that returns a structured `_not_configured` envelope (naming the required Token Requestor ID) until `AXIS_VTS_TOKEN_REQUESTOR_ID` / `AXIS_MDES_TOKEN_REQUESTOR_ID` are set. Mirror the llm-inference owned-capability template exactly: `tokenizationCapabilities()` gate + `_not_configured` envelope. Register an `iliad_network_tokenization` MCP tool (mcp-tools.ts descriptor + mcp-tool-impls.ts impl) that exposes read + lifecycle. Additionally, commerce-integration.ts emits a generated Stripe-network-token adapter artifact into the E9 engineer bundle when a Stripe signal is present, so the customer gets deployable code wired to their own account. The claim becomes true as: "network-tokenization client + executable lifecycle state machine + live Stripe-network-token adapter, with direct VTS/MDES behind a capability flag." The CLAUDE.md/kit JSON string is updated so it no longer implies unconditional live VTS+MDES. TIER NOTE (B): (A) is pure-software buildable now; (B) is the buildable-live default (Stripe auto-provisions network tokens; STRIPE_SECRET_KEY is already a repo env) and is fully exercisable in tests via injectable fetch; (C) is honestly gated behind a Token Requestor ID capability flag and returns a structured _not_configured envelope until onboarding exists.

## Files to create / edit
- apps/api/src/network-token.ts
- apps/api/src/network-token.test.ts
- apps/api/src/mcp-tools.ts
- apps/api/src/mcp-tool-impls.ts
- apps/api/src/commerce-integration.ts
- packages/generator-core/src/generators-agentic-purchasing.ts
- apps/api/src/mcp-tools.test.ts
- c:/Users/lastm/No Fate Platform/AXIS Toolbox/CLAUDE.md

## Interfaces
```ts
```typescript
// apps/api/src/network-token.ts  -- NEW. Mirrors llm-inference.ts owned-capability template.

export type TokenState = "provisioned" | "active" | "suspended" | "deleted";
export type TokenEvent = "provision" | "activate" | "suspend" | "resume" | "delete";
export type TokenProvider = "stripe" | "vts" | "mdes";

// ── (A) Executable lifecycle state machine (pure, no I/O) ──
// Legal transitions ONLY:
//   provision: (none)     -> provisioned
//   activate : provisioned-> active
//   suspend  : active     -> suspended
//   resume   : suspended  -> active
//   delete   : provisioned|active|suspended -> deleted   (deleted is terminal)
export function isLegalTransition(from: TokenState | null, event: TokenEvent): boolean;
export function applyTokenEvent(from: TokenState | null, event: TokenEvent): TokenState; // throws Error on illegal
export interface TokenLifecycle {
  state: TokenState;
  history: Array<{ from: TokenState | null; event: TokenEvent; to: TokenState }>;
}
export function newLifecycle(): TokenLifecycle;                       // seeds via provision -> provisioned
export function transition(lc: TokenLifecycle, event: TokenEvent): TokenLifecycle; // pure; returns new lc

// ── Provider-agnostic token record ──
export interface NetworkToken {
  token_ref: string;              // opaque ref (Stripe pm_… or network token id)
  provider: TokenProvider;
  is_network_token: boolean;      // true only when a real network token is present (not a bare card PM)
  network: string | null;         // "visa" | "mastercard" | …
  last4: string | null;
  token_state: TokenState;
}

// ── Config gate (mirror isLlmConfigured/_not_configured) ──
export interface NetworkTokenNotConfigured {
  _not_configured: true;
  provider_checked: TokenProvider;
  reason: string;
  remediation: string;
}
export function tokenizationCapabilities(): { stripe: boolean; vts: boolean; mdes: boolean };
// stripe = !!STRIPE_SECRET_KEY; vts = !!AXIS_VTS_TOKEN_REQUESTOR_ID; mdes = !!AXIS_MDES_TOKEN_REQUESTOR_ID

// ── (B) Stripe adapter -- BUILDABLE-LIVE default path ──
// Injectable fetch keeps it testable without a live key or a new dep (default = global fetch).
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export async function readStripeNetworkToken(
  paymentMethodId: string,
  deps?: { fetchImpl?: FetchLike; secretKey?: string },
): Promise<NetworkToken | NetworkTokenNotConfigured>;
// Maps Stripe PM JSON: card.network_token?.used===true OR card.networks?.available -> is_network_token,
// card.brand -> network, card.last4 -> last4, id -> token_ref, token_state="active".
// No STRIPE_SECRET_KEY -> { _not_configured:true, provider_checked:"stripe", … }.

// ── (C) Direct VTS/MDES -- gated behind capability flag ──
export async function provisionNetworkToken(
  input: { pan_source: string; provider: TokenProvider },
): Promise<NetworkToken | NetworkTokenNotConfigured>;
// provider "vts"/"mdes" with no *_TOKEN_REQUESTOR_ID -> _not_configured whose remediation
// names "Token Requestor ID" and the env var. provider "stripe" delegates to readStripeNetworkToken.

// apps/api/src/mcp-tool-impls.ts -- NEW impl, registered like runLlmInference (:629)
export async function runNetworkTokenization(
  args: Record<string, unknown>, req: IncomingMessage,
): Promise<string>; // JSON string; requires auth; returns _not_configured envelope when no provider configured.

// apps/api/src/commerce-integration.ts -- extend existing CommerceArtifact[] builder
// Add: emitStripeNetworkTokenAdapter(ctx: ContextMap, signals: CommerceSignals): CommerceArtifact | null
// Returns a deployable .ts adapter (reads customer's own Stripe PM network token) only when
// signals.detected_providers includes "stripe"; otherwise null.
```
```

## Acceptance tests (DONE == claim true)
- apps/api/src/network-token.test.ts: `applyTokenEvent(null,'provision')` === 'provisioned'; the full path provision->activate->suspend->resume->delete yields states provisioned,active,suspended,active,deleted; and `transition(newLifecycle(),'delete')` sets state 'deleted' with history length 2.
- network-token.test.ts: every illegal transition throws -- `applyTokenEvent('deleted','activate')`, `applyTokenEvent('provisioned','resume')`, `applyTokenEvent('active','activate')`, `applyTokenEvent(null,'activate')` each `expect(() => …).toThrow()`; `isLegalTransition` returns false for the same.
- network-token.test.ts: with STRIPE_SECRET_KEY unset, `readStripeNetworkToken('pm_x')` resolves to `{_not_configured:true, provider_checked:'stripe'}`; with a stubbed `fetchImpl` returning `{id:'pm_1',card:{brand:'visa',last4:'4242',network_token:{used:true}}}` and secretKey set, it resolves to `{token_ref:'pm_1',provider:'stripe',is_network_token:true,network:'visa',last4:'4242',token_state:'active'}`.
- network-token.test.ts: with a stubbed Stripe PM lacking network_token/networks, `readStripeNetworkToken` returns `is_network_token:false` (honest -- a bare card PM is not a network token).
- network-token.test.ts: `provisionNetworkToken({pan_source:'x',provider:'vts'})` with AXIS_VTS_TOKEN_REQUESTOR_ID unset returns `_not_configured` whose `remediation` matches /Token Requestor ID/ and names AXIS_VTS_TOKEN_REQUESTOR_ID; same for 'mdes'.
- network-token.test.ts: `tokenizationCapabilities()` returns `{stripe:false,vts:false,mdes:false}` with all envs unset, and reflects each flag true when its env is set (use vi.stubEnv).
- apps/api/src/mcp-tool-impls.ts: `runNetworkTokenization` with an authed req and no provider configured returns a JSON string parseable to `_not_configured:true` with `tool:'iliad_network_tokenization'`; unauthed req throws an auth error (mirror :632).
- apps/api/src/mcp-tools.test.ts (or existing counts/consistency test): the tool descriptor `iliad_network_tokenization` is present in the tools list and the tool-count assertion is updated to match (no drift -> CI green via `npm test`).
- apps/api/src/commerce-integration.test surface: `emitStripeNetworkTokenAdapter` returns a CommerceArtifact (path ends in a .ts adapter file, content references reading `card.network_token`) when signals.detected_providers includes 'stripe', and returns null otherwise.
- `npm run build` (tsc strict) passes with zero new runtime deps; `npm test` (vitest) passes all of the above.
- CLAUDE.md visa_compliance_kit `network_tokenization` value no longer implies unconditional live VTS+MDES -- updated to reflect stripe=live, vts/mdes=capability-gated (e.g. "stripe-live+VTS/MDES-gated"); a doc-honesty/count test (if present) still passes.

## External gates (code alone can't satisfy)
- Direct VTS (Visa Token Service) requires a Visa-issued Token Requestor ID + VTS API credentials (network onboarding) -- cannot be obtained by code.
- Direct MDES (Mastercard Digital Enablement Service) requires a Mastercard Token Requestor ID + MDES credentials.
- Handling raw PANs for direct provisioning pulls the operator into PCI-DSS scope; the Stripe adapter path avoids this by reading tokens Stripe already provisioned.
- Full LIVE assertion of the Stripe adapter end-to-end needs a real STRIPE_SECRET_KEY and a PaymentMethod for which Stripe has provisioned a network token (Stripe network-tokens feature enabled on the account).

## New runtime deps (project forbids w/o discussion)
_none_

## Depends on
_none_

## Doc impact / residual honesty caveat
Makes visa_compliance_kit "VTS/MDES network tokenization" honestly true as: an executable lifecycle state machine + a live Stripe-network-token adapter, with direct VTS/MDES behind a capability flag. Residual honesty caveat that MUST remain: direct VTS/MDES provisioning is NOT live until a Token Requestor ID is configured -- the tool returns a structured _not_configured envelope until then. The CLAUDE.md kit string and any generated markdown must stop implying unconditional live VTS+MDES; state the gating explicitly (stripe live, VTS/MDES capability-gated).
