import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  SnapshotResponse,
  ProjectSummary,
  ProgramCatalogEntry,
  GeneratedFile,
  MppPricing,
  SearchResult,
} from "../api.ts";
import {
  listProjects,
  getPrograms,
  runProgram,
  indexSnapshot,
  searchQuery,
  mppPricing,
  mppPricePerCall,
  apiErrorDetails,
  ApiError,
} from "../api.ts";
import { PROGRAMS as PROGRAM_DEFS } from "../components/ProgramLauncher.tsx";
import { UpsellModal } from "../components/UpsellModal.tsx";
import { useToast } from "../components/Toast.tsx";
import { SectionHeader, Callout, EmptyState, Skeleton, formatUsdCents } from "../components/primitives/index.ts";
import { titleCaseProgram } from "../upload-utils.ts";
// Single-source counts (WO-F5) — never inline these numbers.
import { FREE_PROGRAM_NAMES, PROGRAM_COUNT } from "../config.ts";
import type { PageId, RouteParams } from "../routes.tsx";
import type { SignUpTrigger } from "../components/SignUpModal.tsx";

// ─── RunnerPage (WO-P7) ───────────────────────────────────────────────────
// Program picker -> target-project picker -> options (lite mode, per-output
// selection) -> run -> honest staged status -> results panel with a
// jump-link into the Artifact Explorer. `ProgramLauncher` (embedded in
// ProjectPage's Programs tab) stays the one-click quick-launch surface for
// whatever project is already open; this page is the standalone console
// with the full picker + options, reachable at "#run" or "#run/:program"
// (ProgramLauncher's "Advanced options" links deep-link here with a program
// preselected).
//
// H2 (no fake streaming): every program endpoint is a single synchronous
// HTTP call — there is no server-sent progress to relay. The staged status
// below ("request sent" -> "server processing" -> done) narrates the two
// real, true phases of that one call; it is not a simulated percentage.
//
// Honesty on the options panel: the ONLY body field every program handler
// documents beyond snapshot_id is `outputs` (ProgramRequest in openapi.ts) —
// a subset of that program's own output list. `search/export` is the one
// program handler that does not read it (handlers.ts's handleSearchExport
// just re-serves the snapshot's cached search files), so the picker is
// hidden for that program rather than rendering a control that would
// silently do nothing. Anonymous callers hitting a paid program get a 401
// from every makeProgramHandler-backed endpoint (never a priced 402), so —
// like AnalyzePage's pro-output pre-check — that case is blocked client-side
// before any network round trip rather than showing a fabricated price.

interface Props {
  /** From the "#run/:program?" route param — preselects a program once the
   *  live catalog confirms it's real. */
  initialProgram?: string;
  loggedIn: boolean;
  /** The app's "currently open" project, if any — used only to preselect
   *  the target-project picker's default. */
  currentProjectId: string | null;
  /** The signed-out guest project (if one is loaded) — anonymous visitors
   *  have no `GET /v1/projects` to pick from, so this is their only
   *  possible target. */
  anonResult: SnapshotResponse | null;
  onNavigate: (page: PageId, params?: RouteParams) => void;
  onRequireLogin: (trigger?: SignUpTrigger) => void;
}

interface RunTarget {
  project_id: string;
  name: string;
  snapshot_id: string | null;
}

type RunStage = "idle" | "sending" | "processing" | "done" | "error";

interface RunResultState {
  program: string;
  files: GeneratedFile[];
  skipped: Array<{ path: string; reason: string }>;
  projectId: string;
}

interface TierBlockState {
  blocked: string[];
  allowed: string[];
  /** Both pricing tiers from the 402 payload — null when the block happened
   *  client-side before any request was sent (anonymous pre-check). */
  pricing: MppPricing | null;
  /** The price THIS request would actually be charged, reflecting the
   *  X-Agent-Mode header it sent. */
  pricePerCall: string | null;
  requestedLite: boolean;
}

