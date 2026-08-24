import { describe, it, expect, vi } from "vitest";
import {
  openDriftPullRequest,
  driftBranchName,
  openApplyPullRequest,
  applyBranchName,
  fetchPullRequestFiles,
  postCommitStatus,
  type OpenDriftPrParams,
  type OpenApplyPrParams,
} from "./github-pr.js";

// Fake fetch that returns staged responses in call order and records each call.
function seqFetch(responses: Array<{ status: number; json?: unknown }>): {
  fetch: typeof fetch;
  calls: Array<{ method: string; url: string; body: Record<string, unknown> | undefined }>;
} {
  const calls: Array<{ method: string; url: string; body: Record<string, unknown> | undefined }> = [];
  let i = 0;
  const fn = (async (url: string | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined;
    calls.push({ method, url: String(url), body });
    const r = responses[i++] ?? { status: 500 };
    return new Response(r.json !== undefined ? JSON.stringify(r.json) : "", { status: r.status });
  }) as unknown as typeof fetch;
  return { fetch: fn, calls };
}

const params = (over?: Partial<OpenDriftPrParams>): OpenDriftPrParams => ({
  owner: "o",
  repo: "r",
  token: "t",
  baseBranch: "main",
  filePath: ".axis/living-architecture.md",
  content: "new doc",
  branchName: "axis/arch-drift-abc123",
  title: "AXIS: architecture drift",
  body: "drift detected",
  ...over,
});

describe("driftBranchName", () => {
  it("is deterministic and content-sensitive", () => {
    expect(driftBranchName("a")).toBe(driftBranchName("a"));
    expect(driftBranchName("a")).not.toBe(driftBranchName("b"));
    expect(driftBranchName("a")).toMatch(/^axis\/arch-drift-[0-9a-f]{12}$/);
  });
});

