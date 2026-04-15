# Dependency Hotspots — axis-toolbox

Generated: 2026-04-15T19:53:55.595Z

## Project Overview

axis-toolbox is a monorepo built with TypeScript using React. It contains 550+ files across 17 top-level directories. It defines 128 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Risk Summary

| Severity | Count |
|----------|-------|
| High (>7) | 0 |
| Medium (4–7) | 0 |
| Low (≤4) | 7 |
| **Total** | **7** |

## Hotspot Files

| File | Risk | Inbound | Outbound | Total Connections |
|------|------|---------|----------|-------------------|
| `apps/web/src/App.tsx` | 🟢 0.9 | 1 | 17 | 18 |
| `apps/web/src/api.ts` | 🟢 0.8 | 17 | 0 | 17 |
| `apps/web/src/pages.test.tsx` | 🟢 0.8 | 0 | 15 | 15 |
| `apps/web/src/pages/DashboardPage.tsx` | 🟢 0.5 | 1 | 9 | 10 |
| `apps/web/src/components/Toast.tsx` | 🟢 0.2 | 4 | 0 | 4 |
| `apps/web/src/components/AxisIcons.tsx` | 🟢 0.2 | 4 | 0 | 4 |
| `apps/web/src/upload-utils.ts` | 🟢 0.1 | 3 | 0 | 3 |

## Coupling Analysis

### `apps/web/src/App.tsx`

- **Risk Score**: 0.9/10
- **Inbound**: 1 files depend on this
- **Outbound**: 17 dependencies
- **Refactor Priority**: LOW — acceptable coupling

### `apps/web/src/api.ts`

- **Risk Score**: 0.8/10
- **Inbound**: 17 files depend on this
- **Outbound**: 0 dependencies
- **Refactor Priority**: LOW — acceptable coupling

### `apps/web/src/pages.test.tsx`

- **Risk Score**: 0.8/10
- **Inbound**: 0 files depend on this
- **Outbound**: 15 dependencies
- **Refactor Priority**: LOW — acceptable coupling

### `apps/web/src/pages/DashboardPage.tsx`

- **Risk Score**: 0.5/10
- **Inbound**: 1 files depend on this
- **Outbound**: 9 dependencies
- **Refactor Priority**: LOW — acceptable coupling

### `apps/web/src/components/Toast.tsx`

- **Risk Score**: 0.2/10
- **Inbound**: 4 files depend on this
- **Outbound**: 0 dependencies
- **Refactor Priority**: LOW — acceptable coupling

## External Dependency Risk

| Package | Version | Risk Factor |
|---------|---------|-------------|
| @axis/context-engine | workspace:* | Stable |
| @axis/generator-core | workspace:* | Stable |
| @axis/repo-parser | workspace:* | Stable |
| @axis/snapshots | workspace:* | Stable |
| mppx | ^0.5.12 | Pre-1.0 — unstable API |
| jszip | ^3.10.1 | Stable |
| react | ^19.1.0 | Stable |
| react-dom | ^19.1.0 | Stable |
| better-sqlite3 | ^12.8.0 | Stable |
| uuid | ^11.1.0 | Stable |
| @types/better-sqlite3 | ^7.6.13 | Stable |
| @types/node | ^22.0.0 | Stable |
| ts-node | ^10.9.2 | Stable |
| typescript | ^5.7.0 | Stable |
| @types/react | ^19.1.2 | Stable |

## Recommendations

1. **Review circular dependencies** in the import graph

## Hotspot Export Surface

### `apps/web/src/api.ts`

- `export interface SnapshotPayload { ... }`
- `export interface SnapshotResponse { ... }`
- `export interface ContextMap { ... }`
- `export interface RepoProfile { ... }`
- `export interface GeneratedFile { ... }`
- `export interface GeneratedFilesResponse { ... }`
- `export type BillingTier = ...`
- `export interface Account { ... }`
- `export interface ApiKeyInfo { ... }`
- `export interface UsageSummary { ... }`
- `export interface PlanDefinition { ... }`
- `export interface PlanFeature { ... }`

### `apps/web/src/App.tsx`

- `export function App() { ... }`

### `apps/web/src/pages/DashboardPage.tsx`

- `export function DashboardPage({ ... }`

## Hotspot File Excerpts

