import { useState, useCallback, useEffect, useRef, useMemo, Component, type ReactNode } from "react";
import { UploadPage } from "./pages/UploadPage.tsx";
import { DashboardPage } from "./pages/DashboardPage.tsx";
import { PlansPage } from "./pages/PlansPage.tsx";
import { AccountPage } from "./pages/AccountPage.tsx";
import { DocsPage } from "./pages/DocsPage.tsx";
import { HelpPage } from "./pages/HelpPage.tsx";
import { QAPage } from "./pages/QAPage.tsx";
import { ProgramsPage } from "./pages/ProgramsPage.tsx";
import { TermsPage } from "./pages/TermsPage.tsx";
import { ForAgentsPage } from "./pages/ForAgentsPage.tsx";
import { ExamplesPage } from "./pages/ExamplesPage.tsx";
import { InstallPage } from "./pages/InstallPage.tsx";
import { ToastProvider } from "./components/Toast.tsx";
import { CommandPalette, type PaletteAction } from "./components/CommandPalette.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { SignUpModal } from "./components/SignUpModal.tsx";
import type { SnapshotResponse } from "./api.ts";

// ─── Error Boundary ─────────────────────────────────────────────
// React requires a class for getDerivedStateFromError; this thin wrapper
// keeps the rest of the codebase class-free per .cursorrules.

class ErrorCatcher extends Component<{ children: ReactNode; fallback: (error: Error, reset: () => void) => ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error("UI crash:", error); }
  render() {
    if (this.state.error) return this.props.fallback(this.state.error, () => this.setState({ error: null }));
    return this.props.children;
  }
}

function ErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorCatcher fallback={(error, reset) => (
      <div className="card" style={{ margin: 40, textAlign: "center", padding: 32 }}>
        <h2>Something went wrong</h2>
        <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>{error.message}</p>
        <button className="btn btn-primary" onClick={() => { reset(); location.hash = ""; }}>
          Reload
        </button>
      </div>
    )}>
      {children}
    </ErrorCatcher>
  );
}

type Page = "upload" | "dashboard" | "plans" | "account" | "docs" | "help" | "qa" | "programs" | "terms" | "for-agents" | "examples" | "install";

function getInitialPage(): Page {
  const h = location.hash.replace("#", "");
  if (h === "plans" || h === "account" || h === "docs" || h === "help" || h === "qa" || h === "programs" || h === "terms" || h === "for-agents" || h === "examples" || h === "install") return h as Page;
  if (h === "dashboard" && localStorage.getItem("axis_last_result")) return "dashboard";
  return "upload";
}

function loadPersistedResult(): SnapshotResponse | null {
  try {
    const raw = localStorage.getItem("axis_last_result");
    if (raw) return JSON.parse(raw) as SnapshotResponse;
  } catch { /* corrupt data, ignore */ }
  return null;
}

