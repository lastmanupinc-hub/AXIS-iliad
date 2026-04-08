import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { openMemoryDb, closeDb, getDb } from "./db.js";
import {
  renderTemplate,
  recordEmailDelivery,
  getEmailDeliveries,
  getEmailDelivery,
  setEmailProvider,
  getEmailProvider,
  consoleEmailProvider,
  sendEmail,
  sendSeatInvitation,
  sendWelcomeEmail,
  sendUpgradeConfirmation,
  sendUsageAlert,
  sendApiKeyNotification,
  type EmailMessage,
  type EmailProvider,
} from "./email-store.js";

beforeEach(() => { openMemoryDb(); });
afterEach(() => {
  setEmailProvider(null as unknown as EmailProvider);
  closeDb();
});

// ─── Template rendering ─────────────────────────────────────────

describe("renderTemplate", () => {
  it("renders seat_invitation template", () => {
    const result = renderTemplate("seat_invitation", {
      invitee_email: "bob@co.com",
      org_name: "Acme Inc",
      inviter_name: "Alice",
      role: "member",
      accept_url: "http://localhost:3000/account?accept_seat=abc",
    });
    expect(result.subject).toBe("You've been invited to Acme Inc on AXIS Toolbox");
    expect(result.body).toContain("Alice has invited you");
    expect(result.body).toContain("bob@co.com");
    expect(result.body).toContain("member");
    expect(result.body).toContain("accept_seat=abc");
  });

  it("renders welcome template", () => {
    const result = renderTemplate("welcome", { name: "Alice", tier: "free", web_url: "http://test" });
    expect(result.subject).toBe("Welcome to AXIS Toolbox, Alice!");
    expect(result.body).toContain("free plan");
    expect(result.body).toContain("http://test");
  });

  it("renders upgrade_confirmation template", () => {
    const result = renderTemplate("upgrade_confirmation", {
      name: "Bob", tier_name: "Pro", snapshots_limit: "200", projects_limit: "20", programs_count: "17",
    });
    expect(result.subject).toBe("You've upgraded to Pro!");
    expect(result.body).toContain("200 snapshots");
  });

  it("renders usage_alert template", () => {
    const result = renderTemplate("usage_alert", {
      name: "Carol", used: "8", limit: "10", percent: "80", upgrade_url: "http://upgrade",
    });
    expect(result.subject).toBe("AXIS Toolbox: You've used 80% of your monthly snapshots");
    expect(result.body).toContain("8 of 10");
  });

  it("renders api_key_created template", () => {
    const result = renderTemplate("api_key_created", {
      name: "Dave", label: "production", account_url: "http://acct",
    });
    expect(result.subject).toBe("New API key created on your AXIS Toolbox account");
    expect(result.body).toContain("production");
  });

  it("preserves unknown variables as mustache placeholders", () => {
    const result = renderTemplate("welcome", { name: "X" });
    expect(result.body).toContain("{{tier}}");
    expect(result.body).toContain("{{web_url}}");
  });
});

// ─── Delivery tracking ──────────────────────────────────────────

describe("recordEmailDelivery", () => {
  it("records a pending delivery", () => {
    const msg: EmailMessage = { to: "a@b.com", subject: "", template: "welcome", variables: { name: "A" } };
    const d = recordEmailDelivery(msg, "pending");
    expect(d.delivery_id).toBeTruthy();
    expect(d.status).toBe("pending");
    expect(d.sent_at).toBeNull();
    expect(d.error).toBeNull();
  });

  it("records a sent delivery with provider_id", () => {
    const msg: EmailMessage = { to: "a@b.com", subject: "", template: "welcome", variables: { name: "A" } };
    const d = recordEmailDelivery(msg, "sent", "ext-123");
    expect(d.status).toBe("sent");
    expect(d.provider_id).toBe("ext-123");
    expect(d.sent_at).toBeTruthy();
  });

  it("records a failed delivery with error", () => {
    const msg: EmailMessage = { to: "a@b.com", subject: "", template: "welcome", variables: { name: "A" } };
    const d = recordEmailDelivery(msg, "failed", undefined, "SMTP timeout");
    expect(d.status).toBe("failed");
    expect(d.error).toBe("SMTP timeout");
  });
});

describe("getEmailDeliveries", () => {
  it("returns deliveries by email", () => {
    const msg: EmailMessage = { to: "x@y.com", subject: "", template: "welcome", variables: { name: "X" } };
    recordEmailDelivery(msg, "sent", "p1");
    recordEmailDelivery({ ...msg, to: "other@y.com" }, "sent", "p2");

    const results = getEmailDeliveries("x@y.com");
    expect(results).toHaveLength(1);
    expect(results[0].to_email).toBe("x@y.com");
  });

  it("returns all deliveries when no email filter", () => {
    const msg: EmailMessage = { to: "a@b.com", subject: "", template: "welcome", variables: { name: "A" } };
    recordEmailDelivery(msg, "sent");
    recordEmailDelivery({ ...msg, to: "c@d.com" }, "sent");

    const results = getEmailDeliveries();
    expect(results).toHaveLength(2);
  });

  it("respects limit", () => {
    const msg: EmailMessage = { to: "a@b.com", subject: "", template: "welcome", variables: { name: "A" } };
    for (let i = 0; i < 5; i++) recordEmailDelivery(msg, "sent");

    const results = getEmailDeliveries(undefined, 3);
    expect(results).toHaveLength(3);
  });
});

