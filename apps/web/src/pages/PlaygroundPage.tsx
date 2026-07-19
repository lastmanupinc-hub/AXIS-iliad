import { useState, useEffect, useCallback, useRef, type FormEvent } from "react";
import {
  analyzeQuick,
  getQuota,
  ApiError,
  apiErrorDetails,
  type AnalyzeQuickResponse,
  type QuotaResponse,
} from "../api.ts";
import { SectionHeader, StatTile, Pill, CodeBlock, Callout, Skeleton } from "../components/primitives/index.ts";
import { ProbeIntentDemo } from "../components/ProbeIntentDemo.tsx";
import { FREE_PROGRAM_COUNT, PRO_PROGRAM_COUNT } from "../config.ts";

// ─── PlaygroundPage (WO-P15) ──────────────────────────────────────────────
// Public, no login required ("#playground"). A fuller standalone version of
// HomePage's LiveDemoTeaser: pick from a few curated sample repos (or paste
// any public GitHub URL), run a real anonymous analysis restricted to the
// free programs via POST /v1/analyze, and browse the actual generated files
// inline — no redirect to the full project view, so this stays a true
// single-page "try it now" experience. The anon rate-limit meter and the
// probe-intent box round out the "try before you sign up" surface.
//
// Deliberately uses analyzeQuick (not the heavier createSnapshot/
// analyzeGitHubUrl flow AnalyzePage uses) — that endpoint's response shape
// doesn't fit the shared `axis_anon_result` localStorage slot (which expects
// a full SnapshotResponse), so this page caches its own last result under a
// separate key instead of overloading that slot with an incompatible shape.

const SAMPLE_REPOS = [
  { url: "https://github.com/octocat/Hello-World", label: "Hello World", hint: "The original GitHub demo repo" },
  { url: "https://github.com/railwayapp-templates/expressjs", label: "Express + TypeScript", hint: "Minimal Node.js API template" },
  { url: "https://github.com/railwayapp-templates/django", label: "Django + Python", hint: "Minimal Python web app template" },
];

type PlaygroundState = "idle" | "loading" | "done" | "error";

const RESULT_CACHE_KEY = "axis_playground_result";

interface AsyncError {
  message: string;
  details: string | null;
}

interface Props {
  loggedIn: boolean;
  onRequireLogin: () => void;
}

