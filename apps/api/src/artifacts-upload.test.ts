import { describe, it, expect, vi } from "vitest";
import { uploadWidgetBundle, EMBED_URL_TTL_SECONDS, type UploadWidgetDeps } from "./artifacts-upload.js";
import type { R2Config } from "./object-storage.js";

const FAKE_CONFIG: R2Config = {
  account_id: "test-account-id",
  access_key_id: "AKIATESTKEY",
  secret_access_key: "test-secret-key-not-real",
  bucket: "axis-artifacts-test",
};

const NOW = new Date("2026-08-20T12:00:00.000Z");

function depsWithFetch(fetchImpl: UploadWidgetDeps["fetchImpl"], readConfig: () => R2Config | null = () => FAKE_CONFIG): UploadWidgetDeps {
  return { readConfig, fetchImpl, now: NOW };
}

describe("uploadWidgetBundle", () => {
  it("reports not_configured honestly rather than fabricating a URL when R2 env is absent", async () => {
    const fetchImpl = vi.fn();
    const result = await uploadWidgetBundle("console.log(1);", "acct_1", depsWithFetch(fetchImpl, () => null));
    expect(result.status).toBe("not_configured");
    // The whole point: no network call, no invented link.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uploads via a real PUT to a self-minted presigned URL, then mints a real GET link", async () => {
    let putCall: { url: string; init: RequestInit } | null = null;
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      putCall = { url: String(url), init: init! };
      return new Response(null, { status: 200 });
    });
    const result = await uploadWidgetBundle("console.log('widget');", "acct_1", depsWithFetch(fetchImpl as never));

    expect(result.status).toBe("uploaded");
    if (result.status !== "uploaded") throw new Error("unreachable");

    // A real PUT actually happened, with the required signed headers attached.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(putCall).not.toBeNull();
    expect(putCall!.init.method).toBe("PUT");
    const headers = putCall!.init.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/javascript");
    expect(headers["content-length"]).toBe(String(Buffer.byteLength("console.log('widget');")));
    expect(putCall!.url).toContain(FAKE_CONFIG.bucket);
    expect(putCall!.url).toContain("X-Amz-Signature=");

    // The returned embed URL is a DIFFERENT presign (GET, longer TTL) — not
    // just the PUT url handed back, which would be unusable (wrong method,
    // wrong signed headers, and — worse — would still carry write access).
    expect(result.url).not.toBe(putCall!.url);
    expect(result.url).toContain("X-Amz-Signature=");
    const expectedExpiry = new Date(NOW.getTime() + EMBED_URL_TTL_SECONDS * 1000).toISOString();
    expect(result.expires_at).toBe(expectedExpiry);
  });

  it("content-addresses the key: identical bytes upload to the identical key", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    const r1 = await uploadWidgetBundle("same bytes", "acct_1", depsWithFetch(fetchImpl as never));
    const r2 = await uploadWidgetBundle("same bytes", "acct_1", depsWithFetch(fetchImpl as never));
    expect(r1.status).toBe("uploaded");
    expect(r2.status).toBe("uploaded");
    if (r1.status !== "uploaded" || r2.status !== "uploaded") throw new Error("unreachable");
    expect(r1.key).toBe(r2.key);
  });

  it("scopes the key to the account: different accounts, identical bytes, different keys", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    const r1 = await uploadWidgetBundle("same bytes", "acct_1", depsWithFetch(fetchImpl as never));
    const r2 = await uploadWidgetBundle("same bytes", "acct_2", depsWithFetch(fetchImpl as never));
    if (r1.status !== "uploaded" || r2.status !== "uploaded") throw new Error("unreachable");
    expect(r1.key).not.toBe(r2.key);
  });

  it("reports upload_failed honestly on a non-2xx R2 response, not a silent success", async () => {
    const fetchImpl = vi.fn(async () => new Response("access denied", { status: 403 }));
    const result = await uploadWidgetBundle("console.log(1);", "acct_1", depsWithFetch(fetchImpl as never));
    expect(result.status).toBe("upload_failed");
    if (result.status !== "upload_failed") throw new Error("unreachable");
    expect(result.error).toMatch(/403/);
  });

  it("reports upload_failed on a network error rather than throwing", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const result = await uploadWidgetBundle("console.log(1);", "acct_1", depsWithFetch(fetchImpl as never));
    expect(result.status).toBe("upload_failed");
    if (result.status !== "upload_failed") throw new Error("unreachable");
    expect(result.error).toMatch(/ECONNREFUSED/);
  });
});
