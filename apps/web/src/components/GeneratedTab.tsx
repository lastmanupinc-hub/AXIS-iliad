import { useState } from "react";
import type { GeneratedFile } from "../api.ts";

interface Props {
  files: GeneratedFile[];
}

const PROGRAM_COLORS: Record<string, string> = {
  search: "badge-green",
  skills: "badge-accent",
  debug: "badge-yellow",
  frontend: "badge-blue",
};

export function GeneratedTab({ files }: Props) {
  const [selectedFile, setSelectedFile] = useState<GeneratedFile | null>(null);
  const [copied, setCopied] = useState(false);

  const programs = Array.from(new Set(files.map((f) => f.program)));

  function handleCopy() {
    if (!selectedFile) return;
    navigator.clipboard.writeText(selectedFile.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (files.length === 0) {
    return (
      <div className="empty-state">
        <div style={{ fontSize: "2rem", marginBottom: 8 }}>📄</div>
        <p>No generated files yet</p>
      </div>
    );
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: "280px 1fr", alignItems: "start" }}>
      {/* File list sidebar */}
      <div className="card" style={{ padding: 12 }}>
        <h3 style={{ padding: "0 8px 8px" }}>Files ({files.length})</h3>
        {programs.map((program) => (
          <div key={program} style={{ marginBottom: 12 }}>
            <div style={{ padding: "4px 8px" }}>
              <span className={`badge ${PROGRAM_COLORS[program] ?? ""}`}>{program}</span>
            </div>
            {files
              .filter((f) => f.program === program)
              .map((f) => (
                <div
                  key={f.path}
                  onClick={() => { setSelectedFile(f); setCopied(false); }}
                  style={{
                    padding: "6px 8px",
                    borderRadius: 4,
                    cursor: "pointer",
                    background: selectedFile?.path === f.path ? "var(--bg-hover)" : "transparent",
                    borderLeft: selectedFile?.path === f.path ? "2px solid var(--accent)" : "2px solid transparent",
                  }}
                >
                  <div className="mono" style={{ fontSize: "0.8125rem" }}>
                    {f.path}
                  </div>
                  <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                    {f.description}
                  </div>
                </div>
              ))}
          </div>
        ))}
      </div>

      {/* File viewer */}
      <div className="card" style={{ minHeight: 400 }}>
        {selectedFile ? (
          <>
            <div className="flex-between" style={{ marginBottom: 12 }}>
              <div>
                <h3 className="mono">{selectedFile.path}</h3>
                <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                  {selectedFile.description} · {selectedFile.content_type}
                </p>
              </div>
              <button className="btn" onClick={handleCopy}>
                {copied ? "✓ Copied" : "📋 Copy"}
              </button>
            </div>
            <pre>{selectedFile.content}</pre>
          </>
        ) : (
          <div className="empty-state">
            <p>Select a file to preview</p>
          </div>
        )}
      </div>
    </div>
  );
}
