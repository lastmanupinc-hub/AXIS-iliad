/**
 * @vitest-environment happy-dom
 */

// WO-P8 — MCP Configuration: merges the old InstallPage + ToolsIndexPage into
// one page whose manifest panel, tool registry, program/generator capability
// search, per-platform install configs, and probe-intent demo are all fetched
// live from the API. Every endpoint here is public — no auth/tier fixtures
// needed anywhere in this file.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { McpPage } from "./McpPage.tsx";

/** Fetch stub routed by URL substring: [match, body, status?][] (first hit
 *  wins — the convention already used by RunnerPage.test.tsx/app-routing.test.tsx).
 *  IMPORTANT: more specific paths (e.g. "/v1/mcp/server.json") must be listed
 *  BEFORE the bare "/mcp" entry (listMcpTools' tools/list POST target) — a
 *  request to the longer path also contains "/mcp" as a substring, so a
 *  handler-order mistake would silently misroute it. */
function stubFetch(handlers: Array<[match: string, body: unknown, status?: number]>) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const hit = handlers.find(([m]) => url.includes(m));
    const body = hit ? hit[1] : {};
    const status = hit?.[2] ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
      headers: { get: () => null },
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const noop = () => {};

const MANIFEST_RESPONSE = {
  server: { name: "Axis' Iliad", slug: "axis-iliad", version: "0.5.3", endpoint: "https://x/mcp" },
  tools: [{ name: "list_programs", description: "d" }, { name: "analyze_repo", description: "d2" }],
  _meta: {
    categories: ["code-analysis", "agentic-commerce"],
    authentication: { type: "bearer", description: "API key in Authorization header: Bearer <api_key>." },
    monetization: { model: "usage_based_mpp", standard_price_cents: 50, lite_price_cents: 15, budget_header: "X-Agent-Budget" },
    transport: "http",
  },
};

