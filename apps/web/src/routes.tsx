import type { ReactNode } from "react";
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
import { NotFoundPage, type NotFoundDestination } from "./pages/NotFoundPage.tsx";
import type { SnapshotResponse } from "./api.ts";

// ─── routes.tsx — the single source of truth for navigation (WO-F2) ─────────
//
// Every page is ONE entry in ROUTES: hash pattern, page id, labels, breadcrumb
// section, auth gating, sidebar/rail placement, Ctrl+N shortcut, pathname
// aliases, and the render function. App.tsx derives ALL nav plumbing from this
// table (sidebar tree, mobile drawer, activity rail, tab strip, command-palette
// actions, keyboard shortcuts, auth gates, hash parsing) — adding a page means
// adding an entry here, nothing else.
//
// Pattern syntax (the params parser): "/"-separated segments. ":name" captures
// one segment into params (decodeURIComponent'd) — e.g. "projects/:id" matches
// "#projects/abc123" with { id: "abc123" }. A trailing ":name?" segment is
// optional — e.g. "run/:program?". "" is the home pattern. An unknown hash
// matches nothing and renders the not-found route (404) — never a silent
// fallback to the landing page.

export type PageId =
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
  // Sub-tool pages — each a click-driven console for a single backend capability.
  // Hash format: "#tools/web-research".
  | "tool-web-research"
  | "not-found";

export type RouteParams = Record<string, string>;

/** Runtime state the nav derivations depend on (visibility, labels, shortcuts). */
export interface NavContext {
  loggedIn: boolean;
  privateAccess: boolean;
  hasResult: boolean;
}

/** Everything a route's render function may need from the app shell. */
export interface RouteContext extends NavContext {
  /** Params captured from the hash pattern (e.g. { id } for "projects/:id"). */
  params: RouteParams;
  /** Raw hash (without "#") that produced the current route — 404 reporting. */
  hash: string;
  result: SnapshotResponse | null;
  navigate: (page: PageId, params?: RouteParams) => void;
  /** Open the sign-in popup without navigating. */
  requireLogin: () => void;
  onUploadComplete: (data: SnapshotResponse) => void;
  onGeneratedCountChange: (count: number) => void;
  onAuthChange: () => void;
}

export type NavGroup = "WORKSPACE" | "LIBRARY" | "ACCOUNT" | "HELP";
export const NAV_GROUPS: readonly NavGroup[] = ["WORKSPACE", "LIBRARY", "ACCOUNT", "HELP"];

export interface NavEntry {
  /** Sidebar tree / mobile drawer group this page is listed under. */
  group: NavGroup;
  /** Icon name (a components/Icon.tsx PATHS key). */
  icon: string;
  /** Also pinned to the icon-only activity rail. */
  rail?: boolean;
}

export interface RouteDef {
  page: PageId;
  /**
   * Hash pattern without the leading "#" ("" = home). null = not addressable
   * by hash (only the not-found fallback route uses this).
   */
  pattern: string | null;
  /** Human nav label (sidebar, drawer, rail, palette). */
  label: string;
  /** Label swap while signed out (e.g. Account → "Sign Up"). */
  labelLoggedOut?: string;
  /** IDE tab-strip label when it differs from `label` (e.g. "dashboard.json"). */
  tabLabel?: string;
  /** Mission-breadcrumb system shown in the tab strip locator. */
  section: "MISSION" | "ACCOUNT" | "REFERENCE" | "OPS" | "AGENTS" | "SYSTEM";
  /** Reachable only after login — a logged-out hit opens the sign-in popup. */
  authOnly?: boolean;
  /** Additionally requires the admin probe (privateAccess) to succeed. */
  adminOnly?: boolean;
  /** Runtime visibility for nav/shortcuts/palette (default: always visible). */
  visible?: (ctx: NavContext) => boolean;
  /** Sidebar/drawer/rail placement; omit for footer-only or child pages. */
  nav?: NavEntry;
  /**
   * Ctrl+N shortcut digit. Two routes may claim the same digit when their
   * `visible` conditions are mutually exclusive in priority order — the first
   * visible claimant in table order owns the key (Ctrl+2 = Dashboard when a
   * result exists, Programs otherwise, per the HelpPage shortcut table).
   */
  shortcut?: number;
  /** Pathname aliases kept for marketing/SEO URLs (e.g. "/pricing"). */
  aliases?: string[];
  /** Nav item that stays highlighted while this page is active (sub-pages). */
  parent?: PageId;
  render: (ctx: RouteContext) => ReactNode;
}

