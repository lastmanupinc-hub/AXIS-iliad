import { useEffect, useMemo, useState } from "react";
import { getMyAnalyticsSummary, ApiError, type MyAnalyticsSummary } from "../api.ts";
import { Callout, Skeleton } from "../components/primitives/index.ts";

interface StrategyItem {
  title: string;
  detail: string;
  kind: "pivot" | "improve" | "monitor";
}

function buildStrategies(summary: MyAnalyticsSummary | null): StrategyItem[] {
  if (!summary) return [];

  const apiTotal = summary.api_calls.total_calls;
  const runs = summary.totals.runs;
  const generators = summary.totals.generators;
  const status4xx = summary.api_calls.by_status.find((s) => s.status_bucket === "4xx")?.calls ?? 0;
  const status5xx = summary.api_calls.by_status.find((s) => s.status_bucket === "5xx")?.calls ?? 0;
  const failureRate = apiTotal > 0 ? (status4xx + status5xx) / apiTotal : 0;

  const topProgram = [...summary.programs].sort((a, b) => b.total_runs - a.total_runs)[0];
  const topProgramShare = topProgram && runs > 0 ? topProgram.total_runs / runs : 0;

  const actions: StrategyItem[] = [];

  if (generators === 0 && apiTotal >= 10) {
    actions.push({
      kind: "pivot",
      title: "Pivot: generators are underused",
      detail:
        "Your calls show activity, but no generator output. Shift effort into generator-heavy flows (theme, seo, optimization, artifacts) and define one clear output goal per run.",
    });
  }

  if (summary.api_calls.calls_last_7d >= 120 || generators >= 150) {
    actions.push({
      kind: "improve",
      title: "Improve: heavy usage detected",
      detail:
        "You are using the platform heavily. Improve task quality by tightening prompts, adding reusable templates, and introducing quality checks so each call yields higher-value artifacts.",
    });
  }

  if (topProgram && topProgramShare >= 0.75 && runs >= 20) {
    actions.push({
      kind: "pivot",
      title: "Pivot: usage is concentrated",
      detail: `Most activity is in ${topProgram.program}. Add 1-2 adjacent programs to unlock complementary outputs and reduce single-program dependency.`,
    });
  }

  if (failureRate >= 0.1) {
    actions.push({
      kind: "improve",
      title: "Improve: error pressure is high",
      detail:
        "4xx/5xx traffic is elevated. Focus next sprint on request validation, retries/backoff, and clearer payload contracts before scaling call volume.",
    });
  }

  if (actions.length === 0) {
    actions.push({
      kind: "monitor",
      title: "Stable usage pattern",
      detail:
        "Usage looks healthy. Keep monitoring weekly, and prioritize the top two endpoints by call count for incremental quality improvements.",
    });
  }

  return actions;
}

export function MyAnalyticsPage() {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<MyAnalyticsSummary | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await getMyAnalyticsSummary(days, 300);
      setSummary(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [days]);

  const strategies = useMemo(() => buildStrategies(summary), [summary]);

  return (
    <div>
      {/* The Window select + Refresh button stay mounted through every load —
          the page used to swap its ENTIRE tree (controls included) for a bare
          spinner on mount, on every window change, and on every Refresh click,
          silently dropping keyboard focus to <body> each time. */}
      <div className="card">
        <div className="flex-between">
          <div>
            <h2>MyAnalytics</h2>
            <p>Track all programs used, all API calls, and strategy recommendations from call behavior.</p>
          </div>
          <div className="flex">
            <label htmlFor="analytics-days">Window</label>
            <select id="analytics-days" value={days} disabled={loading} onChange={(e) => setDays(parseInt(e.target.value, 10))}>
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
            <button className="btn" disabled={loading} onClick={() => void load()}>{loading ? "Refreshing…" : "Refresh"}</button>
          </div>
        </div>
        {error && <Callout tone="danger">{error}</Callout>}
      </div>

      {loading && (
        <div className="card" role="status" aria-live="polite">
          <Skeleton lines={6} />
        </div>
      )}

      {!loading && summary && (
        <>
          <div className="grid grid-4">
            <div className="card">
              <div className="stat-label">API Calls</div>
              <div className="stat-value">{summary.api_calls.total_calls.toLocaleString()}</div>
            </div>
            <div className="card">
              <div className="stat-label">Calls (7d)</div>
              <div className="stat-value">{summary.api_calls.calls_last_7d.toLocaleString()}</div>
            </div>
            <div className="card">
              <div className="stat-label">Program Runs</div>
              <div className="stat-value">{summary.totals.runs.toLocaleString()}</div>
            </div>
            <div className="card">
              <div className="stat-label">Generators</div>
              <div className="stat-value">{summary.totals.generators.toLocaleString()}</div>
            </div>
          </div>

          <div className="card">
            <h3>Development Strategy From Calls</h3>
            {strategies.map((item) => (
              <div key={item.title} className="card">
                <div className="flex">
                  <span className={`badge ${item.kind === "pivot" ? "badge-yellow" : item.kind === "improve" ? "badge-accent" : "badge-blue"}`}>
                    {item.kind}
                  </span>
                  <strong>{item.title}</strong>
                </div>
                <p>{item.detail}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-2">
            <div className="card">
              <h3>Programs Used</h3>
              <table>
                <thead>
                  <tr>
                    <th>Program</th>
                    <th>Runs</th>
                    <th>Generators</th>
                    <th>Input Files</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.programs.length === 0 && (
                    <tr>
                      <td colSpan={4}>No program usage in this window.</td>
                    </tr>
                  )}
                  {[...summary.programs].sort((a, b) => b.total_runs - a.total_runs).map((row) => (
                    <tr key={row.program}>
                      <td>{row.program}</td>
                      <td>{row.total_runs}</td>
                      <td>{row.total_generators}</td>
                      <td>{row.total_input_files}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card">
              <h3>API Status Mix</h3>
              <table>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Calls</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.api_calls.by_status.length === 0 && (
                    <tr>
                      <td colSpan={2}>No API calls in this window.</td>
                    </tr>
                  )}
                  {summary.api_calls.by_status.map((row) => (
                    <tr key={row.status_bucket}>
                      <td>{row.status_bucket}</td>
                      <td>{row.calls}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h3>All API Calls By Endpoint</h3>
            <table>
              <thead>
                <tr>
                  <th>Method</th>
                  <th>Path</th>
                  <th>Calls</th>
                  <th>Last Called</th>
                </tr>
              </thead>
              <tbody>
                {summary.api_calls.by_endpoint.length === 0 && (
                  <tr>
                    <td colSpan={4}>No API calls in this window.</td>
                  </tr>
                )}
                {summary.api_calls.by_endpoint.map((ep) => (
                  <tr key={`${ep.method}:${ep.path}`}>
                    <td>{ep.method}</td>
                    <td className="mono">{ep.path}</td>
                    <td>{ep.calls}</td>
                    <td>{new Date(ep.last_called_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
