import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Isolate captureMcpToolCredits: stub the local usage ledger (DB) so we can assert
// wallet behaviour without Postgres, and control the wallet HTTP via a fetch mock.
vi.mock("@axis/snapshots", async (orig) => ({
  ...(await (orig as () => Promise<Record<string, unknown>>)()),
  consumeUsageCredits: vi.fn(async () => ({})),
}));
import { consumeUsageCredits } from "@axis/snapshots";
import { captureMcpToolCredits } from "./mcp-runtime.js";

const ACCT = { account_id: "acct-1", tier: "paid" as const };
const CHARGE = { tool: "iliad_embeddings" as const, amountCents: 50 }; // 50¢ → 1 FC

describe("captureMcpToolCredits — PAI'D wallet modes (compliant)", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no unmocked fetch"));
    process.env.PAID_API_KEY = "k";
    process.env.PAID_MERCHANT_ID = "m";
    process.env.PAID_API_BASE_URL = "https://paid.test/v1";
  });
  afterEach(() => {
    fetchSpy.mockRestore();
    delete process.env.PAID_WALLET_MODE;
    delete process.env.PAID_API_KEY;
    delete process.env.PAID_MERCHANT_ID;
    delete process.env.PAID_API_BASE_URL;
  });

  it("off (default): writes the local ledger, never touches the wallet", async () => {
    process.env.PAID_WALLET_MODE = "off";
    await captureMcpToolCredits(ACCT, CHARGE);
    expect(consumeUsageCredits).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shadow: no real debit, still writes the local ledger", async () => {
    process.env.PAID_WALLET_MODE = "shadow";
    await captureMcpToolCredits(ACCT, CHARGE);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(consumeUsageCredits).toHaveBeenCalledTimes(1);
  });

  it("enforce: debits FC (marketplace take, traceable) then mirrors to the local ledger", async () => {
    process.env.PAID_WALLET_MODE = "enforce";
    fetchSpy.mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ wallet_id: "w", balance_fc: 99, transaction: {} }) } as Response);
    await captureMcpToolCredits(ACCT, CHARGE, { referenceId: "iliad_embeddings:snap-1" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("https://paid.test/v1/trust-fabric/billing/wallet/acct-1/debit");
    expect((init as RequestInit).headers).toMatchObject({ "Idempotency-Key": expect.any(String) });
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      amount_fc: 1, product_code: "tf_marketplace_take", reference_type: "iliad_mcp", reference_id: "iliad_embeddings:snap-1",
    });
    expect(consumeUsageCredits).toHaveBeenCalledTimes(1);
  });

  it("enforce + insufficient funds (402): fails closed — does NOT write the local ledger", async () => {
    process.env.PAID_WALLET_MODE = "enforce";
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 402, text: async () => JSON.stringify({ error: "insufficient_credits", balance_fc: 0, required_fc: 1, shortfall_fc: 1 }) } as Response);
    await expect(captureMcpToolCredits(ACCT, CHARGE, { referenceId: "r" })).rejects.toThrow();
    expect(consumeUsageCredits).not.toHaveBeenCalled();
  });
});
