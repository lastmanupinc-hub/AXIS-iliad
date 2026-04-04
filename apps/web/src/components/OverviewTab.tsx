import type { ContextMap, RepoProfile } from "../api.ts";

interface Props {
  ctx: ContextMap;
  profile: RepoProfile;
}

export function OverviewTab({ ctx, profile }: Props) {
  const health = profile.health;
  const healthItems = [
    { label: "TypeScript", ok: health.has_typescript },
    { label: "Tests", ok: health.has_tests, detail: health.test_file_count > 0 ? `${health.test_file_count} files` : undefined },
    { label: "CI/CD", ok: health.has_ci },
    { label: "Linter", ok: health.has_linter },
    { label: "Formatter", ok: health.has_formatter },
    { label: "Lockfile", ok: health.has_lockfile },
    { label: "README", ok: health.has_readme },
  ];

  return (
    <div>
      {/* Stats row */}
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="card" style={{ textAlign: "center" }}>
          <div className="stat-value">{ctx.structure.total_files}</div>
          <div className="stat-label">Files</div>
        </div>
        <div className="card" style={{ textAlign: "center" }}>
          <div className="stat-value">{ctx.structure.total_loc.toLocaleString()}</div>
          <div className="stat-label">Lines of Code</div>
        </div>
        <div className="card" style={{ textAlign: "center" }}>
          <div className="stat-value">{health.dependency_count}</div>
          <div className="stat-label">Dependencies</div>
        </div>
        <div className="card" style={{ textAlign: "center" }}>
          <div className="stat-value">{(health.separation_score * 100).toFixed(0)}%</div>
          <div className="stat-label">Separation Score</div>
        </div>
      </div>

      <div className="grid grid-2">
        {/* Frameworks */}
        <div className="card">
          <h3>Frameworks</h3>
          {ctx.detection.frameworks.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>None detected</p>
          ) : (
            <table>
              <thead>
                <tr><th>Name</th><th>Confidence</th><th>Signals</th></tr>
              </thead>
              <tbody>
                {ctx.detection.frameworks.map((fw) => (
                  <tr key={fw.name}>
                    <td style={{ fontWeight: 500 }}>{fw.name}</td>
                    <td>
                      <div className="flex" style={{ gap: 8 }}>
                        <div className="progress-bar" style={{ width: 60 }}>
                          <div
                            className="progress-fill"
                            style={{
                              width: `${fw.confidence * 100}%`,
                              background: fw.confidence >= 0.8 ? "var(--green)" : fw.confidence >= 0.5 ? "var(--yellow)" : "var(--red)",
                            }}
                          />
                        </div>
                        <span className="mono">{(fw.confidence * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-wrap" style={{ gap: 4 }}>
                        {fw.signals.slice(0, 3).map((s) => (
                          <span key={s} className="badge" style={{ fontSize: "0.6875rem" }}>{s}</span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Languages */}
        <div className="card">
          <h3>Languages</h3>
          {ctx.detection.languages.map((lang) => (
            <div key={lang.name} style={{ marginBottom: 8 }}>
              <div className="flex-between" style={{ marginBottom: 2 }}>
                <span style={{ fontSize: "0.875rem" }}>{lang.name}</span>
                <span className="mono" style={{ color: "var(--text-muted)" }}>
                  {lang.file_count} files · {lang.loc.toLocaleString()} LOC · {lang.loc_percent}%
                </span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${lang.loc_percent}%`, background: "var(--accent)" }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Health */}
        <div className="card">
          <h3>Project Health</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", marginTop: 8 }}>
            {healthItems.map((item) => (
              <div key={item.label} className="flex" style={{ gap: 8 }}>
                <span style={{ fontSize: "1rem" }}>{item.ok ? "✅" : "❌"}</span>
                <span style={{ fontSize: "0.875rem" }}>
                  {item.label}
                  {item.detail && (
                    <span style={{ color: "var(--text-muted)", marginLeft: 4 }}>({item.detail})</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Architecture */}
        <div className="card">
          <h3>Architecture</h3>
          {ctx.architecture_signals.patterns_detected.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <label>Patterns</label>
              <div className="flex flex-wrap" style={{ gap: 4 }}>
                {ctx.architecture_signals.patterns_detected.map((p) => (
                  <span key={p} className="badge badge-blue">{p.replace(/_/g, " ")}</span>
                ))}
              </div>
            </div>
          )}
          {ctx.architecture_signals.layer_boundaries.length > 0 && (
            <div>
              <label>Layers</label>
              {ctx.architecture_signals.layer_boundaries.map((layer) => (
                <div key={layer.layer} className="flex" style={{ gap: 8, marginBottom: 4 }}>
                  <span className="badge badge-accent" style={{ minWidth: 100, textAlign: "center" }}>
                    {layer.layer}
                  </span>
                  <span className="mono" style={{ color: "var(--text-muted)" }}>
                    {layer.directories.join(", ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Routes */}
        {ctx.routes.length > 0 && (
          <div className="card">
            <h3>Routes ({ctx.routes.length})</h3>
            <table>
              <thead>
                <tr><th>Method</th><th>Path</th><th>Source</th></tr>
              </thead>
              <tbody>
                {ctx.routes.map((r, i) => (
                  <tr key={i}>
                    <td><span className={`badge ${r.method === "GET" ? "badge-green" : r.method === "POST" ? "badge-blue" : "badge-yellow"}`}>{r.method}</span></td>
                    <td className="mono">{r.path}</td>
                    <td className="mono" style={{ color: "var(--text-muted)" }}>{r.source_file}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Entry Points */}
        {ctx.entry_points.length > 0 && (
          <div className="card">
            <h3>Entry Points ({ctx.entry_points.length})</h3>
            <table>
              <thead>
                <tr><th>Path</th><th>Type</th><th>Description</th></tr>
              </thead>
              <tbody>
                {ctx.entry_points.map((ep, i) => (
                  <tr key={i}>
                    <td className="mono">{ep.path}</td>
                    <td><span className="badge">{ep.type}</span></td>
                    <td style={{ color: "var(--text-muted)" }}>{ep.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Warnings */}
        {ctx.ai_context.warnings.length > 0 && (
          <div className="card" style={{ borderColor: "var(--yellow)" }}>
            <h3>⚠️ Warnings</h3>
            <ul style={{ paddingLeft: 20, marginTop: 8 }}>
              {ctx.ai_context.warnings.map((w, i) => (
                <li key={i} style={{ color: "var(--yellow)", fontSize: "0.875rem", marginBottom: 4 }}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Conventions */}
        {ctx.ai_context.conventions.length > 0 && (
          <div className="card">
            <h3>Conventions</h3>
            <div className="flex flex-wrap" style={{ gap: 6, marginTop: 8 }}>
              {ctx.ai_context.conventions.map((c, i) => (
                <span key={i} className="badge badge-green">{c}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
