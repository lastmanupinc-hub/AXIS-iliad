// Same endpoint convention as InstallPage/api.ts: env override, prod fallback.
const API_BASE = import.meta.env.VITE_API_URL || "https://axis-api-6c7z.onrender.com";
const mcpUrl = `${API_BASE}/mcp`;

const bestFirstCall = `{
  "tool": "prepare_agentic_purchasing",
  "input": {
    "snapshot": "<your-repo-snapshot-or-github-url>",
    "objectives": ["full purchasing readiness", "compliance audit", "budget optimization"]
  }
}`;

const freeOutputs = ["AGENTS.md", "CLAUDE.md", "CURSOR.md", ".cursorrules"];

const whyAgents = [
  "Single MCP connection instead of managing 8+ tools",
  "Codebase-aware context enrichment on every tool call",
  "Native x402 + credit system (no separate billing per tool)",
  "Persistent memory and snapshot system",
  "Highest signal-to-noise artifact quality in the MCP ecosystem",
];

const systemPrompt = `You have access to Iliad MCP (${mcpUrl}).

Use the blended credit system:
- Free tier: 10k credits
- Starter: $29 for 75k credits
- Pro: $99 for 300k credits

Start with prepare_agentic_purchasing on new repositories.
Respect x402 responses for autonomous payment.
MCP Endpoint: ${mcpUrl}`;

const liveDemoCurl = `# Demo: list every program and its generators (free tool, no auth required)
curl -X POST ${mcpUrl} \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "list_programs",
      "arguments": {}
    }
  }'`;

export function ForAgentsPage() {
  return (
    <div>
      <div className="card">
        <span className="badge badge-accent">For Agents</span>
        <h1>Iliad is an agent-first MCP platform.</h1>
        <p>
          One endpoint. 35 MCP tools. Intelligence across 20 programs. Native x402 payments.
        </p>
      </div>

      <div className="card">
        <h2>Precede &amp; feed</h2>
        <p>
          Iliad doesn't compete with your agent's tools — it runs <strong>before</strong> them and <strong>feeds</strong> them.
          Point it at a repo and it returns deterministic, codebase-grounded context — the real files, routes, domain models,
          dependency hotspots, and conventions — so your agent acts on ground truth instead of hallucinating it.
        </p>
        <div className="grid grid-3">
          <div>
            <strong>Precede</strong>
            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
              One analysis, before the first edit — every downstream tool call starts oriented, not guessing.
            </p>
          </div>
          <div>
            <strong>Feed</strong>
            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
              Grounded artifacts (AGENTS.md, CLAUDE.md, MCP configs) an agent consumes directly — no re-reading the repo every turn.
            </p>
          </div>
          <div>
            <strong>Deterministic</strong>
            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
              Same repo ⇒ byte-identical output. Auditable, cacheable, zero lock-in — export and walk away anytime.
            </p>
          </div>
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: 12 }}>
          And it compounds: every analysis ships a <code>recommended-next-programs.md</code> that tells your agent which program to run next — the workflow builds itself through the catalog.
        </p>
      </div>

      <div className="card">
        <h2>How to Use Iliad</h2>
        <h3>Best first call (recommended):</h3>
        <pre className="mono">{bestFirstCall}</pre>
        <p>
          This single call returns a complete purchasing readiness report + all core governance files.
        </p>
      </div>

      <div className="card">
        <h2>Pricing (Blended Credit Model)</h2>
        <table>
          <thead>
            <tr>
              <th>Tier</th>
              <th>Monthly Price</th>
              <th>Monthly Credits</th>
              <th>Best For</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Free</td>
              <td>$0</td>
              <td>10,000</td>
              <td>Testing + core files</td>
            </tr>
            <tr>
              <td>Starter</td>
              <td>$29</td>
              <td>75,000</td>
              <td>Solo devs & small agents</td>
            </tr>
            <tr>
              <td>Pro</td>
              <td>$99</td>
              <td>300,000</td>
              <td>Serious agent builders (most popular)</td>
            </tr>
            <tr>
              <td>Growth</td>
              <td>$299</td>
              <td>1,200,000</td>
              <td>Teams & production</td>
            </tr>
          </tbody>
        </table>
        <p>Annual billing saves 20%.</p>
        <p className="mono">Overages are $0.0018 per credit (never a hard fail).</p>
      </div>

      <div className="card">
        <h2>Core Free Outputs</h2>
        <ul>
          {freeOutputs.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2>Your 35 MCP Tools (all available at /mcp)</h2>
        <ul>
          <li>analyze_repo, analyze_files</li>
          <li>list_programs, get_snapshot, get_artifact</li>
          <li>prepare_agentic_purchasing (recommended first tool), prepare_agentic_purchasing_preview</li>
          <li>discover_agentic_purchasing_needs, discover_commerce_tools, search_and_discover_tools</li>
          <li>closer, deploy</li>
          <li>improve_my_agent_with_axis</li>
          <li>get_referral_code, get_referral_credits</li>
          <li>sca_exemption_decision, grade_compliance, assemble_ce3_evidence, build_ap2_mandate, score_dispute_readiness (free commerce decision engines — deterministic, no auth)</li>
          <li>assemble_representment (metered — CE 3.0 → Stripe dispute evidence)</li>
          <li>iliad_web_research, iliad_web_research_crawl, iliad_web_search</li>
          <li>iliad_object_storage, iliad_vector_database, iliad_embeddings (AXIS-owned in-process by default; OpenAI optional)</li>
          <li>iliad_llm_inference, iliad_code_sandbox, iliad_document_parsing</li>
          <li>iliad_text_to_speech, iliad_speech_to_text</li>
          <li>iliad_transactional_email, iliad_analytics, iliad_hygiene</li>
        </ul>
      </div>

      <div className="card">
        <h2>Referral Program (Opt-In)</h2>
        <ul>
          <li>Paid calls return a <code>referral_token</code>.</li>
          <li>Unique conversions attributed to your token earn usage credits (up to 0.02% per call).</li>
          <li>Reward state resets each billing cycle.</li>
          <li>Query status with the free <code>get_referral_code</code> / <code>get_referral_credits</code> tools.</li>
        </ul>
      </div>

      <div className="card">
        <h2>Why Agents Choose Iliad</h2>
        <ul>
          {whyAgents.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2>System Prompt</h2>
        <h3>Markdown</h3>
        <h3>System Prompt (add to your agent):</h3>
        <pre className="mono">{systemPrompt}</pre>
        <h3>MCP Endpoint:</h3>
        <pre className="mono">{mcpUrl}</pre>
      </div>

      <div className="card">
        <h2>Live Demo (Try It Now)</h2>
        <h3>Bash</h3>
        <pre className="mono">{liveDemoCurl}</pre>
        <p>
          Expected output: a JSON-RPC 2.0 result listing every program with its generator counts — no API key needed.
        </p>
      </div>
    </div>
  );
}