export const ROUTES: RouteDef[] = [
  {
    page: "upload",
    pattern: "",
    label: "Analyze",
    section: "MISSION",
    shortcut: 1,
    nav: { group: "WORKSPACE", icon: "scan", rail: true },
    render: (ctx) => <UploadPage onComplete={ctx.onUploadComplete} />,
  },
  {
    page: "dashboard",
    pattern: "dashboard",
    label: "Dashboard",
    tabLabel: "dashboard.json",
    section: "MISSION",
    shortcut: 2,
    visible: (ctx) => ctx.hasResult,
    nav: { group: "WORKSPACE", icon: "dashboard", rail: true },
    render: (ctx) =>
      ctx.result ? <DashboardPage result={ctx.result} onGeneratedCountChange={ctx.onGeneratedCountChange} /> : null,
  },
  {
    page: "tools",
    pattern: "tools",
    label: "Tools",
    section: "MISSION",
    aliases: ["/tools"],
    nav: { group: "WORKSPACE", icon: "wrench", rail: true },
    render: (ctx) => (
      <ToolsIndexPage
        onSelectTool={(toolId) => {
          if (toolId === "tools/web-research") ctx.navigate("tool-web-research");
          else if (toolId === "tools/analyze") ctx.navigate("upload");
          else if (toolId === "tools/list-programs") ctx.navigate("programs");
          // Future tools: add cases here as their ToolPage instances ship.
        }}
      />
    ),
  },
  {
    page: "tool-web-research",
    pattern: "tools/web-research",
    label: "Web Research",
    tabLabel: "web-research.tool",
    section: "MISSION",
    parent: "tools",
    aliases: ["/tools/web-research"],
    render: (ctx) => <WebResearchPage onBack={() => ctx.navigate("tools")} />,
  },
  {
    page: "programs",
    pattern: "programs",
    label: "Programs",
    section: "MISSION",
    shortcut: 2, // fallback owner of Ctrl+2 while Dashboard is hidden (no result)
    aliases: ["/programs"],
    nav: { group: "LIBRARY", icon: "layers", rail: true },
    render: (ctx) => <ProgramsPage onAnalyze={() => ctx.navigate("upload")} />,
  },
  {
    page: "examples",
    pattern: "examples",
    label: "Examples",
    section: "AGENTS",
    nav: { group: "LIBRARY", icon: "grid" },
    render: () => <ExamplesPage />,
  },
  {
    page: "plans",
    pattern: "plans",
    label: "Plans",
    section: "ACCOUNT",
    shortcut: 3,
    authOnly: true,
    aliases: ["/pricing", "/plans"],
    nav: { group: "LIBRARY", icon: "credit-card" },
    render: (ctx) => <PlansPage onSelectPlan={() => ctx.navigate("account")} onRequireLogin={ctx.requireLogin} />,
  },
  {
    page: "account",
    pattern: "account",
    label: "Account",
    labelLoggedOut: "Sign Up",
    section: "ACCOUNT",
    shortcut: 4,
    authOnly: true,
    aliases: ["/account"],
    nav: { group: "ACCOUNT", icon: "user", rail: true },
    render: (ctx) => <AccountPage onAuthChange={ctx.onAuthChange} />,
  },
  {
    page: "myanalytics",
    pattern: "myanalytics",
    label: "MyAnalytics",
    section: "OPS",
    shortcut: 9,
    authOnly: true,
    adminOnly: true,
    visible: (ctx) => ctx.privateAccess,
    nav: { group: "ACCOUNT", icon: "bar-chart" },
    render: (ctx) => (ctx.privateAccess ? <MyAnalyticsPage /> : null),
  },
  {
    page: "admin",
    pattern: "admin",
    label: "Admin",
    section: "OPS",
    shortcut: 8,
    authOnly: true,
    adminOnly: true,
    visible: (ctx) => ctx.privateAccess,
    nav: { group: "ACCOUNT", icon: "settings" },
    render: (ctx) => (ctx.privateAccess ? <AdminPage /> : null),
  },
  {
    page: "docs",
    pattern: "docs",
    label: "Docs",
    section: "REFERENCE",
    shortcut: 5,
    aliases: ["/docs"],
    nav: { group: "HELP", icon: "book" },
    render: () => <DocsPage />,
  },
  {
    page: "help",
    pattern: "help",
    label: "Help",
    section: "REFERENCE",
    shortcut: 6,
    nav: { group: "HELP", icon: "help" },
    render: () => <HelpPage />,
  },
  {
    page: "qa",
    pattern: "qa",
    label: "Q&A",
    section: "REFERENCE",
    shortcut: 7,
    nav: { group: "HELP", icon: "message" },
    render: () => <QAPage />,
  },
  {
    page: "for-agents",
    pattern: "for-agents",
    label: "For Agents",
    section: "AGENTS",
    aliases: ["/for-agents", "/mcp"],
    nav: { group: "HELP", icon: "bot" },
    render: () => <ForAgentsPage />,
  },
  {
    page: "install",
    pattern: "install",
    label: "Install",
    section: "AGENTS",
    aliases: ["/install"],
    nav: { group: "HELP", icon: "download" },
    render: () => <InstallPage />,
  },
  {
    page: "terms",
    pattern: "terms",
    label: "Terms",
    section: "REFERENCE",
    // Footer-only — deliberately absent from the sidebar/drawer/rail.
    render: () => <TermsPage />,
  },
  {
    page: "paid-checkout",
    pattern: "paid-checkout",
    label: "Checkout",
    section: "ACCOUNT",
    authOnly: true,
    aliases: ["/paid-checkout"],
    render: () => <PaidCheckoutPage />,
  },
  {
    page: "not-found",
    pattern: null, // fallback route — reached only when no pattern matches
    label: "404",
    section: "SYSTEM",
    render: (ctx) => <NotFoundPage badHash={ctx.hash} destinations={notFoundDestinations()} onNavigate={ctx.navigate} />,
  },
];