### `apps/web/src/api.ts`

```typescript
const API_BASE = import.meta.env.VITE_API_URL ?? "";

// ─── Snapshot types ─────────────────────────────────────────────

export interface SnapshotPayload {
  input_method: string;
  manifest: {
    project_name: string;
    project_type: string;
    frameworks: string[];
    goals: string[];
    requested_outputs: string[];
  };
  files: Array<{ path: string; content: string; size: number }>;
}

export interface SnapshotResponse {
  snapshot_id: string;
  project_id: string;
  status: string;
  context_map: ContextMap;
  repo_profile: RepoProfile;
  generated_files: Array<{ path: string; program: string; description: string }>;
}

... (513 more lines)
```

### `apps/web/src/App.tsx`

```tsx
import { useState, useCallback, useEffect, useRef, useMemo, Component, type ReactNode } from "react";
import { UploadPage } from "./pages/UploadPage.tsx";
import { DashboardPage } from "./pages/DashboardPage.tsx";
import { PlansPage } from "./pages/PlansPage.tsx";
import { AccountPage } from "./pages/AccountPage.tsx";
import { DocsPage } from "./pages/DocsPage.tsx";
import { HelpPage } from "./pages/HelpPage.tsx";
import { QAPage } from "./pages/QAPage.tsx";
import { ProgramsPage } from "./pages/ProgramsPage.tsx";
import { TermsPage } from "./pages/TermsPage.tsx";
import { ForAgentsPage } from "./pages/ForAgentsPage.tsx";
import { ExamplesPage } from "./pages/ExamplesPage.tsx";
import { InstallPage } from "./pages/InstallPage.tsx";
import { ToastProvider } from "./components/Toast.tsx";
import { CommandPalette, type PaletteAction } from "./components/CommandPalette.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { SignUpModal } from "./components/SignUpModal.tsx";
import type { SnapshotResponse } from "./api.ts";

// ─── Error Boundary ─────────────────────────────────────────────
// React requires a class for getDerivedStateFromError; this thin wrapper
// keeps the rest of the codebase class-free per .cursorrules.

class ErrorCatcher extends Component<{ children: ReactNode; fallback: (error: Error, reset: () => void) => ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
... (301 more lines)
```

### `apps/web/src/pages/DashboardPage.tsx`

```tsx
import { useState, useEffect } from "react";
import type { SnapshotResponse, GeneratedFile } from "../api.ts";
import { getGeneratedFiles, runProgram, downloadExport } from "../api.ts";
import { OverviewTab } from "../components/OverviewTab.tsx";
import { FilesTab } from "../components/FilesTab.tsx";
import { GraphTab } from "../components/GraphTab.tsx";
import { GeneratedTab } from "../components/GeneratedTab.tsx";
import { ProgramLauncher } from "../components/ProgramLauncher.tsx";
import { SearchTab } from "../components/SearchTab.tsx";
import { useToast } from "../components/Toast.tsx";

interface Props {
  result: SnapshotResponse;
  onGeneratedCountChange?: (count: number) => void;
}

const TABS = ["Overview", "Structure", "Dependencies", "Generated Files", "Programs", "Search"] as const;
type Tab = (typeof TABS)[number];

function NextStepsCard({ fileCount, onDownload, downloading }: { fileCount: number; onDownload: () => void; downloading: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || fileCount === 0) return null;

  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: "3px solid var(--accent)", padding: "16px 20px" }}>
... (155 more lines)
```

### `apps/web/src/pages.test.tsx`

```tsx
// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

// ─── Zero-prop page smoke tests ─────────────────────────────────
// Each test renders the page and verifies it mounts without throwing.

import { DocsPage } from "./pages/DocsPage";
import { ExamplesPage } from "./pages/ExamplesPage";
import { ForAgentsPage } from "./pages/ForAgentsPage";
import { HelpPage } from "./pages/HelpPage";
import { InstallPage } from "./pages/InstallPage";
import { QAPage } from "./pages/QAPage";
import { TermsPage } from "./pages/TermsPage";

describe("Page smoke tests — zero-prop pages", () => {
  it("DocsPage renders without crashing", () => {
    const { container } = render(<DocsPage />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("ExamplesPage renders without crashing", () => {
    const { container } = render(<ExamplesPage />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });
... (89 more lines)
```
