import { useState, useEffect, useCallback } from "react";
import { healthCheck, healthLive, healthReady, getStats, type ReadinessResponse, type ApiStats } from "../api.ts";
import { SectionHeader, StatTile, Callout, Skeleton, Pill } from "../components/primitives/index.ts";

// ─── StatusPage (WO-P17) ──────────────────────────────────────────────────
// Public, no login ("#status"). The footer's "Status" link and the
// StatusBar's connection dot both open this page.
//
// Honesty H4: no incident history, no uptime percentage — this app has no
// backend storage for either, so the page never claims either exists.
// Every number here is either a live, timed probe result or a plainly
// labeled client-side ticker — nothing is estimated or invented. (This is
// also why the page does NOT surface GET /performance's mcp_calls fields:
// that endpoint used to report a hardcoded 99.87% success rate and other
// fabricated numbers — fixed alongside this page, see the ledger — but a
// per-subsystem status page has no need for MCP call volume anyway.)

type ProbeState = "checking" | "up" | "down";

interface Probe {
  label: string;
  state: ProbeState;
  latencyMs: number | null;
}

function timeProbe<T>(run: () => Promise<T>): Promise<{ ok: boolean; result: T | null; latencyMs: number }> {
  const started = performance.now();
  return run()
    .then((result) => ({ ok: true, result, latencyMs: Math.round(performance.now() - started) }))
    .catch(() => ({ ok: false, result: null, latencyMs: Math.round(performance.now() - started) }));
}

/** Client-side "time since this page was opened" — explicitly not server
 *  uptime (which isn't exposed to the browser) and never presented as one. */
function useSessionTicker(): string {
  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    const startedAt = Date.now();
    const id = setInterval(() => setElapsedSec(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  const m = Math.floor(elapsedSec / 60);
  const s = elapsedSec % 60;
  return `${m}m ${s}s`;
}

export function StatusPage() {
  const [health, setHealth] = useState<Probe>({ label: "API", state: "checking", latencyMs: null });
  const [live, setLive] = useState<Probe>({ label: "Liveness", state: "checking", latencyMs: null });
  const [ready, setReady] = useState<Probe>({ label: "Readiness", state: "checking", latencyMs: null });
  const [version, setVersion] = useState<string | null>(null);
  const [checks, setChecks] = useState<ReadinessResponse["checks"] | null>(null);
  const [stats, setStats] = useState<ApiStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const sessionElapsed = useSessionTicker();

  const runProbes = useCallback(() => {
    setHealth((p) => ({ ...p, state: "checking" }));
    void timeProbe(healthCheck).then(({ ok, result, latencyMs }) => {
      if (ok && result) setVersion(result.version);
      setHealth({ label: "API", state: ok ? "up" : "down", latencyMs });
    });

    setLive((p) => ({ ...p, state: "checking" }));
    void timeProbe(healthLive).then(({ ok, latencyMs }) => {
      setLive({ label: "Liveness", state: ok ? "up" : "down", latencyMs });
    });

    setReady((p) => ({ ...p, state: "checking" }));
    void timeProbe(healthReady).then(({ result, latencyMs }) => {
      setReady({ label: "Readiness", state: result?.status === "ready" ? "up" : "down", latencyMs });
      setChecks(result?.checks ?? null);
    });

    getStats()
      .then((s) => { setStats(s); setStatsError(null); })
      .catch((err) => setStatsError(err instanceof Error ? err.message : "Failed to load call stats"));
  }, []);

  useEffect(() => {
    runProbes();
    const interval = setInterval(runProbes, 30_000);
    return () => clearInterval(interval);
  }, [runProbes]);

  const probes = [health, live, ready];
  const anyChecking = probes.some((p) => p.state === "checking");
  const allUp = probes.every((p) => p.state === "up");
  const overall = anyChecking ? "checking" : allUp ? "up" : "down";

  return (
    <div>
      <SectionHeader
        title="Status"
        sub="Live system health — every number below is a real, timed probe result, never an estimate."
      />

      <div className="card mb-4">
        <div className="flex-between mb-3" style={{ flexWrap: "wrap", gap: 8 }}>
          <div className="flex gap-2" style={{ alignItems: "center" }}>
            <StatusDot state={overall} />
            <strong>
              {overall === "checking" ? "Checking…" : overall === "up" ? "All systems operational" : "Degraded"}
            </strong>
          </div>
          {version && <Pill mono>v{version}</Pill>}
        </div>
        <div className="grid grid-3">
          {probes.map((p) => <ProbeTile key={p.label} probe={p} />)}
        </div>
      </div>

      {checks && (
        <div className="card mb-4">
          <h3 className="mb-3">Subsystems</h3>
          <div className="stack gap-2">
            <div className="flex-between">
              <span className="text-sm">Database</span>
              <span className="flex gap-2" style={{ alignItems: "center" }}>
                <StatusDot state={checks.database === "ok" ? "up" : "down"} />
                <span className="mono text-xs">{checks.database}</span>
              </span>
            </div>
            <div className="flex-between">
              <span className="text-sm">Payment rail</span>
              <span className="flex gap-2" style={{ alignItems: "center" }}>
                {/* Diagnostic-only, not an ok/error signal — "absent" and
                    "test" are both legitimate configurations depending on
                    environment, not outages. No status dot implied. */}
                <span className="mono text-xs">{checks.payment_rail}</span>
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="card mb-4">
        <h3 className="mb-3">Activity</h3>
        {statsError ? (
          <Callout tone="warning" title="Couldn't load call stats">{statsError}</Callout>
        ) : stats ? (
          <div className="grid grid-2">
            <StatTile label="MCP calls today" value={stats.mcp_calls_today} />
            <StatTile label="MCP calls (all time)" value={stats.mcp_calls_total} />
          </div>
        ) : (
          <Skeleton lines={2} />
        )}
      </div>

      <div className="card">
        <h3 className="mb-2">This session</h3>
        <p className="text-muted text-sm" style={{ margin: 0 }}>
          You've had this page open for <span className="mono">{sessionElapsed}</span>.
        </p>
        <p className="text-muted text-xs mt-2" style={{ margin: "8px 0 0" }}>
          This isn't server uptime, and this app doesn't store incident history or an uptime
          percentage — only the live probe results above are real measurements.
        </p>
      </div>
    </div>
  );
}

function StatusDot({ state }: { state: ProbeState }) {
  const color = state === "up" ? "var(--green)" : state === "down" ? "var(--red)" : "var(--text-muted)";
  return <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />;
}

function ProbeTile({ probe }: { probe: Probe }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div className="flex" style={{ justifyContent: "center", gap: 6, marginBottom: 4 }}>
        <StatusDot state={probe.state} />
        <strong style={{ fontSize: "0.8125rem" }}>{probe.label}</strong>
      </div>
      <div className="text-muted text-xs">
        {probe.state === "checking" ? "Checking…" : probe.latencyMs !== null ? `${probe.latencyMs}ms` : "—"}
      </div>
    </div>
  );
}
