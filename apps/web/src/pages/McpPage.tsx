import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PageId } from "../routes.tsx";
import {
  getMcpManifest,
  listMcpTools,
  searchMcpTools,
  getInstallConfig,
  apiErrorDetails,
  ApiError,
  type McpManifest,
  type McpToolDefinition,
  type McpToolSchemaProperty,
  type McpToolSearchResponse,
  type InstallConfigResponse,
} from "../api.ts";
import { SectionHeader, StatTile, Callout, EmptyState, Skeleton, CodeBlock, Pill, TableWrap } from "../components/primitives/index.ts";
import { ProbeIntentDemo } from "../components/ProbeIntentDemo.tsx";
import { DOCS_API_BASE, TOOL_COUNT, PROGRAM_COUNT } from "../config.ts";
import { useTabList } from "../useTabList.ts";

// ─── McpPage (WO-P8) ────────────────────────────────────────────────────────
// Merges the old InstallPage (per-platform install configs) and ToolsIndexPage
// (a hand-maintained catalog mapping 9 click-console entries to MCP tool
// names, 6 of them permanently "coming soon") into one page whose every list
// is fetched live: the manifest (GET /v1/mcp/server.json), the full 38-tool
// registry (POST /mcp {method:"tools/list"} — see api.ts's listMcpTools for
// why this beats the two other MCP-ish endpoints for this job), per-program
// capability search (GET /v1/mcp/tools?q=&program=), per-platform install
// configs (GET /v1/install/:platform), and a live intent-routing demo
// (POST /probe-intent). Nothing here is hardcoded — the acceptance bar this
// build-plan work order sets is "change a tool server-side, see the page
// change," and every section below satisfies that by construction.
//
// Every endpoint used on this page is public — no loading state here ever
// needs a sign-in gate or an UpsellModal.

interface Props {
  /** Used only by the tool registry's "try it in the browser" cross-link for
   *  tools that have a real built console page (currently just Web Research —
   *  see CONSOLE_LINKS below). */
  onNavigate: (page: PageId) => void;
}

export function McpPage({ onNavigate }: Props) {
  return (
    <div>
      <SectionHeader
        title="MCP Configuration"
        sub={`Connect Axis' Iliad to your AI tools over the Model Context Protocol — ${TOOL_COUNT} tools behind one endpoint, all live from the API.`}
        level="h1"
      />
      <ManifestPanel />
      <ToolRegistry onOpenConsole={onNavigate} />
      <ProgramCapabilitySearch />
      <PlatformTabs />
      <SelfHostingCard />
      <ProgrammaticInstallCard />
      <ProbeIntentDemo />
    </div>
  );
}

// ─── Shared loading/error scaffolding ────────────────────────────
// The same three-state shape (loading / error+retry / content) repeats across
// every auto-fetching section below — small enough not to warrant its own
// primitive, but kept as one helper so the states read identically everywhere.

interface AsyncError {
  message: string;
  details: string | null;
}

function toAsyncError(err: unknown, fallback: string): AsyncError {
  return { message: err instanceof ApiError ? err.message : fallback, details: apiErrorDetails(err) };
}

function ErrorRetry({ error, onRetry }: { error: AsyncError; onRetry: () => void }) {
  return (
    <Callout tone="danger" title="Couldn't load this from the API" details={error.details}>
      {error.message} <button type="button" className="btn" onClick={onRetry}>Retry</button>
    </Callout>
  );
}

// ─── 1. Manifest panel ────────────────────────────────────────────

interface McpMonetization {
  model?: string;
  standard_price_cents_range?: [number, number];
  pricing_note?: string;
  budget_header?: string;
}

interface McpAuthentication {
  type?: string;
  description?: string;
}

