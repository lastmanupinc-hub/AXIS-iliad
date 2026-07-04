# UI Audit — axis-iliad

Generated: 1970-01-01T00:00:00.000Z

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 16 top-level directories. It defines 242 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## UI Stack Summary

| Aspect | Detected |
|--------|----------|
| UI Frameworks | React |
| Styling | CSS/SCSS/SASS/LESS |
| TypeScript | Yes |
| UI Libraries | None detected |
| Total Routes | 163 |
| Entry Points | 0 |

## Accessibility Checklist

| Requirement | Status | Notes |
|-------------|--------|-------|
| Semantic HTML | ⚠️ Verify | Check for div-soup vs proper heading hierarchy |
| ARIA labels | ⚠️ Verify | Interactive elements need aria-label/aria-describedby |
| Keyboard navigation | ⚠️ Verify | Tab order, focus management, skip links |
| Color contrast | ⚠️ Verify | 4.5:1 ratio for text, 3:1 for large text |
| Screen reader | ⚠️ Verify | Test with VoiceOver/NVDA |
| Focus indicators | ⚠️ Verify | Visible focus rings on all interactive elements |
| Alt text | ⚠️ Verify | All images need descriptive alt attributes |

## Performance Audit

| Metric | Target | How to Measure |
|--------|--------|----------------|
| LCP (Largest Contentful Paint) | < 2.5s | Lighthouse, Web Vitals |
| FID (First Input Delay) | < 100ms | Lighthouse, Web Vitals |
| CLS (Cumulative Layout Shift) | < 0.1 | Lighthouse, Web Vitals |
| Bundle size | < 250KB gzip | Build output |
| Image optimization | WebP/AVIF | Check image formats |
| Font loading | font-display: swap | Verify CSS |

## Component Coverage

| Route | Has Component | Interactive | Needs Testing |
|-------|--------------|-------------|---------------|
| /v1/health | ⚠️ Verify | ⚠️ Verify | Yes |
| /v1/accounts | ⚠️ Verify | ⚠️ Verify | Yes |
| /v1/snapshots | ⚠️ Verify | ⚠️ Verify | Yes |
| /v1/admin/stats | ⚠️ Verify | ⚠️ Verify | Yes |
| /v1/admin/accounts | ⚠️ Verify | ⚠️ Verify | Yes |
| /v1/admin/activity | ⚠️ Verify | ⚠️ Verify | Yes |
| /v1/admin/mcp-usage | ⚠️ Verify | ⚠️ Verify | Yes |
| /v1/admin/revenue | ⚠️ Verify | ⚠️ Verify | Yes |
| /llms.txt | ⚠️ Verify | ⚠️ Verify | Yes |
| /.well-known/skills/index.json | ⚠️ Verify | ⚠️ Verify | Yes |

## Audit Score

**Overall UI Readiness: 85/100**

| Factor | Score |
|--------|-------|
| Base | +50 |
| Framework detection | +15 |
| Styling system | 0 |
| TypeScript | +10 |
| UI component library | 0 |
| Route coverage | +10 |

## Detected UI Issues (deterministic)

> Static scan of component source — grep + a fixed rule table, **no AI**. `XSS` = injection risk; `A11Y` = accessibility gap; `TYPE` = type-net hole.

| Class | Count |
|-------|-------|
| A11Y | 4 |

| File | Line | Category | Class | Note |
|------|------|----------|-------|------|
| `apps/web/src/components/SignUpModal.tsx` | 11 | click-nonbutton | A11Y | onClick on a <div>/<span>/<li> — use <button> or add role + keyboard handlers |
| `apps/web/src/components/SignUpModal.tsx` | 12 | click-nonbutton | A11Y | onClick on a <div>/<span>/<li> — use <button> or add role + keyboard handlers |
| `apps/web/src/components/UpsellModal.tsx` | 15 | click-nonbutton | A11Y | onClick on a <div>/<span>/<li> — use <button> or add role + keyboard handlers |
| `apps/web/src/components/UpsellModal.tsx` | 16 | click-nonbutton | A11Y | onClick on a <div>/<span>/<li> — use <button> or add role + keyboard handlers |

## Detected UI Components

| Component | Exports | Lines |
|-----------|---------|-------|
| `apps/web/src/App.tsx` | export function App() { ... } | 579 |
| `apps/web/src/components/AuthButtons.tsx` | export function AuthButtons({ ... } | 101 |
| `apps/web/src/components/AxisIcons.tsx` | export function Icon({ ... } | 111 |
| `apps/web/src/components/CommandPalette.tsx` | export interface PaletteAction { ... }, export function CommandPalette({ ... } | 214 |
| `apps/web/src/components/FilesTab.tsx` | export function FilesTab({ ... } | 126 |
| `apps/web/src/components/GeneratedTab.tsx` | export function GeneratedTab({ ... } | 118 |
| `apps/web/src/components/GraphTab.tsx` | export function GraphTab({ ... } | 128 |
| `apps/web/src/components/Icon.tsx` | export function Icon({ ... } | 53 |
| `apps/web/src/components/OverviewTab.tsx` | export function OverviewTab({ ... } | 223 |
| `apps/web/src/components/ProgramLauncher.tsx` | export function ProgramLauncher({ ... } | 172 |
| `apps/web/src/components/SearchTab.tsx` | export function SearchTab({ ... } | 307 |
| `apps/web/src/components/SignUpModal.tsx` | export function SignUpModal({ ... } | 34 |
| `apps/web/src/components/StatusBar.tsx` | export function StatusBar({ ... } | 77 |
| `apps/web/src/components/Toast.tsx` | export function useToast() { ... }, export function ToastProvider({ ... } | 115 |
| `apps/web/src/components/ToolPage.tsx` | export interface ToolPricing { ... }, export interface ToolPageProps { ... }, export function ToolPage({ ... } | 189 |

## Detected Style Files

- `apps/web/src/index.css` (1349 lines)


---

## ⟳ Continue the loop

- **You are here:** `ui-audit.md` — agent step 55 of 70.
- **Next:** `token-budget-plan.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
