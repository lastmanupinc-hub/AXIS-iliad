import { useState, useEffect, useCallback, useRef, type FormEvent } from "react";
import { AuthButtons } from "../components/AuthButtons.tsx";
import {
  getAccount,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  listSeats,
  inviteSeat,
  revokeSeat,
  exchangeOAuthCode,
  logoutSession,
  markAuthed,
  consumeReturnTo,
  type Account,
  type ApiKeyInfo,
  type BillingTier,
  type Seat,
} from "../api.ts";

/** Land back on whatever page the login gate remembered (WO-P2) instead of
 *  always the default /account landing — a deep-linked auth-only page or a
 *  point-of-value nudge (App.tsx's openSignUp) records its own hash before
 *  bouncing here. The reload is a hard requirement of the OAuth handoff (a
 *  fresh mount re-reads the now-set session cookie/marker); setting the hash
 *  first means the fresh mount resolves straight to the right route instead
 *  of landing on Account and needing a second navigation. No-op fallback
 *  (plain reload, current /account URL) when nothing was recorded. */
function finishAuthAndReload(): void {
  const pending = consumeReturnTo();
  if (pending) window.location.hash = pending;
  window.location.reload();
}

export function AccountPage({ onAuthChange }: { onAuthChange?: () => void }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [seats, setSeats] = useState<{ seats: Seat[]; count: number; limit: number; remaining: number } | null>(null);
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
          finishAuthAndReload(); // WO-P2: back to whatever page triggered sign-in, not always here
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
      const [acct, keysData, seatsData] = await Promise.all([
        getAccount(),
        listApiKeys(),
        listSeats(),
      ]);
      setAccount(acct);
      setKeys(keysData.keys);
      setSeats(seatsData);
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
    setRevealedKey(null);
    setLoading(false);
    onAuthChange?.();
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
            <AuthButtons onEmailSuccess={() => { onAuthChange?.(); finishAuthAndReload(); }} />
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
