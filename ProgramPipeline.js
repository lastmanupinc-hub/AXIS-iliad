/**
 * AXIS Toolbox — Program Pipeline Dashboard
 * Vanilla JS component: interactive visualization of the 17-program × 80-generator pipeline.
 * No framework dependencies. Attach to any DOM element.
 *
 * Usage:
 *   const dashboard = new ProgramPipeline(document.getElementById('pipeline'));
 *   dashboard.render();
 */

class ProgramPipeline {
  constructor(container) {
    this.container = container;
    this.programs = [
      { name: 'Search', tier: 'free', generators: 4, grade: 'A', outputs: ['context-map.json', 'repo-profile.yaml', 'architecture-summary.md', 'dependency-hotspots.md'] },
      { name: 'Debug', tier: 'free', generators: 4, grade: 'A', outputs: ['debug-playbook.md', 'tracing-rules.md', 'error-catalog.md', 'health-check.md'] },
      { name: 'Skills', tier: 'free', generators: 5, grade: 'A', outputs: ['AGENTS.md', 'CLAUDE.md', '.cursorrules', 'workflow-pack.md', '.copilot-instructions.md'] },
      { name: 'Frontend + SEO', tier: 'pro', generators: 5, grade: 'A', outputs: ['frontend-rules.md', 'seo-audit.md', 'component-inventory.md', 'accessibility-report.md', 'performance-budget.md'] },
      { name: 'Theme', tier: 'pro', generators: 3, grade: 'A', outputs: ['design-tokens.json', 'color-system.md', 'component-styles.css'] },
      { name: 'Brand', tier: 'pro', generators: 4, grade: 'A', outputs: ['brand-guidelines.md', 'voice-tone.md', 'vocabulary.md', 'positioning.md'] },
      { name: 'Notebook', tier: 'pro', generators: 4, grade: 'A', outputs: ['notebook-summary.md', 'source-map.md', 'research-threads.md', 'cross-references.md'] },
      { name: 'Artifacts', tier: 'pro', generators: 5, grade: 'A', outputs: ['pipeline-tracker.js', 'artifact-spec.md', 'component.tsx', 'utility.ts', 'config.json'] },
      { name: 'Optimization', tier: 'pro', generators: 4, grade: 'A', outputs: ['optimization-rules.md', 'context-budget.md', 'cost-model.md', 'token-analysis.md'] },
      { name: 'Marketing', tier: 'pro', generators: 6, grade: 'A', outputs: ['marketing-pack.md', 'competitive-landscape.md', 'funnel.md', 'email-sequences.md', 'landing-copy.md', 'social-kit.md'] },
      { name: 'MCP', tier: 'pro', generators: 4, grade: 'A', outputs: ['mcp-config.json', 'tool-definitions.md', 'resource-map.md', 'prompt-templates.md'] },
      { name: 'Obsidian', tier: 'pro', generators: 5, grade: 'A', outputs: ['obsidian-vault-pack.md', 'moc-templates.md', 'dataview-queries.md', 'daily-notes.md', 'graph-config.md'] },
      { name: 'Superpowers', tier: 'pro', generators: 4, grade: 'A', outputs: ['superpowers-pack.md', 'capability-matrix.md', 'rarity-index.md', 'unlock-guide.md'] },
      { name: 'Remotion', tier: 'pro', generators: 5, grade: 'A', outputs: ['remotion-pack.md', 'storyboard.md', 'scene-config.json', 'narration-script.md', 'asset-list.md'] },
      { name: 'Canvas', tier: 'pro', generators: 4, grade: 'A', outputs: ['canvas-pack.md', 'brand-board.md', 'layout-spec.md', 'export-config.json'] },
      { name: 'Algorithmic', tier: 'pro', generators: 5, grade: 'A', outputs: ['algorithmic-pack.json', 'generative-sketch.js', 'topology-analysis.md', 'graph-data.json', 'visualization-config.md'] },
      { name: 'Payment', tier: 'pro', generators: 4, grade: 'F', outputs: ['payment-integration.md', 'billing-schema.md', 'webhook-spec.md', 'stripe-config.json'] }
    ];
    this.selectedProgram = null;
    this.filterTier = 'all';
  }

  get totalGenerators() {
    return this.programs.reduce((sum, p) => sum + p.generators, 0);
  }

  get filteredPrograms() {
    if (this.filterTier === 'all') return this.programs;
    return this.programs.filter(p => p.tier === this.filterTier);
  }

  gradeColor(grade) {
    const colors = { A: '#3fb950', B: '#d29922', F: '#f85149' };
    return colors[grade] || '#8b949e';
  }

  tierBadge(tier) {
    return tier === 'free'
      ? '<span class="ax-badge ax-badge--free">FREE</span>'
      : '<span class="ax-badge ax-badge--pro">PRO</span>';
  }

