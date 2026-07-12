import { useState, useRef, useEffect, useMemo, useCallback, type FormEvent, type DragEvent } from "react";
import {
  createSnapshot,
  analyzeGitHubUrl,
  getPrograms,
  listGitHubTokens,
  mppPricing,
  mppPricePerCall,
  apiErrorDetails,
  ApiError,
  type SnapshotPayload,
  type SnapshotResponse,
  type ProgramCatalogEntry,
  type GitHubTokenSummary,
  type MppPricing,
} from "../api.ts";
import { useToast } from "../components/Toast.tsx";
import { UpsellModal } from "../components/UpsellModal.tsx";
import { Callout, Skeleton, formatUsdCents } from "../components/primitives/index.ts";
import { shouldIgnore, detectFrameworks, extractZip, buildGitHubUrl, titleCaseProgram } from "../upload-utils.ts";
// Single-source counts (WO-F5) — never inline these numbers.
import { FREE_PROGRAM_COUNT, PROGRAM_COUNT, FREE_PROGRAM_NAMES } from "../config.ts";

// ─── AnalyzePage (WO-P1 split; advanced options — WO-P4) ─────────────────────
// The form half of the former UploadPage, split from the marketing hero (now
// pages/HomePage.tsx at #home). GitHub URL or folder/.zip upload, tier
// pre-check, gzip for big payloads, UpsellModal on 402/429 — all unchanged.
// WO-P4 adds: an explicit branch field (folded into the URL — the backend has
// no separate branch param), a private-repo token picker (stored-token
// awareness + a one-off paste field, never persisted client-side), a "lite
// mode" budget toggle (X-Agent-Mode: lite), and a program/output picker
// driven by the live GET /v1/programs catalog instead of a hand-maintained
// list. What happens to a successful anonymous result (shown vs. gated) is
// decided by the caller via `onComplete` — see App.tsx's handleAnalyzeComplete (H9).

