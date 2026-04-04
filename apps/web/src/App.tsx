import { useState, useCallback, useEffect, useRef, useMemo, Component, type ReactNode } from "react";
import { UploadPage } from "./pages/UploadPage.tsx";
import { DashboardPage } from "./pages/DashboardPage.tsx";
import { PlansPage } from "./pages/PlansPage.tsx";
import { AccountPage } from "./pages/AccountPage.tsx";
import { ToastProvider } from "./components/Toast.tsx";
import { CommandPalette, type PaletteAction } from "./components/CommandPalette.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import type { SnapshotResponse } from "./api.ts";

// ─── Error Boundary ─────────────────────────────────────────────

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error("UI crash:", error); }
  render() {
    if (this.state.error) {
      return (
        <div className="card" style={{ margin: 40, textAlign: "center", padding: 32 }}>
          <h2>Something went wrong</h2>
          <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>{this.state.error.message}</p>
          <button className="btn btn-primary" onClick={() => { this.setState({ error: null }); location.hash = ""; }}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

type Page = "upload" | "dashboard" | "plans" | "account";

function getInitialPage(): Page {
  const h = location.hash.replace("#", "");
  if (h === "plans" || h === "account") return h;
  return "upload";
}

export function App() {
  const [page, setPage] = useState<Page>(getInitialPage);
  const [result, setResult] = useState<SnapshotResponse | null>(null);
  const [generatedFileCount, setGeneratedFileCount] = useState(0);
  const resultRef = useRef(result);
  resultRef.current = result;
  const [pageKey, setPageKey] = useState(0);

  useEffect(() => {
    const onHash = () => {
      const h = location.hash.replace("#", "");
      if (h === "plans") setPage("plans");
      else if (h === "account") setPage("account");
      else if (h === "dashboard" && resultRef.current) setPage("dashboard");
      else setPage("upload");
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const nav = useCallback((p: Page) => {
    setPage(p);
    setPageKey((k) => k + 1);
    location.hash = p === "upload" ? "" : p;
  }, []);

  const handleUploadComplete = useCallback((data: SnapshotResponse) => {
    setResult(data);
    setGeneratedFileCount(data.generated_files.length);
    setPage("dashboard");
    setPageKey((k) => k + 1);
    location.hash = "dashboard";
  }, []);

  const handleReset = useCallback(() => {
    setResult(null);
    setGeneratedFileCount(0);
    nav("upload");
  }, [nav]);

  const [loggedIn, setLoggedIn] = useState(!!localStorage.getItem("axis_api_key"));

  const handleAuthChange = useCallback(() => {
    setLoggedIn(!!localStorage.getItem("axis_api_key"));
  }, []);

  // Track generated file count from DashboardPage
  const handleGeneratedCountChange = useCallback((count: number) => {
    setGeneratedFileCount(count);
  }, []);

  // Command palette actions
  const paletteActions = useMemo<PaletteAction[]>(() => {
    const actions: PaletteAction[] = [
      { id: "nav-analyze", label: "Go to Analyze", icon: "📤", shortcut: "Ctrl+1", section: "Navigation", onSelect: () => nav("upload") },
      { id: "nav-plans", label: "Go to Plans", icon: "💳", shortcut: "Ctrl+3", section: "Navigation", onSelect: () => nav("plans") },
      { id: "nav-account", label: "Go to Account", icon: "👤", shortcut: "Ctrl+4", section: "Navigation", onSelect: () => nav("account") },
    ];
    if (result) {
      actions.splice(1, 0, {
        id: "nav-dashboard",
        label: "Go to Dashboard",
        icon: "📊",
        shortcut: "Ctrl+2",
        section: "Navigation",
        onSelect: () => nav("dashboard"),
      });
    }
    return actions;
  }, [result, nav]);

  // Keyboard shortcuts for nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const key = e.key;
      if (key === "1") { e.preventDefault(); nav("upload"); }
      else if (key === "2" && result) { e.preventDefault(); nav("dashboard"); }
      else if (key === "3") { e.preventDefault(); nav("plans"); }
      else if (key === "4") { e.preventDefault(); nav("account"); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [nav, result]);

  return (
    <ToastProvider>
      <header className="header">
        <div className="flex" style={{ gap: 12 }}>
          <h1 style={{ margin: 0, cursor: "pointer" }} onClick={handleReset}>
            ⚡ Axis Toolbox
          </h1>
          <span className="badge badge-accent">v0.3.1</span>
        </div>
        <nav className="flex" style={{ gap: 4 }}>
          <button
            className={`btn ${page === "upload" ? "btn-primary" : ""}`}
            onClick={() => nav("upload")}
          >
            Analyze
          </button>
          {result && (
            <button
              className={`btn ${page === "dashboard" ? "btn-primary" : ""}`}
              onClick={() => nav("dashboard")}
            >
              Dashboard
            </button>
          )}
          <button
            className={`btn ${page === "plans" ? "btn-primary" : ""}`}
            onClick={() => nav("plans")}
          >
            Plans
          </button>
          <button
            className={`btn ${page === "account" ? "btn-primary" : ""}`}
            onClick={() => nav("account")}
          >
            {loggedIn ? "Account" : "Sign Up"}
          </button>
          <button
            className="btn"
            onClick={() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true })); }}
            title="Command Palette (Ctrl+K)"
            style={{ padding: "8px 10px" }}
          >
            ⌘
          </button>
        </nav>
      </header>

      <ErrorBoundary>
        <div key={pageKey} className="page-enter">
          {page === "upload" && <UploadPage onComplete={handleUploadComplete} />}
          {page === "dashboard" && result && (
            <DashboardPage result={result} onGeneratedCountChange={handleGeneratedCountChange} />
          )}
          {page === "plans" && <PlansPage onSelectPlan={() => nav("account")} />}
          {page === "account" && <AccountPage onAuthChange={handleAuthChange} />}
        </div>
      </ErrorBoundary>

      <CommandPalette actions={paletteActions} />
      <StatusBar snapshot={result} fileCount={generatedFileCount} />
    </ToastProvider>
  );
}
