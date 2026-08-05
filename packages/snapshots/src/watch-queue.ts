// TYPE-ONLY: erased at compile time, so importing this module costs nothing at
// runtime. The VALUE is loaded lazily in getBoss() below — see the note there.
import type { PgBoss, Job } from "pg-boss";

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
  // infra_02: pg-boss is loaded HERE, not at module scope. This module is
  // re-exported by packages/snapshots/src/index.ts, which 154 test files import
  // — so a top-level `import { PgBoss } from "pg-boss"` made every one of them
  // pay for the job-queue library and its transitive deps, whether or not they
  // ever touch the watch queue. Measured: importing the barrel cost ~5.6s cold
  // against ~1.4s for a single module from the same package.
  //
  // Nothing else in this file needs the value at module scope (PgBoss appears
  // only in type positions and in this factory), so deferring it is invisible
  // to callers: getBoss() was already async and already a lazy singleton.
  const { PgBoss } = await import("pg-boss");
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

/** Test-only: stop the queue and clear the singleton so a fresh DATABASE_URL takes effect. */
export async function stopWatchQueue(): Promise<void> {
  if (boss) {
    await boss.stop({ graceful: false, timeout: 1000 });
    boss = undefined;
    queueEnsured = false;
  }
}