describe("openDriftPullRequest", () => {
  it("opens a PR for a new file (base ref → branch → put → pull)", async () => {
    const { fetch, calls } = seqFetch([
      { status: 200, json: { object: { sha: "basesha" } } }, // get base ref
      { status: 201, json: {} }, // create branch
      { status: 404, json: { message: "Not Found" } }, // existing file (none)
      { status: 201, json: {} }, // put contents
      { status: 201, json: { html_url: "https://github.com/o/r/pull/7", number: 7 } }, // open PR
    ]);
    const r = await openDriftPullRequest(fetch, params());
    expect(r).toEqual({ opened: true, pr_url: "https://github.com/o/r/pull/7", pr_number: 7 });
    expect(calls[0]).toMatchObject({ method: "GET", url: expect.stringContaining("/git/ref/heads/main") });
    expect(calls[1].body).toEqual({ ref: "refs/heads/axis/arch-drift-abc123", sha: "basesha" });
    expect(calls[3].body).toMatchObject({ branch: "axis/arch-drift-abc123", content: Buffer.from("new doc", "utf8").toString("base64") });
    expect(calls[3].body).not.toHaveProperty("sha"); // create, not update
    expect(calls[4].body).toMatchObject({ head: "axis/arch-drift-abc123", base: "main" });
  });

  it("updates an existing file (includes its sha) and reports an already-open PR", async () => {
    const { fetch, calls } = seqFetch([
      { status: 200, json: { object: { sha: "basesha" } } },
      { status: 201, json: {} },
      { status: 200, json: { sha: "oldfilesha" } }, // existing file present
      { status: 200, json: {} }, // put (update)
      { status: 422, json: { message: "A pull request already exists" } }, // PR exists
    ]);
    const r = await openDriftPullRequest(fetch, params());
    expect(r.opened).toBe(false);
    expect(r.reason).toMatch(/already exists/);
    expect(calls[3].body).toMatchObject({ sha: "oldfilesha" });
  });

  it("skips when the drift branch already exists (drift already in flight)", async () => {
    const { fetch } = seqFetch([
      { status: 200, json: { object: { sha: "basesha" } } },
      { status: 422, json: { message: "Reference already exists" } }, // create branch fails
    ]);
    const r = await openDriftPullRequest(fetch, params());
    expect(r.opened).toBe(false);
    expect(r.reason).toMatch(/branch already exists/);
  });

  it("fails cleanly when the base ref can't be read", async () => {
    const { fetch } = seqFetch([{ status: 404, json: { message: "Not Found" } }]);
    const r = await openDriftPullRequest(fetch, params());
    expect(r.opened).toBe(false);
    expect(r.reason).toMatch(/base ref lookup failed \(404\)/);
  });

  it("a rejected fetch (transport error) propagates uncaught — openDriftPullRequest has no try/catch, so it does NOT resolve to a clean {opened:false} result", async () => {
    // Neither ghCall nor openDriftPullRequest wraps the fetchImpl call in a
    // try/catch, so a fetch rejection (network error) on any of the 5 GitHub
    // calls is NOT translated into a clean {opened:false, reason} — the
    // rejection propagates straight out of openDriftPullRequest. Callers
    // (architecture-drift-webhook.ts) rely on their own outer .catch() to
    // avoid crashing the process; this function itself does not soften it.
    const fetchImpl = (async () => {
      throw new Error("transport error: ECONNRESET");
    }) as unknown as typeof fetch;
    await expect(openDriftPullRequest(fetchImpl, params())).rejects.toThrow(/transport error/);
  });

  it("a stalled fetch that outlives the client-side timeout propagates uncaught the same way a transport error does — not a hang, not a crash", async () => {
    // ghCall/openDriftPullRequest still have no try/catch (see the transport-
    // error test above) — a timeout on any of the 5 sequential GitHub calls
    // must propagate the exact same way: a rejected promise carrying the
    // AbortError. GH_CALL_TIMEOUT_MS (15_000) isn't exported; mirrored here
    // via fake timers so this test doesn't really wait 15s.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      // Never resolves on its own; only settles when the signal that ghCall
      // passes in gets aborted — same as a real fetch would. The very first
      // ghCall (base-ref lookup) hangs, so openDriftPullRequest never gets
      // past step 1.
      const fetchImpl = ((_url: string | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const abortErr = new Error("This operation was aborted");
            abortErr.name = "AbortError";
            reject(abortErr);
          });
        });
      }) as unknown as typeof fetch;

      const pending = openDriftPullRequest(fetchImpl, params());
      // Attach the rejection handler synchronously, before advancing the fake
      // clock — otherwise the internal promise can reject *during* the
      // advance below with no handler attached yet.
      const assertion = expect(pending).rejects.toThrow(/This operation was aborted/);
      await vi.advanceTimersByTimeAsync(15_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("treats a 200 ref-lookup response with a missing object.sha as a clean failure, not a crash", async () => {
    // Malformed/unexpected-shape response: status 200 (so the status check
    // alone would pass) but the body lacks object.sha. asRecord(...).sha
    // resolves to undefined, and the explicit `typeof baseSha !== "string"`
    // guard catches it — proving the check validates shape, not just status.
    const { fetch } = seqFetch([
      { status: 200, json: { object: {} } }, // 200 OK but no `sha` on the object
    ]);
    const r = await openDriftPullRequest(fetch, params());
    expect(r).toEqual({ opened: false, reason: "base ref lookup failed (200)" });
  });
});

describe("applyBranchName", () => {
  it("is deterministic, content-sensitive, and namespaced by the caller-chosen kind", () => {
    expect(applyBranchName("theme-sync", "a")).toBe(applyBranchName("theme-sync", "a"));
    expect(applyBranchName("theme-sync", "a")).not.toBe(applyBranchName("theme-sync", "b"));
    expect(applyBranchName("theme-sync", "a")).not.toBe(applyBranchName("skills-gen", "a"));
    expect(applyBranchName("theme-sync", "a")).toMatch(/^axis\/theme-sync-[0-9a-f]{12}$/);
  });
});

