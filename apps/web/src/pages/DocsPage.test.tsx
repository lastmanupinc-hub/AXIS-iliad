/**
 * @vitest-environment happy-dom
 */

// WO-P13 — Documentation Hub: replaces the static ApiSection with a live
// GET /openapi.json explorer (tag-grouped, expandable, copy-curl), adds an
// MCP Protocol summary tab and an Example Artifacts tab, and fixes a real
// drift bug this same work order uncovered — PROGRAM_DOCS was missing 3
// programs (agentic-purchasing/closer/deploy), silently undercounting the
// Programs tab's Free/Pro badges relative to config.ts's pinned totals.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DocsPage } from "./DocsPage.tsx";
import { FREE_PROGRAM_COUNT, PRO_PROGRAM_COUNT, PROGRAM_COUNT } from "../config.ts";

/** Fetch stub routed by URL substring: [match, body, status?][] (first hit
 *  wins — the convention established by McpPage.test.tsx). */
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

const OPENAPI_SPEC = {
  openapi: "3.1.0",
  info: { title: "Axis' Iliad API", version: "1.2.3" },
  paths: {
    "/v1/health": {
      get: { summary: "Health check", operationId: "getHealth", tags: ["Health"], responses: { 200: { description: "ok" } } },
    },
    "/v1/snapshots/{snapshot_id}": {
      get: {
        summary: "Get snapshot by ID",
        operationId: "getSnapshot",
        tags: ["Snapshots"],
        security: [{ apiKey: [] }],
        parameters: [{ name: "snapshot_id", in: "path", required: true, description: "Snapshot identifier" }],
        responses: { 200: { description: "ok" }, 404: { description: "not found" } },
      },
    },
    "/v1/agentic-purchasing/generate": {
      post: {
        summary: "Generate agentic purchasing artifacts",
        operationId: "agenticPurchasingGenerate",
        tags: ["Programs"],
        security: [{ apiKey: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", required: ["snapshot_id"], properties: { snapshot_id: { type: "string", description: "Snapshot id" } } },
            },
          },
        },
        responses: { 200: { description: "Program output files" } },
      },
    },
  },
  components: { securitySchemes: { apiKey: {} }, schemas: {} },
};

const MCP_MANIFEST = {
  server: { name: "Axis' Iliad", slug: "axis-iliad", version: "0.5.3", endpoint: "https://x/mcp" },
  tools: [{ name: "list_programs", description: "d" }, { name: "analyze_repo", description: "d2" }],
  _meta: {
    transport: "http",
    authentication: { type: "bearer", description: "API key in Authorization header: Bearer <api_key>." },
  },
};

