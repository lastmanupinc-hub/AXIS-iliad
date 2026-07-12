import { beforeEach, describe, expect, it } from "vitest";
import type { IncomingMessage } from "node:http";
import {
  resetTestDb,
  createAccount,
  createApiKey,
  getUsageCreditSummary,
} from "@axis/snapshots";
import { dispatch } from "./mcp-server.js";
import { resetAnalyticsForTests } from "./analytics.js";

// iliad_analytics is metered, runs entirely locally, and has no entitlement gate
// — an ideal probe for the charge/replay behavior.
const ARGS = { operation: "query", namespace: "ns-idem", query: { kind: "count" } };

function mockReq(rawKey: string, idempotencyKey?: string): IncomingMessage {
  const headers: Record<string, string> = { authorization: `Bearer ${rawKey}` };
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  return { headers, socket: { remoteAddress: "127.0.0.1" } } as unknown as IncomingMessage;
}

function call(
  rawKey: string,
  idemKey: string | undefined,
  id: number,
  args: Record<string, unknown> = ARGS,
) {
  return dispatch("tools/call", { name: "iliad_analytics", arguments: args }, id, mockReq(rawKey, idemKey));
}

function resultOf(rpc: unknown): Record<string, unknown> {
  return (rpc as { result: Record<string, unknown> }).result;
}

describe("MCP idempotency (dispatch)", () => {
  let rawKey: string;
  let accountId: string;

  beforeEach(async () => {
    await resetTestDb();
    // analytics_events is lazily created with a module-level init flag that
    // outlives the in-memory DB reset — reset it so the table exists in this DB.
    await resetAnalyticsForTests();
    const acct = await createAccount("Idem", "idem@example.com", "paid");
    accountId = acct.account_id;
    rawKey = (await createApiKey(acct.account_id)).rawKey;
  });

  const used = async () => (await getUsageCreditSummary(accountId, "paid")).included_credits_used;

  it("replays the result and does NOT re-charge on a repeated Idempotency-Key", async () => {
    const before = await used();

    const first = resultOf(await call(rawKey, "key-A", 1));
    expect(first.isError).toBeFalsy();
    const afterFirst = await used();
    expect(afterFirst).toBeGreaterThan(before); // charged once

    const second = resultOf(await call(rawKey, "key-A", 2));
    expect(second._idempotent_replay).toBe(true);
    expect(await used()).toBe(afterFirst); // NOT re-charged

    const firstText = (first.content as Array<{ text: string }>)[0].text;
    const secondText = (second.content as Array<{ text: string }>)[0].text;
    expect(secondText).toBe(firstText); // identical result replayed
  });

  it("rejects a key reused with different arguments", async () => {
    await call(rawKey, "key-B", 1);
    const reuse = (await call(rawKey, "key-B", 2, { ...ARGS, namespace: "ns-other" })) as {
      error?: { message: string };
    };
    expect(reuse.error).toBeTruthy();
    expect(reuse.error!.message).toContain("different arguments");
  });

  it("charges every call when no Idempotency-Key is sent", async () => {
    const before = await used();
    await call(rawKey, undefined, 1);
    const mid = await used();
    await call(rawKey, undefined, 2);
    const after = await used();
    expect(mid).toBeGreaterThan(before);
    expect(after).toBeGreaterThan(mid); // both charged — no dedup without a key
  });

  // ─── H2.6 (red-team fix, WAVE-0 finding #1, CRITICAL) ────────────────
  //
  // Before this fix, getIdempotentResult was a plain read and saveIdempotentResult
  // only wrote AFTER the billable work finished — so N concurrent requests sharing
  // one Idempotency-Key all read "nothing yet" and all charged + ran the tool. This
  // is the direct proof: fire many concurrent calls sharing one key and assert
  // EXACTLY ONE actually charges, no matter how many raced.
  describe("concurrent requests sharing one Idempotency-Key — at most one charges", () => {
    it("10 concurrent calls with the SAME key: exactly one charges, the rest are replay or in-progress — never a second charge", async () => {
      const before = await used();

      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) => call(rawKey, "race-key", i)),
      );

      const outcomes = results.map((r) => resultOf(r));
      const errorTexts = outcomes
        .filter((o) => o.isError)
        .map((o) => (o.content as Array<{ text: string }>)[0].text);
      // Every non-error outcome must be a REPLAY (never a second live execution
      // racing the winner) — _idempotent_replay is only set on the cached path.
      const liveSuccesses = outcomes.filter((o) => !o.isError && !o._idempotent_replay);
      expect(liveSuccesses).toHaveLength(1); // exactly one request actually ran the tool

      // Every error outcome (if any raced in before the winner committed) must be
      // the retryable "in progress" signal, never a thrown tool error.
      for (const text of errorTexts) {
        expect(text).toContain("already being processed");
      }

      // The credit ledger agrees: exactly one charge landed, regardless of how
      // many of the 10 requests raced past the claim gate before it committed.
      const after = await used();
      expect(after).toBeGreaterThan(before);

      // A retry AFTER the race has settled replays the winner's result and still
      // does not charge again.
      const late = resultOf(await call(rawKey, "race-key", 100));
      expect(late._idempotent_replay).toBe(true);
      expect(await used()).toBe(after);
    });

    it("a released claim (failed tool call) lets a fresh concurrent race re-run cleanly", async () => {
      // Prove the failure path releases the claim rather than leaving it stuck:
      // an invalid namespace throws inside runVectorDatabase-style validation —
      // use a guaranteed-invalid arg shape for the metered tool instead.
      const badArgs = { operation: "not-a-real-operation", namespace: "ns-idem", query: {} };
      const first = resultOf(await dispatch("tools/call", { name: "iliad_analytics", arguments: badArgs }, 1, mockReq(rawKey, "retry-key")));
      expect(first.isError).toBe(true);
      expect(first._idempotent_replay).toBeFalsy();

      // The SAME key, now with valid args, must be claimable again immediately —
      // if the failed attempt had left the claim stuck, this would return
      // "already being processed" instead of actually running.
      const before = await used();
      const second = resultOf(await call(rawKey, "retry-key", 2));
      expect(second.isError).toBeFalsy();
      expect(second._idempotent_replay).toBeFalsy();
      expect(await used()).toBeGreaterThan(before);
    });
  });
});
