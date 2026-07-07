// ─── Projects list REST surface (WO-A1) ─────────────────────────
//
// GET /v1/projects — the account's analyzed repos, newest-analyzed-first.
// Backs the Dashboard "recent projects" cards (WO-P3) and the future
// Projects/History page (WO-P11). Read-only; the heavy lifting (pagination,
// latest-snapshot join) lives in @axis/snapshots' listProjectsWithLatestSnapshot.

import type { IncomingMessage, ServerResponse } from "node:http";
import { listProjectsWithLatestSnapshot, type InputMethod } from "@axis/snapshots";
import { gradeCompliance } from "@axis/generator-core";
import { sendJSON } from "./router.js";
import { requireAuth } from "./billing.js";

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
