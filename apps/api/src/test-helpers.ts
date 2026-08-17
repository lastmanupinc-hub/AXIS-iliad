// Shared test-server helper. Replaces the flaky `createApp(router, FIXED_PORT)`
// + `setTimeout(...)` readiness guess used across the api test suites, which
// raced under load (esp. `--coverage`) and produced intermittent
// `ECONNREFUSED`/"Server is not running" failures.
//
// startTestServer binds an OS-assigned ephemeral port (0) — no cross-worker
// port collisions — and resolves only once the socket is actually `listening`
// (rejecting on bind error). Deterministic readiness.
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp, type Router } from "./router.js";

export interface TestServer {
  server: Server;
  port: number;
  baseUrl: string;
}

export async function startTestServer(router: Router): Promise<TestServer> {
  const server = createApp(router, 0);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    if (server.listening) resolve();
    else server.once("listening", () => resolve());
  });
  const addr = server.address() as AddressInfo;
  const port = addr.port;
  return { server, port, baseUrl: `http://127.0.0.1:${port}` };
}

// Captured at module load — BEFORE any test installs fake timers — so that a
// suite which also fakes Date can never freeze this deadline into a hang.
const realNow = Date.now;

/**
 * Wait until `spy` has been called `calls` times, bounded by REAL wall-clock
 * time rather than by a fixed number of event-loop ticks.
 *
 * Same lesson as startTestServer above, one layer down. The tick-counting
 * version this replaces (duplicated in stripe.test.ts, stripe-branches.test.ts
 * and web-research.test.ts, with bounds that had already drifted 500 -> 3000 as
 * people hit it) measured the wrong thing. These loops are waiting on REAL I/O
 * — auth, readBody, DB lookups — to reach the fetch under test, and a tick
 * budget does not grow when that I/O gets slower. Under load 500 ticks can
 * elapse in tens of milliseconds while the DB round-trip needs hundreds, so the
 * loop gives up early and the caller's NEXT assertion fails as "expected 1
 * times, got 0 times" — a symptom that points at the handler rather than at the
 * wait. Observed exactly that in the 2026-08-17 local-CI gate.
 *
 * Bounding by wall-clock is strictly more robust, not merely larger: on a fast
 * machine it returns the moment the call lands (no slower than before), and on
 * a slow one it waits as long as the work genuinely takes.
 *
 * `tick` flushes already-due FAKE timers without moving the clock past them;
 * the real `setImmediate` yield then lets pending real I/O progress. Passed in
 * rather than imported so this module never pulls vitest into the build graph —
 * it is compiled into dist, unlike *.test.ts.
 *
 * Throws on timeout instead of returning quietly, so the failure names its own
 * cause rather than surfacing as a confusing call-count mismatch.
 */
export async function waitForSpyCall(
  spy: { mock: { calls: unknown[][] } },
  calls = 1,
  opts: { timeoutMs?: number; tick?: () => Promise<unknown> } = {},
): Promise<void> {
  const { timeoutMs = 20_000, tick } = opts;
  const deadline = realNow() + timeoutMs;
  while (spy.mock.calls.length < calls) {
    if (realNow() >= deadline) {
      throw new Error(
        `waitForSpyCall timed out after ${timeoutMs}ms of real time: the spy was ` +
          `called ${spy.mock.calls.length}x, expected ${calls}. The awaited call was ` +
          `never reached — suspect the request failing earlier (auth/body/DB) rather ` +
          `than the code under test.`,
      );
    }
    if (tick) await tick();
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}
