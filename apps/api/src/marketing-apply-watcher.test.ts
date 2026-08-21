// app_42 Apply stage. Deps are injected — no live GitHub/Resend/Postgres
// needed to exercise every path here.
//
// The cases that matter are the ones where the pipeline does NOT send: a
// watcher tempted to report "test_sent" when the send actually failed, or to
// send to a real audience instead of the account's own address, is exactly
// the class of dishonest-success this repo has already been burned by once
// (money_02's admin-grant incident).
import { describe, it, expect, vi } from "vitest";
import type { WatchJobPayload } from "@axis/snapshots";
import { processMarketingApply, type MarketingApplyDeps } from "./marketing-apply-watcher.js";
import type { SendSequenceStepResult } from "./marketing-send.js";

const payload = (over: Partial<WatchJobPayload> = {}): WatchJobPayload =>
  ({
    account_id: "acct_1",
    repo_full_name: "acme/widget",
    product_id: "marketing",
    ref: "refs/heads/main",
    event_type: "push",
    ...over,
  }) as WatchJobPayload;

const file = (path: string, content: string) => ({ path, content, size: content.length });
const REPO_FILES = [
  file("package.json", JSON.stringify({ name: "widget" })),
  file("src/App.ts", "export const x = 1;"),
];

function deps(over: Partial<MarketingApplyDeps> = {}): MarketingApplyDeps {
  return {
    token: "gh-token",
    fetchRepo: vi.fn(async () => ({ files: REPO_FILES as never })),
    getAccountById: vi.fn(async () => ({ email: "owner@example.com" })),
    sendStep: vi.fn(async () => ({ status: "sent", message_id: "msg_1" }) as SendSequenceStepResult),
    sendStepDeps: { config: { api_key: "k", from_address: "a@a.com" }, send: vi.fn() },
    track: vi.fn(async () => ({}) as never),
    ...over,
  };
}

describe("processMarketingApply — routing and preconditions", () => {
  it("ignores jobs for other products so the dispatcher can fall through", async () => {
    const r = await processMarketingApply(payload({ product_id: "seo" }), deps());
    expect(r.status).toBe("not_marketing_product");
  });

  it("does nothing without a GitHub token rather than failing mid-apply", async () => {
    const r = await processMarketingApply(payload(), deps({ token: undefined }));
    expect(r.status).toBe("no_token");
  });

  it("reports account_not_found rather than sending to nobody", async () => {
    const d = deps({ getAccountById: vi.fn(async () => undefined) });
    const r = await processMarketingApply(payload(), d);
    expect(r.status).toBe("account_not_found");
    expect(d.sendStep).not.toHaveBeenCalled();
  });
});

describe("processMarketingApply — the honest-outcome paths", () => {
  it("sends the test to the ACCOUNT'S OWN email — never a caller-supplied or fabricated address", async () => {
    const d = deps();
    const r = await processMarketingApply(payload(), d);
    expect(r.status).toBe("test_sent");
    expect(r.message_id).toBe("msg_1");
    expect(d.sendStep).toHaveBeenCalledTimes(1);
    const [, toEmail] = (d.sendStep as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(toEmail).toBe("owner@example.com");
  });

  it("sends the Welcome sequence's first step — a real, deterministic pick, not an arbitrary one", async () => {
    const d = deps();
    await processMarketingApply(payload(), d);
    const [step] = (d.sendStep as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(step.label).toBe("Email 1: Welcome");
  });

  it("tracks a real funnel event on success, with the real message id in metadata", async () => {
    const d = deps();
    await processMarketingApply(payload(), d);
    expect(d.track).toHaveBeenCalledWith(
      "acct_1",
      "marketing_sequence_test_sent",
      "engagement",
      expect.objectContaining({ message_id: "msg_1" }),
    );
  });

  it("reports not_configured honestly rather than fabricating a send when Resend isn't set up", async () => {
    const d = deps({ sendStep: vi.fn(async () => ({ status: "not_configured" }) as SendSequenceStepResult) });
    const r = await processMarketingApply(payload(), d);
    expect(r.status).toBe("not_configured");
    expect(d.track).not.toHaveBeenCalled();
  });

  it("THE CORE GUARD: a real send failure is reported as test_send_failed, never as test_sent", async () => {
    const d = deps({
      sendStep: vi.fn(async () => ({ status: "send_failed", error: "Email provider error: 422 Domain not verified" }) as SendSequenceStepResult),
    });
    const r = await processMarketingApply(payload(), d);
    expect(r.status).toBe("test_send_failed");
    expect(r.reason).toContain("Domain not verified");
    // The failure itself is tracked too — an honest record, not a swallowed error.
    expect(d.track).toHaveBeenCalledWith(
      "acct_1",
      "marketing_sequence_test_send_failed",
      "engagement",
      expect.objectContaining({ error: expect.stringContaining("Domain not verified") }),
    );
  });

  it("a funnel-tracking failure never breaks the returned result — bookkeeping is best-effort", async () => {
    const d = deps({ track: vi.fn(async () => { throw new Error("db down"); }) });
    const r = await processMarketingApply(payload(), d);
    expect(r.status).toBe("test_sent"); // the real outcome, unaffected by the tracking failure
  });
});
