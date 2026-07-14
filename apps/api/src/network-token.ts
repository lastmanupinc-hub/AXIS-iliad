// ─── iliad_network_tokenization — owned network-token capability ─
//
// WO-14: backs the "VTS/MDES network tokenization" claim with real,
// independently-testable parts instead of descriptive markdown:
//
//   (A) an EXECUTABLE token-lifecycle state machine (pure functions,
//       no I/O) — provision → activate → suspend → resume → delete,
//       illegal transitions throw;
//   (B) a Stripe network-token READ adapter — the buildable-live
//       default. Stripe auto-provisions network tokens on accounts
//       where the (limited-access) Network Tokens feature is enabled;
//       this adapter reads the PaymentMethod via the operator's
//       STRIPE_SECRET_KEY and maps it to a provider-agnostic
//       NetworkToken. Injectable fetch keeps it hermetically testable;
//   (C) direct VTS/MDES provisioning behind a capability gate that
//       returns a structured `_not_configured` envelope until network
//       onboarding exists.
//
// HONESTY (load-bearing — do not soften):
//   - `is_network_token` is true ONLY when Stripe's PaymentMethod JSON
//     carries `card.network_token.used === true`. `card.networks.available`
//     is co-badging metadata present on nearly every card PM — it is NOT
//     a tokenization signal and is deliberately NOT used here, so a bare
//     card PM honestly reads false. Stripe's public API may not expose
//     network-token status at all on a given account/version; in that
//     case this adapter honestly reports false rather than guessing.
//   - Direct VTS (Visa Token Service) / MDES (Mastercard Digital
//     Enablement Service) provisioning requires a network-issued Token
//     Requestor ID + API credentials (onboarding no code can perform).
//     Setting AXIS_VTS_TOKEN_REQUESTOR_ID / AXIS_MDES_TOKEN_REQUESTOR_ID
//     flips the capability flag, but no live VTS/MDES client ships in
//     this build — the provision path NEVER fakes a token; it returns a
//     structured envelope naming the remaining external gate.
//
// Mirrors the llm-inference.ts owned-capability template: a config gate
// (tokenizationCapabilities) + a structured `_not_configured` envelope.

// ─── (A) Executable lifecycle state machine (pure, no I/O) ───────

export type TokenState = "provisioned" | "active" | "suspended" | "deleted";
export type TokenEvent = "provision" | "activate" | "suspend" | "resume" | "delete";
export type TokenProvider = "stripe" | "vts" | "mdes";

export const TOKEN_EVENTS: readonly TokenEvent[] = ["provision", "activate", "suspend", "resume", "delete"];

// Legal transitions ONLY:
//   provision: (none)      -> provisioned
//   activate : provisioned -> active
//   suspend  : active      -> suspended
//   resume   : suspended   -> active
//   delete   : provisioned|active|suspended -> deleted   (deleted is terminal)
export function isLegalTransition(from: TokenState | null, event: TokenEvent): boolean {
  switch (event) {
    case "provision":
      return from === null;
    case "activate":
      return from === "provisioned";
    case "suspend":
      return from === "active";
    case "resume":
      return from === "suspended";
    case "delete":
      return from === "provisioned" || from === "active" || from === "suspended";
    default:
      return false;
  }
}

/** Apply a lifecycle event. Throws on any illegal transition (deleted is terminal). */
export function applyTokenEvent(from: TokenState | null, event: TokenEvent): TokenState {
  if (!isLegalTransition(from, event)) {
    throw new Error(`network-token lifecycle: illegal transition '${event}' from state '${from ?? "(none)"}'`);
  }
  switch (event) {
    case "provision":
      return "provisioned";
    case "activate":
      return "active";
    case "suspend":
      return "suspended";
    case "resume":
      return "active";
    case "delete":
      return "deleted";
  }
}

export interface TokenLifecycle {
  state: TokenState;
  history: Array<{ from: TokenState | null; event: TokenEvent; to: TokenState }>;
}

