import { describe, it, expect, beforeAll } from "vitest";
import { resetTestDb } from "./pg-test.js";
import { createAccount } from "./billing-store.js";
import {
  saveProviderCredential,
  getProviderCredentials,
  getProviderCredentialDecrypted,
  getProviderCredentialsForRepo,
  deleteProviderCredential,
  markProviderCredentialInvalid,
} from "./provider-credential-store.js";

// app_33's connect-flow store. Load-bearing properties: the key round-trips
// through AES-256-GCM, the metadata view never carries a decrypted (or even
// encrypted) key, and getProviderCredentialsForRepo returns the newest VALID
// credential PER PROVIDER — the meter watcher pulls whichever providers are
// connected for a repo, not just whichever was saved most recently overall.

describe("provider-credential-store", () => {
  let account_id: string;

  beforeAll(async () => {
    await resetTestDb();
    const account = await createAccount("provider-store-test", "provider-store-test@example.com");
    account_id = account.account_id;
  });

  it("round-trips the key through encryption", async () => {
    const saved = await saveProviderCredential(account_id, "openai", "sk-secret-value-123", "octo/app");
    expect(saved.key_prefix).toBe("sk-secre");
    expect(saved.provider).toBe("openai");

    const decrypted = await getProviderCredentialDecrypted(account_id, "openai", "octo/app");
    expect(decrypted?.key).toBe("sk-secret-value-123");
  });

  it("metadata listing exposes the prefix only — no key in any field", async () => {
    const credentials = await getProviderCredentials(account_id);
    expect(credentials.length).toBeGreaterThan(0);
    for (const c of credentials) {
      const serialized = JSON.stringify(c);
      expect(serialized).not.toContain("sk-secret-value-123");
      // Not even the ciphertext leaves the store on the metadata path.
      expect(serialized).not.toMatch(/[0-9a-f]{24}:[0-9a-f]{32}:/);
    }
  });

  it("stores arbitrary metadata (e.g. an OpenAI organization id) as data, not a migration", async () => {
    const saved = await saveProviderCredential(account_id, "openai", "sk-org-scoped", "octo/org-repo", {
      metadata: { organization_id: "org-abc123" },
    });
    const credentials = await getProviderCredentials(account_id);
    const found = credentials.find((c) => c.credential_id === saved.credential_id);
    expect(found?.metadata).toEqual({ organization_id: "org-abc123" });
  });

  it("getProviderCredentialsForRepo returns the newest VALID credential per provider, not just overall", async () => {
    await saveProviderCredential(account_id, "anthropic", "sk-ant-first", "octo/multi");
    const credentials = await getProviderCredentialsForRepo(account_id, "octo/multi");
    // openai from earlier tests never touched octo/multi — only anthropic here.
    expect(credentials).toHaveLength(1);
    expect(credentials[0].provider).toBe("anthropic");

    await saveProviderCredential(account_id, "openai", "sk-oa-second", "octo/multi");
    const both = await getProviderCredentialsForRepo(account_id, "octo/multi");
    expect(both.map((c) => c.provider).sort()).toEqual(["anthropic", "openai"]);
  });

  it("newest valid credential wins for a provider+repo; invalidated ones drop out", async () => {
    const newer = await saveProviderCredential(account_id, "openai", "newer-key", "octo/app");
    expect((await getProviderCredentialDecrypted(account_id, "openai", "octo/app"))?.key).toBe("newer-key");

    await markProviderCredentialInvalid(newer.credential_id);
    expect((await getProviderCredentialDecrypted(account_id, "openai", "octo/app"))?.key).toBe("sk-secret-value-123");
  });

  it("delete is account-scoped and reports whether anything was removed", async () => {
    const saved = await saveProviderCredential(account_id, "anthropic", "to-delete", "octo/tmp");
    expect(await deleteProviderCredential("someone-else", saved.credential_id)).toBe(false);
    expect(await deleteProviderCredential(account_id, saved.credential_id)).toBe(true);
    expect(await deleteProviderCredential(account_id, saved.credential_id)).toBe(false);
  });
});
