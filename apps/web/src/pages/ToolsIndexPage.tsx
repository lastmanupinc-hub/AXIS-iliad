// ─── Tools Index — click-user catalog of backend capabilities ───
//
// Every backend MCP tool / REST endpoint that has (or should have) a
// click-driven console page is listed here. Each entry says what the
// tool does, what it costs, and whether the GUI surface is live yet.
//
// "Live" entries route to their ToolPage instance.
// "Coming soon" entries are visible (so the user knows the platform's
// surface area) but disabled — pointing at the matching MCP/CLI command
// for users who can already run them via the developer doors.

import { useMemo } from "react";

export type ToolStatus = "live" | "coming_soon";

export interface ToolCatalogEntry {
  /** Stable identifier used in the URL hash (e.g. "tools/web-research"). */
  id: string;
  /** Display name shown on the card. */
  name: string;
  /** One-line description aimed at a click user — what they get, not how. */
  description: string;
  /** Pricing summary string for the card chip. */
  priceChip: string;
  /** "Free" tag styling vs paid styling. */
  free: boolean;
  /** Status — drives whether the card is interactive. */
  status: ToolStatus;
  /** The MCP tool name an agent / coder would call instead. */
  mcpToolName: string;
  /** Section grouping for the index page layout. */
  category: "Analyze your code" | "Research the web" | "Commerce readiness" | "Discovery";
}

export const TOOL_CATALOG: readonly ToolCatalogEntry[] = [
  // ─── Analyze your code ──────────────────────────────────────
  {
    id: "tools/analyze",
    name: "Analyze a Codebase",
    description: "Drop in a GitHub URL or upload a zip — get back AGENTS.md, CLAUDE.md, .cursorrules, debug playbook, and dozens of other AI context files.",
    priceChip: "Free starter / $0.50 full run",
    free: false,
    status: "live",
    mcpToolName: "analyze_repo",
    category: "Analyze your code",
  },
  {
    id: "tools/improve-agent",
    name: "Improve Your Agent",
    description: "Point AXIS at your agent's source files and get back a prioritized improvement plan — missing context files, recommended programs, gaps to close.",
    priceChip: "$0.50 / run · $0.20 lite",
    free: false,
    status: "coming_soon",
    mcpToolName: "improve_my_agent_with_axis",
    category: "Analyze your code",
  },

  // ─── Research the web ───────────────────────────────────────
  {
    id: "tools/web-research",
    name: "Web Research",
    description: "Scrape a single URL and get clean markdown back. Cached for 24h across the network so popular pages come back instantly at no cost.",
    priceChip: "100 pages/mo free, then $0.01/page",
    free: false,
    status: "live",
    mcpToolName: "iliad_web_research",
    category: "Research the web",
  },
  {
    id: "tools/web-research-crawl",
    name: "Crawl a Domain",
    description: "Crawl up to 100 pages from a single domain in one call — perfect for site audits, content inventories, and competitive research.",
    priceChip: "Shares the 100 pages/mo free pool, then $0.01/page",
    free: false,
    status: "coming_soon",
    mcpToolName: "iliad_web_research_crawl",
    category: "Research the web",
  },

  // ─── Commerce readiness ─────────────────────────────────────
  {
    id: "tools/purchasing-preview",
    name: "Purchasing Readiness Preview",
    description: "Check whether your codebase is ready for autonomous AI agents to buy on your behalf. Returns a 0-100 score and the top gaps to close.",
    priceChip: "Free preview",
    free: true,
    status: "coming_soon",
    mcpToolName: "prepare_agentic_purchasing_preview",
    category: "Commerce readiness",
  },
  {
    id: "tools/purchasing-full",
    name: "Full Purchasing Hardening",
    description: "Generate the full commerce-readiness kit: SCA exemption matrix, CE 3.0 dispute evidence checklist, AP2/UCP mandate state machine, autonomous checkout rules.",
    priceChip: "$0.50 / run · $0.25 lite",
    free: false,
    status: "coming_soon",
    mcpToolName: "prepare_agentic_purchasing",
    category: "Commerce readiness",
  },
  {
    id: "tools/closer",
    name: "Package for Marketplace",
    description: "Take an existing analysis and generate the packaging artifacts to ship the project to npm, VS Code Marketplace, GitHub Marketplace, or Docker Hub.",
    priceChip: "Paid tier · included in subscription",
    free: false,
    status: "coming_soon",
    mcpToolName: "closer",
    category: "Commerce readiness",
  },

  // ─── Discovery ──────────────────────────────────────────────
  {
    id: "tools/search-tools",
    name: "Find the Right Tool",
    description: "Describe what you're trying to do (e.g. \"prepare for Visa checkout\") and AXIS routes you to the right program with example calls.",
    priceChip: "Free · no signup",
    free: true,
    status: "coming_soon",
    mcpToolName: "search_and_discover_tools",
    category: "Discovery",
  },
  {
    id: "tools/list-programs",
    name: "Browse All Programs",
    description: "See every one of the 20 AXIS programs, what each generates, and the free vs. paid split.",
    priceChip: "Free · no signup",
    free: true,
    status: "live",
    mcpToolName: "list_programs",
    category: "Discovery",
  },
] as const;

