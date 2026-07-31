// ─── GitHub PR creation (hand-rolled REST, injectable fetch) ─────
//
// openApplyPullRequest is the Apply-channel substrate (docs/saas-strategy/
// APPLICATION_BUILD_STRATEGY.md substrate table): every program's A stage
// that lands as a PR drives off this. Writes N files to one branch, then
// opens a PR. No octokit dependency: plain REST calls (get base ref → create
// branch → put each file → open PR) over an INJECTED fetch so it's testable
// without network or a token.
//
// openDriftPullRequest is E5 drift mode's existing single-file caller,
// reimplemented as a 1-file adapter over openApplyPullRequest so both share
// one call path.

import { createHash } from "node:crypto";

const GH_API = "https://api.github.com";
/** Upper bound per GitHub REST call — ghCall is invoked up to 5× sequentially per PR, each with its own budget. */
const GH_CALL_TIMEOUT_MS = 15_000;

export interface OpenDriftPrParams {
  owner: string;
  repo: string;
  token: string;
  baseBranch: string;
  filePath: string;
  content: string;
  branchName: string;
  title: string;
  body: string;
}

export interface OpenDriftPrResult {
  opened: boolean;
  pr_url?: string;
  pr_number?: number;
  reason?: string;
}

interface GhResponse {
  status: number;
  body: unknown;
}

function contentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex").slice(0, 12);
}

/** Deterministic branch name from the new content — so re-running the same drift
 *  collides on the same branch (idempotent) and a new drift gets a fresh one. */
export function driftBranchName(content: string): string {
  return `axis/arch-drift-${contentHash(content)}`;
}

/** Generic version of driftBranchName for any program's Apply stage: same
 *  idempotent-by-content-hash behavior, under a caller-chosen branch prefix
 *  instead of the drift-specific one. */
export function applyBranchName(kind: string, content: string): string {
  return `axis/${kind}-${contentHash(content)}`;
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function ghCall(fetchImpl: typeof fetch, token: string, method: string, path: string, body?: unknown): Promise<GhResponse> {
  // Bound each GitHub REST call so a stalled upstream can't hang the caller
  // forever. ghCall/openDriftPullRequest still have no try/catch (by design,
  // matching the existing contract) — a timeout propagates out uncaught the
  // same way any other rejected fetch already does; only the timer needs
  // cleanup. Caught one level up by the webhook handler's own .catch().
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GH_CALL_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetchImpl(`${GH_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "axis-iliad-architecture-drift",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return { status: res.status, body: parsed };
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

export interface ApplyFile {
  path: string;
  content: string;
}

export interface OpenApplyPrParams {
  owner: string;
  repo: string;
  token: string;
  baseBranch: string;
  branchName: string;
  files: ApplyFile[];
  title: string;
  body: string;
}

export interface OpenApplyPrResult {
  opened: boolean;
  pr_url?: string;
  pr_number?: number;
  reason?: string;
}

/**
 * Open (or refresh) a PR that writes one or more files to a branch. Returns
 * opened:false with a reason for the benign cases (branch/PR already exists,
 * meaning the same apply is already in flight). Each step short-circuits on a
 * non-2xx so a failure never half-creates state beyond a partially-committed
 * branch — the caller can retry safely since branch creation is the only
 * irreversible step, and re-running with the same branchName just hits the
 * "branch already exists" short-circuit rather than duplicating work.
 */
export async function openApplyPullRequest(fetchImpl: typeof fetch, p: OpenApplyPrParams): Promise<OpenApplyPrResult> {
  const base = `/repos/${p.owner}/${p.repo}`;

  // 1. base branch head SHA
  const ref = await ghCall(fetchImpl, p.token, "GET", `${base}/git/ref/heads/${encodeURIComponent(p.baseBranch)}`);
  const baseSha = asRecord(asRecord(ref.body).object).sha;
  if (ref.status !== 200 || typeof baseSha !== "string") {
    return { opened: false, reason: `base ref lookup failed (${ref.status})` };
  }

  // 2. create the branch (422 = already exists → this apply is already in flight)
  const created = await ghCall(fetchImpl, p.token, "POST", `${base}/git/refs`, { ref: `refs/heads/${p.branchName}`, sha: baseSha });
  if (created.status === 422) return { opened: false, reason: "branch already exists (apply PR likely already open)" };
  if (created.status !== 201) return { opened: false, reason: `branch create failed (${created.status})` };

  // 3. commit each file to the branch (existing sha per-file, to UPDATE rather than CREATE)
  for (const file of p.files) {
    const existing = await ghCall(fetchImpl, p.token, "GET", `${base}/contents/${encodePath(file.path)}?ref=${encodeURIComponent(p.branchName)}`);
    const existingSha = existing.status === 200 ? asRecord(existing.body).sha : undefined;

    const put = await ghCall(fetchImpl, p.token, "PUT", `${base}/contents/${encodePath(file.path)}`, {
      message: p.title,
      content: Buffer.from(file.content, "utf8").toString("base64"),
      branch: p.branchName,
      ...(typeof existingSha === "string" ? { sha: existingSha } : {}),
    });
    if (put.status !== 200 && put.status !== 201) return { opened: false, reason: `file commit failed for ${file.path} (${put.status})` };
  }

  // 4. open the PR
  const pr = await ghCall(fetchImpl, p.token, "POST", `${base}/pulls`, { title: p.title, head: p.branchName, base: p.baseBranch, body: p.body });
  if (pr.status === 422) return { opened: false, reason: "pull request already exists for this branch" };
  if (pr.status !== 201) return { opened: false, reason: `pull request create failed (${pr.status})` };

  const prBody = asRecord(pr.body);
  return {
    opened: true,
    pr_url: typeof prBody.html_url === "string" ? prBody.html_url : undefined,
    pr_number: typeof prBody.number === "number" ? prBody.number : undefined,
  };
}

/** E5 drift mode's single-file caller, as a 1-file adapter over openApplyPullRequest. */
export async function openDriftPullRequest(fetchImpl: typeof fetch, p: OpenDriftPrParams): Promise<OpenDriftPrResult> {
  return openApplyPullRequest(fetchImpl, {
    owner: p.owner,
    repo: p.repo,
    token: p.token,
    baseBranch: p.baseBranch,
    branchName: p.branchName,
    files: [{ path: p.filePath, content: p.content }],
    title: p.title,
    body: p.body,
  });
}
