import { describe, it, expect, afterAll } from "vitest";
import { enqueueWatchJob, registerWatchWorker, stopWatchQueue, type WatchJobPayload } from "./watch-queue.js";

// The durable queue behind the Watch mechanic (docs/saas-strategy/
// APPLICATION_BUILD_STRATEGY.md substrate table). Real pg-boss round trips
// against the actual test Postgres — not mocked — since the entire point of
// choosing pg-boss over the in-memory Map it replaces is durability, which a
// mock cannot prove.

afterAll(async () => {
  await stopWatchQueue();
});

function waitFor(check: () => boolean, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const poll = () => {
      if (check()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("waitFor timed out"));
      setTimeout(poll, 100);
    };
    poll();
  });
}

describe("watch queue", () => {
  it("a job enqueued is delivered to a registered worker", async () => {
    const received: WatchJobPayload[] = [];
    await registerWatchWorker(async (payload) => {
      received.push(payload);
    });

    const payload: WatchJobPayload = {
      account_id: "acct_test",
      product_id: "skills",
      repo_full_name: "acme/widgets",
      event_type: "push",
      ref: "refs/heads/main",
    };
    const jobId = await enqueueWatchJob(payload);
    expect(jobId).toBeTruthy();

    await waitFor(() => received.length > 0, 15_000);
    expect(received[0]).toEqual(payload);
  }, 20_000);

  it("one handler's rejection does not prevent other enqueued jobs from being delivered", async () => {
    const received: string[] = [];
    await registerWatchWorker(async (payload) => {
      if (payload.repo_full_name === "acme/poison") {
        throw new Error("simulated handler failure");
      }
      received.push(payload.repo_full_name);
    });

    await enqueueWatchJob({
      account_id: "acct_test", product_id: "skills", repo_full_name: "acme/poison",
      event_type: "push", ref: "refs/heads/main",
    });
    await enqueueWatchJob({
      account_id: "acct_test", product_id: "skills", repo_full_name: "acme/healthy",
      event_type: "push", ref: "refs/heads/main",
    });

    await waitFor(() => received.includes("acme/healthy"), 15_000);
    expect(received).toContain("acme/healthy");
  }, 20_000);
});