const TOOLS = [
  {
    name: "list_programs",
    description: "Inventory mode. List all 20 AXIS programs. Free, no auth, and no side effects.",
    inputSchema: { type: "object", properties: {} },
    annotations: { title: "List Programs", readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    // Deliberately NOT "analyze_repo" — ProgramCapabilitySearch's static copy
    // below mentions that real tool name as an illustrative example, and a
    // fixture tool reusing it would make text queries genuinely ambiguous
    // (two separate, legitimate on-page matches, not a testing-library quirk).
    name: "get_snapshot",
    description: "Retrieve a previously created snapshot by id. Requires Authorization: Bearer <api_key>. Pricing: $0.50 standard, $0.15 lite.",
    inputSchema: {
      type: "object",
      required: ["snapshot_id"],
      properties: { snapshot_id: { type: "string", description: "Snapshot id from a prior analyze call" } },
    },
    annotations: { title: "Get Snapshot", readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    examples: [{ name: "Get a snapshot", input: { snapshot_id: "snap_abc123" }, output: "{}" }],
  },
  {
    name: "iliad_web_research",
    description: "Scrape a single URL and get clean markdown back.",
    inputSchema: { type: "object", required: ["url"], properties: { url: { type: "string", description: "Page URL" } } },
    annotations: { title: "Web Research", readOnlyHint: true, destructiveHint: false, idempotentHint: false },
  },
];

function toolsListResponse(tools: unknown[] = TOOLS) {
  return { jsonrpc: "2.0", id: 1, result: { tools } };
}

const INSTALL_CLAUDE_DESKTOP = {
  platform: "claude-desktop",
  file: "claude_desktop_config.json",
  description: "Add to Claude Desktop config.",
  config: { mcpServers: { "axis-iliad": { url: "https://x/mcp", headers: { Authorization: "Bearer ${AXIS_API_KEY}" } } } },
  get_api_key: "POST .../v1/accounts",
  mcp_endpoint: "https://x/mcp",
};

const INSTALL_CLAUDE_CODE = {
  platform: "claude-code",
  file: "claude-code CLI",
  description: "Run this command to add AXIS as an MCP server in Claude Code.",
  config: { command: 'claude mcp add axis-iliad --transport http --url https://x/mcp --header "Authorization: Bearer ${AXIS_API_KEY}"' },
  get_api_key: "POST .../v1/accounts",
  mcp_endpoint: "https://x/mcp",
};

const CAPABILITY_SEARCH_RESPONSE = {
  query: "checkout",
  program_filter: null,
  total_matches: 1,
  results: [
    {
      program: "agentic-purchasing",
      tier: "pro",
      score: 5,
      capability_tags: ["purchasing", "commerce", "checkout"],
      matching_artifacts: ["checkout-flow.md"],
      all_artifacts: ["checkout-flow.md", "playbook.md"],
      example_call: "POST /v1/agentic-purchasing/generate",
    },
  ],
};

const PROBE_RESPONSE = {
  intent: "checkout compliance",
  recommendations: [
    { tool: "prepare_agentic_purchasing", reason: "Full purchasing readiness audit", auth: true, pricing: "$0.50/call via MPP or included in Pro plan" },
    { tool: "search_and_discover_tools", reason: "Keyword search across all 20 programs", auth: false, pricing: "free" },
  ],
  call_next: "prepare_agentic_purchasing",
  mcp_endpoint: "https://x/mcp",
  install: "https://x/v1/install",
  for_agents: "https://x/for-agents",
};

/** Every endpoint the full page fetches on mount (manifest, tool registry,
 *  default install tab) plus the two on-demand ones (capability search,
 *  probe-intent) — sufficient for any full-page render. Order matters: see
 *  stubFetch's doc comment. */
const DEFAULT_HANDLERS: Array<[string, unknown, number?]> = [
  ["/v1/mcp/server.json", MANIFEST_RESPONSE],
  ["/v1/mcp/tools", CAPABILITY_SEARCH_RESPONSE],
  ["/v1/install/claude-desktop", INSTALL_CLAUDE_DESKTOP],
  ["/v1/install/claude-code", INSTALL_CLAUDE_CODE],
  ["/v1/install/cursor", { ...INSTALL_CLAUDE_DESKTOP, platform: "cursor", file: ".cursor/mcp.json" }],
  ["/v1/install/vscode", { ...INSTALL_CLAUDE_DESKTOP, platform: "vscode", file: ".vscode/mcp.json" }],
  ["/probe-intent", PROBE_RESPONSE],
  ["/mcp", toolsListResponse()], // bare — must stay after every "/v1/mcp/..." entry above
];

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("McpPage — manifest panel", () => {
  it("renders live server manifest data — name, version, endpoint, pricing, categories", async () => {
    stubFetch(DEFAULT_HANDLERS);
    render(<McpPage onNavigate={noop} />);

    await waitFor(() => expect(screen.getByText("Axis' Iliad")).toBeTruthy());
    expect(screen.getByText("0.5.3")).toBeTruthy();
    // Exact match (not a regex/substring match): the endpoint URL also
    // appears embedded WITHIN the longer Claude Desktop install config below
    // (a real second on-page mention) — but that config's own text is the
    // whole JSON blob, not equal to just the bare URL, so an exact match
    // still uniquely resolves to this panel's own <code>.
    expect(screen.getByText("https://x/mcp")).toBeTruthy();
    expect(screen.getByText(/\$0\.50\/call/)).toBeTruthy();
    expect(screen.getByText(/\$0\.15\/call/)).toBeTruthy();
    expect(screen.getByText("code-analysis")).toBeTruthy();
  });

  it("shows a retry option when the manifest fails to load, and retry re-fetches", async () => {
    const failing: Array<[string, unknown, number?]> = [["/v1/mcp/server.json", { error: "boom" }, 500], ...DEFAULT_HANDLERS.slice(1)];
    stubFetch(failing);
    render(<McpPage onNavigate={noop} />);

    await screen.findByText("boom");

    stubFetch(DEFAULT_HANDLERS);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(screen.getByText("Axis' Iliad")).toBeTruthy());
  });
});

describe("McpPage — tool registry (acceptance: tool count/list come from the API)", () => {
  it("lists every tool from the live POST /mcp tools/list catalog, not a hardcoded set", async () => {
    stubFetch(DEFAULT_HANDLERS);
    render(<McpPage onNavigate={noop} />);

    await waitFor(() => expect(screen.getByText("3 tools")).toBeTruthy());
    expect(screen.getByText("list_programs")).toBeTruthy();
    expect(screen.getByText("get_snapshot")).toBeTruthy();
    expect(screen.getByText("iliad_web_research")).toBeTruthy();
  });

  it("changing the server-side catalog changes the page — no hardcoded tool list", async () => {
    stubFetch([...DEFAULT_HANDLERS.filter(([m]) => m !== "/mcp"), ["/mcp", toolsListResponse([TOOLS[0]])]]);
    const { unmount } = render(<McpPage onNavigate={noop} />);
    await waitFor(() => expect(screen.getByText("1 tool")).toBeTruthy());
    expect(screen.queryByText("get_snapshot")).toBeNull();
    unmount();
    cleanup();

    stubFetch(DEFAULT_HANDLERS);
    render(<McpPage onNavigate={noop} />);
    await waitFor(() => expect(screen.getByText("3 tools")).toBeTruthy());
    expect(screen.getByText("get_snapshot")).toBeTruthy();
  });

  it("search narrows the list by name or description, and can be cleared", async () => {
    stubFetch(DEFAULT_HANDLERS);
    render(<McpPage onNavigate={noop} />);
    await waitFor(() => expect(screen.getByText("3 tools")).toBeTruthy());

    // "scrape" is unique to iliad_web_research's description in this fixture.
    fireEvent.change(screen.getByLabelText("Search MCP tools"), { target: { value: "scrape" } });
    expect(screen.getByText("iliad_web_research")).toBeTruthy();
    expect(screen.queryByText("get_snapshot")).toBeNull();
    expect(screen.getByText("1 of 3 tools")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search MCP tools"), { target: { value: "nothing matches this" } });
    expect(screen.getByText("No tools match your search")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByText("get_snapshot")).toBeTruthy();
  });

  it("expanding a tool shows its full description and an arguments table derived from its real inputSchema", async () => {
    stubFetch(DEFAULT_HANDLERS);
    render(<McpPage onNavigate={noop} />);
    await waitFor(() => expect(screen.getByText("get_snapshot")).toBeTruthy());

    fireEvent.click(screen.getByText("get_snapshot"));

    expect(screen.getByText(/Requires Authorization: Bearer/)).toBeTruthy();
    expect(screen.getByText("snapshot_id")).toBeTruthy();
    expect(screen.getByText("Snapshot id from a prior analyze call")).toBeTruthy();
    // required=["snapshot_id"] -> "Yes" cell.
    expect(screen.getAllByText("Yes").length).toBeGreaterThan(0);
  });

  it("shows a retry option when the tool registry fails to load", async () => {
    stubFetch([...DEFAULT_HANDLERS.filter(([m]) => m !== "/mcp"), ["/mcp", { jsonrpc: "2.0", id: 1, error: { code: -32601, message: "registry down" } }]]);
    render(<McpPage onNavigate={noop} />);

    await screen.findByText("registry down");
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("a tool with a real built console (iliad_web_research) offers a cross-link that navigates there", async () => {
    stubFetch(DEFAULT_HANDLERS);
    const onNavigate = vi.fn();
    render(<McpPage onNavigate={onNavigate} />);
    await waitFor(() => expect(screen.getByText("iliad_web_research")).toBeTruthy());

    fireEvent.click(screen.getByText("iliad_web_research"));
    fireEvent.click(screen.getByRole("button", { name: "Try Web Research in the browser →" }));

    expect(onNavigate).toHaveBeenCalledWith("tool-web-research");
  });

  it("a tool with no built console (get_snapshot) offers no cross-link", async () => {
    stubFetch(DEFAULT_HANDLERS);
    render(<McpPage onNavigate={noop} />);
    await waitFor(() => expect(screen.getByText("get_snapshot")).toBeTruthy());

    fireEvent.click(screen.getByText("get_snapshot"));

    expect(screen.queryByText(/Try .* in the browser/)).toBeNull();
  });
});

describe("McpPage — program & generator capability search", () => {
  it("searches GET /v1/mcp/tools?q= on submit and renders matching programs with their tier", async () => {
    stubFetch(DEFAULT_HANDLERS);
    render(<McpPage onNavigate={noop} />);
    await waitFor(() => expect(screen.getByText("3 tools")).toBeTruthy()); // wait for initial mount fetches to settle

    fireEvent.change(screen.getByLabelText("Search programs and generators"), { target: { value: "checkout" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => expect(screen.getByText("agentic-purchasing")).toBeTruthy());
    expect(screen.getByText("pro")).toBeTruthy();
    expect(screen.getByText("POST /v1/agentic-purchasing/generate")).toBeTruthy();
  });
});

describe("McpPage — platform install tabs (fed live by GET /v1/install/:platform)", () => {
  it("loads the default (Claude Desktop) tab's config on mount", async () => {
    stubFetch(DEFAULT_HANDLERS);
    render(<McpPage onNavigate={noop} />);

    await waitFor(() => expect(screen.getByText("claude_desktop_config.json")).toBeTruthy());
    expect(screen.getByText(/"mcpServers"/)).toBeTruthy();
  });

  it("switching to Claude Code fetches and renders a copyable command, not a JSON config", async () => {
    stubFetch(DEFAULT_HANDLERS);
    render(<McpPage onNavigate={noop} />);
    await waitFor(() => expect(screen.getByText("claude_desktop_config.json")).toBeTruthy());

    fireEvent.click(screen.getByRole("tab", { name: "Claude Code" }));

    await waitFor(() => expect(screen.getByText("claude-code CLI")).toBeTruthy());
    expect(screen.getByText(/claude mcp add axis-iliad/)).toBeTruthy();
  });

  it("shows a retry option when a platform's config fails to load", async () => {
    stubFetch([...DEFAULT_HANDLERS.filter(([m]) => m !== "/v1/install/claude-desktop"), ["/v1/install/claude-desktop", { error: "install service down" }, 500]]);
    render(<McpPage onNavigate={noop} />);

    await screen.findByText("install service down");
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});

describe("McpPage — probe-intent live demo (acceptance: returns a real routing suggestion)", () => {
  it("submitting an intent POSTs /probe-intent and renders the recommendation, flagging the recommended tool", async () => {
    stubFetch(DEFAULT_HANDLERS);
    render(<McpPage onNavigate={noop} />);
    await waitFor(() => expect(screen.getByText("3 tools")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("What are you trying to do?"), {
      target: { value: "I need to prep my checkout flow for Visa compliance" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Get a recommendation" }));

    await waitFor(() => expect(screen.getByText("prepare_agentic_purchasing")).toBeTruthy());
    expect(screen.getByText("search_and_discover_tools")).toBeTruthy();
    expect(screen.getByText("Recommended")).toBeTruthy();
    expect(screen.getByText("Requires API key")).toBeTruthy();
    expect(screen.getByText("No auth")).toBeTruthy();
  });

  it("the submit button stays disabled for empty/whitespace-only input", async () => {
    stubFetch(DEFAULT_HANDLERS);
    render(<McpPage onNavigate={noop} />);
    await waitFor(() => expect(screen.getByText("3 tools")).toBeTruthy());

    const submit = () => screen.getByRole("button", { name: "Get a recommendation" }) as HTMLButtonElement;
    expect(submit().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("What are you trying to do?"), { target: { value: "   " } });
    expect(submit().disabled).toBe(true);
  });
});

describe("McpPage — integration guide", () => {
  it("renders a copyable API-key curl example against the canonical API origin", async () => {
    stubFetch(DEFAULT_HANDLERS);
    render(<McpPage onNavigate={noop} />);

    await waitFor(() => expect(screen.getByText(/POST .*\/v1\/accounts/)).toBeTruthy());
  });

  it("renders the self-hosting env-var guidance and the programmatic-install curl examples", async () => {
    stubFetch(DEFAULT_HANDLERS);
    render(<McpPage onNavigate={noop} />);

    await waitFor(() => expect(screen.getByText("Self-hosting: sovereign embeddings + LLM")).toBeTruthy());
    expect(screen.getByText(/AXIS_EMBEDDING_MODEL_PATH/)).toBeTruthy();
    expect(screen.getByText("Programmatic install")).toBeTruthy();
    expect(screen.getByText(/curl .*\/v1\/install/)).toBeTruthy();
  });
});