export function App() {
  const [page, setPage] = useState<Page>(getInitialPage);
  const [result, setResult] = useState<SnapshotResponse | null>(loadPersistedResult);
  const [generatedFileCount, setGeneratedFileCount] = useState(0);
  const resultRef = useRef(result);
  resultRef.current = result;
  const [pageKey, setPageKey] = useState(0);
  const [showSignUp, setShowSignUp] = useState(false);
  const pendingResultRef = useRef<SnapshotResponse | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  // Theme: default light, persist to localStorage
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (localStorage.getItem("axis_theme") as "light" | "dark") ?? "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("axis_theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((t) => (t === "light" ? "dark" : "light"));
  }

  useEffect(() => {
    const onHash = () => {
      const h = location.hash.replace("#", "");
      if (h === "plans") setPage("plans");
      else if (h === "account") setPage("account");
      else if (h === "docs") setPage("docs");
      else if (h === "help") setPage("help");
      else if (h === "qa") setPage("qa");
      else if (h === "programs") setPage("programs");
      else if (h === "terms") setPage("terms");
      else if (h === "for-agents") setPage("for-agents");
      else if (h === "examples") setPage("examples");
      else if (h === "install") setPage("install");
      else if (h === "dashboard" && resultRef.current) setPage("dashboard");
      else if (h === "dashboard" && !resultRef.current) {
        const restored = loadPersistedResult();
        if (restored) { setResult(restored); setPage("dashboard"); }
        else setPage("upload");
      }
      else setPage("upload");
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const nav = useCallback((p: Page) => {
    setPage(p);
    setPageKey((k) => k + 1);
    setNavOpen(false);
    location.hash = p === "upload" ? "" : p;
  }, []);

  const handleUploadComplete = useCallback((data: SnapshotResponse) => {
    const isLoggedIn = !!localStorage.getItem("axis_api_key");
    if (!isLoggedIn) {
      pendingResultRef.current = data;
      setShowSignUp(true);
      return;
    }
    setResult(data);
    try { localStorage.setItem("axis_last_result", JSON.stringify(data)); } catch { /* quota exceeded, non-fatal */ }
    setGeneratedFileCount(data.generated_files.length);
    setPage("dashboard");
    setPageKey((k) => k + 1);
    location.hash = "dashboard";
  }, []);

  const handleReset = useCallback(() => {
    setResult(null);
    setGeneratedFileCount(0);
    localStorage.removeItem("axis_last_result");
    nav("upload");
  }, [nav]);

  const [loggedIn, setLoggedIn] = useState(!!localStorage.getItem("axis_api_key"));

  const handleAuthChange = useCallback(() => {
    setLoggedIn(!!localStorage.getItem("axis_api_key"));
  }, []);

  const handleSignUpSuccess = useCallback(() => {
    setShowSignUp(false);
    setLoggedIn(true);
    if (pendingResultRef.current) {
      const data = pendingResultRef.current;
      pendingResultRef.current = null;
      setResult(data);
      try { localStorage.setItem("axis_last_result", JSON.stringify(data)); } catch { /* quota exceeded, non-fatal */ }
      setGeneratedFileCount(data.generated_files.length);
      setPage("dashboard");
      setPageKey((k) => k + 1);
      location.hash = "dashboard";
    }
  }, []);

  // Track generated file count from DashboardPage
  const handleGeneratedCountChange = useCallback((count: number) => {
    setGeneratedFileCount(count);
  }, []);

  // Command palette actions
  const paletteActions = useMemo<PaletteAction[]>(() => {
    const actions: PaletteAction[] = [
      { id: "nav-analyze", label: "Go to Analyze", icon: "", shortcut: "Ctrl+1", section: "Navigation", onSelect: () => nav("upload") },
      { id: "nav-programs", label: "Go to Programs", icon: "", shortcut: "Ctrl+2", section: "Navigation", onSelect: () => nav("programs") },
      { id: "nav-plans", label: "Go to Plans", icon: "", shortcut: "Ctrl+3", section: "Navigation", onSelect: () => nav("plans") },
      { id: "nav-account", label: "Go to Account", icon: "", shortcut: "Ctrl+4", section: "Navigation", onSelect: () => nav("account") },
      { id: "nav-docs", label: "Go to Docs", icon: "", shortcut: "Ctrl+5", section: "Navigation", onSelect: () => nav("docs") },
      { id: "nav-help", label: "Go to Help", icon: "", shortcut: "Ctrl+6", section: "Navigation", onSelect: () => nav("help") },
      { id: "nav-qa", label: "Go to Q&A", icon: "", shortcut: "Ctrl+7", section: "Navigation", onSelect: () => nav("qa") },
    ];
    if (result) {
      actions.splice(1, 0, {
        id: "nav-dashboard",
        label: "Go to Dashboard",
        icon: "",
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
      else if (key === "2") { e.preventDefault(); nav("programs"); }
      else if (key === "2" && result) { e.preventDefault(); nav("dashboard"); }
      else if (key === "3") { e.preventDefault(); nav("plans"); }
      else if (key === "4") { e.preventDefault(); nav("account"); }
      else if (key === "5") { e.preventDefault(); nav("docs"); }
      else if (key === "6") { e.preventDefault(); nav("help"); }
      else if (key === "7") { e.preventDefault(); nav("qa"); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [nav, result]);

  return (
    <ToastProvider>
      <header className="header">
        <div className="header-brand">
          <h1 style={{ margin: 0, cursor: "pointer" }} onClick={handleReset}>
            Axis Toolbox
          </h1>
          <span className="badge badge-accent">v0.3.1</span>
        </div>

        {/* Desktop nav — hidden on mobile */}
        <nav className="nav-desktop">
          <button className={`btn ${page === "upload" ? "btn-primary" : ""}`} onClick={() => nav("upload")}>Analyze</button>
          {result && (
            <button className={`btn ${page === "dashboard" ? "btn-primary" : ""}`} onClick={() => nav("dashboard")}>Dashboard</button>
          )}
          <button className={`btn ${page === "programs" ? "btn-primary" : ""}`} onClick={() => nav("programs")}>Programs</button>
          <button className={`btn ${page === "plans" ? "btn-primary" : ""}`} onClick={() => nav("plans")}>Plans</button>
          <button className={`btn ${page === "account" ? "btn-primary" : ""}`} onClick={() => nav("account")}>{loggedIn ? "Account" : "Sign Up"}</button>
          <button className={`btn ${page === "docs" ? "btn-primary" : ""}`} onClick={() => nav("docs")}>Docs</button>
          <button className={`btn ${page === "help" ? "btn-primary" : ""}`} onClick={() => nav("help")}>Help</button>
          <button className={`btn ${page === "qa" ? "btn-primary" : ""}`} onClick={() => nav("qa")}>Q&amp;A</button>
          <button className={`btn ${page === "for-agents" ? "btn-primary" : ""}`} onClick={() => nav("for-agents")}>For Agents</button>
          <button className={`btn ${page === "examples" ? "btn-primary" : ""}`} onClick={() => nav("examples")}>Examples</button>
          <button className={`btn ${page === "install" ? "btn-primary" : ""}`} onClick={() => nav("install")}>Install</button>
          <button className="btn" onClick={() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true })); }} title="Command Palette (Ctrl+K)" style={{ padding: "8px 10px" }}>Cmd</button>
          <button className="theme-toggle" onClick={toggleTheme} title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}>{theme === "light" ? "Dark" : "Light"}</button>
        </nav>

        {/* Mobile controls — right side */}
        <div className="nav-mobile-controls">
          <button className="theme-toggle" onClick={toggleTheme} title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}>{theme === "light" ? "Dark" : "Light"}</button>
          <button
            className="hamburger"
            onClick={() => setNavOpen((o) => !o)}
            aria-label={navOpen ? "Close menu" : "Open menu"}
            aria-expanded={navOpen}
          >
            {navOpen ? "Close" : "Menu"}
          </button>
        </div>
      </header>

      {/* Mobile nav drawer */}
      {navOpen && (
        <nav className="nav-mobile-drawer" onClick={() => setNavOpen(false)}>
          <button className={`nav-drawer-item ${page === "upload" ? "active" : ""}`} onClick={() => nav("upload")}>Analyze</button>
          {result && (
            <button className={`nav-drawer-item ${page === "dashboard" ? "active" : ""}`} onClick={() => nav("dashboard")}>Dashboard</button>
          )}
          <button className={`nav-drawer-item ${page === "programs" ? "active" : ""}`} onClick={() => nav("programs")}>Programs</button>
          <button className={`nav-drawer-item ${page === "plans" ? "active" : ""}`} onClick={() => nav("plans")}>Plans</button>
          <button className={`nav-drawer-item ${page === "account" ? "active" : ""}`} onClick={() => nav("account")}>{loggedIn ? "Account" : "Sign Up"}</button>
          <button className={`nav-drawer-item ${page === "docs" ? "active" : ""}`} onClick={() => nav("docs")}>Docs</button>
          <button className={`nav-drawer-item ${page === "help" ? "active" : ""}`} onClick={() => nav("help")}>Help</button>
          <button className={`nav-drawer-item ${page === "qa" ? "active" : ""}`} onClick={() => nav("qa")}>Q&amp;A</button>
          <button className={`nav-drawer-item ${page === "for-agents" ? "active" : ""}`} onClick={() => nav("for-agents")}>For Agents</button>
          <button className={`nav-drawer-item ${page === "examples" ? "active" : ""}`} onClick={() => nav("examples")}>Examples</button>
          <button className={`nav-drawer-item ${page === "install" ? "active" : ""}`} onClick={() => nav("install")}>Install</button>
        </nav>
      )}

      {/* Trust / privacy banner — always visible */}
      <div className="trust-banner" role="note" aria-label="Privacy and IP protection statement">
        <span className="trust-item"><strong>Code never stored</strong> — we analyze and discard</span>
        <span className="trust-sep">·</span>
        <span className="trust-item"><strong>Never used for AI training</strong></span>
        <span className="trust-sep">·</span>
        <span className="trust-item"><strong>Your IP is fully protected</strong></span>
      </div>

      <ErrorBoundary>
        <div key={pageKey} className="page-enter">
          {page === "upload" && <UploadPage onComplete={handleUploadComplete} />}
          {page === "dashboard" && result && (
            <DashboardPage result={result} onGeneratedCountChange={handleGeneratedCountChange} />
          )}
          {page === "plans" && <PlansPage onSelectPlan={() => nav("account")} onRequireLogin={() => setShowSignUp(true)} />}
          {page === "account" && <AccountPage onAuthChange={handleAuthChange} />}
          {page === "docs" && <DocsPage />}
          {page === "help" && <HelpPage />}
          {page === "qa" && <QAPage />}
          {page === "programs" && <ProgramsPage onAnalyze={() => nav("upload")} />}
          {page === "terms" && <TermsPage />}
          {page === "for-agents" && <ForAgentsPage />}
          {page === "examples" && <ExamplesPage />}
          {page === "install" && <InstallPage />}
        </div>
      </ErrorBoundary>

      {/* Footer */}
      <footer style={{ textAlign: "center", padding: "24px 16px", borderTop: "1px solid var(--border)", marginTop: 40 }}>
        <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", margin: 0 }}>
          © {new Date().getFullYear()} Last Man Up Inc. ·{" "}
          <button className="btn" style={{ padding: "0 4px", fontSize: "0.8rem", display: "inline" }} onClick={() => nav("terms")}>Terms of Service</button>
          {" "} · {" "}
          <a href="mailto:support@jonathanarvay.com" style={{ color: "var(--text-muted)" }}>support@jonathanarvay.com</a>
        </p>
      </footer>

      <CommandPalette actions={paletteActions} />
      <StatusBar snapshot={result} fileCount={generatedFileCount} />
      {showSignUp && (
        <SignUpModal
          onSuccess={handleSignUpSuccess}
          onClose={() => setShowSignUp(false)}
          allowClose={true}
        />
      )}
    </ToastProvider>
  );
}
