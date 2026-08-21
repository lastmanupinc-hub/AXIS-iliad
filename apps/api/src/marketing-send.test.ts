import { describe, it, expect, vi } from "vitest";
import { sendSequenceStep, renderStepBodyText, type SendSequenceStepDeps } from "./marketing-send.js";
import type { MarketingSequenceStep } from "@axis/generator-core";

const STEP: MarketingSequenceStep = {
  label: "Email 1: Welcome",
  delay_days: 0,
  subject: "Welcome to Widget — here's your quickstart",
  body_bullets: ["Brief welcome and what Widget does", "Link to quickstart guide", "CTA: Try the quickstart"],
};

describe("renderStepBodyText", () => {
  it("labels the content as a draft brief, not finished copy", () => {
    const body = renderStepBodyText(STEP);
    expect(body).toContain("CONTENT BRIEF, not finished copy");
    expect(body).toContain("Replace the bullets below with real drafted copy");
  });

  it("includes every bullet from the step", () => {
    const body = renderStepBodyText(STEP);
    for (const bullet of STEP.body_bullets) expect(body).toContain(`- ${bullet}`);
  });
});

describe("sendSequenceStep", () => {
  it("reports not_configured honestly rather than attempting a send with no config", async () => {
    const send = vi.fn();
    const deps: SendSequenceStepDeps = { config: null, send };
    const result = await sendSequenceStep(STEP, "owner@example.com", deps);
    expect(result.status).toBe("not_configured");
    expect(send).not.toHaveBeenCalled();
  });

  it("sends a real, prefixed [TEST] subject with the draft body, and returns the real message id", async () => {
    const send = vi.fn(async (opts: { to: string; subject: string; body_text: string }) => {
      expect(opts.to).toBe("owner@example.com");
      expect(opts.subject).toBe("[TEST] Welcome to Widget — here's your quickstart");
      expect(opts.body_text).toContain("Link to quickstart guide");
      return { message_id: "msg_abc123", delivered_to: ["owner@example.com"], from: "axis@example.com", subject: opts.subject };
    });
    const deps: SendSequenceStepDeps = { config: { api_key: "k", from_address: "axis@example.com" }, send };
    const result = await sendSequenceStep(STEP, "owner@example.com", deps);
    expect(result).toEqual({ status: "sent", message_id: "msg_abc123" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("reports send_failed honestly with the real error, rather than throwing or reporting success", async () => {
    const send = vi.fn(async () => {
      throw new Error("Email provider error: 422 Domain not verified");
    });
    const deps: SendSequenceStepDeps = { config: { api_key: "k", from_address: "axis@example.com" }, send };
    const result = await sendSequenceStep(STEP, "owner@example.com", deps);
    expect(result.status).toBe("send_failed");
    if (result.status !== "send_failed") throw new Error("unreachable");
    expect(result.error).toContain("Domain not verified");
  });

  it("always prefixes the subject with [TEST] — a test-send must never look like a real campaign in the inbox", async () => {
    const send = vi.fn(async (opts: { subject: string }) => ({
      message_id: "m1", delivered_to: [], from: "a@a.com", subject: opts.subject,
    }));
    const deps: SendSequenceStepDeps = { config: { api_key: "k", from_address: "a@a.com" }, send };
    await sendSequenceStep(STEP, "owner@example.com", deps);
    const sentSubject = send.mock.calls[0]![0].subject;
    expect(sentSubject.startsWith("[TEST] ")).toBe(true);
  });
});
