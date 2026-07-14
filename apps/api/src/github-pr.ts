// ─── GitHub PR creation (hand-rolled REST, injectable fetch) ─────
//
// Opens/updates a pull request that writes a single file to a repo — used by E5
// drift mode to propose an updated .axis/living-architecture.md. No octokit
// dependency: four plain REST calls (get base ref → create branch → put file →
// open PR) over an INJECTED fetch so it's testable without network or a token.

import { createHash } from "node:crypto";

const GH_API = "https://api.github.com";

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

/** Deterministic branch name from the new content — so re-running the same drift
 *  collides on the same branch (idempotent) and a new drift gets a fresh one. */
export function driftBranchName(content: string): string {
  return `axis/arch-drift-${createHash("sha256").update(content, "utf8").digest("hex").slice(0, 12)}`;
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function ghCall(fetchImpl: typeof fetch, token: string, method: string, path: string, body?: unknown): Promise<GhResponse> {
  // H8.1 WAIVER: no client-side AbortController/timeout, and no try/catch — a
  // rejected fetch propagates out of ghCall/openDriftPullRequest uncaught (caught
  // one level up by the webhook handler's own .catch()). Tracked as H8.1b.
  const res = await fetchImpl(`${GH_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "axis-iliad-architecture-drift",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
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

/**
 * Open (or refresh) a PR that writes `content` to `filePath` on a drift branch.
 * Returns opened:false with a reason for the benign cases (branch/PR already
 * exists, meaning the drift is already in flight). Each step short-circuits on a
 * non-2xx so a failure never half-creates state beyond an empty branch.
 */
export async function openDriftPullRequest(fetchImpl: typeof fetch, p: OpenDriftPrParams): Promise<OpenDriftPrResult> {
  const base = `/repos/${p.owner}/${p.repo}`;

  // 1. base branch head SHA
  const ref = await ghCall(fetchImpl, p.token, "GET", `${base}/git/ref/heads/${encodeURIComponent(p.baseBranch)}`);
  const baseSha = asRecord(asRecord(ref.body).object).sha;
  if (ref.status !== 200 || typeof baseSha !== "string") {
    return { opened: false, reason: `base ref lookup failed (${ref.status})` };
  }

  // 2. create the drift branch (422 = already exists → drift already in flight)
  const created = await ghCall(fetchImpl, p.token, "POST", `${base}/git/refs`, { ref: `refs/heads/${p.branchName}`, sha: baseSha });
  if (created.status === 422) return { opened: false, reason: "branch already exists (drift PR likely already open)" };
  if (created.status !== 201) return { opened: false, reason: `branch create failed (${created.status})` };

  // 3. existing file SHA on the branch (needed to UPDATE rather than CREATE)
  const existing = await ghCall(fetchImpl, p.token, "GET", `${base}/contents/${encodePath(p.filePath)}?ref=${encodeURIComponent(p.branchName)}`);
  const existingSha = existing.status === 200 ? asRecord(existing.body).sha : undefined;

  // 4. commit the file to the branch
  const put = await ghCall(fetchImpl, p.token, "PUT", `${base}/contents/${encodePath(p.filePath)}`, {
    message: p.title,
    content: Buffer.from(p.content, "utf8").toString("base64"),
    branch: p.branchName,
    ...(typeof existingSha === "string" ? { sha: existingSha } : {}),
  });
  if (put.status !== 200 && put.status !== 201) return { opened: false, reason: `file commit failed (${put.status})` };

  // 5. open the PR
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
