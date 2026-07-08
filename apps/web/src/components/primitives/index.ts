// ─── Shared UI primitives (WO-F4) ───────────────────────────────────────────
// One import site for the design-system primitives. Live gallery: the hidden
// #__kitchen-sink route (dev aid). Styling lives in index.css under the
// "WO-F4 primitives + utilities" section, on the theme.css token contract.

export { StatTile, type StatTileProps, type StatDelta } from "./StatTile.tsx";
export { SectionHeader, type SectionHeaderProps } from "./SectionHeader.tsx";
export { CodeBlock, type CodeBlockProps } from "./CodeBlock.tsx";
export { MarkdownLite, type MarkdownLiteProps } from "./Markdown.tsx";
export { TableWrap, type TableWrapProps } from "./TableWrap.tsx";
export { Callout, type CalloutProps, type CalloutTone } from "./Callout.tsx";
export { Pill, type PillProps, type PillTone } from "./Pill.tsx";
export { Skeleton, type SkeletonProps } from "./Skeleton.tsx";
export { EmptyState, type EmptyStateProps } from "./EmptyState.tsx";
export { Sparkline, type SparklineProps } from "./Sparkline.tsx";
export { BarChart, type BarChartProps, type BarChartDatum } from "./BarChart.tsx";
export { PageFooter, type PageFooterProps } from "./PageFooter.tsx";
export { formatCompact, niceCeil, formatUsdCents } from "./format.ts";
