import { useEffect, useMemo, useRef, useState } from "react";
import type { GeneratedFile } from "../api.ts";
import { downloadExport, downloadGeneratedFile } from "../api.ts";
import { EmptyState } from "./primitives/EmptyState.tsx";
import { MarkdownLite } from "./primitives/Markdown.tsx";
import { Icon } from "./Icon.tsx";

// ─── ArtifactExplorer (WO-P6) ────────────────────────────────────────────
// Extends the old GeneratedTab (program-grouped list + a plain <pre> preview,
// no search/filter/download-one) into a searchable, filterable artifact
// browser: name+content substring search, program + file-type facets, a
// tree/grid view toggle, a preview pane with lightweight markdown rendering
// (MarkdownLite — no dep), and copy-path/copy-content/download-one actions
// alongside the existing per-program ZIP. `files` already carries full
// inline content (GET /v1/projects/:id/generated-files), so everything here
// is client-side — no new API calls, matching the WO-P6 mini-spec ("API:
// existing only"). File rows/cards are real <button>s (not click-only
// <div>s) so they're keyboard-operable for free — fixes the a11y gap the
// build-plan audit flagged at the old GeneratedTab.tsx:69-87.

interface Props {
  files: GeneratedFile[];
  projectId?: string;
}

type ViewMode = "tree" | "grid";
type PreviewMode = "rendered" | "raw";

const CONTENT_TYPE_LABELS: Record<string, string> = {
  "text/markdown": "Markdown",
  "application/json": "JSON",
  "application/yaml": "YAML",
  "text/yaml": "YAML",
  "application/toml": "TOML",
  "text/typescript": "TypeScript",
  "text/x-dockerfile": "Dockerfile",
  "text/x-shellscript": "Shell",
  "text/css": "CSS",
  "text/html": "HTML",
  "text/plain": "Text",
};

function typeLabel(contentType: string): string {
  return CONTENT_TYPE_LABELS[contentType] ?? (contentType || "Other");
}

