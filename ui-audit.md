# UI Audit — axis-toolbox

Generated: 2026-04-14T03:15:00.792Z

## Project Overview

axis-toolbox is a monorepo built with TypeScript using React. It contains 500 files across 20 top-level directories. It defines 152 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## UI Stack Summary

| Aspect | Detected |
|--------|----------|
| UI Frameworks | None detected |
| Styling | CSS/SCSS |
| TypeScript | Yes |
| UI Libraries | uuid |
| Total Routes | 429 |
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
| /llms.txt | ⚠️ Verify | ⚠️ Verify | Yes |
| /.well-known/skills/index.json | ⚠️ Verify | ⚠️ Verify | Yes |
| /v1/docs.md | ⚠️ Verify | ⚠️ Verify | Yes |
| /.well-known/axis.json | ⚠️ Verify | ⚠️ Verify | Yes |

## Audit Score

**Overall UI Readiness: 75/100**

| Factor | Score |
|--------|-------|
| Framework detection | 0 |
| Styling system | 0 |
| TypeScript | +10 |
| UI component library | +5 |
| Route coverage | +10 |

## Detected UI Components

| Component | Exports | Lines |
|-----------|---------|-------|
| `apps/web/src/App.tsx` | export function App() { ... } | 326 |
| `apps/web/src/components/AxisIcons.tsx` | export function Icon({ ... } | 111 |
| `apps/web/src/components/CommandPalette.tsx` | export interface PaletteAction { ... }, export function CommandPalette({ ... } | 214 |
| `apps/web/src/components/FilesTab.tsx` | export function FilesTab({ ... } | 126 |
| `apps/web/src/components/GeneratedTab.tsx` | export function GeneratedTab({ ... } | 118 |
| `apps/web/src/components/GraphTab.tsx` | export function GraphTab({ ... } | 128 |
| `apps/web/src/components/OverviewTab.tsx` | export function OverviewTab({ ... } | 223 |
| `apps/web/src/components/ProgramLauncher.tsx` | export function ProgramLauncher({ ... } | 165 |
| `apps/web/src/components/SearchTab.tsx` | export function SearchTab({ ... } | 307 |
| `apps/web/src/components/SignUpModal.tsx` | export function SignUpModal({ ... } | 122 |
| `apps/web/src/components/StatusBar.tsx` | export function StatusBar({ ... } | 76 |
| `apps/web/src/components/Toast.tsx` | export function useToast() { ... }, export function ToastProvider({ ... } | 115 |
| `apps/web/src/main.tsx` | default | 11 |
| `apps/web/src/pages/AccountPage.tsx` | export function AccountPage({ ... } | 623 |
| `apps/web/src/pages/DashboardPage.tsx` | export function DashboardPage({ ... } | 180 |

## Detected Style Files

- `apps/web/src/index.css` (770 lines)
- `payment-processing-output/theme.css` (226 lines)
