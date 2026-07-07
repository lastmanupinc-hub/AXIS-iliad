// ─── Projects list REST surface (WO-A1 + WO-A2) ──────────────────
//
// GET /v1/projects — the account's analyzed repos, newest-analyzed-first.
// Backs the Dashboard "recent projects" cards (WO-P3) and the future
// Projects/History page (WO-P11). Read-only; the heavy lifting (pagination,
// latest-snapshot join) lives in @axis/snapshots' listProjectsWithLatestSnapshot.
//
// GET /v1/projects/:project_id/snapshots (WO-A2) — every snapshot (analysis
// run) for one project, newest first. Every other project read (context,
// generated-files) hardcodes "latest snapshot"; this is the one place the
// full history is enumerable, so the web Project Detail page's Versions tab
// (WO-P5) can let a user pick a past snapshot to browse its own generation
// version history and diff two versions within it.

import type { IncomingMessage, ServerResponse } from "node:http";
import { listProjectsWithLatestSnapshot, getProjectSnapshots, type InputMethod } from "@axis/snapshots";
import { gradeCompliance } from "@axis/generator-core";
import { sendJSON, sendError } from "./router.js";
import { requireAuth } from "./billing.js";
import { ErrorCode } from "./logger.js";
import { assertProjectAccess } from "./handlers.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Best-effort reconstruction of the source GitHub URL. `github_url` is never
 * persisted (SnapshotInput.github_url is transient — see AUDIT-api.md), but
 * `handleGitHubAnalyze` always sets `project_name` to exactly `${owner}/${repo}`
 * for github-sourced snapshots, so the URL is exactly recoverable for that one
 * input method — not a guess. Every other input method has no derivable URL.
 */
function deriveGithubUrl(input_method: InputMethod | null, project_name: string): string | null {
  if (input_method !== "github_repo_url") return null;
  if (!/^[^/\s]+\/[^/\s]+$/.test(project_name)) return null;
  return `https://github.com/${project_name}`;
}

/** GET /v1/projects?limit=&offset= (WO-A1). Auth: Key. */
export async function handleListProjects(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  /* v8 ignore next — req.url always present in tests */
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const limitRaw = parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
  const offsetRaw = parseInt(url.searchParams.get("offset") ?? "0", 10);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(Number.isFinite(offsetRaw) ? offsetRaw : 0, 0);

  const { items, total } = await listProjectsWithLatestSnapshot(ctx.account!.account_id, { limit, offset });

  sendJSON(res, 200, {
    projects: items.map((p) => ({
      project_id: p.project_id,
      name: p.project_name,
      github_url: deriveGithubUrl(p.input_method, p.project_name),
      created_at: p.first_created_at,
      latest_snapshot: p.latest_snapshot
        ? {
            snapshot_id: p.latest_snapshot.snapshot_id,
            status: p.latest_snapshot.status,
            created_at: p.latest_snapshot.created_at,
            file_count: p.latest_snapshot.file_count,
            compliance_grade: gradeCompliance(p.latest_snapshot.files),
          }
        : null,
      snapshot_count: p.snapshot_count,
    })),
    total,
  });
}

/**
 * GET /v1/projects/:project_id/snapshots (WO-A2). Auth: owner (anonymous
 * projects — no owning account — are readable by anyone who knows the id,
 * matching assertSnapshotAccess/assertProjectAccess elsewhere). A project
 * with zero snapshots is indistinguishable from a nonexistent one — the
 * write path (createSnapshot) never creates a project without also creating
 * its first snapshot — so an empty result 404s rather than 200s with `[]`,
 * mirroring handleGetContext/handleGetGeneratedFiles for the same condition.
 */
export async function handleListProjectSnapshots(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const { project_id } = params;
  if (!(await assertProjectAccess(req, res, project_id))) return;

  const snapshots = await getProjectSnapshots(project_id);
  if (snapshots.length === 0) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "Project not found");
    return;
  }

  // getProjectSnapshots orders oldest-first (ASC created_at) — reverse for
  // the newest-first contract the WO-A2 mini-spec and every sibling list
  // endpoint (WO-A1's /v1/projects, versions.ts's listGenerationVersions) use.
  const items = [...snapshots].reverse().map((s) => ({
    snapshot_id: s.snapshot_id,
    status: s.status,
    created_at: s.created_at,
    file_count: s.file_count,
    compliance_grade: gradeCompliance(s.files),
  }));

  sendJSON(res, 200, { project_id, snapshots: items, count: items.length });
}
