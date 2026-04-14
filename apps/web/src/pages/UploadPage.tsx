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
  // Search (free)
  { value: "context-map.json", label: "Context Map", group: "Search" },
  { value: "AGENTS.md", label: "AGENTS.md", group: "Search" },
  { value: "CLAUDE.md", label: "CLAUDE.md", group: "Search" },
  { value: ".cursorrules", label: ".cursorrules", group: "Search" },
  { value: "architecture-summary.md", label: "Architecture Summary", group: "Search" },
  // Skills (free)
  { value: "copilot-instructions.md", label: "Copilot Instructions", group: "Skills" },
  { value: "cursor-rules.md", label: "Cursor Rules", group: "Skills" },
  { value: "windsurf-rules.md", label: "Windsurf Rules", group: "Skills" },
  // Debug (free)
  { value: ".ai/debug-playbook.md", label: "Debug Playbook", group: "Debug" },
  { value: "incident-template.md", label: "Incident Template", group: "Debug" },
  { value: "tracing-rules.md", label: "Tracing Rules", group: "Debug" },
  { value: "dependency-hotspots.md", label: "Dependency Hotspots", group: "Debug" },
  // Frontend (pro)
  { value: ".ai/frontend-rules.md", label: "Frontend Rules", group: "Frontend" },
  { value: "component-guidelines.md", label: "Component Guidelines", group: "Frontend" },
  { value: "accessibility-checklist.md", label: "Accessibility Checklist", group: "Frontend" },
  // SEO (pro)
  { value: ".ai/seo-rules.md", label: "SEO Rules", group: "SEO" },
  { value: "schema-recommendations.md", label: "Schema Recommendations", group: "SEO" },
  { value: "sitemap-strategy.md", label: "Sitemap Strategy", group: "SEO" },
  // Optimization (pro)
  { value: ".ai/optimization-rules.md", label: "Optimization Rules", group: "Optimization" },
  { value: "prompt-diff-report.md", label: "Prompt Diff Report", group: "Optimization" },
  { value: "token-budget-plan.md", label: "Token Budget Plan", group: "Optimization" },
  // Theme (pro)
  { value: "theme.css", label: "Theme CSS", group: "Theme" },
  { value: "design-tokens.json", label: "Design Tokens", group: "Theme" },
  // Brand (pro)
  { value: "brand-guidelines.md", label: "Brand Guidelines", group: "Brand" },
  { value: "messaging-system.md", label: "Messaging System", group: "Brand" },
  { value: "channel-rulebook.md", label: "Channel Rulebook", group: "Brand" },
  // Marketing (pro)
  { value: "campaign-brief.md", label: "Campaign Brief", group: "Marketing" },
  { value: "funnel-map.md", label: "Funnel Map", group: "Marketing" },
  { value: "cro-playbook.md", label: "CRO Playbook", group: "Marketing" },
  // MCP (pro)
  { value: "mcp-config.json", label: "MCP Config", group: "MCP" },
  { value: "connector-map.md", label: "Connector Map", group: "MCP" },
  // Superpowers (pro)
  { value: "superpower-pack.md", label: "Superpower Pack", group: "Superpowers" },
  { value: "test-generation-rules.md", label: "Test Generation Rules", group: "Superpowers" },
  { value: "refactor-checklist.md", label: "Refactor Checklist", group: "Superpowers" },
  // Notebook (pro)
  { value: "notebook-summary.md", label: "Notebook Summary", group: "Notebook" },
  { value: "study-brief.md", label: "Study Brief", group: "Notebook" },
  { value: "research-threads.md", label: "Research Threads", group: "Notebook" },
  // Obsidian (pro)
  { value: "obsidian-skill-pack.md", label: "Obsidian Skill Pack", group: "Obsidian" },
  { value: "vault-rules.md", label: "Vault Rules", group: "Obsidian" },
  // Remotion (pro)
  { value: "remotion-script.ts", label: "Remotion Script", group: "Remotion" },
  { value: "scene-plan.md", label: "Scene Plan", group: "Remotion" },
  { value: "render-config.json", label: "Render Config", group: "Remotion" },
  // Artifacts (pro)
  { value: "component.tsx", label: "Component", group: "Artifacts" },
  { value: "dashboard-widget.tsx", label: "Dashboard Widget", group: "Artifacts" },
  // Canvas (pro)
  { value: "canvas-pack.md", label: "Canvas Pack", group: "Canvas" },
  // Algorithmic (pro)
  { value: "generative-sketch.js", label: "Generative Sketch", group: "Algorithmic" },
  { value: "parameter-pack.json", label: "Parameter Pack", group: "Algorithmic" },
];

