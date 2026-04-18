// ForAgentsPage â€” discovery landing for AI agents and API-first integrations
import { useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "https://axis-api-6c7z.onrender.com";

// â”€â”€â”€ Copy button â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Code block â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function CodeBlock({ code, lang = "bash" }: { code: string; lang?: string }) {
  return (
    <div style={{ position: "relative" }}>
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
        <span style={{ color: "var(--text-muted)", userSelect: "none", marginRight: 6 }}>{lang}</span>
        {code}
      </pre>
      <CopyButton text={code} />
    </div>
  );
}

// â”€â”€â”€ Section header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SectionHeader({ title, subtitle, tag }: { title: string; subtitle?: string; tag?: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <h2 style={{ fontSize: "1.15rem", fontWeight: 700 }}>{title}</h2>
        {tag && (
          <span style={{
            fontSize: "0.65rem", fontWeight: 700, padding: "2px 7px",
            borderRadius: 99, background: "var(--accent)", color: "#fff",
            letterSpacing: "0.04em", textTransform: "uppercase",
          }}>{tag}</span>
        )}
      </div>
      {subtitle && <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>{subtitle}</p>}
    </div>
  );
}

// â”€â”€â”€ Tab bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function TabBar({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 14, borderBottom: "1px solid var(--border)", paddingBottom: 0 }}>
      {tabs.map(t => (
        <button key={t} onClick={() => onChange(t)} style={{
          padding: "6px 14px", fontSize: "0.78rem", fontWeight: active === t ? 700 : 400,
          background: "none", border: "none", cursor: "pointer",
          color: active === t ? "var(--accent)" : "var(--text-muted)",
          borderBottom: active === t ? "2px solid var(--accent)" : "2px solid transparent",
          marginBottom: -1, transition: "color 0.1s",
        }}>{t}</button>
      ))}
    </div>
  );
}

// â”€â”€â”€ Programs table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const PROGRAMS = [
  { name: "search",             tier: "free", outputs: 5,  key: "AGENTS.md, .cursorrules, CLAUDE.md, context-map.json, repo-profile.yaml" },
  { name: "skills",             tier: "free", outputs: 5,  key: "AGENTS.md, CLAUDE.md, .cursorrules, workflow-pack.md, policy-pack.md" },
  { name: "debug",              tier: "free", outputs: 4,  key: "debug-playbook.md, incident-template.md, tracing-rules.md, root-cause-checklist.md" },
  { name: "frontend",           tier: "pro",  outputs: 4,  key: "frontend-rules.md, component-guidelines.md, layout-patterns.md, ui-audit.md" },
  { name: "seo",                tier: "pro",  outputs: 5,  key: "seo-rules.md, schema-recommendations.json, route-priority-map.md, content-audit.md, meta-tag-audit.json" },
  { name: "optimization",       tier: "pro",  outputs: 4,  key: "optimization-rules.md, prompt-diff-report.md, cost-estimate.json, token-budget-plan.md" },
  { name: "theme",              tier: "pro",  outputs: 5,  key: "design-tokens.json, theme.css, theme-guidelines.md, component-theme-map.json, dark-mode-tokens.json" },
  { name: "brand",              tier: "pro",  outputs: 5,  key: "brand-guidelines.md, voice-and-tone.md, content-constraints.md, messaging-system.yaml, channel-rulebook.md" },
  { name: "superpowers",        tier: "pro",  outputs: 5,  key: "superpower-pack.md, workflow-registry.json, test-generation-rules.md, refactor-checklist.md, automation-pipeline.yaml" },
  { name: "marketing",          tier: "pro",  outputs: 5,  key: "campaign-brief.md, funnel-map.md, sequence-pack.md, cro-playbook.md, ab-test-plan.md" },
  { name: "notebook",           tier: "pro",  outputs: 5,  key: "notebook-summary.md, source-map.json, study-brief.md, research-threads.md, citation-index.json" },
  { name: "obsidian",           tier: "pro",  outputs: 5,  key: "obsidian-skill-pack.md, vault-rules.md, graph-prompt-map.json, linking-policy.md, template-pack.md" },
  { name: "mcp",                tier: "pro",  outputs: 14, key: "mcp-config.json, mcp-registry-metadata.json, protocol-spec.md, spec.types.ts, mcp/README.md, mcp/project-setup.md, mcp/build-artifacts.md, mcp/package-json.root.template.json, mcp/package-json.package.template.json, mcp/tsconfig.root.template.json, mcp/tsconfig.package.template.json, connector-map.yaml, capability-registry.json, server-manifest.yaml" },
  { name: "artifacts",          tier: "pro",  outputs: 5,  key: "generated-component.tsx, dashboard-widget.tsx, embed-snippet.ts, artifact-spec.md, component-library.json" },
  { name: "remotion",           tier: "pro",  outputs: 5,  key: "remotion-script.ts, scene-plan.md, render-config.json, asset-checklist.md, storyboard.md" },
  { name: "canvas",             tier: "pro",  outputs: 5,  key: "canvas-spec.json, social-pack.md, poster-layouts.md, asset-guidelines.md, brand-board.md" },
  { name: "algorithmic",        tier: "pro",  outputs: 5,  key: "generative-sketch.ts, parameter-pack.json, collection-map.md, export-manifest.yaml, variation-matrix.json" },
  { name: "agentic-purchasing", tier: "pro",  outputs: 5,  key: "agent-purchasing-playbook.md, product-schema.json, checkout-flow.md, negotiation-rules.md, commerce-registry.json" },
];

