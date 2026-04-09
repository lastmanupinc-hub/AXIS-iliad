import { useState, useRef, type FormEvent, type DragEvent } from "react";
import { createSnapshot, analyzeGitHubUrl, type SnapshotPayload, type SnapshotResponse } from "../api.ts";
import { useToast } from "../components/Toast.tsx";
import { shouldIgnore, detectFrameworks, extractZip } from "../upload-utils.ts";

interface Props {
  onComplete: (data: SnapshotResponse) => void;
}

const PROJECT_TYPES = [
  "web_application",
  "api_service",
  "cli_tool",
  "library",
  "monorepo",
  "mobile_app",
  "desktop_app",
  "static_site",
];

const OUTPUT_OPTIONS = [
  { value: "context-map.json", label: "Context Map" },
  { value: "AGENTS.md", label: "AGENTS.md" },
  { value: "CLAUDE.md", label: "CLAUDE.md" },
  { value: ".cursorrules", label: ".cursorrules" },
  { value: ".ai/debug-playbook.md", label: "Debug Playbook" },
  { value: "incident-template.md", label: "Incident Template" },
  { value: "tracing-rules.md", label: "Tracing Rules" },
  { value: ".ai/frontend-rules.md", label: "Frontend Rules" },
  { value: "component-guidelines.md", label: "Component Guidelines" },
];

