import { useState, useEffect } from "react";
import { healthCheck, type SnapshotResponse } from "../api.ts";

interface Props {
  snapshot: SnapshotResponse | null;
  fileCount: number;
}

export function StatusBar({ snapshot, fileCount }: Props) {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      healthCheck()
        .then(() => { if (!cancelled) setOnline(true); })
        .catch(() => { if (!cancelled) setOnline(false); });
    };
    check();
    const interval = setInterval(check, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <footer
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: 32,
        background: "var(--bg-card)",
        borderTop: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        fontSize: "0.6875rem",
        color: "var(--text-muted)",
        zIndex: 8000,
        fontFamily: "var(--mono)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {/* Connection indicator */}
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: online === null ? "var(--text-muted)" : online ? "var(--green)" : "var(--red)",
              display: "inline-block",
            }}
          />
          {online === null ? "Checking..." : online ? "API Connected" : "API Offline"}
        </span>

        {/* Snapshot stats */}
        {snapshot && (
          <>
            <span>📦 {snapshot.context_map.structure.total_files} files</span>
            <span>📏 {snapshot.context_map.structure.total_loc.toLocaleString()} LOC</span>
            {fileCount > 0 && <span>📄 {fileCount} generated</span>}
          </>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span title="Ctrl+K for command palette">⌘K commands</span>
        <span>Axis Toolbox v0.3.1</span>
      </div>
    </footer>
  );
}
