import { describe, it, expect } from "vitest";
import {
  sendTransactionalEmail,
  readEmailConfigFromEnv,
  DEFAULT_RESEND_BASE_URL,
  type EmailConfig,
} from "./email.js";

const config: EmailConfig = { api_key: "re_test_xxx", from_address: "noreply@axis-test.local" };

function mockFetch(opts: { ok?: boolean; status?: number; body: unknown; isJson?: boolean }): typeof fetch {
  const ok = opts.ok ?? true;
  const status = opts.status ?? (ok ? 200 : 500);
  return (async () => ({
    ok,
    status,
    async json() {
      if (opts.isJson === false) throw new Error("not json");
      return opts.body;
    },
  }) as Response) as unknown as typeof fetch;
}

// ─── readEmailConfigFromEnv ────────────────────────────────────

describe("readEmailConfigFromEnv", () => {
  it("returns null when RESEND_API_KEY is missing", () => {
    expect(readEmailConfigFromEnv({ RESEND_FROM_ADDRESS: "x@y.z" })).toBeNull();
  });

  it("returns null when RESEND_FROM_ADDRESS is missing", () => {
    expect(readEmailConfigFromEnv({ RESEND_API_KEY: "k" })).toBeNull();
  });

  it("returns full config when both are set", () => {
    expect(
      readEmailConfigFromEnv({ RESEND_API_KEY: "k", RESEND_FROM_ADDRESS: "x@y.z" }),
    ).toEqual({ api_key: "k", from_address: "x@y.z" });
  });
});

// ─── sendTransactionalEmail happy path ─────────────────────────

describe("sendTransactionalEmail", () => {
  it("returns the message id from Resend", async () => {
    const fetch = mockFetch({ body: { id: "msg_abc123" } });
    const r = await sendTransactionalEmail(
      { to: "alice@example.com", subject: "Hello", body_text: "Hi Alice" },
      config,
      fetch,
    );
    expect(r.message_id).toBe("msg_abc123");
    expect(r.delivered_to).toEqual(["alice@example.com"]);
    expect(r.from).toBe(config.from_address);
    expect(r.subject).toBe("Hello");
  });

  it("accepts an array of recipients", async () => {
    const fetch = mockFetch({ body: { id: "m1" } });
    const r = await sendTransactionalEmail(
      { to: ["a@a.com", "b@b.com"], subject: "s", body_text: "x" },
      config,
      fetch,
    );
    expect(r.delivered_to).toEqual(["a@a.com", "b@b.com"]);
  });

  it("posts to <baseUrl>/emails with Bearer auth + JSON body", async () => {
    let url = "";
    let headers: HeadersInit | undefined;
    let body: string | undefined;
    const stub = (async (u: string | URL, init?: RequestInit) => {
      url = String(u);
      headers = init?.headers;
      body = String(init?.body);
      return { ok: true, status: 200, async json() { return { id: "m1" }; } } as Response;
    }) as unknown as typeof fetch;

    await sendTransactionalEmail(
      { to: "a@a.com", subject: "s", body_text: "x", body_html: "<p>x</p>", reply_to: "r@r.com" },
      config,
      stub,
    );

    expect(url).toBe(`${DEFAULT_RESEND_BASE_URL}/emails`);
    const h = headers as Record<string, string>;
    expect(h.Authorization).toBe(`Bearer ${config.api_key}`);
    expect(h["Content-Type"]).toBe("application/json");

    const parsed = JSON.parse(body!);
    expect(parsed.from).toBe(config.from_address);
    expect(parsed.to).toEqual(["a@a.com"]);
    expect(parsed.subject).toBe("s");
    expect(parsed.text).toBe("x");
    expect(parsed.html).toBe("<p>x</p>");
    expect(parsed.reply_to).toBe("r@r.com");
  });

  it("omits html / text / reply_to fields when not provided", async () => {
    let body: string | undefined;
    const stub = (async (_u: string | URL, init?: RequestInit) => {
      body = String(init?.body);
      return { ok: true, status: 200, async json() { return { id: "m1" }; } } as Response;
    }) as unknown as typeof fetch;

    await sendTransactionalEmail(
      { to: "a@a.com", subject: "s", body_text: "x" },
      config,
      stub,
    );
    const parsed = JSON.parse(body!);
    expect(parsed.html).toBeUndefined();
    expect(parsed.reply_to).toBeUndefined();
    expect(parsed.text).toBe("x");
  });
});

// ─── sendTransactionalEmail error paths ────────────────────────

