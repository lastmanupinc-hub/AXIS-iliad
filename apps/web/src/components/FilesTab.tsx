import { useState } from "react";
import type { ContextMap } from "../api.ts";

interface Props {
  ctx: ContextMap;
}

type SortKey = "path" | "language" | "loc" | "role";

export function FilesTab({ ctx }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("path");
  const [sortAsc, setSortAsc] = useState(true);
  const [filter, setFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const files = ctx.structure.file_tree_summary;
  const roles = Array.from(new Set(files.map((f) => f.role))).sort();

  const filtered = files
    .filter((f) => {
      if (filter && !f.path.toLowerCase().includes(filter.toLowerCase())) return false;
      if (roleFilter !== "all" && f.role !== roleFilter) return false;
      return true;
    })
    .sort((a, b) => {
      const aVal = a[sortKey] ?? "";
      const bVal = b[sortKey] ?? "";
      const cmp = typeof aVal === "number" ? aVal - (bVal as number) : String(aVal).localeCompare(String(bVal));
      return sortAsc ? cmp : -cmp;
    });

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  }

  return (
    <div>
      {/* Top-level layout */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Directory Layout</h3>
        <div className="grid grid-3" style={{ marginTop: 8 }}>
          {ctx.structure.top_level_layout.map((dir) => (
            <div key={dir.name} className="flex" style={{ gap: 8 }}>
              <span style={{ fontSize: "1.25rem" }}>📁</span>
              <div>
                <div className="mono" style={{ fontWeight: 500 }}>{dir.name}/</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  {dir.purpose} · {dir.file_count} files
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="flex" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}>
            <input
              placeholder="Filter files..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            style={{ width: 140 }}
          >
            <option value="all">All roles</option>
            {roles.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <span className="badge" style={{ whiteSpace: "nowrap" }}>
            {filtered.length}/{files.length}
          </span>
        </div>
      </div>

      {/* File table */}
      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <table>
          <thead>
            <tr>
              <th onClick={() => handleSort("path")} style={{ cursor: "pointer" }}>
                Path {sortKey === "path" ? (sortAsc ? "↑" : "↓") : ""}
              </th>
              <th onClick={() => handleSort("language")} style={{ cursor: "pointer" }}>
                Language {sortKey === "language" ? (sortAsc ? "↑" : "↓") : ""}
              </th>
              <th onClick={() => handleSort("loc")} style={{ cursor: "pointer", textAlign: "right" }}>
                LOC {sortKey === "loc" ? (sortAsc ? "↑" : "↓") : ""}
              </th>
              <th onClick={() => handleSort("role")} style={{ cursor: "pointer" }}>
                Role {sortKey === "role" ? (sortAsc ? "↑" : "↓") : ""}
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 200).map((f) => (
              <tr key={f.path}>
                <td className="mono">{f.path}</td>
                <td>{f.language ? <span className="badge">{f.language}</span> : <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                <td style={{ textAlign: "right" }} className="mono">{f.loc}</td>
                <td>
                  <span className={`badge ${f.role === "source" ? "badge-green" : f.role === "test" ? "badge-blue" : f.role === "config" ? "badge-yellow" : ""}`}>
                    {f.role}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 200 && (
          <div style={{ padding: 12, textAlign: "center", color: "var(--text-muted)", fontSize: "0.875rem" }}>
            Showing 200 of {filtered.length} files
          </div>
        )}
      </div>
    </div>
  );
}