// ─── Derived lookups ─────────────────────────────────────────────────────────

const BY_PAGE = new Map<PageId, RouteDef>(ROUTES.map((r) => [r.page, r]));
const NOT_FOUND = BY_PAGE.get("not-found")!;

/** Pages reachable only after login — derived from `authOnly` flags. */
export const AUTH_ONLY_PAGES: ReadonlySet<PageId> = new Set(ROUTES.filter((r) => r.authOnly).map((r) => r.page));

export function routeForPage(page: PageId): RouteDef {
  return BY_PAGE.get(page) ?? NOT_FOUND;
}

// ─── Pattern matching (the params parser) ────────────────────────────────────

/**
 * Match one hash path against one pattern. Returns captured params on match
 * (an empty object for static patterns), or null on mismatch.
 */
export function matchPattern(pattern: string, hash: string): RouteParams | null {
  const patternSegs = pattern === "" ? [] : pattern.split("/");
  const hashSegs = hash === "" ? [] : hash.split("/");
  if (hashSegs.length > patternSegs.length) return null;
  const params: RouteParams = {};
  for (let i = 0; i < patternSegs.length; i++) {
    const seg = patternSegs[i];
    const isParam = seg.startsWith(":");
    const isOptional = isParam && seg.endsWith("?");
    const value = hashSegs[i];
    if (value === undefined || value === "") {
      if (isOptional) continue; // trailing optional segment may be absent
      return null;
    }
    if (isParam) {
      const name = seg.slice(1, isOptional ? -1 : undefined);
      try {
        params[name] = decodeURIComponent(value);
      } catch {
        params[name] = value; // malformed escape — keep the raw segment
      }
    } else if (seg !== value) {
      return null;
    }
  }
  return params;
}

