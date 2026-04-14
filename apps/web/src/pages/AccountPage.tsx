import { useState, useEffect, useCallback, useRef, type FormEvent } from "react";
import {
  createAccount,
  getAccount,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  getUsage,
  getCredits,
  createCheckout,
  getSubscription,
  cancelSubscription,
  listSeats,
  inviteSeat,
  revokeSeat,
  type Account,
  type ApiKeyInfo,
  type UsageSummary,
  type BillingTier,
  type Seat,
  type SubscriptionInfo,
  type CreditsInfo,
} from "../api.ts";

export function AccountPage({ onAuthChange }: { onAuthChange?: () => void }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [usage, setUsage] = useState<{ tier: BillingTier; monthly_snapshots: number; project_count: number; by_program: UsageSummary[] } | null>(null);
  const [seats, setSeats] = useState<{ seats: Seat[]; count: number; limit: number; remaining: number } | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [credits, setCredits] = useState<CreditsInfo | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Registration form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [pasteKey, setPasteKey] = useState("");

  const isLoggedIn = !!localStorage.getItem("axis_api_key");

  // Handle OAuth redirect (key in URL params)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthKey = params.get("key");
    const oauthLogin = params.get("login");
    const oauthError = params.get("error");
    if (oauthError) {
      setError(`GitHub login failed: ${oauthError}`);
      window.history.replaceState({}, "", window.location.pathname);
    } else if (oauthKey && oauthLogin === "github") {
      localStorage.setItem("axis_api_key", oauthKey);
      window.history.replaceState({}, "", window.location.pathname);
      onAuthChange?.();
      window.location.reload();
    }
  }, [onAuthChange]);

  const loadAccount = useCallback(async () => {
    if (!isLoggedIn) {
      setLoading(false);
      return;
    }
    try {
      const [acct, keysData, usageData, seatsData, subData, creditsData] = await Promise.all([
        getAccount(),
        listApiKeys(),
        getUsage(),
        listSeats(),
        getSubscription().catch(() => null),
        getCredits().catch(() => null),
      ]);
      setAccount(acct);
      setKeys(keysData.keys);
      setUsage(usageData);
      setSeats(seatsData);
      setSubscription(subData);
      setCredits(creditsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load account");
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    loadAccount();
  }, [loadAccount]);

  async function handleSignUp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const result = await createAccount(name.trim(), email.trim());
      localStorage.setItem("axis_api_key", result.api_key.raw_key);
      setRevealedKey(result.api_key.raw_key);
      setAccount(result.account);
      onAuthChange?.();
      setLoading(true);
      await loadAccount();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    }
  }

  async function handleCreateKey(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const result = await createApiKey(newKeyLabel.trim() || "default");
      setRevealedKey(result.raw_key);
      setNewKeyLabel("");
      const keysData = await listApiKeys();
      setKeys(keysData.keys);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create key");
    }
  }

  async function handleRevoke(keyId: string) {
    try {
      await revokeApiKey(keyId);
      const keysData = await listApiKeys();
      setKeys(keysData.keys);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke key");
    }
  }

  function handleLogout() {
    localStorage.removeItem("axis_api_key");
    setAccount(null);
    setKeys([]);
    setUsage(null);
    setRevealedKey(null);
    setCredits(null);
    setLoading(false);
    onAuthChange?.();
  }

  async function handleUpgrade(tier: BillingTier) {
    setError(null);
    try {
      const result = await createCheckout(tier);
      window.location.href = result.checkout_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
    }
  }

  async function handleCancelSubscription() {
    setError(null);
    try {
      await cancelSubscription();
      await loadAccount();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancellation failed");
    }
  }

  if (loading) {
    return (
      <div className="empty-state">
        <span className="spinner" /> Loading account...
      </div>
    );
  }

  // Not logged in — show registration form
  if (!isLoggedIn && !account) {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <div className="card">
          <h2 style={{ marginBottom: 4 }}>Create Your Account</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: 16 }}>
            Start with the Free plan — no credit card required. Get 10 snapshots/month, 3 programs, and full API access.
          </p>

          <form onSubmit={handleSignUp}>
            <div style={{ marginBottom: 12 }}>
              <label>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label>Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" type="email" required />
            </div>
            {error && (
              <div style={{ color: "var(--red)", fontSize: "0.875rem", marginBottom: 12 }}>{error}</div>
            )}
            <button type="submit" className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}>
              Create Free Account
            </button>
          </form>

          <div style={{ textAlign: "center", margin: "16px 0 8px", color: "var(--text-muted)", fontSize: "0.8125rem" }}>
            — or —
          </div>
          <a
            href={`${import.meta.env.VITE_API_URL ?? "http://localhost:4000"}/v1/auth/github`}
            className="btn"
            style={{ width: "100%", justifyContent: "center", display: "flex", gap: 8, textDecoration: "none" }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
            Sign in with GitHub
          </a>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 8 }}>Already have an API key?</h3>
          <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginBottom: 12 }}>
            Paste your API key to connect this browser session.
          </p>
          <div className="flex" style={{ gap: 8 }}>
            <input
              placeholder="axis_..."
              style={{ flex: 1 }}
              value={pasteKey}
              onChange={(e) => setPasteKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const val = pasteKey.trim();
                  if (val.startsWith("axis_")) {
                    localStorage.setItem("axis_api_key", val);
                    window.location.reload();
                  }
                }
              }}
            />
            <button
              className="btn"
              onClick={() => {
                const val = pasteKey.trim();
                if (val.startsWith("axis_")) {
                  localStorage.setItem("axis_api_key", val);
                  window.location.reload();
                }
              }}
            >
              Connect
            </button>
          </div>
        </div>
      </div>
    );
  }

  const tierLabels: Record<BillingTier, string> = { free: "Free", paid: "Pro", suite: "Enterprise Suite" };
  const tierColors: Record<BillingTier, string> = { free: "badge-green", paid: "badge-accent", suite: "badge-yellow" };

  return (
    <div>
      {/* Account Info */}
      <div className="card">
        <div className="flex-between">
          <div>
            <h2>{account?.name ?? "Account"}</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>{account?.email}</p>
          </div>
          <div className="flex" style={{ gap: 8 }}>
            <span className={`badge ${tierColors[account?.tier ?? "free"]}`}>
              {tierLabels[account?.tier ?? "free"]}
            </span>
            <button className="btn" onClick={handleLogout} style={{ fontSize: "0.8125rem" }}>
              Log Out
            </button>
          </div>
        </div>
      </div>

      {/* Upgrade Banner */}
      {account && account.tier === "free" && (
        <div className="card" style={{ borderColor: "var(--accent)", marginTop: 0 }}>
          <div className="flex-between">
            <div>
              <h3 style={{ color: "var(--accent)" }}>Unlock All 18 Programs</h3>
              <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginTop: 4 }}>
                Upgrade to Pro for 200 snapshots/month, 20 projects, 5 team seats, and all 15 Pro programs.
              </p>
            </div>
            <button className="btn btn-primary" onClick={() => handleUpgrade("paid")}>
              Upgrade to Pro — $29/mo
            </button>
          </div>
        </div>
      )}
      {account && account.tier === "paid" && (
        <div className="card" style={{ borderColor: "var(--yellow)", marginTop: 0 }}>
          <div className="flex-between">
            <div>
              <h3 style={{ color: "var(--yellow)" }}>Need More?</h3>
              <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginTop: 4 }}>
                Enterprise Suite: unlimited snapshots, SSO, audit logs, and dedicated support.
              </p>
            </div>
            <button className="btn" onClick={() => handleUpgrade("suite")}>
              Upgrade to Enterprise
            </button>
          </div>
        </div>
      )}

      {/* Subscription Info */}
      {subscription?.has_active_subscription && subscription.active_subscription && (
        <div className="card" style={{ marginTop: 0 }}>
          <h3 style={{ marginBottom: 12 }}>Subscription</h3>
          <div className="grid grid-3" style={{ marginBottom: 12 }}>
            <div>
              <div className="stat-label">Status</div>
              <span className={`badge ${subscription.active_subscription.status === "active" ? "badge-green" : "badge-yellow"}`}>
                {subscription.active_subscription.status}
              </span>
            </div>
            {subscription.active_subscription.current_period_end && (
              <div>
                <div className="stat-label">Renews</div>
                <div style={{ fontSize: "0.875rem" }}>
                  {new Date(subscription.active_subscription.current_period_end).toLocaleDateString()}
                </div>
              </div>
            )}
            {subscription.active_subscription.card_brand && (
              <div>
                <div className="stat-label">Payment</div>
                <div style={{ fontSize: "0.875rem" }}>
                  {subscription.active_subscription.card_brand} ····{subscription.active_subscription.card_last_four}
                </div>
              </div>
            )}
          </div>
          {subscription.active_subscription.cancel_at ? (
            <p style={{ color: "var(--yellow)", fontSize: "0.8125rem" }}>
              Cancels on {new Date(subscription.active_subscription.cancel_at).toLocaleDateString()}
            </p>
          ) : (
            <button className="btn" style={{ fontSize: "0.8125rem" }} onClick={handleCancelSubscription}>
              Cancel Subscription
            </button>
          )}
        </div>
      )}

      {/* Revealed key banner */}
      {revealedKey && (
        <div className="card" style={{ borderColor: "var(--yellow)", marginTop: 0 }}>
          <div className="flex-between">
            <div>
              <h3 style={{ color: "var(--yellow)" }}>Save your API key — it won't be shown again</h3>
              <code className="mono" style={{ fontSize: "0.875rem", wordBreak: "break-all" }}>
                {revealedKey}
              </code>
            </div>
            <button
              className="btn"
              onClick={() => {
                navigator.clipboard.writeText(revealedKey);
              }}
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {/* Usage Overview */}
      {usage && (
        <div className="grid grid-4" style={{ marginTop: 0 }}>
          <div className="card" style={{ textAlign: "center" }}>
            <div className="stat-value">{usage.monthly_snapshots}</div>
            <div className="stat-label">Snapshots This Month</div>
            <div className="progress-bar" style={{ marginTop: 8 }}>
              <div
                className="progress-fill"
                style={{
                  width: `${Math.min(100, (usage.monthly_snapshots / (account?.tier === "free" ? 10 : account?.tier === "paid" ? 200 : 999)) * 100)}%`,
                  background: "var(--accent)",
                }}
              />
            </div>
          </div>
          <div className="card" style={{ textAlign: "center" }}>
            <div className="stat-value">{usage.project_count}</div>
            <div className="stat-label">Active Projects</div>
          </div>
          <div className="card" style={{ textAlign: "center" }}>
            <div className="stat-value">{usage.by_program.length}</div>
            <div className="stat-label">Programs Used</div>
          </div>
          <div className="card" style={{ textAlign: "center" }}>
            <div className="stat-value">
              {usage.by_program.reduce((s, p) => s + p.total_generators, 0)}
            </div>
            <div className="stat-label">Files Generated</div>
          </div>
        </div>
      )}

      {/* Credits Balance */}
      {credits && (
        <div className="card" style={{ marginTop: 0 }}>
          <h3 style={{ marginBottom: 12 }}>Persistence Credits</h3>
          <div className="grid grid-3">
            <div style={{ textAlign: "center" }}>
              <div className="stat-value">{credits.balance}</div>
              <div className="stat-label">Credits Remaining</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div className="stat-value">{credits.ledger.length}</div>
              <div className="stat-label">Transactions</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div className="stat-value" style={{ fontSize: "0.9rem" }}>{credits.tier}</div>
              <div className="stat-label">Tier</div>
            </div>
          </div>
          {credits.ledger.length > 0 && (
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: "pointer", color: "var(--text-muted)", fontSize: "0.85rem" }}>Recent transactions</summary>
              <table style={{ marginTop: 8 }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th style={{ textAlign: "right" }}>Amount</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {credits.ledger.slice(0, 10).map((e) => (
                    <tr key={e.entry_id}>
                      <td style={{ fontSize: "0.8rem" }}>{new Date(e.created_at).toLocaleDateString()}</td>
                      <td style={{ textAlign: "right", color: e.delta >= 0 ? "var(--success)" : "var(--danger)" }}>{e.delta >= 0 ? "+" : ""}{e.delta}</td>
                      <td style={{ fontSize: "0.85rem" }}>{e.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </div>
      )}

      {/* Per-program usage */}
      {usage && usage.by_program.length > 0 && (
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>Program Usage</h3>
          <table>
            <thead>
              <tr>
                <th>Program</th>
                <th style={{ textAlign: "right" }}>Runs</th>
                <th style={{ textAlign: "right" }}>Generators</th>
                <th style={{ textAlign: "right" }}>Input Files</th>
              </tr>
            </thead>
            <tbody>
              {usage.by_program.map((p) => (
                <tr key={p.program}>
                  <td><span className="badge">{p.program}</span></td>
                  <td style={{ textAlign: "right" }}>{p.total_runs}</td>
                  <td style={{ textAlign: "right" }}>{p.total_generators}</td>
                  <td style={{ textAlign: "right" }}>{p.total_input_files}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* API Keys */}
      <div className="card">
        <div className="flex-between" style={{ marginBottom: 12 }}>
          <h3>API Keys</h3>
          <form onSubmit={handleCreateKey} className="flex" style={{ gap: 8 }}>
            <input
              value={newKeyLabel}
              onChange={(e) => setNewKeyLabel(e.target.value)}
              placeholder="Key label (optional)"
              style={{ width: 200 }}
            />
            <button type="submit" className="btn btn-primary" style={{ whiteSpace: "nowrap" }}>
              + New Key
            </button>
          </form>
        </div>
        {keys.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>No API keys yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Label</th>
                <th>Prefix</th>
                <th>Created</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.key_id}>
                  <td>{k.label}</td>
                  <td className="mono">{k.prefix}...</td>
                  <td>{new Date(k.created_at).toLocaleDateString()}</td>
                  <td>
                    {k.revoked_at ? (
                      <span className="badge badge-red">Revoked</span>
                    ) : (
                      <span className="badge badge-green">Active</span>
                    )}
                  </td>
                  <td>
                    {!k.revoked_at && (
                      <button
                        className="btn"
                        style={{ fontSize: "0.75rem", padding: "4px 8px" }}
                        onClick={() => handleRevoke(k.key_id)}
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Team Seats */}
      {account && account.tier !== "free" && (
        <div className="card">
          <div className="flex-between" style={{ marginBottom: 12 }}>
            <h3>Team Seats {seats && <span style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>({seats.count}/{seats.limit})</span>}</h3>
            <form onSubmit={async (e: FormEvent) => {
              e.preventDefault();
              setError(null);
              try {
                await inviteSeat(inviteEmail.trim());
                setInviteEmail("");
                setSeats(await listSeats());
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to invite");
              }
            }} className="flex" style={{ gap: 8 }}>
              <input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="teammate@example.com"
                type="email"
                style={{ width: 220 }}
                required
              />
              <button type="submit" className="btn btn-primary" style={{ whiteSpace: "nowrap" }}>
                + Invite
              </button>
            </form>
          </div>
          {!seats || seats.seats.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>No team members yet. Invite someone to get started.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Invited</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {seats.seats.map((s) => (
                  <tr key={s.seat_id}>
                    <td>{s.email}</td>
                    <td><span className="badge">{s.role}</span></td>
                    <td>
                      {s.revoked_at ? (
                        <span className="badge badge-red">Revoked</span>
                      ) : s.accepted ? (
                        <span className="badge badge-green">Active</span>
                      ) : (
                        <span className="badge badge-yellow">Pending</span>
                      )}
                    </td>
                    <td>{new Date(s.created_at).toLocaleDateString()}</td>
                    <td>
                      {!s.revoked_at && (
                        <button
                          className="btn"
                          style={{ fontSize: "0.75rem", padding: "4px 8px" }}
                          onClick={async () => {
                            try {
                              await revokeSeat(s.seat_id);
                              setSeats(await listSeats());
                            } catch (err) {
                              setError(err instanceof Error ? err.message : "Failed to revoke seat");
                            }
                          }}
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {error && (
        <div className="card" style={{ borderColor: "var(--red)" }}>
          <p style={{ color: "var(--red)" }}>{error}</p>
        </div>
      )}
    </div>
  );
}
