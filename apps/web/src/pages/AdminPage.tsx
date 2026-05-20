import { useEffect, useState } from "react";
import {
  ApiError,
  getAdminStats,
  getAdminAccounts,
  getAdminActivity,
  getFunnelMetrics,
  type AdminStats,
  type AdminAccountsResponse,
  type AdminActivityResponse,
  type FunnelMetrics,
} from "../api.ts";

export function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [accounts, setAccounts] = useState<AdminAccountsResponse | null>(null);
  const [activity, setActivity] = useState<AdminActivityResponse | null>(null);
  const [funnelMetrics, setFunnelMetrics] = useState<FunnelMetrics | null>(null);

  async function loadAdminData() {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, accountsRes, activityRes, funnelRes] = await Promise.all([
        getAdminStats(),
        getAdminAccounts(25, 0),
        getAdminActivity(25),
        getFunnelMetrics(),
      ]);
      setStats(statsRes);
      setAccounts(accountsRes);
      setActivity(activityRes);
      setFunnelMetrics(funnelRes.metrics);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError("Admin access required. Use an admin API key.");
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to load admin analytics.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAdminData();
  }, []);

  if (loading) {
    return (
      <div className="empty-state">
        <span className="spinner" /> Loading admin analytics...
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <div className="flex-between">
          <div>
            <h2>Admin Analytics</h2>
            <p>
              System health, usage trends, account tiers, and recent events.
            </p>
          </div>
          <button className="btn" onClick={() => void loadAdminData()}>Refresh</button>
        </div>
        {error && (
          <div>{error}</div>
        )}
      </div>

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

      <div className="grid grid-2">
        <div className="card">
          <h3>Accounts by Tier</h3>
          <table>
            <thead>
              <tr>
                <th>Tier</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(stats?.accounts_by_tier ?? {}).map(([tier, count]) => (
                <tr key={tier}>
                  <td>{tier}</td>
                  <td>{count.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Funnel by Stage</h3>
          <table>
            <thead>
              <tr>
                <th>Stage</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(funnelMetrics?.by_stage ?? {}).map(([stage, count]) => (
                <tr key={stage}>
                  <td>{stage}</td>
                  <td>{count.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Recent Accounts</h3>
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
            {(accounts?.accounts ?? []).slice(0, 10).map((account) => (
              <tr key={account.account_id}>
                <td>{account.name}</td>
                <td>{account.email}</td>
                <td>{account.tier}</td>
                <td>{new Date(account.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Recent Activity</h3>
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
      </div>
    </div>
  );
}