const ERROR_CODE_CATALOG_FIXTURE = {
  rest_error_codes: [
    { code: "AUTH_REQUIRED", statuses: [401], retryable: "no", retry_guidance: "Add an Authorization header.", description: "No Authorization header was present." },
    { code: "QUOTA_EXCEEDED", statuses: [429], retryable: "yes", retry_guidance: "Wait for the quota to reset.", description: "The account's monthly quota was reached." },
  ],
  mcp_tool_error_categories: {
    note: "MCP tools/call errors attach a coarser _error code.",
    categories: [
      { code: "auth", retryable: false, description: "API key missing or invalid." },
      { code: "quota", retryable: true, description: "Quota exceeded." },
    ],
  },
  envelope: { rest: "{ error, error_code, request_id }", mcp: "{ content, isError, _error }" },
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("DocsPage — Overview", () => {
  it("renders the 8-category breakdown, matching the actual Program Categories grid", async () => {
    render(<DocsPage onNavigate={noop} />);
    expect(screen.getByText(/organized into 8 categories/)).toBeTruthy();
    expect(screen.getByText("Agentic Commerce")).toBeTruthy();
    expect(screen.getByText("Design System")).toBeTruthy();
  });
});

describe("DocsPage — Programs tab (regression: PROGRAM_DOCS drift)", () => {
  it("Free/Pro program badge counts match config.ts's pinned totals, not a stale hand-maintained array", async () => {
    render(<DocsPage onNavigate={noop} />);
    fireEvent.click(screen.getByRole("button", { name: /Programs/ }));

    expect(screen.getByText(`${FREE_PROGRAM_COUNT} programs`)).toBeTruthy();
    expect(screen.getByText(`${PRO_PROGRAM_COUNT} programs`)).toBeTruthy();
  });

  it("includes cards for the previously-missing agentic-purchasing, closer, and deploy programs", async () => {
    render(<DocsPage onNavigate={noop} />);
    fireEvent.click(screen.getByRole("button", { name: /Programs/ }));

    expect(screen.getByText("Agentic Purchasing")).toBeTruthy();
    expect(screen.getByText("Closer / Packaging")).toBeTruthy();
    expect(screen.getByText("Axis Deploy")).toBeTruthy();
  });
});

describe("DocsPage — Outputs tab (regression: same PROGRAM_DOCS drift, different table)", () => {
  it("full output inventory covers all 20 programs, not 17", async () => {
    render(<DocsPage onNavigate={noop} />);
    fireEvent.click(screen.getByRole("button", { name: /Output Formats/ }));

    // Each PROGRAM_DOCS row renders its label once in this table.
    expect(screen.getByText("Agentic Purchasing")).toBeTruthy();
    expect(screen.getByText("Closer / Packaging")).toBeTruthy();
    expect(screen.getByText("Axis Deploy")).toBeTruthy();
    expect(screen.getByText(new RegExp(`all ${PROGRAM_COUNT} programs`))).toBeTruthy();
  });
});

describe("DocsPage — API Reference (live OpenAPI explorer)", () => {
  it("loads the live spec, groups by tag, and shows accurate live counts", async () => {
    stubFetch([["/openapi.json", OPENAPI_SPEC]]);
    render(<DocsPage onNavigate={noop} />);
    fireEvent.click(screen.getByRole("button", { name: /API Reference/ }));

    await waitFor(() => expect(screen.getByText("Axis' Iliad API")).toBeTruthy());
    expect(screen.getByText(/v1\.2\.3/)).toBeTruthy();
    expect(screen.getByText(/3 endpoints/)).toBeTruthy();
    expect(screen.getByText(/3 tags/)).toBeTruthy();
    expect(screen.getByText("Health")).toBeTruthy();
    expect(screen.getByText("Snapshots")).toBeTruthy();
    // Regex (not a plain string match): the top-level tab switcher has its
    // own "Programs" button, so this must target the accordion's OWN tag
    // heading specifically (the only one paired with an endpoint count).
    expect(screen.getByRole("button", { name: /Programs.*endpoint/ })).toBeTruthy();
  });

  it("expanding a tag then an endpoint reveals parameters, request-body schema, and a working copy-curl block", async () => {
    stubFetch([["/openapi.json", OPENAPI_SPEC]]);
    render(<DocsPage onNavigate={noop} />);
    fireEvent.click(screen.getByRole("button", { name: /API Reference/ }));

    const tagButton = await screen.findByRole("button", { name: /Programs.*endpoint/ });
    fireEvent.click(tagButton);
    const endpointRow = await screen.findByText("/v1/agentic-purchasing/generate");
    fireEvent.click(endpointRow);

    // Request body schema renders the required "snapshot_id" field.
    expect(await screen.findByText("snapshot_id")).toBeTruthy();

    // The curl block includes the correct single-prefixed path, a Bearer
    // header (this endpoint's spec entry declares `security`), and does NOT
    // hardcode localhost — this is the acceptance bar: "copy a working curl".
    const codeEl = document.querySelector(".code-block-pre");
    expect(codeEl?.textContent).toContain("/v1/agentic-purchasing/generate");
    expect(codeEl?.textContent).toContain("Authorization: Bearer");
    expect(codeEl?.textContent).not.toContain("localhost");
  });

  it("a public endpoint with no `security` entry renders its curl with no Authorization header", async () => {
    stubFetch([["/openapi.json", OPENAPI_SPEC]]);
    render(<DocsPage onNavigate={noop} />);
    fireEvent.click(screen.getByRole("button", { name: /API Reference/ }));

    await waitFor(() => expect(screen.getByText("Health")).toBeTruthy());
    fireEvent.click(screen.getByText("Health"));
    fireEvent.click(await screen.findByText("/v1/health"));

    const codeEl = document.querySelector(".code-block-pre");
    expect(codeEl?.textContent).not.toContain("Authorization");
  });

  it("shows a retry option when the live spec fails to load", async () => {
    stubFetch([["/openapi.json", { error: "spec unavailable" }, 500]]);
    render(<DocsPage onNavigate={noop} />);
    fireEvent.click(screen.getByRole("button", { name: /API Reference/ }));

    await screen.findByText("spec unavailable");

    stubFetch([["/openapi.json", OPENAPI_SPEC]]);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(screen.getByText("Axis' Iliad API")).toBeTruthy());
  });
});

