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
import type { RouteSeo } from "@axis/seo";

export const SITE_URL = "https://iliad.trustfabric.ai/";
export const SITE_NAME = "Iliad";

export const seoRoutes: RouteSeo[] = [
  {
    path: "/",
    kind: "software",
    product: "iliad",
    title: "Iliad — turn any codebase into agent-ready context",
    description:
      "Point Iliad at a repository and get AGENTS.md, CLAUDE.md, .cursorrules, MCP configs, SEO rules, and 140+ deterministic artifacts. Same input, same output, every run.",
  },
  {
    path: "/docs",
    kind: "article",
    product: "iliad",
    title: "Documentation — Iliad",
    description:
      "How to run Iliad against a codebase, what each of the 144 generators produces, and how to wire the output into your agent workflow.",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Docs", url: "/docs" },
    ],
  },
  {
    path: "/programs",
    kind: "collection",
    product: "iliad",
    title: "Programs — 20 generator programs, 144 artifacts",
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
      "Install the Iliad MCP server and give any agent full codebase intelligence over Model Context Protocol. Setup for Claude Desktop, Cursor, VS Code, and Claude Code.",
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
];
