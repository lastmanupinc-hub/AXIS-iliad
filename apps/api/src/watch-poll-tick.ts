// ─── infra_04: the scheduled half of the Watch substrate ────────────────────
//
// Tick-fanout: pg-boss fires ONE cron tick (schedulePollTick, upserted at
// startup); this worker answers each tick by enumerating every subscription
// to the products in POLL_PRODUCTS and enqueueing an ORDINARY watch job per
// row (event_type "scheduled_pull"). Scheduled work is just watch work on a
// timer — the entire existing dispatcher chain (12 branches) is reused with
// zero changes, and per-account schedule management never exists.
//
// POLL_PRODUCTS is deliberately EMPTY at infra_04's landing: the substrate
// ships proven (tests drive the fanout via injected product lists), and the
// first real entry belongs to the candidate whose watcher actually consumes
// scheduled pulls (app_33 adds "optimization" when its watcher exists).
// Shipping a fanout to products with no consumer would put a no-op job
// through the dispatcher's unhandled-fallthrough log every tick for every
// subscriber — noise masquerading as progress. While the set is empty,
// startPollScheduler() logs and declines to register the cron at all.

import {
  listSubscriptionsForProduct,
  enqueueWatchJob,
  schedulePollTick,
  registerPollTickWorker,
} from "@axis/snapshots";
import type { RepoSubscription } from "@axis/snapshots";
import { log } from "./logger.js";

/**
 * Products whose Watch stage is pull-driven rather than push-driven. Adding
 * an entry here is the ONLY change a new poll-driven product needs on the
 * substrate side (its watcher branch handles the rest).
 */
export const POLL_PRODUCTS: readonly string[] = [];

export const DEFAULT_POLL_CRON = "*/15 * * * *";

export interface PollTickDeps {
  products: readonly string[];
  listForProduct: (product_id: string) => Promise<RepoSubscription[]>;
  enqueue: (payload: {
    account_id: string;
    product_id: string;
    repo_full_name: string;
    event_type: string;
    ref: string;
  }) => Promise<string | null>;
}

export interface PollTickResult {
  enqueued: number;
  /** Products whose enumeration failed — logged, never fatal to the others. */
  failed_products: string[];
}

/**
 * One tick's fanout. A failure enumerating or enqueueing for one product
 * must never starve the others — each product is isolated, mirroring the
 * dispatcher's one-job-failure-doesn't-fail-batch-mates posture.
 */
export async function runPollTick(deps: PollTickDeps): Promise<PollTickResult> {
  let enqueued = 0;
  const failed_products: string[] = [];
  for (const product_id of deps.products) {
    try {
      const subs = await deps.listForProduct(product_id);
      for (const sub of subs) {
        await deps.enqueue({
          account_id: sub.account_id,
          product_id: sub.product_id,
          repo_full_name: sub.repo_full_name,
          event_type: "scheduled_pull",
          // No git ref on a timer — empty string falls back to the default
          // branch in each watcher's branchFromRef, the sentry-webhook convention.
          ref: "",
        });
        enqueued++;
      }
    } catch (err) {
      failed_products.push(product_id);
      log("error", "watch-poll-tick.product_failed", {
        product_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { enqueued, failed_products };
}

export function defaultPollTickDeps(): PollTickDeps {
  return {
    products: POLL_PRODUCTS,
    listForProduct: (product_id) => listSubscriptionsForProduct(product_id),
    enqueue: (payload) => enqueueWatchJob(payload),
  };
}

/**
 * Startup wiring — call once beside startWatchDispatcher(). Upserts the cron
 * (so a cron change takes effect on deploy) and registers this process's tick
 * worker. Declines entirely while POLL_PRODUCTS is empty.
 */
export async function startPollScheduler(
  cron: string = process.env.AXIS_WATCH_POLL_CRON || DEFAULT_POLL_CRON,
): Promise<string | null> {
  if (POLL_PRODUCTS.length === 0) {
    log("info", "watch-poll-tick.disabled", { reason: "POLL_PRODUCTS is empty — no poll-driven product ships yet" });
    return null;
  }
  await schedulePollTick(cron);
  const workerId = await registerPollTickWorker(async () => {
    const result = await runPollTick(defaultPollTickDeps());
    log("info", "watch-poll-tick.fanout", { enqueued: result.enqueued, failed_products: result.failed_products });
  });
  log("info", "watch-poll-tick.scheduled", { cron, products: [...POLL_PRODUCTS] });
  return workerId;
}
