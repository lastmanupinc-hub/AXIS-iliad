# Superpower Pack — axis-toolbox

> High-leverage development workflows for a monorepo (TypeScript)

## Project Overview

axis-toolbox is a monorepo built with TypeScript using React. It contains 500 files across 20 top-level directories. It defines 152 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Quick Actions

Copy-paste-ready commands for common high-value operations:

### Build & Run

```bash
# Install dependencies
pnpm install

# Build
pnpm run build

# Dev server
pnpm run dev
```

### Testing

```bash
# Run all tests
npx vitest run

# Watch mode
npx vitest

# Single file
npx vitest run <file>

# Coverage
npx vitest run --coverage
```

### Debugging Workflow

1. **Reproduce** — Create a minimal test case that triggers the bug
2. **Isolate** — Use dependency hotspots to narrow the search area:

   - `apps/web/src/App.tsx` (risk: 0.9, 1 inbound, 17 outbound)
   - `apps/web/src/api.ts` (risk: 0.8, 16 inbound, 0 outbound)
   - `apps/web/src/pages/DashboardPage.tsx` (risk: 0.5, 1 inbound, 9 outbound)
   - `apps/web/src/components/Toast.tsx` (risk: 0.1, 3 inbound, 0 outbound)
   - `apps/web/src/components/AxisIcons.tsx` (risk: 0.1, 3 inbound, 0 outbound)

3. **Trace** — Follow the import chain from entry point to failure
4. **Fix** — Make the smallest change that resolves the issue
5. **Verify** — Run the test case + full suite to confirm no regressions

## Code Review Checklist

- [ ] Types are correct and meaningful (no `any`, no untyped casts)
- [ ] Error paths are handled (not just the happy path)
- [ ] New code has test coverage
- [ ] No debug artifacts (console.log, TODO, commented code)
- [ ] Import graph doesn't create new circular dependencies
- [ ] Changes follow detected conventions:
  - TypeScript strict mode
  - pnpm workspaces

## Planning Template

```markdown
## Task: [title]

### What
[One sentence describing the change]

### Why
[Business or technical reason]

### Files to Touch
- [ ] file1.ts — [what changes]
- [ ] file2.ts — [what changes]

### Tests
- [ ] [test case 1]
- [ ] [test case 2]

### Risks
- [potential issue and mitigation]
```

## Key Hotspot Files (for Debugging)

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
... (466 more lines)
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
... (306 more lines)
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
... (160 more lines)
```
