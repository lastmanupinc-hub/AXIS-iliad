import { useEffect, useRef } from "react";
import { AuthButtons } from "./AuthButtons.tsx";
import { formatUsdCents } from "./primitives/index.ts";
// Single-source counts (WO-F5) — never inline these numbers.
import { ARTIFACT_COUNT, PROGRAM_COUNT } from "../config.ts";

const FOCUSABLE_SELECTOR = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

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
  const contentRef = useRef<HTMLDivElement>(null);
  const titleId = "upsell-modal-title";

  // Dialog semantics (H-Phase-A cycle 16: comment corrected — it previously
  // claimed the opposite of what this effect does): Escape closes the dialog,
  // Tab/Shift+Tab is trapped within it, and closing restores focus to whatever
  // was focused before the dialog opened. Focus moves to the dialog container
  // itself (not a specific button) so the first real Tab press lands on a real
  // control, not an accidental Enter on whatever happened to be focused first.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    contentRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = contentRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={contentRef}
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 520, outline: "none" }}
      >
        <h2 id={titleId} style={{ marginBottom: 4, textAlign: "center" }}>
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