  renderStyles() {
    return `
      <style>
        .ax-pipeline { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; background: #0d1117; color: #e6edf3; padding: 24px; border-radius: 8px; }
        .ax-pipeline * { box-sizing: border-box; margin: 0; padding: 0; }
        .ax-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .ax-title { font-size: 1.5rem; font-weight: 600; }
        .ax-stats { display: flex; gap: 24px; }
        .ax-stat { text-align: center; }
        .ax-stat-value { font-size: 1.75rem; font-weight: 700; color: #58a6ff; }
        .ax-stat-label { font-size: 0.75rem; color: #8b949e; text-transform: uppercase; letter-spacing: 0.05em; }
        .ax-filters { display: flex; gap: 8px; margin-bottom: 16px; }
        .ax-filter { padding: 6px 14px; border-radius: 20px; border: 1px solid #30363d; background: transparent; color: #8b949e; cursor: pointer; font-size: 0.8rem; transition: all 150ms ease; }
        .ax-filter:hover { border-color: #58a6ff; color: #e6edf3; }
        .ax-filter--active { background: #58a6ff; color: #0d1117; border-color: #58a6ff; font-weight: 600; }
        .ax-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
        .ax-card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; cursor: pointer; transition: all 200ms ease; position: relative; }
        .ax-card:hover { border-color: #58a6ff; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.4); }
        .ax-card--selected { border-color: #58a6ff; box-shadow: 0 0 0 1px #58a6ff, 0 4px 12px rgba(88,166,255,0.2); }
        .ax-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .ax-card-name { font-weight: 600; font-size: 0.95rem; }
        .ax-card-grade { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700; }
        .ax-card-meta { display: flex; justify-content: space-between; align-items: center; }
        .ax-card-generators { font-size: 0.8rem; color: #8b949e; }
        .ax-badge { font-size: 0.65rem; padding: 2px 8px; border-radius: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
        .ax-badge--free { background: #3fb95026; color: #3fb950; }
        .ax-badge--pro { background: #58a6ff26; color: #58a6ff; }
        .ax-detail { margin-top: 20px; background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 20px; display: none; }
        .ax-detail--visible { display: block; }
        .ax-detail-title { font-size: 1.1rem; font-weight: 600; margin-bottom: 12px; color: #58a6ff; }
        .ax-detail-outputs { list-style: none; }
        .ax-detail-outputs li { padding: 6px 0; border-bottom: 1px solid #21262d; font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; color: #8b949e; }
        .ax-detail-outputs li:last-child { border-bottom: none; }
        .ax-pipeline-flow { margin-top: 20px; padding: 16px; background: #161b22; border: 1px solid #30363d; border-radius: 8px; }
        .ax-flow-label { font-size: 0.75rem; color: #8b949e; text-transform: uppercase; margin-bottom: 8px; }
        .ax-flow-steps { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .ax-flow-step { padding: 6px 12px; background: #21262d; border-radius: 4px; font-size: 0.8rem; color: #e6edf3; }
        .ax-flow-arrow { color: #58a6ff; font-size: 1rem; }
      </style>
    `;
  }

  renderHeader() {
    const gradeA = this.programs.filter(p => p.grade === 'A').length;
    return `
      <div class="ax-header">
        <div class="ax-title">AXIS Program Pipeline</div>
        <div class="ax-stats">
          <div class="ax-stat"><div class="ax-stat-value">${this.programs.length}</div><div class="ax-stat-label">Programs</div></div>
          <div class="ax-stat"><div class="ax-stat-value">${this.totalGenerators}</div><div class="ax-stat-label">Generators</div></div>
          <div class="ax-stat"><div class="ax-stat-value">${gradeA}/${this.programs.length}</div><div class="ax-stat-label">Grade A</div></div>
        </div>
      </div>
    `;
  }

  renderFilters() {
    const tiers = ['all', 'free', 'pro'];
    return `
      <div class="ax-filters">
        ${tiers.map(t => `<button class="ax-filter ${this.filterTier === t ? 'ax-filter--active' : ''}" data-tier="${t}">${t === 'all' ? 'All Programs' : t === 'free' ? 'Free Tier' : 'Pro Tier'}</button>`).join('')}
      </div>
    `;
  }

  renderGrid() {
    return `
      <div class="ax-grid">
        ${this.filteredPrograms.map((p, i) => `
          <div class="ax-card ${this.selectedProgram === i ? 'ax-card--selected' : ''}" data-index="${this.programs.indexOf(p)}">
            <div class="ax-card-header">
              <span class="ax-card-name">${p.name}</span>
              <span class="ax-card-grade" style="background:${this.gradeColor(p.grade)}26;color:${this.gradeColor(p.grade)}">${p.grade}</span>
            </div>
            <div class="ax-card-meta">
              <span class="ax-card-generators">${p.generators} generators</span>
              ${this.tierBadge(p.tier)}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  renderDetail() {
    if (this.selectedProgram === null) return '<div class="ax-detail"></div>';
    const p = this.programs[this.selectedProgram];
    return `
      <div class="ax-detail ax-detail--visible">
        <div class="ax-detail-title">Axis ${p.name} — ${p.generators} Generators</div>
        <ul class="ax-detail-outputs">
          ${p.outputs.map(o => `<li>${o}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  renderPipelineFlow() {
    const steps = ['Upload / CLI', 'Validation', 'repo-parser', 'context-engine', 'generator-core', '87 Artifacts'];
    return `
      <div class="ax-pipeline-flow">
        <div class="ax-flow-label">Execution Pipeline</div>
        <div class="ax-flow-steps">
          ${steps.map((s, i) => `<span class="ax-flow-step">${s}</span>${i < steps.length - 1 ? '<span class="ax-flow-arrow">→</span>' : ''}`).join('')}
        </div>
      </div>
    `;
  }

  bindEvents() {
    this.container.querySelectorAll('.ax-card').forEach(card => {
      card.addEventListener('click', () => {
        const index = parseInt(card.dataset.index, 10);
        this.selectedProgram = this.selectedProgram === index ? null : index;
        this.render();
      });
    });

    this.container.querySelectorAll('.ax-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        this.filterTier = btn.dataset.tier;
        this.selectedProgram = null;
        this.render();
      });
    });
  }

  render() {
    this.container.innerHTML = `
      ${this.renderStyles()}
      <div class="ax-pipeline">
        ${this.renderHeader()}
        ${this.renderFilters()}
        ${this.renderGrid()}
        ${this.renderDetail()}
        ${this.renderPipelineFlow()}
      </div>
    `;
    this.bindEvents();
  }
}

// Auto-init if a #pipeline element exists
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('pipeline');
    if (el) new ProgramPipeline(el).render();
  });
}
