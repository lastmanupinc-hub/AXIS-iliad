import { useState, useEffect, useCallback } from "react";
import { getChangelog, apiErrorDetails, ApiError } from "../api.ts";
import { SectionHeader, Callout, EmptyState, Skeleton, MarkdownLite, Pill } from "../components/primitives/index.ts";
import { APP_VERSION } from "../version.ts";

// ─── ChangelogPage (WO-P16) ───────────────────────────────────────────────
// Public, no login ("#changelog"). Renders the repo's own CHANGELOG.md
// (GET /v1/changelog, WO-A4) live, split into one card per "## [version]"
// section. The footer's version badge links here (see PageFooter.tsx).
//
// Honesty note: CHANGELOG.md is a hand-maintained file, not generated from
// git history, so it can lag behind the deployed version — checked against
// this repo's own file, its most recent logged entry (0.5.0) is several
// point releases behind APP_VERSION (0.5.3) as of this unit. Rather than
// silently badge the newest LOGGED entry "Current" (which would overstate
// how up to date the log is), the page compares against the real deployed
// version and discloses the gap when they don't match.

interface ChangelogSection {
  version: string;
  date: string | null;
  body: string;
}

/** Splits raw "## [x.y.z] - date" markdown into per-version sections. Only
 *  the "##" heading level is treated as a split point — "###" subsections
 *  (Added/Fixed/Changed) stay inside the section body for MarkdownLite to
 *  render as nested headings. */
function parseChangelog(raw: string): ChangelogSection[] {
  const lines = raw.split("\n");
  const sections: ChangelogSection[] = [];
  let current: { version: string; date: string | null } | null = null;
  let bodyLines: string[] = [];

  const flush = () => {
    if (current) sections.push({ ...current, body: bodyLines.join("\n").trim() });
  };

  for (const line of lines) {
    const m = line.match(/^##\s+\[?([^\]\s]+)\]?\s*(?:-\s*(.+))?\s*$/);
    if (m) {
      flush();
      current = { version: m[1], date: m[2]?.trim() ?? null };
      bodyLines = [];
    } else if (current) {
      bodyLines.push(line);
    }
  }
  flush();
  return sections;
}

interface AsyncError {
  message: string;
  details: string | null;
}

export function ChangelogPage() {
  const [raw, setRaw] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AsyncError | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getChangelog()
      .then(setRaw)
      .catch((err) => setError({ message: err instanceof ApiError ? err.message : "Failed to load the changelog", details: apiErrorDetails(err) }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <SectionHeader title="Changelog" sub="What's shipped, straight from the repo's CHANGELOG.md." level="h1" />

      {loading && (
        <div className="card" role="status" aria-live="polite">
          <Skeleton lines={10} />
        </div>
      )}

      {!loading && (error || raw === null) && (
        <div className="card">
          <Callout tone="danger" title="Couldn't load the changelog" details={error?.details ?? null}>
            {error?.message ?? "Unknown error"} <button type="button" className="btn" onClick={load}>Retry</button>
          </Callout>
        </div>
      )}

      {!loading && raw !== null && <ChangelogBody raw={raw} />}
    </div>
  );
}

function ChangelogBody({ raw }: { raw: string }) {
  const sections = parseChangelog(raw);
  const latestLogged = sections[0]?.version ?? null;
  const upToDate = latestLogged === APP_VERSION;

  if (sections.length === 0) {
    return (
      <div className="card">
        <EmptyState title="No changelog entries yet" message="The changelog file has no version entries yet." />
      </div>
    );
  }

  return (
    <div className="stagger">
      {!upToDate && (
        <Callout tone="info" title={`Currently running v${APP_VERSION}`}>
          The entries below are logged through v{latestLogged}. Some more recent changes may not be written up here yet.
        </Callout>
      )}

      {sections.map((s, i) => (
        <div key={`${s.version}-${i}`} className="card">
          <div className="flex-between mb-2" style={{ flexWrap: "wrap", gap: 8 }}>
            <div className="flex gap-2" style={{ alignItems: "baseline" }}>
              <h3 style={{ margin: 0 }}>{s.version}</h3>
              {s.version === APP_VERSION && <Pill tone="accent">Current</Pill>}
            </div>
            {s.date && <span className="text-muted text-sm">{s.date}</span>}
          </div>
          <MarkdownLite text={s.body} />
        </div>
      ))}
    </div>
  );
}
