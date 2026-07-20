import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ProjectSnapshotSummary,
  GenerationVersionSummary,
  VersionDiff,
  MemoryEntry,
  MemoryKind,
} from "../api.ts";
import {
  listProjectSnapshots,
  getSnapshotVersions,
  getDiff,
  deleteSnapshot,
  deleteProject,
  listProjectMemory,
  addProjectMemory,
  complianceGradeLetter,
  isPersistenceCreditsError,
  apiErrorDetails,
  ApiError,
  MEMORY_KINDS,
} from "../api.ts";
import { SectionHeader, Callout, EmptyState, Skeleton } from "./primitives/index.ts";
import { DiffViewer } from "./DiffViewer.tsx";
import { DangerButton } from "./DangerButton.tsx";
import { statusBadgeClass, gradeBadgeClass } from "../badge-utils.ts";

// --- VersionsTab (WO-P5) -----------------------------------------------------
// Version History + Diff Viewer + Project Memory + delete (snapshot/project).
// Two-level model matches the backend exactly: a PROJECT has many SNAPSHOTS
// (separate analysis runs, WO-A2's GET /v1/projects/:id/snapshots); each
// SNAPSHOT has many generation VERSIONS (one per program run against it,
// existing GET /v1/snapshots/:id/versions). Diffing compares two versions
// within one snapshot -- the API has no cross-snapshot diff.

interface Props {
  projectId: string;
  currentSnapshotId: string;
  loggedIn: boolean;
  onSnapshotDeleted: () => void;
  onProjectDeleted: () => void;
  onNeedCredits: () => void;
}