function ManifestPanel() {
  const [manifest, setManifest] = useState<McpManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AsyncError | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return getMcpManifest()
      .then(setManifest)
      .catch((err) => setError(toAsyncError(err, "Failed to load the MCP manifest")))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const meta = (manifest?._meta ?? {}) as Record<string, unknown>;
  const monetization = meta.monetization as McpMonetization | undefined;
  const authentication = meta.authentication as McpAuthentication | undefined;
  const categories = Array.isArray(meta.categories) ? (meta.categories as string[]) : [];
  const transport = typeof meta.transport === "string" ? meta.transport : null;

  return (
    <div className="card mb-4">
      <div className="flex-between mb-2" style={{ flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Server manifest</h2>
        <span className="badge badge-green">Live · GET /v1/mcp/server.json</span>
      </div>
      {loading ? (
        <div role="status" aria-live="polite"><Skeleton lines={4} /></div>
      ) : error ? (
        <ErrorRetry error={error} onRetry={() => void load()} />
      ) : manifest ? (
        <>
          <div className="grid grid-4 mb-3">
            <StatTile label="Server" value={manifest.server.name} hint={manifest.server.slug} />
            <StatTile label="Version" value={manifest.server.version} />
            <StatTile label="Tools" value={manifest.tools.length} />
            <StatTile label="Transport" value={transport ?? "http"} />
          </div>
          <p className="text-muted text-sm mb-2">
            Endpoint: <code className="mono">{manifest.server.endpoint}</code>
          </p>
          {authentication?.description && <p className="text-muted text-sm mb-2">{authentication.description}</p>}
          {monetization?.pricing_note && (
            <p className="text-muted text-sm mb-2">
              {monetization.pricing_note}
              {monetization.budget_header && <> · negotiate reduced pricing with <code className="mono">{monetization.budget_header}</code></>}
            </p>
          )}
          {categories.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {categories.map((c) => <Pill key={c} tone="outline">{c}</Pill>)}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

// ─── 2. Tool registry — searchable, per-tool detail ───────────────

/** Tools with a real, built click-console page (a ToolPage instance) beyond
 *  this MCP-config page — currently just Web Research. Extend as more ship. */
const CONSOLE_LINKS: Record<string, { page: PageId; label: string }> = {
  iliad_web_research: { page: "tool-web-research", label: "Try Web Research in the browser" },
};

function pluralTools(n: number): string {
  return `${n} tool${n === 1 ? "" : "s"}`;
}

function schemaTypeLabel(prop: McpToolSchemaProperty | undefined): string {
  if (!prop?.type) return "any";
  if (prop.type === "array") {
    const itemType = prop.items?.type;
    return `array<${typeof itemType === "string" ? itemType : "object"}>`;
  }
  return prop.type;
}

function ToolRow({ tool, expanded, onToggle, onOpenConsole }: {
  tool: McpToolDefinition;
  expanded: boolean;
  onToggle: () => void;
  onOpenConsole?: (page: PageId) => void;
}) {
  const properties = tool.inputSchema?.properties ?? {};
  const propEntries = Object.entries(properties);
  const required = new Set(tool.inputSchema?.required ?? []);
  const example = tool.examples?.[0];
  const consoleLink = CONSOLE_LINKS[tool.name];

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "10px 12px" }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex-between"
        style={{ width: "100%", background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit", gap: 8 }}
      >
        <span>
          <span className="mono" style={{ fontWeight: 600 }}>{tool.name}</span>
          {tool.annotations?.readOnlyHint && <Pill tone="outline">read-only</Pill>}
          {tool.annotations?.idempotentHint && <Pill tone="outline">idempotent</Pill>}
        </span>
        <span className="text-muted text-xs">{expanded ? "▲ hide" : "▼ details"}</span>
      </button>

      {!expanded && (
        <p className="text-muted text-sm mt-1" style={{ margin: "4px 0 0" }}>
          {tool.description.length > 160 ? `${tool.description.slice(0, 160)}…` : tool.description}
        </p>
      )}

      {expanded && (
        <div className="mt-3">
          <p className="text-sm mb-3">{tool.description}</p>

          {propEntries.length > 0 && (
            <div className="mb-3">
              <div className="text-muted text-xs mb-1" style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.02em" }}>
                Arguments
              </div>
              <TableWrap label={`${tool.name} arguments`}>
                <table>
                  <thead>
                    <tr><th>Name</th><th>Type</th><th>Required</th><th>Description</th></tr>
                  </thead>
                  <tbody>
                    {propEntries.map(([name, prop]) => (
                      <tr key={name}>
                        <td className="mono">{name}</td>
                        <td className="mono text-muted">{schemaTypeLabel(prop)}</td>
                        <td>{required.has(name) ? "Yes" : "—"}</td>
                        <td className="text-muted">{prop.description ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </div>
          )}

          {example && (
            <div className="mb-3">
              <CodeBlock label={`Example — ${example.name}`} code={JSON.stringify(example.input ?? {}, null, 2)} maxHeight={260} />
            </div>
          )}

          <details className="mb-3">
            <summary className="text-muted text-xs" style={{ cursor: "pointer" }}>Raw input/output schema (JSON)</summary>
            <CodeBlock code={JSON.stringify({ inputSchema: tool.inputSchema ?? null, outputSchema: tool.outputSchema ?? null }, null, 2)} maxHeight={300} />
          </details>

          {consoleLink && onOpenConsole && (
            <button type="button" className="btn btn-primary" onClick={() => onOpenConsole(consoleLink.page)}>
              {consoleLink.label} →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ToolRegistry({ onOpenConsole }: { onOpenConsole?: (page: PageId) => void }) {
  const [tools, setTools] = useState<McpToolDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AsyncError | null>(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return listMcpTools()
      .then(setTools)
      .catch((err) => setError(toAsyncError(err, "Failed to load the tool registry")))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter((t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
  }, [tools, query]);

  return (
    <div className="card mb-4">
      <div className="flex-between mb-2" style={{ flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Tool registry</h2>
        {!loading && !error && <span className="badge badge-accent">{pluralTools(tools.length)} · live · POST /mcp tools/list</span>}
      </div>
      {loading ? (
        <div role="status" aria-live="polite"><Skeleton lines={5} /></div>
      ) : error ? (
        <ErrorRetry error={error} onRetry={() => void load()} />
      ) : (
        <>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by tool name or description..."
            aria-label="Search MCP tools"
            className="mb-3"
          />
          <p className="text-muted text-sm mb-2" role="status">
            {filtered.length === tools.length ? pluralTools(tools.length) : `${filtered.length} of ${pluralTools(tools.length)}`}
          </p>
          {filtered.length === 0 ? (
            <EmptyState icon="search" title="No tools match your search" cta={{ label: "Clear search", onClick: () => setQuery("") }} />
          ) : (
            <div className="stack">
              {filtered.map((tool) => (
                <ToolRow
                  key={tool.name}
                  tool={tool}
                  expanded={expanded === tool.name}
                  onToggle={() => setExpanded((cur) => (cur === tool.name ? null : tool.name))}
                  onOpenConsole={onOpenConsole}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── 3. Program & generator capability search ─────────────────────
// A different question than the tool registry above: this searches the 20
// *programs* (the generator bundles behind tools like analyze_repo) by
// capability keyword — GET /v1/mcp/tools?q=&program=, api.ts's searchMcpTools.
// Kept as its own small panel (mirrors RunnerPage's SearchIndexPanel) rather
// than folded into the tool-registry search box above, since it answers a
// genuinely different question with a genuinely different result shape.

function ProgramCapabilitySearch() {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<McpToolSearchResponse | null>(null);
  const [error, setError] = useState<AsyncError | null>(null);
  // H-Phase-A bulk sweep: Enter fires handleSearch on every keypress with no
  // in-flight guard, and setResult ran unconditionally -- two rapid searches
  // whose responses arrive out of order let the older one silently overwrite
  // the newer results. Same shape as SearchTab.tsx/RunnerPage.tsx's fix.
  const searchRequestIdRef = useRef(0);

  async function handleSearch() {
    const q = query.trim();
    if (!q) return;
    const requestId = ++searchRequestIdRef.current;
    setSearching(true);
    setError(null);
    try {
      const res = await searchMcpTools(q);
      if (requestId !== searchRequestIdRef.current) return;
      setResult(res);
    } catch (err) {
      if (requestId !== searchRequestIdRef.current) return;
      setError(toAsyncError(err, "Search failed"));
    } finally {
      if (requestId === searchRequestIdRef.current) setSearching(false);
    }
  }

  return (
    <div className="card mb-4">
      <h2 className="mb-2" style={{ fontSize: "1rem", fontWeight: 600 }}>Search programs &amp; generators</h2>
      <p className="text-muted text-sm mb-3">
        A different catalog than the tool registry above — search AXIS's {PROGRAM_COUNT} <em>programs</em> (the
        generator bundles behind tools like <code className="mono">analyze_repo</code>) by capability keyword.
      </p>
      <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void handleSearch(); }}
          placeholder="e.g. checkout, docker, design tokens…"
          aria-label="Search programs and generators"
          style={{ flex: "1 1 220px" }}
        />
        <button type="button" className="btn" disabled={searching || !query.trim()} onClick={() => void handleSearch()}>
          {searching ? "Searching…" : "Search"}
        </button>
      </div>
      {error && (
        <div className="mt-2">
          <Callout tone="danger" details={error.details}>{error.message}</Callout>
        </div>
      )}
      {result && (
        result.results.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No programs match your search" message={`No programs match "${result.query}".`} />
          </div>
        ) : (
          <div className="stack mt-3">
            {result.results.slice(0, 8).map((m) => (
              <div key={m.program} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "8px 12px" }}>
                <div className="flex-between mb-1">
                  <span className="mono" style={{ fontWeight: 600 }}>{m.program}</span>
                  <span className={`badge ${m.tier === "free" ? "badge-green" : "badge-accent"}`}>{m.tier}</span>
                </div>
                {m.capability_tags.length > 0 && (
                  <div className="flex gap-2 flex-wrap mb-1">
                    {m.capability_tags.slice(0, 6).map((t) => <Pill key={t} tone="outline">{t}</Pill>)}
                  </div>
                )}
                <code className="mono text-xs text-muted">{m.example_call}</code>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ─── 4. Platform install tabs ──────────────────────────────────────
// Fed by GET /v1/install/:platform (fetched per tab, cached in memory) —
// replaces InstallPage's hardcoded PLATFORMS array of copy-pasted config
// strings, which could drift from what the server actually hands out.

const PLATFORMS: Array<{ id: string; name: string }> = [
  { id: "claude-desktop", name: "Claude Desktop" },
  { id: "claude-code", name: "Claude Code" },
  { id: "cursor", name: "Cursor" },
  { id: "vscode", name: "VS Code" },
];

function isCommandConfig(config: Record<string, unknown>): config is { command: string } {
  return typeof config.command === "string" && Object.keys(config).length === 1;
}

function PlatformTabs() {
  const [active, setActive] = useState(PLATFORMS[0].id);
  const [cache, setCache] = useState<Record<string, InstallConfigResponse>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, AsyncError>>({});

  const load = useCallback((platform: string) => {
    setLoading((prev) => ({ ...prev, [platform]: true }));
    setErrors((prev) => { const { [platform]: _drop, ...rest } = prev; return rest; });
    getInstallConfig(platform)
      .then((res) => setCache((prev) => ({ ...prev, [platform]: res })))
      .catch((err) => setErrors((prev) => ({ ...prev, [platform]: toAsyncError(err, "Failed to load this platform's config") })))
      .finally(() => setLoading((prev) => ({ ...prev, [platform]: false })));
  }, []);

  // Fires on every tab switch; the guard also covers re-renders triggered by
  // `load` itself (cache/loading/errors all change while a fetch is in
  // flight or after it settles) WITHOUT auto-retrying a failed platform —
  // only the explicit Retry button (which calls `load` directly) does that.
  useEffect(() => {
    if (cache[active] || loading[active] || errors[active]) return;
    load(active);
  }, [active, cache, loading, errors, load]);

  const current = cache[active];
  const error = errors[active];
  const codeText = current ? (isCommandConfig(current.config) ? current.config.command : JSON.stringify(current.config, null, 2)) : "";
  const platformIds = PLATFORMS.map((p) => p.id);
  const { tabListProps, getTabProps, getPanelProps } = useTabList(platformIds, active, setActive);

  return (
    <div className="card mb-4">
      <h2 className="mb-2" style={{ fontSize: "1rem", fontWeight: 600 }}>Connect your AI tool</h2>
      <p className="text-muted text-sm mb-3">One config, live from the API — your assistant gets {TOOL_COUNT} tools across a single MCP connection.</p>

      <CodeBlock
        label="Get a free API key"
        code={`curl -X POST ${DOCS_API_BASE}/v1/accounts \\\n  -H "Content-Type: application/json" \\\n  -d '{"email":"you@example.com","name":"My Agent","tier":"free"}'\n\n# Response: { "api_key": { "raw_key": "axis_..." } }`}
      />

      <div className="tabs" aria-label="MCP client platform" {...tabListProps}>
        {PLATFORMS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`tab ${active === p.id ? "active" : ""}`}
            onClick={() => setActive(p.id)}
            {...getTabProps(p.id)}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div {...getPanelProps(active)}>
        {loading[active] && !current ? (
          <div role="status" aria-live="polite"><Skeleton lines={4} /></div>
        ) : error && !current ? (
          <ErrorRetry error={error} onRetry={() => load(active)} />
        ) : current ? (
          <div>
            <p className="text-sm mb-1">
              <strong>File:</strong> <code className="mono">{current.file}</code>
            </p>
            <p className="text-muted text-sm mb-3">{current.description}</p>
            <CodeBlock label={isCommandConfig(current.config) ? "Command" : "Config"} code={codeText} wrap />
            <p className="text-muted text-xs" style={{ margin: 0 }}>
              Replace <code className="mono">$&#123;AXIS_API_KEY&#125;</code> with your <code className="mono">raw_key</code> from above.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── 5. Integration guide ───────────────────────────────────────────

function SelfHostingCard() {
  return (
    <div className="card mb-4">
      <h2 className="mb-2" style={{ fontSize: "1rem", fontWeight: 600 }}>Self-hosting: sovereign embeddings + LLM</h2>
      <p className="text-muted text-sm mb-3">
        <code className="mono">iliad_embeddings</code> and <code className="mono">iliad_llm_inference</code> run
        AXIS-owned, in-process (node-llama-cpp) by default — no upstream provider call. Each returns a structured{" "}
        <code className="mono">_not_configured</code> envelope until the operator provisions a GGUF model file:
      </p>
      <CodeBlock
        label="env"
        code={`# Embeddings (default backend: local, in-process)\nAXIS_EMBEDDING_MODEL_PATH=/path/to/bge-small-en-v1.5-q4_k_m.gguf   # embedding-capable GGUF (~130MB, MIT)\n# Optional: legacy OpenAI proxy instead of the local backend\nAXIS_EMBEDDING_BACKEND=openai   # + OPENAI_API_KEY (and optionally OPENAI_EMBEDDING_MODEL)\n\n# LLM completions (in-process)\nAXIS_LLM_MODEL_PATH=/path/to/Llama-3.2-1B-Instruct-Q4_K_M.gguf`}
      />
      <p className="text-muted text-sm" style={{ margin: 0 }}>
        Retrieval quality is bounded by the model you provision (bge-small is 384-dim). On the hosted instance these
        are provisioned by the AXIS operator.
      </p>
    </div>
  );
}

function ProgrammaticInstallCard() {
  return (
    <div className="card mb-4">
      <h2 className="mb-2" style={{ fontSize: "1rem", fontWeight: 600 }}>Programmatic install</h2>
      <p className="text-muted text-sm mb-3">Agents can fetch install configs directly from the API:</p>
      <CodeBlock
        label="bash"
        code={`# All platforms\ncurl ${DOCS_API_BASE}/v1/install\n\n# Specific platform\ncurl ${DOCS_API_BASE}/v1/install/claude-desktop\ncurl ${DOCS_API_BASE}/v1/install/cursor\ncurl ${DOCS_API_BASE}/v1/install/vscode\ncurl ${DOCS_API_BASE}/v1/install/claude-code\n\n# Agent-first onboarding manifest\ncurl ${DOCS_API_BASE}/for-agents`}
      />
    </div>
  );
}

