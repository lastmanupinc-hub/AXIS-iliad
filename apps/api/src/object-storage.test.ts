import { describe, it, expect } from "vitest";
import { presignR2Url, presignR2List, presignR2Copy, casKey, readR2ConfigFromEnv, scopeAccountKey, type R2Config } from "./object-storage.js";

// ─── readR2ConfigFromEnv ────────────────────────────────────────

describe("readR2ConfigFromEnv", () => {
  it("returns null when any field is missing", () => {
    expect(readR2ConfigFromEnv({})).toBeNull();
    expect(readR2ConfigFromEnv({ R2_ACCOUNT_ID: "a", R2_ACCESS_KEY_ID: "b" })).toBeNull();
    expect(readR2ConfigFromEnv({
      R2_ACCOUNT_ID: "a",
      R2_ACCESS_KEY_ID: "b",
      R2_SECRET_ACCESS_KEY: "c",
      R2_BUCKET: "",
    })).toBeNull();
  });

  it("returns the full config when all four vars are set", () => {
    const cfg = readR2ConfigFromEnv({
      R2_ACCOUNT_ID: "acct123",
      R2_ACCESS_KEY_ID: "AKIAEXAMPLE",
      R2_SECRET_ACCESS_KEY: "secret/with+special=chars",
      R2_BUCKET: "axis-staging",
    });
    expect(cfg).toEqual({
      account_id: "acct123",
      access_key_id: "AKIAEXAMPLE",
      secret_access_key: "secret/with+special=chars",
      bucket: "axis-staging",
    });
  });

  it("ignores unrelated env keys", () => {
    const cfg = readR2ConfigFromEnv({
      R2_ACCOUNT_ID: "a",
      R2_ACCESS_KEY_ID: "b",
      R2_SECRET_ACCESS_KEY: "c",
      R2_BUCKET: "d",
      RANDOM: "ignore me",
    });
    expect(cfg).toBeTruthy();
  });
});

// ─── scopeAccountKey ────────────────────────────────────────────

describe("scopeAccountKey", () => {
  it("prefixes the key with accounts/<id>/", () => {
    expect(scopeAccountKey("acc-1", "uploads/photo.png")).toBe("accounts/acc-1/uploads/photo.png");
  });

  it("rejects leading slashes (absolute paths) explicitly", () => {
    // Absolute paths are rejected. The internal slash-cleanup below
    // only runs after the leading-/ check passes.
    expect(() => scopeAccountKey("acc-1", "//double//leading/file.txt")).toThrow(/must not contain.*\/|start/i);
  });

  it("collapses double slashes inside the key", () => {
    expect(scopeAccountKey("acc-1", "a//b///c.txt")).toBe("accounts/acc-1/a/b/c.txt");
  });

  it("rejects path traversal", () => {
    expect(() => scopeAccountKey("acc-1", "../escape")).toThrow(/must not contain/i);
    expect(() => scopeAccountKey("acc-1", "ok/../escape")).toThrow(/must not contain/i);
  });

  it("rejects absolute paths", () => {
    expect(() => scopeAccountKey("acc-1", "/etc/passwd")).toThrow(/must not contain.*\/|must not.*start/i);
  });

  it("rejects empty / missing keys", () => {
    expect(() => scopeAccountKey("acc-1", "")).toThrow(/required/i);
    expect(() => scopeAccountKey("acc-1", "x".repeat(1025))).toThrow(/1024/);
  });

  it("rejects empty account ids", () => {
    expect(() => scopeAccountKey("", "key")).toThrow(/account_id is required/i);
  });
});

// ─── presignR2Url ───────────────────────────────────────────────

