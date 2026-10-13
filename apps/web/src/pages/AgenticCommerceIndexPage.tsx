import { useState, useEffect, useCallback } from "react";
import {
  getAgenticCommerceIndex,
  apiErrorDetails,
  AGENTIC_COMMERCE_INDEX_PATH,
  type AgenticCommerceIndex,
  type CommerceIndexBreakdown,
  type CommerceIndexRow,
} from "../api.ts";
import { DOCS_API_BASE } from "../config.ts";
import { SectionHeader, Callout, Skeleton, TableWrap, Pill } from "../components/primitives/index.ts";

// ─── AgenticCommerceIndexPage (AXIS Launch taskgate T16) ──────────────────
// Public, no login ("#agentic-commerce-index", alias /agentic-commerce-index).
// Renders the weekly index the API stores (GET /v1/agentic-commerce-index):
// shares, ranks and week-over-week changes of MCP tool usage. The API sends no
// counts at all, so this page cannot display one — by construction, not by
// discipline. The intro and "how to read it" copy are static so a crawler
// that does not run JavaScript still gets a real page.

interface AsyncError {
  /** Raw/technical detail, behind the Callout's collapsed disclosure. */
  details: string | null;
}

const JSON_URL = `${DOCS_API_BASE}${AGENTIC_COMMERCE_INDEX_PATH}`;

const PRICING_LABEL: Record<string, string> = {
  metered: "Metered",
  not_metered: "Free or plan",
};

function formatDay(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/** The week is [start, end) — show the last day it covers, not the boundary it ends on. */
function formatWeek(start: string | null, end: string | null): string {
  if (!start || !end) return "";
  const lastDay = new Date(new Date(end).getTime() - 86_400_000).toISOString();
  return `${formatDay(start)} – ${formatDay(lastDay)} (UTC)`;
}

function formatChange(pp: number | null): string {
  if (pp === null) return "—";
  if (pp > 0) return `+${pp} pts`;
  if (pp < 0) return `−${Math.abs(pp)} pts`;
  return "0 pts";
}

function ShareCell({ pct }: { pct: number }) {
  return (
    <div className="flex gap-2" style={{ alignItems: "center", minWidth: 120 }}>
      <div className="progress-bar" style={{ flex: 1 }} aria-hidden>
        <div className="progress-fill" style={{ width: `${pct}%`, background: "var(--accent)" }} />
      </div>
      <span className="mono" style={{ minWidth: 40, textAlign: "right" }}>{pct}%</span>
    </div>
  );
}

function BreakdownTable({
  title,
  caption,
  breakdown,
  extraColumns,
}: {
  title: string;
  caption: string;
  breakdown: CommerceIndexBreakdown;
  extraColumns?: { header: string; cell: (row: CommerceIndexRow) => string }[];
}) {
  const extras = extraColumns ?? [];
  return (
    <div className="card mb-4">
      <h2 className="mb-1" style={{ fontSize: "1rem", fontWeight: 600 }}>{title}</h2>
      <p className="text-muted text-sm mb-3" style={{ margin: "0 0 12px" }}>{caption}</p>
      <TableWrap label={title}>
        <table>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Name</th>
              {extras.map((c) => <th key={c.header} scope="col">{c.header}</th>)}
              <th scope="col">Share</th>
              <th scope="col">vs prior week</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.rows.map((r) => (
              <tr key={r.key}>
                <td className="mono">{r.rank}</td>
                <td>
                  <span>{r.label}</span>
                  {r.label !== r.key && <span className="mono text-muted text-xs" style={{ marginLeft: 6 }}>{r.key}</span>}
                </td>
                {extras.map((c) => <td key={c.header} className="text-sm">{c.cell(r)}</td>)}
                <td><ShareCell pct={r.share_pct} /></td>
                <td className="mono">{formatChange(r.change_pp)}</td>
              </tr>
            ))}
            {(breakdown.other_share_pct > 0 || breakdown.rows.length === 0) && (
              <tr>
                <td className="mono">—</td>
                <td className="text-muted">Other (below the privacy floor)</td>
                {extras.map((c) => <td key={c.header} />)}
                <td><ShareCell pct={breakdown.other_share_pct} /></td>
                <td className="mono">—</td>
              </tr>
            )}
          </tbody>
        </table>
      </TableWrap>
    </div>
  );
}

