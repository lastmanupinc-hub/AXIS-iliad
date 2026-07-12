import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listProjects,
  deleteProject,
  downloadExport,
  complianceGradeLetter,
  apiErrorDetails,
  type ProjectSummary,
} from "../api.ts";
import { SectionHeader, Callout, EmptyState, Skeleton, Pill, TableWrap } from "../components/primitives/index.ts";

// ─── ProjectsPage (WO-P11) ────────────────────────────────────────────────
// Full history of every repo the account has analyzed — the Account
// Dashboard (WO-P3) only teases the most recent 20 as cards; this is the
// complete, searchable/sortable list with per-row lifecycle actions.
// Deliberately client-side search/sort/pagination-free (GET /v1/projects
// has no `q=` param) — 200 is a generous ceiling for a "did I really
// analyze 200+ repos" account, and matches how AccountDashboardPage already
// fetches a flat, unpaginated list.

interface Props {
  onOpenProject: (projectId: string) => void;
  onReanalyze: (githubUrl: string) => void;
  onAnalyze: () => void;
}

type SortKey = "recent" | "name" | "snapshots";
const FETCH_LIMIT = 200;

function statusBadgeClass(status: string): string {
  if (status === "ready") return "badge badge-green";
  if (status === "failed") return "badge badge-red";
  return "badge badge-yellow"; // "processing"
}

function gradeBadgeClass(letter: string | null): string {
  if (letter === "A" || letter === "A+") return "badge badge-green";
  if (letter === "B") return "badge badge-blue";
  if (letter === "C") return "badge badge-yellow";
  if (letter === "D") return "badge badge-red";
  return "badge";
}

/** Click once to arm, click again to confirm — avoids a native confirm()
 *  dialog (untestable/unstyleable) while still requiring a deliberate
 *  second action before an irreversible delete fires. Mirrors
 *  VersionsTab.tsx's DangerButton (not shared — both are small, page-local
 *  copies of the same established pattern). */
function DangerButton({ label, confirmLabel, busy, onConfirm }: { label: string; confirmLabel: string; busy: boolean; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button type="button" className="btn" style={{ color: "var(--red)", borderColor: "var(--red)" }} onClick={() => setArmed(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="flex gap-2" style={{ alignItems: "center", flexWrap: "wrap" }}>
      <span className="text-muted text-sm">{confirmLabel}</span>
      <button type="button" className="btn btn-primary" style={{ background: "var(--red)", borderColor: "var(--red)" }} disabled={busy} onClick={onConfirm}>
        {busy ? "Deleting..." : "Yes, delete"}
      </button>
      <button type="button" className="btn" disabled={busy} onClick={() => setArmed(false)}>Cancel</button>
    </span>
  );
}

export function ProjectsPage({ onOpenProject, onReanalyze, onAnalyze }: Props) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<{ message: string; details: string | null } | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await listProjects({ limit: FETCH_LIMIT });
      setProjects(res.projects);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : "Failed to load projects", details: apiErrorDetails(err) });
      setProjects([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (!projects) return [];
    const q = query.trim().toLowerCase();
    const list = q
      ? projects.filter((p) => p.name.toLowerCase().includes(q) || (p.github_url ?? "").toLowerCase().includes(q))
      : projects;
    return [...list].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "snapshots") return b.snapshot_count - a.snapshot_count;
      const at = a.latest_snapshot?.created_at ?? a.created_at;
      const bt = b.latest_snapshot?.created_at ?? b.created_at;
      return new Date(bt).getTime() - new Date(at).getTime();
    });
  }, [projects, query, sort]);

  async function handleDelete(projectId: string) {
    setDeletingId(projectId);
    try {
      await deleteProject(projectId);
      await load();
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : "Failed to delete project", details: apiErrorDetails(err) });
    } finally {
      setDeletingId(null);
    }
  }

  async function handleExport(projectId: string) {
    setExportingId(projectId);
    try {
      await downloadExport(projectId);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : "Failed to export project", details: apiErrorDetails(err) });
    } finally {
      setExportingId(null);
    }
  }

  return (
    <div>
      <SectionHeader
        title="Projects"
        sub="Every repo you've analyzed, newest first."
        actions={<button type="button" className="btn btn-primary" onClick={onAnalyze}>Analyze a repo</button>}
      />

      {error && (
        <div className="mb-4">
          <Callout tone="danger" title="Couldn't load your projects" details={error.details}>
            {error.message}
          </Callout>
        </div>
      )}

      {projects === null && !error && <Skeleton lines={5} height={52} />}

      {projects !== null && projects.length === 0 && !error && (
        <div className="card">
          <EmptyState
            icon="scan"
            title="No projects yet"
            message="Analyze a repo to create your first project."
            cta={{ label: "Analyze a repo", onClick: onAnalyze }}
          />
        </div>
      )}

      {projects !== null && projects.length > 0 && (
        <>
          <div className="flex gap-2 mb-4" style={{ flexWrap: "wrap" }}>
            <input
              type="search"
              placeholder="Search by name or URL…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ maxWidth: 320, flex: 1 }}
              aria-label="Search projects"
            />
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} style={{ maxWidth: 200 }} aria-label="Sort projects">
              <option value="recent">Most recent</option>
              <option value="name">Name (A-Z)</option>
              <option value="snapshots">Most snapshots</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <p className="text-muted">No projects match &quot;{query}&quot;.</p>
          ) : (
            <TableWrap label="Projects">
              <table>
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Status</th>
                    <th>Grade</th>
                    <th>Snapshots</th>
                    <th>Last analyzed</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const grade = complianceGradeLetter(p.latest_snapshot?.compliance_grade);
                    return (
                      <tr key={p.project_id}>
                        <td>
                          <button type="button" className="btn" style={{ fontWeight: 600, padding: "2px 8px" }} onClick={() => onOpenProject(p.project_id)}>
                            {p.name}
                          </button>
                          {p.github_url && <div className="text-muted text-xs mt-1" style={{ wordBreak: "break-all" }}>{p.github_url}</div>}
                        </td>
                        <td>{p.latest_snapshot && <span className={statusBadgeClass(p.latest_snapshot.status)}>{p.latest_snapshot.status}</span>}</td>
                        <td>{grade && <span className={gradeBadgeClass(grade)}>{grade}</span>}</td>
                        <td><Pill>{p.snapshot_count}</Pill></td>
                        <td className="text-muted text-sm">
                          {p.latest_snapshot ? new Date(p.latest_snapshot.created_at).toLocaleDateString() : "—"}
                        </td>
                        <td>
                          <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
                            <button type="button" className="btn" onClick={() => onOpenProject(p.project_id)}>Open</button>
                            {p.github_url && (
                              <button type="button" className="btn" onClick={() => onReanalyze(p.github_url!)}>Re-analyze</button>
                            )}
                            <button type="button" className="btn" disabled={exportingId === p.project_id} onClick={() => void handleExport(p.project_id)}>
                              {exportingId === p.project_id ? "Zipping..." : "Export ZIP"}
                            </button>
                            <DangerButton
                              label="Delete"
                              confirmLabel={`Delete "${p.name}" and all its snapshots?`}
                              busy={deletingId === p.project_id}
                              onConfirm={() => void handleDelete(p.project_id)}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          )}
          <p className="text-muted text-sm mt-2">
            {filtered.length === projects.length
              ? `${projects.length} project${projects.length === 1 ? "" : "s"} total.`
              : `Showing ${filtered.length} of ${projects.length} projects.`}
          </p>
        </>
      )}
    </div>
  );
}
