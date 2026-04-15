# Theme Guidelines — axis-toolbox

> Design system rules for a monorepo built with TypeScript

## Project Overview

axis-toolbox is a monorepo built with TypeScript using React. It contains 550+ files across 17 top-level directories. It defines 128 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Architecture Context

Separation score: **0.65**/1.0

Theme tokens should be applied consistently across these layers:

- **presentation**: apps, frontend

## Styling Approach

**No CSS framework detected.** Using vanilla CSS custom properties.

- Import `theme.css` at the root of the application
- Use `var(--token-name)` to reference design tokens
- Avoid hardcoded colors, spacing, and typography values

## Color Usage

| Context | Token Range | Example |
|---------|------------|---------|
| Background (light) | neutral-50 to neutral-100 | Page backgrounds, cards |
| Background (dark) | neutral-800 to neutral-900 | Dark mode surfaces |
| Text (primary) | neutral-900 / neutral-50 (dark) | Body text |
| Text (secondary) | neutral-500 to neutral-600 | Labels, captions |
| Interactive | primary-500 to primary-600 | Buttons, links |
| Interactive (hover) | primary-600 to primary-700 | Hover states |
| Success | success-500 | Confirmations, valid states |
| Warning | warning-500 | Caution indicators |
| Error | error-500 | Error messages, destructive actions |

## Typography

- Use `font-sans` for UI text and body copy
- Use `font-mono` for code blocks, terminal output, and technical data
- Heading scale: h1=4xl, h2=3xl, h3=2xl, h4=xl, h5=lg, h6=base
- Body text: base size (1rem / 16px) with normal line-height (1.5)
- Small text: sm size for captions, helper text, labels
- Never use more than 3 font weights on a single page

## Spacing

- Use the 4-point grid: all spacing should be multiples of `--space-1` (0.25rem)
- Component padding: `--space-3` to `--space-4` (12–16px)
- Section gaps: `--space-6` to `--space-8` (24–32px)
- Page margins: `--space-4` on mobile, `--space-8` on desktop
- Stack spacing (vertical gaps): `--space-2` to `--space-4`

## Component Patterns

Detected 24 component file(s). Apply these patterns:

- Buttons: `radius-md`, `primary-500` bg, `space-2` horizontal padding, `space-1` vertical
- Cards: `radius-lg`, `shadow-base`, `space-4` padding, `neutral-50` bg
- Inputs: `radius-base`, `neutral-200` border, `space-2` padding, `neutral-50` bg
- Modals: `radius-xl`, `shadow-lg`, centered with backdrop
- Badges: `radius-full`, `font-size-xs`, `space-1` padding

## React Integration

> Detected: React ^19.1.0

- Import theme.css in `app/layout.tsx` or root `_app.tsx`
- Use a `ThemeContext` provider for runtime theme switching
- Expose tokens as TypeScript constants via a `tokens.ts` module
- Support `prefers-color-scheme` + manual toggle for dark mode

## Animation & Motion

### Available Animations

| Class | Effect | Duration | Use For |
|-------|--------|----------|---------|
| `.animate-fade-in` | Opacity 0→1 | 200ms | Page sections, lazy content |
| `.animate-slide-up` | Translate Y + fade | 200ms | Cards, list items, toasts |
| `.animate-slide-down` | Translate Y + fade | 200ms | Dropdowns, menus |
| `.animate-scale-in` | Scale 0.95→1 + fade | 150ms | Modals, popovers |
| `.animate-spin` | 360° rotate | 1s loop | Loading spinners |
| `.animate-pulse` | Opacity pulse | 2s loop | Skeleton loaders |
| `.animate-shimmer` | Gradient sweep | 1.5s loop | Loading placeholders |

### Motion Rules

- **Entrances**: Use `fade-in` or `slide-up`. Keep under 300ms.
- **Exits**: Reverse the entrance or use `fade-out` (opacity 1→0).
- **Hover/focus**: Use `transition: all var(--transition-fast)` — never animate on hover with keyframes.
- **Loading states**: Prefer `pulse` or `shimmer` over spinner when layout is known.
- **Reduced motion**: All animations are automatically disabled via `prefers-reduced-motion: reduce`.
- **Easing**: Default to `--ease-out` for entrances, `--ease-in` for exits, `--ease-bounce` for playful micro-interactions.

## Responsive Strategy

### Breakpoints

| Token | Width | Target |
|-------|-------|--------|
| `sm` | 640px | Large phones (landscape) |
| `md` | 768px | Tablets |
| `lg` | 1024px | Small laptops |
| `xl` | 1280px | Desktops |
| `2xl` | 1536px | Large screens |

### Rules

- **Mobile-first**: Write base styles for the smallest screen, then layer up with `min-width` queries.
- **Container widths**: Cap content at `max-width: 1280px` with auto margins.
- **Touch targets**: Minimum 44×44px for all interactive elements on mobile.
- **Spacing**: Use `--space-4` page margins on mobile, `--space-8` on `md+`.
- **Typography**: Body stays at `base` (1rem). Headings can scale down 1 step on mobile (e.g., `h1` from `4xl` to `3xl`).
- **Grid**: Prefer CSS Grid with `auto-fit` / `minmax()` for naturally responsive layouts.

## Surface Hierarchy

| Surface | CSS Class | Use For |
|---------|-----------|---------|
| Page | `--surface-page` | Root background |
| Card | `.surface-card` | Primary content containers |
| Elevated | `.surface-elevated` | Floating panels, popovers |
| Inset | `.surface-inset` | Code blocks, secondary areas |
| Overlay | `--surface-overlay-backdrop` | Modal/dialog backdrops |

