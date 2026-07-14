// Unhappy-path coverage for sovereignFetch (web-fetch-sovereign.ts).
//
// No dedicated test file existed for this module before: it was only
// exercised indirectly through sovereignScrape/sovereignCrawl in
// web-research-sovereign.test.ts, which drives a real local node:http
// fixture server (no fetch mocking at all). Timeout / transport-error /
// oversized-body classification is far cleaner and faster to construct
// against sovereignFetch directly with a stubbed global fetch — the same
// vi.stubGlobal("fetch", ...) convention web-research.test.ts uses for the
// Firecrawl backend — so these three cases live in their own file rather
// than growing the real-server fixture suite.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sovereignFetch, SovereignFetchError } from "./web-fetch-sovereign.js";

const ORIGINAL_ALLOW_PRIVATE = process.env.AXIS_WEB_RESEARCH_ALLOW_PRIVATE_HOSTS;
const ORIGINAL_MAX_BYTES = process.env.AXIS_WEB_RESEARCH_MAX_BYTES;

function restoreEnv() {
  if (ORIGINAL_ALLOW_PRIVATE === undefined) delete process.env.AXIS_WEB_RESEARCH_ALLOW_PRIVATE_HOSTS;
  else process.env.AXIS_WEB_RESEARCH_ALLOW_PRIVATE_HOSTS = ORIGINAL_ALLOW_PRIVATE;
  if (ORIGINAL_MAX_BYTES === undefined) delete process.env.AXIS_WEB_RESEARCH_MAX_BYTES;
  else process.env.AXIS_WEB_RESEARCH_MAX_BYTES = ORIGINAL_MAX_BYTES;
}

describe("sovereignFetch — timeout / transport-error / malformed-response", () => {
  beforeEach(() => {
    // Bypass the DNS-backed SSRF gate so a plain https://example.com/ URL
    // never needs a live DNS lookup — the same escape hatch
    // web-research-sovereign.test.ts relies on for its local fixture server.
    process.env.AXIS_WEB_RESEARCH_ALLOW_PRIVATE_HOSTS = "1";
    delete process.env.AXIS_WEB_RESEARCH_MAX_BYTES;
  });

  afterEach(() => {
    restoreEnv();
    vi.unstubAllGlobals();
  });

  it("classifies an aborted request as SovereignFetchError('timeout') once the AbortController fires", async () => {
    // sovereignFetch's catch block branches on controller.signal.aborted, not
    // on the rejection's shape — so this must let the REAL internal
    // setTimeout(() => controller.abort(), remaining) fire and actually flip
    // that flag. A fetch mock that rejects immediately with an "AbortError"-
    // named Error (without the controller ever aborting) would misclassify as
    // fetch_failed below — it would NOT exercise the timeout branch.
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: { signal?: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(Object.assign(new Error("This operation was aborted"), { name: "AbortError" }));
          });
        });
      }),
    );
    // Explicit short budget so the real abort timer fires in ~50ms instead of
    // waiting out the 30s default.
    await expect(sovereignFetch("https://example.com/", 50)).rejects.toMatchObject({
      code: "timeout",
    });
  });

  it("classifies a non-abort network failure as SovereignFetchError('fetch_failed'), distinct from a timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    // A generous budget proves this is NOT the timeout path: the mock rejects
    // on the next microtask, long before the internal abort timer could fire,
    // so controller.signal.aborted is still false when the catch runs.
    await expect(sovereignFetch("https://example.com/", 5_000)).rejects.toMatchObject({
      code: "fetch_failed",
    });
    await expect(sovereignFetch("https://example.com/", 5_000)).rejects.toBeInstanceOf(SovereignFetchError);
  });

  it("truncates a body exceeding AXIS_WEB_RESEARCH_MAX_BYTES instead of throwing", async () => {
    process.env.AXIS_WEB_RESEARCH_MAX_BYTES = "16";
    const longBody = "0123456789ABCDEFGHIJ"; // 20 ASCII bytes — over the 16-byte cap
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(longBody, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }),
      ),
    );
    const result = await sovereignFetch("https://example.com/", 5_000);
    expect(result.status).toBe(200);
    expect(result.truncated).toBe(true);
    expect(result.html).toBe(longBody.slice(0, 16));
    expect(result.contentType).toBe("text/html");
  });
});
