/**
 * The AXIS estate: sibling properties under the same ownership (PAI'D, AXIS
 * Foundry, AXIS Launch, TrustFabric) that Iliad makes agent-discoverable and
 * links to — owner directive 2026-08-22, full architecture in
 * docs/ESTATE_FEDERATION_STRATEGY.md. Read that doc before extending this
 * file; candidate descriptions in begin.yaml (est_01..est_08) are pointers
 * into it, not the spec.
 *
 * One typed source of truth so sibling domains/MCP endpoints/prices can't
 * drift the way ecosystem.registry.yaml did: that file claimed (in its own
 * header) to be "Consumed by Iliad discover_commerce_tools…" while being
 * read by no code at all (verified by grep before it was retired). This
 * module — plus the `/.well-known/axis-estate.json` route and the
 * `discover_estate_tools` MCP tool that serve it — replaces it.
 *
 * Deliberately excludes Iliad itself: every entry here carries
 * `webapp_surface: "agent-only"`, which is a true, load-bearing fact about
 * every SIBLING (the owner directive is specifically that siblings stay out
 * of Iliad's own human-facing webapp pages while remaining fully
 * agent-discoverable) and would be a FALSE fact if applied to Iliad's own
 * row — Iliad plainly is not agent-only within its own webapp. Iliad's own
 * domains/MCP endpoint are already fully described by its existing
 * axis.json/llms.txt/for-agents surfaces; a reciprocal-linking sibling reads
 * those, not this table, for facts about Iliad.
 *
 * `tools` is a VENDORED SNAPSHOT, not a live fetch — a live-fetch free,
 * no-auth discovery tool would put an outbound-fetch surface (SSRF /
 * availability / injection risk) behind every unauthenticated caller for no
 * benefit a point-in-time snapshot doesn't already give. `tools_source`
 * records when and from where each snapshot was taken, so staleness is
 * checkable instead of silent. Cross-repo price drift (this snapshot vs. the
 * sibling's real, live price) is a named risk (STRATEGY.md §3.2); a CI sync
 * guard against a published price manifest, and call-time verification
 * before any proxy pays out, are both future work (est_04) — this file's job
 * is to tell the truth about when it last looked, not to guarantee it never
 * drifts.
 *
 * `status` and `health.last_status` answer "is this reachable", not "does
 * the code for it exist" — the two can differ. AXIS Foundry and AXIS Launch
 * are both richly documented in their own repos, but every jonathanarvay.com
 * host (including their subdomains) is intercepted by a network filter on
 * this authoring machine (docs/ESTATE_FEDERATION_STRATEGY.md §1.4 — a real
 * finding, independently reproduced while authoring this file: a live probe
 * attempt against api.avatar.jonathanarvay.com/mcp returned a TLS handshake
 * failure, not an HTTP response). Those rows are therefore "unverified", not
 * "live" — the content is real (read directly from each sibling's own repo
 * on this machine), the network confirmation just could not complete from
 * here. Re-probe from a clean network to promote a row to "live".
 */

/** Reachability confidence for a sibling property or its MCP endpoint — see the file header. */
export type EstateStatus = "live" | "planned" | "unverified";

export type EstateMcpAuth = "none" | "bearer" | "x402";

export interface EstateMcp {
  url: string;
  transport: string;
  auth: EstateMcpAuth;
  /** The sibling's MCP registry `name` (e.g. its own server.json `name` field), when published. */
  registry_name?: string;
}

export type EstatePaymentRail = "x402-evm" | "mppx" | "paid-wallet";

export interface EstatePayment {
  rail: EstatePaymentRail;
  notes?: string;
}

export interface EstateTool {
  name: string;
  summary: string;
  price_usd: number | "free";
  /** Free text, not an enum — the estate spans more than one billing shape (flat, tiered-by-input, free). */
  pricing_model?: string;
}

export interface EstateToolsSource {
  /** A machine-readable price/tool manifest at the sibling, when one exists. Omitted = nothing to sync against yet. */
  manifest_url?: string;
  /** YYYY-MM-DD this entry's `tools` snapshot was captured. */
  vendored_at: string;
  /** Pointer to the guard (once one exists) that checks this snapshot against the sibling's live source. */
  sync_guard?: string;
}

