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
import { Icon } from "./components/Icon.tsx";
import { getAdminStats, migrateLegacyKey, logoutSession, type SnapshotResponse } from "./api.ts";
import { APP_VERSION } from "./version.ts";

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

// IDE-shell tab-strip metadata: which "system" a page belongs to (the mission
// breadcrumb) and its editor-tab label. Partial — missing keys fall back via ??.
const SECTION_OF: Partial<Record<Page, string>> = {
  upload: "MISSION", dashboard: "MISSION", tools: "MISSION", "tool-web-research": "MISSION", programs: "MISSION",
  plans: "ACCOUNT", account: "ACCOUNT", "paid-checkout": "ACCOUNT",
  docs: "REFERENCE", help: "REFERENCE", qa: "REFERENCE", terms: "REFERENCE",
  myanalytics: "OPS", admin: "OPS",
  "for-agents": "AGENTS", examples: "AGENTS", install: "AGENTS",
};
const LABEL_OF: Partial<Record<Page, string>> = {
  upload: "Analyze", dashboard: "dashboard.json", tools: "Tools", "tool-web-research": "web-research.tool", programs: "Programs",
  plans: "Plans", account: "Account", "paid-checkout": "Checkout",
  docs: "Docs", help: "Help", qa: "Q&A", terms: "Terms",
  myanalytics: "MyAnalytics", admin: "Admin",
  "for-agents": "For Agents", examples: "Examples", install: "Install",
};

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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

  const handleLogout = useCallback(() => {
    void logoutSession();                    // clear the HttpOnly axis_session cookie server-side
    localStorage.removeItem("axis_api_key"); // clear the session marker (and any legacy raw key)
    setLoggedIn(false);
    setPrivateAccess(false);
    nav("upload");
  }, [nav]);

  // One-time migration (H1 C2): a pre-cutover raw key in localStorage is exchanged for the
  // HttpOnly axis_session cookie and replaced by a non-sensitive marker, so the key stops
  // being XSS-readable. No-op once migrated or for cookie-only sessions.
  useEffect(() => {
    void migrateLegacyKey();
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
    if (loggedIn) {
      actions.push({ id: "logout", label: "Log out", icon: "", section: "Account", onSelect: handleLogout });
    }
    return actions;
  }, [result, nav, privateAccess, loggedIn, handleLogout]);

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

  const isLanding = page === "upload";

  return (
    <ToastProvider>
      <div className={`ide-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${isLanding ? "is-landing" : ""}`} data-shell-page={page}>

        {/* COLUMN 1 — activity rail */}
        <nav className="ide-rail" aria-label="Primary">
          <button className="ide-rail-btn" aria-label="Toggle Explorer sidebar" title="Toggle Explorer" aria-pressed={!sidebarCollapsed} onClick={() => setSidebarCollapsed((c) => !c)}><Icon name="panel-left" /></button>
          <button className={`ide-rail-btn ${page === "upload" ? "active" : ""}`} aria-label="Analyze" aria-current={page === "upload" ? "page" : undefined} title="Analyze" onClick={() => nav("upload")}><Icon name="scan" /></button>
          {result && <button className={`ide-rail-btn ${page === "dashboard" ? "active" : ""}`} aria-label="Dashboard" aria-current={page === "dashboard" ? "page" : undefined} title="Dashboard" onClick={() => nav("dashboard")}><Icon name="dashboard" /></button>}
          <button className={`ide-rail-btn ${page === "tools" || page.startsWith("tool-") ? "active" : ""}`} aria-label="Tools" aria-current={page === "tools" || page.startsWith("tool-") ? "page" : undefined} title="Tools" onClick={() => nav("tools")}><Icon name="wrench" /></button>
          <button className={`ide-rail-btn ${page === "programs" ? "active" : ""}`} aria-label="Programs" aria-current={page === "programs" ? "page" : undefined} title="Programs" onClick={() => nav("programs")}><Icon name="layers" /></button>
          <button className={`ide-rail-btn ${page === "account" ? "active" : ""}`} aria-label={loggedIn ? "Account" : "Sign Up"} aria-current={page === "account" ? "page" : undefined} title={loggedIn ? "Account" : "Sign Up"} onClick={() => nav("account")}><Icon name="user" /></button>
          <button className="ide-rail-btn" aria-label="Open command palette" title="Command Palette (Ctrl+K)" onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))}><Icon name="command" /></button>
          <div className="ide-rail-spacer" />
          <button className="ide-rail-btn" aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"} title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"} onClick={toggleTheme}><Icon name={theme === "light" ? "moon" : "sun"} /></button>
          {loggedIn && <button className="ide-rail-btn" aria-label="Log out" title="Log out of this browser session" onClick={handleLogout}><Icon name="log-out" /></button>}
          <button className="ide-rail-btn ide-rail-hamburger" aria-label={navOpen ? "Close menu" : "Open menu"} aria-expanded={navOpen} onClick={() => setNavOpen((o) => !o)}><Icon name={navOpen ? "x" : "menu"} /></button>
        </nav>

        {/* COLUMN 2 — file-tree sidebar */}
        <aside className="ide-sidebar" aria-label="Navigation">
          <div className="ide-sidebar-brand" onClick={handleReset} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleReset(); } }} role="button" tabIndex={0} title="Reset to Analyze">
            <span className="ide-sidebar-brand-name">Axis&apos; Iliad</span>
            <span className="badge badge-accent">v{APP_VERSION}</span>
          </div>
          <div className="ide-tree">
            <div className="ide-tree-group">WORKSPACE</div>
            <button className={`ide-tree-item ${page === "upload" ? "active" : ""}`} onClick={() => nav("upload")}><span className="ide-tree-ico"><Icon name="scan" /></span>Analyze</button>
            {result && <button className={`ide-tree-item ${page === "dashboard" ? "active" : ""}`} onClick={() => nav("dashboard")}><span className="ide-tree-ico"><Icon name="dashboard" /></span>Dashboard</button>}
            <button className={`ide-tree-item ${page === "tools" || page.startsWith("tool-") ? "active" : ""}`} onClick={() => nav("tools")}><span className="ide-tree-ico"><Icon name="wrench" /></span>Tools</button>
            <div className="ide-tree-group">LIBRARY</div>
            <button className={`ide-tree-item ${page === "programs" ? "active" : ""}`} onClick={() => nav("programs")}><span className="ide-tree-ico"><Icon name="layers" /></span>Programs</button>
            <button className={`ide-tree-item ${page === "examples" ? "active" : ""}`} onClick={() => nav("examples")}><span className="ide-tree-ico"><Icon name="grid" /></span>Examples</button>
            <button className={`ide-tree-item ${page === "plans" ? "active" : ""}`} onClick={() => nav("plans")}><span className="ide-tree-ico"><Icon name="credit-card" /></span>Plans</button>
            <div className="ide-tree-group">ACCOUNT</div>
            <button className={`ide-tree-item ${page === "account" ? "active" : ""}`} onClick={() => nav("account")}><span className="ide-tree-ico"><Icon name="user" /></span>{loggedIn ? "Account" : "Sign Up"}</button>
            {privateAccess && <button className={`ide-tree-item ${page === "myanalytics" ? "active" : ""}`} onClick={() => nav("myanalytics")}><span className="ide-tree-ico"><Icon name="bar-chart" /></span>MyAnalytics</button>}
            {privateAccess && <button className={`ide-tree-item ${page === "admin" ? "active" : ""}`} onClick={() => nav("admin")}><span className="ide-tree-ico"><Icon name="settings" /></span>Admin</button>}
            {loggedIn && <button className="ide-tree-item" onClick={handleLogout}><span className="ide-tree-ico"><Icon name="log-out" /></span>Log Out</button>}
            <div className="ide-tree-group">HELP</div>
            <button className={`ide-tree-item ${page === "docs" ? "active" : ""}`} onClick={() => nav("docs")}><span className="ide-tree-ico"><Icon name="book" /></span>Docs</button>
            <button className={`ide-tree-item ${page === "help" ? "active" : ""}`} onClick={() => nav("help")}><span className="ide-tree-ico"><Icon name="help" /></span>Help</button>
            <button className={`ide-tree-item ${page === "qa" ? "active" : ""}`} onClick={() => nav("qa")}><span className="ide-tree-ico"><Icon name="message" /></span>Q&amp;A</button>
            <button className={`ide-tree-item ${page === "for-agents" ? "active" : ""}`} onClick={() => nav("for-agents")}><span className="ide-tree-ico"><Icon name="bot" /></span>For Agents</button>
            <button className={`ide-tree-item ${page === "install" ? "active" : ""}`} onClick={() => nav("install")}><span className="ide-tree-ico"><Icon name="download" /></span>Install</button>
          </div>
        </aside>

        {/* COLUMN 3 / ROW 1 — editor tab strip + mission breadcrumb */}
        <div className="ide-tabstrip">
          <div className="ide-tab active">
            <span className="ide-tab-ico">●</span>
            <span className="ide-tab-label">{page === "account" ? (loggedIn ? "Account" : "Sign Up") : (LABEL_OF[page] ?? page)}</span>
          </div>
          <div className="ide-locator mono" aria-hidden>
            <span className="loc-sys">{SECTION_OF[page] ?? "SYSTEM"}</span>
            <span className="loc-sep">▸</span>
            <span className="loc-page">{(LABEL_OF[page] ?? page).toUpperCase()}</span>
          </div>
          <span className="ide-tel-dot" aria-hidden />
        </div>

        {/* COLUMN 3 / ROW 2 — main editor panel (only scroll region) */}
        <main className="ide-main">
          {isLanding && (
            <div className="trust-banner" role="note" aria-label="Privacy and IP protection statement">
              <span className="trust-item"><strong>Snapshots are stored</strong> — they power re-runs and exports; delete anytime via the API (DELETE /v1/snapshots/:id)</span>
              <span className="trust-sep">·</span>
              <span className="trust-item"><strong>Never used for AI training</strong></span>
              <span className="trust-sep">·</span>
              <span className="trust-item"><strong>Your IP is fully protected</strong></span>
            </div>
          )}

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

          <footer className="ide-footer">
            <p>
              © {new Date().getFullYear()} Last Man Up Inc. ·{" "}
              <button className="btn" style={{ padding: "0 4px", fontSize: "0.8rem", display: "inline" }} onClick={() => nav("terms")}>Terms of Service</button>
              {" "} · {" "}
              <a href="mailto:support@jonathanarvay.com">support@jonathanarvay.com</a>
            </p>
          </footer>
        </main>

        {/* Mobile off-canvas drawer — reuses existing classes + state */}
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
            {loggedIn && <button className="nav-drawer-item" onClick={handleLogout}>Log Out</button>}
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
      </div>

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
