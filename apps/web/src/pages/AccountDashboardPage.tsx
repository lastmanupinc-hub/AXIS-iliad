import { useCallback, useEffect, useRef, useState } from "react";
import {
  listProjects,
  getQuota,
  getUsageTimeseries,
  getUpgradePrompt,
  dismissUpgradePrompt,
  complianceGradeLetter,
  apiErrorDetails,
  type ProjectSummary,
  type QuotaResponse,
  type UsageBucket,
  type UpgradePrompt,
} from "../api.ts";
import { StatTile, SectionHeader, Callout, EmptyState, Skeleton, Sparkline, Pill } from "../components/primitives/index.ts";
import type { PageId, RouteParams } from "../routes.tsx";
// Single-source counts (WO-F5) — never inline these numbers.
import { PROGRAM_COUNT } from "../config.ts";
import { statusBadgeClass, gradeBadgeClass } from "../badge-utils.ts";

// ─── AccountDashboardPage (WO-P3) ────────────────────────────────────────────
// Account-level overview: recent-projects cards, usage stat tiles + quota bar
// + 14-day sparkline, quick actions, and the zero-project onboarding state.
// Lives at the real "#dashboard" hash (WO-P5 completed the handoff — see the
// "dashboard" route's comment in routes.tsx). Distinct from the per-project
// view, which is ID-addressable at "#projects/:id" (ProjectPage.tsx).

interface Props {
  onOpenProject: (projectId: string) => void;
  onNavigate: (page: PageId, params?: RouteParams) => void;
}

const TIMESERIES_DAYS = 14;
const RECENT_PROJECTS_LIMIT = 20;

function urgencyTone(urgency: UpgradePrompt["urgency"]): "info" | "warning" {
  return urgency === "low" ? "info" : "warning";
}

interface DashboardData {
  projects: ProjectSummary[];
  total: number;
  quota: QuotaResponse;
  buckets: UsageBucket[];
  upgradePrompt: UpgradePrompt | null;
}

