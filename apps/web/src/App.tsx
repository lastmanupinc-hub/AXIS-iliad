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
import { PaidCheckoutPage } from "./pages/PaidCheckoutPage.tsx";
import { AdminPage } from "./pages/AdminPage.tsx";
import { MyAnalyticsPage } from "./pages/MyAnalyticsPage.tsx";
import { ToolsIndexPage } from "./pages/ToolsIndexPage.tsx";
import { WebResearchPage } from "./pages/tools/WebResearchPage.tsx";
import { ToastProvider } from "./components/Toast.tsx";
import { CommandPalette, type PaletteAction } from "./components/CommandPalette.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { SignUpModal } from "./components/SignUpModal.tsx";
import { getAdminStats, type SnapshotResponse } from "./api.ts";

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

type Page =
  | "upload"
  | "dashboard"
  | "plans"
  | "account"
  | "docs"
  | "help"
  | "qa"
  | "programs"
  | "terms"
  | "for-agents"
  | "examples"
  | "install"
  | "paid-checkout"
  | "admin"
  | "myanalytics"
  | "tools"
  // Sub-tool pages — each click-driven console for a single backend capability.
  // Hash format: "#tools/web-research" → "tool-web-research".
  | "tool-web-research";

const AUTH_ONLY_PAGES = new Set<Page>(["admin", "myanalytics"]);

function hasApiKey(): boolean {
  return !!localStorage.getItem("axis_api_key");
}

function pageFromPathname(pathname: string): Page | null {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized === "/for-agents") return "for-agents";
  if (normalized === "/mcp") return "for-agents";
  if (normalized === "/pricing") return "plans";
  if (normalized === "/docs") return "docs";
  if (normalized === "/install") return "install";
  if (normalized === "/programs") return "programs";
  if (normalized === "/tools") return "tools";
  if (normalized === "/tools/web-research") return "tool-web-research";
  return null;
}

