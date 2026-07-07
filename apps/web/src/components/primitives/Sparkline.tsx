import { useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { formatCompact } from "./format.ts";

// ─── Sparkline (WO-F4) ──────────────────────────────────────────────────────
// Hand-rolled SVG, no deps. Dataviz conventions: 2px line with round join/cap,
// area wash at ~10% opacity, ≥8px end marker with a 2px surface ring, single
// series so no legend (the surrounding label/title names it), all text in text
// tokens — the mark alone carries the series color. Hover/keyboard reveal a
// per-point readout; the aria-label carries the summary so the tooltip
// enhances but never gates.

export interface SparklineProps {
  /** Series values in x order (non-negative expected; e.g. runs per day). */
  data: number[];
  /** Optional per-point names for the readout (e.g. dates), same length as data. */
  pointLabels?: string[];
  width?: number;
  height?: number;
  /** Series color — the mark only, never text. */
  color?: string;
  /** Surface behind the chart (end-dot ring color). */
  surface?: string;
  /** ~10%-opacity wash under the line. */
  area?: boolean;
  /** What is plotted, for the aria summary (e.g. "Runs, last 14 days"). */
  label?: string;
  formatValue?: (v: number) => string;
}

const PAD = 6; // room for the 2px line + r4 end dot + 2px ring

export function Sparkline({
  data,
  pointLabels,
  width = 140,
  height = 36,
  color = "var(--accent)",
  surface = "var(--bg-card)",
  area = true,
  label = "Trend",
  formatValue = formatCompact,
}: SparklineProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const geom = useMemo(() => {
    const n = data.length;
    if (n === 0) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = max - min;
    const x = (i: number) => (n === 1 ? width / 2 : PAD + (i * (width - 2 * PAD)) / (n - 1));
    const y = (v: number) =>
      span === 0 ? height / 2 : PAD + (1 - (v - min) / span) * (height - 2 * PAD);
    const points = data.map((v, i) => ({ x: x(i), y: y(v) }));
    return { points, min, max };
  }, [data, width, height]);

  if (!geom) {
    return <span className="text-muted text-xs mono">no data</span>;
  }

  const { points, min, max } = geom;
  const n = data.length;
  const last = data[n - 1];
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${points[n - 1].x.toFixed(1)},${height - PAD} L${points[0].x.toFixed(1)},${height - PAD} Z`;

  const summary = `${label}: ${n} point${n === 1 ? "" : "s"}, latest ${formatValue(last)}, min ${formatValue(min)}, max ${formatValue(max)}`;

  const nearestIndex = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const ratio = n === 1 ? 0 : (px - PAD) / (width - 2 * PAD);
    return Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1))));
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const current = activeIdx ?? n - 1;
    let next: number | null = null;
    if (e.key === "ArrowLeft") next = Math.max(0, current - 1);
    else if (e.key === "ArrowRight") next = Math.min(n - 1, current + 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else if (e.key === "Escape") { setActiveIdx(null); return; }
    if (next !== null) {
      e.preventDefault();
      setActiveIdx(next);
    }
  };

  const active = activeIdx !== null ? points[activeIdx] : null;
  const tipX = active ? Math.max(24, Math.min(width - 24, active.x)) : 0;

  return (
    <span className="chart-frame sparkline-frame">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={summary}
        tabIndex={0}
        className="sparkline-svg"
        onMouseMove={(e) => setActiveIdx(nearestIndex(e))}
        onMouseLeave={() => setActiveIdx(null)}
        onFocus={() => setActiveIdx(n - 1)}
        onBlur={() => setActiveIdx(null)}
        onKeyDown={onKeyDown}
      >
        {area && n > 1 && <path d={areaPath} fill={color} fillOpacity={0.1} stroke="none" />}
        {n > 1 && (
          <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        )}
        {/* End marker: r4 dot with a 2px surface ring so it reads over the line. */}
        <circle
          cx={(active ?? points[n - 1]).x}
          cy={(active ?? points[n - 1]).y}
          r={4}
          fill={color}
          stroke={surface}
          strokeWidth={2}
        />
      </svg>
      {activeIdx !== null && (
        <span className="chart-tip" style={{ left: tipX, top: -2 }} aria-hidden>
          <span className="chart-tip-value">{formatValue(data[activeIdx])}</span>
          {pointLabels?.[activeIdx] !== undefined && (
            <span className="chart-tip-label"> {pointLabels[activeIdx]}</span>
          )}
        </span>
      )}
    </span>
  );
}