describe("openApplyPullRequest (generic multi-file Apply-channel substrate)", () => {
  const applyParams = (over?: Partial<OpenApplyPrParams>): OpenApplyPrParams => ({
    owner: "o",
    repo: "r",
    token: "t",
    baseBranch: "main",
    branchName: "axis/theme-sync-abc123",
    files: [
      { path: "design-tokens.json", content: "{}" },
      { path: "theme.css", content: ":root{}" },
    ],
    title: "AXIS: theme token sync",
    body: "generated theme tokens",
    ...over,
  });

  it("commits every file to the branch (own existing-sha check per file) before opening one PR", async () => {
    const { fetch, calls } = seqFetch([
      { status: 200, json: { object: { sha: "basesha" } } }, // get base ref
      { status: 201, json: {} }, // create branch
      { status: 404, json: { message: "Not Found" } }, // file 1: no existing sha
      { status: 201, json: {} }, // file 1: put (create)
      { status: 200, json: { sha: "oldcsssha" } }, // file 2: existing sha present
      { status: 200, json: {} }, // file 2: put (update)
      { status: 201, json: { html_url: "https://github.com/o/r/pull/9", number: 9 } }, // open PR
    ]);
    const r = await openApplyPullRequest(fetch, applyParams());
    expect(r).toEqual({ opened: true, pr_url: "https://github.com/o/r/pull/9", pr_number: 9 });
    expect(calls[2].url).toContain("design-tokens.json");
    expect(calls[3].body).toMatchObject({ content: Buffer.from("{}", "utf8").toString("base64") });
    expect(calls[3].body).not.toHaveProperty("sha"); // file 1: create, not update
    expect(calls[4].url).toContain("theme.css");
    expect(calls[5].body).toMatchObject({ sha: "oldcsssha" }); // file 2: update, includes its sha
    expect(calls[6].body).toMatchObject({ head: "axis/theme-sync-abc123", base: "main" });
    expect(calls).toHaveLength(7);
  });

  it("short-circuits before opening a PR when a later file's commit fails, leaving the first file's commit as the only side effect", async () => {
    const { fetch, calls } = seqFetch([
      { status: 200, json: { object: { sha: "basesha" } } },
      { status: 201, json: {} }, // create branch
      { status: 404, json: { message: "Not Found" } }, // file 1: no existing sha
      { status: 201, json: {} }, // file 1: put succeeds
      { status: 404, json: { message: "Not Found" } }, // file 2: no existing sha
      { status: 500, json: { message: "Internal Server Error" } }, // file 2: put fails
    ]);
    const r = await openApplyPullRequest(fetch, applyParams());
    expect(r).toEqual({ opened: false, reason: "file commit failed for theme.css (500)" });
    expect(calls).toHaveLength(6); // never reaches the "open PR" call
  });

  it("openDriftPullRequest is a 1-file case of the same substrate: identical call shape for a single file", async () => {
    const { fetch: driftFetch, calls: driftCalls } = seqFetch([
      { status: 200, json: { object: { sha: "basesha" } } },
      { status: 201, json: {} },
      { status: 404, json: { message: "Not Found" } },
      { status: 201, json: {} },
      { status: 201, json: { html_url: "https://github.com/o/r/pull/7", number: 7 } },
    ]);
    const { fetch: genericFetch, calls: genericCalls } = seqFetch([
      { status: 200, json: { object: { sha: "basesha" } } },
      { status: 201, json: {} },
      { status: 404, json: { message: "Not Found" } },
      { status: 201, json: {} },
      { status: 201, json: { html_url: "https://github.com/o/r/pull/7", number: 7 } },
    ]);
    const driftResult = await openDriftPullRequest(driftFetch, params());
    const genericResult = await openApplyPullRequest(genericFetch, {
      owner: "o",
      repo: "r",
      token: "t",
      baseBranch: "main",
      branchName: "axis/arch-drift-abc123",
      files: [{ path: ".axis/living-architecture.md", content: "new doc" }],
      title: "AXIS: architecture drift",
      body: "drift detected",
    });
    expect(driftResult).toEqual(genericResult);
    expect(driftCalls.map((c) => ({ method: c.method, url: c.url }))).toEqual(genericCalls.map((c) => ({ method: c.method, url: c.url })));
  });
});

