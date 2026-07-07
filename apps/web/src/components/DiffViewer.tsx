import { useState } from "react";
import type { VersionDiff, FileDiff } from "../api.ts";

// --- DiffViewer (WO-P5) ------------------------------------------------------
// Hand-rolled unified diff render - no dependency. Renders the computed
// FileDiff[] a VersionDiff already carries (added/removed/modified/unchanged
// per file); for "modified" files it additionally computes a line-level diff
// client-side (the API returns whole before/after content, not a line diff).

const CONTEXT_LINES = 3;
// Guards the O(n*m) LCS table against pathological input - above this, line
// pairing is skipped and the file is shown as a full remove+add block instead
// of hanging the tab on a huge generated file.
const MAX_DIFF_CELLS = 400_000;

type LineDiffType = "same" | "add" | "remove";
interface DiffLine {
  type: LineDiffType;
  text: string;
}

/** Line-level diff via a classic LCS dynamic-programming table. */
export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const n = a.length;
  const m = b.length;

  if (n * m > MAX_DIFF_CELLS) {
    const lines: DiffLine[] = [];
    for (const text of a) lines.push({ type: "remove", text });
    for (const text of b) lines.push({ type: "add", text });
    return lines;
  }

  const dp: Uint32Array[] = new Array(n + 1);
  for (let i = 0; i <= n; i++) dp[i] = new Uint32Array(m + 1);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const lines: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      lines.push({ type: "same", text: a[i] });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push({ type: "remove", text: a[i] });
      i++;
    } else {
      lines.push({ type: "add", text: b[j] });
      j++;
    }
  }
  while (i < n) { lines.push({ type: "remove", text: a[i] }); i++; }
  while (j < m) { lines.push({ type: "add", text: b[j] }); j++; }
  return lines;
}

type CollapsedRun = { type: "collapsed"; lines: DiffLine[]; key: string };
type RenderRow = DiffLine | CollapsedRun;

/** Collapse long unchanged runs to a `git diff`-style context window, keeping
 *  CONTEXT_LINES on either side of every change (and none at the file edges).
 *  The collapsed row carries its own covered lines (not just a count/range),
 *  so expanding it later is a direct render with no index re-derivation. */
function collapseContext(lines: DiffLine[]): RenderRow[] {
  const out: RenderRow[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].type !== "same") {
      out.push(lines[i]);
      i++;
      continue;
    }
    let j = i;
    while (j < lines.length && lines[j].type === "same") j++;
    const runLength = j - i;
    const headKeep = i === 0 ? 0 : CONTEXT_LINES;
    const tailKeep = j === lines.length ? 0 : CONTEXT_LINES;
    if (runLength <= headKeep + tailKeep) {
      for (let k = i; k < j; k++) out.push(lines[k]);
    } else {
      for (let k = i; k < i + headKeep; k++) out.push(lines[k]);
      out.push({ type: "collapsed", lines: lines.slice(i + headKeep, j - tailKeep), key: `collapsed-${i}` });
      for (let k = j - tailKeep; k < j; k++) out.push(lines[k]);
    }
    i = j;
  }
  return out;
}

function DiffLineRow({ row }: { row: DiffLine }) {
  const bg = row.type === "add" ? "color-mix(in srgb, var(--green) 12%, transparent)" : row.type === "remove" ? "color-mix(in srgb, var(--red) 12%, transparent)" : "transparent";
  const marker = row.type === "add" ? "+" : row.type === "remove" ? "-" : " ";
  return (
    <div style={{ display: "flex", background: bg, whiteSpace: "pre" }}>
      <span aria-hidden style={{ width: 20, flexShrink: 0, textAlign: "center", color: "var(--text-muted)", userSelect: "none" }}>{marker}</span>
      <span style={{ flex: 1, paddingRight: 12 }}>{row.text.length > 0 ? row.text : " "}</span>
    </div>
  );
}

const ELLIPSIS = String.fromCharCode(0x22ef); // MIDLINE HORIZONTAL ELLIPSIS ( <=> )
const EM_DASH = String.fromCharCode(0x2014);

function CollapsedRow({ row, onExpand }: { row: CollapsedRun; onExpand: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onExpand}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onExpand(); } }}
      style={{ padding: "3px 12px", color: "var(--text-muted)", cursor: "pointer", background: "var(--bg-inset, var(--bg))", whiteSpace: "pre" }}
    >
      {ELLIPSIS} {row.lines.length} unchanged line{row.lines.length === 1 ? "" : "s"} {EM_DASH} click to show {ELLIPSIS}
    </div>
  );
}

