import { describe, it, expect, beforeAll } from "vitest";
import { resetTestDb } from "./pg-test.js";
import { createAccount } from "./billing-store.js";
import {
  saveSentryConnection,
  getSentryConnections,
  getSentryConnectionDecrypted,
  getSentryConnectionsForProject,
  deleteSentryConnection,
  markSentryConnectionInvalid,
} from "./sentry-token-store.js";

// app_32's connect-flow store. The load-bearing properties: secrets round-trip
// through AES-256-GCM, the metadata view NEVER carries a decrypted (or even
// encrypted) secret, and the webhook's candidate lookup excludes connections
// without a stored webhook secret (fail closed — they can't trigger anything).

describe("sentry-token-store", () => {
  let account_id: string;

  beforeAll(async () => {
    await resetTestDb();
    const account = await createAccount("sentry-store-test", "sentry-store-test@example.com");
    account_id = account.account_id;
  });

  it("round-trips the token and webhook secret through encryption", async () => {
    const saved = await saveSentryConnection(
      account_id, "sntrys_secret_value_123", "octo-org", "app", "octo/app",
      { webhook_secret: "whsec_abc123" },
    );
    expect(saved.token_prefix).toBe("sntrys_s");
    expect(saved.has_webhook_secret).toBe(true);

    const decrypted = await getSentryConnectionDecrypted(account_id, "octo/app");
    expect(decrypted?.token).toBe("sntrys_secret_value_123");
    expect(decrypted?.webhook_secret).toBe("whsec_abc123");
    expect(decrypted?.org_slug).toBe("octo-org");
  });

  it("metadata listing exposes the prefix only — no secret in any field", async () => {
    const connections = await getSentryConnections(account_id);
    expect(connections.length).toBeGreaterThan(0);
    for (const c of connections) {
      const serialized = JSON.stringify(c);
      expect(serialized).not.toContain("sntrys_secret_value_123");
      expect(serialized).not.toContain("whsec_abc123");
      // Not even the ciphertext leaves the store on the metadata path.
      expect(serialized).not.toMatch(/[0-9a-f]{24}:[0-9a-f]{32}:/);
    }
  });

  it("webhook candidate lookup finds connections by project slug — and excludes secretless ones (fail closed)", async () => {
    await saveSentryConnection(account_id, "read-only-token", "octo-org", "app", "octo/other-repo", {});
    const candidates = await getSentryConnectionsForProject("app");
    // The secretless connection exists but is not a webhook candidate.
    expect(candidates.some((c) => c.repo_full_name === "octo/other-repo")).toBe(false);
    expect(candidates.some((c) => c.repo_full_name === "octo/app" && c.webhook_secret === "whsec_abc123")).toBe(true);
  });

  it("newest valid connection wins for a repo; invalidated ones drop out", async () => {
    const newer = await saveSentryConnection(
      account_id, "newer-token", "octo-org", "app", "octo/app",
      { webhook_secret: "whsec_new" },
    );
    expect((await getSentryConnectionDecrypted(account_id, "octo/app"))?.token).toBe("newer-token");

    await markSentryConnectionInvalid(newer.token_id);
    expect((await getSentryConnectionDecrypted(account_id, "octo/app"))?.token).toBe("sntrys_secret_value_123");
  });

  it("delete is account-scoped and reports whether anything was removed", async () => {
    const saved = await saveSentryConnection(account_id, "to-delete", "octo-org", "tmp", "octo/tmp", {});
    expect(await deleteSentryConnection("someone-else", saved.token_id)).toBe(false);
    expect(await deleteSentryConnection(account_id, saved.token_id)).toBe(true);
    expect(await deleteSentryConnection(account_id, saved.token_id)).toBe(false);
  });
});