// â”€â”€â”€ Real MCP tools â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const MCP_TOOLS = [
  { tool: "analyze_repo",                  auth: true,  desc: "Analyze any public GitHub repo. Returns snapshot_id + 96 artifacts." },
  { tool: "analyze_files",                 auth: true,  desc: "Analyze inline files [{path,content}]. Returns snapshot_id + 96 artifacts." },
  { tool: "list_programs",                 auth: false, desc: "List all 18 programs and their generators with tier info." },
  { tool: "get_snapshot",                  auth: false, desc: "Get status and full artifact listing for a prior snapshot_id." },
  { tool: "get_artifact",                  auth: false, desc: "Read full content of any artifact by path (AGENTS.md, .ai/debug-playbook.md, etc.)." },
  { tool: "prepare_agentic_purchasing",auth: true,  desc: "Full purchasing-readiness audit. Returns score 0â€“100, AP2/Visa compliance, playbooks, checkout rules, MCP config." },
  { tool: "search_and_discover_tools",     auth: false, desc: "Keyword search across all 18 programs. Use before loading full schemas." },
  { tool: "discover_commerce_tools",auth: false, desc: "Free overview of all AXIS tools with pricing, install configs, and shareable manifest." },
  { tool: "improve_my_agent_with_axis",     auth: true,  desc: "Analyze your agent's codebase, get improvement plan + missing context files + MCP config." },
  { tool: "discover_agentic_purchasing_needs", auth: false, desc: "Describe your commerce/compliance need — get tailored AXIS tool recommendations. Free intent probe." },
  { tool: "get_referral_code",              auth: true,  desc: "Get your referral token for share-to-earn micro-discounts." },
  { tool: "get_referral_credits",           auth: true,  desc: "Check referral earnings, conversions, discount tier, and free calls remaining." },
];