describe("DocsPage — MCP Protocol tab", () => {
  it("renders a live manifest summary and links to the full MCP page", async () => {
    stubFetch([["/v1/mcp/server.json", MCP_MANIFEST]]);
    render(<DocsPage onNavigate={noop} />);
    fireEvent.click(screen.getByRole("button", { name: /MCP Protocol/ }));

    await waitFor(() => expect(screen.getByText("2")).toBeTruthy()); // tool count stat
    expect(screen.getByText("bearer")).toBeTruthy();
    expect(screen.getByText("https://x/mcp")).toBeTruthy();
  });

  it("clicking through navigates to the full MCP page, not a dead link", async () => {
    stubFetch([["/v1/mcp/server.json", MCP_MANIFEST]]);
    const onNavigate = vi.fn();
    render(<DocsPage onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("button", { name: /MCP Protocol/ }));

    const link = await screen.findByRole("button", { name: /Open the full MCP tool registry/ });
    fireEvent.click(link);
    expect(onNavigate).toHaveBeenCalledWith("mcp");
  });
});

describe("DocsPage — Error Codes tab (H4.2)", () => {
  it("renders the live REST error-code table with retry guidance", async () => {
    stubFetch([["/v1/error-codes", ERROR_CODE_CATALOG_FIXTURE]]);
    render(<DocsPage onNavigate={noop} />);
    fireEvent.click(screen.getByRole("button", { name: /Error Codes/ }));

    expect(await screen.findByText("AUTH_REQUIRED")).toBeTruthy();
    expect(screen.getByText("QUOTA_EXCEEDED")).toBeTruthy();
    expect(screen.getByText("401")).toBeTruthy();
  });

  it("renders the MCP tool-call error categories separately from the REST codes", async () => {
    stubFetch([["/v1/error-codes", ERROR_CODE_CATALOG_FIXTURE]]);
    render(<DocsPage onNavigate={noop} />);
    fireEvent.click(screen.getByRole("button", { name: /Error Codes/ }));

    await screen.findByText("AUTH_REQUIRED");
    expect(screen.getByText(/MCP tools\/call errors attach a coarser/)).toBeTruthy();
    expect(screen.getByText("auth")).toBeTruthy();
  });

  it("shows a retry Callout on fetch failure, not a silent blank tab", async () => {
    stubFetch([["/v1/error-codes", { error: "boom" }, 500]]);
    render(<DocsPage onNavigate={noop} />);
    fireEvent.click(screen.getByRole("button", { name: /Error Codes/ }));

    expect(await screen.findByText(/Couldn't load the live error-code catalog/)).toBeTruthy();
  });
});

describe("DocsPage — Example Artifacts tab", () => {
  it("renders static samples honestly labeled as samples, not live output", async () => {
    render(<DocsPage onNavigate={noop} />);
    fireEvent.click(screen.getByRole("button", { name: /Example Artifacts/ }));

    expect(screen.getAllByText("Sample — not from a live analysis.").length).toBeGreaterThan(0);
    expect(screen.getByText("AGENTS.md")).toBeTruthy();
  });

  it("cross-links to real case studies and the Runner, not dead buttons", async () => {
    const onNavigate = vi.fn();
    render(<DocsPage onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("button", { name: /Example Artifacts/ }));

    fireEvent.click(screen.getByRole("button", { name: /View real case studies/ }));
    expect(onNavigate).toHaveBeenCalledWith("examples");

    fireEvent.click(screen.getByRole("button", { name: /Generate your own/ }));
    expect(onNavigate).toHaveBeenCalledWith("runner");
  });
});