export interface EstateDiscovery {
  llms_txt?: string;
  well_known?: string;
  for_agents?: string;
}

export interface EstateHealth {
  probe_url?: string;
  last_status: "live" | "unreachable" | "unverified";
  /** YYYY-MM-DD this row was last actually probed — not when the row's data was last written. */
  last_checked: string;
}

export interface EstateEntry {
  id: string;
  name: string;
  domains: readonly string[];
  /**
   * Optional, deliberately: a `status: "planned"` stub row (e.g. trust_fabric,
   * blocked on an owner naming decision — STRATEGY.md §5.1) can legitimately
   * have no confirmed base URL yet. An empty-string placeholder would be a
   * silent lie of exactly the kind this repo's honesty guards exist to catch;
   * omitting the field says the true thing instead.
   */
  api_base?: string;
  status: EstateStatus;
  mcp?: EstateMcp;
  payment?: EstatePayment;
  tools?: readonly EstateTool[];
  tools_source?: EstateToolsSource;
  capabilities_summary: string;
  discovery: EstateDiscovery;
  /** Every row in this table is, by construction, excluded from Iliad's human-facing webapp — see the file header. */
  webapp_surface: "agent-only";
  health?: EstateHealth;
}

/** Bumped only on a breaking change to this shape; new fields/entries are additive and need no bump. */
export const ESTATE_SCHEMA_VERSION = "1.0";

