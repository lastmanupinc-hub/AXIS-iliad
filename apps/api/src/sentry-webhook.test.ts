import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  verifySentrySignature,
  extractSentryIncidentRef,
  processSentryWebhook,
  type SentryWebhookDeps,
} from "./sentry-webhook.js";
import type { SentryConnectionSecrets } from "@axis/snapshots";

// app_32's W trigger. The load-bearing property: multi-tenant verification
// against PER-CONNECTION secrets — parsing happens before verification, but
// nothing is actioned and nothing project-specific is leaked until a
// signature verifies against some candidate's own stored secret.

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

function conn(over: Partial<SentryConnectionSecrets> = {}): SentryConnectionSecrets {
  return {
    token_id: "tok-1",
    account_id: "acc-1",
    org_slug: "octo-org",
    project_slug: "app",
    repo_full_name: "octo/app",
    token: "sentry-token",
    webhook_secret: "whsec-1",
    ...over,
  };
}

const ISSUE_BODY = JSON.stringify({
  action: "created",
  data: { issue: { id: 12345, project: { slug: "app" } } },
});

function makeDeps(opts: {
  connections?: SentryConnectionSecrets[];
  subscribed?: boolean;
  enqueueShouldThrow?: boolean;
} = {}) {
  const enqueued: Array<Record<string, unknown>> = [];
  const deps: SentryWebhookDeps = {
    getConnectionsForProject: async () => opts.connections ?? [conn()],
    getSubscription: async () => (opts.subscribed === false ? undefined : { exists: true }),
    enqueue: async (payload) => {
      if (opts.enqueueShouldThrow) throw new Error("queue down");
      enqueued.push(payload as unknown as Record<string, unknown>);
      return "job-1";
    },
  };
  return { deps, enqueued };
}

describe("verifySentrySignature", () => {
  it("accepts the correct HMAC and rejects a wrong secret, tampered body, and garbage header", () => {
    const body = '{"x":1}';
    expect(verifySentrySignature(body, sign(body, "s"), "s")).toBe(true);
    expect(verifySentrySignature(body, sign(body, "wrong"), "s")).toBe(false);
    expect(verifySentrySignature('{"x":2}', sign(body, "s"), "s")).toBe(false);
    expect(verifySentrySignature(body, "not-hex-at-all", "s")).toBe(false);
    expect(verifySentrySignature(body, undefined, "s")).toBe(false);
  });
});

describe("extractSentryIncidentRef", () => {
  it("reads the issue-lifecycle shape (data.issue)", () => {
    expect(extractSentryIncidentRef(JSON.parse(ISSUE_BODY))).toEqual({ issue_id: "12345", project_slug: "app" });
  });

  it("reads the event-alert shape (data.event)", () => {
    expect(
      extractSentryIncidentRef({ data: { event: { issue_id: "77", project_slug: "app" } } }),
    ).toEqual({ issue_id: "77", project_slug: "app" });
  });

  it("returns null on pings and unknown shapes rather than guessing", () => {
    expect(extractSentryIncidentRef({ installation: { uuid: "u" } })).toBeNull();
    expect(extractSentryIncidentRef("nope")).toBeNull();
    expect(extractSentryIncidentRef(null)).toBeNull();
  });
});

describe("processSentryWebhook", () => {
  it("enqueues one debug job per verified, subscribed connection — with the issue id", async () => {
    const { deps, enqueued } = makeDeps();
    const outcome = await processSentryWebhook(ISSUE_BODY, sign(ISSUE_BODY, "whsec-1"), deps);
    expect(outcome.http_status).toBe(200);
    expect(outcome.body).toEqual({ handled: true, enqueued: 1 });
    expect(enqueued[0]).toMatchObject({
      account_id: "acc-1",
      product_id: "debug",
      repo_full_name: "octo/app",
      event_type: "sentry_incident",
      sentry_issue_id: "12345",
    });
  });

  it("returns one uniform 401 whether the project is unknown or the signature is wrong — no existence oracle", async () => {
    const unknownProject = await processSentryWebhook(
      ISSUE_BODY,
      sign(ISSUE_BODY, "whsec-1"),
      makeDeps({ connections: [] }).deps,
    );
    const wrongSig = await processSentryWebhook(ISSUE_BODY, sign(ISSUE_BODY, "attacker"), makeDeps().deps);
    expect(unknownProject.http_status).toBe(401);
    expect(wrongSig.http_status).toBe(401);
    expect(unknownProject.body).toEqual(wrongSig.body);
  });

  it("a verified connection without a debug subscription enqueues nothing — a stored token is not consent to watch", async () => {
    const { deps, enqueued } = makeDeps({ subscribed: false });
    const outcome = await processSentryWebhook(ISSUE_BODY, sign(ISSUE_BODY, "whsec-1"), deps);
    expect(outcome.http_status).toBe(200);
    expect(outcome.body).toEqual({ handled: true, enqueued: 0 });
    expect(enqueued).toHaveLength(0);
  });

  it("verifies per-candidate: only the connection whose OWN secret signed the body triggers", async () => {
    const a = conn({ token_id: "a", account_id: "acc-a", repo_full_name: "a/repo", webhook_secret: "secret-a" });
    const b = conn({ token_id: "b", account_id: "acc-b", repo_full_name: "b/repo", webhook_secret: "secret-b" });
    const { deps, enqueued } = makeDeps({ connections: [a, b] });
    const outcome = await processSentryWebhook(ISSUE_BODY, sign(ISSUE_BODY, "secret-b"), deps);
    expect(outcome.body).toEqual({ handled: true, enqueued: 1 });
    expect(enqueued[0]).toMatchObject({ account_id: "acc-b", repo_full_name: "b/repo" });
  });

  it("acknowledges non-incident payloads as handled:false without touching the store", async () => {
    let looked = false;
    const deps: SentryWebhookDeps = {
      getConnectionsForProject: async () => {
        looked = true;
        return [];
      },
      getSubscription: async () => undefined,
      enqueue: async () => null,
    };
    const outcome = await processSentryWebhook('{"installation":{"uuid":"u"}}', undefined, deps);
    expect(outcome.http_status).toBe(200);
    expect(outcome.body.handled).toBe(false);
    expect(looked).toBe(false);
  });

  it("rejects invalid JSON with 400", async () => {
    const outcome = await processSentryWebhook("{nope", undefined, makeDeps().deps);
    expect(outcome.http_status).toBe(400);
  });

  it("fail-open: an enqueue failure still acks 200 so Sentry doesn't re-fire everything else", async () => {
    const { deps } = makeDeps({ enqueueShouldThrow: true });
    const outcome = await processSentryWebhook(ISSUE_BODY, sign(ISSUE_BODY, "whsec-1"), deps);
    expect(outcome.http_status).toBe(200);
    expect(outcome.body).toEqual({ handled: true, enqueued: 0 });
  });
});
