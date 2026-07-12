import { useState } from "react";
import { analyzeQuick, ApiError, type AnalyzeQuickResponse } from "../api.ts";
import { Callout, CodeBlock, Pill, SectionHeader, StatTile } from "./primitives/index.ts";
import { FREE_PROGRAM_NAMES, PRO_PROGRAM_COUNT } from "../config.ts";

// ─── LiveDemoTeaser (WO-P1) ──────────────────────────────────────────────────
// Embedded "playground teaser" on the landing page (a full standalone
// playground page is the separate WO-P15 bonus work order). One click runs a
// REAL anonymous analysis — free programs only — against a small, stable
// public sample repo via POST /v1/analyze, and renders the actual response.
// No canned data: every number and file below comes straight off the wire.

const SAMPLE_REPO = {
  url: "https://github.com/octocat/Hello-World",
  label: "octocat/Hello-World",
};

type DemoState = "idle" | "loading" | "done" | "error";

interface Props {
  /** Opens the sign-in popup (point-of-value nudge after a real result). */
  onRequireLogin: () => void;
  /** Opens the full standalone Playground (WO-P15) — more sample repos,
   *  a paste-your-own-URL box, and the anon rate-limit meter. */
  onOpenPlayground: () => void;
}

export function LiveDemoTeaser({ onRequireLogin, onOpenPlayground }: Props) {
  const [state, setState] = useState<DemoState>("idle");
  const [result, setResult] = useState<AnalyzeQuickResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setState("loading");
    setError(null);
    try {
      const data = await analyzeQuick({
        github_url: SAMPLE_REPO.url,
        programs: [...FREE_PROGRAM_NAMES],
      });
      setResult(data);
      setState("done");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Live demo failed — try again.");
      setState("error");
    }
  }

  const previewFile = result?.files.find((f) => f.path === "AGENTS.md") ?? result?.files[0] ?? null;

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <SectionHeader
        title="See it work — live"
        sub={`One click runs a real, free-tier analysis of a public repo (${SAMPLE_REPO.label}). No account required.`}
      />

      {state === "idle" && (
        <div className="flex gap-2 flex-wrap">
          <button type="button" className="btn btn-primary" onClick={() => void run()}>
            ▶ Run live demo
          </button>
          <button type="button" className="btn" onClick={onOpenPlayground}>
            Try your own repo in the Playground →
          </button>
        </div>
      )}

      {state === "loading" && (
        <p className="text-muted" role="status" aria-live="polite">
          <span className="spinner" /> Analyzing {SAMPLE_REPO.label}…
        </p>
      )}

      {state === "error" && (
        <Callout tone="danger" title="Live demo failed">
          {error}
          <div className="mt-3">
            <button type="button" className="btn" onClick={() => void run()}>Try again</button>
          </div>
        </Callout>
      )}

      {state === "done" && result && (
        <div className="stack gap-3">
          <div className="flex gap-2 flex-wrap">
            <Pill tone="accent">{result.analysis.project_name}</Pill>
            {result.analysis.language && <Pill>{result.analysis.language}</Pill>}
            {result.analysis.frameworks.slice(0, 3).map((fw) => (
              <Pill key={fw} tone="outline">{fw}</Pill>
            ))}
          </div>

          <div className="grid grid-3">
            <StatTile label="Files scanned" value={result.analysis.file_count} />
            <StatTile label="Free programs run" value={result.programs_run} />
            <StatTile label="Files generated" value={result.total_files} />
          </div>

          {previewFile && typeof previewFile.content === "string" && (
            <CodeBlock label={previewFile.path} code={previewFile.content} maxHeight={220} />
          )}

          <Callout tone="success" title="Sign up to unlock the rest">
            <p className="mb-3">
              This demo only ran the free tier. Create a free account to unlock{" "}
              {PRO_PROGRAM_COUNT} more paid programs and keep every future analysis as a saved project.
            </p>
            <button type="button" className="btn btn-primary" onClick={onRequireLogin}>
              Sign up free
            </button>
          </Callout>
        </div>
      )}
    </div>
  );
}
