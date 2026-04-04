import { useState, useEffect, useCallback, useRef } from "react";

export interface PaletteAction {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  section?: string;
  onSelect: () => void;
}

interface Props {
  actions: PaletteAction[];
}

export function CommandPalette({ actions }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ctrl+K / Cmd+K to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        setQuery("");
        setSelected(0);
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const filtered = actions.filter((a) =>
    a.label.toLowerCase().includes(query.toLowerCase()) ||
    (a.section?.toLowerCase().includes(query.toLowerCase()) ?? false),
  );

  const handleSelect = useCallback(
    (action: PaletteAction) => {
      setOpen(false);
      action.onSelect();
    },
    [],
  );

  useEffect(() => {
    if (selected >= filtered.length) setSelected(Math.max(0, filtered.length - 1));
  }, [filtered.length, selected]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, filtered.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
      else if (e.key === "Enter" && filtered[selected]) { e.preventDefault(); handleSelect(filtered[selected]); }
    },
    [filtered, selected, handleSelect],
  );

  if (!open) return null;

  // Group by section
  const sections = new Map<string, PaletteAction[]>();
  for (const a of filtered) {
    const sec = a.section ?? "";
    if (!sections.has(sec)) sections.set(sec, []);
    sections.get(sec)!.push(a);
  }

  let idx = 0;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 9500,
        }}
        onClick={() => setOpen(false)}
      />

      {/* Palette */}
      <div
        className="animate-scale-in"
        style={{
          position: "fixed",
          top: "20%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: 520,
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
          zIndex: 9600,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              width: "100%",
              fontSize: "0.9375rem",
              color: "var(--text)",
            }}
          />
        </div>

        <div style={{ maxHeight: 320, overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: "0.875rem" }}>
              No matching commands
            </div>
          ) : (
            [...sections.entries()].map(([section, items]) => (
              <div key={section}>
                {section && (
                  <div
                    style={{
                      padding: "8px 16px 4px",
                      fontSize: "0.6875rem",
                      fontWeight: 600,
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {section}
                  </div>
                )}
                {items.map((a) => {
                  const thisIdx = idx++;
                  return (
                    <div
                      key={a.id}
                      onClick={() => handleSelect(a)}
                      style={{
                        padding: "8px 16px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        cursor: "pointer",
                        background: thisIdx === selected ? "var(--bg-hover)" : "transparent",
                        fontSize: "0.875rem",
                      }}
                      onMouseEnter={() => setSelected(thisIdx)}
                    >
                      <span>
                        {a.icon && <span style={{ marginRight: 8 }}>{a.icon}</span>}
                        {a.label}
                      </span>
                      {a.shortcut && (
                        <kbd
                          style={{
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: "var(--bg)",
                            border: "1px solid var(--border)",
                            fontSize: "0.6875rem",
                            color: "var(--text-muted)",
                            fontFamily: "var(--mono)",
                          }}
                        >
                          {a.shortcut}
                        </kbd>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div
          style={{
            borderTop: "1px solid var(--border)",
            padding: "6px 16px",
            display: "flex",
            justifyContent: "space-between",
            fontSize: "0.6875rem",
            color: "var(--text-muted)",
          }}
        >
          <span>↑↓ navigate · ↵ select · esc close</span>
          <span>{filtered.length} commands</span>
        </div>
      </div>
    </>
  );
}
