import { useState, type FormEvent } from "react";
import { API_BASE, createAccount, establishSession } from "../api.ts";

// Shared sign-in surface: GitHub + Google OAuth are the primary paths (plain
// top-level navigations — no client-side secret handling). A subtle collapsible
// "email" fallback remains for users without a GitHub/Google account. There is
// deliberately NO "paste your API key" login here — programmatic keys are for
// CLI/MCP/agents (managed in Settings once signed in), not web login.

const GitHubIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

const GoogleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 009 18z" />
    <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 010-3.44V4.95H.96a9 9 0 000 8.1l3.01-2.33z" />
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 00.96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
  </svg>
);

const LinkedInIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#0A66C2" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

export function AuthButtons({ onEmailSuccess }: { onEmailSuccess?: () => void }) {
  const [showEmail, setShowEmail] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEmail(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await createAccount(name.trim(), email.trim());
      // Exchange the freshly-minted key for the HttpOnly cookie, then discard it —
      // the raw key is never shown or persisted in the web UI (create one in
      // Settings if you need a key for CLI/MCP).
      await establishSession(result.api_key.raw_key);
      onEmailSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      {error && (
        <div style={{ padding: "8px 12px", marginBottom: 12, borderRadius: "var(--radius)", background: "color-mix(in srgb, var(--red) 12%, transparent)", color: "var(--red)", fontSize: "0.8125rem" }}>
          {error}
        </div>
      )}

      <a
        href={`${API_BASE}/v1/auth/github`}
        className="btn"
        style={{ width: "100%", justifyContent: "center", display: "flex", gap: 8, textDecoration: "none", marginBottom: 10 }}
      >
        <GitHubIcon /> Continue with GitHub
      </a>
      <a
        href={`${API_BASE}/v1/auth/google`}
        className="btn"
        style={{ width: "100%", justifyContent: "center", display: "flex", gap: 8, textDecoration: "none", marginBottom: 10 }}
      >
        <GoogleIcon /> Continue with Google
      </a>
      <a
        href={`${API_BASE}/v1/auth/linkedin`}
        className="btn"
        style={{ width: "100%", justifyContent: "center", display: "flex", gap: 8, textDecoration: "none" }}
      >
        <LinkedInIcon /> Continue with LinkedIn
      </a>

      {!showEmail ? (
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button
            type="button"
            onClick={() => setShowEmail(true)}
            style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "0.78rem", cursor: "pointer", textDecoration: "underline" }}
          >
            or sign up with email
          </button>
        </div>
      ) : (
        <form onSubmit={(e) => { void handleEmail(e); }} style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
          <label htmlFor="auth-name" style={{ fontSize: "0.8125rem" }}>Name</label>
          <input id="auth-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" style={{ marginBottom: 8 }} autoFocus />
          <label htmlFor="auth-email" style={{ fontSize: "0.8125rem" }}>Email</label>
          <input id="auth-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={{ marginBottom: 12 }} />
          <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: "100%", justifyContent: "center" }}>
            {submitting ? <><span className="spinner" /> Creating…</> : "Create account with email"}
          </button>
        </form>
      )}
    </div>
  );
}
