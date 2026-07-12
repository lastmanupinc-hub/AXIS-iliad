import type { ReactNode } from "react";
import { HomePage } from "./pages/HomePage.tsx";
import { AnalyzePage } from "./pages/AnalyzePage.tsx";
import { ProjectsPage } from "./pages/ProjectsPage.tsx";
import { UsagePage } from "./pages/UsagePage.tsx";
import { CommercePage } from "./pages/CommercePage.tsx";
import { PlaygroundPage } from "./pages/PlaygroundPage.tsx";
import { ChangelogPage } from "./pages/ChangelogPage.tsx";
import { StatusPage } from "./pages/StatusPage.tsx";
import { ProjectPage, type ProjectTab } from "./pages/ProjectPage.tsx";
import { AccountDashboardPage } from "./pages/AccountDashboardPage.tsx";
import { RunnerPage } from "./pages/RunnerPage.tsx";
import { PlansPage } from "./pages/PlansPage.tsx";
import { AccountPage } from "./pages/AccountPage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";
import { DocsPage } from "./pages/DocsPage.tsx";
import { HelpPage } from "./pages/HelpPage.tsx";
import { QAPage } from "./pages/QAPage.tsx";
import { ProgramsPage } from "./pages/ProgramsPage.tsx";
import { TermsPage } from "./pages/TermsPage.tsx";
import { ForAgentsPage } from "./pages/ForAgentsPage.tsx";
import { ExamplesPage } from "./pages/ExamplesPage.tsx";
import { McpPage } from "./pages/McpPage.tsx";
import { PaidCheckoutPage } from "./pages/PaidCheckoutPage.tsx";
import { AdminPage } from "./pages/AdminPage.tsx";
import { MyAnalyticsPage } from "./pages/MyAnalyticsPage.tsx";
import { WebResearchPage } from "./pages/tools/WebResearchPage.tsx";
import { KitchenSinkPage } from "./pages/KitchenSinkPage.tsx";
import { NotFoundPage, type NotFoundDestination } from "./pages/NotFoundPage.tsx";
import { Callout, EmptyState } from "./components/primitives/index.ts";
import { PRO_PROGRAM_COUNT } from "./config.ts";
import type { SignUpTrigger } from "./components/SignUpModal.tsx";
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
//
// WO-P1: "home" (pattern "") is the marketing landing page (HomePage.tsx,
// no nav entry — reached via "/", the bare hash, or the sidebar brand/logo)
// and "analyze" (pattern "analyze") is the functional form (AnalyzePage.tsx,
// the WORKSPACE sidebar item, owns the Ctrl+1 shortcut per HelpPage's table).
// These replace the former combined "upload" page.
//
// WO-P5: the per-project detail view (formerly the single-result "dashboard"
// page, gated on `hasResult`) moved to the ID-addressable "project"/
// "project-versions" routes below — the build plan's IA (§1.2) reserves the
// literal hash "#dashboard" for the account-level overview (WO-P3's former
// "account-dashboard" page, promoted here to the real "dashboard" id now
// that the handoff has happened). WO-P6 added a third ID-addressable
// variant, "project-artifacts" ("#projects/:id/artifacts"), deep-linking the
// same page straight into its new Artifacts tab (ArtifactExplorer).
//
// WO-P8: "mcp" (pattern "mcp") is the merged MCP Configuration page — the
// former "install" (per-platform config snippets) and "tools" (a hand-
// maintained catalog mapping 9 click-console entries to MCP tool names, 6 of
// them permanently "coming soon") pages both retired into it; the manifest,
// the full tool registry, and the platform configs are now fetched live from
// the API instead of hand-maintained lists. It claims the "/mcp" pathname
// alias (moved off "for-agents", which keeps only its own canonical alias)
// plus "/install" and "/tools" for continuity with the pages it absorbed.
// "tool-web-research" — the one ToolsIndexPage destination with an actual
// built console page — survives at its own hash/alias with "mcp" as its new
// parent (McpPage's tool registry links back into it for iliad_web_research).

