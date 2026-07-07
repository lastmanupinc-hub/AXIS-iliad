import { AuthButtons } from "./AuthButtons.tsx";
import { formatUsdCents } from "./primitives/index.ts";
// Single-source counts (WO-F5) — never inline these numbers.
import { ARTIFACT_COUNT, PROGRAM_COUNT } from "../config.ts";

interface UpsellPricing {
  standardCents: number;
  liteCents: number;
}

interface Props {
  blocked: string[];
  allowed: string[];
  onGoFree: () => void;
  onClose: () => void;
  /** WO-P4: live pricing from the 402 payload (api.ts's mppPricing) — when
   *  present, shows both tiers so a lite-mode toggle demonstrably changes
   *  the number the caller would be charged. */
  pricing?: UpsellPricing;
  /** Which tier the caller actually requested — highlighted in the pricing
   *  line. Defaults to "standard" (no lite-mode toggle upstream). */
  mode?: "standard" | "lite";
}

export function UpsellModal({ blocked, allowed, onGoFree, onClose, pricing, mode = "standard" }: Props) {
  const isAnonymous = !localStorage.getItem("axis_api_key");
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

        {pricing && (
          <p className="text-center text-sm text-muted mb-3">
            Per-run price:{" "}
            {mode === "lite" ? (
              <>
                <strong>{formatUsdCents(pricing.liteCents)}</strong> (lite mode) · standard {formatUsdCents(pricing.standardCents)}
              </>
            ) : (
              <>
                <strong>{formatUsdCents(pricing.standardCents)}</strong> · lite mode {formatUsdCents(pricing.liteCents)}
              </>
            )}
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: "100%", justifyContent: "center", padding: "12px 16px", fontSize: "1rem" }}
            onClick={() => { window.location.hash = "plans"; onClose(); }}
          >
            Go Pro — Unlock All {PROGRAM_COUNT} Programs
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
          {isAnonymous ? (
            <div>
              <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.8125rem", marginBottom: 12 }}>
                Sign in to save your work — then retry.
              </p>
              <AuthButtons onEmailSuccess={onClose} />
            </div>
          ) : (
            <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.8125rem", margin: 0 }}>
              You're on the free tier. Upgrade to Pro for all {PROGRAM_COUNT} programs and {ARTIFACT_COUNT} artifacts.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
