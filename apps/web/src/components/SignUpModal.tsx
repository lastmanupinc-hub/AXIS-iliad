import { useEffect, useRef } from "react";
import { AuthButtons } from "./AuthButtons.tsx";
// Single-source counts (WO-F5) — never inline these numbers.
import { PROGRAM_COUNT } from "../config.ts";

const FOCUSABLE_SELECTOR = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// ─── SignUpModal (WO-P2) ─────────────────────────────────────────
// The header/subhead copy varies by WHY the gate fired — "contextual signup
// copy per trigger" per the build plan — so the popup always explains what
// signing in unlocks right now instead of a generic wall. The trigger never
// changes WHICH providers are offered (GitHub/Google/email — see
// AuthButtons.tsx); it only selects the framing above them. Where the user
// lands once sign-in succeeds is a separate concern — see api.ts's
// rememberReturnTo/consumeReturnTo, wired up in App.tsx/routes.tsx.
//
// "quota" is defined here (and unit-tested) for the free-usage-limit gate,
// but its one live instance today (AnalyzePage's anonymous 429 path) already
// renders through UpsellModal with its own contextual copy — this trigger is
// ready for the next SignUpModal-driven quota gate (e.g. the WO-P15
// playground's anon rate-limit meter) without inventing dead UI now.

export type SignUpTrigger = "generic" | "save-project" | "paid-program" | "quota";

const TRIGGER_COPY: Record<SignUpTrigger, { title: string; body: string }> = {
  generic: {
    title: "Sign in to Iliad",
    body: "Continue with GitHub or Google to analyze your codebase and access your results.",
  },
  "save-project": {
    title: "Save this project",
    body: "Sign up free to keep every analysis as a saved project you can reopen anytime — plus unlock more paid programs.",
  },
  "paid-program": {
    title: "Sign in to upgrade",
    body: `Create a free account first, then choose a plan to unlock all ${PROGRAM_COUNT} programs.`,
  },
  quota: {
    title: "You've hit the free usage limit",
    body: "Sign up free for higher limits, then retry.",
  },
};

interface Props {
  onSuccess: () => void;
  onClose?: () => void;
  allowClose?: boolean;
  /** Why the gate fired — selects the header/subhead copy (default: generic). */
  trigger?: SignUpTrigger;
}

export function SignUpModal({ onSuccess, onClose, allowClose = false, trigger = "generic" }: Props) {
  const copy = TRIGGER_COPY[trigger];
  const contentRef = useRef<HTMLDivElement>(null);
  const titleId = "signup-modal-title";

  // Dialog semantics (H-Phase-A cycle 21), matching UpsellModal's
  // established pattern: Escape closes the dialog (only when allowClose,
  // mirroring the overlay's own click-to-close gating — a hard gate with no
  // legitimate close path shouldn't gain one via the keyboard), Tab/Shift+Tab
  // is trapped within it, and closing restores focus to whatever was
  // focused before the dialog opened.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    contentRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (allowClose) {
          e.preventDefault();
          onClose?.();
        }
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
  }, [allowClose, onClose]);

  return (
    <div className="modal-overlay" onClick={allowClose ? onClose : undefined}>
      <div
        ref={contentRef}
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{ outline: "none" }}
      >
        <h2 id={titleId} style={{ marginBottom: 4 }}>{copy.title}</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: 20 }}>
          {copy.body}
        </p>

        <AuthButtons onEmailSuccess={onSuccess} />

        {allowClose && (
          <button
            type="button"
            className="btn"
            onClick={onClose}
            style={{ width: "100%", marginTop: 16, justifyContent: "center" }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
