import type { ContextMap } from "../api.ts";

interface Props {
  ctx: ContextMap;
}

export function GraphTab({ ctx }: Props) {
  const deps = ctx.dependency_graph;
  const prodDeps = deps.external_dependencies.filter((d) => d.type === "production");
  const devDeps = deps.external_dependencies.filter((d) => d.type === "development");

  return (
    <div>
      {/* Hotspots */}
      {deps.hotspots.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>🔥 Hotspots</h3>
          <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginBottom: 8 }}>
            Files with high dependency fan-in/fan-out — changes here have the most ripple effect.
          </p>
          <table>
            <thead>
              <tr><th>File</th><th style={{ textAlign: "right" }}>Inbound</th><th style={{ textAlign: "right" }}>Outbound</th><th>Risk</th></tr>
            </thead>
            <tbody>
              {deps.hotspots.map((h) => (
                <tr key={h.path}>
                  <td className="mono">{h.path}</td>
                  <td style={{ textAlign: "right" }} className="mono">{h.inbound_count}</td>
                  <td style={{ textAlign: "right" }} className="mono">{h.outbound_count}</td>
                  <td>
                    <div className="flex" style={{ gap: 8 }}>
                      <div className="progress-bar" style={{ width: 60 }}>
                        <div
                          className="progress-fill"
                          style={{
                            width: `${h.risk_score * 100}%`,
                            background: h.risk_score > 0.7 ? "var(--red)" : h.risk_score > 0.4 ? "var(--yellow)" : "var(--green)",
                          }}
                        />
                      </div>
                      <span className="mono">{(h.risk_score * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Internal imports */}
      {deps.internal_imports.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Internal Import Graph ({deps.internal_imports.length} edges)</h3>
          <div style={{ maxHeight: 400, overflow: "auto" }}>
            <table>
              <thead>
                <tr><th>Source</th><th>→</th><th>Target</th><th>Specifier</th></tr>
              </thead>
              <tbody>
                {deps.internal_imports.map((edge, i) => (
                  <tr key={i}>
                    <td className="mono">{edge.source}</td>
                    <td style={{ color: "var(--text-muted)" }}>→</td>
                    <td className="mono">{edge.target}</td>
                    <td className="mono" style={{ color: "var(--text-muted)" }}>{edge.specifier}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-2">
        {/* Production dependencies */}
        <div className="card">
          <h3>Production Dependencies ({prodDeps.length})</h3>
          {prodDeps.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>None</p>
          ) : (
            <div style={{ maxHeight: 300, overflow: "auto" }}>
              <table>
                <thead>
                  <tr><th>Package</th><th>Version</th></tr>
                </thead>
                <tbody>
                  {prodDeps.map((d) => (
                    <tr key={d.name}>
                      <td className="mono">{d.name}</td>
                      <td className="mono" style={{ color: "var(--text-muted)" }}>{d.version}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Dev dependencies */}
        <div className="card">
          <h3>Dev Dependencies ({devDeps.length})</h3>
          {devDeps.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>None</p>
          ) : (
            <div style={{ maxHeight: 300, overflow: "auto" }}>
              <table>
                <thead>
                  <tr><th>Package</th><th>Version</th></tr>
                </thead>
                <tbody>
                  {devDeps.map((d) => (
                    <tr key={d.name}>
                      <td className="mono">{d.name}</td>
                      <td className="mono" style={{ color: "var(--text-muted)" }}>{d.version}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