const FREE_PROGRAM_SET = new Set<string>(FREE_PROGRAM_NAMES);

export function RunnerPage({ initialProgram, loggedIn, currentProjectId, anonResult, onNavigate, onRequireLogin }: Props) {
  const { toast } = useToast();

  // ── 1. Program catalog ──────────────────────────────────────────
  const [catalog, setCatalog] = useState<ProgramCatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<{ message: string; details: string | null } | null>(null);

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

  useEffect(() => { void loadCatalog(); }, [loadCatalog]);

  const [selectedProgram, setSelectedProgram] = useState<string | null>(null);

  // Deep-link preselection: only once the live catalog confirms the program
  // in the URL is real (an unknown/mistyped name is silently ignored, never
  // a crash or a fabricated selection).
  useEffect(() => {
    if (selectedProgram) return;
    if (initialProgram && catalog.some((p) => p.name === initialProgram)) {
      setSelectedProgram(initialProgram);
    }
  }, [initialProgram, catalog, selectedProgram]);

  const programEntry = catalog.find((p) => p.name === selectedProgram) ?? null;
  const programMeta = PROGRAM_DEFS.find((p) => p.name === selectedProgram) ?? null;
  const isFreeProgram = selectedProgram !== null && FREE_PROGRAM_SET.has(selectedProgram);
  // handleSearchExport (handlers.ts) ignores an `outputs` override — the
  // picker below only renders for programs that actually read it.
  const supportsOutputs = selectedProgram !== null && selectedProgram !== "search";

  // ── 2. Target project ────────────────────────────────────────────
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [projectsLoading, setProjectsLoading] = useState(loggedIn);
  const [projectsError, setProjectsError] = useState<{ message: string; details: string | null } | null>(null);

  const loadProjects = useCallback(() => {
    if (!loggedIn) {
      setProjects([]);
      setProjectsLoading(false);
      return Promise.resolve();
    }
    setProjectsLoading(true);
    setProjectsError(null);
    return listProjects({ limit: 50 })
      .then((res) => setProjects(res.projects ?? []))
      .catch((err) =>
        setProjectsError({
          message: err instanceof Error ? err.message : "Failed to load your projects",
          details: apiErrorDetails(err),
        }),
      )
      .finally(() => setProjectsLoading(false));
  }, [loggedIn]);

  useEffect(() => { void loadProjects(); }, [loadProjects]);

  const targets = useMemo<RunTarget[]>(() => {
    if (loggedIn) {
      return (projects ?? []).map((p) => ({
        project_id: p.project_id,
        name: p.name,
        snapshot_id: p.latest_snapshot?.snapshot_id ?? null,
      }));
    }
    if (anonResult) {
      return [{
        project_id: anonResult.project_id,
        name: anonResult.context_map.project_identity.name,
        snapshot_id: anonResult.snapshot_id,
      }];
    }
    return [];
  }, [loggedIn, projects, anonResult]);

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Default (and re-default, if the current pick vanishes) to the app's
  // currently-open project when it's in the list, else the newest one.
  useEffect(() => {
    if (selectedProjectId && targets.some((t) => t.project_id === selectedProjectId)) return;
    const preferred = targets.find((t) => t.project_id === currentProjectId) ?? targets[0];
    setSelectedProjectId(preferred?.project_id ?? null);
  }, [targets, currentProjectId, selectedProjectId]);

  const target = targets.find((t) => t.project_id === selectedProjectId) ?? null;

  // ── 3. Options ────────────────────────────────────────────────────
  const [liteMode, setLiteMode] = useState(false);
  const [selectedOutputs, setSelectedOutputs] = useState<string[]>([]);

  // Reset the output selection to "everything" whenever the chosen program
  // changes (including once the catalog finishes loading it).
  useEffect(() => {
    setSelectedOutputs(programEntry?.outputs ?? []);
  }, [programEntry]);

  function toggleOutput(value: string) {
    setSelectedOutputs((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  // ── Run ───────────────────────────────────────────────────────────
  const [runStage, setRunStage] = useState<RunStage>("idle");
  const [runError, setRunError] = useState<{ message: string; details: string | null } | null>(null);
  const [runResult, setRunResult] = useState<RunResultState | null>(null);
  const [tierBlock, setTierBlock] = useState<TierBlockState | null>(null);
  const running = runStage === "sending" || runStage === "processing";

  function selectFirstFreeProgram() {
    const firstFree = catalog.find((p) => FREE_PROGRAM_SET.has(p.name));
    setSelectedProgram(firstFree ? firstFree.name : null);
    setTierBlock(null);
    setRunError(null);
  }

  async function handleRun() {
    if (!programMeta || !target?.snapshot_id) return;

    if (!isFreeProgram && !loggedIn) {
      // Client-side pre-check (mirrors AnalyzePage): every pro program
      // handler 401s an anonymous caller before it ever reaches pricing, so
      // there is no live number to show here — block before the round trip
      // rather than guess one.
      setTierBlock({ blocked: [programMeta.name], allowed: [...FREE_PROGRAM_NAMES], pricing: null, pricePerCall: null, requestedLite: liteMode });
      return;
    }

    setRunError(null);
    setRunResult(null);
    setTierBlock(null);
    setRunStage("sending");
    // Honest two-phase status for a single synchronous call: "request sent"
    // flips to "server processing" a beat later so a near-instant response
    // doesn't visibly skip it, without claiming any real progress percentage.
    const stageTimer = setTimeout(() => setRunStage("processing"), 300);

    try {
      const outputs =
        supportsOutputs && programEntry && selectedOutputs.length < programEntry.outputs.length
          ? selectedOutputs
          : undefined;
      const res = await runProgram(programMeta.endpoint, target.snapshot_id, { lite: liteMode, outputs });
      setRunStage("done");
      setRunResult({ program: res.program, files: res.files, skipped: res.skipped ?? [], projectId: target.project_id });
      toast("success", `Generated ${res.files.length} file${res.files.length === 1 ? "" : "s"} from ${res.program}`);
    } catch (err) {
      setRunStage("error");
      if (err instanceof ApiError && (err.errorCode === "TIER_REQUIRED" || err.status === 402)) {
        setTierBlock({
          blocked: (err.extra.blocked_programs as string[] | undefined) ?? [programMeta.name],
          allowed: (err.extra.allowed_programs as string[] | undefined) ?? [...FREE_PROGRAM_NAMES],
          pricing: mppPricing(err),
          pricePerCall: mppPricePerCall(err),
          requestedLite: liteMode,
        });
      } else if (err instanceof ApiError && err.status === 401) {
        setRunError({ message: "Sign in to run paid programs.", details: null });
      } else {
        const message = err instanceof Error ? err.message : "Program run failed";
        setRunError({ message, details: apiErrorDetails(err) });
        toast("error", message);
      }
    } finally {
      clearTimeout(stageTimer);
    }
  }

  function handleRunAnother() {
    setRunResult(null);
    setRunStage("idle");
    setRunError(null);
  }

  const canRun = !!programMeta && !!target?.snapshot_id && (!supportsOutputs || selectedOutputs.length > 0) && !running;

  return (
    <div>
      <SectionHeader
        title="Program Runner"
        sub={`Run any of the ${PROGRAM_COUNT} programs against one of your projects — free programs run for anyone; paid programs need a plan.`}
        level="h1"
      />

      {/* ── 1. Program picker ──────────────────────────────────────── */}
      <div className="card mb-4">
        <h3 className="mb-2">1. Choose a program</h3>
        {catalogLoading ? (
          <div role="status" aria-live="polite">
            <Skeleton lines={4} />
          </div>
        ) : catalogError ? (
          <Callout tone="danger" title="Couldn't load the live program list" details={catalogError.details}>
            {catalogError.message} <button type="button" className="btn" onClick={() => void loadCatalog()}>Retry</button>
          </Callout>
        ) : (
          <div className="artifact-grid">
            {catalog.map((p) => {
              const meta = PROGRAM_DEFS.find((d) => d.name === p.name);
              const free = FREE_PROGRAM_SET.has(p.name);
              const active = selectedProgram === p.name;
              return (
                <button
                  type="button"
                  key={p.name}
                  className={`artifact-card${active ? " active" : ""}`}
                  aria-pressed={active}
                  onClick={() => setSelectedProgram(p.name)}
                >
                  <div className="flex-between mb-1">
                    <strong style={{ fontSize: "0.8125rem" }}>{meta?.label ?? titleCaseProgram(p.name)}</strong>
                    <span className={`badge ${free ? "badge-green" : "badge-accent"}`} style={{ fontSize: "0.625rem" }}>
                      {free ? "Free" : "Pro"}
                    </span>
                  </div>
                  <p className="text-muted text-xs">{meta?.description ?? `${p.outputs.length} output${p.outputs.length === 1 ? "" : "s"}`}</p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 2. Target project ──────────────────────────────────────── */}
      <div className="card mb-4">
        <h3 className="mb-2">2. Choose a project</h3>
        {loggedIn && projectsLoading ? (
          <div role="status" aria-live="polite">
            <Skeleton lines={2} />
          </div>
        ) : projectsError ? (
          <Callout tone="danger" title={projectsError.message} details={projectsError.details}>
            <button type="button" className="btn" onClick={() => void loadProjects()}>Retry</button>
          </Callout>
        ) : targets.length === 0 ? (
          <EmptyState
            icon="scan"
            title="No projects yet"
            message="Analyze a repo to get a project to run programs against."
            cta={{ label: "Analyze a repo", onClick: () => onNavigate("analyze") }}
          />
        ) : (
          <>
            <label htmlFor="runner-project-select">Project</label>
            <select id="runner-project-select" value={selectedProjectId ?? ""} onChange={(e) => setSelectedProjectId(e.target.value)}>
              {targets.map((t) => (
                <option key={t.project_id} value={t.project_id}>
                  {t.name}{t.snapshot_id ? "" : " (no snapshot yet)"}
                </option>
              ))}
            </select>
            {!loggedIn && (
              <p className="text-muted text-xs mt-2">
                Using your current guest project — this only lives in your browser.{" "}
                <button type="button" className="btn" style={{ fontSize: "0.75rem", padding: "2px 8px" }} onClick={() => onRequireLogin("save-project")}>
                  Sign in
                </button>{" "}
                to run programs against saved projects.
              </p>
            )}
          </>
        )}
      </div>

      {/* ── 3. Options ──────────────────────────────────────────────── */}
      {selectedProgram && (
        <div className="card mb-4">
          <h3 className="mb-2">3. Options</h3>
          <label className="flex mb-3" style={{ gap: 8, cursor: "pointer", marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={liteMode}
              onChange={(e) => setLiteMode(e.target.checked)}
              style={{ width: "auto" }}
            />
            <span className="text-sm text-muted">
              Lite mode — if this program requires payment, ask for reduced-price processing (fewer
              artifacts, lower price) instead of the full bundle.
            </span>
          </label>

          {supportsOutputs && programEntry ? (
            <div>
              <div className="flex-between mb-2">
                <label style={{ margin: 0 }}>
                  Outputs <span className="text-muted text-xs">({selectedOutputs.length} of {programEntry.outputs.length})</span>
                </label>
                <div className="flex gap-2">
                  <button type="button" className="badge" style={{ cursor: "pointer" }} onClick={() => setSelectedOutputs(programEntry.outputs)}>Select all</button>
                  <button type="button" className="badge" style={{ cursor: "pointer" }} onClick={() => setSelectedOutputs([])}>Clear</button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {programEntry.outputs.map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={`badge ${selectedOutputs.includes(value) ? "badge-accent" : ""}`}
                    style={{ cursor: "pointer", padding: "3px 9px", fontSize: "0.78rem" }}
                    onClick={() => toggleOutput(value)}
                  >
                    {selectedOutputs.includes(value) ? "✓ " : ""}{value}
                  </button>
                ))}
              </div>
              {selectedOutputs.length === 0 && (
                <p className="text-sm mt-2" style={{ color: "var(--red)" }}>Select at least one output to run.</p>
              )}
            </div>
          ) : selectedProgram === "search" ? (
            <p className="text-muted text-sm">
              Search always regenerates its full output set (context map, project summary, key
              abstractions) — the server doesn't support narrowing it. See the content search index
              below for a narrower, query-driven capability.
            </p>
          ) : (
            <div role="status" aria-live="polite">
              <Skeleton lines={2} />
            </div>
          )}
        </div>
      )}

      {/* WO-P7: the search program's other real capability — a full-text /
          symbol content index, distinct from the "search" output-generating
          program above. */}
      {selectedProgram === "search" && target?.snapshot_id && (
        <SearchIndexPanel snapshotId={target.snapshot_id} />
      )}

      {/* ── 4. Run + honest staged status ──────────────────────────── */}
      {selectedProgram && (
        <div className="card mb-4">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canRun}
            onClick={() => void handleRun()}
            style={{ width: "100%", justifyContent: "center", padding: 12 }}
          >
            {running ? (
              <>
                <span className="spinner" />{" "}
                <span role="status" aria-live="polite">
                  {runStage === "sending"
                    ? "Request sent — waiting for the server…"
                    : "Server processing — this is a synchronous call, may take up to 15s for large projects…"}
                </span>
              </>
            ) : (
              `Run ${programMeta?.label ?? selectedProgram}`
            )}
          </button>
          {!target && <p className="text-muted text-sm mt-2">Pick a project above first.</p>}
          {target && !target.snapshot_id && <p className="text-muted text-sm mt-2">This project has no snapshot yet.</p>}

          {tierBlock ? (
            <div className="mt-4" style={{ textAlign: "center" }}>
              <p style={{ fontWeight: 600, marginBottom: 8 }}>🔒 Pro Programs Required</p>
              <div className="flex gap-2 flex-wrap mb-3" style={{ justifyContent: "center" }}>
                {tierBlock.blocked.map((p) => <span key={p} className="badge badge-accent">{p}</span>)}
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
              <button type="button" className="btn btn-primary" style={{ marginRight: 8 }} onClick={() => onNavigate("plans")}>
                Go Pro — Unlock All {PROGRAM_COUNT} Programs
              </button>
              <button type="button" className="btn" onClick={selectFirstFreeProgram}>
                Use a Free Program Instead
              </button>
            </div>
          ) : runError ? (
            <div className="mt-4">
              <Callout tone="danger" title={runError.message} details={runError.details}>
                <button type="button" className="btn" onClick={() => void handleRun()}>Retry</button>
              </Callout>
            </div>
          ) : null}
        </div>
      )}

      {/* ── Results panel ───────────────────────────────────────────── */}
      {runResult && (
        <div className="card">
          <div className="flex-between flex-wrap gap-2 mb-3">
            <h3 style={{ margin: 0 }}>
              Generated {runResult.files.length} file{runResult.files.length === 1 ? "" : "s"} from{" "}
              {PROGRAM_DEFS.find((p) => p.name === runResult.program)?.label ?? titleCaseProgram(runResult.program)}
            </h3>
            <button type="button" className="btn btn-primary" onClick={() => onNavigate("project-artifacts", { id: runResult.projectId })}>
              View in Artifact Explorer →
            </button>
          </div>
          {runResult.skipped.length > 0 && (
            <p className="text-muted text-sm mb-2">{runResult.skipped.length} output{runResult.skipped.length === 1 ? "" : "s"} skipped.</p>
          )}
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {runResult.files.map((f) => (
              <li key={f.path} className="mono text-sm" style={{ padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                {f.path} <span className="text-muted">— {f.description}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="btn mt-3" onClick={handleRunAnother}>Run another program</button>
        </div>
      )}

      {tierBlock && (
        <UpsellModal
          blocked={tierBlock.blocked}
          allowed={tierBlock.allowed}
          pricing={tierBlock.pricing ? { standardCents: tierBlock.pricing.standard.amount_cents, liteCents: tierBlock.pricing.lite.amount_cents } : undefined}
          mode={tierBlock.requestedLite ? "lite" : "standard"}
          onGoFree={selectFirstFreeProgram}
          onClose={() => setTierBlock(null)}
        />
      )}
    </div>
  );
}

// ─── Content search index (WO-P7: /v1/search/index + /v1/search/query) ────
// The "search" program's other real capability — build a searchable index
// over the snapshot's file contents, then query it. Distinct from the
// "search" program above (which regenerates context-map.json/project
// summary/key abstractions); this hits the same endpoints the project's own
// Search tab (SearchTab.tsx) uses. Kept intentionally small — a taste, not a
// full workbench — since the Search tab already covers the full text/symbol
// experience for a project once it's open.

function SearchIndexPanel({ snapshotId }: { snapshotId: string }) {
  const [indexing, setIndexing] = useState(false);
  const [stats, setStats] = useState<{ files: number; lines: number; symbols: number } | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  async function handleIndex() {
    setIndexing(true);
    setIndexError(null);
    try {
      const res = await indexSnapshot(snapshotId);
      setStats({ files: res.indexed_files, lines: res.indexed_lines, symbols: res.indexed_symbols });
    } catch (err) {
      setIndexError(err instanceof Error ? err.message : "Indexing failed");
    } finally {
      setIndexing(false);
    }
  }

  async function handleQuery() {
    if (!query.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await searchQuery(snapshotId, query.trim(), 5);
      setResults(res.results);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="card mb-4">
      <h3 className="mb-2">Content search index</h3>
      <p className="text-muted text-sm mb-3">
        Build a full-text / symbol index over this snapshot (<code>POST /v1/search/index</code>), then
        try a query (<code>POST /v1/search/query</code>) — the same index the project's Search tab uses.
      </p>
      <div className="flex gap-2" style={{ alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="btn" disabled={indexing} onClick={() => void handleIndex()}>
          {indexing ? <><span className="spinner" /> Indexing…</> : stats ? "Re-index" : "Build content search index"}
        </button>
        {stats && (
          <span className="badge badge-green">
            {stats.files} files · {stats.lines.toLocaleString()} lines
            {stats.symbols > 0 ? ` · ${stats.symbols.toLocaleString()} symbols` : ""}
          </span>
        )}
      </div>
      {indexError && <div className="mt-2"><Callout tone="danger">{indexError}</Callout></div>}

      {stats && (
        <div className="flex gap-2 mt-3" style={{ alignItems: "center" }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleQuery(); }}
            placeholder="Try a query — search file contents…"
            aria-label="Content search query"
            style={{ flex: 1 }}
          />
          <button type="button" className="btn" disabled={searching || !query.trim()} onClick={() => void handleQuery()}>
            {searching ? "Searching…" : "Search"}
          </button>
        </div>
      )}
      {searchError && <div className="mt-2"><Callout tone="danger">{searchError}</Callout></div>}
      {results && (
        results.length === 0 ? (
          <EmptyState title={`No results for "${query}"`} message="Try a different search term." />
        ) : (
          <div className="mt-2" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {results.map((r, i) => (
              <div key={`${r.file_path}:${r.line_number}:${i}`} className="mono text-sm">
                <span style={{ color: "var(--accent)" }}>{r.file_path}:{r.line_number}</span>{" "}
                <span className="text-muted">{r.content}</span>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
