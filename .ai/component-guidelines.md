# Component Guidelines — axis-iliad

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 16 top-level directories. It defines 242 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## File Structure

```
src/components/
├── common/          # Generic reusable components
├── layout/          # Layout components
└── features/        # Feature-specific components
```

## Naming

- **Components:** PascalCase (`DataTable`, `UserProfile`)
- **Files:** Match component name (`DataTable.tsx`)
- **Props types:** `ComponentNameProps` (`DataTableProps`)
- **Hooks:** `use` prefix (`useAuth`, `useTable`)

## Component Template

```tsx
interface MyComponentProps {
  title: string;
  children?: React.ReactNode;
}

export function MyComponent({ title, children }: MyComponentProps) {
  return (
    <div>
      <h2>{title}</h2>
      {children}
    </div>
  );
}
```

## Anti-Patterns

- Do not use `any` for props
- Do not inline complex logic in JSX — extract to hooks or helpers
- Do not create god components with 200+ lines — split into sub-components
- Do not maintain duplicate state — derive values where possible

## Detected Components

- **`apps/web/src/App.tsx`**: `export function App() { ... }`
- **`apps/web/src/components/AuthButtons.tsx`**: `export function AuthButtons({ ... }`
- **`apps/web/src/components/AxisIcons.tsx`**: `export function Icon({ ... }`
- **`apps/web/src/components/CommandPalette.tsx`**: `export interface PaletteAction { ... }`, `export function CommandPalette({ ... }`
- **`apps/web/src/components/FilesTab.tsx`**: `export function FilesTab({ ... }`
- **`apps/web/src/components/GeneratedTab.tsx`**: `export function GeneratedTab({ ... }`
- **`apps/web/src/components/GraphTab.tsx`**: `export function GraphTab({ ... }`
- **`apps/web/src/components/Icon.tsx`**: `export function Icon({ ... }`
- **`apps/web/src/components/OverviewTab.tsx`**: `export function OverviewTab({ ... }`
- **`apps/web/src/components/ProgramLauncher.tsx`**: `export function ProgramLauncher({ ... }`
- **`apps/web/src/components/SearchTab.tsx`**: `export function SearchTab({ ... }`
- **`apps/web/src/components/SignUpModal.tsx`**: `export function SignUpModal({ ... }`
- *... and 23 more*

## Reference Component (from your codebase)

### `apps/web/src/components/Icon.tsx`

```tsx
import type { ReactNode } from "react";

// ─── Icon set ────────────────────────────────────────────────────
// Inline stroke-based icons (24×24 viewBox, currentColor) for the IDE shell —
// crisp at the rail/tree's 16px and tinted by the surrounding text color (so the
// active-nav cyan flows through automatically). Replaces the placeholder Unicode
// glyphs. Add new icons here; reference them by name via <Icon name="…" />.

const PATHS: Record<string, ReactNode> = {
  "panel-left": <><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" /></>,
  scan: <><path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /><line x1="3" y1="12" x2="21" y2="12" /></>,
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>,
  wrench: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-2-2 2.3-2.3z" />,
  layers: <><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  "credit-card": <><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></>,
  "bar-chart": <><line x1="6" y1="20" x2="6" y2="12" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="18" y1="20" x2="18" y2="9" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  "log-out": <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>,
  book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>,
  help: <><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
  message: <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5z" />,
  bot: <><rect x="4" y="8" width="16" height="12" rx="2" /><path d="M12 4v4" /><circle cx="9" cy="14" r="1" /><circle cx="15" cy="14" r="1" /><path d="M2 14h2M20 14h2" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
  command: <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 0 0 0-6z" />,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  menu: <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>,
  x: <><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></>,
... (23 more lines)
```

---
*Generated by Axis Frontend*


---

## ⟳ Continue the loop

- **You are here:** `component-guidelines.md` — agent step 8 of 70.
- **Next:** `seo-rules.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