export function AccountDashboardPage({ onOpenProject, onNavigate }: Props) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; details: string | null } | null>(null);
  const [promptDismissed, setPromptDismissed] = useState(false);

  // H-Phase-A cycle 10: load() is triggered from the mount effect AND two
  // independent Retry buttons below, neither disabled while loading — with
  // no guard, an older in-flight load's response landing after a newer
  // one would silently win the race, same shape as MyAnalyticsPage.tsx/
  // AdminPage.tsx's own fixed dual-trigger loads.
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const [projectsRes, quota, timeseries, upgrade] = await Promise.all([
        listProjects({ limit: RECENT_PROJECTS_LIMIT }),
        getQuota(),
        getUsageTimeseries({ sinceDays: TIMESERIES_DAYS }),
        getUpgradePrompt().catch(() => ({ prompt: null })), // non-critical — page works without it
      ]);
      if (requestId !== requestIdRef.current) return;
      setData({
        projects: projectsRes.projects ?? [],
        total: projectsRes.total ?? 0,
        quota,
        buckets: timeseries.buckets ?? [],
        upgradePrompt: upgrade.prompt ?? null,
      });
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError({
        message: err instanceof Error ? err.message : "Failed to load your dashboard",
        details: apiErrorDetails(err),
      });
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDismissPrompt = useCallback(() => {
    setPromptDismissed(true);
    void dismissUpgradePrompt().catch(() => { /* best-effort — the local dismiss already stuck */ });
  }, []);

  if (loading && !data) {
    return (
      <div>
        <SectionHeader title="Dashboard" sub="Your projects, usage, and quick actions." level="h1" />
        <div className="grid grid-4 mb-4" role="status" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div className="card" key={i}><Skeleton lines={3} /></div>
          ))}
        </div>
        <div className="card" role="status" aria-busy="true"><Skeleton lines={5} /></div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div>
        <SectionHeader title="Dashboard" sub="Your projects, usage, and quick actions." level="h1" />
        <Callout tone="danger" title={error.message} details={error.details}>
          <button type="button" className="btn" onClick={() => void load()}>Retry</button>
        </Callout>
      </div>
    );
  }

  if (!data) return null;

  const { projects, total, quota, buckets, upgradePrompt } = data;
  const rq = quota.resource_quota;
  const runsInWindow = buckets.reduce((s, b) => s + b.runs, 0);
  const creditsInWindow = buckets.reduce((s, b) => s + b.credits_spent, 0);

  return (
    <div>
      <SectionHeader title="Dashboard" sub="Your projects, usage, and quick actions." level="h1" />

      {upgradePrompt && !promptDismissed && (
        <div className="mb-4">
          <Callout tone={urgencyTone(upgradePrompt.urgency)} title={upgradePrompt.headline}>
            <p className="mb-2">{upgradePrompt.body}</p>
            <div className="flex gap-2">
              {/* cta_url is a bare marketing pathname (e.g. "/upgrade?plan=pro") that
                  has no matching in-app route today — Plans (#plans) is the one real,
                  working self-serve upgrade destination, so the CTA always lands
                  there regardless of the server-suggested path. */}
              <button type="button" className="btn btn-primary" onClick={() => onNavigate("plans")}>
                {upgradePrompt.cta_label}
              </button>
              <button type="button" className="btn" onClick={handleDismissPrompt}>Dismiss</button>
            </div>
          </Callout>
        </div>
      )}

      {error && (
        <div className="mb-4">
          <Callout tone="warning" title="Some data may be stale" details={error.details}>
            {error.message} <button type="button" className="btn" onClick={() => void load()}>Retry</button>
          </Callout>
        </div>
      )}

      {total === 0 ? (
        <div className="card">
          <EmptyState
            icon="scan"
            title="No projects yet"
            message="Analyze your first repository to see it here — recent projects, usage, and quick actions all live on this page once you have at least one."
            cta={{ label: "Analyze a repo", onClick: () => onNavigate("analyze") }}
          />
        </div>
      ) : (
        <>
          <div className="grid grid-4 mb-4">
            <StatTile label="Projects" value={total} />
            <StatTile
              label="Snapshots this month"
              value={rq ? rq.snapshots_this_month : 0}
              hint={rq ? (rq.max_snapshots_per_month === -1 ? "unlimited plan" : `of ${rq.max_snapshots_per_month}`) : undefined}
              trend={
                rq && rq.max_snapshots_per_month !== -1 ? (
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${Math.min(100, (rq.snapshots_this_month / Math.max(1, rq.max_snapshots_per_month)) * 100)}%`,
                        background: "var(--accent)",
                      }}
                    />
                  </div>
                ) : undefined
              }
            />
            <StatTile
              label={`Runs (${TIMESERIES_DAYS}d)`}
              value={runsInWindow}
              trend={
                <Sparkline
                  data={buckets.map((b) => b.runs)}
                  pointLabels={buckets.map((b) => b.date)}
                  label={`Runs per day, last ${TIMESERIES_DAYS} days`}
                  width={120}
                  height={28}
                />
              }
            />
            <StatTile label={`Credits spent (${TIMESERIES_DAYS}d)`} value={creditsInWindow} />
          </div>

          <SectionHeader title="Recent projects" align="start" />
          <div className="grid grid-3 mb-4">
            {projects.map((p) => {
              const grade = complianceGradeLetter(p.latest_snapshot?.compliance_grade);
              return (
                <button
                  key={p.project_id}
                  type="button"
                  className="card"
                  style={{ textAlign: "left", width: "100%", cursor: "pointer" }}
                  onClick={() => onOpenProject(p.project_id)}
                >
                  <div className="flex-between mb-2">
                    <strong style={{ wordBreak: "break-word" }}>{p.name}</strong>
                    {p.latest_snapshot && <span className={statusBadgeClass(p.latest_snapshot.status)}>{p.latest_snapshot.status}</span>}
                  </div>
                  {p.github_url && (
                    <p className="text-muted text-xs mb-2" style={{ wordBreak: "break-all" }}>{p.github_url}</p>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    {grade && <span className={gradeBadgeClass(grade)}>Grade {grade}</span>}
                    <Pill>{p.snapshot_count} snapshot{p.snapshot_count === 1 ? "" : "s"}</Pill>
                  </div>
                  {p.latest_snapshot && (
                    <p className="text-muted text-xs mt-2">
                      Last analyzed {new Date(p.latest_snapshot.created_at).toLocaleDateString()}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
          {total > projects.length && (
            <p className="text-muted text-sm mb-4">Showing {projects.length} of {total} projects.</p>
          )}
        </>
      )}

      <SectionHeader title="Quick actions" align="start" />
      <div className="grid grid-4">
        <button type="button" className="card" style={{ textAlign: "left", width: "100%", cursor: "pointer" }} onClick={() => onNavigate("analyze")}>
          <strong>Analyze new repo</strong>
          <p className="text-muted text-sm mt-1">Run a fresh analysis on any GitHub repo or upload.</p>
        </button>
        <button type="button" className="card" style={{ textAlign: "left", width: "100%", cursor: "pointer" }} onClick={() => onNavigate("runner")}>
          <strong>Run a program</strong>
          <p className="text-muted text-sm mt-1">Pick a project and launch any of the {PROGRAM_COUNT} programs.</p>
        </button>
        <button type="button" className="card" style={{ textAlign: "left", width: "100%", cursor: "pointer" }} onClick={() => onNavigate("mcp")}>
          <strong>Open MCP config</strong>
          <p className="text-muted text-sm mt-1">Copy a working config for Claude, Cursor, or VS Code.</p>
        </button>
        <button type="button" className="card" style={{ textAlign: "left", width: "100%", cursor: "pointer" }} onClick={() => onNavigate("settings")}>
          <strong>Invite teammate</strong>
          <p className="text-muted text-sm mt-1">Add a seat on your team (Paid/Suite plans).</p>
        </button>
      </div>
    </div>
  );
}