export type PageId =
  | "home"
  | "analyze"
  | "dashboard"
  // Projects/History (WO-P11) — "#projects", the full searchable/sortable
  // list (the Account Dashboard only teases the most recent 20 as cards).
  | "projects"
  // Usage & Billing (WO-P10) — "#usage", split off AccountPage's former
  // billing/usage half (profile/keys/seats moved to Settings in WO-P12).
  | "usage"
  // Settings (WO-P12) — "#settings", the profile/keys/seats half of the
  // former AccountPage plus GitHub tokens, webhooks, program toggles, and
  // the Danger Zone. "account" survives only as the OAuth redirect target.
  | "settings"
  // Project/Snapshot Detail (WO-P5) — ID-addressable at "#projects/:id";
  // "project-versions" and "project-artifacts" (WO-P6) are the same page
  // with a different tab deep-linked (separate RouteDefs because a pattern
  // segment can't be optional AND extend the segment count — see
  // matchPattern's exact-segment-count rule).
  | "project"
  | "project-versions"
  | "project-artifacts"
  // Program Runner (WO-P7) — "#run" or "#run/:program" (the optional segment
  // preselects a program; ProgramLauncher's "Advanced options"/"Open Program
  // Runner" links and the Account Dashboard's "Run a program" quick action
  // all land here).
  | "runner"
  | "plans"
  | "account"
  | "docs"
  | "help"
  | "qa"
  | "programs"
  | "terms"
  | "for-agents"
  | "examples"
  | "mcp"
  // Agentic Purchasing / Commerce Hub (WO-P9) — "#commerce".
  | "commerce"
  // Live Demo / Playground (WO-P15) — "#playground", public. A fuller
  // standalone version of HomePage's LiveDemoTeaser.
  | "playground"
  // Changelog (WO-P16) — "#changelog", public. The footer's version badge
  // links here.
  | "changelog"
  // Status (WO-P17) — "#status", public. The footer's "Status" link and the
  // StatusBar's connection dot both link here.
  | "status"
  | "paid-checkout"
  | "admin"
  | "myanalytics"
  // Sub-tool pages — each a click-driven console for a single backend capability.
  // Hash format: "#tools/web-research". (WO-P8: the "tools" index page that
  // used to list these was merged into "mcp" — this is the one live console.)
  | "tool-web-research"
  // Hidden dev aid (WO-F4): primitives gallery at #__kitchen-sink.
  | "kitchen-sink"
  | "not-found";

export type RouteParams = Record<string, string>;

/** Runtime state the nav derivations depend on (visibility, labels, shortcuts). */
export interface NavContext {
  loggedIn: boolean;
  privateAccess: boolean;
  /** A project result is currently loaded (any project, not just the account
   *  overview's list) — informational; no route's `visible` gates on it since
   *  WO-P5 moved the per-project view off the shared "#dashboard" hash. */
  hasResult: boolean;
}