export const ESTATE_REGISTRY: Record<string, EstateEntry> = {
  paid: {
    id: "paid",
    name: "PAI'D",
    // paid.trustfabric.ai is the marketing SPA — verified live 2026-08-22
    // (STRATEGY.md §1.1) that its catch-all serves fake 200 HTML on every
    // .well-known path, so it carries no real discovery today. The real
    // agent surface is the API host below.
    domains: ["paid.trustfabric.ai", "api.paid.jonathanarvay.com"],
    api_base: "https://api.paid.jonathanarvay.com",
    status: "live",
    mcp: {
      url: "https://api.paid.jonathanarvay.com/v1/mcp",
      transport: "streamable-http", // + legacy SSE, per their same-day verification
      auth: "bearer", // agent keys (agk_live_…); sandbox keys deny execute_payment, $1 cap, 24h
    },
    // Three tools blessed READ-ONLY by PAI'D's own recorded decision,
    // answered same-day 2026-08-22 (begin.yaml
    // inter_repo_ticket_system.outbox, TICKET-AXIS_TOOLBOX-agent-surface-
    // 20260822). No price was published for any of the three — they read as
    // account/introspection calls, not metered actions — so "free" here is
    // the honest default, not an assumption of a billing decision PAI'D
    // hasn't made.
    //
    // execute_payment is DELIBERATELY ABSENT, not forgotten: PAI'D's own
    // CAND-COH-009 records it as currently skipping the sanctions/
    // payer-screening chokepoint. CORRECTED TRIGGER (PAI'D, same-day
    // correction, 2026-08-22): COH-009+COH-013 closing makes it ELIGIBLE
    // only — activating a money-moving tool is a human authorization
    // decision, not something an agent-to-agent ticket answer can grant, so
    // listing waits for a SECOND, explicit founder-sign-off confirmation
    // from PAI'D. Two signals will arrive; act only on the second. Never
    // list early, and don't poll their repo for either signal
    // ([[dont-track-paid-repo]]; they will tell us).
    //
    // STRUCK by PAI'D's founder rule, never to be re-proposed here: wallet
    // top-up (stored value = custody/licensing) and any new
    // checkout-initiation tool. Merchant-side functions are excluded
    // entirely (MTL/counsel-gated).
    tools: [
      { name: "get_quote", summary: "Price/route quote for a payment before executing it.", price_usd: "free" },
      { name: "list_providers", summary: "Enumerate available payment rails and providers.", price_usd: "free" },
      { name: "get_payment_intent", summary: "Look up the status of a payment intent by id.", price_usd: "free" },
    ],
    tools_source: {
      vendored_at: "2026-08-22",
    },
    capabilities_summary:
      "Multi-rail payment orchestration and settlement. Buyer-side read tools (quotes, providers, payment-intent lookup) are agent-callable today; execute_payment is conditionally eligible pending PAI'D's sanctions/payer-screening close-out, but stays unlisted until PAI'D's founder separately signs off — closure alone does not authorize it; merchant-side functions are excluded (MTL/counsel-gated).",
    discovery: {
      well_known: "https://api.paid.jonathanarvay.com/v1/agent_discovery",
    },
    webapp_surface: "agent-only",
    health: {
      probe_url: "https://api.paid.jonathanarvay.com/v1/mcp",
      last_status: "live",
      // Verified live BY PAI'D THEMSELVES, same day, per the answered
      // ticket — not independently reprobed here (their host is behind the
      // same jonathanarvay.com-family network interception the foundry/
      // launch rows below hit directly).
      last_checked: "2026-08-22",
    },
  },

  foundry: {
    id: "foundry",
    name: "AXIS Foundry",
    domains: ["avatar.jonathanarvay.com"],
    api_base: "https://api.avatar.jonathanarvay.com",
    // See the file header's note on status vs. code-exists — "unverified"
    // because this row's own authoring-time liveness probe could not reach
    // the host from this network, not because the service is doubted.
    status: "unverified",
    mcp: {
      url: "https://api.avatar.jonathanarvay.com/mcp",
      transport: "streamable-http",
      auth: "none", // their server.json publishes no auth block
      registry_name: "com.jonathanarvay/axis-avatar-foundry",
    },
    payment: {
      rail: "x402-evm",
      notes:
        "On-chain USDC on Base via a CDP facilitator — a different wire protocol and settlement rail than Iliad's own mppx/PaymentAuth (STRATEGY.md §3.1). Iliad cannot pay this directly; est_04 routes Iliad→Foundry settlement through PAI'D.",
    },
    // Vendored directly from engine/axis_foundry/portal/x402_gateway.py's
    // own X402_TOOL_PRICES / X402_FREE_TOOLS (read from the sibling repo on
    // this machine, 2026-08-22) — real, current prices, not estimated. Wave
    // groupings in STRATEGY.md §2b are proxy-BUILD sequencing (est_04/05),
    // not a property of the tools themselves, so they aren't encoded here.
    tools: [
      { name: "generate_avatar_from_text", summary: "Generate a production 3D avatar from a text prompt (xAI concept image → TRELLIS.2 GPU mesh → full canonical post-process). Deferred settlement — charges only on completion.", price_usd: 5.0, pricing_model: "flat base, tiered by polygon_tier" },
      { name: "generate_avatar_from_image", summary: "Generate a production 3D avatar from a reference photo (xAI A-pose normalize → TRELLIS.2 GPU mesh → full canonical post-process). Deferred settlement.", price_usd: 6.0, pricing_model: "flat base, tiered by polygon_tier" },
      { name: "post_process_mesh", summary: "Post-process a raw generated mesh given inline as base64 GLB (normalize → repair → rig/skin → validate → export).", price_usd: 1.5, pricing_model: "flat" },
      { name: "axis_process", summary: "Run the full AXIS avatar pipeline on a server-side file (classify → normalize → rig → skin → validate).", price_usd: 1.5, pricing_model: "flat" },
      { name: "repair_mesh", summary: "Repair a mesh into AXIS canonical frame (scale/axis/degenerates/normals).", price_usd: 0.75, pricing_model: "flat" },
      { name: "retarget_animation", summary: "Retarget a built-in animation clip to a platform mapping.", price_usd: 0.75, pricing_model: "flat" },
      { name: "axis_export", summary: "Export an avatar to a target engine platform with validation and an HMAC-signed manifest.", price_usd: 0.5, pricing_model: "flat" },
      { name: "axis_validate", summary: "Validate an avatar mesh against 38 rules; returns pass/warn/fail counts.", price_usd: 0.25, pricing_model: "flat" },
      { name: "roblox_compliance_check", summary: "Run Roblox R15 compliance checks against a mesh.", price_usd: 0.25, pricing_model: "flat" },
      { name: "axis_inspect", summary: "Inspect an avatar's contract state and provenance chain.", price_usd: 0.1, pricing_model: "flat" },
      { name: "axis_compare", summary: "Compare two avatar contracts; returns similarity score and section-level diffs.", price_usd: 0.1, pricing_model: "flat" },
      { name: "axis_manifest_verify", summary: "Verify an export manifest's integrity and optionally check content hash.", price_usd: 0.1, pricing_model: "flat" },
      { name: "axis_list_capabilities", summary: "List all AXIS Foundry capabilities (input formats, export platforms, validation rules).", price_usd: "free" },
      { name: "get_generation_status", summary: "Poll a generation job submitted by the paid generate tools; returns download URLs once complete and settled.", price_usd: "free" },
    ],
    tools_source: {
      vendored_at: "2026-08-22",
      // No CI sync guard yet — this snapshot can drift the moment either
      // repo's prices change. STRATEGY.md §3.2 names both a CI guard
      // (against a price manifest Foundry has been asked to publish, see
      // the outbox ticket) and call-time verification as required before
      // any proxy (est_04) goes live; this snapshot is the starting point
      // for that work, not a substitute for it.
    },
    capabilities_summary:
      "AI-native 3D avatar/asset pipeline: generate from text or image, then validate, repair, retarget, and export to engine platforms via x402. 14 MCP tools — 12 priced ($0.10-$6.00), 2 free (capability listing, job-status poll).",
    discovery: {},
    webapp_surface: "agent-only",
    health: {
      probe_url: "https://api.avatar.jonathanarvay.com/mcp",
      last_status: "unverified",
      last_checked: "2026-08-22",
    },
  },

  launch: {
    id: "launch",
    name: "AXIS Launch",
    domains: ["jonathanarvay.com"],
    api_base: "https://jonathanarvay.com",
    // Same network-interception reason as foundry above — content read
    // directly from the sibling repo's own axis-launch.json on this
    // machine, but not independently reachable over the network from here.
    status: "unverified",
    // No MCP, no callable functions — STRATEGY.md §2d: "no callable
    // functions identified (none invented)". Launch is a discovery/SEO/
    // acquisition platform, not a tool provider, so `mcp`/`payment`/`tools`
    // are all correctly absent rather than empty placeholders.
    capabilities_summary:
      "Discovery, SEO, and acquisition platform for AI-generated apps. Shipped the estate's Cloudflare Agent-Readiness reference implementation (llms.txt, .well-known/*, agent-skills discovery) — the property this repo's own ext_01/ext_02 candidates were scored against.",
    discovery: {
      well_known: "https://jonathanarvay.com/.well-known/axis-launch.json",
    },
    webapp_surface: "agent-only",
    health: {
      probe_url: "https://jonathanarvay.com/.well-known/axis-launch.json",
      last_status: "unverified",
      last_checked: "2026-08-22",
    },
  },

  trust_fabric: {
    id: "trust_fabric",
    name: "Trust Fabric",
    // BLOCKED on naming reconciliation (STRATEGY.md §5.1, an explicit owner
    // decision) — deliberately a stub row, not a fully populated entry. The
    // owner directive names tf.trustfabric.ai (NXDOMAIN, checked
    // 2026-08-22). ecosystem.registry.yaml instead named
    // tf.jonathanarvay.com (resolves; unverifiable further — same network
    // interception as foundry/launch above) and, separately,
    // paid.trustfabric.ai under this same entry — a pre-existing registry
    // data quirk (that domain is PAI'D's; not carried forward here). Both
    // real candidate domains are recorded so the naming decision has real
    // data to resolve against; treat neither as canonical yet.
    domains: ["tf.trustfabric.ai", "tf.jonathanarvay.com"],
    status: "planned",
    capabilities_summary:
      "Repair-to-certify marketplace and control plane — certify or refuse with evidence. Canonical domain and property definition are an open owner decision (STRATEGY.md §5.1); this row is a placeholder, not a verified property.",
    discovery: {},
    webapp_surface: "agent-only",
  },
};

export const ESTATE_IDS = Object.keys(ESTATE_REGISTRY);

export function getEstateEntry(id: string): EstateEntry | undefined {
  return ESTATE_REGISTRY[id];
}
