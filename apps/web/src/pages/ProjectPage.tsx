import { useState, useEffect, useCallback, useRef } from "react";
import type { SnapshotResponse, GeneratedFile } from "../api.ts";
import { getGeneratedFiles, runProgram, downloadExport, ApiError } from "../api.ts";
import { OverviewTab } from "../components/OverviewTab.tsx";
import { FilesTab } from "../components/FilesTab.tsx";
import { GraphTab } from "../components/GraphTab.tsx";
import { ArtifactExplorer } from "../components/ArtifactExplorer.tsx";
import { ProgramLauncher } from "../components/ProgramLauncher.tsx";
import { SearchTab } from "../components/SearchTab.tsx";
import { VersionsTab } from "../components/VersionsTab.tsx";
import { UpsellModal } from "../components/UpsellModal.tsx";
import { useToast } from "../components/Toast.tsx";
import { Callout } from "../components/primitives/index.ts";

// ─── ProjectPage (WO-P5) ──────────────────────────────────────────────────
// Project/Snapshot Detail — formerly DashboardPage, the single-result view
// bound to whatever the app currently had loaded. Now addressed at
// "#projects/:id" (routes.tsx renderProjectDetail resolves `result` for the
// requested id before this ever mounts) so any historical project opens by
// URL. Overview/Structure/Dependencies/Programs/Search are unchanged.
// Versions is new (snapshot history, generation-version diff, project
// memory, and snapshot/project deletion all live there — see
// components/VersionsTab.tsx). WO-P6 renamed "Generated Files" to
// "Artifacts" and replaced its component (GeneratedTab -> ArtifactExplorer:
// search, program/type filters, tree/grid toggle, markdown preview,
// per-file download) — deep-linkable at "#projects/:id/artifacts" like
// Versions is at "#projects/:id/versions" (see routes.tsx).

interface Props {
  result: SnapshotResponse;
  /** Gates the project-memory read/write UI inside VersionsTab (the API
   *  401s while signed out regardless of project ownership). */
  loggedIn: boolean;
  /** Which tab opens first — set by the "project-versions"/"project-artifacts" deep links. */
  initialTab?: ProjectTab;
  onGeneratedCountChange?: (count: number) => void;
  /** A snapshot belonging to this project was deleted — the caller re-fetches
   *  (a different snapshot may now be latest, or none remain). */
  onSnapshotDeleted: () => void;
  /** This project itself was deleted — the caller clears app state and navigates away. */
  onProjectDeleted: () => void;
  /** The diff viewer hit a 402 persistence-credits wall — jump to the credit-purchase flow. */
  onNeedCredits: () => void;
  /** WO-P7: open the full Program Runner (`#run/:program`) for a target-project
   *  picker and per-output selection this embedded launcher doesn't offer. */
  onOpenRunner?: (program: string) => void;
}

const TABS = ["Overview", "Structure", "Dependencies", "Artifacts", "Programs", "Search", "Versions"] as const;
export type ProjectTab = (typeof TABS)[number];

function NextStepsCard({ fileCount, onDownload, downloading }: { fileCount: number; onDownload: () => void; downloading: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  // Dismissing unmounts the whole card, including the button that was just
  // clicked, which silently drops keyboard focus to <body>. Keep a
  // focusable anchor where the card was and move focus there instead.
  useEffect(() => {
    if (dismissed) anchorRef.current?.focus();
  }, [dismissed]);

  if (fileCount === 0) return null;
  if (dismissed) return <div ref={anchorRef} tabIndex={-1} style={{ outline: "none" }} />;

  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: "3px solid var(--accent)", padding: "16px 20px" }}>
      <div className="flex-between" style={{ marginBottom: 8 }}>
        <h2 style={{ fontSize: "1rem", margin: 0 }}>Getting Started</h2>
        <button className="btn" style={{ fontSize: "0.75rem", padding: "2px 8px" }} onClick={() => setDismissed(true)}>Dismiss</button>
      </div>
      <ol style={{ margin: 0, paddingLeft: 20, color: "var(--text-muted)", fontSize: "0.875rem", lineHeight: 1.8 }}>
        <li><strong>Download your artifacts</strong> — click <button className="btn btn-primary" style={{ fontSize: "0.75rem", padding: "2px 8px", display: "inline" }} disabled={downloading} onClick={onDownload}>{downloading ? "Zipping..." : "Download All"}</button> and unzip into your repo root.</li>
        <li><strong>Copy <code>AGENTS.md</code> to your repo root</strong> — GitHub Copilot, Cursor, and Claude Code auto-read it.</li>
        <li><strong>Copy <code>.cursorrules</code></strong> — Cursor picks it up automatically for project-specific rules.</li>
        <li><strong>Open your AI tool and start coding</strong> — it now has full context of your codebase.</li>
      </ol>
    </div>
  );
}

