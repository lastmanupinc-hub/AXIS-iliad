import { useMemo, useState } from "react";
import { formatCompact, niceCeil } from "./format.ts";

// ─── BarChart (WO-F4) ───────────────────────────────────────────────────────
// Hand-rolled single-series SVG column chart, no deps. Dataviz conventions:
// columns ≤24px thick with a 4px rounded data-end and a square baseline, a 2px
// surface gap between adjacent bars, hairline solid gridlines at clean-number
// ticks, no legend for a single series, and text always in text tokens (the
// mark alone wears the series color). Every band is a hover/focus hit target
// larger than the mark, with a value-first tooltip; values stay reachable
// without hovering via the y-axis ticks and each band's aria-label, so the
// tooltip enhances but never gates.

export interface BarChartDatum {
  label: string;
  value: number;
}

export interface BarChartProps {
  /** Non-negative values in x order (e.g. runs per day). */
  data: BarChartDatum[];
  width?: number;
  height?: number;
  /** Series color — the marks only, never text. */
  color?: string;
  /** What is plotted, announced on the chart group (e.g. "Runs per day, 30 days"). */
  label?: string;
  formatValue?: (v: number) => string;
}

const M = { top: 8, right: 8, bottom: 20, left: 34 };
const MIN_BAND = 8; // bar 6 + 2px surface gap; below this the chart widens and scrolls

export function BarChart({
  data,
  width = 560,
  height = 180,
  color = "var(--accent)",
  label = "Bar chart",
  formatValue = formatCompact,
}: BarChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const n = data.length;
  const svgWidth = Math.max(width, M.left + M.right + n * MIN_BAND);
  const plotW = svgWidth - M.left - M.right;
  const plotH = height - M.top - M.bottom;
  const baseline = M.top + plotH;

  const { yMax, ticks } = useMemo(() => {
    const rawMax = Math.max(0, ...data.map((d) => d.value));
    const max = niceCeil(rawMax);
    return { yMax: max, ticks: [0, max / 2, max] };
  }, [data]);

  if (n === 0) {
    return (
      <div className="empty-state empty-state-compact">
        <span className="text-muted text-sm">No data to chart yet.</span>
      </div>
    );
  }

  const band = plotW / n;
  const barW = Math.min(24, Math.max(2, band - 2)); // ≤24px thick, 2px surface gap
  const xFor = (i: number) => M.left + i * band + (band - barW) / 2;
  const yFor = (v: number) => baseline - (Math.max(0, v) / yMax) * plotH;

  /** Column with a rounded data-end (top) and a square baseline. */
  const barPath = (i: number, v: number): string | null => {
    const h = baseline - yFor(v);
    if (h <= 0) return null;
    const x = xFor(i);
    const y = yFor(v);
    const r = Math.min(4, barW / 2, h);
    return [
      `M${x},${baseline}`,
      `L${x},${y + r}`,
      `Q${x},${y} ${x + r},${y}`,
      `L${x + barW - r},${y}`,
      `Q${x + barW},${y} ${x + barW},${y + r}`,
      `L${x + barW},${baseline}`,
      "Z",
    ].join(" ");
  };

  // Skip x labels that would collide (band too narrow for ~34px of text).
  const labelStep = Math.max(1, Math.ceil(34 / band));

  const hovered = hoverIdx !== null ? data[hoverIdx] : null;
  const tipX = hoverIdx !== null ? Math.max(40, Math.min(svgWidth - 40, xFor(hoverIdx) + barW / 2)) : 0;
  const tipY = hovered ? yFor(hovered.value) : 0;

  return (
    <div className="chart-scroll">
      <div className="chart-frame" style={{ width: svgWidth }}>
        <svg width={svgWidth} height={height} role="group" aria-label={label} className="chart-svg">
          {/* Gridlines: hairline, solid, recessive; ticks at clean numbers. */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={M.left}
                x2={svgWidth - M.right}
                y1={yFor(t)}
                y2={yFor(t)}
                stroke={t === 0 ? "var(--border-strong)" : "var(--border)"}
                strokeWidth={1}
                shapeRendering="crispEdges"
              />
              <text
                x={M.left - 6}
                y={yFor(t) + 3}
                textAnchor="end"
                fontSize={10}
                fontFamily="var(--mono)"
                fill="var(--text-muted)"
              >
                {formatValue(t)}
              </text>
            </g>
          ))}

          {/* Marks — the only elements wearing the series color. */}
          {data.map((d, i) => {
            const path = barPath(i, d.value);
            if (!path) return null;
            return (
              <path
                key={i}
                d={path}
                fill={color}
                fillOpacity={hoverIdx === i ? 1 : 0.9}
              />
            );
          })}

          {/* X labels (skip-pattern so they never collide). */}
          {data.map((d, i) =>
            i % labelStep === 0 ? (
              <text
                key={i}
                x={xFor(i) + barW / 2}
                y={height - 6}
                textAnchor="middle"
                fontSize={10}
                fontFamily="var(--mono)"
                fill="var(--text-muted)"
              >
                {d.label}
              </text>
            ) : null,
          )}

          {/* Hit targets: the full band, bigger than the mark; hover + focus. */}
          {data.map((d, i) => (
            <rect
              key={i}
              x={M.left + i * band}
              y={M.top}
              width={band}
              height={plotH}
              fill="transparent"
              tabIndex={0}
              role="img"
              aria-label={`${d.label}: ${formatValue(d.value)}`}
              className="chart-hit"
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              onFocus={() => setHoverIdx(i)}
              onBlur={() => setHoverIdx(null)}
            />
          ))}
        </svg>

        {hovered && (
          <div className="chart-tip" style={{ left: tipX, top: Math.max(4, tipY - 6) }} aria-hidden>
            <span className="chart-tip-value">{formatValue(hovered.value)}</span>{" "}
            <span className="chart-tip-label">{hovered.label}</span>
          </div>
        )}
      </div>
    </div>
  );
}