const ESSENTIALS = ["context-map.json", "AGENTS.md", "CLAUDE.md", ".cursorrules", "copilot-instructions.md"];

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
  const [loadingStep, setLoadingStep] = useState("");
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
      setLoadingStep("Cloning repository...");
      try {
        const stepTimer = setTimeout(() => setLoadingStep("Analyzing & generating artifacts..."), 4000);
        const result = await analyzeGitHubUrl(githubUrl.trim());
        clearTimeout(stepTimer);
        setLoadingStep("");
        toast("success", `Analyzed ${result.context_map.project_identity.name} — ${result.context_map.structure.total_files} files`);
        onComplete(result);
      } catch (err) {
        setLoadingStep("");
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
    setLoadingStep("Detecting languages & frameworks...");

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
      setLoadingStep("Building context map...");
      const stepTimer = setTimeout(() => setLoadingStep("Generating artifacts..."), 3000);
      const result = await createSnapshot(payload);
      clearTimeout(stepTimer);
      setLoadingStep("");
      toast("success", `Snapshot created — ${result.generated_files.length} files generated`);
      onComplete(result);
    } catch (err) {
      setLoadingStep("");
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
      {/* ── Hero value prop ────────────────────────────────────── */}
      <section className="upload-hero">
        <h1 className="upload-hero-title">
          Turn any codebase into 87 structured AI artifacts.
        </h1>
        <p className="upload-hero-sub">
          Upload a repo and instantly generate AGENTS.md, CLAUDE.md, .cursorrules, MCP configs,
          SEO rules, brand guidelines, debug playbooks, and 80 more files — one scan across 18 programs.
        </p>
        <div className="upload-hero-pills">
          {["AGENTS.md", "CLAUDE.md", ".cursorrules", "MCP Config", "SEO Rules", "Brand Guidelines", "Debug Playbook", "Design Tokens", "Obsidian Vault", "Remotion Script"].map((label) => (
            <span key={label} className="upload-hero-pill">{label}</span>
          ))}
        </div>
      </section>

      {/* ── 18 Programs listing ──────────────────────────────────── */}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>18 Programs — 3 free · 15 pro</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
          {[
            { name: "Search", free: true }, { name: "Skills", free: true }, { name: "Debug", free: true },
            { name: "Frontend", free: false }, { name: "SEO", free: false }, { name: "Optimization", free: false },
            { name: "Theme", free: false }, { name: "Brand", free: false }, { name: "Superpowers", free: false },
            { name: "Marketing", free: false }, { name: "Notebook", free: false }, { name: "Obsidian", free: false },
            { name: "MCP", free: false }, { name: "Artifacts", free: false }, { name: "Remotion", free: false },
            { name: "Canvas", free: false }, { name: "Algorithmic", free: false },
            { name: "Agentic Purchasing", free: false },
          ].map(({ name, free }) => (
            <span key={name} className={`badge ${free ? "badge-green" : "badge-accent"}`} style={{ fontSize: "0.78rem" }}>
              {name}
            </span>
          ))}
        </div>
      </div>

      {/* ── Go Pro top banner ──────────────────────────────────────── */}
      <div className="gopro-banner">
        <div>
          <strong>Go Pro — unlock all 18 programs and 87 artifacts.</strong>
          <span style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginLeft: 8 }}>$29/month · cancel anytime · no credit card to start</span>
        </div>
        <button className="btn btn-primary" style={{ whiteSpace: "nowrap" }} onClick={() => { window.location.hash = "plans"; }}>
          See Plans
        </button>
      </div>

      <div className="card" style={{ marginBottom: 24, textAlign: "center", padding: "32px 24px" }}>
        <h2 style={{ fontSize: "1.5rem", marginBottom: 8 }}>Analyze Your Project</h2>
        <p style={{ color: "var(--text-muted)", maxWidth: 500, margin: "0 auto", marginBottom: 16 }}>
          Upload a project folder or paste a GitHub URL to generate AI context maps, governance files,
          debug playbooks, and more across 18 programs.
        </p>
        <div className="flex" style={{ gap: 8, justifyContent: "center" }}>
          <button
            type="button"
            className={`btn ${mode === "upload" ? "btn-primary" : ""}`}
            onClick={() => { setMode("upload"); setError(null); }}
          >
            Upload Files
          </button>
          <button
            type="button"
            className={`btn ${mode === "github" ? "btn-primary" : ""}`}
            onClick={() => { setMode("github"); setError(null); }}
          >
            GitHub URL
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
              <div style={{ fontSize: "2rem", marginBottom: 8, color: "var(--text-muted)" }}>[folder]</div>
              <p style={{ color: "var(--text-muted)" }}>
                Drag &amp; drop a folder or .zip file here
              </p>
              <div className="flex" style={{ gap: 8, justifyContent: "center", marginTop: 12 }}>
                <button type="button" className="btn" onClick={(e) => { e.stopPropagation(); handleFolderSelect(); }} style={{ fontSize: "0.8125rem" }}>
                  Select Folder
                </button>
                <button type="button" className="btn" onClick={(e) => { e.stopPropagation(); handleZipSelect(); }} style={{ fontSize: "0.8125rem" }}>
                  Upload .zip
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
            placeholder="e.g. Generate AI context files&#10;Improve onboarding for new developers"
            style={{ fontFamily: "var(--font)" }}
          />
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <label style={{ margin: 0 }}>Requested Outputs <span style={{ color: "var(--text-muted)", fontWeight: "normal", fontSize: "0.8rem" }}>({selectedOutputs.length} selected)</span></label>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" className="badge badge-green" style={{ cursor: "pointer" }} onClick={() => setSelectedOutputs(ESSENTIALS)}>Essentials</button>
              <button type="button" className="badge" style={{ cursor: "pointer" }} onClick={() => setSelectedOutputs(OUTPUT_OPTIONS.map(o => o.value))}>Select all</button>
              <button type="button" className="badge" style={{ cursor: "pointer" }} onClick={() => setSelectedOutputs(OUTPUT_OPTIONS.filter(o => ["Search","Skills","Debug"].includes(o.group)).map(o => o.value))}>Free only</button>
              <button type="button" className="badge" style={{ cursor: "pointer" }} onClick={() => setSelectedOutputs([])}>Clear</button>
            </div>
          </div>
          {Array.from(new Set(OUTPUT_OPTIONS.map(o => o.group))).map((group) => (
            <div key={group} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{group}</div>
              <div className="flex flex-wrap" style={{ gap: 4 }}>
                {OUTPUT_OPTIONS.filter(o => o.group === group).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`badge ${selectedOutputs.includes(opt.value) ? "badge-accent" : ""}`}
                    style={{ cursor: "pointer", padding: "3px 9px", fontSize: "0.78rem" }}
                    onClick={() => toggleOutput(opt.value)}
                  >
                    {selectedOutputs.includes(opt.value) ? "✓ " : ""}
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
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
              <span className="spinner" /> {loadingStep || (mode === "github" ? "Fetching & Analyzing..." : "Processing...")}
            </>
          ) : mode === "github" ? (
            "Analyze GitHub Repo"
          ) : (
            "Upload & Generate"
          )}
        </button>

        {/* ── Go Pro bottom banner ───────────────────────────────── */}
        <div className="gopro-banner" style={{ marginTop: 24 }}>
          <div>
            <strong>Ready for all 18 programs?</strong>
            <span style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginLeft: 8 }}>Go Pro for $29/month — all 87 artifacts, unlimited analysis, priority support.</span>
          </div>
          <button type="button" className="btn btn-primary" style={{ whiteSpace: "nowrap" }} onClick={() => { window.location.hash = "plans"; }}>
            Go Pro
          </button>
        </div>
      </form>
    </div>
  );
}