export function ProjectPage({ result, loggedIn, initialTab, onGeneratedCountChange, onSnapshotDeleted, onProjectDeleted, onNeedCredits, onOpenRunner }: Props) {
  const [activeTab, setActiveTab] = useState<ProjectTab>(() => initialTab ?? "Overview");

  // Keep the active tab in sync with the URL when the route changes WITHOUT a
  // remount: in-app navigate() bumps the route key (remounting this page), but
  // browser Back/Forward fires hashchange with the key preserved — so moving
  // between #projects/:id, .../versions and .../artifacts must re-derive the
  // tab from the new initialTab prop or the visible tab desyncs from the URL.
  // In-page tab clicks only touch local state (initialTab unchanged), so this
  // effect never fights them.
  useEffect(() => {
    setActiveTab(initialTab ?? "Overview");
  }, [initialTab]);
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFile[]>([]);
  const [filesLoadFailed, setFilesLoadFailed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [tierBlock, setTierBlock] = useState<{ blocked: string[]; allowed: string[] } | null>(null);
  const { toast } = useToast();

  // H2.6 (red-team fix, WAVE-0 finding #8): a malformed response or a fetch
  // failure must still degrade to a non-crashing render (H1.2's fix, kept —
  // storing undefined here threw on the next generatedFiles.length read) —
  // but degrading SILENTLY to "0 files" is indistinguishable from the
  // account genuinely having none, hiding artifacts the customer already
  // paid for behind what looks like an empty project. filesLoadFailed tracks
  // that distinction so the page can say so instead of staying silent.
  const loadGeneratedFiles = useCallback(() => {
    setFilesLoadFailed(false);
    getGeneratedFiles(result.project_id)
      .then((data) => {
        if (Array.isArray(data.files)) {
          setGeneratedFiles(data.files);
        } else {
          setGeneratedFiles([]);
          setFilesLoadFailed(true);
        }
      })
      .catch(() => {
        setGeneratedFiles([]);
        setFilesLoadFailed(true);
      });
  }, [result.project_id]);

  useEffect(() => {
    loadGeneratedFiles();
  }, [loadGeneratedFiles]);

  // Sync generated file count to parent without triggering setState-in-render
  useEffect(() => {
    onGeneratedCountChange?.(generatedFiles.length);
  }, [generatedFiles.length, onGeneratedCountChange]);

  // Keyboard shortcuts: Alt+1–7 for tabs (only on the project page)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only capture Alt+number to avoid conflict with Ctrl+number page nav
      if (!e.altKey) return;
      const idx = parseInt(e.key) - 1;
      if (idx >= 0 && idx < TABS.length) {
        e.preventDefault();
        setActiveTab(TABS[idx]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  async function handleRunProgram(endpoint: string, opts?: { lite?: boolean }) {
    try {
      const res = await runProgram(endpoint, result.snapshot_id, opts);
      const newFiles = Array.isArray(res.files) ? res.files : [];
      // Merge new files into the list (replace existing by path)
      setGeneratedFiles((prev) => {
        const existing = new Map(prev.map((f) => [f.path, f]));
        for (const f of newFiles) existing.set(f.path, f);
        return [...existing.values()];
      });
      setActiveTab("Artifacts");
      toast("success", `Generated ${newFiles.length} files from ${endpoint.split("/")[0]}`);
    } catch (err) {
      if (err instanceof ApiError && (err.errorCode === "TIER_REQUIRED" || err.status === 402)) {
        const blocked = (err.extra.blocked_programs as string[] | undefined) ?? [endpoint.split("/")[0]];
        const allowed = (err.extra.allowed_programs as string[] | undefined) ?? ["search", "skills", "debug"];
        setTierBlock({ blocked, allowed });
      } else {
        toast("error", err instanceof Error ? err.message : "Program failed");
      }
      throw err;
    }
  }

  async function handleDownloadAll() {
    setDownloading(true);
    try {
      await downloadExport(result.project_id);
      toast("success", "Export downloaded");
    } catch {
      toast("error", "Export failed");
    } finally {
      setDownloading(false);
    }
  }

  const ctx = result.context_map;
  const profile = result.repo_profile;

  return (
    <div>
      <div className="card" style={{ marginBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
        <div className="flex-between" style={{ marginBottom: 8 }}>
          <div>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>{ctx.project_identity.name}</h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
              {ctx.project_identity.type.replace(/_/g, " ")} · {ctx.project_identity.primary_language}
            </p>
          </div>
          <div className="flex" style={{ gap: 6 }}>
            <span className="badge badge-green">{result.status}</span>
            <span className="badge">{ctx.structure.total_files} files</span>
            <span className="badge">{ctx.structure.total_loc.toLocaleString()} LOC</span>
            {generatedFiles.length > 0 && (
              <button
                className="btn btn-primary"
                style={{ fontSize: "0.8125rem", padding: "4px 12px" }}
                disabled={downloading}
                onClick={handleDownloadAll}
              >
                {downloading ? <><span className="spinner" /> Zipping...</> : "⬇ Download All"}
              </button>
            )}
          </div>
        </div>
        {ctx.ai_context.project_summary && (
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
            {ctx.ai_context.project_summary}
          </p>
        )}
      </div>

      {filesLoadFailed && (
        <Callout tone="danger" title="Couldn't load your generated artifacts">
          This may be a temporary connection issue — your artifacts are not lost.{" "}
          <button
            type="button"
            className="btn"
            style={{ fontSize: "0.8125rem", padding: "2px 10px", marginLeft: 4 }}
            onClick={loadGeneratedFiles}
          >
            Retry
          </button>
        </Callout>
      )}

      <NextStepsCard fileCount={generatedFiles.length} onDownload={handleDownloadAll} downloading={downloading} />

      <div className="tabs">
        {TABS.map((tab, idx) => (
          <button
            key={tab}
            type="button"
            className={`tab ${activeTab === tab ? "active" : ""}`}
            onClick={() => setActiveTab(tab)}
            title={`Alt+${idx + 1}`}
          >
            {tab}
            {tab === "Artifacts" && generatedFiles.length > 0 && (
              <span className="badge badge-accent" style={{ marginLeft: 6, fontSize: "0.6875rem" }}>
                {generatedFiles.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div key={activeTab} className="animate-fade-in">
        {activeTab === "Overview" && <OverviewTab ctx={ctx} profile={profile} />}
        {activeTab === "Structure" && <FilesTab ctx={ctx} />}
        {activeTab === "Dependencies" && <GraphTab ctx={ctx} />}
        {activeTab === "Artifacts" && (
          <ArtifactExplorer files={generatedFiles} projectId={result.project_id} />
        )}
        {activeTab === "Programs" && (
          <ProgramLauncher
            snapshotId={result.snapshot_id}
            generatedFiles={generatedFiles}
            onRun={handleRunProgram}
            onOpenRunner={onOpenRunner}
          />
        )}
        {activeTab === "Search" && (
          <SearchTab snapshotId={result.snapshot_id} />
        )}
        {activeTab === "Versions" && (
          <VersionsTab
            projectId={result.project_id}
            currentSnapshotId={result.snapshot_id}
            loggedIn={loggedIn}
            onSnapshotDeleted={onSnapshotDeleted}
            onProjectDeleted={onProjectDeleted}
            onNeedCredits={onNeedCredits}
          />
        )}
      </div>

      {tierBlock && (
        <UpsellModal
          blocked={tierBlock.blocked}
          allowed={tierBlock.allowed}
          onGoFree={() => setTierBlock(null)}
          onClose={() => setTierBlock(null)}
        />
      )}
    </div>
  );
}