Surfaces automatically adapt in dark mode via CSS custom properties.

## Accessibility

### Contrast Requirements (WCAG 2.1)

| Level | Ratio | Applies To |
|-------|-------|------------|
| AA | 4.5:1 | Normal text (< 18px) |
| AA | 3:1 | Large text (≥ 18px bold / 24px), UI components, icons |
| AAA | 7:1 | Enhanced — target for body text on critical pages |

### Token Contrast Reference

| Combination | Approximate Ratio | Grade |
|-------------|-------------------|-------|
| neutral-900 on neutral-50 | 18.1:1 | AAA |
| neutral-900 on neutral-100 | 16.0:1 | AAA |
| primary-600 on neutral-50 | 5.2:1 | AA |
| neutral-500 on neutral-50 | 4.6:1 | AA (text) |
| neutral-400 on neutral-50 | 3.2:1 | AA (large only) |
| error-500 on white | 4.0:1 | AA (large only) |

### Focus & Interaction

- All interactive elements use `:focus-visible` with a `2px` ring in `--ring-color`.
- Do not rely on color alone to convey state — pair with icons, text, or shape changes.
- Use `prefers-reduced-motion` to disable animations (already wired in theme.css).
- Test with screen readers, keyboard-only navigation, and Windows High Contrast Mode.

## Route Theme Zones

Routes detected — consider zone-based theming:

- `/v1/health` (GET) → apps/api/src/admin.test.ts
- `/v1/accounts` (POST) → apps/api/src/admin.test.ts
- `/v1/snapshots` (POST) → apps/api/src/admin.test.ts
- `/v1/admin/stats` (GET) → apps/api/src/admin.test.ts
- `/v1/admin/accounts` (GET) → apps/api/src/admin.test.ts
- `/v1/admin/activity` (GET) → apps/api/src/admin.test.ts
- `/llms.txt` (GET) → apps/api/src/agent-discovery.test.ts
- `/.well-known/skills/index.json` (GET) → apps/api/src/agent-discovery.test.ts
- `/v1/docs.md` (GET) → apps/api/src/agent-discovery.test.ts
- `/.well-known/axis.json` (GET) → apps/api/src/agent-discovery.test.ts
- `/for-agents` (GET) → apps/api/src/agent-discovery.test.ts
- `/v1/install` (GET) → apps/api/src/agent-discovery.test.ts
- … and 437 more routes

## Domain-Specific Tokens

Consider extending the token system for domain entity states:

- **AuthContext** (interface): 3 fields — apps/api/src/billing.ts
- **EnvSpec** (interface): 5 fields — apps/api/src/env.ts
- **ValidationError** (interface): 2 fields — apps/api/src/env.ts
- **ValidationResult** (interface): 3 fields — apps/api/src/env.ts
- **ZipEntry** (interface): 4 fields — apps/api/src/export.ts
- **IntentCapture** (interface): 5 fields — apps/api/src/mcp-server.ts
- **JsonRpcRequest** (interface): 4 fields — apps/api/src/mcp-server.ts
- **McpCallCounters** (interface): 5 fields — apps/api/src/mcp-server.ts

## Detected Style Files

- `apps/web/src/index.css` (770 lines)
- `component-theme-map.json` (362 lines)
- `dark-mode-tokens.json` (134 lines)
- `packages/generator-core/src/generators-theme.ts` (1027 lines)
- `packages/snapshots/src/github-token-branches.test.ts` (89 lines)
- `packages/snapshots/src/github-token-store.ts` (136 lines)
- `payment-processing-output/component-theme-map.json` (2059 lines)
- `payment-processing-output/dark-mode-tokens.json` (117 lines)
- `payment-processing-output/theme-guidelines.md` (137 lines)
- `payment-processing-output/theme.css` (226 lines)

## Style File Contents

### `apps/web/src/index.css`

```css
:root {
  --bg: #f8f9fa;
  --bg-card: #ffffff;
  --bg-hover: #f0f1f3;
  --border: #d1d5db;
  --text: #1a1a2e;
  --text-muted: #6b7280;
  --accent: #6366f1;
  --accent-hover: #4f46e5;
  --green: #16a34a;
  --yellow: #ca8a04;
  --red: #dc2626;
  --blue: #2563eb;
  --radius: 8px;
  --font: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --mono: "JetBrains Mono", "Fira Code", "Consolas", monospace;
  --shadow: 0 1px 3px rgba(0,0,0,0.08);
}

[data-theme="dark"] {
... (750 more lines)
```

### `component-theme-map.json`

```json
{
  "project": "axis-toolbox",
  "generated_at": "2026-04-15T19:50:19.076Z",
  "detected_stack": [
    {
      "name": "React",
      "version": "^19.1.0",
      "confidence": 0.95
    }
  ],
  "primary_language": "TypeScript",
  "summary": {
    "total_components": 30,
    "by_type": {
      "custom": 15,
      "decorative": 1,
      "overlay": 2,
      "page": 12
    }
  },
... (342 more lines)
```

### `dark-mode-tokens.json`

```json
{
  "project": "axis-toolbox",
  "generated_at": "2026-04-15T19:50:19.241Z",
  "scheme": "dark",
  "detected_stack": {
    "frameworks": [
      "React ^19.1.0"
    ],
    "primary_language": "TypeScript",
    "project_type": "monorepo"
  },
  "colors": {
    "background": {
      "base": "#0f172a",
      "surface": "#1e293b",
      "elevated": "#334155",
      "overlay": "rgba(0, 0, 0, 0.6)"
    },
    "foreground": {
      "primary": "#f8fafc",
... (114 more lines)
```

## Component Style Usage

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
