import { PgBoss } from "pg-boss";
import type { Job } from "pg-boss";

/**
 * The durable job queue behind the Watch mechanic (docs/saas-strategy/
 * APPLICATION_BUILD_STRATEGY.md substrate table) — pg-boss (MIT), riding the
 * existing Neon Postgres rather than a new infra service. Dependency
 * pre-approved by the standing owner answer (memory:
 * dependency-policy-program-apps).
 *
 * Replaces github-webhook.ts's in-memory delivery-dedup Map (module-scoped,
 * 15-minute TTL) as the mechanism that fires per-subscription watch work —
 * that Map is not durable: a restart, or a second Render instance, loses its
 * state. pg-boss persists jobs in Postgres and survives both.
 */

export interface WatchJobPayload {
  account_id: string;
  product_id: string;
  repo_full_name: string;
  event_type: string;
  ref: string;
  /**
   * app_32: set only by the Sentry incident webhook (event_type
   * "sentry_incident") — the Sentry issue the debug watcher hydrates via
   * plain REST. Optional and additive: push-triggered jobs never carry it,
   * and no pre-existing watcher reads it, so extending the payload is
   * backwards-compatible with every job already in the queue.
   */
  sentry_issue_id?: string;
}

const QUEUE_NAME = "watch";

let boss: PgBoss | undefined;
let queueEnsured = false;

/** Lazy singleton, mirroring pg.ts's getPool() — constructed from DATABASE_URL on first use. */
async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — required for the watch queue.");
  }
  const instance = new PgBoss(connectionString);
  // pg-boss emits 'error' for internal maintenance failures (e.g. a transient
  // connection blip during archival) — these must never crash the process;
  // they already retry on pg-boss's own schedule.
  instance.on("error", () => {
    /* swallowed deliberately — pg-boss retries internally; a crash here would
       take down request handling for a queue-maintenance hiccup */
  });
  await instance.start();
  boss = instance;
  return instance;
}

async function ensureQueue(b: PgBoss): Promise<void> {
  if (queueEnsured) return;
  await b.createQueue(QUEUE_NAME).catch(() => {
    /* already exists — createQueue is not itself idempotent-silent across all versions */
  });
  queueEnsured = true;
}

/** Enqueue one watch job. Returns the job id, or null if pg-boss declined to accept it. */
export async function enqueueWatchJob(payload: WatchJobPayload): Promise<string | null> {
  const b = await getBoss();
  await ensureQueue(b);
  return b.send(QUEUE_NAME, payload as unknown as object);
}

export type WatchJobHandler = (payload: WatchJobPayload) => Promise<void>;

/**
 * Register the worker that processes watch jobs. pg-boss's own `work()` API
 * delivers jobs in batches (Job<T>[]); this wraps that into a simpler
 * per-job handler, since every caller so far wants per-job semantics. A
 * single job's failure does not fail its batch-mates.
 */
export async function registerWatchWorker(handler: WatchJobHandler): Promise<string> {
  const b = await getBoss();
  await ensureQueue(b);
  return b.work<WatchJobPayload, void>(QUEUE_NAME, async (jobs: Job<WatchJobPayload>[]) => {
    for (const job of jobs) {
      await handler(job.data);
    }
  });
}

// ─── Scheduled work (infra_04) ──────────────────────────────────
//
// The substrate's second half: pg-boss 12.x ships schedule(name, cron, data)
// natively — verified against the installed package's .d.ts — and nothing
// used it until now (a gap that forced three candidates to defer their W
// stages: app_42's cadence, app_32's backfill, app_33's usage pulls).
//
// Design is TICK-FANOUT, not per-account schedules: exactly ONE cron
// schedule fires a tick job; the tick's worker (apps/api's watch-poll-tick)
// enumerates subscriptions for poll-driven products and enqueues ORDINARY
// watch jobs — so scheduled work reuses the entire existing dispatcher chain
// and per-account schedule management never exists. pg-boss's schedule() is
// an upsert by name, so calling this at every server start is idempotent and
// a cron change takes effect on deploy.

const TICK_QUEUE_NAME = "watch-poll-tick";

let tickQueueEnsured = false;

async function ensureTickQueue(b: PgBoss): Promise<void> {
  if (tickQueueEnsured) return;
  await b.createQueue(TICK_QUEUE_NAME).catch(() => {
    /* already exists — same posture as ensureQueue above */
  });
  tickQueueEnsured = true;
}

/**
 * Register (upsert) the single poll tick. Call once at server startup with
 * the deployment's cron; safe to call repeatedly.
 */
export async function schedulePollTick(cron: string): Promise<void> {
  const b = await getBoss();
  await ensureTickQueue(b);
  await b.schedule(TICK_QUEUE_NAME, cron, {});
}

export type PollTickHandler = () => Promise<void>;

/**
 * Register the worker that runs on each tick. One registration per process,
 * same competing-consumer reasoning as registerWatchWorker: a second
 * subscription on the same queue would race for ticks, not duplicate them —
 * which is exactly what we want across multiple instances (one tick fires
 * once, whichever instance wins runs the fanout).
 */
export async function registerPollTickWorker(handler: PollTickHandler): Promise<string> {
  const b = await getBoss();
  await ensureTickQueue(b);
  return b.work(TICK_QUEUE_NAME, async (jobs) => {
    // Batch semantics don't matter for a tick (its payload is empty and the
    // handler enumerates fresh state), but a failure in one tick must not
    // fail batch-mates — mirror registerWatchWorker's per-job loop.
    for (let i = 0; i < jobs.length; i++) {
      await handler();
    }
  });
}

/** Test-only: stop the queue and clear the singleton so a fresh DATABASE_URL takes effect. */
export async function stopWatchQueue(): Promise<void> {
  if (boss) {
    await boss.stop({ graceful: false, timeout: 1000 });
    boss = undefined;
    queueEnsured = false;
    tickQueueEnsured = false;
  }
}