describe("sendTransactionalEmail error handling", () => {
  it("rejects when both body fields are missing", async () => {
    await expect(
      sendTransactionalEmail({ to: "a@a.com", subject: "s" }, config, mockFetch({ body: {} })),
    ).rejects.toThrow(/at least one of body_html \/ body_text/i);
  });

  it("rejects empty recipient list", async () => {
    await expect(
      sendTransactionalEmail({ to: [], subject: "s", body_text: "x" }, config, mockFetch({ body: {} })),
    ).rejects.toThrow(/at least one recipient/i);
  });

  it("rejects oversized recipient list", async () => {
    const many = Array.from({ length: 51 }, (_, i) => `user${i}@example.com`);
    await expect(
      sendTransactionalEmail({ to: many, subject: "s", body_text: "x" }, config, mockFetch({ body: {} })),
    ).rejects.toThrow(/capped at 50/);
  });

  it("rejects invalid recipient addresses", async () => {
    await expect(
      sendTransactionalEmail({ to: "not-an-email", subject: "s", body_text: "x" }, config, mockFetch({ body: {} })),
    ).rejects.toThrow(/valid email/i);
    await expect(
      sendTransactionalEmail({ to: ["a@a.com", "bad"], subject: "s", body_text: "x" }, config, mockFetch({ body: {} })),
    ).rejects.toThrow(/recipient\[1\]/);
  });

  it("rejects invalid reply_to", async () => {
    await expect(
      sendTransactionalEmail({ to: "a@a.com", subject: "s", body_text: "x", reply_to: "bad" }, config, mockFetch({ body: {} })),
    ).rejects.toThrow(/reply_to/);
  });

  it("rejects missing or empty subject", async () => {
    await expect(
      // @ts-expect-error — exercising runtime guard
      sendTransactionalEmail({ to: "a@a.com", body_text: "x" }, config, mockFetch({ body: {} })),
    ).rejects.toThrow(/subject is required/i);
    await expect(
      sendTransactionalEmail({ to: "a@a.com", subject: "", body_text: "x" }, config, mockFetch({ body: {} })),
    ).rejects.toThrow(/subject is required/i);
  });

  it("rejects oversized subject", async () => {
    const big = "a".repeat(999);
    await expect(
      sendTransactionalEmail({ to: "a@a.com", subject: big, body_text: "x" }, config, mockFetch({ body: {} })),
    ).rejects.toThrow(/998/);
  });

  it("rejects oversized bodies", async () => {
    const huge = "a".repeat(1_000_001);
    await expect(
      sendTransactionalEmail({ to: "a@a.com", subject: "s", body_html: huge }, config, mockFetch({ body: {} })),
    ).rejects.toThrow(/1 MB/);
  });

  it("rejects when api_key or from_address is missing in config", async () => {
    const noKey = { ...config, api_key: "" };
    await expect(
      sendTransactionalEmail({ to: "a@a.com", subject: "s", body_text: "x" }, noKey, mockFetch({ body: {} })),
    ).rejects.toThrow(/api_key/);
    const noFrom = { ...config, from_address: "" };
    await expect(
      sendTransactionalEmail({ to: "a@a.com", subject: "s", body_text: "x" }, noFrom, mockFetch({ body: {} })),
    ).rejects.toThrow(/from_address/);
  });

  it("rejects an invalid RESEND_FROM_ADDRESS defensively", async () => {
    const bad = { ...config, from_address: "not-an-email" };
    await expect(
      sendTransactionalEmail({ to: "a@a.com", subject: "s", body_text: "x" }, bad, mockFetch({ body: {} })),
    ).rejects.toThrow(/RESEND_FROM_ADDRESS/);
  });

  it("normalises 4xx provider errors with JSON body", async () => {
    const fetch = mockFetch({
      ok: false,
      status: 422,
      body: { message: "Domain not verified", statusCode: 422 },
    });
    await expect(
      sendTransactionalEmail({ to: "a@a.com", subject: "s", body_text: "x" }, config, fetch),
    ).rejects.toThrow(/422 Domain not verified/);
  });

  it("normalises 5xx provider errors with no JSON body", async () => {
    const fetch = mockFetch({ ok: false, status: 503, body: null, isJson: false });
    await expect(
      sendTransactionalEmail({ to: "a@a.com", subject: "s", body_text: "x" }, config, fetch),
    ).rejects.toThrow(/HTTP 503/);
  });

  it("maps fetch network errors to a clean message", async () => {
    const fetch = (async () => { throw new Error("ENOTFOUND api.resend.com"); }) as unknown as typeof fetch;
    await expect(
      sendTransactionalEmail({ to: "a@a.com", subject: "s", body_text: "x" }, config, fetch),
    ).rejects.toThrow(/Email provider unreachable/);
  });

  it("rejects responses with no message id", async () => {
    const fetch = mockFetch({ body: { something: "else" } });
    await expect(
      sendTransactionalEmail({ to: "a@a.com", subject: "s", body_text: "x" }, config, fetch),
    ).rejects.toThrow(/no message id/);
  });

  it("rejects non-JSON responses", async () => {
    const fetch = mockFetch({ body: null, isJson: false });
    await expect(
      sendTransactionalEmail({ to: "a@a.com", subject: "s", body_text: "x" }, config, fetch),
    ).rejects.toThrow(/non-JSON response/);
  });
});
