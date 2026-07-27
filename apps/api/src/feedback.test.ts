// Feedback / support-ticket intake. Split deliberately: the validation and
// email-composition rules are pure and tested directly, while the handler is
// exercised over a real HTTP server so the router's body reading, JSON
// handling and error envelope are all in the loop rather than assumed.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import type { Server } from "node:http";
import { resetTestDb } from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { resetRateLimits } from "./rate-limiter.js";
import {
  handleFeedback,
  validateFeedback,
  allowSubmission,
  resetSubmissionWindows,
  supportInbox,
  buildTicketSubject,
  buildTicketText,
  buildTicketHtml,
  FEEDBACK_CATEGORIES,
  MESSAGE_MIN,
  MESSAGE_MAX,
  type FeedbackInput,
  type TicketContext,
} from "./feedback.js";

let server: Server;
let testPort = 0;

interface Res { status: number; data: string }

function req(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const r = require("node:http").request(
      {
        hostname: "127.0.0.1",
        port: testPort,
        path,
        method,
        headers: { ...(payload ? { "Content-Type": "application/json" } : {}), ...headers },
      },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, data: Buffer.concat(chunks).toString("utf-8") }));
      },
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

beforeAll(async () => {
  await resetTestDb();
  const router = new Router();
  router.post("/v1/feedback", handleFeedback);
  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterAll(() => { server?.close(); });

beforeEach(() => {
  resetSubmissionWindows();
  resetRateLimits();
});

// ─── validateFeedback ────────────────────────────────────────────

describe("validateFeedback", () => {
  it("accepts a minimal submission — message only", () => {
    const out = validateFeedback({ message: "The export button does nothing on Safari." });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.email).toBeNull();
    expect(out.value.rating).toBeNull();
    expect(out.value.category).toBe("other"); // unstated, not guessed
  });

  it("rejects a missing or too-short message", () => {
    expect(validateFeedback({})).toMatchObject({ ok: false, field: "message" });
    expect(validateFeedback({ message: "   " })).toMatchObject({ ok: false, field: "message" });
    expect(validateFeedback({ message: "x".repeat(MESSAGE_MIN - 1) })).toMatchObject({ ok: false, field: "message" });
  });

  it("accepts exactly the minimum length (boundary, not near-boundary)", () => {
    expect(validateFeedback({ message: "x".repeat(MESSAGE_MIN) }).ok).toBe(true);
  });

  it("rejects a message over the cap but accepts exactly the cap", () => {
    expect(validateFeedback({ message: "x".repeat(MESSAGE_MAX) }).ok).toBe(true);
    expect(validateFeedback({ message: "x".repeat(MESSAGE_MAX + 1) })).toMatchObject({ ok: false, field: "message" });
  });

  it("trims the message rather than counting whitespace toward the minimum", () => {
    const out = validateFeedback({ message: `   ${"x".repeat(MESSAGE_MIN)}   ` });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.message).toBe("x".repeat(MESSAGE_MIN));
  });

  it("rejects a malformed email but treats absent/empty as anonymous", () => {
    expect(validateFeedback({ message: "a".repeat(20), email: "not-an-email" })).toMatchObject({ ok: false, field: "email" });
    for (const email of [undefined, null, ""]) {
      const out = validateFeedback({ message: "a".repeat(20), email });
      expect(out.ok).toBe(true);
      if (out.ok) expect(out.value.email).toBeNull();
    }
  });

  it("accepts every advertised category and rejects anything else", () => {
    for (const category of FEEDBACK_CATEGORIES) {
      const out = validateFeedback({ message: "a".repeat(20), category });
      expect(out.ok).toBe(true);
      if (out.ok) expect(out.value.category).toBe(category);
    }
    expect(validateFeedback({ message: "a".repeat(20), category: "urgent" })).toMatchObject({ ok: false, field: "category" });
  });

  it("accepts ratings 1-5 and rejects out-of-range or fractional ones", () => {
    for (const rating of [1, 2, 3, 4, 5]) {
      expect(validateFeedback({ message: "a".repeat(20), rating }).ok).toBe(true);
    }
    for (const rating of [0, 6, -1, 2.5]) {
      expect(validateFeedback({ message: "a".repeat(20), rating })).toMatchObject({ ok: false, field: "rating" });
    }
  });

  it("caps the page field instead of rejecting a long one (context is a nicety, not a gate)", () => {
    const out = validateFeedback({ message: "a".repeat(20), page: "p".repeat(500) });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.page).toHaveLength(200);
  });
});

// ─── Throttle ────────────────────────────────────────────────────

describe("allowSubmission", () => {
  it("allows up to the hourly cap then blocks", () => {
    const ip = "203.0.113.5";
    for (let i = 0; i < 5; i++) expect(allowSubmission(ip)).toBe(true);
    expect(allowSubmission(ip)).toBe(false);
  });

  it("counts per network prefix, so rotating the host address does not reset the cap", () => {
    for (let i = 0; i < 5; i++) expect(allowSubmission(`203.0.113.${i}`)).toBe(true);
    // Different address, same /24 — must share the budget.
    expect(allowSubmission("203.0.113.250")).toBe(false);
  });

  it("keeps unrelated networks independent", () => {
    for (let i = 0; i < 6; i++) allowSubmission("203.0.113.5");
    expect(allowSubmission("198.51.100.5")).toBe(true);
  });
});

