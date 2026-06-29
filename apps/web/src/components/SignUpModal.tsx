import { useState, type FormEvent } from "react";
import { createAccount, establishSession } from "../api.ts";

interface Props {
  onSuccess: () => void;
  onClose?: () => void;
  allowClose?: boolean;
}

export function SignUpModal({ onSuccess, onClose, allowClose = false }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pasteKey, setPasteKey] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await createAccount(name.trim(), email.trim());
      await establishSession(result.api_key.raw_key);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasteKey(e: FormEvent) {
    e.preventDefault();
    if (!pasteKey.trim()) return;
    setError(null);
    try {
      await establishSession(pasteKey.trim());
      onSuccess();
    } catch {
      setError("That API key wasn't accepted. Check it and try again.");
    }
  }

  return (
    <div className="modal-overlay" onClick={allowClose ? onClose : undefined}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginBottom: 4 }}>Create Your Account</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: 20 }}>
          Sign up to analyze your codebase and access your results.
        </p>

        {error && (
          <div style={{ padding: "8px 12px", marginBottom: 16, borderRadius: "var(--radius)", background: "color-mix(in srgb, var(--red) 12%, transparent)", color: "var(--red)", fontSize: "0.875rem" }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label htmlFor="signup-name">Name</label>
          <input
            id="signup-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            style={{ marginBottom: 12 }}
            autoFocus
          />

          <label htmlFor="signup-email">Email</label>
          <input
            id="signup-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{ marginBottom: 16 }}
          />

          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
            style={{ width: "100%", justifyContent: "center" }}
          >
            {submitting ? <><span className="spinner" /> Creating...</> : "Create Account"}
          </button>
        </form>

        <div style={{ textAlign: "center", margin: "16px 0 12px", color: "var(--text-muted)", fontSize: "0.75rem" }}>
          or sign in with an existing API key
        </div>

        <form onSubmit={handlePasteKey}>
          <div className="flex" style={{ gap: 8 }}>
            <input
              type="text"
              value={pasteKey}
              onChange={(e) => setPasteKey(e.target.value)}
              placeholder="Paste API key"
              style={{ fontFamily: "var(--mono)", fontSize: "0.8125rem" }}
            />
            <button type="submit" className="btn" style={{ whiteSpace: "nowrap" }}>
              Sign In
            </button>
          </div>
        </form>

        {allowClose && (
          <button
            type="button"
            className="btn"
            onClick={onClose}
            style={{ width: "100%", marginTop: 12, justifyContent: "center" }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
