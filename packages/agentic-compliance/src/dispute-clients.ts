import type { DisputeRail, DisputeRecord, DisputeState } from "./types.js";
import type { StripeRepresentmentEvidence } from "./representment.js";

/** Thrown by the VROL/RDR/CDRN client's live methods until acquirer provisioning lands. */
export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}

export interface DisputeClient {
  rail: DisputeRail;
  fetchDispute(disputeId: string): Promise<DisputeRecord>;
  submitEvidence(
    disputeId: string,
    evidence: StripeRepresentmentEvidence,
    submit: boolean,
  ): Promise<{ ok: boolean; state: DisputeState }>;
}

/** Returned instead of a `DisputeClient` when a rail has no usable credentials yet. */
export interface NotConfigured {
  configured: false;
  rail: DisputeRail;
  reason: string;
}

const STRIPE_API_BASE = "https://api.stripe.com/v1";

function mapStripeStatusToState(status: string | undefined): DisputeState {
  switch (status) {
    case "needs_response":
    case "warning_needs_response":
    case "warning_under_review":
      return "needs_response";
    case "under_review":
      return "under_review";
    case "won":
      return "won";
    case "lost":
      return "lost";
    case "charge_refunded":
      return "accepted";
    case "warning_closed":
      return "warning_closed";
    default:
      return "needs_response";
  }
}

function mapStripeDisputeToRecord(raw: Record<string, unknown>): DisputeRecord {
  const nowIso = new Date().toISOString();
  const evidenceDetails = raw.evidence_details as { due_by?: number } | undefined;
  const charge = raw.charge;
  const metadata = raw.metadata as { account_id?: string } | undefined;
  return {
    id: String(raw.id),
    rail: "stripe",
    chargeId: typeof charge === "string" ? charge : ((charge as { id?: string } | undefined)?.id ?? null),
    accountId: metadata?.account_id ?? null,
    reasonCode: typeof raw.reason === "string" ? raw.reason : "unknown",
    amountMinor: typeof raw.amount === "number" ? raw.amount : 0,
    currency: typeof raw.currency === "string" ? raw.currency : "usd",
    state: mapStripeStatusToState(typeof raw.status === "string" ? raw.status : undefined),
    dueBy: evidenceDetails?.due_by ? new Date(evidenceDetails.due_by * 1000).toISOString() : null,
    createdAt: typeof raw.created === "number" ? new Date(raw.created * 1000).toISOString() : nowIso,
    updatedAt: nowIso,
    representmentId: null,
  };
}

function toFormBody(evidence: StripeRepresentmentEvidence, submit: boolean): string {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(evidence)) {
    if (value === undefined || value === null) continue;
    form.set(`evidence[${key}]`, String(value));
  }
  form.set("submit", submit ? "true" : "false");
  return form.toString();
}

/** Live Stripe dispute client — the rail that is operational today. */
export function makeStripeDisputeClient(deps: {
  apiKey: string;
  fetchImpl?: typeof fetch;
}): DisputeClient {
  const fetchImpl = deps.fetchImpl ?? fetch;

  return {
    rail: "stripe",

    async fetchDispute(disputeId: string): Promise<DisputeRecord> {
      const res = await fetchImpl(`${STRIPE_API_BASE}/disputes/${disputeId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${deps.apiKey}` },
      });
      if (!res.ok) {
        throw new Error(`Stripe fetchDispute(${disputeId}) failed: ${res.status}`);
      }
      const body = (await res.json()) as Record<string, unknown>;
      return mapStripeDisputeToRecord(body);
    },

    async submitEvidence(
      disputeId: string,
      evidence: StripeRepresentmentEvidence,
      submit: boolean,
    ): Promise<{ ok: boolean; state: DisputeState }> {
      const res = await fetchImpl(`${STRIPE_API_BASE}/disputes/${disputeId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${deps.apiKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: toFormBody(evidence, submit),
      });
      if (!res.ok) {
        throw new Error(`Stripe submitEvidence(${disputeId}) failed: ${res.status}`);
      }
      return { ok: true, state: submit ? "evidence_submitted" : "evidence_assembling" };
    },
  };
}

/**
 * VROL (Visa Resolve Online / Verifi) + RDR + CDRN (Ethoca) client.
 *
 * Ships as real code, but is a business/acquirer-provisioning gate, not a
 * code gate: it refuses to act — `{ configured: false }`, zero network
 * calls — unless `AXIS_ENABLE_VROL=1` and acquirer credentials
 * (`VERIFI_API_KEY` / `VERIFI_MERCHANT_ID`) are present. Even once "enabled"
 * it never fakes a submission: the live methods throw {@link NotImplementedError}
 * rather than silently no-op or fabricate a result, until the real acquirer
 * integration lands.
 */
export function makeVerifiEthocaDisputeClient(env: NodeJS.ProcessEnv): DisputeClient | NotConfigured {
  const enabled = env.AXIS_ENABLE_VROL === "1";
  const apiKey = env.VERIFI_API_KEY;
  const merchantId = env.VERIFI_MERCHANT_ID;

  if (!enabled) {
    return { configured: false, rail: "vrol", reason: "AXIS_ENABLE_VROL is not set to '1'" };
  }
  if (!apiKey || !merchantId) {
    return {
      configured: false,
      rail: "vrol",
      reason: "VERIFI_API_KEY / VERIFI_MERCHANT_ID acquirer credentials are not configured",
    };
  }

  return {
    rail: "vrol",
    async fetchDispute(_disputeId: string): Promise<DisputeRecord> {
      throw new NotImplementedError(
        "VerifiEthocaDisputeClient.fetchDispute requires live Verifi/Ethoca acquirer " +
          "provisioning and is not yet implemented — no dispute was fetched or fabricated.",
      );
    },
    async submitEvidence(
      _disputeId: string,
      _evidence: StripeRepresentmentEvidence,
      _submit: boolean,
    ): Promise<{ ok: boolean; state: DisputeState }> {
      throw new NotImplementedError(
        "VerifiEthocaDisputeClient.submitEvidence requires live Verifi/Ethoca acquirer " +
          "provisioning and is not yet implemented — no submission was made or fabricated.",
      );
    },
  };
}
