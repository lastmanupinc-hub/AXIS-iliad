import type { ReactNode } from "react";
import {
  BarChart,
  Callout,
  CodeBlock,
  EmptyState,
  Pill,
  SectionHeader,
  Skeleton,
  Sparkline,
  StatTile,
  TableWrap,
} from "../components/primitives/index.ts";
import type { PageId } from "../routes.tsx";

// ─── Kitchen sink (WO-F4, dev aid) ──────────────────────────────────────────
// Storybook-style gallery of the shared primitives on the hidden
// #__kitchen-sink route. Deliberately absent from every nav surface (sidebar,
// rail, drawer, palette, 404 search) — reach it by typing the hash. All data
// below is static sample data for rendering the components, labeled as such.

interface Props {
  onNavigate: (page: PageId) => void;
}

// 14 days of sample values (labeled sample — this page demos components, not live data).
const SAMPLE_TREND = [3, 5, 4, 8, 7, 12, 9, 14, 11, 16, 13, 18, 17, 21];
const SAMPLE_DAYS = SAMPLE_TREND.map((_, i) => `Jul ${i + 1}`);
const SAMPLE_BARS = SAMPLE_TREND.map((v, i) => ({ label: `${i + 1}`, value: v }));

const SAMPLE_CODE = `{
  "mcpServers": {
    "axis-iliad": {
      "url": "https://api.example.test/mcp",
      "headers": { "Authorization": "Bearer $AXIS_API_KEY" }
    }
  }
}`;

function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="sink-section">
      <SectionHeader title={title} sub={sub} />
      {children}
    </section>
  );
}

export function KitchenSinkPage({ onNavigate }: Props) {
  return (
    <div className="sink-page">
      <SectionHeader
        align="center"
        title="Kitchen Sink"
        sub="Dev-aid gallery of the WO-F4 shared primitives. Hidden route — not linked from any nav. Everything below renders static sample data."
      />

      <Section title="StatTile" sub="label · value · delta · trend slot (Sparkline)">
        <div className="grid grid-4">
          <StatTile label="Runs this month" value={1284} />
          <StatTile label="Artifacts" value="4.2K" delta={{ text: "+12% vs last month", sentiment: "good" }} />
          <StatTile label="Failed runs" value={7} delta={{ text: "+3 vs last week", sentiment: "bad" }} hint="sample data" />
          <StatTile
            label="Daily runs"
            value={21}
            delta={{ text: "no change", sentiment: "neutral" }}
            trend={<Sparkline data={SAMPLE_TREND} pointLabels={SAMPLE_DAYS} label="Daily runs, 14-day sample" width={120} height={28} />}
          />
        </div>
      </Section>

      <Section title="Sparkline" sub="2px line · 10% area wash · surface-ringed end dot · hover/arrow-key readout">
        <div className="flex gap-3 flex-wrap">
          <Sparkline data={SAMPLE_TREND} pointLabels={SAMPLE_DAYS} label="14-day sample trend" width={220} height={48} />
          <Sparkline data={[5]} label="Single-point sample" width={80} height={32} />
          <Sparkline data={[]} label="Empty sample" />
        </div>
      </Section>

      <Section title="BarChart" sub="columns ≤24px, rounded data-end, 2px surface gaps, clean-number hairline ticks, hover/focus tooltip">
        <BarChart data={SAMPLE_BARS} label="Runs per day, 14-day sample" width={640} height={180} />
      </Section>

      <Section title="Callout" sub="four tones; `details` holds raw/technical text behind a disclosure (the API-error pattern)">
        <div className="stack">
          <Callout tone="info" title="Heads up">Snapshots are retained and power re-runs and exports.</Callout>
          <Callout tone="success" title="Analysis complete">141 artifacts generated across 20 programs.</Callout>
          <Callout tone="warning" title="Quota low">3 runs left this window — resets in 2 hours.</Callout>
          <Callout
            tone="danger"
            title="The server hit an unexpected error — try again shortly."
            details={'<html><body><h1>502 Bad Gateway</h1><p>upstream connect error</p></body></html>'}
          >
            This is how an ApiError renders: human copy headlines; the raw server body stays behind the disclosure.
          </Callout>
        </div>
      </Section>

      <Section title="CodeBlock" sub="mono, copy button, optional label / soft-wrap / max height">
        <CodeBlock label="claude_desktop_config.json (sample)" code={SAMPLE_CODE} />
        <CodeBlock wrap code={`claude mcp add axis-iliad --transport http --url https://api.example.test/mcp --header "Authorization: Bearer $AXIS_API_KEY"`} label="One-liner (soft-wrapped)" />
      </Section>

      <Section title="Pill" sub="muted · accent · outline · mono">
        <div className="flex gap-2 flex-wrap">
          <Pill>deploy.md</Pill>
          <Pill tone="accent">visa-ready</Pill>
          <Pill tone="outline">typescript</Pill>
          <Pill tone="accent" mono>skills</Pill>
          <Pill mono>141 artifacts</Pill>
        </div>
      </Section>

      <Section title="TableWrap" sub="focusable overflow-x scroll region for wide tables">
        <TableWrap label="Sample program table">
          <table>
            <thead>
              <tr><th>Program</th><th>Tier</th><th>Outputs</th><th>Last run</th><th>Status</th></tr>
            </thead>
            <tbody>
              <tr><td>skills</td><td>free</td><td>12</td><td>2026-07-04</td><td><span className="badge badge-green">ok</span></td></tr>
              <tr><td>theme</td><td>paid</td><td>9</td><td>2026-07-02</td><td><span className="badge badge-green">ok</span></td></tr>
              <tr><td>deploy</td><td>paid</td><td>11</td><td>2026-06-28</td><td><span className="badge badge-yellow">stale</span></td></tr>
            </tbody>
          </table>
        </TableWrap>
      </Section>

      <Section title="Skeleton" sub="theme.css shimmer keyframes; block or stacked text lines">
        <div className="grid grid-2">
          <div className="card">
            <Skeleton height={120} />
          </div>
          <div className="card">
            <Skeleton lines={4} />
          </div>
        </div>
      </Section>

      <Section title="EmptyState" sub="icon + title + message + CTA">
        <div className="card">
          <EmptyState
            icon="scan"
            title="No projects yet"
            message="Analyze your first repository to see it here."
            cta={{ label: "Analyze a repo", onClick: () => onNavigate("upload") }}
          />
        </div>
      </Section>

      <Section title="Utility classes" sub=".text-muted · .text-sm/.text-xs · .text-center · .mb-*/.mt-* · .stack · .gap-*">
        <div className="card">
          <p className="text-muted text-sm mb-2">.text-muted .text-sm .mb-2</p>
          <p className="text-xs mb-4">.text-xs .mb-4</p>
          <div className="stack gap-2">
            <Pill tone="outline">.stack</Pill>
            <Pill tone="outline">.gap-2</Pill>
          </div>
        </div>
      </Section>

      <Callout tone="info" title="PageFooter">
        The footer below this page (Terms · Status · version · Support · Help · Docs) is the PageFooter
        primitive — the shell renders it on every page above the StatusBar.
      </Callout>
    </div>
  );
}