// â”€â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function ForAgentsPage() {
  const [promptTab, setPromptTab] = useState("Claude");
  const [demoTab, setDemoTab] = useState("Score");

  // â”€â”€ System prompt copy blocks â”€â”€
  const claudePrompt = `You have access to Axis' Iliad â€” a codebase intelligence API.

MCP endpoint: ${API_BASE}/mcp  (Streamable HTTP, 2025-03-26 spec)
REST base:    ${API_BASE}
API key env:  AXIS_API_KEY

Available tools (via MCP or REST):
- prepare_agentic_purchasing      â†’ full purchasing-readiness audit (score 0-100, AP2/Visa compliance, playbooks)
- analyze_repo                    → generate 86 artifacts from any GitHub URL
- analyze_files                   → generate 86 artifacts from inline [{path,content}] files
- search_and_discover_tools       â†’ find the right program by keyword (no auth)
- get_artifact                    â†’ read any generated artifact by path

When to call AXIS:
- Before any agentic purchasing decision on a codebase you haven't analyzed
- When you need AGENTS.md, .cursorrules, or CLAUDE.md for a new project
- When asked to generate MCP configs, AP2 compliance docs, or debug playbooks
- Always start with search_and_discover_tools if unsure which program to use

Payment: If you receive HTTP 402 with WWW-Authenticate header, parse the mppx
challenge, complete the Stripe payment for $0.50, and retry with the credential.`;

  const cursorPrompt = `# Axis' Iliad â€” MCP Integration
# Endpoint: ${API_BASE}/mcp
# Transport: Streamable HTTP (MCP 2025-03-26 spec)
# Auth: Authorization: Bearer $AXIS_API_KEY

# When to call Axis' Iliad:
# - Before working on an unfamiliar codebase: call analyze_repo to get AGENTS.md + .cursorrules
# - When asked about purchasing readiness or agentic commerce: call prepare_agentic_purchasing
# - To discover programs: call search_and_discover_tools with a keyword (no auth required)
# - To read generated files: call get_artifact with snapshot_id + path

# Key tool: prepare_agentic_purchasing
# Returns: Purchasing Readiness Score (0-100), AP2/UCP/Visa compliance checklist,
#          negotiation playbook, autonomous checkout rules, MCP config
# Auth required, $0.50/run via MPP if quota exceeded`;

  const swarmPrompt = `{
  "tool_name": "axis_iliad",
  "display_name": "Axis' Iliad â€” Codebase Intelligence",
  "mcp_endpoint": "${API_BASE}/mcp",
  "transport": "mcp-http-2025-03-26",
  "auth": { "type": "bearer", "env_key": "AXIS_API_KEY" },
  "tools_no_auth": ["list_programs", "get_snapshot", "get_artifact", "search_and_discover_tools"],
  "tools_auth": ["analyze_repo", "analyze_files", "prepare_agentic_purchasing"],
  "payment": {
    "protocol": "mppx-0.5.12",
    "on_402": "parse WWW-Authenticate mppx challenge, pay $0.50 via Stripe, retry with credential"
  },
  "when_to_call": [
    "Before any agentic purchasing decision on an un-analyzed codebase",
    "When AGENTS.md or .cursorrules is missing from a project",
    "When AP2/UCP/Visa compliance docs are needed",
    "When generating MCP configs or debug playbooks"
  ],
  "first_call": "search_and_discover_tools with q=<task keyword>"
}`;

  // â”€â”€ Live demo output block â”€â”€
  const demoScore = `{
  "snapshot_id": "snap_7f3a9c12",
  "purchasing_readiness_score": 71,
  "score_breakdown": {
    "commerce artifacts":   25,   // âœ“ checkout-flow.md, product-schema.json present
    "mcp configs":          20,   // âœ“ mcp-config.json, capability-registry.json present
    "compliance checklist":  0,   // âœ— no negotiation-rules.md detected
    "negotiation playbook":  0,   // âœ— no negotiation-rules.md detected
    "debug playbook":       10,   // âœ“ debug-playbook.md present
    "optimization rules":   10,   // âœ“ optimization-rules.md present
    "onboarding docs":       5,   // âœ“ AGENTS.md present
    "total": 71
  },
  "interpretation": "Partially ready for agentic purchasing. Core commerce flow is present. Add negotiation-rules.md and AP2 compliance checklist to reach production-ready (â‰¥70 = threshold met; gaps limit autonomous transaction scope).",
  "strengths": ["commerce artifacts", "mcp configs", "debug playbook", "optimization rules", "onboarding docs"],
  "gaps":      ["compliance checklist", "negotiation playbook"]
}`;

  const demoCheckout = `# Autonomous Checkout Rules
# Generated by Axis' Iliad â€” agentic-purchasing program
# Repo: github.com/example/storefront

## Zero-Click Authorization Bounds
max_autonomous_transaction_usd: 50.00
requires_human_approval_above_usd: 500.00
approved_payment_methods: [stripe_card, stripe_link]

## AP2 Mandate Requirements (Stripe)
network_tokenization: required
sca_3ds2: required_above_30_eur
exemption_low_value: allowed_below_30_eur

## Dispute Handling
auto_accept_refund_below_usd: 25.00
escalate_to_human_above_usd: 100.00
dispute_evidence_ttl_days: 14`;

  const demoCompliance = `# AP2/UCP/Visa Intelligent Commerce â€” Compliance Checklist
# Generated by Axis' Iliad â€” agentic-purchasing program

## AP2 Article 2 (Autonomous Payment Mandate)
[âœ“] Payment mandate schema present (product-schema.json)
[âœ“] Bearer auth configured (commerce-registry.json)
[âœ—] Negotiation constraints not defined â€” add negotiation-rules.md
[âœ“] Checkout flow documented (checkout-flow.md)

## Visa Intelligent Commerce
[âœ“] Stripe network tokenization detected in source files
[âœ—] Visa IC fields incomplete â€” missing merchant_category_code in product schema

## Purchasing Readiness Score: 71 / 100
Status: PARTIALLY READY
Action: Add negotiation-rules.md + Visa IC fields to reach 86+`;

  // â”€â”€ curl examples â”€â”€
  const quickStartCurl = `curl -X POST ${API_BASE}/v1/accounts \\
  -H "Content-Type: application/json" \\
  -d '{"email":"agent@example.com","name":"My Agent","tier":"free"}'
# Returns: { "api_key": { "raw_key": "axis_..." }, ... }`;

  const purchasingCurl = `curl -X POST ${API_BASE}/v1/prepare-for-agentic-purchasing \\
  -H "Authorization: Bearer <raw_key>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "project_name": "my-storefront",
    "project_type": "web_application",
    "frameworks": ["react", "stripe"],
    "goals": ["purchasing readiness"],
    "files": [
      {"path": "package.json",    "content": "<content>"},
      {"path": "src/checkout.ts", "content": "<content>"}
    ]
  }'`;

  const mcpPurchasingJson = `{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "id": 1,
  "params": {
    "name": "prepare_agentic_purchasing",
    "arguments": {
      "project_name": "my-storefront",
      "project_type": "web_application",
      "frameworks": ["react", "stripe"],
      "goals": ["purchasing readiness"],
      "files": [{"path": "src/checkout.ts", "content": "..."}]
    }
  }
}`;

  const searchToolsCurl = `# Find the right program by keyword â€” no auth required
curl "${API_BASE}/v1/mcp/tools?q=checkout"
# â†’ returns agentic-purchasing as top match with artifact list + example call

curl "${API_BASE}/v1/mcp/tools?q=debug"
# â†’ returns debug program

curl "${API_BASE}/v1/mcp/tools"
# â†’ returns all 18 programs alphabetically`;

  const analyzeRepoCurl = `curl -X POST ${API_BASE}/v1/analyze \\
  -H "Authorization: Bearer <raw_key>" \\
  -H "Content-Type: application/json" \\
  -d '{"github_url":"https://github.com/your/repo"}'
# Returns snapshot_id + 86 artifacts across 18 programs`;

  const getArtifactCurl = `curl -X POST ${API_BASE}/mcp \\
  -H "Authorization: Bearer <raw_key>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0", "method": "tools/call", "id": 1,
    "params": {
      "name": "get_artifact",
      "arguments": {
        "snapshot_id": "<snapshot_id>",
        "path": "AGENTS.md"
      }
    }
  }'`;

  const mpp402Example = `# When quota is exceeded, the server returns HTTP 402:
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="<challenge_id>", realm="axis-api-6c7z.onrender.com",
  method="stripe", intent="charge", request="<base64_charge_params>",
  description="AXIS API Credit  -  $0.50 per run", expires="<ttl>"

{
  "type": "https://paymentauth.org/problems/payment-required",
  "title": "Payment Required",
  "status": 402,
  "detail": "Payment is required (AXIS API Credit  -  $0.50 per run).",
  "challengeId": "<challenge_id>"
}

# Agent flow:
# 1. Decode request field (base64url) â†’ Stripe PaymentIntent params
# 2. Create + confirm PaymentIntent with card/link
# 3. Receive mppx credential token
# 4. Retry: Authorization: <mpp_credential>  +  X-Axis-Key: <api_key>  â†’ 200`;

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 4px" }}>

      {/* â”€â”€ Hero â”€â”€ */}
      <div className="card" style={{ marginBottom: 24, padding: "28px 28px 24px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <h1 style={{ fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.02em" }}>Axis' Iliad</h1>
              <span style={{ fontSize: "0.65rem", fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: "var(--accent)", color: "#fff", letterSpacing: "0.04em", textTransform: "uppercase" }}>For Agents</span>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", maxWidth: 580 }}>
              The definitive MCP server for hardening any codebase for autonomous agentic purchasing. One call to <code style={{ fontFamily: "var(--mono)", fontSize: "0.9rem" }}>prepare_agentic_purchasing</code> returns a Purchasing Readiness Score, AP2/UCP/Visa compliance checklist, negotiation playbook, autonomous checkout rules, scoped product schemas, and self-onboarding MCP configs — from any repo.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", flexShrink: 0 }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textAlign: "right", lineHeight: 1.9 }}>
              <div><strong style={{ color: "var(--text)" }}>18</strong> programs Â· <strong style={{ color: "var(--text)" }}>81</strong> generators</div>
              <div><strong style={{ color: "var(--text)" }}>7</strong> MCP tools Â· <strong style={{ color: "var(--text)" }}>v0.5.0</strong></div>
              <div style={{ color: "var(--green)", fontWeight: 600 }}>$0.50 / run</div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--bg)", flex: 1, minWidth: 260 }}>
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "var(--mono)", flexShrink: 0 }}>MCP</span>
            <code style={{ fontFamily: "var(--mono)", fontSize: "0.78rem", color: "var(--accent)" }}>{API_BASE}/mcp</code>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--bg)", flex: 1, minWidth: 260 }}>
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "var(--mono)", flexShrink: 0 }}>REST</span>
            <code style={{ fontFamily: "var(--mono)", fontSize: "0.78rem", color: "var(--accent)" }}>{API_BASE}/v1/</code>
          </div>
        </div>
      </div>

      {/* â”€â”€ System Prompt Blocks â”€â”€ */}
      <div className="card" style={{ marginBottom: 24 }}>
        <SectionHeader
          title="Add AXIS to Your Agent's System Prompt"
          subtitle="Copy one of these blocks into your agent's instructions. The agent will call AXIS automatically when it needs codebase analysis or purchasing readiness."
          tag="Copy-Paste"
        />
        <TabBar tabs={["Claude", "Cursor", "Custom Swarm"]} active={promptTab} onChange={setPromptTab} />
        {promptTab === "Claude" && (
          <>
            <CodeBlock code={claudePrompt} lang="system prompt" />
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 10 }}>
              Paste into Claude â†’ Project â†’ Instructions. Claude will call <code style={{ fontFamily: "var(--mono)", fontSize: "0.78rem" }}>prepare_agentic_purchasing</code> or <code style={{ fontFamily: "var(--mono)", fontSize: "0.78rem" }}>analyze_repo</code> via MCP when you reference an unfamiliar codebase.
            </p>
          </>
        )}
        {promptTab === "Cursor" && (
          <>
            <CodeBlock code={cursorPrompt} lang=".cursorrules" />
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 10 }}>
              Add to your <code style={{ fontFamily: "var(--mono)", fontSize: "0.78rem" }}>.cursorrules</code> file. Then add AXIS as an MCP server in Cursor Settings â†’ MCP â†’ Add Server using the endpoint above.
            </p>
          </>
        )}
        {promptTab === "Custom Swarm" && (
          <>
            <CodeBlock code={swarmPrompt} lang="json" />
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 10 }}>
              Add to your agent's tool registry. Set <code style={{ fontFamily: "var(--mono)", fontSize: "0.78rem" }}>AXIS_API_KEY</code> in the environment. The <code style={{ fontFamily: "var(--mono)", fontSize: "0.78rem" }}>payment</code> block describes how to handle 402 challenges autonomously.
            </p>
          </>
        )}
      </div>

      {/* â”€â”€ Pricing â”€â”€ */}
      <div className="card" style={{ marginBottom: 24 }}>
        <SectionHeader title="Pricing" subtitle="Free for discovery. $0.50 per analysis run for agents. No subscription required." />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[
            {
              name: "Free",
              price: "$0",
              period: "forever",
              color: "var(--green)",
              features: [
                "search, skills, debug programs",
                "10 snapshots / month",
                "Anonymous requests accepted",
                "No API key required",
                "search_and_discover_tools â€” no auth",
                "list_programs â€” no auth",
              ],
            },
            {
              name: "Per Run",
              price: "$0.50",
              period: "per call",
              color: "var(--accent)",
              highlight: true,
              features: [
                "All 18 programs on demand",
                "Paid via MPP 402 challenge",
                "Stripe card or Link",
                "Agent-native: pay + retry pattern",
                "No subscription needed",
                "Agents handle payment automatically",
              ],
            },
            {
              name: "Pro",
              price: "$39",
              period: "/ month",
              color: "var(--text-muted)",
              features: [
                "All 18 programs unlimited",
                "200 snapshots / month",
                "Priority processing",
                "Project history",
                "No per-call charges",
                "Best for high-volume agents",
              ],
            },
          ].map(tier => (
            <div key={tier.name} style={{
              padding: "18px 16px",
              border: `1px solid ${tier.highlight ? "var(--accent)" : "var(--border)"}`,
              borderRadius: "var(--radius)",
              background: tier.highlight ? "rgba(99,102,241,0.05)" : "var(--bg)",
            }}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 700, marginBottom: 4 }}>{tier.name}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span style={{ fontSize: "1.6rem", fontWeight: 800, color: tier.color }}>{tier.price}</span>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{tier.period}</span>
                </div>
              </div>
              <ul style={{ paddingLeft: 16, margin: 0, listStyle: "none" }}>
                {tier.features.map(f => (
                  <li key={f} style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.9, paddingLeft: 0 }}>
                    <span style={{ color: tier.highlight ? "var(--accent)" : "var(--text-muted)", marginRight: 6 }}>â€º</span>{f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, padding: "10px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--bg)" }}>
          <p style={{ fontSize: "0.77rem", color: "var(--text-muted)" }}>
            <strong style={{ color: "var(--text)" }}>How $0.50 per-run works:</strong> When your quota is exceeded, the server returns HTTP 402 with a signed mppx challenge in the <code style={{ fontFamily: "var(--mono)", fontSize: "0.77rem" }}>WWW-Authenticate</code> header. MCP-aware agents parse the challenge, pay $0.50 via Stripe (card or Link), and retry with the credential â€” no human in the loop.
          </p>
        </div>
      </div>

      {/* â”€â”€ prepare_agentic_purchasing â”€â”€ */}
      <div className="card" style={{ marginBottom: 24 }}>
        <SectionHeader
          title="prepare_agentic_purchasing"
          subtitle="The single correct first call before any autonomous agent spends money on or with a codebase. Chains 10 programs, returns score 0â€“100 + full commerce artifact bundle."
          tag="Pro"
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div>
            <p style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: 10 }}>What it returns</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                { label: "Purchasing Readiness Score", value: "0â€“100 via 7-category weighted rubric" },
                { label: "AP2/UCP/Visa compliance checklist", value: "per detected payment provider" },
                { label: "autonomous-checkout-rules.yaml", value: "zero-click auth bounds, SCA rules" },
                { label: "negotiation-playbook.md", value: "mandate scope, price caps by provider" },
                { label: "payment-mandate-schema.json", value: "AP2 fields, Visa IC requirements" },
                { label: "AGENTS.md + .cursorrules", value: "for agents working in the repo" },
                { label: "mcp-config.json", value: "auto-discovery for MCP systems" },
                { label: "strengths[] + gaps[]", value: "actionable next steps" },
              ].map(item => (
                <div key={item.label} style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 8, fontSize: "0.75rem" }}>
                  <code style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--accent)" }}>{item.label}</code>
                  <span style={{ color: "var(--text-muted)" }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: 10 }}>Score rubric (7 categories)</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {[
                { cat: "commerce artifacts",   pts: 25 },
                { cat: "mcp configs",          pts: 20 },
                { cat: "compliance checklist", pts: 15 },
                { cat: "negotiation playbook", pts: 15 },
                { cat: "debug playbook",       pts: 10 },
                { cat: "optimization rules",   pts: 10 },
                { cat: "onboarding docs",      pts: 5  },
              ].map(({ cat, pts }) => (
                <div key={cat} style={{ display: "grid", gridTemplateColumns: "1fr 36px", gap: 8, alignItems: "center" }}>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{cat}</div>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text)", textAlign: "right" }}>{pts}pts</div>
                </div>
              ))}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 4, display: "grid", gridTemplateColumns: "1fr 36px", gap: 8 }}>
                <div style={{ fontSize: "0.72rem", fontWeight: 700 }}>total</div>
                <div style={{ fontSize: "0.72rem", fontWeight: 700, textAlign: "right" }}>100</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <p style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: 8 }}>REST call:</p>
          <CodeBlock code={purchasingCurl} />
        </div>
        <div>
          <p style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: 8 }}>MCP call:</p>
          <CodeBlock code={mcpPurchasingJson} lang="json" />
        </div>
      </div>

      {/* â”€â”€ Live Demo Output â”€â”€ */}
      <div className="card" style={{ marginBottom: 24 }}>
        <SectionHeader
          title="Live Demo â€” Example Output"
          subtitle="Representative output from prepare_agentic_purchasing on a Stripe-integrated storefront."
          tag="Demo"
        />
        <TabBar tabs={["Score", "Checkout Rules", "AP2 Compliance"]} active={demoTab} onChange={setDemoTab} />
        {demoTab === "Score"          && <CodeBlock code={demoScore}      lang="json" />}
        {demoTab === "Checkout Rules" && <CodeBlock code={demoCheckout}   lang="yaml" />}
        {demoTab === "AP2 Compliance" && <CodeBlock code={demoCompliance} lang="markdown" />}
        <p style={{ fontSize: "0.73rem", color: "var(--text-muted)", marginTop: 10 }}>
          Score â‰¥70 = production-ready for autonomous purchasing. Score &lt;40 = needs work before agent transactions are safe.
        </p>
      </div>


      {/* -- AP2 & UCP Compliance for Agents -- */}

      <div className="card" style={{ marginBottom: 24 }}>

        <SectionHeader

          title="AP2 & UCP Compliance for Agents"

          subtitle="What Article 2 of the UN CISG (AP2), UCP Article 5, and Visa Intelligent Commerce mean for autonomous purchasing agents."

          tag="Compliance"

        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>

          {[

            {

              term: "AP2 â€” Article 2 (UN CISG)",

              color: "var(--green)",

              what: "The framework governing automated agent-to-agent commerce transactions. Requires spending caps, revocation mechanisms, principal-agent binding scope, and documented authorization chains.",

              forAgents: "Your codebase must declare AP2 fields: spending_limit, revocation_endpoint, agent_scope, and principal_did. Missing fields = blocked transactions.",

            },

            {

              term: "UCP Article 5 â€” Documentary Credits",

              color: "var(--accent)",

              what: "Uniform Customs and Practice for Documentary Credits. UCP 600 Article 5 governs the independence of credits from underlying contracts â€” critical for agent-initiated B2B procurement.",

              forAgents: "Agents issuing purchase orders against documentary credit systems need UCP-compliant payment terms in their commerce-registry.json. AXIS generates these automatically.",

            },

            {

              term: "Visa Intelligent Commerce",

              color: "#f59e0b",

              what: "Visa's framework for AI agents to autonomously initiate card payments. Requires token delegation, spending authorization telemetry, SCA compliance, and zero-click checkout flow documentation.",

              forAgents: "Visa IC readiness score is one of 7 rubric categories. A score below 10/15 means your agent cannot complete Visa-gated checkout without human approval.",

            },

          ].map(item => (

            <div key={item.term} style={{ padding: "14px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--bg)" }}>

              <div style={{ fontSize: "0.78rem", fontWeight: 700, color: item.color, marginBottom: 8 }}>{item.term}</div>

              <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: 8, lineHeight: 1.6 }}><strong style={{ color: "var(--text)" }}>What it is: </strong>{item.what}</p>

              <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.6 }}><strong style={{ color: "var(--text)" }}>For agents: </strong>{item.forAgents}</p>

            </div>

          ))}

        </div>

        <div style={{ padding: "10px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--bg)", fontSize: "0.73rem", color: "var(--text-muted)" }}>

          <code style={{ fontFamily: "var(--mono)", color: "var(--accent)" }}>prepare_agentic_purchasing</code> checks AP2, UCP, and Visa IC compliance automatically and returns a per-provider checklist with exact missing fields and fix instructions.

        </div>

      </div>



      {/* -- Purchasing Readiness Score Explained -- */}

      <div className="card" style={{ marginBottom: 24 }}>

        <SectionHeader

          title="Purchasing Readiness Score Explained"

          subtitle="0-100 weighted rubric. Score â‰¥70 = production-ready for autonomous commerce. Each gap is an exact remediation item."

          tag="Score"

        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

          <div>

            <p style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: 10 }}>7 scored categories</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>

              {[

                { cat: "Commerce Artifacts",   pts: 25, gap: "Missing commerce-registry.json, product schema, or checkout flow docs." },

                { cat: "MCP Configs",          pts: 20, gap: "No mcp-config.json or tool discovery metadata present." },

                { cat: "Compliance Checklist", pts: 15, gap: "AP2/UCP/Visa IC fields unaddressed or absent." },

                { cat: "Negotiation Playbook", pts: 15, gap: "No price-anchor, BATNA, or escalation rules documented." },

                { cat: "Debug Playbook",       pts: 10, gap: "No incident triage or error taxonomy for agent error recovery." },

                { cat: "Optimization Rules",   pts: 10, gap: "No performance budget or retry-backoff strategy documented." },

                { cat: "Onboarding Docs",      pts:  5, gap: "AGENTS.md or .cursorrules missing or generic." },

              ].map(({ cat, pts, gap }) => (

                <div key={cat} style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>

                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>

                    <span style={{ fontSize: "0.73rem", fontWeight: 600 }}>{cat}</span>

                    <span style={{ fontSize: "0.73rem", fontWeight: 700, color: "var(--accent)" }}>{pts}pts</span>

                  </div>

                  <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{gap}</div>

                </div>

              ))}

            </div>

          </div>

          <div>

            <p style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: 10 }}>Score thresholds</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

              {[

                { range: "90 - 100", label: "Fully autonomous",   color: "var(--green)",  desc: "Agent can initiate, negotiate, and complete purchases without human approval on all supported providers." },

                { range: "70 - 89",  label: "Production-ready",   color: "#22c55e",       desc: "Core commerce flow complete. Minor gaps â€” typically 1-2 missing artifacts. Approve for standard purchasing workflows." },

                { range: "50 - 69",  label: "Partial autonomy",   color: "#f59e0b",       desc: "Significant gaps. Agent can research and negotiate but checkout may require human confirmation for some providers." },

                { range: "< 50",     label: "Not ready",          color: "var(--red)",    desc: "Critical commerce artifacts missing. Agent transactions will fail or require full human supervision." },

              ].map(item => (

                <div key={item.range} style={{ padding: "10px 12px", border: `1px solid ${item.color}33`, borderRadius: "var(--radius)", background: `${item.color}08` }}>

                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>

                    <span style={{ fontSize: "0.8rem", fontWeight: 700, color: item.color }}>{item.range}</span>

                    <span style={{ fontSize: "0.73rem", fontWeight: 600 }}>{item.label}</span>

                  </div>

                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{item.desc}</div>

                </div>

              ))}

            </div>

            <div style={{ marginTop: 10, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: "0.72rem", color: "var(--text-muted)" }}>

              <strong style={{ color: "var(--text)" }}>Re-score anytime: </strong>call <code style={{ fontFamily: "var(--mono)", color: "var(--accent)" }}>prepare_agentic_purchasing</code> again after adding artifacts. Score is deterministic â€” same input always yields same score.

            </div>

          </div>

        </div>

      </div>



      {/* â”€â”€ MCP Tools â”€â”€ */}
      <div className="card" style={{ marginBottom: 24 }}>
        <SectionHeader title="12 MCP Tools" subtitle="All accessible at POST /mcp (Streamable HTTP, 2025-03-26 spec)." tag="MCP" />
        <div style={{ display: "flex", flexDirection: "column", gap: 0, borderRadius: "var(--radius)", border: "1px solid var(--border)", overflow: "hidden", marginBottom: 14 }}>
          {MCP_TOOLS.map((t, i) => (
            <div key={t.tool} style={{
              display: "grid", gridTemplateColumns: "220px 52px 1fr",
              gap: 12, padding: "10px 14px", alignItems: "center",
              borderBottom: i < MCP_TOOLS.length - 1 ? "1px solid var(--border)" : "none",
              background: i % 2 === 0 ? "var(--bg-card)" : "var(--bg)",
            }}>
              <code style={{ fontFamily: "var(--mono)", fontSize: "0.75rem", color: "var(--accent)" }}>{t.tool}</code>
              <span style={{
                fontSize: "0.62rem", fontWeight: 700, padding: "1px 5px",
                borderRadius: 99, textAlign: "center",
                background: t.auth ? "rgba(99,102,241,0.12)" : "rgba(22,163,74,0.12)",
                color: t.auth ? "var(--accent)" : "var(--green)",
              }}>{t.auth ? "auth" : "open"}</span>
              <span style={{ fontSize: "0.77rem", color: "var(--text-muted)" }}>{t.desc}</span>
            </div>
          ))}
        </div>
        <div style={{ marginBottom: 14 }}>
          <p style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: 8 }}>Discover programs by keyword (no auth needed):</p>
          <CodeBlock code={searchToolsCurl} />
        </div>
        <div>
          <p style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: 8 }}>Read any generated artifact after analysis:</p>
          <CodeBlock code={getArtifactCurl} lang="json" />
        </div>
      </div>

      {/* â”€â”€ MPP 402 Flow â”€â”€ */}
      <div className="card" style={{ marginBottom: 24 }}>
        <SectionHeader
          title="Autonomous Payment â€” MPP 402 Flow"
          subtitle="Agents pay $0.50 per run without human intervention. Stripe card or Link. Powered by mppx v0.5.12 (RFC 9457)."
          tag="MPP"
        />
        <CodeBlock code={mpp402Example} lang="http" />
        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 12 }}>
          The challenge <code style={{ fontFamily: "var(--mono)", fontSize: "0.77rem" }}>request</code> field is base64url-encoded Stripe PaymentIntent params. Decode â†’ create intent â†’ confirm â†’ receive mppx credential â†’ retry. MCP-aware agents do this loop automatically. Human redirect is never required.
        </p>
      </div>

      {/* â”€â”€ Quick Start â”€â”€ */}
      <div className="card" style={{ marginBottom: 24 }}>
        <SectionHeader title="Quick Start" subtitle="From zero to 86 artifacts in three steps." tag="API" />
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 8 }}>
              <strong style={{ color: "var(--text)" }}>Step 1</strong> â€” Create a free account and get your API key:
            </p>
            <CodeBlock code={quickStartCurl} />
          </div>
          <div>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 8 }}>
              <strong style={{ color: "var(--text)" }}>Step 2</strong> â€” Run full purchasing-readiness audit (or use <code style={{ fontFamily: "var(--mono)", fontSize: "0.8rem" }}>analyze_repo</code> for general artifacts):
            </p>
            <CodeBlock code={purchasingCurl} />
          </div>
          <div>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 8 }}>
              <strong style={{ color: "var(--text)" }}>Step 3</strong> â€” Analyze a GitHub repo directly:
            </p>
            <CodeBlock code={analyzeRepoCurl} />
          </div>
        </div>
      </div>

      {/* â”€â”€ All 18 Programs â”€â”€ */}
      <div className="card" style={{ marginBottom: 24 }}>
        <SectionHeader title="All 18 Programs" subtitle="Free tier: search, skills, debug. Pro tier: remaining 15 programs." />
        <div style={{ display: "flex", flexDirection: "column", gap: 0, borderRadius: "var(--radius)", border: "1px solid var(--border)", overflow: "hidden" }}>
          {PROGRAMS.map((p, i) => (
            <div key={p.name} style={{
              display: "grid", gridTemplateColumns: "160px 50px 32px 1fr",
              gap: 12, padding: "9px 14px", alignItems: "start",
              borderBottom: i < PROGRAMS.length - 1 ? "1px solid var(--border)" : "none",
              background: i % 2 === 0 ? "var(--bg-card)" : "var(--bg)",
            }}>
              <code style={{ fontFamily: "var(--mono)", fontSize: "0.78rem", color: "var(--text)" }}>{p.name}</code>
              <span style={{
                fontSize: "0.62rem", fontWeight: 700, padding: "2px 6px",
                borderRadius: 99, alignSelf: "center", textAlign: "center",
                background: p.tier === "free" ? "rgba(22,163,74,0.12)" : "rgba(99,102,241,0.12)",
                color: p.tier === "free" ? "var(--green)" : "var(--accent)",
              }}>{p.tier}</span>
              <span style={{ fontSize: "0.70rem", color: "var(--text-muted)", textAlign: "center", alignSelf: "center" }}>{p.outputs}</span>
              <span style={{ fontSize: "0.70rem", color: "var(--text-muted)", lineHeight: 1.5 }}>{p.key}</span>
            </div>
          ))}
        </div>
        <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 10 }}>Column: program Â· tier Â· output count Â· key files</p>
      </div>

      {/* â”€â”€ Endpoints Reference â”€â”€ */}
      <div className="card" style={{ marginBottom: 8 }}>
        <SectionHeader title="Endpoints Reference" />
        <div style={{ display: "flex", flexDirection: "column", gap: 0, borderRadius: "var(--radius)", border: "1px solid var(--border)", overflow: "hidden" }}>
          {[
            { method: "POST", path: "/v1/prepare-for-agentic-purchasing", desc: "Full purchasing-readiness audit â€” score + AP2/Visa compliance + playbooks" },
            { method: "POST", path: "/v1/analyze",                        desc: "Analyze GitHub URL or inline files → 86 artifacts" },
            { method: "POST", path: "/mcp",                               desc: "MCP server — Streamable HTTP transport, 2025-03-26 spec, 12 tools" },
            { method: "GET",  path: "/v1/mcp/tools?q=",                   desc: "Search 18 programs by keyword â€” no auth required" },
            { method: "GET",  path: "/v1/mcp/server.json",                desc: "MCP registry metadata for mcp-publisher CLI and registry crawlers" },
            { method: "POST", path: "/v1/accounts",                       desc: "Create account, get raw_key" },
            { method: "GET",  path: "/.well-known/axis.json",             desc: "Machine-readable discovery manifest" },
            { method: "GET",  path: "/.well-known/skills/index.json",     desc: "Agent skills registry (agentskills.io standard)" },
            { method: "GET",  path: "/llms.txt",                          desc: "Plain-text AI tool instructions (llmstxt.org standard)" },
            { method: "GET",  path: "/v1/docs",                           desc: "Full OpenAPI 3.1 spec" },
            { method: "GET",  path: "/v1/docs.md",                        desc: "Plain-text API docs" },
            { method: "GET",  path: "/v1/account/quota",                  desc: "Check current quota usage for authenticated account" },
            { method: "GET",  path: "/v1/health",                         desc: "Health check" },
          ].map((ep, i, arr) => (
            <div key={ep.path} style={{
              display: "grid", gridTemplateColumns: "44px 320px 1fr",
              gap: 12, padding: "9px 14px", alignItems: "center",
              borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none",
              background: i % 2 === 0 ? "var(--bg-card)" : "var(--bg)",
            }}>
              <span style={{
                fontSize: "0.62rem", fontWeight: 700,
                color: ep.method === "GET" ? "var(--blue, #60a5fa)" : "var(--green)",
                fontFamily: "var(--mono)",
              }}>{ep.method}</span>
              <code style={{ fontFamily: "var(--mono)", fontSize: "0.73rem", color: "var(--text)", wordBreak: "break-all" }}>{ep.path}</code>
              <span style={{ fontSize: "0.77rem", color: "var(--text-muted)" }}>{ep.desc}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