/** Seed a lifecycle via provision -> provisioned (history length 1). */
export function newLifecycle(): TokenLifecycle {
  return {
    state: "provisioned",
    history: [{ from: null, event: "provision", to: "provisioned" }],
  };
}

/** Pure transition — returns a NEW lifecycle; the input is never mutated. */
export function transition(lc: TokenLifecycle, event: TokenEvent): TokenLifecycle {
  const to = applyTokenEvent(lc.state, event);
  return {
    state: to,
    history: [...lc.history, { from: lc.state, event, to }],
  };
}

// ─── Provider-agnostic token record ──────────────────────────────

export interface NetworkToken {
  /** Opaque ref (Stripe pm_… or network token id). Never a PAN. */
  token_ref: string;
  provider: TokenProvider;
  /** True ONLY when a real network token is present (not a bare card PM). */
  is_network_token: boolean;
  /** "visa" | "mastercard" | … */
  network: string | null;
  last4: string | null;
  token_state: TokenState;
}

// ─── Config gate (mirrors isLlmConfigured / _not_configured) ─────

export interface NetworkTokenNotConfigured {
  _not_configured: true;
  provider_checked: TokenProvider;
  reason: string;
  remediation: string;
}

export function isNetworkTokenNotConfigured(
  r: NetworkToken | NetworkTokenNotConfigured,
): r is NetworkTokenNotConfigured {
  return "_not_configured" in r && r._not_configured === true;
}

/** Which providers are configured right now (env-derived, no I/O). */
export function tokenizationCapabilities(): { stripe: boolean; vts: boolean; mdes: boolean } {
  return {
    stripe: !!process.env.STRIPE_SECRET_KEY,
    vts: !!process.env.AXIS_VTS_TOKEN_REQUESTOR_ID,
    mdes: !!process.env.AXIS_MDES_TOKEN_REQUESTOR_ID,
  };
}

// ─── (B) Stripe adapter — buildable-live default path ────────────

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

interface StripePaymentMethodJson {
  id?: string;
  card?: {
    brand?: string;
    last4?: string;
    network_token?: { used?: boolean };
    networks?: { available?: string[] };
  };
}

/**
 * Read a Stripe PaymentMethod and map it to a provider-agnostic NetworkToken.
 * Live path: GET https://api.stripe.com/v1/payment_methods/{id} with the
 * operator's STRIPE_SECRET_KEY. Injectable fetch keeps tests hermetic.
 *
 * `is_network_token` maps STRICTLY from `card.network_token.used === true`.
 * `card.networks.available` (co-badging metadata) is intentionally ignored —
 * it exists on nearly every card PM and would fabricate an always-true signal.
 */
export async function readStripeNetworkToken(
  paymentMethodId: string,
  deps?: { fetchImpl?: FetchLike; secretKey?: string },
): Promise<NetworkToken | NetworkTokenNotConfigured> {
  if (typeof paymentMethodId !== "string" || paymentMethodId.trim().length === 0) {
    throw new Error("readStripeNetworkToken: paymentMethodId must be a non-empty string");
  }
  const secretKey = deps?.secretKey ?? process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return {
      _not_configured: true,
      provider_checked: "stripe",
      reason: "STRIPE_SECRET_KEY is not set — the Stripe network-token read adapter has no key to call the Stripe API with.",
      remediation:
        "Set STRIPE_SECRET_KEY (the same env the billing integration already uses). " +
        "Note: reading a real provisioned network token additionally requires Stripe's " +
        "limited-access Network Tokens feature to be enabled on the account; without it " +
        "this adapter honestly reports is_network_token: false for bare card PaymentMethods.",
    };
  }

  const fetchImpl = deps?.fetchImpl ?? (fetch as FetchLike);
  // H8.1 WAIVER: no client-side AbortController/timeout. Tracked as H8.1b.
  const res = await fetchImpl(`https://api.stripe.com/v1/payment_methods/${encodeURIComponent(paymentMethodId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${secretKey}`, "Stripe-Version": "2026-06-24.dahlia" }, // H0.4: pin the API version
  });
  if (!res.ok) {
    throw new Error(`readStripeNetworkToken: Stripe payment_methods read failed (${res.status})`);
  }
  const pm = (await res.json()) as StripePaymentMethodJson;
  const card = pm.card;
  return {
    token_ref: typeof pm.id === "string" && pm.id.length > 0 ? pm.id : paymentMethodId,
    provider: "stripe",
    // STRICT mapping — see module header. A bare card PM is not a network token.
    is_network_token: card?.network_token?.used === true,
    network: typeof card?.brand === "string" ? card.brand : null,
    last4: typeof card?.last4 === "string" ? card.last4 : null,
    token_state: "active",
  };
}

