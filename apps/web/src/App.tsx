import { useState, useCallback, useEffect, useRef, useMemo, Fragment, Component, type ReactNode } from "react";
import { ToastProvider } from "./components/Toast.tsx";
import { CommandPalette, type PaletteAction } from "./components/CommandPalette.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { SignUpModal } from "./components/SignUpModal.tsx";
import { Icon } from "./components/Icon.tsx";
import { getAdminStats, migrateLegacyKey, logoutSession, type SnapshotResponse } from "./api.ts";
import { APP_VERSION } from "./version.ts";
import {
  ROUTES,
  NAV_GROUPS,
  AUTH_ONLY_PAGES,
  routeForPage,
  isRouteVisible,
  navLabelFor,
  tabLabelFor,
  ownsShortcut,
  routeForShortcut,
  visibleRailRoutes,
  visibleGroupRoutes,
  type NavContext,
  type PageId,
  type RouteContext,
  type RouteDef,
  type RouteParams,
} from "./routes.tsx";
import { useHashRoute, isOAuthCallback } from "./useHashRoute.ts";

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

// ─── Shell ──────────────────────────────────────────────────────
// All navigation metadata (pages, hash patterns, labels, sections, sidebar
// groups, shortcuts, auth flags) lives in routes.tsx — the shell below only
// derives from it. Adding a page = one entry in ROUTES.

function hasApiKey(): boolean {
  return !!localStorage.getItem("axis_api_key");
}

function loadPersistedResult(): SnapshotResponse | null {
  try {
    const raw = localStorage.getItem("axis_last_result");
    if (raw) return JSON.parse(raw) as SnapshotResponse;
  } catch { /* corrupt data, ignore */ }
  return null;
}