interface Props {
  onComplete: (data: SnapshotResponse) => void;
  /** Gates the stored-GitHub-token lookup (account-scoped — GET
   *  /v1/account/github-token 401s for anonymous callers). Omit/false for
   *  logged-out renders; the paste-a-token field still works either way. */
  loggedIn?: boolean;
  /** WO-P11: pre-fills the GitHub URL field (the Projects list's
   *  "Re-analyze" action) — read once as the githubUrl state's initial
   *  value. Safe to read only-at-mount because every navigation to this
   *  page gets a fresh `route.key` (App.tsx), remounting AnalyzePage rather
   *  than reusing a stale instance with a now-outdated prop. */
  initialUrl?: string;
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

/** Preferred default selection — used only if present in the live catalog
 *  (outputOptions); if the catalog hasn't loaded yet or these were renamed
 *  upstream, the run still proceeds (generateFiles always includes the core
 *  search outputs regardless of what's requested). */
const ESSENTIAL_CANDIDATES = ["context-map.json", "AGENTS.md", "CLAUDE.md", ".cursorrules"];

/** Always-free programs, as a Set for O(1) checks against the live catalog's
 *  `program.name` (WO-P4 — replaces a hand-maintained capitalized-group Set
 *  that only matched the old hardcoded output list). */
const FREE_PROGRAM_SET = new Set<string>(FREE_PROGRAM_NAMES);

interface OutputOption {
  value: string;
  program: string;
}

interface TierBlockState {
  blocked: string[];
  allowed: string[];
  /** Both pricing tiers from the 402 payload (mode-invariant) — null when
   *  the block happened client-side before any request was sent (no live
   *  price to show without guessing). */
  pricing: MppPricing | null;
  /** The price THIS request would actually be charged, reflecting the
   *  X-Agent-Mode header it sent — null when not applicable. */
  pricePerCall: string | null;
  /** Whether X-Agent-Mode: lite was actually sent on the request that
   *  produced this block — captured at request time (not read live off the
   *  lite-mode checkbox) so toggling the checkbox afterward can't relabel a
   *  price that was already quoted under the other mode. */
  requestedLite: boolean;
}

export function AnalyzePage({ onComplete, loggedIn, initialUrl }: Props) {
  const [mode, setMode] = useState<"upload" | "github">("github");
  const [projectName, setProjectName] = useState("");
  const [projectType, setProjectType] = useState("web_application");
  const [goals, setGoals] = useState("Generate AI context files");
  const [selectedOutputs, setSelectedOutputs] = useState<string[]>(ESSENTIAL_CANDIDATES);
  const [files, setFiles] = useState<Array<{ path: string; content: string; size: number }>>([]);
  const [githubUrl, setGithubUrl] = useState(initialUrl ?? "");
  const [branch, setBranch] = useState("");
  const [pastedToken, setPastedToken] = useState("");
  const [storedTokens, setStoredTokens] = useState<GitHubTokenSummary[]>([]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [liteMode, setLiteMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tierBlock, setTierBlock] = useState<TierBlockState | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const [skippedCount, setSkippedCount] = useState(0);
  const [catalog, setCatalog] = useState<ProgramCatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<{ message: string; details: string | null } | null>(null);
  const { toast } = useToast();

  // WO-P4: the output picker is driven by the live program registry instead
  // of a hand-maintained list (the old 45-output list undercounted the real
  // 20-program catalog and included outputs under their pre-alias names —
  // see docs/web-plan/AUDIT-pages.md item 4).
  const loadCatalog = useCallback(() => {
    setCatalogLoading(true);
    setCatalogError(null);
    return getPrograms()
      .then((res) => setCatalog(res.programs ?? []))
      .catch((err) =>
        setCatalogError({
          message: err instanceof Error ? err.message : "Failed to load the program catalog",
          details: apiErrorDetails(err),
        }),
      )
      .finally(() => setCatalogLoading(false));
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const outputOptions = useMemo<OutputOption[]>(
    () => catalog.flatMap((p) => p.outputs.map((value) => ({ value, program: p.name }))),
    [catalog],
  );

  // WO-P4: stored GitHub tokens are account-scoped (GET /v1/account/github-token,
  // masked — token_prefix only, never the raw secret). Anonymous visitors skip
  // the lookup; they can still paste a one-off token below.
  useEffect(() => {
    if (!loggedIn) {
      setStoredTokens([]);
      return;
    }
    let cancelled = false;
    setTokensLoading(true);
    listGitHubTokens()
      .then((res) => {
        if (!cancelled) setStoredTokens((res.tokens ?? []).filter((t) => t.valid));
      })
      .catch(() => {
        if (!cancelled) setStoredTokens([]); // non-critical — paste-a-token still works
      })
      .finally(() => {
        if (!cancelled) setTokensLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loggedIn]);

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

  /** Shared 402/429 handling for both analyze paths. WO-P4: also extracts the
   *  live pricing block so toggling lite mode and retrying demonstrably
   *  changes the price shown (mppPricing/mppPricePerCall — api.ts). */
  function applyAnalyzeError(err: unknown, fallbackMessage: string) {
    setLoadingStep("");
    if (err instanceof ApiError && (err.errorCode === "TIER_REQUIRED" || err.status === 402)) {
      setTierBlock({
        blocked: (err.extra.blocked_programs as string[] | undefined) ?? [],
        allowed: (err.extra.allowed_programs as string[] | undefined) ?? [...FREE_PROGRAM_NAMES],
        pricing: mppPricing(err),
        pricePerCall: mppPricePerCall(err),
        requestedLite: liteMode,
      });
      setError(err.message);
    } else if (err instanceof ApiError && (err.errorCode === "QUOTA_EXCEEDED" || err.status === 429)) {
      setTierBlock({
        blocked: [],
        allowed: [...FREE_PROGRAM_NAMES],
        pricing: mppPricing(err),
        pricePerCall: mppPricePerCall(err),
        requestedLite: liteMode,
      });
      setError(err.message);
    } else {
      setTierBlock(null);
      const msg = err instanceof Error ? err.message : fallbackMessage;
      setError(msg);
      toast("error", msg);
    }
  }

  /** Narrow the current selection to free-tier outputs only — shared by the
   *  inline tier-block card and UpsellModal's "Use Free Programs Only". */
  function applyFreeOnly() {
    if (!tierBlock) return;
    const freePrograms = new Set(tierBlock.allowed);
    const freeOutputs = selectedOutputs.filter((o) => {
      const opt = outputOptions.find((x) => x.value === o);
      return opt ? freePrograms.has(opt.program) : false;
    });
    setSelectedOutputs(freeOutputs.length > 0 ? freeOutputs : ESSENTIAL_CANDIDATES);
    setError(null);
    setTierBlock(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    // Client-side pre-check: catch pro program selection before the network
    // round-trip. Program names come from the live catalog (outputOptions),
    // so this can't drift from GET /v1/programs.
    const proSelected = selectedOutputs
      .map((v) => outputOptions.find((o) => o.value === v))
      .filter((o) => o && !FREE_PROGRAM_SET.has(o.program))
      .map((o) => o!.program);
    const uniqueProPrograms = [...new Set(proSelected)].sort();

    if (uniqueProPrograms.length > 0 && !localStorage.getItem("axis_api_key")) {
      // Anonymous user trying pro programs — show upsell immediately. No
      // request was sent, so there's no live price to show (pricing stays
      // null rather than guessing a number that could drift from the
      // server's actual pricing tiers).
      setTierBlock({
        blocked: uniqueProPrograms,
        allowed: [...FREE_PROGRAM_NAMES],
        pricing: null,
        pricePerCall: null,
        requestedLite: liteMode,
      });
      setError(`Free tier includes ${FREE_PROGRAM_COUNT} programs (${FREE_PROGRAM_NAMES.join(", ")}). Sign up or upgrade to Starter, Pro, or Growth to unlock: ${uniqueProPrograms.join(", ")}.`);
      toast("error", "Upgrade your tier to unlock those programs");
      return;
    }

    if (mode === "github") {
      if (!githubUrl.trim()) {
        setError("Please enter a GitHub repository URL");
        return;
      }
      setLoading(true);
      setError(null);

      const finalUrl = buildGitHubUrl(githubUrl, branch);
      const token = pastedToken.trim() || undefined;

      setLoadingStep("Cloning repository...");
      try {
        const stepTimer = setTimeout(() => setLoadingStep("Analyzing & generating artifacts..."), 4000);
        const result = await analyzeGitHubUrl(finalUrl, { token, lite: liteMode });
        clearTimeout(stepTimer);
        setLoadingStep("");
        setPastedToken(""); // one-off token — never held longer than the request that used it
        toast("success", `Analyzed ${result.context_map.project_identity.name} — ${result.context_map.structure.total_files} files`);
        onComplete(result);
      } catch (err) {
        applyAnalyzeError(err, "GitHub analysis failed");
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

    // Log payload size to help diagnose upload failures
    const jsonBody = JSON.stringify(payload);
    const payloadMB = (jsonBody.length / 1_048_576).toFixed(1);
    if (import.meta.env.DEV) console.log(`[AXIS] Upload payload: ${files.length} files, ${payloadMB} MB JSON`);

    if (jsonBody.length > 50_000_000) {
      setError(`Upload too large (${payloadMB} MB). Reduce file count or remove large files. Max is 50 MB.`);
      setLoading(false);
      return;
    }

    try {
      setLoadingStep("Uploading & building context map...");
      const stepTimer = setTimeout(() => setLoadingStep("Generating artifacts..."), 3000);
      const result = await createSnapshot(payload, jsonBody, { lite: liteMode });
      clearTimeout(stepTimer);
      setLoadingStep("");
      toast("success", `Snapshot created — ${result.generated_files.length} files generated`);
      onComplete(result);
    } catch (err) {
      applyAnalyzeError(err, "Upload failed");
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
          debug playbooks, and more across {PROGRAM_COUNT} programs.
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

            <label>Branch <span className="text-muted text-xs">(optional — defaults to the repo's default branch)</span></label>
            <input
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              style={{ marginBottom: 12 }}
            />

            <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", margin: 0 }}>
              Supports public repositories, plus private ones you have a token for. Paste a plain repo
              URL and use Branch for a non-default one, or paste a URL that already ends in /tree/branch.
            </p>

            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <label>Private repository token <span className="text-muted text-xs">(optional)</span></label>
              {loggedIn && tokensLoading && (
                <p className="text-muted text-sm">Checking your saved GitHub tokens…</p>
              )}
              {loggedIn && !tokensLoading && storedTokens.length > 0 && !pastedToken.trim() && (
                <p className="text-muted text-sm mb-2">
                  Your saved token <code>{storedTokens[0].label}</code> ({storedTokens[0].token_prefix}••••) will be used automatically for private repos.
                </p>
              )}
              <input
                type="password"
                value={pastedToken}
                onChange={(e) => setPastedToken(e.target.value)}
                placeholder={
                  loggedIn && storedTokens.length > 0
                    ? "Paste a token to use instead of your saved one for this run"
                    : "ghp_... (used once for this request, never stored in your browser)"
                }
              />
              {!loggedIn && (
                <p className="text-muted text-xs mt-1">
                  Sign in to reuse a saved token across analyses — this one is used only for this request.
                </p>
              )}
            </div>
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
              <div style={{ fontSize: "2rem", marginBottom: 8 }}>📁</div>
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
            {!catalogLoading && !catalogError && (
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" className="badge badge-green" style={{ cursor: "pointer" }} onClick={() => setSelectedOutputs(ESSENTIAL_CANDIDATES)}>Essentials</button>
                <button type="button" className="badge" style={{ cursor: "pointer" }} onClick={() => setSelectedOutputs(outputOptions.map((o) => o.value))}>Select all</button>
                <button type="button" className="badge" style={{ cursor: "pointer" }} onClick={() => setSelectedOutputs(outputOptions.filter((o) => FREE_PROGRAM_SET.has(o.program)).map((o) => o.value))}>Free only</button>
                <button type="button" className="badge" style={{ cursor: "pointer" }} onClick={() => setSelectedOutputs([])}>Clear</button>
              </div>
            )}
          </div>
          {catalogLoading ? (
            <Skeleton lines={4} />
          ) : catalogError ? (
            <Callout tone="warning" title="Couldn't load the live program list" details={catalogError.details}>
              {catalogError.message}{" "}
              <button type="button" className="btn" onClick={() => void loadCatalog()}>Retry</button>
            </Callout>
          ) : (
            catalog.map((program) => (
              <div key={program.name} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                  {titleCaseProgram(program.name)}{!FREE_PROGRAM_SET.has(program.name) ? " · pro" : ""}
                </div>
                <div className="flex flex-wrap" style={{ gap: 4 }}>
                  {program.outputs.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`badge ${selectedOutputs.includes(value) ? "badge-accent" : ""}`}
                      style={{ cursor: "pointer", padding: "3px 9px", fontSize: "0.78rem" }}
                      onClick={() => toggleOutput(value)}
                    >
                      {selectedOutputs.includes(value) ? "✓ " : ""}
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
          </>
        )}

        {error && tierBlock ? (
          <div className="card" style={{ borderColor: "var(--accent)", marginBottom: 16, textAlign: "center", padding: "24px 16px" }}>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>🔒 Pro Programs Required</p>
            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: 12 }}>
              Your selection includes programs that require a Pro plan:
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center", marginBottom: 16 }}>
              {tierBlock.blocked.map((p) => (
                <span key={p} className="badge badge-accent" style={{ fontSize: "0.78rem" }}>{p}</span>
              ))}
            </div>
            {(tierBlock.pricePerCall || tierBlock.pricing) && (
              <p className="text-sm text-muted mb-3">
                {tierBlock.pricePerCall ? (
                  <>This run would cost <strong>{tierBlock.pricePerCall}</strong>{tierBlock.requestedLite ? " (lite mode)" : ""}.</>
                ) : (
                  tierBlock.pricing && (
                    <>Per-run price: standard <strong>{formatUsdCents(tierBlock.pricing.standard.amount_cents)}</strong> · lite <strong>{formatUsdCents(tierBlock.pricing.lite.amount_cents)}</strong>.</>
                  )
                )}
              </p>
            )}
            <button type="button" className="btn btn-primary" style={{ marginRight: 8 }} onClick={() => { window.location.hash = "plans"; }}>
              Go Pro — Unlock All {PROGRAM_COUNT} Programs
            </button>
            <button type="button" className="btn" onClick={applyFreeOnly}>
              Use Free Programs Only
            </button>
          </div>
        ) : error ? (
          <div className="card" style={{ borderColor: "var(--red)", marginBottom: 16 }}>
            <p style={{ color: "var(--red)" }}>{error}</p>
          </div>
        ) : null}

        <label className="flex" style={{ gap: 8, alignItems: "flex-start", marginBottom: 12, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={liteMode}
            onChange={(e) => setLiteMode(e.target.checked)}
            style={{ width: "auto", marginTop: 3 }}
          />
          <span className="text-sm text-muted">
            Lite mode — if this run needs a paid program, ask for reduced-price processing (fewer
            artifacts, lower price) instead of the full bundle. Free-tier runs are unaffected.
          </span>
        </label>

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

        <p style={{ textAlign: "center", marginTop: 20, color: "var(--text-muted)", fontSize: "0.8125rem" }}>
          Free: {FREE_PROGRAM_COUNT} programs · <button type="button" className="btn" style={{ padding: "2px 10px", fontSize: "0.8125rem" }} onClick={() => { window.location.hash = "plans"; }}>Go Pro</button> to unlock all {PROGRAM_COUNT}
        </p>
      </form>

      {/* ── Upsell modal (full-screen overlay) ────────────────────── */}
      {tierBlock && (
        <UpsellModal
          blocked={tierBlock.blocked}
          allowed={tierBlock.allowed}
          pricing={tierBlock.pricing ? { standardCents: tierBlock.pricing.standard.amount_cents, liteCents: tierBlock.pricing.lite.amount_cents } : undefined}
          mode={tierBlock.requestedLite ? "lite" : "standard"}
          onGoFree={applyFreeOnly}
          onClose={() => {
            setError(null);
            setTierBlock(null);
          }}
        />
      )}
    </div>
  );
}
