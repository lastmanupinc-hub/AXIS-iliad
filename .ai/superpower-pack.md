# Superpower Pack — axis-iliad

> High-leverage development workflows for a monorepo (TypeScript)

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 17 top-level directories. It defines 246 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Quick Actions

Copy-paste-ready commands for common high-value operations:

### Build & Run

```bash
# Install dependencies
npm install

# Build
npm run build

# Dev server
npm run dev
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

   - `apps/web/src/App.tsx` (risk: 1.0, 1 inbound, 21 outbound)
   - `apps/web/src/api.ts` (risk: 0.9, 19 inbound, 0 outbound)
   - `apps/web/src/pages.test.tsx` (risk: 0.8, 0 inbound, 17 outbound)
   - `apps/web/src/pages/DashboardPage.tsx` (risk: 0.6, 1 inbound, 10 outbound)
   - `apps/web/src/components/Toast.tsx` (risk: 0.2, 4 inbound, 0 outbound)

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
  - Linter configured
  - Formatter configured
  - Makefile build

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
const PROD_API_BASE = "https://axis-api-6c7z.onrender.com";
const isLocalHost =
  typeof window === "undefined" ||
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";
const API_BASE = import.meta.env.VITE_API_URL ?? (isLocalHost ? "" : PROD_API_BASE);

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
... (701 more lines)
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
import { AdminPage } from "./pages/AdminPage.tsx";
import { MyAnalyticsPage } from "./pages/MyAnalyticsPage.tsx";
import { ToolsIndexPage } from "./pages/ToolsIndexPage.tsx";
import { WebResearchPage } from "./pages/tools/WebResearchPage.tsx";
import { ToastProvider } from "./components/Toast.tsx";
import { CommandPalette, type PaletteAction } from "./components/CommandPalette.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
... (470 more lines)
```

### `apps/web/src/pages.test.tsx`

```tsx
/**
 * @vitest-environment happy-dom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

// ─── Zero-prop page smoke tests ─────────────────────────────────
// Each test renders the page and verifies it mounts without throwing.

import { DocsPage } from "./pages/DocsPage";
import { ExamplesPage } from "./pages/ExamplesPage";
import { ForAgentsPage } from "./pages/ForAgentsPage";
import { HelpPage } from "./pages/HelpPage";
import { InstallPage } from "./pages/InstallPage";
import { QAPage } from "./pages/QAPage";
import { TermsPage } from "./pages/TermsPage";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
... (142 more lines)
```
