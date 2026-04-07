import type { CSSProperties, ReactNode } from "react";

/* ── Axis Icon System v2.1 — themed inline SVG icons ── */

const I: Record<string, ReactNode> = {
  /* ── Program Icons (1-17) ───────────────────────────── */
  search:        <><circle cx="6.5" cy="6.5" r="4" /><path d="m10 10 4 4" /><circle cx="6.5" cy="6.5" r="1.5" fill="currentColor" opacity=".2" /></>,
  skills:        <><rect x="3.5" y="3.5" width="9" height="7.5" rx="2" /><circle cx="6.5" cy="7" r=".75" fill="currentColor" /><circle cx="9.5" cy="7" r=".75" fill="currentColor" /><path d="M8 1v2.5M5 13h6" /></>,
  debug:         <><ellipse cx="8" cy="9" rx="3.5" ry="4" /><path d="M6.5 8.5h3M6.5 10.5h3M4.5 5 2.5 3M11.5 5l2-2M2 9h2.5M11.5 9H14" /></>,
  frontend:      <><rect x="2" y="2" width="12" height="12" rx="2" /><rect x="4" y="4" width="3.5" height="3.5" rx=".5" fill="currentColor" opacity=".3" /><rect x="9" y="4" width="3" height="1.5" rx=".5" fill="currentColor" opacity=".2" /><path d="M4 10h8" /></>,
  seo:           <><path d="M2 13l4-4 3 2 5-7" /><path d="M11 4h3v3" /></>,
  optimization:  <><path d="M9.5 1.5 4.5 8h4l-1 6.5 5-6.5h-4Z" /></>,
  theme:         <><circle cx="5.5" cy="5.5" r="3.5" /><circle cx="10.5" cy="5.5" r="3.5" /><circle cx="8" cy="10" r="3.5" /></>,
  brand:         <><path d="M2 5.5v5h2.5l5 3V2.5l-5 3H2Z" /><path d="M12 6a3.5 3.5 0 0 1 0 4" /><path d="M13.5 4a6 6 0 0 1 0 8" /></>,
  superpowers:   <><path d="M8 1.5l2 4.5h4.5L11 9.5l1.5 4.5-4.5-3-4.5 3L5 9.5 1.5 6H6Z" /></>,
  marketing:     <><path d="M3 14V8M6.5 14V4.5M10 14V9M13.5 14V2.5" strokeWidth="2" strokeLinecap="round" /></>,
  notebook:      <><rect x="3.5" y="1.5" width="10" height="13" rx="1.5" /><path d="M6.5 5h4M6.5 8h4M6.5 11h2M3.5 4.5H2M3.5 8H2M3.5 11.5H2" /></>,
  obsidian:      <><path d="M8 1.5l6 6.5-6 6.5-6-6.5Z" /><path d="M8 5l3 3-3 3.5-3-3.5Z" fill="currentColor" opacity=".15" /></>,
  mcp:           <><path d="M5 2v4M11 2v4" /><rect x="3" y="6" width="10" height="4" rx="1.5" /><path d="M8 10v3" /><circle cx="8" cy="14" r="1" fill="currentColor" /></>,
  artifacts:     <><path d="M6.5 2H10v4h4v3.5h-4V14H6.5v-4.5H2V6h4.5V2Z" /></>,
  remotion:      <><rect x="1.5" y="3" width="13" height="10" rx="1.5" /><path d="M1.5 6h13" /><path d="M6.5 8.5l4 2-4 2V8.5Z" fill="currentColor" /></>,
  canvas:        <><rect x="2" y="2" width="12" height="12" rx="1" /><path d="M3.5 11l3-3 2 1.5 4-4.5" /><circle cx="10.5" cy="5" r="1" fill="currentColor" /></>,
  algorithmic:   <><path d="M4 2c0 4 8 2 8 6.5S4 11 4 14.5" /><circle cx="4" cy="2" r="1.2" fill="currentColor" /><circle cx="4" cy="14.5" r="1.2" fill="currentColor" /></>,

  /* ── Tab & Navigation Icons (18-27) ─────────────────── */
  "docs-overview": <><path d="M2 2.5h5l1 1.5 1-1.5h5v11.5H9l-1-1.5-1 1.5H2V2.5Z" /><path d="M8 4v10.5" /></>,
  toolbox:       <><rect x="2" y="6" width="12" height="8" rx="1.5" /><path d="M5.5 6V4a2.5 2.5 0 0 1 5 0v2M2 9.5h12" /></>,
  "api-link":    <><path d="M6.5 9.5a2.5 2.5 0 0 1 0-3.5l1-1a2.5 2.5 0 0 1 3.5 3.5" /><path d="M9.5 6.5a2.5 2.5 0 0 1 0 3.5l-1 1A2.5 2.5 0 0 1 5 7.5" /></>,
  "file-doc":    <><path d="M4 1.5h5l3.5 3.5v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1Z" /><path d="M9 1.5V5h3.5M6 8.5h4M6 11h3" /></>,
  terminal:      <><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" /><path d="M4.5 7l2.5 2-2.5 2M9 11h3" /></>,
  rocket:        <><path d="M8 1.5c-2 2-3 5-3 8h2l1 3 1-3h2c0-3-1-6-3-8Z" /><path d="M5 11.5l-2 3M11 11.5l2 3" /></>,
  upload:        <><path d="M3 10v3.5h10V10" /><path d="M8 2.5v8M5 5.5L8 2.5l3 3" /></>,
  dashboard:     <><rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" /><rect x="9" y="1.5" width="5.5" height="5.5" rx="1" /><rect x="1.5" y="9" width="5.5" height="5.5" rx="1" /><rect x="9" y="9" width="5.5" height="5.5" rx="1" /></>,
  "credit-card": <><rect x="1.5" y="3" width="13" height="10" rx="1.5" /><path d="M1.5 7h13M4 10.5h3" /></>,
  wrench:        <><path d="M4 12.5l5-5" strokeWidth="2.5" strokeLinecap="round" /><circle cx="11.5" cy="4.5" r="3" /><path d="M13.5 2.5l-2.5 2.5" /></>,

  /* ── QA Category Icons (28-35) ──────────────────────── */
  clipboard:     <><path d="M5.5 2h5v2h-5Z" fill="currentColor" opacity=".2" /><rect x="3" y="3" width="10" height="11.5" rx="1" /><path d="M6 7h4M6 9.5h4M6 12h2" /></>,
  lightbulb:     <><path d="M6 12h4M6.5 13.5h3" /><path d="M5.5 10.5c-1.5-1.5-2-3.5-1-5.5a4 4 0 0 1 7 0c1 2 .5 4-1 5.5Z" /></>,
  gear:          <><circle cx="8" cy="8" r="2.5" /><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" /></>,
  "plug-connect":<><path d="M5 2v4M11 2v4" /><rect x="3" y="6" width="10" height="3.5" rx="1" /><path d="M8 9.5v3.5" /><circle cx="8" cy="14" r="1" /></>,
  "shield-lock": <><path d="M8 1.5L2.5 4v4c0 3.5 2.5 5.5 5.5 7 3-1.5 5.5-3.5 5.5-7V4Z" /><rect x="6.5" y="8" width="3" height="2.5" rx=".5" /><path d="M8 7V6a1.5 1.5 0 0 1 3 0" /></>,

  /* ── Pipeline Stage Icons (36-41) ───────────────────── */
  inbox:         <><path d="M2.5 8.5h3l1.5 2h2l1.5-2h3" /><rect x="2.5" y="2" width="11" height="12" rx="1.5" /></>,
  zoom:          <><circle cx="6.5" cy="6.5" r="4" /><path d="m10 10 4 4M4.5 6.5h4M6.5 4.5v4" /></>,
  flask:         <><path d="M5.5 1.5h5M6.5 1.5v4.5L3 12.5a1 1 0 0 0 1 1.5h8a1 1 0 0 0 1-1.5L9.5 6V1.5" /><path d="M4.5 10h7" strokeDasharray="1.5 1.5" /></>,
  brain:         <><path d="M8 2.5c-2 0-4 1.5-4 3.5s1 2.5 1.5 3C4.5 10 4 11 4 12c0 1.5 2 2.5 4 2.5s4-1 4-2.5c0-1-.5-2-1.5-3 .5-.5 1.5-1 1.5-3s-2-3.5-4-3.5Z" /><path d="M8 2.5v12" /></>,
  "package":     <><path d="M8 1.5L14 4.5v7L8 14.5 2 11.5v-7Z" /><path d="M2 4.5 8 8l6-3.5M8 8v6.5" /></>,

  /* ── Dashboard Tab Icons ────────────────────────────── */
  folder:        <><path d="M2 5V13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6.5a1 1 0 0 0-1-1H8.5L7 4H3a1 1 0 0 0-1 1Z" /></>,

  /* ── Step Indicators (48-50) ────────────────────────── */
  "step-1":      <><circle cx="8" cy="8" r="7" /><path d="M7 5.5L9 4.5V11" strokeWidth="1.5" /><path d="M6 11.5h5" strokeWidth="1" /></>,
  "step-2":      <><circle cx="8" cy="8" r="7" /><path d="M5.5 6a2.5 2.5 0 0 1 5 .5c0 1.5-2 2.5-5 5h5.5" strokeWidth="1.2" /></>,
  "step-3":      <><circle cx="8" cy="8" r="7" /><path d="M5.5 5h4.5L7.5 8c1.5 0 3 .5 3 2s-1.5 2-3 2a3 3 0 0 1-2-1" strokeWidth="1.2" /></>,

  /* ── Status / UI Icons (51-61) ──────────────────────── */
  user:          <><circle cx="8" cy="5.5" r="3" /><path d="M2.5 14.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" /></>,
  download:      <><path d="M3 10v3.5h10V10M8 2.5v8M5 8.5l3 3 3-3" /></>,
  key:           <><circle cx="5.5" cy="8" r="3" /><path d="M8.5 8h5.5M12 6v4M10 7v2" /></>,
  warning:       <><path d="M8 2L1.5 13.5h13Z" /><path d="M8 6.5v3" /><circle cx="8" cy="11.5" r=".6" fill="currentColor" /></>,
  lock:          <><rect x="3.5" y="7.5" width="9" height="6.5" rx="1.5" /><path d="M5.5 7.5V5.5a2.5 2.5 0 0 1 5 0v2" /><circle cx="8" cy="11" r=".75" fill="currentColor" /></>,
  question:      <><circle cx="8" cy="8" r="6.5" /><path d="M6 6.5a2 2 0 0 1 4 0c0 1-1 1.5-2 2.5" /><circle cx="8" cy="12" r=".6" fill="currentColor" /></>,
  email:         <><rect x="1.5" y="3.5" width="13" height="9" rx="1" /><path d="M1.5 3.5 8 8.5l6.5-5" /></>,
  "chevron-up":  <><path d="m3 10.5 5-5 5 5" strokeWidth="2" /></>,
  "chevron-down":<><path d="m3 5.5 5 5 5-5" strokeWidth="2" /></>,
  check:         <><path d="m2.5 8.5 4 4 7-9" strokeWidth="2" /></>,
  "x-mark":      <><path d="m3.5 3.5 9 9M12.5 3.5l-9 9" strokeWidth="2" /></>,

  /* ── Extras ─────────────────────────────────────────── */
  bolt:          <><path d="M9.5 1.5 4.5 8h4l-1 6.5 5-6.5h-4Z" /></>,
  analyze:       <><circle cx="8" cy="8" r="5.5" /><path d="M8 4v4h4" /><circle cx="8" cy="8" r="1.5" fill="currentColor" opacity=".2" /></>,
};

interface IconProps {
  name: string;
  size?: string | number;
  color?: string;
  style?: CSSProperties;
  className?: string;
}

export function Icon({ name, size, color, style, className }: IconProps) {
  const content = I[name];
  if (!content) return null;
  return (
    <svg
      viewBox="0 0 16 16"
      width={size ?? "1em"}
      height={size ?? "1em"}
      fill="none"
      stroke={color ?? "currentColor"}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{
        display: "inline-block",
        verticalAlign: "-0.125em",
        flexShrink: 0,
        ...style,
      }}
      className={className}
    >
      {content}
    </svg>
  );
}
