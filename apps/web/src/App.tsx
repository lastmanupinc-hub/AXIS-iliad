import { useState, useCallback, useEffect, useMemo, Fragment, Component, type ReactNode } from "react";
import { ToastProvider } from "./components/Toast.tsx";
import { CommandPalette, type PaletteAction } from "./components/CommandPalette.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { SignUpModal, type SignUpTrigger } from "./components/SignUpModal.tsx";
import { Icon } from "./components/Icon.tsx";
import { PageFooter } from "./components/primitives/PageFooter.tsx";
import { getAdminStats, migrateLegacyKey, logoutSession, getProjectContext, getGeneratedFiles, rememberReturnTo, consumeReturnTo, ApiError, type SnapshotResponse } from "./api.ts";
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
  hashForPage,
  matchHash,
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

/** Which contextual copy the sign-in popup should show for a given auth-only
 *  destination (WO-P2) — plan/checkout pages get the upgrade framing,
 *  everything else gets the generic sign-in framing. */
function triggerForPage(page: PageId): SignUpTrigger {
  return page === "plans" || page === "paid-checkout" ? "paid-program" : "generic";
}

// ─── Multi-project state (WO-F3) ────────────────────────────────
// The server is the source of truth for signed-in users: localStorage keeps
// only the last project id (`axis_last_project_id`) and the dashboard is
// rebuilt from GET /v1/projects/:id/context + /generated-files. Anonymous
// analyses have no account to restore from, so they keep a client-side blob
// in the anon-results cache (`axis_anon_result`). The pre-WO-F3 single blob
// (`axis_last_result`) is migrated on first load.

const LAST_PROJECT_KEY = "axis_last_project_id";
const ANON_RESULT_KEY = "axis_anon_result";
const LEGACY_RESULT_KEY = "axis_last_result";

interface PersistedState {
  result: SnapshotResponse | null;
  projectId: string | null;
}

function loadPersistedState(): PersistedState {
  // One-time migration of the legacy single-result blob: signed-in users keep
  // only the project id (server restores the rest); signed-out blobs were
  // anon-created and move to the anon cache.
  try {
    const legacy = localStorage.getItem(LEGACY_RESULT_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as SnapshotResponse;
      localStorage.removeItem(LEGACY_RESULT_KEY);
      if (hasApiKey() && parsed.project_id) {
        localStorage.setItem(LAST_PROJECT_KEY, parsed.project_id);
      } else {
        localStorage.setItem(ANON_RESULT_KEY, legacy);
      }
      return { result: parsed, projectId: parsed.project_id ?? null };
    }
  } catch { localStorage.removeItem(LEGACY_RESULT_KEY); /* corrupt blob */ }

  // Steady state: the anon cache blob wins (it is always the most recent anon
  // analysis — a signed-in analysis clears it), else the last-project pointer.
  try {
    const anon = localStorage.getItem(ANON_RESULT_KEY);
    if (anon) {
      const parsed = JSON.parse(anon) as SnapshotResponse;
      return { result: parsed, projectId: parsed.project_id ?? null };
    }
  } catch { localStorage.removeItem(ANON_RESULT_KEY); /* corrupt blob */ }

  return { result: null, projectId: localStorage.getItem(LAST_PROJECT_KEY) };
}

