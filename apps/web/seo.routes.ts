/**
 * seo.routes.ts — public routes that get their own crawlable HTML file.
 *
 * Only PUBLIC marketing/content routes belong here. Authenticated app routes
 * (dashboard, projects, account, settings, admin, usage, fleet) are deliberately
 * excluded — crawlers have no business there and emitting them leaks structure
 * for no benefit.
 *
 * These paths must match the `aliases` already declared in src/routes.tsx, so a
 * crawler landing on /docs and a user clicking through both resolve to the same
 * page.
 */
import type { RouteSeo } from "./src/plugins/axis-seo/vitePlugin";
import { PROGRAMS, type ProgramDef } from "./src/programs.ts";

export const SITE_URL = "https://iliad.trustfabric.ai/";
export const SITE_NAME = "Iliad";

export const seoRoutes: RouteSeo[] = [
  {
    path: "/",
    kind: "software",
    product: "iliad",
    title: "Iliad — turn any codebase into agent-ready context",
    description:
      "Point Iliad at a repository and get AGENTS.md, CLAUDE.md, .cursorrules, MCP configs and 140+ deterministic artifacts. Same input, same output, every run.",
  },
  {
    path: "/docs",
    kind: "article",
    product: "iliad",
    title: "Documentation — Iliad",
    description:
      "How to run Iliad against a codebase, what each of the 149 generators produces, and how to wire the output into your agent workflow.",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Docs", url: "/docs" },
    ],
  },
  {
    path: "/programs",
    kind: "collection",
    product: "iliad",
    title: "Programs — 21 generator programs, 149 artifacts",
    description:
      "Every Iliad program: artifacts, brand, SEO, marketing, skills, search, superpowers, agentic purchasing, and more — with the files each one generates.",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Programs", url: "/programs" },
    ],
  },
  {
    path: "/examples",
    kind: "collection",
    product: "iliad",
    title: "Examples — real repositories, real generated output",
    description:
      "Sample Iliad runs against real codebases, showing the artifacts produced and how they fit an agentic development workflow.",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Examples", url: "/examples" },
    ],
  },
  {
    path: "/mcp",
    kind: "software",
    product: "iliad",
    title: "MCP server — connect Iliad to Claude, Cursor, or VS Code",
    description:
      "Install the Iliad MCP server to give any agent full codebase intelligence over the Model Context Protocol, in Claude Desktop, Cursor, VS Code or Claude Code.",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "MCP", url: "/mcp" },
    ],
  },
  {
    path: "/for-agents",
    kind: "article",
    product: "iliad",
    title: "For agents — call Iliad directly",
    description:
      "Machine-readable entry point: available tools, free discovery endpoints, budget-aware pricing headers, and how an autonomous agent should call Iliad.",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "For agents", url: "/for-agents" },
    ],
  },
  {
    path: "/pricing",
    kind: "website",
    product: "iliad",
    title: "Pricing — Iliad",
    description:
      "Free tier for search, skills, and debug artifacts. Budget-aware pricing on paid runs, with lite mode for agents on a spending limit.",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Pricing", url: "/pricing" },
    ],
  },
  {
    path: "/changelog",
    kind: "collection",
    product: "iliad",
    title: "Changelog — Iliad",
    description: "Release history for Iliad: new generators, API changes, and fixes.",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Changelog", url: "/changelog" },
    ],
  },
  {
    path: "/terms",
    title: "Terms of Service — Iliad",
    description: "Terms governing use of Iliad and the Trust Fabric API.",
  },
  {
    path: "/privacy",
    title: "Privacy Policy — Iliad",
    description: "What Iliad collects when you analyze a repository, and what it does not retain.",
  },
  // The contact page, prerendered (2026-10-26, AXIS Launch taskgate T151): the page renders its own ContactPage
  // JSON-LD and a form that reaches the team; a crawler found no contact page while it was app-shell only.
  {
    path: "/feedback",
    title: "Feedback & Support — Iliad",
    description:
      "Report a bug, request a feature or ask a question. Submissions reach the team by email and are used to harden the platform during beta.",
  },
  // One page per program (2026-10-26, AXIS Launch taskgate T151), from the list the programs page shows; src/programs.test.ts
  // holds each title to 10-60 characters and each description to 50-160.
  ...PROGRAMS.map((p) => ({
    path: `/programs/${p.id}`,
    kind: "software" as const,
    product: "iliad",
    title: `${p.name} program — Iliad`,
    description: programDescription(p),
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Programs", url: "/programs" },
      { name: p.name, url: `/programs/${p.id}` },
    ],
  })),
];

/**
 * A program's description from its own fields: the tagline, the tier, and as many of the first files one run writes
 * as fit in the 160 characters a search result shows (two, else one, else none); never a cut sentence.
 */
export function programDescription(p: ProgramDef): string {
  const lead = `${p.tagline}. ${p.tier === "free" ? "Free" : "A Pro program"}`;
  for (const n of [2, 1]) {
    const d = `${lead}: one run writes ${p.outputs.slice(0, n).join(" and ")}${p.outputs.length > n ? " and more" : ""}.`;
    if (d.length <= 160) return d;
  }
  return `${lead}.`;
}
