import { useState, useEffect, useRef } from "react";
import { healthCheck, type SnapshotResponse } from "../api.ts";
import { APP_VERSION } from "../version.ts";

interface Props {
  snapshot: SnapshotResponse | null;
  fileCount: number;
  /** Opens the full Status page (WO-P17) — omitted in the kitchen-sink
   *  gallery and other contexts with no router, where the dot is decorative. */
  onOpenStatus?: () => void;
}

export function StatusBar({ snapshot, fileCount, onOpenStatus }: Props) {
  const [online, setOnline] = useState<boolean | null>(null);
  // H-Phase-A cycle 11: `cancelled` only guards against an update after
  // UNMOUNT — a slow tick N response landing after a faster tick N+1 could
  // still overwrite fresher state with a stale one (e.g. showing "down"
  // briefly right after a real recovery). tickRef adds per-invocation
  // ordering on top of the existing unmount guard.
  const tickRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      const tick = ++tickRef.current;
      healthCheck()
        .then(() => { if (!cancelled && tick === tickRef.current) setOnline(true); })
        .catch(() => { if (!cancelled && tick === tickRef.current) setOnline(false); });
    };
    check();
    const interval = setInterval(check, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <footer
      className="statusbar"
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
      <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
        {/* Connection indicator — links to the full Status page (WO-P17) when a router is present.
            Always visible: the single most important piece of live status, and short enough
            to never overflow a narrow bar on its own. */}
        <ConnectionIndicator online={online} onOpenStatus={onOpenStatus} />

        {/* Snapshot stats — hidden below 600px (see index.css) so this fixed-height,
            all-inline-styled bar never overflows on a narrow viewport; className-driven
            since a media query can't override an inline `display` otherwise. */}
        {snapshot && (
          <span className="statusbar-optional" style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span>📦 {snapshot.context_map.structure.total_files} files</span>
            <span>📏 {snapshot.context_map.structure.total_loc.toLocaleString()} LOC</span>
            {fileCount > 0 && <span>📄 {fileCount} generated</span>}
          </span>
        )}
      </div>

      <div className="statusbar-optional" style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span title="Ctrl+K for command palette">⌘K commands</span>
        <span>Axis' Iliad v{APP_VERSION}</span>
      </div>
    </footer>
  );
}

function ConnectionIndicator({ online, onOpenStatus }: { online: boolean | null; onOpenStatus?: () => void }) {
  const dot = (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: online === null ? "var(--text-muted)" : online ? "var(--green)" : "var(--red)",
        display: "inline-block",
      }}
    />
  );
  const label = online === null ? "Checking..." : online ? "API Connected" : "API Offline";

  if (!onOpenStatus) {
    return (
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {dot}
        {label}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpenStatus}
      title="View full system status"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        background: "none",
        border: "none",
        padding: 0,
        font: "inherit",
        color: "inherit",
        cursor: "pointer",
      }}
    >
      {dot}
      {label}
    </button>
  );
}
