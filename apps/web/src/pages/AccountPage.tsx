import { useState, useEffect, useCallback, useRef, type FormEvent } from "react";
import { AuthButtons } from "../components/AuthButtons.tsx";
import {
  getAccount,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  getUsage,
  getCredits,
  createCreditTopup,
  getPaidConfig,
  getSubscription,
  cancelSubscription,
  listSeats,
  inviteSeat,
  revokeSeat,
  exchangeOAuthCode,
  logoutSession,
  markAuthed,
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
  const [topupBusy, setTopupBusy] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // API-key management (create/reveal a key once for CLI/MCP use — NOT web login)
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  const isLoggedIn = !!localStorage.getItem("axis_api_key");

  // Handle the OAuth callback: trade the one-time ?code= for the API key — the
  // key is never placed in the URL. Scrub the URL immediately, either way.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthCode = params.get("code");
    const oauthLogin = params.get("login");
    const oauthError = params.get("error");
    const provider = oauthLogin === "google" ? "Google" : "GitHub";
    if (oauthError) {
      setError(`${provider} login failed: ${oauthError}`);
      window.history.replaceState({}, "", window.location.pathname);
    } else if (oauthCode && (oauthLogin === "github" || oauthLogin === "google")) {
      window.history.replaceState({}, "", window.location.pathname);
      exchangeOAuthCode(oauthCode)
        .then(() => {
          markAuthed(); // the exchange already set the HttpOnly cookie; just record the session
          onAuthChange?.();
          window.location.reload();
        })
        .catch((e) => setError(`${provider} login failed: ${e instanceof Error ? e.message : "exchange error"}`));
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
    void logoutSession(); // clear the HttpOnly axis_session cookie server-side (best-effort)
    localStorage.removeItem("axis_api_key");
    setAccount(null);
    setKeys([]);
    setUsage(null);
    setRevealedKey(null);
    setCredits(null);
    setLoading(false);
    onAuthChange?.();
  }

  async function handleUpgrade(planId: "starter" | "pro" | "growth") {
    setError(null);
    // PAI'D is the only checkout path — route to the PAI'D checkout page; never charge Stripe directly.
    try {
      const cfg = await getPaidConfig();
      if (cfg.configured) {
        sessionStorage.setItem("axis_paid_plan", planId);
        window.location.hash = "paid-checkout";
        return;
      }
      setError("Checkout is temporarily unavailable — please try again shortly.");
    } catch {
      setError("Checkout is temporarily unavailable — please try again shortly.");
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

  // Not logged in — show the OAuth sign-in card. (Account settings are login-gated:
  // App.tsx normally opens the sign-in popup before this renders; this branch also
  // covers the brief OAuth-callback window while ?code= is being exchanged.)
  if (!isLoggedIn && !account) {
    const signingIn = new URLSearchParams(window.location.search).has("code");
    return (
      <div style={{ maxWidth: 420, margin: "0 auto" }}>
        <div className="card">
          <h2 style={{ marginBottom: 4 }}>Sign in to Iliad</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: 16 }}>
            {signingIn ? "Signing you in…" : "Continue with GitHub or Google to view your account and results."}
          </p>
          {error && (
            <div style={{ color: "var(--red)", fontSize: "0.875rem", marginBottom: 12 }}>{error}</div>
          )}
          {signingIn ? (
            <div className="empty-state"><span className="spinner" /> Completing sign-in…</div>
          ) : (
            <AuthButtons onEmailSuccess={() => { onAuthChange?.(); window.location.reload(); }} />
          )}
        </div>
      </div>
    );
  }

  const tierLabels: Record<BillingTier, string> = { free: "Free", paid: "Starter", suite: "Growth" };
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
              <h3 style={{ color: "var(--accent)" }}>Unlock All 20 Programs</h3>
              <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginTop: 4 }}>
                Upgrade to Starter for $29/month and 75,000 monthly credits across all 20 programs.
              </p>
            </div>
            <button className="btn btn-primary" onClick={() => handleUpgrade("starter")}>
              Upgrade to Starter — $29/mo
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
                Move to Growth for $299/month and 1,200,000 monthly credits. Pro ($99/month) includes 300,000 monthly credits.
              </p>
            </div>
            <button className="btn" onClick={() => handleUpgrade("growth")}>
              View Growth Plan
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
          {credits.credit_packs.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: 8 }}>
                Buy more credits — secure checkout via PAI'D
              </div>
              <div className="grid grid-3">
                {credits.credit_packs.map((p) => (
                  <button
                    key={p.pack_id}
                    type="button"
                    className="btn"
                    disabled={topupBusy !== null}
                    onClick={async () => {
                      setTopupBusy(p.pack_id);
                      try {
                        const session = await createCreditTopup(p.pack_id);
                        window.location.href = session.checkout_url;
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Top-up failed");
                        setTopupBusy(null);
                      }
                    }}
                  >
                    {topupBusy === p.pack_id
                      ? "Redirecting…"
                      : `${p.credits.toLocaleString()} credits — $${(p.price_cents / 100).toFixed(0)}`}
                  </button>
                ))}
              </div>
            </div>
          )}
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
