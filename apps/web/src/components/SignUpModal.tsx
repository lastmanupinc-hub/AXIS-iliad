import { AuthButtons } from "./AuthButtons.tsx";

interface Props {
  onSuccess: () => void;
  onClose?: () => void;
  allowClose?: boolean;
}

export function SignUpModal({ onSuccess, onClose, allowClose = false }: Props) {
  return (
    <div className="modal-overlay" onClick={allowClose ? onClose : undefined}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginBottom: 4 }}>Sign in to Iliad</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: 20 }}>
          Continue with GitHub or Google to analyze your codebase and access your results.
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
