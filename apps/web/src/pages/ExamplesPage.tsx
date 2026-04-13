import { useState } from "react";

// ─── Types ───────────────────────────────────────────────────────

interface Example {
  id: string;
  slug: string;
  title: string;
  description: string;
  stack: string[];
  before: number;
  after: number;
  snapshotId: string;
  keyArtifacts: string[];
  gap: string;
}

// ─── Data ────────────────────────────────────────────────────────

const EXAMPLES: Example[] = [
  {
    id: "01",
    slug: "payment-engine",
    title: "Payment Engine",
    description: "Node.js payment orchestration layer with Stripe and Plaid integration. No AP2 fields, no checkout rules, no agent context.",
    stack: ["Node.js", "TypeScript", "Stripe", "Plaid"],
    before: 0,
    after: 100,
    snapshotId: "a6b061c1-e0eb-4b5b-a91e-a3011d29a5c1",
    keyArtifacts: [
      "commerce-registry.json",
      "agent-purchasing-playbook.md",
      "autonomous-checkout-rules.yaml",
      "AP2/UCP compliance checklist",
      "AGENTS.md",
      "mcp-config.json",
    ],
    gap: "Missing AP2 spending_limit fields, no negotiation-rules.md, no MCP config. Agent would fail at checkout authorization.",
  },
  {
    id: "02",
    slug: "payment-processing",
    title: "Payment Processing API",
    description: "Express REST API for multi-currency payment processing. No agentic context, no Visa IC telemetry, no self-onboarding docs.",
    stack: ["Node.js", "Express", "PostgreSQL", "Stripe"],
    before: 0,
    after: 100,
    snapshotId: "ce1c9a64-8020-4c93-a45b-7feb9c186318",
    keyArtifacts: [
      "commerce-registry.json",
      "payment-mandate-schema.json",
      "negotiation-playbook.md",
      "autonomous-checkout-rules.yaml",
      ".cursorrules",
      "mcp-self-onboarding-config.json",
    ],
    gap: "No payment-mandate-schema.json, no agent system prompt, no self-onboarding kit. Agents couldn't discover or invoke payment flows.",
  },
  {
    id: "03",
    slug: "pmd-customizer",
    title: "PMD Customizer Plugin",
    description: "WordPress plugin for product customization with conditional pricing. No structured commerce data, no agentic purchasing support.",
    stack: ["PHP", "WordPress", "WooCommerce", "JavaScript"],
    before: 0,
    after: 100,
    snapshotId: "db80241b-694f-42d4-b21a-0bb32f37b966",
    keyArtifacts: [
      "commerce-registry.json",
      "product-schema.json",
      "AGENTS.md",
      "debug-playbook.md",
      "AP2 compliance checklist",
      "agent-purchasing-playbook.md",
    ],
    gap: "PHP codebase with zero agent context. No product schema, no debug playbook. Agents couldn't inspect or invoke customization rules.",
  },
  {
    id: "04",
    slug: "no-fate-contract",
    title: "No Fate Smart Contract",
    description: "Solidity escrow and milestone-payment smart contract system. No agentic transaction support, no compliance telemetry.",
    stack: ["Solidity", "Hardhat", "Ethers.js", "OpenZeppelin"],
    before: 0,
    after: 100,
    snapshotId: "15808e57-7309-45f7-81ae-cd20a1067924",
    keyArtifacts: [
      "commerce-registry.json",
      "autonomous-checkout-rules.yaml",
      "negotiation-playbook.md",
      "AGENTS.md",
      "mcp-config.json",
      "UCP compliance checklist",
    ],
    gap: "Smart contract codebase — no structured event schemas for agents, no UCP compliance mapping for on-chain documentary credits.",
  },
  {
    id: "05",
    slug: "diamond-clarity",
    title: "Diamond Clarity Grader",
    description: "Python ML model for diamond grading with laboratory certification workflow. No B2B commerce schema, no agent procurement support.",
    stack: ["Python", "FastAPI", "PyTorch", "PostgreSQL"],
    before: 0,
    after: 100,
    snapshotId: "4a73a853-a1c2-4502-bfc0-8d05ce98d3cc",
    keyArtifacts: [
      "commerce-registry.json",
      "product-schema.json",
      "agent-purchasing-playbook.md",
      "payment-mandate-schema.json",
      "AGENTS.md",
      "optimization-rules.md",
    ],
    gap: "ML codebase with no B2B product schema. Agents couldn't price, grade, or procure diamonds without structured commerce artifacts.",
  },
];

// ─── Components ──────────────────────────────────────────────────

