import { useState, type FormEvent } from "react";
import { createAccount } from "../api.ts";

interface Props {
  blocked: string[];
  allowed: string[];
  onGoFree: () => void;
  onClose: () => void;
}

export function UpsellModal({ blocked, allowed, onGoFree, onClose }: Props) {
  const isAnonymous = !localStorage.getItem("axis_api_key");
  const [showSignup, setShowSignup] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignup(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) { setError("Name and email are required"); return; }
    setSubmitting(true);
    setError(null);
    try {
      const result = await createAccount(name.trim(), email.trim());
      localStorage.setItem("axis_api_key", result.api_key.raw_key);
      onClose(); // close and let user retry with their new key
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setSubmitting(false);
    }
  }

  const isQuotaExceeded = blocked.length === 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <h2 style={{ marginBottom: 4, textAlign: "center" }}>
          {isQuotaExceeded ? "📊 Usage Limit Reached" : "🔒 Pro Programs Required"}
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", textAlign: "center", marginBottom: 16 }}>
          {isQuotaExceeded
            ? "You've reached your free tier usage limit. Upgrade to Pro for higher limits."
            : "Your selection includes programs that require a Pro plan:"}
        </p>

        {blocked.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginBottom: 20 }}>
            {blocked.map((p) => (
              <span key={p} className="badge badge-accent" style={{ fontSize: "0.82rem", padding: "4px 10px" }}>{p}</span>
            ))}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: "100%", justifyContent: "center", padding: "12px 16px", fontSize: "1rem" }}
            onClick={() => { window.location.hash = "plans"; onClose(); }}
          >
            Go Pro — Unlock All 20 Programs
          </button>

          <button
            type="button"
            className="btn"
            style={{ width: "100%", justifyContent: "center", padding: "10px 16px" }}
            onClick={onGoFree}
          >
            Use Free Programs Only ({allowed.length} programs)
          </button>
        </div>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
          {isAnonymous && !showSignup && (
            <div style={{ textAlign: "center" }}>
              <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginBottom: 8 }}>
                Don't have an account yet? Create one for free.
              </p>
              <button
                type="button"
                className="btn"
                style={{ fontSize: "0.8125rem" }}
                onClick={() => setShowSignup(true)}
              >
                Create Free Account
              </button>
            </div>
          )}

          {isAnonymous && showSignup && (
            <>
              {error && (
                <div style={{ padding: "8px 12px", marginBottom: 12, borderRadius: "var(--radius)", background: "color-mix(in srgb, var(--red) 12%, transparent)", color: "var(--red)", fontSize: "0.8125rem" }}>
                  {error}
                </div>
              )}
              <form onSubmit={handleSignup}>
                <label htmlFor="upsell-name" style={{ fontSize: "0.8125rem" }}>Name</label>
                <input id="upsell-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" style={{ marginBottom: 8 }} autoFocus />
                <label htmlFor="upsell-email" style={{ fontSize: "0.8125rem" }}>Email</label>
                <input id="upsell-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={{ marginBottom: 12 }} />
                <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: "100%", justifyContent: "center" }}>
                  {submitting ? <><span className="spinner" /> Creating...</> : "Create Account & Retry"}
                </button>
              </form>
            </>
          )}

          {!isAnonymous && (
            <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.8125rem", margin: 0 }}>
              You're on the free tier. Upgrade to Pro for all 20 programs and 140 artifacts.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
