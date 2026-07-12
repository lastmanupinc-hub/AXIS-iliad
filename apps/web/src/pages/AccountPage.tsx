import { useState, useEffect, useCallback } from "react";
import { AuthButtons } from "../components/AuthButtons.tsx";
import { exchangeOAuthCode, logoutSession, markAuthed, consumeReturnTo } from "../api.ts";
import type { PageId } from "../routes.tsx";

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

// ─── AccountPage ────────────────────────────────────────────────────────
// WO-P12: this page's actual profile/keys/seats content moved to
// SettingsPage.tsx ("#settings"). "#account" survives ONLY as the OAuth
// redirect target (the provider's redirect_uri is a fixed server-side
// value pointing here — moving it would risk breaking sign-in for anyone
// mid-flow) plus the signed-out sign-in card. An already-authenticated
// visit — a stale bookmark, or landing here right after the OAuth exchange
// completes — redirects straight to Settings.

export function AccountPage({ onAuthChange, onNavigate }: { onAuthChange?: () => void; onNavigate: (page: PageId) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [exchanging, setExchanging] = useState(false);

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
      setExchanging(true);
      window.history.replaceState({}, "", window.location.pathname);
      exchangeOAuthCode(oauthCode)
        .then(() => {
          markAuthed(); // the exchange already set the HttpOnly cookie; just record the session
          onAuthChange?.();
          finishAuthAndReload(); // WO-P2: back to whatever page triggered sign-in, not always here
        })
        .catch((e) => {
          setError(`${provider} login failed: ${e instanceof Error ? e.message : "exchange error"}`);
          setExchanging(false);
        });
    }
  }, [onAuthChange]);

  const redirectToSettings = useCallback(() => {
    onNavigate("settings");
  }, [onNavigate]);

  useEffect(() => {
    if (isLoggedIn && !exchanging) redirectToSettings();
  }, [isLoggedIn, exchanging, redirectToSettings]);

  if (isLoggedIn && !exchanging) {
    return (
      <div className="empty-state">
        <span className="spinner" /> Redirecting to Settings...
      </div>
    );
  }

  const signingIn = exchanging || new URLSearchParams(window.location.search).has("code");
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