// app_41: PR-file listing + commit-status posting — the brand-voice-lint
// watcher's own REST surface, distinct from the PR-OPENING flow above.

describe("fetchPullRequestFiles", () => {
  it("returns filename/status/patch for every changed file", async () => {
    const { fetch, calls } = seqFetch([
      {
        status: 200,
        json: [
          { filename: "src/App.tsx", status: "modified", patch: "@@ -1,1 +1,1 @@\n+x" },
          { filename: "assets/logo.png", status: "modified" }, // binary — no patch field
        ],
      },
    ]);
    const files = await fetchPullRequestFiles(fetch, "t", "o", "r", 7);
    expect(files).toEqual([
      { filename: "src/App.tsx", status: "modified", patch: "@@ -1,1 +1,1 @@\n+x" },
      { filename: "assets/logo.png", status: "modified", patch: undefined },
    ]);
    expect(calls[0]).toMatchObject({ method: "GET", url: expect.stringContaining("/repos/o/r/pulls/7/files") });
  });

  it("returns an empty array rather than throwing on a non-200 response", async () => {
    const { fetch } = seqFetch([{ status: 404, json: { message: "Not Found" } }]);
    expect(await fetchPullRequestFiles(fetch, "t", "o", "r", 999)).toEqual([]);
  });

  it("drops malformed entries (missing filename/status) rather than propagating them", async () => {
    const { fetch } = seqFetch([{ status: 200, json: [{ filename: "ok.tsx", status: "added" }, { status: "modified" }, {}] }]);
    const files = await fetchPullRequestFiles(fetch, "t", "o", "r", 7);
    expect(files).toEqual([{ filename: "ok.tsx", status: "added", patch: undefined }]);
  });
});

describe("postCommitStatus", () => {
  it("posts state/description/context to the statuses endpoint", async () => {
    const { fetch, calls } = seqFetch([{ status: 201, json: { id: 1 } }]);
    const r = await postCommitStatus(fetch, {
      owner: "o",
      repo: "r",
      token: "t",
      sha: "deadbeef",
      state: "failure",
      description: "AXIS Brand: 1 off-voice string found.",
      context: "axis/brand-voice-lint",
    });
    expect(r).toEqual({ posted: true });
    expect(calls[0]).toMatchObject({ method: "POST", url: expect.stringContaining("/repos/o/r/statuses/deadbeef") });
    expect(calls[0].body).toEqual({ state: "failure", description: "AXIS Brand: 1 off-voice string found.", context: "axis/brand-voice-lint" });
  });

  it("truncates a description over GitHub's 140-char cap rather than letting the API reject it", async () => {
    const { fetch, calls } = seqFetch([{ status: 201, json: {} }]);
    const long = "x".repeat(200);
    await postCommitStatus(fetch, { owner: "o", repo: "r", token: "t", sha: "s", state: "success", description: long, context: "c" });
    const posted = calls[0].body?.description as string;
    expect(posted.length).toBe(140);
    expect(posted.endsWith("...")).toBe(true);
  });

  it("reports posted:false with a reason on a non-201 response, never throws", async () => {
    const { fetch } = seqFetch([{ status: 422, json: { message: "invalid" } }]);
    const r = await postCommitStatus(fetch, { owner: "o", repo: "r", token: "t", sha: "s", state: "success", description: "d", context: "c" });
    expect(r.posted).toBe(false);
    expect(r.reason).toContain("422");
  });
});