// Deterministic program -> badge-tone assignment, stable regardless of
// filtering/ordering. GeneratedTab's fixed 4-program color map left 16 of
// the 20 real programs uncolored (falling through to the plain gray badge).
const BADGE_TONES = ["badge-green", "badge-blue", "badge-accent", "badge-yellow", "badge-red"];
function programBadgeClass(program: string): string {
  let hash = 0;
  for (let i = 0; i < program.length; i++) hash = (hash * 31 + program.charCodeAt(i)) >>> 0;
  return BADGE_TONES[hash % BADGE_TONES.length];
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function ArtifactExplorer({ files, projectId }: Props) {
  const [query, setQuery] = useState("");
  const [programFilter, setProgramFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("tree");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("rendered");
  const [copiedPath, setCopiedPath] = useState(false);
  const [copiedContent, setCopiedContent] = useState(false);
  const [downloadingProgram, setDownloadingProgram] = useState<string | null>(null);

  // Facets are derived from the FULL file list (not the filtered one) so the
  // dropdown options stay stable while the user is typing a search.
  const programs = useMemo(() => Array.from(new Set(files.map((f) => f.program))).sort(), [files]);
  const types = useMemo(
    () => Array.from(new Set(files.map((f) => f.content_type))).sort((a, b) => typeLabel(a).localeCompare(typeLabel(b))),
    [files],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return files.filter((f) => {
      if (programFilter && f.program !== programFilter) return false;
      if (typeFilter && f.content_type !== typeFilter) return false;
      if (q && !f.path.toLowerCase().includes(q) && !f.content.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [files, programFilter, typeFilter, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, GeneratedFile[]>();
    for (const program of programs) map.set(program, []);
    for (const f of filtered) {
      const bucket = map.get(f.program);
      if (bucket) bucket.push(f);
      else map.set(f.program, [f]); // defensive — every filtered file's program comes from `programs`
    }
    return map;
  }, [filtered, programs]);

  // Deliberately derived from the FULL list, not `filtered`: narrowing a
  // search/filter after picking a file shouldn't blank the preview pane.
  const selectedFile = useMemo(() => files.find((f) => f.path === selectedPath) ?? null, [files, selectedPath]);
  const noMatches = filtered.length === 0;

  function selectFile(f: GeneratedFile) {
    setSelectedPath(f.path);
    setCopiedPath(false);
    setCopiedContent(false);
    setPreviewMode("rendered");
  }

  function clearFilters() {
    setQuery("");
    setProgramFilter("");
    setTypeFilter("");
  }

  // Copy-confirmation timers (mirrors primitives/CodeBlock.tsx's pattern):
  // tracked in refs and cleared on unmount so a copy right before navigating
  // away never fires a state update against a gone component.
  const copyPathTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyContentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (copyPathTimer.current) clearTimeout(copyPathTimer.current);
    if (copyContentTimer.current) clearTimeout(copyContentTimer.current);
  }, []);

  function handleCopyPath() {
    if (!selectedFile) return;
    navigator.clipboard?.writeText(selectedFile.path).then(() => {
      setCopiedPath(true);
      if (copyPathTimer.current) clearTimeout(copyPathTimer.current);
      copyPathTimer.current = setTimeout(() => setCopiedPath(false), 2000);
    }).catch(() => { /* clipboard unavailable — button stays as-is */ });
  }

  function handleCopyContent() {
    if (!selectedFile) return;
    navigator.clipboard?.writeText(selectedFile.content).then(() => {
      setCopiedContent(true);
      if (copyContentTimer.current) clearTimeout(copyContentTimer.current);
      copyContentTimer.current = setTimeout(() => setCopiedContent(false), 2000);
    }).catch(() => { /* clipboard unavailable — button stays as-is */ });
  }

  function handleDownloadFile() {
    if (!selectedFile) return;
    downloadGeneratedFile(selectedFile);
  }

  async function handleDownloadProgram(program: string) {
    if (!projectId) return;
    setDownloadingProgram(program);
    try {
      await downloadExport(projectId, program);
    } catch {
      // best-effort — the button just re-enables; a repeat click retries.
    } finally {
      setDownloadingProgram(null);
    }
  }

  if (files.length === 0) {
    return (
      <div className="card">
        <EmptyState icon="layers" title="No artifacts yet" message="Run a program from the Programs tab to generate output files." />
      </div>
    );
  }

  const previewPane = (
    <PreviewPane
      file={selectedFile}
      previewMode={previewMode}
      onPreviewModeChange={setPreviewMode}
      copiedPath={copiedPath}
      copiedContent={copiedContent}
      onCopyPath={handleCopyPath}
      onCopyContent={handleCopyContent}
      onDownload={handleDownloadFile}
      noMatches={noMatches}
      onClearFilters={clearFilters}
    />
  );

  return (
    <div>
      <div className="card">
        <div className="flex gap-2 flex-wrap" style={{ alignItems: "center" }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by filename or content..."
            aria-label="Search artifacts"
            style={{ flex: "1 1 220px", minWidth: 180 }}
          />
          <select value={programFilter} onChange={(e) => setProgramFilter(e.target.value)} aria-label="Filter by program" style={{ width: "auto" }}>
            <option value="">All programs</option>
            {programs.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Filter by file type" style={{ width: "auto" }}>
            <option value="">All types</option>
            {types.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
          </select>
          <div className="flex" style={{ gap: 4 }} role="group" aria-label="View mode">
            <button type="button" className={`btn${viewMode === "tree" ? " btn-primary" : ""}`} style={{ padding: "6px 10px" }} aria-pressed={viewMode === "tree"} onClick={() => setViewMode("tree")}>
              <Icon name="list" /> Tree
            </button>
            <button type="button" className={`btn${viewMode === "grid" ? " btn-primary" : ""}`} style={{ padding: "6px 10px" }} aria-pressed={viewMode === "grid"} onClick={() => setViewMode("grid")}>
              <Icon name="grid" /> Grid
            </button>
          </div>
        </div>
        <p className="text-muted text-sm mt-2" role="status">
          {noMatches
            ? `No matches in ${files.length} file${files.length === 1 ? "" : "s"}`
            : filtered.length === files.length
              ? `${files.length} file${files.length === 1 ? "" : "s"}`
              : `${filtered.length} of ${files.length} files`}
        </p>
      </div>

      {viewMode === "tree" ? (
        <div className="grid" style={{ gridTemplateColumns: "300px 1fr", alignItems: "start" }}>
          <TreeList
            grouped={grouped}
            programs={programs}
            selectedPath={selectedPath}
            onSelect={selectFile}
            projectId={projectId}
            downloadingProgram={downloadingProgram}
            onDownloadProgram={handleDownloadProgram}
          />
          {previewPane}
        </div>
      ) : (
        <div>
          <CardGrid files={filtered} selectedPath={selectedPath} onSelect={selectFile} noMatches={noMatches} onClearFilters={clearFilters} />
          {selectedFile && <div className="mt-4">{previewPane}</div>}
        </div>
      )}
    </div>
  );
}

// ─── Tree view (grouped by program) ──────────────────────────────

function TreeList({
  grouped,
  programs,
  selectedPath,
  onSelect,
  projectId,
  downloadingProgram,
  onDownloadProgram,
}: {
  grouped: Map<string, GeneratedFile[]>;
  programs: string[];
  selectedPath: string | null;
  onSelect: (f: GeneratedFile) => void;
  projectId?: string;
  downloadingProgram: string | null;
  onDownloadProgram: (program: string) => void;
}) {
  const visiblePrograms = programs.filter((p) => (grouped.get(p)?.length ?? 0) > 0);

  return (
    <div className="card" style={{ padding: 12, maxHeight: 560, overflowY: "auto" }}>
      {visiblePrograms.length === 0 ? (
        <p className="text-muted text-sm" style={{ padding: 8 }}>No files match your filters.</p>
      ) : (
        visiblePrograms.map((program) => {
          const groupFiles = grouped.get(program) ?? [];
          return (
            <div key={program} className="mb-3">
              <div className="flex-between" style={{ padding: "4px 8px" }}>
                <span className={`badge ${programBadgeClass(program)}`}>{program}</span>
                <div className="flex" style={{ gap: 6 }}>
                  <span className="text-muted text-xs">{groupFiles.length}</span>
                  {projectId && (
                    <button
                      type="button"
                      className="btn"
                      style={{ fontSize: "0.625rem", padding: "2px 6px" }}
                      disabled={downloadingProgram === program}
                      onClick={() => onDownloadProgram(program)}
                      aria-label={`Download ${program} ZIP`}
                      title={`Download ${program} ZIP`}
                    >
                      {downloadingProgram === program ? "..." : <Icon name="download" />}
                    </button>
                  )}
                </div>
              </div>
              {groupFiles.map((f) => (
                <button
                  type="button"
                  key={f.path}
                  className={`artifact-row${selectedPath === f.path ? " active" : ""}`}
                  onClick={() => onSelect(f)}
                  title={f.path}
                >
                  <div className="mono" style={{ fontSize: "0.8125rem" }}>{f.path}</div>
                  <div className="text-muted" style={{ fontSize: "0.6875rem" }}>{f.description}</div>
                </button>
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}

// ─── Grid view (flat card grid, no program grouping) ─────────────

function CardGrid({
  files,
  selectedPath,
  onSelect,
  noMatches,
  onClearFilters,
}: {
  files: GeneratedFile[];
  selectedPath: string | null;
  onSelect: (f: GeneratedFile) => void;
  noMatches: boolean;
  onClearFilters: () => void;
}) {
  if (noMatches) {
    return (
      <div className="card">
        <EmptyState
          icon="search"
          title="No files match your filters"
          message="Try a different search term, or clear the filters."
          cta={{ label: "Clear filters", onClick: onClearFilters }}
        />
      </div>
    );
  }

  return (
    <div className="artifact-grid">
      {files.map((f) => (
        <button
          type="button"
          key={f.path}
          className={`artifact-card${selectedPath === f.path ? " active" : ""}`}
          onClick={() => onSelect(f)}
          title={f.path}
        >
          <div className="flex-between mb-1">
            <span className={`badge ${programBadgeClass(f.program)}`} style={{ fontSize: "0.6875rem" }}>{f.program}</span>
            <span className="text-muted text-xs">{typeLabel(f.content_type)}</span>
          </div>
          <div className="mono text-sm" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {f.path.split("/").pop()}
          </div>
          {f.path.includes("/") && (
            <div className="text-muted text-xs" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {f.path}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Preview pane (shared by both view modes) ────────────────────

function PreviewPane({
  file,
  previewMode,
  onPreviewModeChange,
  copiedPath,
  copiedContent,
  onCopyPath,
  onCopyContent,
  onDownload,
  noMatches,
  onClearFilters,
}: {
  file: GeneratedFile | null;
  previewMode: PreviewMode;
  onPreviewModeChange: (m: PreviewMode) => void;
  copiedPath: boolean;
  copiedContent: boolean;
  onCopyPath: () => void;
  onCopyContent: () => void;
  onDownload: () => void;
  noMatches: boolean;
  onClearFilters: () => void;
}) {
  if (!file) {
    return (
      <div className="card" style={{ minHeight: 400 }}>
        {noMatches ? (
          <EmptyState
            icon="search"
            title="No files match your filters"
            message="Try a different search term, or clear the filters."
            cta={{ label: "Clear filters", onClick: onClearFilters }}
          />
        ) : (
          <EmptyState icon="scan" title="Select a file to preview" />
        )}
      </div>
    );
  }

  const isMarkdown = file.content_type === "text/markdown";
  const sizeLabel = formatBytes(new TextEncoder().encode(file.content).length);

  return (
    <div className="card" style={{ minHeight: 400 }}>
      <div className="flex-between flex-wrap gap-2 mb-3" style={{ alignItems: "flex-start" }}>
        <div>
          <h3 className="mono" style={{ wordBreak: "break-all" }}>{file.path}</h3>
          <p className="text-muted text-sm">
            {file.description} · {typeLabel(file.content_type)} · {sizeLabel}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isMarkdown && (
            <div className="flex" style={{ gap: 4 }} role="group" aria-label="Preview mode">
              <button
                type="button"
                className={`btn${previewMode === "rendered" ? " btn-primary" : ""}`}
                style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                onClick={() => onPreviewModeChange("rendered")}
              >
                Rendered
              </button>
              <button
                type="button"
                className={`btn${previewMode === "raw" ? " btn-primary" : ""}`}
                style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                onClick={() => onPreviewModeChange("raw")}
              >
                Raw
              </button>
            </div>
          )}
          <button type="button" className="btn" style={{ fontSize: "0.75rem" }} onClick={onCopyPath}>{copiedPath ? "Copied!" : "Copy path"}</button>
          <button type="button" className="btn" style={{ fontSize: "0.75rem" }} onClick={onCopyContent}>{copiedContent ? "Copied!" : "Copy content"}</button>
          <button type="button" className="btn btn-primary" style={{ fontSize: "0.75rem" }} onClick={onDownload}>Download</button>
        </div>
      </div>

      {isMarkdown && previewMode === "rendered" ? <MarkdownLite text={file.content} /> : <pre>{file.content}</pre>}
    </div>
  );
}