export function App() {
  const { route, navigate } = useHashRoute();
  const [result, setResult] = useState<SnapshotResponse | null>(loadPersistedResult);
  const [generatedFileCount, setGeneratedFileCount] = useState(0);
  const [showSignUp, setShowSignUp] = useState(false);
  const pendingResultRef = useRef<SnapshotResponse | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Theme: OS preference by default (theme.css media query); the toggle sets an
  // explicit data-theme override, persisted to localStorage. `theme` always holds
  // the EFFECTIVE theme so the rail icon/label stay accurate either way.
  const [themeOverride, setThemeOverride] = useState<boolean>(() => {
    const stored = localStorage.getItem("axis_theme");
    return stored === "light" || stored === "dark";
  });
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const stored = localStorage.getItem("axis_theme");
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    if (themeOverride) {
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem("axis_theme", theme);
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.removeItem("axis_theme");
    }
  }, [theme, themeOverride]);

  // While following the OS, track live preference changes.
  useEffect(() => {
    if (themeOverride) return;
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const sync = () => setTheme(mq.matches ? "dark" : "light");
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [themeOverride]);

  function toggleTheme() {
    setThemeOverride(true);
    setTheme((t) => (t === "light" ? "dark" : "light"));
  }

  /** Navigate with the login gate applied: a login-gated page while signed out
   *  opens the sign-in popup and stays put. */
  const nav = useCallback((p: PageId, params?: RouteParams) => {
    if (AUTH_ONLY_PAGES.has(p) && !hasApiKey()) {
      setShowSignUp(true);
      setNavOpen(false);
      return;
    }
    navigate(p, params);
    setNavOpen(false);
  }, [navigate]);

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
    navigate("dashboard");
  }, [navigate]);

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

  // Dashboard needs a result: restore the persisted one on deep link, else
  // fall back to Analyze (a known route with nothing to show is not a 404).
  useEffect(() => {
    if (route.page !== "dashboard" || result) return;
    const restored = loadPersistedResult();
    if (restored) setResult(restored);
    else navigate("upload");
  }, [route.page, result, navigate]);

  // Login gate: a signed-out user on any login-gated page (`authOnly` in the
  // route table) gets the sign-in popup and is bounced to a public page —
  // EXCEPT during the OAuth callback, which must reach /account to complete
  // the handoff.
  useEffect(() => {
    if (AUTH_ONLY_PAGES.has(route.page) && !loggedIn && !isOAuthCallback()) {
      setShowSignUp(true);
      navigate("upload");
    }
  }, [route.page, loggedIn, navigate]);

  // Admin gate: a signed-in but non-admin user on an `adminOnly` page falls
  // back to their account page (accessible once logged in). Signed-out users
  // are handled by the login gate above.
  useEffect(() => {
    if (routeForPage(route.page).adminOnly && loggedIn && !privateAccess) {
      navigate("account");
    }
  }, [route.page, privateAccess, loggedIn, navigate]);

  const handleSignUpSuccess = useCallback(() => {
    setShowSignUp(false);
    setLoggedIn(true);
    if (pendingResultRef.current) {
      const data = pendingResultRef.current;
      pendingResultRef.current = null;
      setResult(data);
      try { localStorage.setItem("axis_last_result", JSON.stringify(data)); } catch { /* quota exceeded, non-fatal */ }
      setGeneratedFileCount(data.generated_files.length);
      navigate("dashboard");
    }
  }, [navigate]);

  // Track generated file count from DashboardPage
  const handleGeneratedCountChange = useCallback((count: number) => {
    setGeneratedFileCount(count);
  }, []);

  // Runtime context the route-table derivations depend on.
  const navCtx = useMemo<NavContext>(
    () => ({ loggedIn, privateAccess, hasResult: !!result }),
    [loggedIn, privateAccess, result],
  );

  // Command palette actions — every visible nav route, with the live Ctrl+N
  // hint on the route that currently owns each digit.
  const paletteActions = useMemo<PaletteAction[]>(() => {
    const actions: PaletteAction[] = ROUTES
      .filter((r) => r.nav !== undefined && isRouteVisible(r, navCtx))
      .map((r) => ({
        id: `nav-${r.page}`,
        label: `Go to ${navLabelFor(r, navCtx)}`,
        icon: "",
        ...(ownsShortcut(r, navCtx) ? { shortcut: `Ctrl+${r.shortcut}` } : {}),
        section: "Navigation",
        onSelect: () => nav(r.page),
      }));
    if (loggedIn) {
      actions.push({ id: "logout", label: "Log out", icon: "", section: "Account", onSelect: handleLogout });
    }
    return actions;
  }, [navCtx, nav, loggedIn, handleLogout]);

  // Ctrl+1–9 shortcuts — resolved from the route table (first visible claimant
  // of each digit wins, so Ctrl+2 is Dashboard with a result, Programs without).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (!/^[1-9]$/.test(e.key)) return;
      const target = routeForShortcut(Number(e.key), navCtx);
      if (target) {
        e.preventDefault();
        nav(target.page);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [nav, navCtx]);

  const activeDef = routeForPage(route.page);
  const isLanding = route.page === "upload";

  /** A nav item is active for its own page and for its child pages
   *  (e.g. Tools stays lit on #tools/web-research). */
  const isActive = useCallback(
    (r: RouteDef) => route.page === r.page || routeForPage(route.page).parent === r.page,
    [route.page],
  );

  // Everything a route's render function may need from the shell.
  const routeCtx = useMemo<RouteContext>(() => ({
    ...navCtx,
    params: route.params,
    hash: route.hash,
    result,
    navigate: nav,
    requireLogin: () => setShowSignUp(true),
    onUploadComplete: handleUploadComplete,
    onGeneratedCountChange: handleGeneratedCountChange,
    onAuthChange: handleAuthChange,
  }), [navCtx, route.params, route.hash, result, nav, handleUploadComplete, handleGeneratedCountChange, handleAuthChange]);

  return (
    <ToastProvider>
      <div className={`ide-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${isLanding ? "is-landing" : ""}`} data-shell-page={route.page}>

        {/* COLUMN 1 — activity rail (route-table derived) */}
        <nav className="ide-rail" aria-label="Primary">
          <button className="ide-rail-btn" aria-label="Toggle Explorer sidebar" title="Toggle Explorer" aria-pressed={!sidebarCollapsed} onClick={() => setSidebarCollapsed((c) => !c)}><Icon name="panel-left" /></button>
          {visibleRailRoutes(navCtx).map((r) => (
            <button
              key={r.page}
              className={`ide-rail-btn ${isActive(r) ? "active" : ""}`}
              aria-label={navLabelFor(r, navCtx)}
              aria-current={isActive(r) ? "page" : undefined}
              title={navLabelFor(r, navCtx)}
              onClick={() => nav(r.page)}
            >
              <Icon name={r.nav.icon} />
            </button>
          ))}
          <button className="ide-rail-btn" aria-label="Open command palette" title="Command Palette (Ctrl+K)" onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))}><Icon name="command" /></button>
          <div className="ide-rail-spacer" />
          <button className="ide-rail-btn" aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"} title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"} onClick={toggleTheme}><Icon name={theme === "light" ? "moon" : "sun"} /></button>
          {loggedIn && <button className="ide-rail-btn" aria-label="Log out" title="Log out of this browser session" onClick={handleLogout}><Icon name="log-out" /></button>}
          <button className="ide-rail-btn ide-rail-hamburger" aria-label={navOpen ? "Close menu" : "Open menu"} aria-expanded={navOpen} onClick={() => setNavOpen((o) => !o)}><Icon name={navOpen ? "x" : "menu"} /></button>
        </nav>

        {/* COLUMN 2 — file-tree sidebar (route-table derived) */}
        <aside className="ide-sidebar" aria-label="Navigation">
          <div className="ide-sidebar-brand" onClick={handleReset} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleReset(); } }} role="button" tabIndex={0} title="Reset to Analyze">
            <span className="ide-sidebar-brand-name">Axis&apos; Iliad</span>
            <span className="badge badge-accent">v{APP_VERSION}</span>
          </div>
          <div className="ide-tree">
            {NAV_GROUPS.map((group) => (
              <Fragment key={group}>
                <div className="ide-tree-group">{group}</div>
                {visibleGroupRoutes(group, navCtx).map((r) => (
                  <button key={r.page} className={`ide-tree-item ${isActive(r) ? "active" : ""}`} onClick={() => nav(r.page)}>
                    <span className="ide-tree-ico"><Icon name={r.nav.icon} /></span>{navLabelFor(r, navCtx)}
                  </button>
                ))}
                {group === "ACCOUNT" && loggedIn && (
                  <button className="ide-tree-item" onClick={handleLogout}><span className="ide-tree-ico"><Icon name="log-out" /></span>Log Out</button>
                )}
              </Fragment>
            ))}
          </div>
        </aside>

        {/* COLUMN 3 / ROW 1 — editor tab strip + mission breadcrumb */}
        <div className="ide-tabstrip">
          <div className="ide-tab active">
            <span className="ide-tab-ico">●</span>
            <span className="ide-tab-label">{tabLabelFor(activeDef, navCtx)}</span>
          </div>
          <div className="ide-locator mono" aria-hidden>
            <span className="loc-sys">{activeDef.section}</span>
            <span className="loc-sep">▸</span>
            <span className="loc-page">{tabLabelFor(activeDef, navCtx).toUpperCase()}</span>
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
            <div key={route.key} className="page-enter">
              {activeDef.render(routeCtx)}
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

        {/* Mobile off-canvas drawer — same route-table groups, flattened */}
        {navOpen && (
          <nav className="nav-mobile-drawer" onClick={() => setNavOpen(false)}>
            {NAV_GROUPS.map((group) => (
              <Fragment key={group}>
                {visibleGroupRoutes(group, navCtx).map((r) => (
                  <button key={r.page} className={`nav-drawer-item ${isActive(r) ? "active" : ""}`} onClick={() => nav(r.page)}>
                    {navLabelFor(r, navCtx)}
                  </button>
                ))}
                {group === "ACCOUNT" && loggedIn && (
                  <button className="nav-drawer-item" onClick={handleLogout}>Log Out</button>
                )}
              </Fragment>
            ))}
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