export function PlaygroundPage({ loggedIn, onRequireLogin }: Props) {
  const [repoUrl, setRepoUrl] = useState("");
  const [state, setState] = useState<PlaygroundState>("idle");
  const [result, setResult] = useState<AnalyzeQuickResponse | null>(null);
  const [error, setError] = useState<AsyncError | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [quota, setQuota] = useState<QuotaResponse | null>(null);

  useEffect(() => {
    const cached = localStorage.getItem(RESULT_CACHE_KEY);
    if (!cached) return;
    try {
      const parsed = JSON.parse(cached) as AnalyzeQuickResponse;
      setResult(parsed);
      setSelectedPath(parsed.files[0]?.path ?? null);
      setState("done");
    } catch {
      localStorage.removeItem(RESULT_CACHE_KEY);
    }
  }, []);

  // H-Phase-A cycle 12: loadQuota fires on mount and again after a
  // successful run() — guard against the mount call's response landing
  // after the post-run call's fresher one and overwriting it.
  const quotaRequestIdRef = useRef(0);
  const loadQuota = useCallback(() => {
    // The rate-limit meter is a nice-to-have, not load-bearing — a failed
    // fetch just leaves it unrendered rather than blocking the page.
    const requestId = ++quotaRequestIdRef.current;
    getQuota()
      .then((q) => { if (requestId === quotaRequestIdRef.current) setQuota(q); })
      .catch(() => {});
  }, []);

  useEffect(() => { loadQuota(); }, [loadQuota]);

  async function run(url: string) {
    setState("loading");
    setError(null);
    try {
      const data = await analyzeQuick({ github_url: url });
      setResult(data);
      setSelectedPath(data.files[0]?.path ?? null);
      setState("done");
      localStorage.setItem(RESULT_CACHE_KEY, JSON.stringify(data));
      loadQuota();
    } catch (err) {
      setError({
        message: err instanceof ApiError ? err.message : "Analysis failed — try again.",
        details: apiErrorDetails(err),
      });
      setState("error");
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = repoUrl.trim();
    if (trimmed) void run(trimmed);
  }

  function reset() {
    setResult(null);
    setSelectedPath(null);
    setState("idle");
    setRepoUrl("");
    localStorage.removeItem(RESULT_CACHE_KEY);
  }

  const selectedFile = result?.files.find((f) => f.path === selectedPath) ?? null;
  const busy = state === "loading";

  return (
    <div>
      <SectionHeader
        title="Playground"
        sub="Run a real analysis on a public repo — no account required. Free programs only; sign up to unlock the rest."
        level="h1"
      />

      {quota && !quota.authenticated && (
        <div className="card mb-4">
          <div className="flex-between">
            <span className="text-muted text-sm">Anonymous rate limit</span>
            <span className="mono text-sm">
              {quota.rate_limit.remaining} / {quota.rate_limit.limit} requests remaining this minute
            </span>
          </div>
          <div className="progress-bar mt-2">
            <div
              className="progress-fill"
              style={{ width: `${Math.max(0, Math.min(100, (quota.rate_limit.remaining / quota.rate_limit.limit) * 100))}%` }}
            />
          </div>
        </div>
      )}

      <div className="card mb-4">
        <h2 className="mb-3" style={{ fontSize: "1rem", fontWeight: 600 }}>Try a sample repo</h2>
        <div className="grid grid-3 mb-4">
          {SAMPLE_REPOS.map((r) => (
            <button
              key={r.url}
              type="button"
              disabled={busy}
              onClick={() => void run(r.url)}
              style={{
                textAlign: "left",
                padding: 14,
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                background: "var(--bg)",
                cursor: busy ? "default" : "pointer",
              }}
            >
              <strong style={{ fontSize: "0.875rem" }}>{r.label}</strong>
              <p className="text-muted text-xs mt-1" style={{ margin: "4px 0 0" }}>{r.hint}</p>
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            placeholder="https://github.com/owner/repo"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            disabled={busy}
            style={{ flex: 1 }}
            aria-label="Public GitHub repo URL"
          />
          <button type="submit" className="btn btn-primary" disabled={busy || !repoUrl.trim()}>
            {busy ? "Analyzing…" : "Analyze"}
          </button>
        </form>
      </div>

      {state === "loading" && (
        <div className="card" role="status" aria-live="polite">
          <p className="text-muted text-sm mb-3">Cloning and analyzing…</p>
          <Skeleton lines={6} />
        </div>
      )}

      {state === "error" && error && (
        <Callout tone="danger" title="Analysis failed" details={error.details}>
          {error.message} <button type="button" className="btn" onClick={() => void run(repoUrl.trim())}>Retry</button>
        </Callout>
      )}

      {state === "done" && result && (
        <div className="stagger">
          <div className="card">
            <div className="flex-between mb-3" style={{ flexWrap: "wrap", gap: 8 }}>
              <div className="flex gap-2 flex-wrap">
                <Pill tone="accent">{result.analysis.project_name}</Pill>
                {result.analysis.language && <Pill>{result.analysis.language}</Pill>}
                {result.analysis.frameworks.slice(0, 4).map((fw) => (
                  <Pill key={fw} tone="outline">{fw}</Pill>
                ))}
              </div>
              <button type="button" className="btn" onClick={reset}>Try another repo</button>
            </div>
            <div className="grid grid-3">
              <StatTile label="Files scanned" value={result.analysis.file_count} />
              <StatTile label="Free programs run" value={result.programs_run} />
              <StatTile label="Files generated" value={result.total_files} />
            </div>
          </div>

          <div className="card">
            <h2 className="mb-3" style={{ fontSize: "1rem", fontWeight: 600 }}>Generated files ({result.files.length})</h2>
            <div className="grid grid-2" style={{ gap: 16 }}>
              <div>
                {result.files.map((f) => (
                  <button
                    key={f.path}
                    type="button"
                    className={`artifact-row${selectedPath === f.path ? " active" : ""}`}
                    onClick={() => setSelectedPath(f.path)}
                    style={{ display: "block", width: "100%", textAlign: "left" }}
                  >
                    <div className="mono" style={{ fontSize: "0.8125rem" }}>{f.path}</div>
                    <div className="text-muted text-xs">{f.description}</div>
                  </button>
                ))}
              </div>
              <div>
                {selectedFile && typeof selectedFile.content === "string" ? (
                  <CodeBlock label={selectedFile.path} code={selectedFile.content} maxHeight={420} />
                ) : (
                  <p className="text-muted text-sm">Select a file to preview.</p>
                )}
              </div>
            </div>
          </div>

          {!loggedIn && (
            <Callout tone="success" title={`Sign up to unlock ${PRO_PROGRAM_COUNT} more programs`}>
              <p className="mb-3">
                This ran the {FREE_PROGRAM_COUNT} free programs. Create a free account to run all{" "}
                {FREE_PROGRAM_COUNT + PRO_PROGRAM_COUNT} and keep this as a saved project.
              </p>
              <button type="button" className="btn btn-primary" onClick={onRequireLogin}>Sign up free</button>
            </Callout>
          )}
        </div>
      )}

      <ProbeIntentDemo />
    </div>
  );
}
