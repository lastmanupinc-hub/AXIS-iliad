import { useState, useEffect } from "react";
import type { GeneratedFile, BillingTier } from "../api.ts";
import { downloadExport, getAccount } from "../api.ts";

interface Props {
  snapshotId: string;
  generatedFiles: GeneratedFile[];
  onRun: (endpoint: string) => Promise<void>;
}

interface ProgramDef {
  name: string;
  label: string;
  description: string;
  endpoint: string;
  tier: "free" | "pro" | "suite";
}

const PROGRAMS: ProgramDef[] = [
  { name: "search", label: "Search Context", description: "Context map, project summary, key abstractions for AI search", endpoint: "search/export", tier: "free" },
  { name: "skills", label: "Skills & Agents", description: "AGENTS.md, CLAUDE.md, .cursorrules, workflow & policy packs", endpoint: "skills/generate", tier: "free" },
  { name: "debug", label: "Debug Playbook", description: "Debug playbook, incident template, tracing rules, root-cause checklist", endpoint: "debug/analyze", tier: "free" },
  { name: "frontend", label: "Frontend Audit", description: "Frontend rules, component guidelines, layout patterns, UI audit", endpoint: "frontend/audit", tier: "pro" },
  { name: "seo", label: "SEO Analysis", description: "SEO rules, schema recommendations, route priority map, content audit", endpoint: "seo/analyze", tier: "pro" },
  { name: "optimization", label: "Optimization", description: "Optimization rules, prompt diff report, cost estimate, token budget", endpoint: "optimization/analyze", tier: "pro" },
  { name: "theme", label: "Theme & Design", description: "Design tokens, theme CSS, guidelines, dark mode tokens", endpoint: "theme/generate", tier: "pro" },
  { name: "brand", label: "Brand System", description: "Brand guidelines, voice & tone, messaging, channel rulebook", endpoint: "brand/generate", tier: "pro" },
  { name: "superpowers", label: "Superpowers", description: "Workflow registry, test generation, refactor checklist, automation", endpoint: "superpowers/generate", tier: "pro" },
  { name: "marketing", label: "Marketing", description: "Campaign brief, funnel map, sequence pack, CRO playbook, A/B tests", endpoint: "marketing/generate", tier: "pro" },
  { name: "notebook", label: "Notebook", description: "Notebook summary, source map, study brief, research threads", endpoint: "notebook/generate", tier: "pro" },
  { name: "obsidian", label: "Obsidian", description: "Skill pack, vault rules, graph prompt map, linking policy, templates", endpoint: "obsidian/analyze", tier: "pro" },
  { name: "mcp", label: "MCP Provision", description: "MCP config, connector map, capability registry, server manifest", endpoint: "mcp/provision", tier: "pro" },
  { name: "artifacts", label: "Artifacts", description: "Generated components, dashboard widgets, embed snippets", endpoint: "artifacts/generate", tier: "pro" },
  { name: "remotion", label: "Remotion Video", description: "Remotion script, scene plan, render config, storyboard", endpoint: "remotion/generate", tier: "pro" },
  { name: "canvas", label: "Canvas Design", description: "Canvas spec, social pack, poster layouts, brand board", endpoint: "canvas/generate", tier: "pro" },
  { name: "algorithmic", label: "Algorithmic Art", description: "Generative sketch, parameter pack, variation matrix", endpoint: "algorithmic/generate", tier: "pro" },
];

export function ProgramLauncher({ snapshotId, generatedFiles, onRun }: Props) {
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tier, setTier] = useState<BillingTier>("free");

  useEffect(() => {
    getAccount().then(a => setTier(a.tier)).catch(() => {});
  }, []);

  const filesPerProgram = new Map<string, number>();
  for (const f of generatedFiles) {
    filesPerProgram.set(f.program, (filesPerProgram.get(f.program) ?? 0) + 1);
  }

  async function handleRun(program: ProgramDef) {
    setRunning(program.name);
    setError(null);
    try {
      await onRun(program.endpoint);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setRunning(null);
    }
  }

  const freeTier = PROGRAMS.filter(p => p.tier === "free");
  const proTier = PROGRAMS.filter(p => p.tier === "pro");

  return (
    <div>
      {error && (
        <div className="card" style={{ borderColor: "var(--red)", marginBottom: 16 }}>
          <p style={{ color: "var(--red)" }}>{error}</p>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="flex-between" style={{ marginBottom: 12 }}>
          <h3>Free Programs</h3>
          <span className="badge badge-green">Always available</span>
        </div>
        <div className="grid grid-3">
          {freeTier.map(p => (
            <ProgramCard
              key={p.name}
              program={p}
              fileCount={filesPerProgram.get(p.name) ?? 0}
              running={running === p.name}
              onRun={() => handleRun(p)}
            />
          ))}
        </div>
      </div>

      <div className="card">
        <div className="flex-between" style={{ marginBottom: 12 }}>
          <h3>Pro Programs</h3>
          <span className="badge badge-accent">14 programs</span>
        </div>
        <div className="grid grid-3">
          {proTier.map(p => (
            <ProgramCard
              key={p.name}
              program={p}
              fileCount={filesPerProgram.get(p.name) ?? 0}
              running={running === p.name}
              locked={tier === "free"}
              onRun={() => handleRun(p)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ProgramCard({
  program,
  fileCount,
  running,
  locked = false,
  onRun,
}: {
  program: ProgramDef;
  fileCount: number;
  running: boolean;
  locked?: boolean;
  onRun: () => void;
}) {
  return (
    <div
      className="card"
      style={{
        padding: 16,
        cursor: locked ? "not-allowed" : running ? "wait" : "pointer",
        opacity: locked ? 0.55 : 1,
        transition: "border-color 0.15s",
      }}
      onClick={() => !running && !locked && onRun()}
      onMouseEnter={(e) => !locked && (e.currentTarget.style.borderColor = "var(--accent)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      <div className="flex-between" style={{ marginBottom: 8 }}>
        <h4 style={{ fontSize: "0.875rem", margin: 0 }}>{program.label}</h4>
        {locked ? (
          <span className="badge" style={{ fontSize: "0.6875rem", background: "var(--border)" }}>Pro</span>
        ) : fileCount > 0 ? (
          <span className="badge badge-green" style={{ fontSize: "0.6875rem" }}>
            {fileCount} files
          </span>
        ) : null}
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", lineHeight: 1.4 }}>
        {program.description}
      </p>
      {running && (
        <div className="flex" style={{ marginTop: 8, gap: 6 }}>
          <span className="spinner" />
          <span style={{ color: "var(--accent)", fontSize: "0.75rem" }}>Generating...</span>
        </div>
      )}
    </div>
  );
}