interface Props {
  onSelectTool: (toolId: string) => void;
}

export function ToolsIndexPage({ onSelectTool }: Props) {
  const grouped = useMemo(() => {
    const byCategory = new Map<string, ToolCatalogEntry[]>();
    for (const tool of TOOL_CATALOG) {
      const list = byCategory.get(tool.category) ?? [];
      list.push(tool);
      byCategory.set(tool.category, list);
    }
    return [...byCategory.entries()];
  }, []);

  const liveCount = TOOL_CATALOG.filter((t) => t.status === "live").length;

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <h2 style={{ fontSize: "1.8rem", marginBottom: 8 }}>Tools</h2>
        <p style={{ color: "var(--text-muted)", maxWidth: 600, margin: "0 auto" }}>
          Every backend capability with a click-driven console. {liveCount} of {TOOL_CATALOG.length} are live in the web UI right now — the rest are available today via the MCP server and CLI while their GUIs are built.
        </p>
      </div>

      {grouped.map(([category, tools]) => (
        <section key={category} style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: "1.1rem", marginBottom: 12, color: "var(--text-muted)", letterSpacing: "0.02em", textTransform: "uppercase" }}>
            {category}
          </h3>
          <div className="grid grid-2" style={{ gap: 12 }}>
            {tools.map((tool) => (
              <button
                key={tool.id}
                className="card"
                onClick={() => tool.status === "live" && onSelectTool(tool.id)}
                disabled={tool.status !== "live"}
                style={{
                  textAlign: "left",
                  cursor: tool.status === "live" ? "pointer" : "default",
                  opacity: tool.status === "live" ? 1 : 0.65,
                  border: tool.status === "live" ? "1px solid var(--border)" : "1px dashed var(--border)",
                  padding: 16,
                  background: "transparent",
                  color: "inherit",
                  font: "inherit",
                }}
                aria-disabled={tool.status !== "live"}
                title={tool.status === "live" ? "Open tool" : `Coming soon to the GUI — available now via MCP tool "${tool.mcpToolName}"`}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                  <strong style={{ fontSize: "1rem" }}>{tool.name}</strong>
                  {tool.status === "live" ? (
                    <span className="badge" style={{ background: tool.free ? "var(--green, #22c55e)" : "var(--accent)", color: "white", fontSize: "0.7rem" }}>
                      {tool.free ? "FREE" : "OPEN"}
                    </span>
                  ) : (
                    <span className="badge" style={{ background: "var(--text-muted)", color: "white", fontSize: "0.7rem" }}>
                      SOON
                    </span>
                  )}
                </div>
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", lineHeight: 1.5, margin: "0 0 8px 0" }}>
                  {tool.description}
                </p>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: "0.75rem" }}>
                  <span style={{ color: "var(--text-muted)" }}>{tool.priceChip}</span>
                  <code style={{ color: "var(--text-muted)", fontSize: "0.7rem", opacity: 0.8 }}>{tool.mcpToolName}</code>
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}

      <div style={{ marginTop: 24, padding: 16, border: "1px dashed var(--border)", borderRadius: 6, textAlign: "center", fontSize: "0.85rem", color: "var(--text-muted)" }}>
        Coder or building an agent? Every tool here is also available via{" "}
        <button className="btn" style={{ padding: "0 4px", fontSize: "inherit", display: "inline" }} onClick={() => { window.location.hash = "install"; }}>
          the MCP server or CLI
        </button>
        .
      </div>
    </div>
  );
}