export function App() {
  const { route, navigate } = useHashRoute();
  // Single lazy read so the legacy migration runs exactly once per mount.
  const [initialState] = useState(loadPersistedState);
  const [result, setResult] = useState<SnapshotResponse | null>(initialState.result);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(initialState.projectId);
  const [restoring, setRestoring] = useState(false);
  const [generatedFileCount, setGeneratedFileCount] = useState(0);
  const [showSignUp, setShowSignUp] = useState(false);
  const [signUpTrigger, setSignUpTrigger] = useState<SignUpTrigger>("generic");
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

  /** Open the sign-in popup and remember the hash to return to once it
   *  succeeds (WO-P2) — "Sign in" isn't always headed to Account; the popup
   *  should hand the user back whatever they were doing: a specific
   *  auth-only destination for a nav click/deep link, or wherever they
   *  already were for a page-agnostic nudge (e.g. the guest-project banner).
   *  Survives the OAuth round trip via sessionStorage (api.ts) since that
   *  flow leaves the SPA entirely — see AccountPage.tsx's finishAuthAndReload. */
  const openSignUp = useCallback((page: PageId, params: RouteParams, trigger: SignUpTrigger) => {
    rememberReturnTo(hashForPage(page, params));
    setSignUpTrigger(trigger);
    setShowSignUp(true);
  }, []);

  /** Navigate with the login gate applied: a login-gated page while signed out
   *  opens the sign-in popup (remembering that destination) and stays put. */
  const nav = useCallback((p: PageId, params?: RouteParams) => {
    if (AUTH_ONLY_PAGES.has(p) && !hasApiKey()) {
      openSignUp(p, params ?? {}, triggerForPage(p));
      setNavOpen(false);
      return;
    }
    navigate(p, params);
    setNavOpen(false);
  }, [navigate, openSignUp]);

  // H9 (WO-P1, build plan §3 WO-P1 "Login-gate change"): anonymous analyses
  // complete and display their free-program results immediately — the
  // backend already allows this (POST /v1/analyze, /v1/github/analyze, and
  // /v1/snapshots all run anon requests to completion). The SignUpModal no
  // longer intercepts a successful result; the signup nudge instead lives at
  // the point of value (the "You're browsing as a guest" banner routes.tsx
  // renders on the dashboard route for anon results).
  const handleAnalyzeComplete = useCallback((data: SnapshotResponse) => {
    const isLoggedIn = !!localStorage.getItem("axis_api_key");
    setResult(data);
    setCurrentProjectId(data.project_id);
    setGeneratedFileCount(data.generated_files.length);
    if (isLoggedIn) {
      // Server is the source of truth for signed-in analyses: persist only the
      // project id. A fresh owned analysis supersedes any cached anon result.
      try { localStorage.setItem(LAST_PROJECT_KEY, data.project_id); } catch { /* quota exceeded, non-fatal */ }
      localStorage.removeItem(ANON_RESULT_KEY);
    } else {
      // No account owns an anonymous snapshot — it lives client-side only.
      try { localStorage.setItem(ANON_RESULT_KEY, JSON.stringify(data)); } catch { /* quota exceeded, non-fatal */ }
    }
    navigate("dashboard");
  }, [navigate]);

  // WO-P3: open a project from the Account Dashboard's recent-projects cards.
  // Clears any stale in-memory result and points multi-project state at the
  // requested project, then lands on "dashboard" — its existing deep-link
  // restore effect below (built for the last-project pointer, WO-F3) already
  // re-fetches from the server whenever `result` is falsy, so it fires again
  // here for free with no changes to that effect's own logic.
  const handleOpenProject = useCallback((projectId: string) => {
    setResult(null);
    setCurrentProjectId(projectId);
    if (hasApiKey()) {
      try { localStorage.setItem(LAST_PROJECT_KEY, projectId); } catch { /* quota exceeded, non-fatal */ }
    }
    localStorage.removeItem(ANON_RESULT_KEY); // opening a named project supersedes any anon cache
    navigate("dashboard");
  }, [navigate]);

  const handleReset = useCallback(() => {
    setResult(null);
    setCurrentProjectId(null);
    setGeneratedFileCount(0);
    localStorage.removeItem(LAST_PROJECT_KEY);
    localStorage.removeItem(ANON_RESULT_KEY);
    localStorage.removeItem(LEGACY_RESULT_KEY);
    nav("analyze");
  }, [nav]);

  const [loggedIn, setLoggedIn] = useState(!!localStorage.getItem("axis_api_key"));
  const [privateAccess, setPrivateAccess] = useState(false);

  const handleAuthChange = useCallback(() => {
    setLoggedIn(!!localStorage.getItem("axis_api_key"));
  }, []);

  const handleLogout = useCallback(() => {
    void logoutSession();                    // clear the HttpOnly axis_session cookie server-side
    localStorage.removeItem("axis_api_key"); // clear the session marker (and any legacy raw key)
    localStorage.removeItem(LAST_PROJECT_KEY); // account-scoped pointer — useless without the session
    setLoggedIn(false);
    setPrivateAccess(false);
    nav("home");
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

  // Dashboard needs a result: rebuild it on deep link — anon cache first
  // (client-only by design), else from the server via the last-project pointer
  // (GET /v1/projects/:id/context + /generated-files), else fall back to
  // Analyze (a known route with nothing to show is not a 404).
  useEffect(() => {
    if (route.page !== "dashboard" || result) return;

    try {
      const anon = localStorage.getItem(ANON_RESULT_KEY);
      if (anon) {
        setResult(JSON.parse(anon) as SnapshotResponse);
        return;
      }
    } catch { localStorage.removeItem(ANON_RESULT_KEY); /* corrupt blob */ }

    const projectId = currentProjectId ?? localStorage.getItem(LAST_PROJECT_KEY);
    if (!projectId || !hasApiKey()) {
      navigate("analyze");
      return;
    }

    let cancelled = false;
    setRestoring(true);
    void (async () => {
      try {
        const [ctx, generated] = await Promise.all([
          getProjectContext(projectId),
          getGeneratedFiles(projectId),
        ]);
        if (cancelled) return;
        setResult({
          snapshot_id: ctx.snapshot_id,
          project_id: projectId,
          status: "complete",
          context_map: ctx.context_map,
          repo_profile: ctx.repo_profile,
          generated_files: generated.files,
        });
        setCurrentProjectId(projectId);
        setGeneratedFileCount(generated.files.length);
      } catch (err) {
        if (cancelled) return;
        // Drop the pointer only when the server said no (gone/unauthorized);
        // keep it through transient network failures.
        if (err instanceof ApiError && [401, 403, 404].includes(err.status)) {
          localStorage.removeItem(LAST_PROJECT_KEY);
          setCurrentProjectId(null);
        }
        navigate("analyze");
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => { cancelled = true; };
  }, [route.page, result, currentProjectId, navigate]);

  // Login gate: a signed-out user on any login-gated page (`authOnly` in the
  // route table) gets the sign-in popup and is bounced to a public page —
  // EXCEPT during the OAuth callback, which must reach /account to complete
  // the handoff.
  useEffect(() => {
    if (AUTH_ONLY_PAGES.has(route.page) && !loggedIn && !isOAuthCallback()) {
      openSignUp(route.page, route.params, triggerForPage(route.page));
      navigate("home");
    }
  }, [route.page, route.params, loggedIn, navigate, openSignUp]);

  // Admin gate: a signed-in but non-admin user on an `adminOnly` page falls
  // back to their account page (accessible once logged in). Signed-out users
  // are handled by the login gate above.
  useEffect(() => {
    if (routeForPage(route.page).adminOnly && loggedIn && !privateAccess) {
      navigate("account");
    }
  }, [route.page, privateAccess, loggedIn, navigate]);

  // H9: signup no longer has a pending analysis to reconcile — a completed
  // analysis is already shown (handleAnalyzeComplete runs regardless of login
  // state). Signing up from the guest banner just closes the popup; it does
  // NOT retroactively attach the current anon snapshot to the new account
  // (no such API exists) — the banner's copy promises future saved projects,
  // not that this one becomes owned.
  const handleSignUpSuccess = useCallback(() => {
    setShowSignUp(false);
    setLoggedIn(true);
    // WO-P2: hand the user back to whatever triggered sign-in — never a
    // blind default to Account. (The OAuth round trip resolves the same
    // recorded hash one layer down — see AccountPage.tsx's finishAuthAndReload.)
    const pending = consumeReturnTo();
    const match = pending ? matchHash(pending) : null;
    if (match) navigate(match.route.page, match.params);
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
  const isLanding = route.page === "home" || route.page === "analyze";

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
    currentProjectId,
    restoring,
    navigate: nav,
    // Page-agnostic nudge (e.g. the guest-project banner): no specific
    // destination, so it returns to wherever this was called from.
    requireLogin: (trigger) => openSignUp(route.page, route.params, trigger ?? "generic"),
    onAnalyzeComplete: handleAnalyzeComplete,
    onGeneratedCountChange: handleGeneratedCountChange,
    onAuthChange: handleAuthChange,
    onOpenProject: handleOpenProject,
  }), [navCtx, route.page, route.params, route.hash, result, currentProjectId, restoring, nav, openSignUp, handleAnalyzeComplete, handleGeneratedCountChange, handleAuthChange, handleOpenProject]);

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

          {/* WO-F4: shell-owned footer on every page, above the StatusBar. */}
          <PageFooter onNavigate={nav} />
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
          trigger={signUpTrigger}
          onSuccess={handleSignUpSuccess}
          onClose={() => setShowSignUp(false)}
          allowClose={true}
        />
      )}
    </ToastProvider>
  );
}
