import { describe, expect, it, vi } from "vitest";
import {
  NotImplementedError,
  makeStripeDisputeClient,
  makeVerifiEthocaDisputeClient,
} from "./dispute-clients.js";
import type { StripeRepresentmentEvidence } from "./representment.js";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("makeStripeDisputeClient", () => {
  it("submitEvidence issues exactly one form-encoded POST with submit + evidence fields + bearer auth", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ id: "dp_x", status: "under_review" }),
    );
    const client = makeStripeDisputeClient({ apiKey: "sk_test_123", fetchImpl: fetchImpl as unknown as typeof fetch });

    const evidence: StripeRepresentmentEvidence = {
      customer_email_address: "buyer@example.com",
      uncategorized_text: "CE-3.0 evidence",
    };

    const result = await client.submitEvidence("dp_x", evidence, true);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/disputes/dp_x");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk_test_123");
    // H0.4: every outbound Stripe call pins the API version.
    expect(headers["Stripe-Version"]).toBe("2026-06-24.dahlia");
    expect(String(init.body)).toContain("submit=true");
    expect(String(init.body)).toContain("evidence%5Bcustomer_email_address%5D=buyer%40example.com");
    expect(result).toEqual({ ok: true, state: "evidence_submitted" });
  });

  it("submitEvidence with submit=false reports evidence_assembling", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ id: "dp_x" }));
    const client = makeStripeDisputeClient({ apiKey: "sk_test", fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await client.submitEvidence("dp_x", {}, false);
    expect(result).toEqual({ ok: true, state: "evidence_assembling" });
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(String(init.body)).toContain("submit=false");
  });

  it("fetchDispute GETs the dispute and maps rail-native fields onto DisputeRecord", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({
        id: "dp_x",
        charge: "ch_x",
        reason: "10.4",
        amount: 4999,
        currency: "usd",
        status: "needs_response",
        evidence_details: { due_by: 1_800_000_000 },
        created: 1_790_000_000,
      }),
    );
    const client = makeStripeDisputeClient({ apiKey: "sk_test", fetchImpl: fetchImpl as unknown as typeof fetch });
    const record = await client.fetchDispute("dp_x");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/disputes/dp_x");
    expect(init.method).toBe("GET");
    expect(record.id).toBe("dp_x");
    expect(record.rail).toBe("stripe");
    expect(record.chargeId).toBe("ch_x");
    expect(record.reasonCode).toBe("10.4");
    expect(record.amountMinor).toBe(4999);
    expect(record.currency).toBe("usd");
    expect(record.state).toBe("needs_response");
    expect(record.dueBy).toBe(new Date(1_800_000_000 * 1000).toISOString());
  });

  it("throws when Stripe responds with a non-ok status", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false, 402));
    const client = makeStripeDisputeClient({ apiKey: "sk_test", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(client.fetchDispute("dp_x")).rejects.toThrow(/402/);
  });
});

describe("makeVerifiEthocaDisputeClient", () => {
  it("returns {configured:false, rail:'vrol'} and makes no network call when unconfigured", () => {
    const globalFetchSpy = vi.spyOn(globalThis, "fetch");
    const result = makeVerifiEthocaDisputeClient({});
    expect(result).toEqual({
      configured: false,
      rail: "vrol",
      reason: "AXIS_ENABLE_VROL is not set to '1'",
    });
    expect(globalFetchSpy).not.toHaveBeenCalled();
    globalFetchSpy.mockRestore();
  });

  it("returns {configured:false} when the flag is set but acquirer creds are absent", () => {
    const result = makeVerifiEthocaDisputeClient({ AXIS_ENABLE_VROL: "1" } as NodeJS.ProcessEnv);
    expect(result).toMatchObject({ configured: false, rail: "vrol" });
  });

  it("returns a real DisputeClient when the flag and creds are present, but never fakes a submission", async () => {
    const globalFetchSpy = vi.spyOn(globalThis, "fetch");
    const client = makeVerifiEthocaDisputeClient({
      AXIS_ENABLE_VROL: "1",
      VERIFI_API_KEY: "key",
      VERIFI_MERCHANT_ID: "merchant",
    } as NodeJS.ProcessEnv);

    expect(client).not.toHaveProperty("configured");
    const disputeClient = client as import("./dispute-clients.js").DisputeClient;
    expect(disputeClient.rail).toBe("vrol");

    await expect(disputeClient.fetchDispute("d_1")).rejects.toThrow(NotImplementedError);
    await expect(disputeClient.submitEvidence("d_1", {}, true)).rejects.toThrow(NotImplementedError);
    expect(globalFetchSpy).not.toHaveBeenCalled();
    globalFetchSpy.mockRestore();
  });
});
