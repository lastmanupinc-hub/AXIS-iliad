import { useEffect, useState } from "react";
import { getFleetReport, ApiError, apiErrorDetails, type FleetReportResponse } from "../api.ts";
import { SectionHeader, Callout, Skeleton } from "../components/primitives/index.ts";
import { ArtifactExplorer } from "../components/ArtifactExplorer.tsx";
import type { PageId } from "../routes.tsx";

// ─── FleetPage (R2.6) ───────────────────────────────────────────
// GET /v1/account/fleet had a real handler (fleet-handlers.ts) and an api.ts
// wrapper (getFleetReport) but zero UI anywhere -- a Pro/Growth customer
// paying for tier access had no way to discover or use a feature their
// subscription is supposed to unlock. Route is authOnly (route registry
// gates anonymous access); the tier gate below handles free-tier accounts
// that ARE signed in but haven't upgraded.

interface Props {
  onNavigate: (page: PageId) => void;
}

type LoadState =
  | { status: "loading" }
  | { status: "tier-blocked" }
  | { status: "error"; message: string; details: string | null }
  | { status: "loaded"; report: FleetReportResponse };

export function FleetPage({ onNavigate }: Props) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const report = await getFleetReport();
        if (!cancelled) setState({ status: "loaded", report });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 403 || err.errorCode === "TIER_REQUIRED")) {
          setState({ status: "tier-blocked" });
        } else {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : "Failed to load your fleet report",
            details: apiErrorDetails(err),
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      <SectionHeader
        title="Fleet"
        sub="Cross-project intelligence across your whole portfolio — shared stack, org-wide warnings, and per-project stats in one report."
        level="h1"
      />

      {state.status === "loading" && (
        <div role="status" aria-busy="true">
          <Skeleton lines={6} height={60} />
        </div>
      )}

      {state.status === "error" && (
        <Callout tone="danger" title="Couldn't load your fleet report" details={state.details}>{state.message}</Callout>
      )}

      {state.status === "tier-blocked" && (
        <div className="card" style={{ borderColor: "var(--accent)" }}>
          <div className="flex-between">
            <div>
              <h2 style={{ color: "var(--accent)", fontSize: "1rem", fontWeight: 600, marginBottom: 4 }}>
                Fleet requires a paid plan
              </h2>
              <p className="text-muted text-sm mt-1">
                Fleet computes cross-project reports over your whole portfolio — shared stack detection,
                org-wide warnings, and per-project stats side by side. Available on Starter, Pro, and Growth.
              </p>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => onNavigate("usage")}>
              View plans
            </button>
          </div>
        </div>
      )}

      {state.status === "loaded" && !state.report.ready && (
        <Callout tone="info" title="Not enough analyzed projects yet">
          {state.report.reason}
          <div className="mt-2 text-sm text-muted">
            {state.report.eligible_projects} of {state.report.project_count} project
            {state.report.project_count === 1 ? "" : "s"} ready today.
          </div>
        </Callout>
      )}

      {state.status === "loaded" && state.report.ready && (
        <>
          <div className="grid grid-2 mb-4">
            <div className="card">
              <div className="stat-label">Projects in this account</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 600 }}>{state.report.project_count}</div>
            </div>
            <div className="card">
              <div className="stat-label">Projects in this report</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 600 }}>{state.report.eligible_projects}</div>
            </div>
          </div>
          <ArtifactExplorer files={state.report.files} />
        </>
      )}
    </div>
  );
}
