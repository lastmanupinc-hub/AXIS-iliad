import { useState, useEffect, useCallback, useRef, createContext, useContext, type ReactNode } from "react";

// ─── Types ──────────────────────────────────────────────────────

type ToastLevel = "info" | "success" | "error" | "warning";

interface Toast {
  id: number;
  level: ToastLevel;
  message: string;
  expiresAt: number;
}

interface ToastContextValue {
  toast: (level: ToastLevel, message: string, durationMs?: number) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

// ─── Provider ───────────────────────────────────────────────────

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const toast = useCallback((level: ToastLevel, message: string, durationMs = 4000) => {
    const id = nextId++;
    setToasts((prev) => [...prev.slice(-4), { id, level, message, expiresAt: Date.now() + durationMs }]);
  }, []);

  // Garbage-collect expired toasts
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setToasts((prev) => {
        const now = Date.now();
        const next = prev.filter((t) => t.expiresAt > now);
        return next.length === prev.length ? prev : next;
      });
    }, 500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <ToastRail toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ─── Rail ───────────────────────────────────────────────────────

const LEVEL_STYLE: Record<ToastLevel, { bg: string; border: string; icon: string }> = {
  info: { bg: "var(--bg-card)", border: "var(--blue)", icon: "ℹ️" },
  success: { bg: "var(--bg-card)", border: "var(--green)", icon: "✅" },
  warning: { bg: "var(--bg-card)", border: "var(--yellow)", icon: "⚠️" },
  error: { bg: "var(--bg-card)", border: "var(--red)", icon: "❌" },
};

function ToastRail({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 56,
        right: 24,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 9000,
        maxWidth: 380,
      }}
    >
      {toasts.map((t) => {
        const s = LEVEL_STYLE[t.level];
        return (
          <div
            key={t.id}
            className="animate-slide-up"
            style={{
              background: s.bg,
              border: `1px solid ${s.border}`,
              borderRadius: "var(--radius)",
              padding: "10px 14px",
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              cursor: "pointer",
            }}
            onClick={() => onDismiss(t.id)}
          >
            <span style={{ flexShrink: 0 }}>{s.icon}</span>
            <span style={{ fontSize: "0.8125rem", lineHeight: 1.4 }}>{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}