describe("getEmailDelivery", () => {
  it("returns a specific delivery by ID", () => {
    const msg: EmailMessage = { to: "a@b.com", subject: "", template: "welcome", variables: { name: "A" } };
    const d = recordEmailDelivery(msg, "sent");

    const found = getEmailDelivery(d.delivery_id);
    expect(found).toBeDefined();
    expect(found!.delivery_id).toBe(d.delivery_id);
  });

  it("returns undefined for unknown ID", () => {
    expect(getEmailDelivery("no-such-id")).toBeUndefined();
  });
});

// ─── Provider system ────────────────────────────────────────────

describe("email provider", () => {
  it("starts with no provider", () => {
    expect(getEmailProvider()).toBeNull();
  });

  it("sets and gets a provider", () => {
    const provider: EmailProvider = async () => ({ provider_id: "test" });
    setEmailProvider(provider);
    expect(getEmailProvider()).toBe(provider);
  });
});

describe("consoleEmailProvider", () => {
  it("logs and returns a provider_id", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const provider = consoleEmailProvider();
    const result = await provider({
      to: "a@b.com", subject: "", template: "welcome", variables: { name: "Test" },
    });
    expect(result.provider_id).toMatch(/^console-/);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain("[EMAIL] To: a@b.com");
    spy.mockRestore();
  });
});

// ─── sendEmail ──────────────────────────────────────────────────

describe("sendEmail", () => {
  it("records as pending when no provider", async () => {
    const msg: EmailMessage = { to: "a@b.com", subject: "", template: "welcome", variables: { name: "A" } };
    const d = await sendEmail(msg);
    expect(d.status).toBe("pending");
  });

  it("sends via provider and records as sent", async () => {
    setEmailProvider(async () => ({ provider_id: "ext-ok" }));
    const msg: EmailMessage = { to: "a@b.com", subject: "", template: "welcome", variables: { name: "A" } };
    const d = await sendEmail(msg);
    expect(d.status).toBe("sent");
    expect(d.provider_id).toBe("ext-ok");
  });

  it("records as failed when provider throws", async () => {
    setEmailProvider(async () => { throw new Error("SMTP down"); });
    const msg: EmailMessage = { to: "a@b.com", subject: "", template: "welcome", variables: { name: "A" } };
    const d = await sendEmail(msg);
    expect(d.status).toBe("failed");
    expect(d.error).toBe("SMTP down");
  });

  it("records as failed with string error", async () => {
    setEmailProvider(async () => { throw "timeout"; });
    const msg: EmailMessage = { to: "a@b.com", subject: "", template: "welcome", variables: { name: "A" } };
    const d = await sendEmail(msg);
    expect(d.status).toBe("failed");
    expect(d.error).toBe("timeout");
  });
});

// ─── Convenience senders ────────────────────────────────────────

describe("convenience senders", () => {
  beforeEach(() => {
    setEmailProvider(async () => ({ provider_id: "test-ok" }));
  });

  it("sendSeatInvitation sends correct template", async () => {
    const d = await sendSeatInvitation("bob@co.com", "Acme", "Alice", "member", "seat-123");
    expect(d.status).toBe("sent");
    expect(d.template).toBe("seat_invitation");
    expect(d.subject).toContain("Acme");
    expect(d.to_email).toBe("bob@co.com");
  });

  it("sendWelcomeEmail sends correct template", async () => {
    const d = await sendWelcomeEmail("alice@test.com", "Alice", "free");
    expect(d.status).toBe("sent");
    expect(d.template).toBe("welcome");
    expect(d.subject).toContain("Alice");
  });

  it("sendUpgradeConfirmation sends correct template", async () => {
    const d = await sendUpgradeConfirmation("bob@test.com", "Bob", "Pro", "200", "20", "17");
    expect(d.status).toBe("sent");
    expect(d.template).toBe("upgrade_confirmation");
    expect(d.subject).toContain("Pro");
  });

  it("sendUsageAlert sends correct template", async () => {
    const d = await sendUsageAlert("carol@test.com", "Carol", "8", "10", "80");
    expect(d.status).toBe("sent");
    expect(d.template).toBe("usage_alert");
    expect(d.subject).toContain("80%");
  });

  it("sendApiKeyNotification sends correct template", async () => {
    const d = await sendApiKeyNotification("dave@test.com", "Dave", "production");
    expect(d.status).toBe("sent");
    expect(d.template).toBe("api_key_created");
    expect(d.subject).toContain("API key");
  });
});

// ─── Migration v10 check ────────────────────────────────────────

describe("Email migration", () => {
  it("email_deliveries table exists with correct columns", () => {
    const cols = getDb().pragma("table_info(email_deliveries)") as Array<{ name: string }>;
    const names = cols.map((c) => c.name).sort();
    expect(names).toEqual([
      "created_at", "delivery_id", "error", "provider_id",
      "sent_at", "status", "subject", "template", "to_email", "variables",
    ]);
  });
});
