import { describe, it, expect, vi } from "vitest";
import type { Server } from "node:http";
import { scheduleBootMigrations } from "./router.js";

// The boot logic only reads `server.listening`; a plain mutable object suffices,
// so these tests need neither a real socket nor a database.
function setup() {
  const server = { listening: false };
  const startListening = vi.fn(() => {
    server.listening = true;
  });
  return { server, startListening, asServer: server as unknown as Server };
}
const flush = () => new Promise((r) => setImmediate(r));

describe("scheduleBootMigrations (A2 — boot resilience)", () => {
  it("happy path: binds after migrations apply, schedules no retry", async () => {
    const { server, startListening, asServer } = setup();
    const scheduleRetry = vi.fn();
    scheduleBootMigrations(asServer, startListening, () => Promise.resolve({ current_version: 3 }), scheduleRetry);
    await flush();

    expect(startListening).toHaveBeenCalledTimes(1);
    expect(server.listening).toBe(true);
    expect(scheduleRetry).not.toHaveBeenCalled();
  });

  it("DB down: binds the port ANYWAY so the DB-free surface stays up, and schedules a retry", async () => {
    const { server, startListening, asServer } = setup();
    const scheduleRetry = vi.fn();
    scheduleBootMigrations(asServer, startListening, () => Promise.reject(new Error("ECONNREFUSED")), scheduleRetry);
    await flush();

    // The core fix: a failed migration no longer leaves the process unbound (old code
    // only set process.exitCode=1 and never called server.listen()).
    expect(startListening).toHaveBeenCalledTimes(1);
    expect(server.listening).toBe(true);
    expect(scheduleRetry).toHaveBeenCalledTimes(1);
    expect(scheduleRetry.mock.calls[0]?.[1]).toBe(5_000); // first backoff
  });

  it("self-heals: a later retry applies migrations without a restart and does not re-bind", async () => {
    const { server, startListening, asServer } = setup();
    let captured: (() => void) | undefined;
    const scheduleRetry = vi.fn((fn: () => void) => {
      captured = fn;
    });
    let calls = 0;
    const runMigrations = vi.fn(() => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error("down")) : Promise.resolve({ current_version: 4 });
    });

    scheduleBootMigrations(asServer, startListening, runMigrations, scheduleRetry);
    await flush();
    expect(server.listening).toBe(true); // bound during the outage
    expect(scheduleRetry).toHaveBeenCalledTimes(1);

    // The DB is back; fire the scheduled retry.
    captured?.();
    await flush();

    expect(runMigrations).toHaveBeenCalledTimes(2);
    expect(startListening).toHaveBeenCalledTimes(1); // already listening → not re-bound
    expect(scheduleRetry).toHaveBeenCalledTimes(1); // success → no further retry
  });

  it("backoff grows per attempt and caps at 60s", async () => {
    const { startListening, asServer } = setup();
    const delays: number[] = [];
    // Always fails; drive successive attempts by invoking the most-recent scheduled retry.
    let last: (() => void) | undefined;
    const scheduleRetry = vi.fn((fn: () => void, ms: number) => {
      delays.push(ms);
      last = fn;
    });
    scheduleBootMigrations(asServer, startListening, () => Promise.reject(new Error("down")), scheduleRetry);
    await flush();
    for (let i = 0; i < 14; i++) {
      last?.();
      await flush();
    }
    expect(delays[0]).toBe(5_000);
    expect(delays[1]).toBe(10_000);
    expect(Math.max(...delays)).toBe(60_000); // capped
  });
});