export function UploadPage({ onComplete }: Props) {
  const [mode, setMode] = useState<"upload" | "github">("upload");
  const [projectName, setProjectName] = useState("");
  const [projectType, setProjectType] = useState("web_application");
  const [goals, setGoals] = useState("Generate AI context files");
  const [selectedOutputs, setSelectedOutputs] = useState<string[]>(
    OUTPUT_OPTIONS.map((o) => o.value),
  );
  const [files, setFiles] = useState<Array<{ path: string; content: string; size: number }>>([]);
  const [githubUrl, setGithubUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const [skippedCount, setSkippedCount] = useState(0);
  const { toast } = useToast();

  async function readFiles(fileList: FileList) {
    const results: Array<{ path: string; content: string; size: number }> = [];
    let skipped = 0;
    for (const file of Array.from(fileList)) {
      const relativePath =
        (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      if (shouldIgnore(relativePath)) continue;
      if (file.size > 1024 * 1024) { skipped++; continue; } // skip files > 1MB
      try {
        const content = await file.text();
        results.push({ path: relativePath, content, size: file.size });
      } catch {
        skipped++; // binary files
      }
    }
    setSkippedCount(skipped);
    return results;
  }

  async function handleZipFile(file: File) {
    try {
      const buffer = await file.arrayBuffer();
      const { files: extracted, skipped } = await extractZip(buffer);
      setSkippedCount(skipped);
      setFiles(extracted);
      if (!projectName && extracted.length > 0) {
        // Use zip filename without extension as project name
        const zipName = file.name.replace(/\.zip$/i, "");
        setProjectName(zipName);
      }
      toast("success", `Extracted ${extracted.length} files from ${file.name}${skipped > 0 ? ` (${skipped} skipped)` : ""}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to extract zip";
      setError(msg);
      toast("error", msg);
    }
  }

  async function handleFolderSelect() {
    fileInputRef.current?.click();
  }

  async function handleZipSelect() {
    zipInputRef.current?.click();
  }

  async function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    const newFiles = await readFiles(e.target.files);
    setFiles(newFiles);
    if (!projectName && newFiles.length > 0) {
      const first = newFiles[0].path.split("/")[0];
      if (first && !first.includes(".")) setProjectName(first);
    }
    e.target.value = "";
  }

  async function handleZipInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    await handleZipFile(e.target.files[0]);
    e.target.value = "";
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (!e.dataTransfer.files.length) return;
    // Check if any dropped file is a .zip
    const firstFile = e.dataTransfer.files[0];
    if (firstFile.name.toLowerCase().endsWith(".zip")) {
      await handleZipFile(firstFile);
    } else {
      const newFiles = await readFiles(e.dataTransfer.files);
      setFiles(newFiles);
    }
  }

  function toggleOutput(value: string) {
    setSelectedOutputs((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (mode === "github") {
      if (!githubUrl.trim()) {
        setError("Please enter a GitHub repository URL");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const result = await analyzeGitHubUrl(githubUrl.trim());
        toast("success", `Analyzed ${result.context_map.project_identity.name} — ${result.context_map.structure.total_files} files`);
        onComplete(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "GitHub analysis failed";
        setError(msg);
        toast("error", msg);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (files.length === 0) {
      setError("Please select a folder or drop files");
      return;
    }
    if (!projectName.trim()) {
      setError("Project name is required");
      return;
    }

    setLoading(true);
    setError(null);

    const detectedFrameworks = detectFrameworks(files);

    const payload: SnapshotPayload = {
      input_method: "manual_file_upload",
      manifest: {
        project_name: projectName.trim(),
        project_type: projectType,
        frameworks: detectedFrameworks,
        goals: goals
          .split("\n")
          .map((g) => g.trim())
          .filter(Boolean),
        requested_outputs: selectedOutputs,
      },
      files,
    };

    try {
      const result = await createSnapshot(payload);
      toast("success", `Snapshot created — ${result.generated_files.length} files generated`);
      onComplete(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setError(msg);
      toast("error", msg);
    } finally {
      setLoading(false);
    }
  }

  const totalSize = files.reduce((s, f) => s + f.size, 0);

  return (
    <div>
      <div className="card" style={{ marginBottom: 24, textAlign: "center", padding: "32px 24px" }}>
        <h2 style={{ fontSize: "1.5rem", marginBottom: 8 }}>Analyze Your Project</h2>
        <p style={{ color: "var(--text-muted)", maxWidth: 500, margin: "0 auto", marginBottom: 16 }}>
          Upload a project folder or paste a GitHub URL to generate AI context maps, governance files,
          debug playbooks, and more across 17 programs.
        </p>
        <div className="flex" style={{ gap: 8, justifyContent: "center" }}>
          <button
            type="button"
            className={`btn ${mode === "upload" ? "btn-primary" : ""}`}
            onClick={() => { setMode("upload"); setError(null); }}
          >
            📁 Upload Files
          </button>
          <button
            type="button"
            className={`btn ${mode === "github" ? "btn-primary" : ""}`}
            onClick={() => { setMode("github"); setError(null); }}
          >
            🔗 GitHub URL
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {mode === "github" ? (
          <div className="card" style={{ marginBottom: 16, padding: "24px" }}>
            <label>GitHub Repository URL</label>
            <input
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              style={{ marginBottom: 12 }}
            />
            <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", margin: 0 }}>
              Supports public repositories. Examples: https://github.com/vercel/next.js or https://github.com/owner/repo/tree/branch
            </p>
          </div>
        ) : (
          <>
        <div className="grid grid-2" style={{ marginBottom: 16 }}>
          <div className="card">
            <label>Project Name</label>
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="my-project"
              required
            />
          </div>
          <div className="card">
            <label>Project Type</label>
            <select value={projectType} onChange={(e) => setProjectType(e.target.value)}>
              {PROJECT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <label>Goals (one per line)</label>
          <textarea
            value={goals}
            onChange={(e) => setGoals(e.target.value)}
            rows={2}
            style={{ fontFamily: "var(--font)" }}
          />
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <label style={{ marginBottom: 8 }}>Requested Outputs</label>
          <div className="flex flex-wrap" style={{ gap: 6 }}>
            {OUTPUT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`badge ${selectedOutputs.includes(opt.value) ? "badge-accent" : ""}`}
                style={{ cursor: "pointer", padding: "4px 10px", fontSize: "0.8125rem" }}
                onClick={() => toggleOutput(opt.value)}
              >
                {selectedOutputs.includes(opt.value) ? "✓ " : ""}
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div
          className="card"
          style={{
            marginBottom: 16,
            border: dragOver ? "1px solid var(--accent)" : undefined,
            textAlign: "center",
            padding: "40px 24px",
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: "none" }}
            {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
            multiple
            onChange={handleFileInputChange}
          />
          <input
            ref={zipInputRef}
            type="file"
            style={{ display: "none" }}
            accept=".zip,application/zip,application/x-zip-compressed"
            onChange={handleZipInputChange}
          />
          {files.length === 0 ? (
            <>
              <div style={{ fontSize: "2rem", marginBottom: 8 }}>📁</div>
              <p style={{ color: "var(--text-muted)" }}>
                Drag & drop a folder or .zip file here
              </p>
              <div className="flex" style={{ gap: 8, justifyContent: "center", marginTop: 12 }}>
                <button type="button" className="btn" onClick={(e) => { e.stopPropagation(); handleFolderSelect(); }} style={{ fontSize: "0.8125rem" }}>
                  📂 Select Folder
                </button>
                <button type="button" className="btn" onClick={(e) => { e.stopPropagation(); handleZipSelect(); }} style={{ fontSize: "0.8125rem" }}>
                  📦 Upload .zip
                </button>
              </div>
              <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: 4 }}>
                node_modules, .git, dist, and binary files are automatically excluded
              </p>
            </>
          ) : (
            <>
              <div className="flex-between" style={{ marginBottom: 8 }}>
                <span className="badge badge-green">{files.length} files</span>
                <span className="badge">{(totalSize / 1024).toFixed(1)} KB</span>
                {skippedCount > 0 && (
                  <span className="badge" style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>
                    {skippedCount} skipped (&gt;1 MB / binary)
                  </span>
                )}
              </div>
              <div
                style={{
                  maxHeight: 200,
                  overflow: "auto",
                  textAlign: "left",
                  fontSize: "0.8125rem",
                  fontFamily: "var(--mono)",
                  color: "var(--text-muted)",
                }}
              >
                {files.slice(0, 50).map((f) => (
                  <div key={f.path}>{f.path}</div>
                ))}
                {files.length > 50 && (
                  <div style={{ color: "var(--accent)" }}>... and {files.length - 50} more</div>
                )}
              </div>
            </>
          )}
        </div>
          </>
        )}

        {error && (
          <div className="card" style={{ borderColor: "var(--red)", marginBottom: 16 }}>
            <p style={{ color: "var(--red)" }}>{error}</p>
          </div>
        )}

        <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: "100%", justifyContent: "center", padding: 12 }}>
          {loading ? (
            <>
              <span className="spinner" /> {mode === "github" ? "Fetching & Analyzing..." : "Processing..."}
            </>
          ) : mode === "github" ? (
            "🔗 Analyze GitHub Repo"
          ) : (
            "🚀 Upload & Generate"
          )}
        </button>
      </form>
    </div>
  );
}