function PublishedIndex({ doc }: { doc: AgenticCommerceIndex }) {
  const categoryLabel = new Map((doc.categories?.rows ?? []).map((r) => [r.key, r.label]));
  return (
    <>
      {doc.tools && (
        <BreakdownTable
          title="Tools"
          caption="Each MCP tool's share of the week's calls."
          breakdown={doc.tools}
          extraColumns={[
            {
              header: "Category",
              cell: (r) => {
                const key = (r as { category?: string }).category ?? "";
                return categoryLabel.get(key) ?? key.replace(/_/g, " ");
              },
            },
            { header: "Pricing", cell: (r) => PRICING_LABEL[(r as { pricing?: string }).pricing ?? ""] ?? "" },
          ]}
        />
      )}
      {doc.categories && (
        <BreakdownTable title="Categories" caption="Share of the week's calls by tool category." breakdown={doc.categories} />
      )}
      {doc.pricing && (
        <BreakdownTable
          title="Metered and free tools"
          caption="Share of the week's calls to pay-per-call tools versus free or plan-included ones, as the catalog lists them. A call to a metered tool counts as metered even when that call was not charged."
          breakdown={doc.pricing}
        />
      )}
      {doc.agent_modes ? (
        <BreakdownTable
          title="Agent modes"
          caption="Share of calls made in each X-Agent-Mode, among calls recorded with a mode."
          breakdown={doc.agent_modes}
        />
      ) : (
        <Callout tone="info" title="Agent modes">Not enough calls carried mode information this week to publish this breakdown.</Callout>
      )}
      {doc.budget_headers ? (
        <BreakdownTable
          title="Budget headers"
          caption="Share of calls that sent an X-Agent-Budget header, among calls recorded with that information."
          breakdown={doc.budget_headers}
        />
      ) : (
        <Callout tone="info" title="Budget headers">Not enough calls carried budget information this week to publish this breakdown.</Callout>
      )}
    </>
  );
}

export function AgenticCommerceIndexPage() {
  const [doc, setDoc] = useState<AgenticCommerceIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AsyncError | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getAgenticCommerceIndex()
      .then(setDoc)
      .catch((err) => setError({ details: apiErrorDetails(err) ?? (err instanceof Error ? err.message : null) }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <SectionHeader
        title="Agentic commerce index"
        sub="How agents use Iliad's MCP tools, week by week: shares of calls, never counts."
        level="h1"
      />

      <div className="card mb-4">
        <p style={{ margin: 0 }}>
          Iliad is an MCP server that agents call to analyze code, prepare for agentic purchasing and run agent
          infrastructure. Every week this index reports which of its tools agents called, as each tool's share of
          the week's calls, its rank, and how that share moved from the week before. It is built from Iliad's own
          call records and publishes no counts, no caller information and nothing that identifies anyone.
        </p>
        <p className="text-sm mt-3" style={{ marginBottom: 0 }}>
          Machine-readable: <a href={JSON_URL}><span className="mono">GET {AGENTIC_COMMERCE_INDEX_PATH}</span></a>
          {" "}(JSON, no auth). Weeks run Monday to Monday, UTC.
        </p>
      </div>

      {loading && (
        <div className="card mb-4" role="status" aria-live="polite">
          <Skeleton lines={8} />
        </div>
      )}

      {/* Also what the build-time prerender captures (no API is reachable
          there), so it is worded as a pointer to the JSON, not as a fault. */}
      {!loading && (error || doc === null) && (
        <div className="card mb-4">
          <Callout tone="info" title="This week's figures are not shown here right now" details={error?.details ?? null}>
            The same index is always published as JSON at <a href={JSON_URL}><span className="mono">{AGENTIC_COMMERCE_INDEX_PATH}</span></a>.{" "}
            <button type="button" className="btn" onClick={load}>Retry</button>
          </Callout>
        </div>
      )}

      {!loading && doc && (
        <>
          {doc.status !== "pending" && (
            <div className="flex gap-2 mb-3" style={{ alignItems: "center", flexWrap: "wrap" }}>
              <Pill tone="outline">{formatWeek(doc.period_start, doc.period_end)}</Pill>
              {doc.generated_at && <span className="text-muted text-xs">Published {formatDay(doc.generated_at)}</span>}
            </div>
          )}
          {doc.status === "published" ? (
            <PublishedIndex doc={doc} />
          ) : (
            <div className="card mb-4">
              <Callout tone="info" title={doc.status === "pending" ? "Not published yet" : "Not enough calls this period"}>
                {doc.message}
              </Callout>
            </div>
          )}
        </>
      )}

      <div className="card">
        <h2 className="mb-2" style={{ fontSize: "1rem", fontWeight: 600 }}>Method</h2>
        <p className="text-sm" style={{ margin: 0 }}>
          {doc?.method ??
            "Shares are computed from Iliad's own record of MCP tool calls for each closed week. Rows backed by too few calls are folded into other, and a week with too few calls says so instead of publishing numbers. The full method is published with the JSON."}
        </p>
      </div>
    </div>
  );
}
