// InstallPage — one-click MCP install configs for every platform
import { useState } from "react";

const API_BASE = "https://axis-api-6c7z.onrender.com";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <button
      onClick={handleCopy}
      style={{
        position: "absolute", top: 8, right: 8,
        background: copied ? "var(--green)" : "var(--bg-hover)",
        color: copied ? "#fff" : "var(--text-muted)",
        border: "1px solid var(--border)", borderRadius: "var(--radius)",
        fontSize: "0.7rem", padding: "3px 8px", cursor: "pointer",
        fontFamily: "var(--font)", transition: "background 0.15s, color 0.15s",
      }}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function ConfigBlock({ code, label }: { code: string; label: string }) {
  return (
    <div style={{ position: "relative", marginBottom: 14 }}>
      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: 4, fontWeight: 600 }}>{label}</div>
      <pre style={{
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "14px 16px",
        fontFamily: "var(--mono)",
        fontSize: "0.78rem",
        lineHeight: 1.6,
        overflowX: "auto",
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
        color: "var(--text)",
      }}>
        {code}
      </pre>
      <CopyButton text={code} />
    </div>
  );
}

const PLATFORMS = [
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    file: "claude_desktop_config.json",
    path: "%APPDATA%/Claude/claude_desktop_config.json (Windows)\n~/Library/Application Support/Claude/claude_desktop_config.json (macOS)",
    config: JSON.stringify({
      mcpServers: {
        "axis-toolbox": {
          url: `${API_BASE}/mcp`,
          headers: { Authorization: "Bearer $AXIS_API_KEY" },
        },
      },
    }, null, 2),
  },
  {
    id: "claude-code",
    name: "Claude Code",
    file: "Terminal command",
    path: "Run in your terminal:",
    config: `claude mcp add axis-toolbox --transport http --url ${API_BASE}/mcp --header "Authorization: Bearer $AXIS_API_KEY"`,
  },
  {
    id: "cursor",
    name: "Cursor",
    file: ".cursor/mcp.json",
    path: "Place in your project root or ~/.cursor/mcp.json",
    config: JSON.stringify({
      mcpServers: {
        "axis-toolbox": {
          url: `${API_BASE}/mcp`,
          headers: { Authorization: "Bearer $AXIS_API_KEY" },
        },
      },
    }, null, 2),
  },
  {
    id: "vscode",
    name: "VS Code",
    file: ".vscode/mcp.json",
    path: "Place in your project root. Requires VS Code 1.99+ with GitHub Copilot.",
    config: JSON.stringify({
      servers: {
        "axis-toolbox": {
          type: "http",
          url: `${API_BASE}/mcp`,
          headers: { Authorization: "Bearer $AXIS_API_KEY" },
        },
      },
    }, null, 2),
  },
];

export function InstallPage() {
  const [active, setActive] = useState("claude-desktop");
  const platform = PLATFORMS.find(p => p.id === active) ?? PLATFORMS[0];

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 4px" }}>
      <div className="card" style={{ marginBottom: 24, padding: "28px 28px 24px" }}>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 8 }}>
          Install AXIS Toolbox
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: 20 }}>
          Add AXIS as an MCP server in your AI tool. One config block — your assistant gets 7 tools, 18 programs, and 81 generators for any codebase.
        </p>

        {/* Platform tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--border)", paddingBottom: 0 }}>
          {PLATFORMS.map(p => (
            <button key={p.id} onClick={() => setActive(p.id)} style={{
              padding: "8px 16px", fontSize: "0.8rem", fontWeight: active === p.id ? 700 : 400,
              background: "none", border: "none", cursor: "pointer",
              color: active === p.id ? "var(--accent)" : "var(--text-muted)",
              borderBottom: active === p.id ? "2px solid var(--accent)" : "2px solid transparent",
              marginBottom: -1, transition: "color 0.1s",
            }}>{p.name}</button>
          ))}
        </div>

        {/* Config display */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.6 }}>
            <strong style={{ color: "var(--text)" }}>File:</strong> <code style={{ fontFamily: "var(--mono)", fontSize: "0.78rem" }}>{platform.file}</code>
            <br />
            <strong style={{ color: "var(--text)" }}>Location:</strong> {platform.path}
          </div>
          <ConfigBlock code={platform.config} label={platform.id === "claude-code" ? "Command" : "Config"} />
        </div>

        {/* Get API key */}
        <div style={{ padding: "14px 16px", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--bg)", marginBottom: 16 }}>
          <div style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: 8 }}>Get a free API key</div>
          <ConfigBlock
            code={`curl -X POST ${API_BASE}/v1/accounts \\
  -H "Content-Type: application/json" \\
  -d '{"email":"you@example.com","name":"My Agent","tier":"free"}'

# Response: { "api_key": { "raw_key": "axis_..." } }`}
            label="bash"
          />
          <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", margin: 0 }}>
            Replace <code style={{ fontFamily: "var(--mono)" }}>$AXIS_API_KEY</code> in the config above with your <code style={{ fontFamily: "var(--mono)" }}>raw_key</code>.
          </p>
        </div>
      </div>

      {/* What you get */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 12 }}>What Your Agent Gets</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { label: "10 MCP Tools", desc: "analyze_repo, analyze_files, list_programs, get_snapshot, get_artifact, prepare_for_agentic_purchasing, search_and_discover_tools, discover_agentic_commerce_tools, improve_my_agent_with_axis, discover_agentic_purchasing_needs" },
            { label: "18 Programs", desc: "search, skills, debug, frontend, seo, optimization, theme, brand, superpowers, marketing, notebook, obsidian, mcp, artifacts, remotion, canvas, algorithmic, agentic-purchasing" },
            { label: "81 Generators", desc: "AGENTS.md, CLAUDE.md, .cursorrules, mcp-config.json, debug-playbook.md, design-tokens.json, and 75 more" },
            { label: "Autonomous Payment", desc: "HTTP 402 → MPP challenge → Stripe payment → retry. $0.50/run. No human needed." },
          ].map(item => (
            <div key={item.label} style={{ padding: "12px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
              <div style={{ fontSize: "0.78rem", fontWeight: 700, marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.5 }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Programmatic fetch */}
      <div className="card" style={{ marginBottom: 8 }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 12 }}>Programmatic Install</h2>
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 14 }}>
          Agents can fetch install configs directly from the API:
        </p>
        <ConfigBlock
          code={`# All platforms
curl ${API_BASE}/v1/install

# Specific platform
curl ${API_BASE}/v1/install/claude-desktop
curl ${API_BASE}/v1/install/cursor
curl ${API_BASE}/v1/install/vscode
curl ${API_BASE}/v1/install/claude-code

# Agent-first onboarding manifest
curl ${API_BASE}/for-agents`}
          label="bash"
        />
      </div>
    </div>
  );
}
