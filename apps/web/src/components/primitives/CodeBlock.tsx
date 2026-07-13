import { useEffect, useRef, useState } from "react";

// ─── CodeBlock (WO-F4) ──────────────────────────────────────────────────────
// Mono <pre> with a copy button — generalizes the hand-rolled trio in
// InstallPage / ExamplesPage / DocsPage (those pages migrate in the Wave-4
// sweep). `wrap` reproduces the install-config style (pre-wrap + break-all
// for long JSON one-liners); default scrolls horizontally inside its own box.

export interface CodeBlockProps {
  code: string;
  /** Small caption above the block (file name, platform, language). */
  label?: string;
  /** Soft-wrap long lines instead of horizontal scrolling. */
  wrap?: boolean;
  maxHeight?: number;
  /** Accessible name for the copy button (defaults to "Copy code"). */
  copyLabel?: string;
}

export function CodeBlock({ code, label, wrap = false, maxHeight, copyLabel = "Copy code" }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const handleCopy = () => {
    void navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    }).catch(() => { /* clipboard unavailable (permissions/insecure context) — button stays "Copy" */ });
  };

  return (
    <div className="code-block">
      {label && <div className="code-block-label">{label}</div>}
      <div className="code-block-body">
        <pre
          className={wrap ? "code-block-pre code-block-pre-wrap" : "code-block-pre"}
          style={maxHeight !== undefined ? { maxHeight, overflowY: "auto" } : undefined}
        >
          <code>{code}</code>
        </pre>
        <button type="button" className={`code-copy${copied ? " code-copy-done" : ""}`} onClick={handleCopy} aria-label={copied ? "Copied" : copyLabel}>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}