// ─── Email composition ───────────────────────────────────────────

const CTX: TicketContext = {
  ticket_id: "AXIS-DEADBEEF",
  account_id: "acct_123",
  tier: "free",
  user_agent: "Mozilla/5.0",
  request_id: "req-1",
  submitted_at: "2026-07-27T00:00:00.000Z",
};

function input(over: Partial<FeedbackInput> = {}): FeedbackInput {
  return { message: "Export fails on Safari", email: "user@example.com", category: "bug", rating: 3, page: "#projects", ...over };
}

describe("ticket composition", () => {
  it("puts category, rating and ticket id in the subject so the inbox is triageable at a glance", () => {
    const subject = buildTicketSubject(input(), "AXIS-DEADBEEF");
    expect(subject).toContain("bug");
    expect(subject).toContain("3/5");
    expect(subject).toContain("AXIS-DEADBEEF");
  });

  it("omits the rating from the subject when none was given rather than printing null", () => {
    expect(buildTicketSubject(input({ rating: null }), "AXIS-1")).not.toContain("null");
  });

  it("carries the full triage context and the message body", () => {
    const text = buildTicketText(input(), CTX);
    expect(text).toContain("Export fails on Safari");
    expect(text).toContain("user@example.com");
    expect(text).toContain("acct_123");
    expect(text).toContain("free");
    expect(text).toContain("AXIS-DEADBEEF");
    expect(text).toContain("req-1");
  });

  it("flags an anonymous ticket explicitly in both bodies (it cannot be answered)", () => {
    const anon = input({ email: null });
    expect(buildTicketText(anon, CTX)).toContain("cannot be answered");
    expect(buildTicketHtml(anon, CTX)).toContain("cannot be answered");
  });

  it("escapes HTML in the customer's message so a report about markup can't inject it", () => {
    const html = buildTicketHtml(input({ message: "<script>alert(1)</script> broke it" }), CTX);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

// ─── Handler ─────────────────────────────────────────────────────

describe("POST /v1/feedback", () => {
  // The handler's success path needs a configured provider; these cases cover
  // everything that must be rejected BEFORE any send is attempted, plus the
  // honest not-configured behaviour.
  const priorKey = process.env.RESEND_API_KEY;
  const priorFrom = process.env.RESEND_FROM_ADDRESS;

  afterEach(() => {
    if (priorKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = priorKey;
    if (priorFrom === undefined) delete process.env.RESEND_FROM_ADDRESS; else process.env.RESEND_FROM_ADDRESS = priorFrom;
  });

  it("rejects a non-JSON body with a usable hint", async () => {
    const res = await req("POST", "/v1/feedback", undefined, { "Content-Type": "application/json" });
    expect(res.status).toBe(400);
    expect(JSON.parse(res.data).error_code).toBe("INVALID_JSON");
  });

  it("rejects a too-short message with the offending field named", async () => {
    const res = await req("POST", "/v1/feedback", { message: "hi" });
    expect(res.status).toBe(400);
    const body = JSON.parse(res.data);
    expect(body.error_code).toBe("INVALID_FORMAT");
    expect(body.field).toBe("message");
  });

  it("rejects an invalid category", async () => {
    const res = await req("POST", "/v1/feedback", { message: "a".repeat(20), category: "nope" });
    expect(res.status).toBe(400);
    expect(JSON.parse(res.data).field).toBe("category");
  });

  it("returns an honest 503 with a fallback address when email is not configured — never a fake success", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_ADDRESS;
    const res = await req("POST", "/v1/feedback", { message: "Something is broken here." });
    expect(res.status).toBe(503);
    const body = JSON.parse(res.data);
    expect(body.error).toContain("NOT sent");
    expect(body.fallback_email).toBe(supportInbox());
    expect(body.ticket_id).toMatch(/^AXIS-/);
  });

  it("throttles a network after the hourly cap and points at the direct address", async () => {
    process.env.RESEND_API_KEY = "";       // keep the send path unreachable
    process.env.RESEND_FROM_ADDRESS = "";
    for (let i = 0; i < 5; i++) {
      await req("POST", "/v1/feedback", { message: `Report number ${i} about a real problem.` });
    }
    const res = await req("POST", "/v1/feedback", { message: "One more report about a real problem." });
    expect(res.status).toBe(429);
    const body = JSON.parse(res.data);
    expect(body.error_code).toBe("RATE_LIMITED");
    expect(body.alternative).toContain(supportInbox());
  });

  it("does not spend throttle budget on submissions that failed validation", async () => {
    for (let i = 0; i < 8; i++) {
      const bad = await req("POST", "/v1/feedback", { message: "no" });
      expect(bad.status).toBe(400);
    }
    // A valid submission still gets through: the invalid ones never counted.
    delete process.env.RESEND_API_KEY;
    const res = await req("POST", "/v1/feedback", { message: "A genuinely valid report." });
    expect(res.status).not.toBe(429);
  });
});

describe("supportInbox", () => {
  it("defaults to the estate's published support address", () => {
    const prior = process.env.SUPPORT_EMAIL;
    delete process.env.SUPPORT_EMAIL;
    try {
      expect(supportInbox()).toBe("support@jonathanarvay.com");
    } finally {
      if (prior !== undefined) process.env.SUPPORT_EMAIL = prior;
    }
  });
});