export interface RouteMatch {
  route: RouteDef;
  params: RouteParams;
}

/** Resolve a raw location.hash (leading "#" and trailing "/" tolerated). */
export function matchHash(rawHash: string): RouteMatch | null {
  const hash = rawHash.replace(/^#/, "").replace(/\/+$/, "");
  for (const route of ROUTES) {
    if (route.pattern === null) continue;
    const params = matchPattern(route.pattern, hash);
    if (params) return { route, params };
  }
  return null;
}

/** Build the hash for a page (no leading "#"); params fill ":name" segments. */
export function hashForPage(page: PageId, params: RouteParams = {}): string {
  const def = routeForPage(page);
  if (!def.pattern) return "";
  return def.pattern
    .split("/")
    .map((seg) => {
      if (!seg.startsWith(":")) return seg;
      const name = seg.endsWith("?") ? seg.slice(1, -1) : seg.slice(1);
      const value = params[name];
      return value === undefined ? "" : encodeURIComponent(value);
    })
    .filter((seg) => seg !== "")
    .join("/");
}

/** Marketing/SEO pathname aliases ("/pricing" → plans). Trailing "/" tolerated. */
export function routeFromPathname(pathname: string): RouteDef | null {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return ROUTES.find((r) => r.aliases?.includes(normalized)) ?? null;
}

// ─── Nav derivation helpers ──────────────────────────────────────────────────

export function isRouteVisible(route: RouteDef, ctx: NavContext): boolean {
  return route.visible ? route.visible(ctx) : true;
}

export function navLabelFor(route: RouteDef, ctx: NavContext): string {
  return !ctx.loggedIn && route.labelLoggedOut ? route.labelLoggedOut : route.label;
}

export function tabLabelFor(route: RouteDef, ctx: NavContext): string {
  return !ctx.loggedIn && route.labelLoggedOut ? route.labelLoggedOut : (route.tabLabel ?? route.label);
}

/** The route Ctrl+<digit> navigates to right now (first visible claimant). */
export function routeForShortcut(digit: number, ctx: NavContext): RouteDef | null {
  return ROUTES.find((r) => r.shortcut === digit && isRouteVisible(r, ctx)) ?? null;
}

/** Whether this route currently owns its shortcut digit (palette hint display). */
export function ownsShortcut(route: RouteDef, ctx: NavContext): boolean {
  return route.shortcut !== undefined && routeForShortcut(route.shortcut, ctx) === route;
}

export type NavRouteDef = RouteDef & { nav: NavEntry };

export function visibleNavRoutes(ctx: NavContext): NavRouteDef[] {
  return ROUTES.filter((r): r is NavRouteDef => r.nav !== undefined && isRouteVisible(r, ctx));
}

export function visibleRailRoutes(ctx: NavContext): NavRouteDef[] {
  return visibleNavRoutes(ctx).filter((r) => r.nav.rail === true);
}

export function visibleGroupRoutes(group: NavGroup, ctx: NavContext): NavRouteDef[] {
  return visibleNavRoutes(ctx).filter((r) => r.nav.group === group);
}

/** Static, deep-linkable destinations offered by the 404 page's search box. */
function notFoundDestinations(): NotFoundDestination[] {
  return ROUTES.filter((r) => r.nav !== undefined && !r.adminOnly && r.pattern !== null && !r.pattern.includes(":")).map(
    (r) => ({ page: r.page, label: r.label, hash: r.pattern as string }),
  );
}
