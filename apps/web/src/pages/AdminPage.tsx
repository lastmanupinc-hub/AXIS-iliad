import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ApiError,
  getAdminStats,
  getAdminAccounts,
  getAdminActivity,
  getFunnelMetrics,
  getMcpUsage,
  getRestUsage,
  getAdminRevenue,
  submitAdminKey,
  type AdminStats,
  type AdminAccountsResponse,
  type AdminActivityResponse,
  type FunnelMetrics,
  type McpUsageResponse,
  type RestUsageResponse,
  type AdminRevenue,
} from "../api.ts";
import { Skeleton, Callout, TableWrap } from "../components/primitives/index.ts";

export interface AdminPageProps {
  /** Called after the owner successfully submits the admin key, so App.tsx
   *  can re-run its own privateAccess probe and light up the nav/shortcut
   *  for the rest of the session — this page's own reload is independent. */
  onUnlocked?: () => void;
}

export function AdminPage({ onUnlocked }: AdminPageProps = {}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // True specifically on a 403 from the admin probe — distinct from `error`
  // (network/5xx/etc.) because this state renders a key-entry form instead
  // of a dead-end Callout; see loadAdminData's catch block.
  const [needsKey, setNeedsKey] = useState(false);
  const [adminKeyInput, setAdminKeyInput] = useState("");
  const [submittingKey, setSubmittingKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [accounts, setAccounts] = useState<AdminAccountsResponse | null>(null);
  const [activity, setActivity] = useState<AdminActivityResponse | null>(null);
  const [funnelMetrics, setFunnelMetrics] = useState<FunnelMetrics | null>(null);
  const [mcpUsage, setMcpUsage] = useState<McpUsageResponse | null>(null);
  const [restUsage, setRestUsage] = useState<RestUsageResponse | null>(null);
  const [revenue, setRevenue] = useState<AdminRevenue | null>(null);
  // H-Phase-A cycle 8: loadAdminData is triggered both on mount AND by the
  // Refresh button — same dual-trigger shape MyAnalyticsPage.tsx's load()
  // had (cycle 6) — with no guard against an OLDER in-flight request's
  // response landing after a newer one and silently overwriting it with
  // stale revenue/account/activity numbers.
  const requestIdRef = useRef(0);

  async function loadAdminData() {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const [statsRes, accountsRes, activityRes, funnelRes, mcpUsageRes, restUsageRes, revenueRes] = await Promise.all([
        getAdminStats(),
        getAdminAccounts(25, 0),
        getAdminActivity(25),
        getFunnelMetrics(),
        getMcpUsage(30),
        getRestUsage(30),
        getAdminRevenue(),
      ]);
      if (requestIdRef.current !== requestId) return;
      setStats(statsRes);
      setAccounts(accountsRes);
      setActivity(activityRes);
      setFunnelMetrics(funnelRes.metrics);
      setMcpUsage(mcpUsageRes);
      setRestUsage(restUsageRes);
      setRevenue(revenueRes);
      setNeedsKey(false);
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      if (err instanceof ApiError && err.status === 403) {
        setNeedsKey(true);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to load admin analytics.");
      }
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }

  useEffect(() => {
    void loadAdminData();
  }, []);

  async function handleSubmitAdminKey(e: FormEvent) {
    e.preventDefault();
    setSubmittingKey(true);
    setKeyError(null);
    try {
      await submitAdminKey(adminKeyInput);
      setAdminKeyInput("");
      onUnlocked?.();
      await loadAdminData();
    } catch {
      setKeyError("Invalid admin key.");
    } finally {
      setSubmittingKey(false);
    }
  }

  if (loading) {
    return (
      <div className="empty-state" role="status" aria-live="polite">
        <Skeleton lines={6} height={60} />
      </div>
    );
  }

  if (needsKey) {
    return (
      <div className="card" style={{ maxWidth: 420 }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: 8 }}>Admin Analytics</h1>
        <p className="text-muted text-sm mb-2">
          Enter the owner admin key to unlock this page. It's exchanged once for an HttpOnly
          cookie on the API host — never stored where page JavaScript can read it.
        </p>
        <form onSubmit={(e) => void handleSubmitAdminKey(e)} className="flex gap-2" style={{ flexWrap: "wrap" }}>
          <input
            value={adminKeyInput}
            onChange={(e) => setAdminKeyInput(e.target.value)}
            type="password"
            placeholder="Admin key"
            aria-label="Admin key"
            autoComplete="off"
            style={{ width: 240 }}
            required
          />
          <button type="submit" className="btn btn-primary" disabled={submittingKey || !adminKeyInput}>
            {submittingKey ? "Checking…" : "Unlock"}
          </button>
        </form>
        {keyError && <Callout tone="danger">{keyError}</Callout>}
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <div className="flex-between">
          <div>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: 8 }}>Admin Analytics</h1>
            <p>
              System health, usage trends, account tiers, and recent events.
            </p>
          </div>
          <button className="btn" onClick={() => void loadAdminData()}>Refresh</button>
        </div>
        {error && (
          <Callout tone="danger">{error}</Callout>
        )}
      </div>

      {revenue && (
        <div className="card">
          <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: 12 }}>
            Growth &amp; Revenue{" "}
            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 400 }}>
              (ME-01 readiness source)
            </span>
          </h2>
          <div className="grid grid-3">
            <div>
              <div className="stat-label">Settled revenue (30d)</div>
              <div>${(revenue.revenue.settled_mrr_cents / 100).toLocaleString()}</div>
            </div>
            <div>
              <div className="stat-label">Estimated monthly revenue</div>
              <div>${(revenue.revenue.estimated_mrr_cents / 100).toLocaleString()}</div>
            </div>
            <div>
              <div className="stat-label">Settled revenue (all-time)</div>
              <div>${(revenue.revenue.settled_revenue_cents_all_time / 100).toLocaleString()}</div>
            </div>
            <div>
              <div className="stat-label">Paid accounts</div>
              <div>{(revenue.accounts.paid + revenue.accounts.suite).toLocaleString()}</div>
            </div>
            <div>
              <div className="stat-label">Active subscriptions</div>
              <div>{revenue.revenue.active_subscriptions.toLocaleString()}</div>
            </div>
            <div>
              <div className="stat-label">Metered overage (this month)</div>
              <div>${(revenue.revenue.metered_overage_cents_this_month / 100).toLocaleString()}</div>
            </div>
            <div>
              <div className="stat-label">New accounts (7d / 30d)</div>
              <div>{revenue.accounts.new_7d} / {revenue.accounts.new_30d}</div>
            </div>
            <div>
              <div className="stat-label">Free → paid conversion (tier)</div>
              <div>{(revenue.funnel.conversion_rate * 100).toFixed(1)}%</div>
            </div>
            <div>
              <div className="stat-label">Free → paid conversion (settled payment)</div>
              <div>{(revenue.revenue.payment_conversion_rate * 100).toFixed(1)}%</div>
            </div>
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 8 }}>
            Neither figure is predictable recurring revenue in the traditional SaaS-metric sense —
            PAI'D (the only live checkout rail) is one-time-charge only, so a paying account is not
            billed again next month unless they manually repurchase. "Settled revenue (30d)" and
            "Settled revenue (all-time)" are derived from actual settled payments (metered overage
            collection + card/USDC receipts) — a true $0 until the first dollar settles, then it
            rises on its own
            {revenue.revenue.first_paid_call_at ? ` (first settled: ${new Date(revenue.revenue.first_paid_call_at).toLocaleDateString()})` : ""}.
            "Estimated monthly revenue" is a separate, transparent snapshot — today's paid-tier
            count × each plan's one-time price (starter×$
            {revenue.revenue.mrr_basis_cents.starter / 100} + pro×${revenue.revenue.mrr_basis_cents.pro / 100} + suite×$
            {revenue.revenue.mrr_basis_cents.suite / 100}) — not a forecast of next month's collections. Never
            conflate the two.
          </p>
        </div>
      )}

      {stats && (
        <div className="grid grid-3">
          <div className="card">
            <div className="stat-label">Total Accounts</div>
            <div>{stats.total_accounts.toLocaleString()}</div>
          </div>
          <div className="card">
            <div className="stat-label">Total API Keys</div>
            <div>{stats.total_api_keys.toLocaleString()}</div>
          </div>
          <div className="card">
            <div className="stat-label">Total Snapshots</div>
            <div>{stats.total_snapshots.toLocaleString()}</div>
          </div>
        </div>
      )}

      {funnelMetrics && (
        <div className="grid grid-3">
          <div className="card">
            <div className="stat-label">Activation Rate</div>
            <div>{(funnelMetrics.activation_rate * 100).toFixed(1)}%</div>
          </div>
          <div className="card">
            <div className="stat-label">Conversion Rate</div>
            <div>{(funnelMetrics.conversion_rate * 100).toFixed(1)}%</div>
          </div>
          <div className="card">
            <div className="stat-label">Events (24h / 7d)</div>
            <div>
              {funnelMetrics.events_last_24h.toLocaleString()} / {funnelMetrics.events_last_7d.toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {mcpUsage && (
        <>
          <div className="card">
            <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: 4 }}>MCP Usage (persistent — survives restarts)</h2>
            <p>
              Live tool-call telemetry from the MCP server. Window: last{" "}
              {mcpUsage.summary.window_days} days.
            </p>
          </div>
          <div className="grid grid-3">
            <div className="card">
              <div className="stat-label">Calls (24h / 7d / 30d)</div>
              <div>
                {mcpUsage.windows.last_24h.toLocaleString()} /{" "}
                {mcpUsage.windows.last_7d.toLocaleString()} /{" "}
                {mcpUsage.windows.last_30d.toLocaleString()}
              </div>
            </div>
            <div className="card">
              <div className="stat-label">Unique vs Anonymous</div>
              <div>
                {mcpUsage.summary.unique_accounts.toLocaleString()} /{" "}
                {mcpUsage.summary.anonymous_calls.toLocaleString()}
              </div>
            </div>
            <div className="card">
              <div className="stat-label">New vs Returning</div>
              <div>
                {mcpUsage.new_vs_returning.new_accounts.toLocaleString()} /{" "}
                {mcpUsage.new_vs_returning.returning_accounts.toLocaleString()}
              </div>
            </div>
          </div>
          <div className="grid grid-2">
            <div className="card">
              <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: 4 }}>Calls by Source</h2>
              <TableWrap label="Calls by source">
                <table>
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Calls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(mcpUsage.summary.by_source).length === 0 && (
                      <tr>
                        <td colSpan={2}>No MCP calls in this window.</td>
                      </tr>
                    )}
                    {Object.entries(mcpUsage.summary.by_source).map(([source, count]) => (
                      <tr key={source}>
                        <td>{source}</td>
                        <td>{count.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </div>
            <div className="card">
              <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: 4 }}>Calls by Tool</h2>
              <TableWrap label="Calls by tool">
                <table>
                  <thead>
                    <tr>
                      <th>Tool</th>
                      <th>Calls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(mcpUsage.summary.by_tool).length === 0 && (
                      <tr>
                        <td colSpan={2}>No MCP calls in this window.</td>
                      </tr>
                    )}
                    {Object.entries(mcpUsage.summary.by_tool).map(([tool, count]) => (
                      <tr key={tool}>
                        <td>{tool}</td>
                        <td>{count.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </div>
          </div>
        </>
      )}

      {restUsage && (
        <>
          <div className="card">
            <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: 4 }}>REST Usage</h2>
            <p>
              Program generations and endpoint hits from the REST API (authenticated calls only
              — see below). Window: last {restUsage.window_days} days.
            </p>
          </div>
          <div className="grid grid-2">
            <div className="card">
              <div className="stat-label">Program Runs</div>
              <div>{restUsage.total_runs.toLocaleString()}</div>
            </div>
            <div className="card">
              <div className="stat-label">Unique Accounts</div>
              <div>{restUsage.unique_accounts.toLocaleString()}</div>
            </div>
          </div>
          <div className="grid grid-2">
            <div className="card">
              <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: 4 }}>Runs by Program</h2>
              <TableWrap label="Runs by program">
                <table>
                  <thead>
                    <tr>
                      <th>Program</th>
                      <th>Runs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(restUsage.by_program).length === 0 && (
                      <tr>
                        <td colSpan={2}>No program runs in this window.</td>
                      </tr>
                    )}
                    {Object.entries(restUsage.by_program).map(([program, count]) => (
                      <tr key={program}>
                        <td>{program}</td>
                        <td>{count.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </div>
            <div className="card">
              <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: 4 }}>Calls by Endpoint</h2>
              <p className="text-muted text-sm mb-2">
                Every authenticated REST call, including endpoints with no per-program breakdown
                (fleet, seats, Firecrawl).
              </p>
              <TableWrap label="Calls by endpoint">
                <table>
                  <thead>
                    <tr>
                      <th>Endpoint</th>
                      <th>Calls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(restUsage.by_endpoint).length === 0 && (
                      <tr>
                        <td colSpan={2}>No REST calls in this window.</td>
                      </tr>
                    )}
                    {Object.entries(restUsage.by_endpoint).map(([endpoint, count]) => (
                      <tr key={endpoint}>
                        <td className="mono">{endpoint}</td>
                        <td>{count.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </div>
          </div>
          <div className="card">
            <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: 4 }}>Top Accounts by Program</h2>
            <TableWrap label="Top accounts by program">
              <table>
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Program</th>
                    <th>Runs</th>
                  </tr>
                </thead>
                <tbody>
                  {restUsage.top_accounts_by_program.length === 0 && (
                    <tr>
                      <td colSpan={3}>No program runs in this window.</td>
                    </tr>
                  )}
                  {restUsage.top_accounts_by_program.slice(0, 15).map((row) => (
                    <tr key={`${row.account_id}:${row.program}`}>
                      <td>{row.account_id.slice(0, 8)}...</td>
                      <td>{row.program}</td>
                      <td>{row.runs.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </div>
        </>
      )}

      <div className="grid grid-2">
        <div className="card">
          <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: 4 }}>Accounts by Tier</h2>
          <TableWrap label="Accounts by tier">
            <table>
              <thead>
                <tr>
                  <th>Tier</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(stats?.accounts_by_tier ?? {}).length === 0 && (
                  <tr>
                    <td colSpan={2}>No accounts yet.</td>
                  </tr>
                )}
                {Object.entries(stats?.accounts_by_tier ?? {}).map(([tier, count]) => (
                  <tr key={tier}>
                    <td>{tier}</td>
                    <td>{count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </div>

        <div className="card">
          <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: 4 }}>Funnel by Stage</h2>
          <TableWrap label="Funnel by stage">
            <table>
              <thead>
                <tr>
                  <th>Stage</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(funnelMetrics?.by_stage ?? {}).length === 0 && (
                  <tr>
                    <td colSpan={2}>No funnel events yet.</td>
                  </tr>
                )}
                {Object.entries(funnelMetrics?.by_stage ?? {}).map(([stage, count]) => (
                  <tr key={stage}>
                    <td>{stage}</td>
                    <td>{count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: 4 }}>Recent Accounts</h2>
        <TableWrap label="Recent accounts">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Tier</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {(accounts?.accounts ?? []).length === 0 && (
                <tr>
                  <td colSpan={4}>No accounts yet.</td>
                </tr>
              )}
              {(accounts?.accounts ?? []).slice(0, 10).map((account) => (
                <tr key={account.account_id}>
                  <td>{account.name}</td>
                  <td>{account.email}</td>
                  <td>{account.tier === "paid" && account.paid_plan_id ? `paid (${account.paid_plan_id})` : account.tier}</td>
                  <td>{new Date(account.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </div>

      <div className="card">
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: 4 }}>Recent Activity</h2>
        <TableWrap label="Recent activity">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Stage</th>
                <th>Account</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {(activity?.events ?? []).length === 0 && (
                <tr>
                  <td colSpan={4}>No activity yet.</td>
                </tr>
              )}
              {(activity?.events ?? []).slice(0, 15).map((evt) => (
                <tr key={evt.event_id}>
                  <td>{evt.event_type}</td>
                  <td>{evt.stage}</td>
                  <td>{evt.account_id.slice(0, 8)}...</td>
                  <td>{new Date(evt.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </div>
    </div>
  );
}
