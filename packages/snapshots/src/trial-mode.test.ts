import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getTrialWindow, isFreeTrialActive } from "./trial-mode.js";

const ENV_KEY = "AXIS_FREE_TRIAL_STARTED_AT";
const DAY_MS = 24 * 60 * 60 * 1000;

describe("trial-mode", () => {
  const original = process.env[ENV_KEY];

  beforeEach(() => {
    delete process.env[ENV_KEY];
  });
  afterEach(() => {
    if (original === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = original;
  });

  describe("getTrialWindow", () => {
    it("returns null when the env var is unset", () => {
      expect(getTrialWindow()).toBeNull();
    });

    it("returns null for an empty string", () => {
      process.env[ENV_KEY] = "";
      expect(getTrialWindow()).toBeNull();
    });

    it("returns null for an unparseable value — never throws", () => {
      process.env[ENV_KEY] = "not-a-date";
      expect(() => getTrialWindow()).not.toThrow();
      expect(getTrialWindow()).toBeNull();
    });

    it("resolves a valid ISO timestamp to a 7-day window", () => {
      const start = "2026-01-01T00:00:00.000Z";
      process.env[ENV_KEY] = start;
      const w = getTrialWindow();
      expect(w).not.toBeNull();
      expect(w!.startedAt.toISOString()).toBe(start);
      expect(w!.endsAt.getTime() - w!.startedAt.getTime()).toBe(7 * DAY_MS);
    });
  });

  describe("isFreeTrialActive", () => {
    it("is false when unset", () => {
      expect(isFreeTrialActive()).toBe(false);
    });

    it("is false when malformed — fails toward normal billing, never toward free access", () => {
      process.env[ENV_KEY] = "definitely-not-a-timestamp";
      expect(isFreeTrialActive()).toBe(false);
    });

    it("is true partway through the 7-day window", () => {
      const startedAt = Date.now() - 3 * DAY_MS;
      process.env[ENV_KEY] = new Date(startedAt).toISOString();
      expect(isFreeTrialActive()).toBe(true);
    });

    it("is true exactly at the start instant (inclusive)", () => {
      const startedAt = Date.now() - 1000;
      process.env[ENV_KEY] = new Date(startedAt).toISOString();
      expect(isFreeTrialActive(startedAt)).toBe(true);
    });

    it("is false exactly at the end instant (exclusive)", () => {
      const startedAt = Date.now() - 1000;
      process.env[ENV_KEY] = new Date(startedAt).toISOString();
      const endsAt = startedAt + 7 * DAY_MS;
      expect(isFreeTrialActive(endsAt)).toBe(false);
    });

    it("is true 1ms before the end instant", () => {
      const startedAt = Date.now() - 1000;
      process.env[ENV_KEY] = new Date(startedAt).toISOString();
      const endsAt = startedAt + 7 * DAY_MS;
      expect(isFreeTrialActive(endsAt - 1)).toBe(true);
    });

    it("is false before the start instant", () => {
      const startedAt = Date.now() + DAY_MS; // starts tomorrow
      process.env[ENV_KEY] = new Date(startedAt).toISOString();
      expect(isFreeTrialActive()).toBe(false);
    });

    it("is false long after the window closed (7+ days ago)", () => {
      const startedAt = Date.now() - 10 * DAY_MS;
      process.env[ENV_KEY] = new Date(startedAt).toISOString();
      expect(isFreeTrialActive()).toBe(false);
    });

    it("accepts an explicit `now` override for deterministic testing without waiting real days", () => {
      const startedAt = 1_000_000_000_000; // fixed, arbitrary epoch ms
      process.env[ENV_KEY] = new Date(startedAt).toISOString();
      expect(isFreeTrialActive(startedAt - 1)).toBe(false);
      expect(isFreeTrialActive(startedAt)).toBe(true);
      expect(isFreeTrialActive(startedAt + 3 * DAY_MS)).toBe(true);
      expect(isFreeTrialActive(startedAt + 7 * DAY_MS - 1)).toBe(true);
      expect(isFreeTrialActive(startedAt + 7 * DAY_MS)).toBe(false);
    });
  });
});