/** Everything a route's render function may need from the app shell. */
export interface RouteContext extends NavContext {
  /** Params captured from the hash pattern (e.g. { id } for "projects/:id"). */
  params: RouteParams;
  /** Raw hash (without "#") that produced the current route — 404 reporting. */
  hash: string;
  /** The project currently loaded — WO-P5/P6: for the "project"/
   *  "project-versions"/"project-artifacts" routes this is fetched (or read
   *  from the anon cache) for `params.id` specifically; `result.project_id
   *  === params.id` before it's safe to render. */
  result: SnapshotResponse | null;
  /** Active project id (multi-project state, WO-F3) — survives reloads via
   *  localStorage `axis_last_project_id`; the server restores the rest. */
  currentProjectId: string | null;
  /** True while a project result is being rebuilt from the server. */
  restoring: boolean;
  /** Set when the last restore attempt (for `params.id`) failed — human copy,
   *  never a raw server body (WO-F4 hardening). Cleared on the next attempt. */
  restoreError: string | null;
  navigate: (page: PageId, params?: RouteParams) => void;
  /** Open the sign-in popup without navigating (WO-P2: remembers the current
   *  page so a successful sign-in returns here; `trigger` picks the popup's
   *  contextual copy — default "generic"). */
  requireLogin: (trigger?: SignUpTrigger) => void;
  /** Fires once an analysis completes — H9: anonymous results are shown
   *  immediately (never gated behind signup); see App.tsx handleAnalyzeComplete. */
  onAnalyzeComplete: (data: SnapshotResponse) => void;
  onGeneratedCountChange: (count: number) => void;
  onAuthChange: () => void;
  /** WO-P3: open a project from a project card (Account Dashboard) — clears
   *  any stale in-memory result, points multi-project state at `projectId`,
   *  and navigates to "#projects/:id" (WO-P5), which restores it from the
   *  server (the same seam WO-F3 built for the last-project deep-link). */
  onOpenProject: (projectId: string) => void;
  /** WO-P5: a snapshot belonging to the open project was deleted — re-fetch
   *  the project (a different snapshot may now be latest, or none remain). */
  onSnapshotDeleted: () => void;
  /** WO-P5: the open project itself was deleted — clear multi-project state
   *  and leave the now-gone project's page. */
  onProjectDeleted: () => void;
  /** WO-P11: "Re-analyze" from the Projects list — stashes `githubUrl` into
   *  `prefillRepoUrl` and navigates to "#analyze" with the form pre-filled. */
  onReanalyze: (githubUrl: string) => void;
  /** WO-P11: set by onReanalyze, read once by the "analyze" route's render
   *  and cleared the same way every other one-shot handoff in this table is
   *  (a fresh `route.key` remounts AnalyzePage per navigation — see
   *  useHashRoute.ts's `navigate` — so a stale value can't leak into a later,
   *  unrelated visit to #analyze). */
  prefillRepoUrl: string | null;
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
   * visible claimant in table order owns the key. Most digits (per the
   * HelpPage shortcut table) have exactly one static owner, gated at fire
   * time by `nav()`'s auth check rather than a `visible` condition here
   * (e.g. Ctrl+2 = Dashboard, Ctrl+3 = Plans — both auth-only).
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
    page: "home",
    pattern: "",
    label: "Home",
    section: "MISSION",
    // Deliberately no `nav` entry (not in the sidebar/rail/drawer/palette/404
    // search per the build plan's sidebar tree — WORKSPACE starts at Analyze)
    // and no `shortcut`. Reached via "/", the bare hash, or the sidebar
    // brand/logo... except the brand click resets to Analyze (see App.tsx
    // handleReset) — Home is a pure entry point, not a mid-session waypoint.
    render: (ctx) => <HomePage onAnalyze={() => ctx.navigate("analyze")} onRequireLogin={() => ctx.requireLogin("save-project")} onNavigate={ctx.navigate} />,
  },
  {
    page: "analyze",
    pattern: "analyze",
    label: "Analyze",
    section: "MISSION",
    shortcut: 1,
    nav: { group: "WORKSPACE", icon: "scan", rail: true },
    render: (ctx) => <AnalyzePage onComplete={ctx.onAnalyzeComplete} loggedIn={ctx.loggedIn} initialUrl={ctx.prefillRepoUrl ?? undefined} />,
  },
  {
    // WO-P3 (account-level overview) — promoted to the real "#dashboard" hash
    // by WO-P5, which relocated the per-project view that used to live here
    // to the ID-addressable "project"/"project-versions"/"project-artifacts"
    // routes below (a generic nav/shortcut target can't carry a per-project
    // `:id` param without WO-F2's "one entry = one page" invariant growing a
    // special case). Ctrl+2 is this page's alone now — no `visible` gate
    // needed since nothing else contests the digit (unlike the pre-WO-P5
    // hasResult dance).
    page: "dashboard",
    pattern: "dashboard",
    label: "Dashboard",
    tabLabel: "dashboard.json",
    section: "MISSION",
    shortcut: 2,
    authOnly: true,
    nav: { group: "WORKSPACE", icon: "dashboard", rail: true },
    render: (ctx) => <AccountDashboardPage onOpenProject={ctx.onOpenProject} onNavigate={ctx.navigate} />,
  },
  {
    // WO-P7: Program Runner — program picker -> target-project picker ->
    // options (lite mode, per-output selection) -> run -> honest staged
    // status -> results panel with a jump-link into the Artifact Explorer.
    // The optional trailing segment preselects a program (deep-linked from
    // ProgramLauncher's "Advanced options"/"Open Program Runner" and the
    // Account Dashboard's "Run a program" quick action). Not auth-only —
    // anonymous visitors can run free programs against their guest project,
    // same access rule as the "project" routes above.
    page: "runner",
    pattern: "run/:program?",
    label: "Program Runner",
    tabLabel: "runner.json",
    section: "MISSION",
    nav: { group: "WORKSPACE", icon: "play" },
    render: (ctx) => (
      <RunnerPage
        initialProgram={ctx.params.program}
        loggedIn={ctx.loggedIn}
        currentProjectId={ctx.currentProjectId}
        anonResult={ctx.result}
        onNavigate={ctx.navigate}
        onRequireLogin={() => ctx.requireLogin("paid-program")}
      />
    ),
  },
  {
    // WO-P11: Projects/History — the complete, searchable/sortable list of
    // every repo the account has analyzed (the Account Dashboard's own
    // "Recent projects" cards, WO-P3, only tease the most recent 20). Auth-
    // only: GET /v1/projects has no meaningful anonymous result (an anon
    // analysis lives client-side only, never server-listed).
    page: "projects",
    pattern: "projects",
    label: "Projects",
    tabLabel: "projects.json",
    section: "MISSION",
    authOnly: true,
    nav: { group: "WORKSPACE", icon: "list", rail: true },
    render: (ctx) => (
      <ProjectsPage
        onOpenProject={ctx.onOpenProject}
        onReanalyze={ctx.onReanalyze}
        onAnalyze={() => ctx.navigate("analyze")}
      />
    ),
  },
  {
    // WO-P5: Project/Snapshot Detail — the former single-result "#dashboard"
    // page (hasResult-gated, no id of its own), now ID-addressable so any
    // historical project can be opened by URL. `renderProjectDetail` (below
    // the table) is shared with "project-versions"/"project-artifacts";
    // App.tsx's restore effect fetches (or reads the anon cache for)
    // whichever `params.id` is current.
    page: "project",
    pattern: "projects/:id",
    label: "Project",
    tabLabel: "project.json",
    section: "MISSION",
    render: (ctx) => renderProjectDetail(ctx),
  },
  {
    // Same page as "project", with the Artifacts tab deep-linked (WO-P6,
    // build plan §1.2: "#projects/:id/artifacts → Artifact Explorer
    // (deep-linkable tab)"). A separate RouteDef rather than an optional
    // trailing segment on "project" — matchPattern requires an exact segment
    // count per pattern, so "projects/:id" and "projects/:id/artifacts" are
    // two patterns, not one with an optional tail.
    page: "project-artifacts",
    pattern: "projects/:id/artifacts",
    label: "Project Artifacts",
    tabLabel: "project-artifacts.json",
    section: "MISSION",
    parent: "project",
    render: (ctx) => renderProjectDetail(ctx, "Artifacts"),
  },
  {
    // Same page as "project", with the Versions tab deep-linked (build plan
    // §1.2: "#projects/:id/versions → Version history + diff viewer
    // (deep-linkable tab)"). A separate RouteDef rather than an optional
    // trailing segment on "project" — matchPattern requires an exact segment
    // count per pattern, so "projects/:id" and "projects/:id/versions" are
    // two patterns, not one with an optional tail.
    page: "project-versions",
    pattern: "projects/:id/versions",
    label: "Project Versions",
    tabLabel: "project-versions.json",
    section: "MISSION",
    parent: "project",
    render: (ctx) => renderProjectDetail(ctx, "Versions"),
  },
  {
    // WO-P8: the "tools" index page that used to own this pattern's parent
    // slot was merged into "mcp" (below) — this is the one ToolsIndexPage
    // destination that was a real, built console rather than a catalog card,
    // so it keeps its own hash and alias.
    page: "tool-web-research",
    pattern: "tools/web-research",
    label: "Web Research",
    tabLabel: "web-research.tool",
    section: "MISSION",
    parent: "mcp",
    aliases: ["/tools/web-research"],
    render: (ctx) => <WebResearchPage onBack={() => ctx.navigate("mcp")} />,
  },
  {
    page: "programs",
    pattern: "programs",
    label: "Programs",
    section: "MISSION",
    aliases: ["/programs"],
    nav: { group: "LIBRARY", icon: "layers", rail: true },
    render: (ctx) => <ProgramsPage onAnalyze={() => ctx.navigate("analyze")} />,
  },
  {
    // WO-P8: MCP Configuration — merges the old "install" (per-platform
    // config snippets) and "tools" (ToolsIndexPage's hand-maintained catalog)
    // pages; see the doc comment above PageId for the full rationale.
    page: "mcp",
    pattern: "mcp",
    label: "MCP",
    section: "AGENTS",
    aliases: ["/mcp", "/install", "/tools"],
    nav: { group: "LIBRARY", icon: "plug", rail: true },
    render: (ctx) => <McpPage onNavigate={ctx.navigate} />,
  },
  {
    // WO-P9: Agentic Purchasing / Commerce Hub — generates and renders the
    // "agentic-purchasing" program's artifacts in-app. Not authOnly: the
    // explainer and a project's existing compliance-grade signal are visible
    // to anyone with a loaded project (anon guest included); only the
    // generate action itself is paid/gated (same pattern as "runner").
    page: "commerce",
    pattern: "commerce",
    label: "Commerce",
    tabLabel: "commerce.json",
    section: "AGENTS",
    nav: { group: "LIBRARY", icon: "shopping-bag" },
    render: (ctx) => (
      <CommercePage
        loggedIn={ctx.loggedIn}
        currentProjectId={ctx.currentProjectId}
        anonResult={ctx.result}
        onNavigate={ctx.navigate}
        onRequireLogin={() => ctx.requireLogin("paid-program")}
      />
    ),
  },
  {
    // WO-P15: Live Demo / Playground — a fuller standalone version of
    // HomePage's LiveDemoTeaser. Public: anyone can run a real, free-program
    // analysis with no account; onRequireLogin only nudges after a result
    // shows, it never gates the page itself.
    page: "playground",
    pattern: "playground",
    label: "Playground",
    section: "AGENTS",
    nav: { group: "LIBRARY", icon: "flask" },
    render: (ctx) => (
      <PlaygroundPage loggedIn={ctx.loggedIn} onRequireLogin={() => ctx.requireLogin("save-project")} />
    ),
  },
  {
    // WO-P16: Changelog — public, footer-only (matches "terms"'s pattern:
    // deliberately absent from the sidebar/drawer/rail).
    page: "changelog",
    pattern: "changelog",
    label: "Changelog",
    section: "REFERENCE",
    render: () => <ChangelogPage />,
  },
  {
    // WO-P17: Status — public, footer-only (same pattern as "changelog").
    page: "status",
    pattern: "status",
    label: "Status",
    section: "REFERENCE",
    render: () => <StatusPage />,
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
    render: (ctx) => <PlansPage loggedIn={ctx.loggedIn} onSelectPlan={() => ctx.navigate("account")} onRequireLogin={() => ctx.requireLogin("paid-program")} />,
  },
  {
    // WO-P10: Usage & Billing — split off AccountPage's former billing/usage
    // half (subscription, credits, per-program usage, plus new usage graphs
    // and a tier-change proration preview — none of which existed as a
    // standalone page before). "account" (profile/keys/seats) stays put for
    // now pending WO-P12's move to Settings.
    page: "usage",
    pattern: "usage",
    label: "Usage & Billing",
    tabLabel: "usage.json",
    section: "ACCOUNT",
    authOnly: true,
    nav: { group: "ACCOUNT", icon: "bar-chart" },
    render: () => <UsagePage />,
  },
  {
    // WO-P12: no longer a sidebar/rail/shortcut destination — "settings"
    // (below) took over that slot. Kept addressable (pattern + alias) ONLY
    // because the OAuth provider's redirect_uri is a fixed server-side value
    // pointing at "#account" — changing that is an infra change this unit
    // deliberately does not risk. An authenticated visit here redirects
    // straight to Settings (see AccountPage.tsx's own comment).
    page: "account",
    pattern: "account",
    label: "Account",
    labelLoggedOut: "Sign Up",
    section: "ACCOUNT",
    authOnly: true,
    aliases: ["/account"],
    render: (ctx) => <AccountPage onAuthChange={ctx.onAuthChange} onNavigate={ctx.navigate} />,
  },
  {
    // WO-P12: Settings — profile (PATCH /v1/account), API keys, GitHub
    // tokens, webhooks + delivery log, team seats, program entitlement
    // toggles, and the Danger Zone (DELETE /v1/account). Claims "account"'s
    // former shortcut/rail/sidebar slot per the build plan's sidebar tree
    // ("ACCOUNT: Usage & Billing · Settings · Plans" — no separate "Account"
    // entry). HelpPage's Ctrl+4 documentation already says "Settings".
    page: "settings",
    pattern: "settings",
    label: "Settings",
    tabLabel: "settings.json",
    section: "ACCOUNT",
    shortcut: 4,
    authOnly: true,
    nav: { group: "ACCOUNT", icon: "settings", rail: true },
    render: (ctx) => <SettingsPage onAuthChange={ctx.onAuthChange} />,
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
    render: (ctx) => <DocsPage onNavigate={ctx.navigate} />,
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
    // WO-P8: "/mcp" now belongs to the "mcp" route (MCP Configuration) — this
    // page keeps only its own canonical alias.
    aliases: ["/for-agents"],
    nav: { group: "HELP", icon: "bot" },
    render: () => <ForAgentsPage />,
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
    page: "kitchen-sink",
    pattern: "__kitchen-sink",
    label: "Kitchen Sink",
    tabLabel: "kitchen-sink.dev",
    section: "SYSTEM",
    // Dev aid (WO-F4): a Storybook-style gallery of the shared primitives.
    // Hidden — no `nav` entry, shortcut, or alias, so it never appears in the
    // sidebar/rail/drawer/palette/404 search; reachable only by typing the hash.
    render: (ctx) => <KitchenSinkPage onNavigate={ctx.navigate} />,
  },
  {
    page: "not-found",
    pattern: null, // fallback route — reached only when no pattern matches
    label: "404",
    section: "SYSTEM",
    render: (ctx) => <NotFoundPage badHash={ctx.hash} destinations={notFoundDestinations()} onNavigate={ctx.navigate} />,
  },
];

