import { describe, it, expect } from "vitest";
import { runPollTick, POLL_PRODUCTS, type PollTickDeps } from "./watch-poll-tick.js";
import type { RepoSubscription } from "@axis/snapshots";

// infra_04's fanout logic. The substrate's load-bearing properties: every
// subscription to a poll-driven product gets exactly one ordinary watch job
// per tick (event_type "scheduled_pull", empty ref), one product's failure
// never starves the others, and an empty product set does nothing at all.

function sub(over: Partial<RepoSubscription> = {}): RepoSubscription {
  return {
    account_id: "acc-1",
    product_id: "optimization",
    repo_full_name: "octo/app",
    created_at: "2026-08-23T00:00:00Z",
    latest_snapshot_id: null,
    ...over,
  } as RepoSubscription;
}

function makeDeps(opts: {
  products: readonly string[];
  byProduct?: Record<string, RepoSubscription[]>;
  failingProducts?: string[];
  enqueueShouldThrowFor?: string;
}) {
  const enqueued: Array<Record<string, unknown>> = [];
  const deps: PollTickDeps = {
    products: opts.products,
    listForProduct: async (product_id) => {
      if (opts.failingProducts?.includes(product_id)) throw new Error(`enumeration down for ${product_id}`);
      return opts.byProduct?.[product_id] ?? [];
    },
    enqueue: async (payload) => {
      if (opts.enqueueShouldThrowFor && payload.product_id === opts.enqueueShouldThrowFor) {
        throw new Error("queue down");
      }
      enqueued.push(payload as unknown as Record<string, unknown>);
      return "job-1";
    },
  };
  return { deps, enqueued };
}

describe("runPollTick", () => {
  it("enqueues one scheduled_pull watch job per subscription, dispatcher-compatible payload shape", async () => {
    const { deps, enqueued } = makeDeps({
      products: ["optimization"],
      byProduct: {
        optimization: [sub(), sub({ account_id: "acc-2", repo_full_name: "octo/other" })],
      },
    });
    const result = await runPollTick(deps);
    expect(result).toEqual({ enqueued: 2, failed_products: [] });
    expect(enqueued[0]).toEqual({
      account_id: "acc-1",
      product_id: "optimization",
      repo_full_name: "octo/app",
      event_type: "scheduled_pull",
      ref: "",
    });
  });

  it("fans out across multiple poll-driven products independently", async () => {
    const { deps, enqueued } = makeDeps({
      products: ["optimization", "marketing"],
      byProduct: {
        optimization: [sub()],
        marketing: [sub({ product_id: "marketing", account_id: "acc-9" })],
      },
    });
    const result = await runPollTick(deps);
    expect(result.enqueued).toBe(2);
    expect(enqueued.map((e) => e.product_id)).toEqual(["optimization", "marketing"]);
  });

  it("one product's enumeration failure never starves the others — isolated and reported", async () => {
    const { deps, enqueued } = makeDeps({
      products: ["optimization", "marketing"],
      failingProducts: ["optimization"],
      byProduct: { marketing: [sub({ product_id: "marketing" })] },
    });
    const result = await runPollTick(deps);
    expect(result.failed_products).toEqual(["optimization"]);
    expect(result.enqueued).toBe(1);
    expect(enqueued[0].product_id).toBe("marketing");
  });

  it("an enqueue failure mid-product is contained to that product", async () => {
    const { deps, enqueued } = makeDeps({
      products: ["optimization", "marketing"],
      byProduct: {
        optimization: [sub()],
        marketing: [sub({ product_id: "marketing" })],
      },
      enqueueShouldThrowFor: "optimization",
    });
    const result = await runPollTick(deps);
    expect(result.failed_products).toEqual(["optimization"]);
    expect(enqueued.map((e) => e.product_id)).toEqual(["marketing"]);
  });

  it("an empty product set does nothing — the substrate is inert until a consumer exists", async () => {
    const { deps, enqueued } = makeDeps({ products: [] });
    const result = await runPollTick(deps);
    expect(result).toEqual({ enqueued: 0, failed_products: [] });
    expect(enqueued).toHaveLength(0);
  });
});

describe("POLL_PRODUCTS — the deliberate empty set", () => {
  it("is empty until a poll-driven watcher actually ships (app_33 adds the first entry)", () => {
    // This test EXISTS to be deleted-or-updated by app_33: when "optimization"
    // lands here, its watcher branch must exist in watch-dispatcher.ts, or
    // every tick puts a no-op through the unhandled-fallthrough log for every
    // subscriber. Guarding the empty set makes adding an entry a conscious act.
    expect(POLL_PRODUCTS).toEqual([]);
  });
});