/** Parse a sub-tool hash like "tools/web-research" into a Page enum value. */
function pageFromHash(hash: string): Page | null {
  const h = hash.replace(/^#/, "");
  if (!h) return null;
  if (h === "tools") return "tools";
  if (h === "tools/web-research") return "tool-web-research";
  // Future tool subpages: extend this match block in lockstep with the Page union above.
  return null;
}

function getInitialPage(): Page {
  const pathPage = pageFromPathname(location.pathname);
  if (pathPage) return pathPage;

  const subPage = pageFromHash(location.hash);
  if (subPage) return subPage;

  const h = location.hash.replace("#", "");
  if (h === "admin" || h === "myanalytics") return hasApiKey() ? (h as Page) : "account";
  if (h === "plans" || h === "account" || h === "docs" || h === "help" || h === "qa" || h === "programs" || h === "terms" || h === "for-agents" || h === "examples" || h === "install" || h === "paid-checkout") return h as Page;
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
      const pathPage = pageFromPathname(location.pathname);
      if (pathPage) {
        setPage(pathPage);
        return;
      }

      const subPage = pageFromHash(location.hash);
      if (subPage) {
        setPage(subPage);
        return;
      }

      const h = location.hash.replace("#", "");
      const isLoggedIn = hasApiKey();
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
      else if (h === "paid-checkout") setPage("paid-checkout");
      else if (h === "admin") {
        if (isLoggedIn) setPage("admin");
        else {
          setPage("account");
          location.hash = "account";
        }
      }
      else if (h === "myanalytics") {
        if (isLoggedIn) setPage("myanalytics");
        else {
          setPage("account");
          location.hash = "account";
        }
      }
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

  /** Map a Page enum to the hash it should set in the URL. Sub-tool pages
   *  use a sub-path style (#tools/web-research) for readability. */
  const hashForPage = useCallback((p: Page): string => {
    if (p === "upload") return "";
    if (p === "tool-web-research") return "tools/web-research";
    return p;
  }, []);

  const nav = useCallback((p: Page) => {
    if (AUTH_ONLY_PAGES.has(p) && !hasApiKey()) {
      setPage("account");
      setPageKey((k) => k + 1);
      setNavOpen(false);
      location.hash = "account";
      return;
    }
    setPage(p);
    setPageKey((k) => k + 1);
    setNavOpen(false);
    location.hash = hashForPage(p);
  }, [hashForPage]);

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
  const [privateAccess, setPrivateAccess] = useState(false);

  const handleAuthChange = useCallback(() => {
    setLoggedIn(!!localStorage.getItem("axis_api_key"));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function resolvePrivateAccess() {
      if (!loggedIn) {
        setPrivateAccess(false);
        return;
      }

      try {
        await getAdminStats();
        if (!cancelled) setPrivateAccess(true);
      } catch (err) {
        // Any failure (403 forbidden, network error, etc.) means no admin access.
        if (!cancelled) setPrivateAccess(false);
      }
    }

    void resolvePrivateAccess();
    return () => {
      cancelled = true;
    };
  }, [loggedIn]);

  useEffect(() => {
    if ((page === "admin" || page === "myanalytics") && !privateAccess) {
      setPage("account");
      location.hash = "account";
    }
  }, [page, privateAccess]);

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
    // Ctrl+2 belongs to Dashboard when a result exists (matches the keyboard
    // handler below and the HelpPage shortcut table); Programs holds it otherwise.
    const actions: PaletteAction[] = [
      { id: "nav-analyze", label: "Go to Analyze", icon: "", shortcut: "Ctrl+1", section: "Navigation", onSelect: () => nav("upload") },
      ...(result
        ? [{ id: "nav-dashboard", label: "Go to Dashboard", icon: "", shortcut: "Ctrl+2", section: "Navigation", onSelect: () => nav("dashboard") }]
        : []),
      { id: "nav-programs", label: "Go to Programs", icon: "", ...(result ? {} : { shortcut: "Ctrl+2" }), section: "Navigation", onSelect: () => nav("programs") },
      { id: "nav-plans", label: "Go to Plans", icon: "", shortcut: "Ctrl+3", section: "Navigation", onSelect: () => nav("plans") },
      { id: "nav-account", label: "Go to Account", icon: "", shortcut: "Ctrl+4", section: "Navigation", onSelect: () => nav("account") },
      { id: "nav-docs", label: "Go to Docs", icon: "", shortcut: "Ctrl+5", section: "Navigation", onSelect: () => nav("docs") },
      { id: "nav-help", label: "Go to Help", icon: "", shortcut: "Ctrl+6", section: "Navigation", onSelect: () => nav("help") },
      { id: "nav-qa", label: "Go to Q&A", icon: "", shortcut: "Ctrl+7", section: "Navigation", onSelect: () => nav("qa") },
    ];
    if (privateAccess) {
      actions.push(
        { id: "nav-admin", label: "Go to Admin", icon: "", shortcut: "Ctrl+8", section: "Navigation", onSelect: () => nav("admin") },
        { id: "nav-myanalytics", label: "Go to MyAnalytics", icon: "", shortcut: "Ctrl+9", section: "Navigation", onSelect: () => nav("myanalytics") },
      );
    }
    return actions;
  }, [result, nav, privateAccess]);

  // Keyboard shortcuts for nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const key = e.key;
      if (key === "1") { e.preventDefault(); nav("upload"); }
      // Ctrl+2 → Dashboard when a result exists (per HelpPage shortcut table),
      // Programs otherwise so the key is never dead.
      else if (key === "2" && result) { e.preventDefault(); nav("dashboard"); }
      else if (key === "2") { e.preventDefault(); nav("programs"); }
      else if (key === "3") { e.preventDefault(); nav("plans"); }
      else if (key === "4") { e.preventDefault(); nav("account"); }
      else if (key === "5") { e.preventDefault(); nav("docs"); }
      else if (key === "6") { e.preventDefault(); nav("help"); }
      else if (key === "7") { e.preventDefault(); nav("qa"); }
      else if (key === "8" && privateAccess) { e.preventDefault(); nav("admin"); }
      else if (key === "9" && privateAccess) { e.preventDefault(); nav("myanalytics"); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [nav, result, privateAccess]);

  return (
    <ToastProvider>
      <header className="header">
        <div className="header-brand">
          <h1 style={{ margin: 0, cursor: "pointer" }} onClick={handleReset}>
            Axis' Iliad
          </h1>
          <span className="badge badge-accent">v0.5.0</span>
        </div>

        {/* Desktop nav — hidden on mobile */}
        <nav className="nav-desktop">
          <button className={`btn ${page === "upload" ? "btn-primary" : ""}`} onClick={() => nav("upload")}>Analyze</button>
          {result && (
            <button className={`btn ${page === "dashboard" ? "btn-primary" : ""}`} onClick={() => nav("dashboard")}>Dashboard</button>
          )}
          <button className={`btn ${page === "tools" || page.startsWith("tool-") ? "btn-primary" : ""}`} onClick={() => nav("tools")}>Tools</button>
          <button className={`btn ${page === "programs" ? "btn-primary" : ""}`} onClick={() => nav("programs")}>Programs</button>
          <button className={`btn ${page === "plans" ? "btn-primary" : ""}`} onClick={() => nav("plans")}>Plans</button>
          <button className={`btn ${page === "account" ? "btn-primary" : ""}`} onClick={() => nav("account")}>{loggedIn ? "Account" : "Sign Up"}</button>
          <button className={`btn ${page === "docs" ? "btn-primary" : ""}`} onClick={() => nav("docs")}>Docs</button>
          <button className={`btn ${page === "help" ? "btn-primary" : ""}`} onClick={() => nav("help")}>Help</button>
          <button className={`btn ${page === "qa" ? "btn-primary" : ""}`} onClick={() => nav("qa")}>Q&amp;A</button>
          {privateAccess && <button className={`btn ${page === "myanalytics" ? "btn-primary" : ""}`} onClick={() => nav("myanalytics")}>MyAnalytics</button>}
          {privateAccess && <button className={`btn ${page === "admin" ? "btn-primary" : ""}`} onClick={() => nav("admin")}>Admin</button>}
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
          <button className={`nav-drawer-item ${page === "tools" || page.startsWith("tool-") ? "active" : ""}`} onClick={() => nav("tools")}>Tools</button>
          <button className={`nav-drawer-item ${page === "programs" ? "active" : ""}`} onClick={() => nav("programs")}>Programs</button>
          <button className={`nav-drawer-item ${page === "plans" ? "active" : ""}`} onClick={() => nav("plans")}>Plans</button>
          <button className={`nav-drawer-item ${page === "account" ? "active" : ""}`} onClick={() => nav("account")}>{loggedIn ? "Account" : "Sign Up"}</button>
          <button className={`nav-drawer-item ${page === "docs" ? "active" : ""}`} onClick={() => nav("docs")}>Docs</button>
          <button className={`nav-drawer-item ${page === "help" ? "active" : ""}`} onClick={() => nav("help")}>Help</button>
          <button className={`nav-drawer-item ${page === "qa" ? "active" : ""}`} onClick={() => nav("qa")}>Q&amp;A</button>
          {privateAccess && <button className={`nav-drawer-item ${page === "myanalytics" ? "active" : ""}`} onClick={() => nav("myanalytics")}>MyAnalytics</button>}
          {privateAccess && <button className={`nav-drawer-item ${page === "admin" ? "active" : ""}`} onClick={() => nav("admin")}>Admin</button>}
          <button className={`nav-drawer-item ${page === "for-agents" ? "active" : ""}`} onClick={() => nav("for-agents")}>For Agents</button>
          <button className={`nav-drawer-item ${page === "examples" ? "active" : ""}`} onClick={() => nav("examples")}>Examples</button>
          <button className={`nav-drawer-item ${page === "install" ? "active" : ""}`} onClick={() => nav("install")}>Install</button>
        </nav>
      )}

      {/* Trust / privacy banner — always visible */}
      <div className="trust-banner" role="note" aria-label="Privacy and IP protection statement">
        <span className="trust-item"><strong>Snapshots are stored</strong> — they power re-runs and exports; delete anytime via the API (DELETE /v1/snapshots/:id)</span>
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
          {page === "myanalytics" && privateAccess && <MyAnalyticsPage />}
          {page === "admin" && privateAccess && <AdminPage />}
          {page === "programs" && <ProgramsPage onAnalyze={() => nav("upload")} />}
          {page === "terms" && <TermsPage />}
          {page === "for-agents" && <ForAgentsPage />}
          {page === "examples" && <ExamplesPage />}
          {page === "install" && <InstallPage />}
          {page === "paid-checkout" && <PaidCheckoutPage />}
          {page === "tools" && (
            <ToolsIndexPage
              onSelectTool={(toolId) => {
                if (toolId === "tools/web-research") nav("tool-web-research");
                else if (toolId === "tools/analyze") nav("upload");
                else if (toolId === "tools/list-programs") nav("programs");
                // Future tools: add cases here as their ToolPage instances ship.
              }}
            />
          )}
          {page === "tool-web-research" && <WebResearchPage onBack={() => nav("tools")} />}
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