function LineDiffView({ oldContent, newContent }: { oldContent: string; newContent: string }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const rows = collapseContext(computeLineDiff(oldContent, newContent));

  return (
    <div className="mono diff-lines" style={{ fontSize: "0.8125rem", overflowX: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
      {rows.map((row, idx) => {
        if (row.type !== "collapsed") return <DiffLineRow key={idx} row={row} />;
        if (expanded.has(row.key)) {
          return (
            <div key={row.key}>
              {row.lines.map((l, i) => <DiffLineRow key={i} row={l} />)}
            </div>
          );
        }
        return <CollapsedRow key={row.key} row={row} onExpand={() => setExpanded((prev) => new Set(prev).add(row.key))} />;
      })}
    </div>
  );
}

function statusBadgeClass(status: FileDiff["status"]): string {
  if (status === "added") return "badge badge-green";
  if (status === "removed") return "badge badge-red";
  if (status === "modified") return "badge badge-accent";
  return "badge";
}

function FileDiffCard({ file, defaultExpanded }: { file: FileDiff; defaultExpanded: boolean }) {
  const [open, setOpen] = useState(defaultExpanded);

  return (
    <div className="card" style={{ marginBottom: 8, padding: 0 }}>
      <div
        className="flex-between"
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((o) => !o); } }}
        style={{ padding: "10px 14px", cursor: "pointer" }}
      >
        <div className="flex" style={{ gap: 8, alignItems: "center" }}>
          <span aria-hidden style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>{open ? "-" : "+"}</span>
          <span className="mono" style={{ fontSize: "0.8125rem" }}>{file.path}</span>
        </div>
        <span className={statusBadgeClass(file.status)}>{file.status}</span>
      </div>
      {open && (
        <div style={{ padding: "0 14px 14px" }}>
          {file.status === "modified" && file.old_content != null && file.new_content != null && (
            <LineDiffView oldContent={file.old_content} newContent={file.new_content} />
          )}
          {file.status === "added" && file.new_content != null && (
            <pre className="mono" style={{ margin: 0, padding: 12, background: "color-mix(in srgb, var(--green) 8%, transparent)", borderRadius: "var(--radius)", overflowX: "auto" }}>{file.new_content}</pre>
          )}
          {file.status === "removed" && file.old_content != null && (
            <pre className="mono" style={{ margin: 0, padding: 12, background: "color-mix(in srgb, var(--red) 8%, transparent)", borderRadius: "var(--radius)", overflowX: "auto" }}>{file.old_content}</pre>
          )}
        </div>
      )}
    </div>
  );
}

export interface DiffViewerProps {
  diff: VersionDiff;
}

export function DiffViewer({ diff }: DiffViewerProps) {
  const [showUnchanged, setShowUnchanged] = useState(false);
  const changed = diff.files.filter((f) => f.status !== "unchanged");
  const unchanged = diff.files.filter((f) => f.status === "unchanged");

  return (
    <div>
      <div className="flex gap-2 flex-wrap mb-4" role="status">
        <span className="badge badge-green">{diff.summary.added} added</span>
        <span className="badge badge-red">{diff.summary.removed} removed</span>
        <span className="badge badge-accent">{diff.summary.modified} modified</span>
        <span className="badge">{diff.summary.unchanged} unchanged</span>
      </div>

      {changed.length === 0 ? (
        <p className="text-muted text-sm">No differences between version {diff.old_version} and version {diff.new_version}.</p>
      ) : (
        changed.map((f) => <FileDiffCard key={f.path} file={f} defaultExpanded={changed.length <= 5} />)
      )}

      {unchanged.length > 0 && (
        <div className="mt-4">
          <button type="button" className="btn" onClick={() => setShowUnchanged((s) => !s)}>
            {showUnchanged ? "Hide" : "Show"} {unchanged.length} unchanged file{unchanged.length === 1 ? "" : "s"}
          </button>
          {showUnchanged && (
            <ul className="text-muted text-sm mt-2" style={{ paddingLeft: 20 }}>
              {unchanged.map((f) => <li key={f.path} className="mono">{f.path}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