function ScoreBadge({ score, label }: { score: number; label: string }) {
  const color = score >= 90 ? "var(--green)" : score >= 70 ? "#22c55e" : score >= 50 ? "#f59e0b" : "var(--red)";
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{
        width: 56, height: 56, borderRadius: "50%",
        border: `3px solid ${color}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 4px",
        fontSize: "1rem", fontWeight: 800, color,
      }}>{score}</div>
      <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>{label}</div>
    </div>
  );
}

function ExampleCard({ ex, expanded, onToggle }: { ex: Example; expanded: boolean; onToggle: () => void }) {
  return (
    <div style={{
      border: "1px solid var(--border)", borderRadius: "var(--radius)",
      overflow: "hidden", background: "var(--bg-card)",
    }}>
      {/* Header row */}
      <button
        onClick={onToggle}
        style={{
          width: "100%", background: "none", border: "none", cursor: "pointer",
          padding: "16px 20px", display: "grid",
          gridTemplateColumns: "auto 1fr auto auto",
          gap: 16, alignItems: "center", textAlign: "left",
        }}
      >
        <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", fontFamily: "var(--mono)" }}>
          {ex.id}
        </span>
        <div>
          <div style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: 3 }}>{ex.title}</div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
            {ex.stack.join(" · ")}
          </div>
        </div>
        <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
          <ScoreBadge score={ex.before} label="Before" />
          <div style={{ fontSize: "1.2rem", color: "var(--text-muted)" }}>→</div>
          <ScoreBadge score={ex.after} label="After" />
        </div>
        <span style={{ fontSize: "0.75rem", color: "var(--accent)" }}>{expanded ? "▲" : "▼"}</span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: "0 20px 20px", borderTop: "1px solid var(--border)" }}>
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "16px 0 12px", lineHeight: 1.6 }}>
            {ex.description}
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 14 }}>
            <div>
              <p style={{ fontSize: "0.73rem", fontWeight: 600, marginBottom: 8 }}>Gap (before hardening)</p>
              <div style={{
                padding: "10px 12px", background: "rgba(239,68,68,0.05)",
                border: "1px solid rgba(239,68,68,0.2)", borderRadius: "var(--radius)",
                fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.6,
              }}>
                {ex.gap}
              </div>
            </div>
            <div>
              <p style={{ fontSize: "0.73rem", fontWeight: 600, marginBottom: 8 }}>Key artifacts generated</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {ex.keyArtifacts.map(a => (
                  <div key={a} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: "var(--green)", fontSize: "0.7rem" }}>✓</span>
                    <code style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: "var(--accent)" }}>{a}</code>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <a
              href={`https://github.com/lastmanupinc-hub/axis-toolbox-examples/tree/main/examples/${ex.id}-${ex.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-block", padding: "6px 14px",
                background: "var(--accent)", color: "#fff",
                borderRadius: "var(--radius)", fontSize: "0.73rem",
                fontWeight: 600, textDecoration: "none",
              }}
            >
              View before/after on GitHub
            </a>
            <a
              href={`https://axis-api-6c7z.onrender.com/v1/snapshots/${ex.snapshotId}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-block", padding: "6px 14px",
                border: "1px solid var(--border)", color: "var(--text)",
                borderRadius: "var(--radius)", fontSize: "0.73rem",
                fontWeight: 600, textDecoration: "none",
              }}
            >
              Live snapshot →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────

export function ExamplesPage() {
  const [expanded, setExpanded] = useState<string | null>("01");

  function toggle(id: string) {
    setExpanded(prev => prev === id ? null : id);
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 16px 40px" }}>
      {/* Hero */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 800, marginBottom: 8 }}>
          Real-World Examples
        </h1>
        <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.7 }}>
          5 real repos — payment engines, smart contracts, ML models, WordPress plugins — hardened from
          {" "}<strong style={{ color: "var(--red)" }}>0/100</strong>{" "}to{" "}
          <strong style={{ color: "var(--green)" }}>100/100</strong> Purchasing Readiness Score.
          Every example is a public GitHub repo with live before/after artifacts and a retrievable snapshot.
        </p>

        {/* Summary row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
          {[
            { label: "Repos hardened", value: "5", color: "var(--accent)" },
            { label: "Avg. before score", value: "0/100", color: "var(--red)" },
            { label: "Avg. after score", value: "100/100", color: "var(--green)" },
            { label: "Artifacts generated", value: "81+", color: "var(--text)" },
          ].map(stat => (
            <div key={stat.label} style={{ padding: "12px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius)", textAlign: "center" }}>
              <div style={{ fontSize: "1.3rem", fontWeight: 800, color: stat.color, marginBottom: 3 }}>{stat.value}</div>
              <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{stat.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <a
            href="https://github.com/lastmanupinc-hub/axis-toolbox-examples"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-block", padding: "8px 16px",
              background: "var(--accent)", color: "#fff",
              borderRadius: "var(--radius)", fontSize: "0.8rem", fontWeight: 700,
              textDecoration: "none",
            }}
          >
            View all examples on GitHub →
          </a>
          <a
            href="#upload"
            style={{
              display: "inline-block", padding: "8px 16px",
              border: "1px solid var(--border)", color: "var(--text)",
              borderRadius: "var(--radius)", fontSize: "0.8rem", fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Try it on your repo
          </a>
        </div>
      </div>

      {/* Example cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
        {EXAMPLES.map(ex => (
          <ExampleCard
            key={ex.id}
            ex={ex}
            expanded={expanded === ex.id}
            onToggle={() => toggle(ex.id)}
          />
        ))}
      </div>

      {/* CTA */}
      <div className="card" style={{ textAlign: "center" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 8 }}>
          Your repo is next
        </h2>
        <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.7 }}>
          Upload a ZIP or connect a GitHub URL. One call to{" "}
          <code style={{ fontFamily: "var(--mono)", fontSize: "0.8rem" }}>prepare_for_agentic_purchasing</code>{" "}
          returns your Purchasing Readiness Score + every artifact these repos got. Takes under 60 seconds.
        </p>
        <a
          href="#upload"
          style={{
            display: "inline-block", padding: "10px 22px",
            background: "var(--accent)", color: "#fff", borderRadius: "var(--radius)",
            fontSize: "0.85rem", fontWeight: 700, textDecoration: "none",
          }}
        >
          Analyze your repo — $0.50
        </a>
        <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 8 }}>
          Free tier available (10 snapshots/month). No subscription required.
        </p>
      </div>
    </div>
  );
}
