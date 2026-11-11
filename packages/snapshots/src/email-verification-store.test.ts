/**
 * accounts.email_verified_at (AXIS Launch taskgate T106): how an account is created, marked, backfilled by the
 * migration, and verified by a social sign-in. Real Postgres.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { resetTestDb } from "./pg-test.js";
import { sql } from "./pg.js";
import { createAccount, getAccount, getAccountByEmail, markAccountEmailVerified, resolveApiKey, createApiKey } from "./billing-store.js";
import { upsertAccountByGitHub, upsertAccountByGoogle } from "./oauth-store.js";
import { PG_MIGRATIONS } from "./pg-schema.js";

beforeEach(async () => { await resetTestDb(); });

describe("createAccount", () => {
  it("is verified at creation unless the caller says null (the public signup does; its own test holds that)", async () => {
    const internal = await createAccount("Internal", "internal@test.com");
    expect(internal.email_verified_at).toMatch(/^\d{4}-/);
    const plain = await createAccount("Plain", "plain@test.com", "free", { email_verified_at: null });
    expect(plain.email_verified_at).toBeNull();
    expect((await getAccount(plain.account_id))?.email_verified_at).toBeNull();

    const attested = await createAccount("Attested", "attested@test.com", "free", { email_verified_at: "2026-11-10T00:00:00.000Z" });
    expect(attested.email_verified_at).toBe("2026-11-10T00:00:00.000Z");
    expect((await getAccount(attested.account_id))?.email_verified_at).toBe("2026-11-10T00:00:00.000Z");
  });

  it("resolveApiKey carries the verification time, so the gate sees it on every keyed call", async () => {
    const account = await createAccount("Keyed", "keyed@test.com", "free", { email_verified_at: null });
    const { rawKey } = await createApiKey(account.account_id, "k");
    expect((await resolveApiKey(rawKey))?.account.email_verified_at).toBeNull();
    await markAccountEmailVerified(account.account_id, "2026-11-10T01:02:03.000Z");
    expect((await resolveApiKey(rawKey))?.account.email_verified_at).toBe("2026-11-10T01:02:03.000Z");
  });
});

describe("markAccountEmailVerified", () => {
  it("marks once, reports already after, and keeps the first time", async () => {
    const account = await createAccount("Mark", "mark@test.com", "free", { email_verified_at: null });
    expect(await markAccountEmailVerified(account.account_id, "2026-11-10T01:00:00.000Z")).toBe("verified");
    expect(await markAccountEmailVerified(account.account_id, "2026-11-11T01:00:00.000Z")).toBe("already");
    expect((await getAccount(account.account_id))?.email_verified_at).toBe("2026-11-10T01:00:00.000Z");
    expect(await markAccountEmailVerified("00000000-0000-0000-0000-000000000000")).toBe("missing");
  });
});

describe("migration v49", () => {
  it("marks every account that existed before it as verified at its creation, and no account created after", async () => {
    const migration = PG_MIGRATIONS.find((m) => m.name === "accounts_email_verified_at");
    expect(migration?.version).toBe(49);
    const before = await createAccount("Before", "before@test.com", "free", { email_verified_at: null });
    expect(before.email_verified_at).toBeNull();
    for (const statement of migration!.sql.split(";").map((s) => s.trim()).filter(Boolean)) {
      await sql.run(statement);
    }
    expect((await getAccount(before.account_id))?.email_verified_at).toBe(before.created_at);
    const after = await createAccount("After", "after@test.com", "free", { email_verified_at: null });
    expect((await getAccount(after.account_id))?.email_verified_at).toBeNull();
  });
});

describe("social sign-ins attest the address", () => {
  it("a GitHub sign-in creates a verified account", async () => {
    const { account, created } = await upsertAccountByGitHub(4242, "Octo", "octo@test.com");
    expect(created).toBe(true);
    expect(account.email_verified_at).toMatch(/^\d{4}-/);
    expect((await getAccountByEmail("octo@test.com"))?.email_verified_at).toMatch(/^\d{4}-/);
  });

  it("a GitHub sign-in with the address of an unverified email sign-up verifies that account", async () => {
    const signup = await createAccount("Signup", "same@test.com", "free", { email_verified_at: null });
    expect(signup.email_verified_at).toBeNull();
    const { account, created } = await upsertAccountByGitHub(777, "Same", "same@test.com");
    expect(created).toBe(false);
    expect(account.account_id).toBe(signup.account_id);
    expect(account.email_verified_at).toMatch(/^\d{4}-/);
    expect((await getAccount(signup.account_id))?.email_verified_at).toMatch(/^\d{4}-/);
  });

  it("a Google sign-in does the same", async () => {
    const fresh = await upsertAccountByGoogle("sub-1", "Goo", "goo@test.com");
    expect(fresh.account.email_verified_at).toMatch(/^\d{4}-/);
    const signup = await createAccount("Signup", "goo2@test.com", "free", { email_verified_at: null });
    const merged = await upsertAccountByGoogle("sub-2", "Goo2", "goo2@test.com");
    expect(merged.created).toBe(false);
    expect((await getAccount(signup.account_id))?.email_verified_at).toMatch(/^\d{4}-/);
  });
});