// ─── (C) Direct VTS/MDES — capability-gated, never fakes a token ─

const PROVIDER_GATES: Record<Exclude<TokenProvider, "stripe">, { envVar: string; networkName: string; serviceName: string }> = {
  vts: { envVar: "AXIS_VTS_TOKEN_REQUESTOR_ID", networkName: "Visa", serviceName: "VTS (Visa Token Service)" },
  mdes: { envVar: "AXIS_MDES_TOKEN_REQUESTOR_ID", networkName: "Mastercard", serviceName: "MDES (Mastercard Digital Enablement Service)" },
};

/**
 * Provision a network token. Provider "stripe" delegates to the read adapter
 * (Stripe provisions tokens itself — there is nothing for us to provision).
 * Providers "vts"/"mdes" are capability-gated: without the Token Requestor ID
 * env they return `_not_configured` naming the exact env var; WITH it they
 * STILL return a structured envelope naming the remaining external gate
 * (network API credentials + onboarding — no live VTS/MDES client ships in
 * this build), because fabricating a token would be dishonest.
 */
export async function provisionNetworkToken(
  input: { pan_source: string; provider: TokenProvider },
): Promise<NetworkToken | NetworkTokenNotConfigured> {
  if (!input || typeof input !== "object") {
    throw new Error("provisionNetworkToken: input object required");
  }
  const { pan_source, provider } = input;
  if (provider !== "stripe" && provider !== "vts" && provider !== "mdes") {
    throw new Error("provisionNetworkToken: provider must be one of stripe | vts | mdes");
  }
  if (typeof pan_source !== "string" || pan_source.trim().length === 0) {
    throw new Error("provisionNetworkToken: pan_source must be a non-empty string (an opaque reference such as a Stripe pm_… id — NEVER a raw PAN)");
  }

  if (provider === "stripe") {
    return readStripeNetworkToken(pan_source);
  }

  const gate = PROVIDER_GATES[provider];
  const requestorId = process.env[gate.envVar];
  if (!requestorId) {
    return {
      _not_configured: true,
      provider_checked: provider,
      reason: `Direct ${gate.serviceName} provisioning requires a ${gate.networkName}-issued Token Requestor ID, and ${gate.envVar} is not set.`,
      remediation:
        `Complete ${gate.networkName} network onboarding to obtain a Token Requestor ID, then set ${gate.envVar}. ` +
        `Until then, use provider "stripe" — the adapter reads network tokens Stripe already provisions, ` +
        `which also keeps raw PANs (and PCI-DSS scope) out of this service.`,
    };
  }
  // Capability flag is set, but the external gate remains: a live VTS/MDES
  // client (network API credentials + certified integration) does not ship in
  // this build. Never fabricate a token — name the remaining gate instead.
  return {
    _not_configured: true,
    provider_checked: provider,
    reason:
      `${gate.envVar} is set, but direct ${gate.serviceName} provisioning additionally requires ` +
      `${gate.networkName} API credentials and certified network onboarding — no live ${provider.toUpperCase()} client ships in this build.`,
    remediation:
      `Finish ${gate.networkName} onboarding (API credentials for your configured Token Requestor ID) ` +
      `and integrate the certified client, or use provider "stripe" to read tokens Stripe already provisions.`,
  };
}