describe("presignR2Url", () => {
  const config: R2Config = {
    account_id: "test-account",
    access_key_id: "AKIAEXAMPLE",
    secret_access_key: "examplesecret",
    bucket: "axis-test",
  };
  // Pin time so the signature is deterministic across runs.
  const fixedNow = new Date("2026-05-22T10:00:00.000Z");

  it("returns a URL pointing at <account>.r2.cloudflarestorage.com", () => {
    const r = presignR2Url({ config, method: "GET", key: "accounts/acc-1/file.txt", ttl_seconds: 3600, now: fixedNow });
    expect(r.url.startsWith("https://test-account.r2.cloudflarestorage.com/axis-test/accounts/acc-1/file.txt?")).toBe(true);
    expect(r.host).toBe("test-account.r2.cloudflarestorage.com");
    expect(r.bucket).toBe("axis-test");
    expect(r.key).toBe("accounts/acc-1/file.txt");
  });

  it("emits X-Amz-Algorithm, Credential, Date, Expires, SignedHeaders, Signature", () => {
    const r = presignR2Url({ config, method: "GET", key: "k.txt", ttl_seconds: 60, now: fixedNow });
    const url = new URL(r.url);
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(url.searchParams.get("X-Amz-Credential")).toMatch(/^AKIAEXAMPLE\/\d{8}\/auto\/s3\/aws4_request$/);
    expect(url.searchParams.get("X-Amz-Date")).toMatch(/^\d{8}T\d{6}Z$/);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("60");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("expires_at equals now + ttl_seconds", () => {
    const r = presignR2Url({ config, method: "PUT", key: "k.txt", ttl_seconds: 1234, now: fixedNow });
    expect(r.expires_at).toBe(new Date(fixedNow.getTime() + 1234 * 1000).toISOString());
  });

  it("uses auto region in the credential scope (R2-specific)", () => {
    // X-Amz-Credential is URL-encoded in the final URL, so we parse the
    // params and inspect the decoded value rather than greping the raw URL.
    const r = presignR2Url({ config, method: "GET", key: "k.txt", ttl_seconds: 60, now: fixedNow });
    const credential = new URL(r.url).searchParams.get("X-Amz-Credential") ?? "";
    expect(credential).toContain("/auto/s3/aws4_request");
  });

  it("signatures differ between GET and PUT for the same key + time", () => {
    const get = presignR2Url({ config, method: "GET", key: "same.txt", ttl_seconds: 60, now: fixedNow });
    const put = presignR2Url({ config, method: "PUT", key: "same.txt", ttl_seconds: 60, now: fixedNow });
    const getSig = new URL(get.url).searchParams.get("X-Amz-Signature");
    const putSig = new URL(put.url).searchParams.get("X-Amz-Signature");
    expect(getSig).toBeTruthy();
    expect(putSig).toBeTruthy();
    expect(getSig).not.toBe(putSig);
  });

  it("URL-encodes special characters in the key without double-encoding /", () => {
    const r = presignR2Url({ config, method: "GET", key: "folder/file with spaces.png", ttl_seconds: 60, now: fixedNow });
    expect(r.url).toContain("/axis-test/folder/file%20with%20spaces.png?");
  });

  it("supports DELETE (Managed Bucket) and rejects genuinely off-contract methods", () => {
    const del = presignR2Url({ config, method: "DELETE", key: "k.txt", ttl_seconds: 60, now: fixedNow });
    expect(del.url).toContain("/axis-test/k.txt?");
    expect(new URL(del.url).searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    // @ts-expect-error — exercising runtime guard for an off-contract method
    expect(() => presignR2Url({ config, method: "POST", key: "k", ttl_seconds: 60 })).toThrow(/unsupported method/i);
  });

  it("rejects ttl out of range", () => {
    expect(() => presignR2Url({ config, method: "GET", key: "k", ttl_seconds: 0 })).toThrow(/ttl_seconds/i);
    expect(() => presignR2Url({ config, method: "GET", key: "k", ttl_seconds: -1 })).toThrow(/ttl_seconds/i);
    expect(() => presignR2Url({ config, method: "GET", key: "k", ttl_seconds: 700_000 })).toThrow(/ttl_seconds/i);
  });

  it("rejects incomplete config", () => {
    const bad = { ...config, account_id: "" } as unknown as R2Config;
    expect(() => presignR2Url({ config: bad, method: "GET", key: "k", ttl_seconds: 60 })).toThrow(/incomplete R2 config/i);
  });

  it("is deterministic for fixed config + key + time + ttl", () => {
    const a = presignR2Url({ config, method: "PUT", key: "k.txt", ttl_seconds: 600, now: fixedNow });
    const b = presignR2Url({ config, method: "PUT", key: "k.txt", ttl_seconds: 600, now: fixedNow });
    expect(a.url).toBe(b.url);
    expect(a.expires_at).toBe(b.expires_at);
  });
});

// ─── Engineer tier (E2): Managed Bucket — list + content-addressed keys ──
describe("presignR2List", () => {
  const config: R2Config = {
    account_id: "test-account",
    access_key_id: "AKIAEXAMPLE",
    secret_access_key: "examplesecret",
    bucket: "axis-test",
  };
  const fixedNow = new Date("2026-05-22T10:00:00.000Z");

  it("signs a bucket-level ListObjectsV2 GET with list-type=2 + prefix", () => {
    const r = presignR2List(config, "accounts/acc-1/", 300, fixedNow);
    const url = new URL(r.url);
    expect(url.pathname).toBe("/axis-test"); // bucket-level, no object key
    expect(url.searchParams.get("list-type")).toBe("2");
    expect(url.searchParams.get("prefix")).toBe("accounts/acc-1/");
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(r.key).toBe("accounts/acc-1/");
  });

  it("is deterministic", () => {
    const a = presignR2List(config, "accounts/acc-1/", 300, fixedNow);
    const b = presignR2List(config, "accounts/acc-1/", 300, fixedNow);
    expect(a.url).toBe(b.url);
  });

  it("rejects ttl out of range + incomplete config", () => {
    expect(() => presignR2List(config, "p/", 0, fixedNow)).toThrow(/ttl_seconds/i);
    expect(() => presignR2List({ ...config, bucket: "" } as R2Config, "p/", 60, fixedNow)).toThrow(/incomplete R2 config/i);
  });
});

describe("presignR2Copy (server-side copy)", () => {
  const config: R2Config = {
    account_id: "test-account",
    access_key_id: "AKIAEXAMPLE",
    secret_access_key: "examplesecret",
    bucket: "axis-test",
  };
  const fixedNow = new Date("2026-05-22T10:00:00.000Z");

  it("signs a PUT to the dest key with x-amz-copy-source as a signed header", () => {
    const r = presignR2Copy(config, "accounts/acc-1/src.txt", "accounts/acc-1/dst.txt", 300, fixedNow);
    const url = new URL(r.url);
    expect(url.pathname).toBe("/axis-test/accounts/acc-1/dst.txt"); // dest rides in the path
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host;x-amz-copy-source");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    // source rides in the required header, NOT the URL path.
    expect(r.required_headers["x-amz-copy-source"]).toBe("/axis-test/accounts/acc-1/src.txt");
    expect(r.key).toBe("accounts/acc-1/dst.txt");
  });

  it("is deterministic", () => {
    const a = presignR2Copy(config, "accounts/acc-1/s", "accounts/acc-1/d", 300, fixedNow);
    const b = presignR2Copy(config, "accounts/acc-1/s", "accounts/acc-1/d", 300, fixedNow);
    expect(a.url).toBe(b.url);
    expect(a.required_headers["x-amz-copy-source"]).toBe(b.required_headers["x-amz-copy-source"]);
  });

  it("binds the signature to the copy-source — the source can't be tampered (it's a signed header)", () => {
    const a = presignR2Copy(config, "accounts/acc-1/src-A", "accounts/acc-1/d", 300, fixedNow);
    const b = presignR2Copy(config, "accounts/acc-1/src-B", "accounts/acc-1/d", 300, fixedNow);
    const sigA = new URL(a.url).searchParams.get("X-Amz-Signature");
    const sigB = new URL(b.url).searchParams.get("X-Amz-Signature");
    expect(sigA).not.toBe(sigB);
  });

  it("rejects ttl out of range + incomplete config", () => {
    expect(() => presignR2Copy(config, "s", "d", 0, fixedNow)).toThrow(/ttl_seconds/i);
    expect(() => presignR2Copy({ ...config, secret_access_key: "" } as R2Config, "s", "d", 60, fixedNow)).toThrow(/incomplete R2 config/i);
  });
});

describe("casKey (content-addressed dedup)", () => {
  const hash = "a".repeat(64);
  it("maps a sha256 to accounts/<id>/cas/<sha256> (identical content → same key)", () => {
    expect(casKey("acc-1", hash)).toBe(`accounts/acc-1/cas/${hash}`);
  });
  it("appends a safe lowercased extension when given", () => {
    expect(casKey("acc-1", hash, "PNG")).toBe(`accounts/acc-1/cas/${hash}.png`);
  });
  it("rejects a non-sha256 hash (incl. uppercase hex)", () => {
    expect(() => casKey("acc-1", "not-a-hash")).toThrow(/64-char.*hex/i);
    expect(() => casKey("acc-1", "A".repeat(64))).toThrow(/hex/i);
  });
});