// ─── Project Detail render (WO-P5/WO-P6) ──────────────────────────────────────
// Shared by the "project", "project-versions", and "project-artifacts" routes
// — the only difference between them is which tab opens first. `ctx.result`/
// `restoring`/`restoreError` are populated by App.tsx's restore effect, keyed
// on `ctx.params.id` (not the app-wide "current project" — a deep link to a
// DIFFERENT project than the one already open must still fetch the right one).

function renderProjectDetail(ctx: RouteContext, initialTab?: ProjectTab): ReactNode {
  if (ctx.result && ctx.result.project_id === ctx.params.id) {
    return (
      <>
        {!ctx.loggedIn && (
          // H9 (WO-P1): anonymous analyses complete and display results — the
          // SignUpModal no longer intercepts them. The nudge moves to this
          // point-of-value banner instead of a blind gate.
          <div className="mb-4">
            <Callout tone="info" title="You're browsing as a guest">
              This project lives in your browser only. Sign up to unlock {PRO_PROGRAM_COUNT} more paid
              programs and keep every future analysis as a saved project.{" "}
              <button type="button" className="btn btn-primary" style={{ marginLeft: 8 }} onClick={() => ctx.requireLogin("save-project")}>
                Sign up free
              </button>
            </Callout>
          </div>
        )}
        <ProjectPage
          result={ctx.result}
          loggedIn={ctx.loggedIn}
          initialTab={initialTab}
          onGeneratedCountChange={ctx.onGeneratedCountChange}
          onSnapshotDeleted={ctx.onSnapshotDeleted}
          onProjectDeleted={ctx.onProjectDeleted}
          onNeedCredits={() => ctx.navigate("account")}
          onOpenRunner={(program) => ctx.navigate("runner", { program })}
        />
      </>
    );
  }
  if (ctx.restoring) {
    return (
      <div className="card" style={{ margin: 40, textAlign: "center", padding: 32 }} role="status" aria-live="polite">
        Restoring project…
      </div>
    );
  }
  return (
    <div className="card">
      <EmptyState
        icon="scan"
        title="Project not found"
        message={ctx.restoreError ?? "This project doesn't exist, or you don't have access to it."}
        cta={{ label: "Analyze a repo", onClick: () => ctx.navigate("analyze") }}
      />
    </div>
  );
}

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
