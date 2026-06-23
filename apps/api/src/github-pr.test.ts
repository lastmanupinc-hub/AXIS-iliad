import { describe, it, expect } from "vitest";
import { openDriftPullRequest, driftBranchName, type OpenDriftPrParams } from "./github-pr.js";

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
});