export function VersionsTab({ projectId, currentSnapshotId, loggedIn, onSnapshotDeleted, onProjectDeleted, onNeedCredits }: Props) {
  // --- Snapshots (project-level history) ---
  const [snapshots, setSnapshots] = useState<ProjectSnapshotSummary[] | null>(null);
  const [snapshotsError, setSnapshotsError] = useState<{ message: string; details: string | null } | null>(null);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>(currentSnapshotId);
  // H-Phase-A cycle 20: a single shared string can't represent N independent
  // concurrent row deletions — arming+confirming delete on snapshot A then
  // doing the same on snapshot B before A resolved used to overwrite this to
  // "B", re-enabling A's Confirm/Cancel buttons while A's own delete was
  // still in flight, letting a second click fire a genuine duplicate DELETE.
  // Same fix shape as ProjectsPage.tsx's deletingIds/exportingIds.
  const [deletingSnapshots, setDeletingSnapshots] = useState<Set<string>>(new Set());

  // H-Phase-A cycle 11 (8th recurrence of this session's async-stale-state
  // shape): VersionsTab isn't remounted across a browser back/forward
  // between two different projects while parked on this tab (only keyed by
  // activeTab in ProjectPage, per its own cycle-9 fix comment) — a stale
  // response from the OLD project could otherwise land after the new
  // project's fresh one and overwrite it. One counter per independent loader.
  const snapshotsRequestIdRef = useRef(0);

  const loadSnapshots = useCallback(async () => {
    const requestId = ++snapshotsRequestIdRef.current;
    setSnapshotsError(null);
    try {
      const res = await listProjectSnapshots(projectId);
      if (requestId !== snapshotsRequestIdRef.current) return;
      setSnapshots(res.snapshots);
    } catch (err) {
      if (requestId !== snapshotsRequestIdRef.current) return;
      setSnapshotsError({ message: err instanceof Error ? err.message : "Failed to load snapshot history", details: apiErrorDetails(err) });
    }
  }, [projectId]);

  useEffect(() => { void loadSnapshots(); }, [loadSnapshots]);

  // `selectedSnapshotId` starts at `currentSnapshotId` but is otherwise
  // independent local state (the user can "View" an older snapshot) — resync
  // it whenever the PROP changes, which only happens after onSnapshotDeleted
  // causes the parent to refetch a new latest snapshot. Without this, deleting
  // the currently-viewed snapshot would leave the version picker pointed at a
  // now-gone id.
  useEffect(() => { setSelectedSnapshotId(currentSnapshotId); }, [currentSnapshotId]);

  async function handleDeleteSnapshot(snapshotId: string) {
    setDeletingSnapshots((prev) => new Set(prev).add(snapshotId));
    try {
      await deleteSnapshot(snapshotId);
      await loadSnapshots();
      // Deleting whatever is currently selected (whether or not it's also the
      // latest) needs an immediate reset — the effect above only fires once
      // the PARENT's currentSnapshotId prop itself changes, which happens
      // later (async) and only for the current-snapshot case below.
      if (snapshotId === selectedSnapshotId) setSelectedSnapshotId(currentSnapshotId);
      if (snapshotId === currentSnapshotId) onSnapshotDeleted();
    } catch (err) {
      setSnapshotsError({ message: err instanceof Error ? err.message : "Failed to delete snapshot", details: apiErrorDetails(err) });
    } finally {
      setDeletingSnapshots((prev) => {
        const next = new Set(prev);
        next.delete(snapshotId);
        return next;
      });
    }
  }

  // --- Generation versions (per selected snapshot) + diff ---
  const [versions, setVersions] = useState<GenerationVersionSummary[] | null>(null);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [oldVersion, setOldVersion] = useState<number | "">("");
  const [newVersion, setNewVersion] = useState<number | "">("");
  const [diff, setDiff] = useState<VersionDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<{ message: string; details: string | null; needsCredits: boolean } | null>(null);

  // The most directly reproducible instance of the class above: the
  // Snapshot History table's "View" button changes selectedSnapshotId while
  // this component stays mounted (no navigation involved at all) — clicking
  // "View" on snapshot A then quickly on snapshot B before A's response
  // resolves could let A's stale versions overwrite B's, while the picker
  // still reads "B" (and silently mispair a subsequent Compare).
  const versionsRequestIdRef = useRef(0);
  // H-Phase-A cycle 12: handleCompare is a 4th independent async op in this
  // component that cycle 11's requestIdRef sweep missed. Bumped both here
  // (so a snapshot switch invalidates any in-flight compare for the
  // snapshot being left) and inside handleCompare itself (so a second
  // Compare click for the SAME snapshot invalidates the first's response
  // too) — one ref covers both races.
  const compareRequestIdRef = useRef(0);

  const loadVersions = useCallback(async (snapshotId: string) => {
    const requestId = ++versionsRequestIdRef.current;
    ++compareRequestIdRef.current;
    setVersions(null);
    setVersionsError(null);
    setDiff(null);
    setDiffError(null);
    setDiffLoading(false);
    setOldVersion("");
    setNewVersion("");
    try {
      const res = await getSnapshotVersions(snapshotId);
      if (requestId !== versionsRequestIdRef.current) return;
      setVersions(res.versions);
      // Default the pair to the two most recent versions, newest first per the API.
      if (res.versions.length >= 2) {
        setNewVersion(res.versions[0].version_number);
        setOldVersion(res.versions[1].version_number);
      }
    } catch (err) {
      if (requestId !== versionsRequestIdRef.current) return;
      setVersionsError(err instanceof Error ? err.message : "Failed to load version history");
    }
  }, []);

  useEffect(() => { void loadVersions(selectedSnapshotId); }, [selectedSnapshotId, loadVersions]);

  async function handleCompare() {
    if (oldVersion === "" || newVersion === "" || oldVersion === newVersion) return;
    const requestId = ++compareRequestIdRef.current;
    setDiffLoading(true);
    setDiffError(null);
    setDiff(null);
    try {
      const res = await getDiff(selectedSnapshotId, oldVersion, newVersion);
      if (requestId !== compareRequestIdRef.current) return;
      setDiff(res.diff);
    } catch (err) {
      if (requestId !== compareRequestIdRef.current) return;
      setDiffError({
        message: isPersistenceCreditsError(err) ? "This diff requires a persistence credit." : (err instanceof Error ? err.message : "Failed to compute diff"),
        details: apiErrorDetails(err),
        needsCredits: isPersistenceCreditsError(err),
      });
    } finally {
      if (requestId === compareRequestIdRef.current) setDiffLoading(false);
    }
  }

  // --- Project memory ---
  const [memoryEntries, setMemoryEntries] = useState<MemoryEntry[] | null>(null);
  const [memoryDenied, setMemoryDenied] = useState<"signed-out" | "anonymous-project" | null>(null);
  const [memoryError, setMemoryError] = useState<{ message: string; details: string | null } | null>(null);
  const [newKind, setNewKind] = useState<MemoryKind>("decision");
  const [newContent, setNewContent] = useState("");
  const [newSource, setNewSource] = useState("");
  const [addingMemory, setAddingMemory] = useState(false);

  const memoryRequestIdRef = useRef(0);

  const loadMemory = useCallback(async () => {
    const requestId = ++memoryRequestIdRef.current;
    if (!loggedIn) {
      setMemoryDenied("signed-out");
      return;
    }
    setMemoryDenied(null);
    setMemoryError(null);
    try {
      const res = await listProjectMemory(projectId, { limit: 50 });
      if (requestId !== memoryRequestIdRef.current) return;
      setMemoryEntries(res.entries);
    } catch (err) {
      if (requestId !== memoryRequestIdRef.current) return;
      if (err instanceof ApiError && err.status === 403) {
        setMemoryDenied("anonymous-project");
      } else if (err instanceof ApiError && err.status === 401) {
        setMemoryDenied("signed-out");
      } else {
        setMemoryError({ message: err instanceof Error ? err.message : "Failed to load project memory", details: apiErrorDetails(err) });
      }
    }
  }, [projectId, loggedIn]);

  useEffect(() => { void loadMemory(); }, [loadMemory]);

  async function handleAddMemory(e: React.FormEvent) {
    e.preventDefault();
    if (!newContent.trim()) return;
    setAddingMemory(true);
    setMemoryError(null);
    try {
      await addProjectMemory(projectId, { kind: newKind, content: newContent.trim(), source: newSource.trim() || undefined });
      setNewContent("");
      setNewSource("");
      await loadMemory();
    } catch (err) {
      setMemoryError({ message: err instanceof Error ? err.message : "Failed to save memory entry", details: apiErrorDetails(err) });
    } finally {
      setAddingMemory(false);
    }
  }

  // --- Project deletion ---
  const [deletingProject, setDeletingProject] = useState(false);
  const [deleteProjectError, setDeleteProjectError] = useState<string | null>(null);

  async function handleDeleteProject() {
    setDeletingProject(true);
    setDeleteProjectError(null);
    try {
      await deleteProject(projectId);
      onProjectDeleted();
    } catch (err) {
      setDeleteProjectError(err instanceof Error ? err.message : "Failed to delete project");
      setDeletingProject(false);
    }
  }

  return (
    <div>
      {/* --- Snapshot history --- */}
      <SectionHeader title="Snapshot History" sub="Every time this project was analyzed." align="start" />
      {snapshotsError && (
        <div className="mb-4">
          <Callout tone="danger" title={snapshotsError.message} details={snapshotsError.details}>
            <button type="button" className="btn" onClick={() => void loadSnapshots()}>Retry</button>
          </Callout>
        </div>
      )}
      {!snapshots && !snapshotsError && <Skeleton lines={3} />}
      {snapshots && snapshots.length > 0 && (
        <div className="card mb-4" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Snapshot</th>
                <th>Status</th>
                <th>Files</th>
                <th>Grade</th>
                <th>Analyzed</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => {
                const grade = complianceGradeLetter(s.compliance_grade);
                const isSelected = s.snapshot_id === selectedSnapshotId;
                return (
                  <tr key={s.snapshot_id} style={isSelected ? { background: "var(--bg-hover)" } : undefined}>
                    <td>
                      <button type="button" className="btn" style={{ padding: "2px 8px", fontSize: "0.75rem" }} disabled={isSelected} onClick={() => setSelectedSnapshotId(s.snapshot_id)}>
                        {isSelected ? "Viewing" : "View"}
                      </button>
                      {s.snapshot_id === currentSnapshotId && <span className="badge badge-accent" style={{ marginLeft: 6, fontSize: "0.625rem" }}>latest</span>}
                    </td>
                    <td><span className={statusBadgeClass(s.status)}>{s.status}</span></td>
                    <td className="text-muted">{s.file_count}</td>
                    <td>{grade ? <span className={gradeBadgeClass(grade)}>{grade}</span> : <span className="text-muted">-</span>}</td>
                    <td className="text-muted text-sm">{new Date(s.created_at).toLocaleString()}</td>
                    <td>
                      <DangerButton
                        label="Delete"
                        confirmLabel="Delete this snapshot?"
                        busy={deletingSnapshots.has(s.snapshot_id)}
                        onConfirm={() => void handleDeleteSnapshot(s.snapshot_id)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* --- Generation versions + diff --- */}
      <SectionHeader title="Compare Versions" sub="Pick two generation versions of the selected snapshot to diff." align="start" />
      {versionsError && (
        <Callout tone="danger" title={versionsError}>
          <button type="button" className="btn" onClick={() => void loadVersions(selectedSnapshotId)}>Retry</button>
        </Callout>
      )}
      {versions === null && !versionsError && <Skeleton lines={2} />}
      {versions !== null && versions.length < 2 && (
        <div className="card mb-4">
          <EmptyState icon="layers" title="Not enough versions yet" message="Run at least two programs against this snapshot to compare versions." />
        </div>
      )}
      {versions !== null && versions.length >= 2 && (
        <div className="card mb-4">
          <div className="flex gap-2 flex-wrap" style={{ alignItems: "center" }}>
            <label className="text-sm text-muted">
              Old
              <select className="mono" style={{ marginLeft: 6 }} value={oldVersion} onChange={(e) => setOldVersion(e.target.value === "" ? "" : Number(e.target.value))}>
                <option value="">-</option>
                {versions.map((v) => <option key={v.version_number} value={v.version_number}>v{v.version_number}{v.program ? ` (${v.program})` : ""}</option>)}
              </select>
            </label>
            <label className="text-sm text-muted">
              New
              <select className="mono" style={{ marginLeft: 6 }} value={newVersion} onChange={(e) => setNewVersion(e.target.value === "" ? "" : Number(e.target.value))}>
                <option value="">-</option>
                {versions.map((v) => <option key={v.version_number} value={v.version_number}>v{v.version_number}{v.program ? ` (${v.program})` : ""}</option>)}
              </select>
            </label>
            <button
              type="button"
              className="btn btn-primary"
              disabled={diffLoading || oldVersion === "" || newVersion === "" || oldVersion === newVersion}
              onClick={() => void handleCompare()}
            >
              {diffLoading ? <><span className="spinner" /> Comparing...</> : "Compare"}
            </button>
          </div>

          {diffError && (
            <div className="mt-4">
              <Callout tone="warning" title={diffError.message} details={diffError.details}>
                {diffError.needsCredits && (
                  <button type="button" className="btn btn-primary" style={{ marginTop: 8 }} onClick={onNeedCredits}>
                    Get persistence credits
                  </button>
                )}
              </Callout>
            </div>
          )}

          {diff && (
            <div className="mt-4">
              <DiffViewer diff={diff} />
            </div>
          )}
        </div>
      )}

      {/* --- Project memory --- */}
      <SectionHeader title="Project Memory" sub="Decisions, conventions, evidence, and goals recorded during work on this project." align="start" />
      {memoryDenied === "signed-out" && (
        <div className="card mb-4">
          <EmptyState icon="user" title="Sign in to use project memory" message="Project memory is per-account. Sign in to read or write notes on this project." />
        </div>
      )}
      {memoryDenied === "anonymous-project" && (
        <div className="card mb-4">
          <EmptyState icon="user" title="This project has no owner" message="Project memory requires an account-owned project. Re-analyze this repo while signed in to enable it." />
        </div>
      )}
      {memoryError && (
        <div className="mb-4">
          <Callout tone="danger" title={memoryError.message} details={memoryError.details}>
            <button type="button" className="btn" onClick={() => void loadMemory()}>Retry</button>
          </Callout>
        </div>
      )}
      {!memoryDenied && !memoryError && memoryEntries === null && <Skeleton lines={2} />}
      {!memoryDenied && memoryEntries !== null && (
        <div className="card mb-4">
          {memoryEntries.length === 0 ? (
            <p className="text-muted text-sm mb-4">No memory entries yet.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px" }}>
              {memoryEntries.map((entry) => (
                <li key={entry.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                  <div className="flex gap-2" style={{ alignItems: "center", marginBottom: 4 }}>
                    <span className="badge">{entry.kind}</span>
                    <span className="text-muted text-xs">{new Date(entry.created_at).toLocaleString()}</span>
                    {entry.source && <span className="text-muted text-xs">via {entry.source}</span>}
                  </div>
                  <p style={{ margin: 0, fontSize: "0.875rem" }}>{entry.content}</p>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={(e) => void handleAddMemory(e)}>
            <div className="flex gap-2 flex-wrap mb-2">
              <select value={newKind} onChange={(e) => setNewKind(e.target.value as MemoryKind)}>
                {MEMORY_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
              <input
                type="text"
                placeholder="Source (optional)"
                value={newSource}
                onChange={(e) => setNewSource(e.target.value)}
                style={{ flex: 1, minWidth: 160 }}
              />
            </div>
            <textarea
              placeholder="What should future work on this project remember?"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={3}
              style={{ width: "100%", resize: "vertical", marginBottom: 8 }}
            />
            <button type="submit" className="btn btn-primary" disabled={addingMemory || !newContent.trim()}>
              {addingMemory ? "Saving..." : "Add memory entry"}
            </button>
          </form>
        </div>
      )}

      {/* --- Danger zone --- */}
      <SectionHeader title="Danger Zone" align="start" />
      <div className="card" style={{ borderColor: "var(--red)" }}>
        <div className="flex-between" style={{ flexWrap: "wrap", gap: 12 }}>
          <div>
            <strong>Delete this project</strong>
            <p className="text-muted text-sm mt-1" style={{ margin: 0 }}>Permanently deletes every snapshot, version, and generated file for this project. This cannot be undone.</p>
          </div>
          <DangerButton label="Delete project" confirmLabel="Delete the whole project?" busy={deletingProject} onConfirm={() => void handleDeleteProject()} />
        </div>
        {deleteProjectError && <p className="text-sm mt-2" style={{ color: "var(--red)" }}>{deleteProjectError}</p>}
      </div>
    </div>
  );
}
