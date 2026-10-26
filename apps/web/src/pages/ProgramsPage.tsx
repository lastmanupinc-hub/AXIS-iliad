// ProgramsPage — keyword-rich landing for all 21 AXIS programs
// Single-source counts (WO-F5) — never inline these numbers.
import { ARTIFACT_COUNT, FREE_PROGRAM_COUNT, PROGRAM_COUNT } from "../config.ts";
import { PROGRAMS, type ProgramDef } from "../programs.ts";

/** Output pills shown per card before collapsing to "+N more" (mcp emits 19). */
const OUTPUT_PREVIEW = 5;

interface Props {
  onAnalyze: () => void;
}

export function ProgramsPage({ onAnalyze }: Props) {
  const free = PROGRAMS.filter((p) => p.tier === "free");
  const pro = PROGRAMS.filter((p) => p.tier === "pro");

  return (
    <div className="programs-page">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="programs-hero">
        <div className="programs-hero-inner">
          <span className="badge badge-accent" style={{ marginBottom: 12, display: "inline-block" }}>{PROGRAM_COUNT} Programs · {ARTIFACT_COUNT} Artifacts</span>
          <h1 className="programs-hero-title">
            Every AI artifact your codebase needs. Generated in seconds.
          </h1>
          <p className="programs-hero-sub">
            Axis' Iliad analyzes your repo across 60+ languages and generates structured governance files
            for every AI coding tool — GitHub Copilot, Claude Code, Cursor, Windsurf, Aider, and more.
            One scan. {ARTIFACT_COUNT} outputs. Zero manual work.
          </p>
          <div className="programs-hero-stats">
            <div className="programs-stat">
              <span className="programs-stat-value">{ARTIFACT_COUNT}</span>
              <span className="programs-stat-label">Generated Artifacts</span>
            </div>
            <div className="programs-stat">
              <span className="programs-stat-value">{PROGRAM_COUNT}</span>
              <span className="programs-stat-label">Specialized Programs</span>
            </div>
            <div className="programs-stat">
              <span className="programs-stat-value">60+</span>
              <span className="programs-stat-label">Languages Detected</span>
            </div>
            <div className="programs-stat">
              <span className="programs-stat-value">{FREE_PROGRAM_COUNT}</span>
              <span className="programs-stat-label">Free Programs</span>
            </div>
          </div>
          <button className="btn btn-primary btn-lg" onClick={onAnalyze}>
            Analyze your repo for free
          </button>
        </div>
      </section>

      {/* ── Free programs ────────────────────────────────────── */}
      <section className="programs-section">
        <div className="programs-section-header">
          <h2>Free Programs</h2>
          <p>Start here. No credit card. Instant results.</p>
        </div>
        <div className="programs-grid programs-grid-free">
          {free.map((p) => (
            <ProgramCard key={p.id} program={p} onAnalyze={onAnalyze} />
          ))}
        </div>
      </section>

      {/* ── Pro programs ─────────────────────────────────────── */}
      <section className="programs-section">
        <div className="programs-section-header">
          <h2>Pro Programs</h2>
          <p>{pro.length} additional programs unlocked with a Pro subscription.</p>
        </div>
        <div className="programs-grid">
          {pro.map((p) => (
            <ProgramCard key={p.id} program={p} onAnalyze={onAnalyze} />
          ))}
        </div>
      </section>

      {/* ── Conversion CTA ───────────────────────────────────── */}
      <section className="programs-cta">
        <h2>Ready to monopolize your AI development workflow?</h2>
        <p>
          Upload a ZIP, paste a GitHub URL, or use the CLI. Axis' Iliad scans your entire
          codebase and generates structured artifacts that make every AI coding tool more
          accurate, consistent, and effective.
        </p>
        <div className="programs-cta-actions">
          <button className="btn btn-primary btn-lg" onClick={onAnalyze}>
            Analyze your repo — it&apos;s free
          </button>
          <a className="btn btn-lg" href="mailto:jonathan@jonathanarvay.com?subject=Axis%27%20Iliad%20Demo">
            Request a demo
          </a>
        </div>
        <p className="programs-cta-note">
          Free forever for Search, Skills &amp; Debug programs. No credit card required.
        </p>
      </section>
    </div>
  );
}

function ProgramCard({ program, onAnalyze }: { program: ProgramDef; onAnalyze: () => void }) {
  return (
    <article className={`program-card program-card-${program.tier}`}>
      <div className="program-card-header">
        <div>
          {/* Each program has a page of its own (T151): the name links it, as a crawler can follow. */}
          <h3 className="program-card-name"><a href={`/programs/${program.id}/`}>{program.name}</a></h3>
          <span className={`badge ${program.tier === "free" ? "badge-green" : "badge-accent"}`}>
            {program.tier === "free" ? "FREE" : "PRO"}
          </span>
        </div>
      </div>
      <p className="program-card-tagline">{program.tagline}</p>
      <div className="program-card-outputs">
        {program.outputs.slice(0, OUTPUT_PREVIEW).map((o) => (
          <code key={o} className="program-output-pill">{o}</code>
        ))}
        {program.outputs.length > OUTPUT_PREVIEW && (
          <span className="program-output-pill text-muted">
            +{program.outputs.length - OUTPUT_PREVIEW} more
          </span>
        )}
      </div>
      <div className="program-card-keywords">
        {program.keywords.slice(0, 3).map((k) => (
          <span key={k} className="program-keyword">{k}</span>
        ))}
      </div>
      <button className="btn btn-sm btn-primary program-card-cta" onClick={onAnalyze}>
        {program.cta}
      </button>
    </article>
  );
}

