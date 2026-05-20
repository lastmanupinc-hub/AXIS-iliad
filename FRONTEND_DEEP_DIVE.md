# AXIS' Iliad — Frontend Deep Dive

## Architecture Overview

**Tech Stack:**
- React 19 (hooks-based, functional components only)
- Vite (dev server, build tool)
- TypeScript (strict mode)
- CSS (custom properties + grid/flexbox)
- localStorage (auth state, theme, results persistence)

**Key Constraint:** Class components are banned except for React's required `ErrorBoundary` pattern (single thin wrapper in App.tsx).

---

## Page Structure & Routing

All pages live in `apps/web/src/pages/` and are imported into the App root component. Routing is **hash-based** (`#page-name`).

### Available Pages (12 total)

| Page | File | Purpose | Auth Required? | Key Features |
|------|------|---------|---|---|
| **Analyze** (default) | `UploadPage.tsx` | File upload, GitHub URL analysis, snapshot creation | No | ZIP upload, GitHub clone, project detection |
| **Dashboard** | `DashboardPage.tsx` | Results viewer, file browser, program runner, search | No (but needs result) | 6 tabs: Overview, Structure, Dependencies, Generated Files, Programs, Search |
| **Plans** | `PlansPage.tsx` | Pricing tiers (Free/Pro/Suite), feature comparison | No | 3-tier matrix, upgrade CTAs |
| **Account** | `AccountPage.tsx` | Auth, API keys, usage stats, billing, seats, subscription | Dual-mode | Signup form OR logged-in dashboard |
| **Docs** | `DocsPage.tsx` | API documentation, examples, SDK guide | No | Links to external docs, code samples |
| **Help** | `HelpPage.tsx` | FAQ, troubleshooting, support channels | No | Common issues, contact links |
| **Q&A** | `QAPage.tsx` | Q&A content (likely FAQ or forum embed) | No | Questions & answers |
| **Programs** | `ProgramsPage.tsx` | 18 program showcase, descriptions, use cases | No | Feature descriptions, program map |
| **Terms** | `TermsPage.tsx` | Legal: ToS, Privacy, etc. | No | Legal text |
| **For Agents** | `ForAgentsPage.tsx` | MCP integration, agent-specific features | No | Agent setup, MCP docs |
| **Examples** | `ExamplesPage.tsx` | Demo projects, case studies | No | Screenshots, links to examples |
| **Install** | `InstallPage.tsx` | Self-host setup, Docker, deploy instructions | No | Installation guide |

---

## Accounts Logic — Full Flow

### 1. State Management

**Auth State (localStorage):**
```typescript
localStorage.getItem("axis_api_key")  // Bearer token, set on signup/login
localStorage.getItem("axis_last_result")  // Persisted snapshot result JSON
localStorage.getItem("axis_theme")  // "light" | "dark"
```

**App-level state (React hooks):**
- `loggedIn` — boolean, computed from localStorage
- `page` — current page (type `Page`)
- `result` — current snapshot/analysis result
- `showSignUp` — modal visibility
- `pendingResultRef` — holds result while signup modal is open

---

### 2. Authentication Flow

#### A. Sign-Up (New Account)

**Step 1: User reaches AccountPage (unauthenticated)**
```
No localStorage.axis_api_key → Show signup form OR "Sign in with GitHub" button
```

**Step 2: Form submission (local signup)**
```typescript
async function handleSignUp(name, email) {
  const result = await createAccount(name.trim(), email.trim());
  // Returns: { account: Account, api_key: { key_id, raw_key, label } }
  localStorage.setItem("axis_api_key", result.api_key.raw_key);
  // Trigger onAuthChange() callback to update App-level loggedIn state
}
```

**Step 3: GitHub OAuth (alternative)**
```
User clicks "Sign in with GitHub"
  → GET ${API_BASE}/v1/auth/github
  → Redirected to GitHub, user grants permission
  → GitHub redirects back to ?key=axis_xxx&login=github
  → AccountPage detects URL params in useEffect:
     localStorage.setItem("axis_api_key", oauthKey)
     window.location.reload()
```

#### B. Login (Existing Account)

**Option 1: Paste API key**
```
AccountPage: "Already have an API key?" form
  → User pastes axis_xxx key
  → localStorage.setItem("axis_api_key", key)
  → window.location.reload()
```

**Option 2: SignUpModal (on UploadPage)**
```
User uploads files without being logged in
  → DashboardPage offered but pending signup
  → SignUpModal opens (modal overlay)
  → User fills form or pastes key
  → onSuccess() callback:
     - localStorage.setItem("axis_api_key", key)
     - Trigger parent onAuthChange()
     - Restore pendingResultRef data
     - Navigate to dashboard
```

#### C. Logout

```typescript
function handleLogout() {
  localStorage.removeItem("axis_api_key");
  setAccount(null);
  setKeys([]);
  setUsage(null);
  setRevealedKey(null);
  setCredits(null);
  // Redirect to AccountPage signup form
}
```

---

### 3. Account Management (Logged-In)

**AccountPage (logged-in mode) displays:**

#### Account Info Card
```typescript
{account?.name}
{account?.email}
// Tier badge: [Free | Pro | Enterprise Suite]
// Logout button
```

#### Upgrade Banners
- **Free tier** → "Unlock All 18 Programs" → Upgrade to Pro $29/mo
- **Pro tier** → "Need More?" → Upgrade to Enterprise
- **Enterprise tier** → No upsell

#### Subscription Card (if subscribed)
```
Status: [active | cancelled | past_due]
Renews: {current_period_end date}
Payment: {card_brand} ····{card_last_four}
[Cancel Subscription] button (if active)
```

#### Usage Stats
```typescript
// Grid of 3 columns:
- Monthly Snapshots Used: {monthly_snapshots}/{limit}
- Projects: {project_count}/{limit}
- By Program (table): [{program, total_runs, total_generators, ...}]
```

#### API Keys Section
```
List all keys:
  - key_id, label, created_at, prefix (masked)
  - [Revoke] button per key

New Key Form:
  - Label input (optional, defaults to "default")
  - [Create Key] button
  - On success: Display raw_key once (with copy-to-clipboard)
```

#### Team Seats (if enabled)
```
Seats Used: {count}/{limit}
List members:
  - Seat: email, role, created_at
  - [Revoke] button per seat

Invite Form:
  - Email input
  - [Invite] button
```

#### Credits / Billing
```
(If credits system enabled)
- Current credits: {amount}
- Usage this period: {amount}
```

---

### 4. API Client (apps/web/src/api.ts)

**Auth Helper:**
```typescript
function authHeaders(): Record<string, string> {
  const key = localStorage.getItem("axis_api_key");
  const headers = { "Content-Type": "application/json" };
  if (key) headers["Authorization"] = `Bearer ${key}`;
  return headers;
}
```

**Account Endpoints:**

| Method | Endpoint | Purpose | Returns |
|--------|----------|---------|---------|
| POST | `/v1/accounts` | Create account | `{ account: Account, api_key: { key_id, raw_key, label } }` |
| GET | `/v1/account` | Get current account | `Account` |
| POST | `/v1/account/keys` | Create API key | `{ key_id, raw_key, label }` |
| GET | `/v1/account/keys` | List API keys | `{ keys: ApiKeyInfo[] }` |
| DELETE | `/v1/account/keys/{keyId}` | Revoke API key | `void` |
| GET | `/v1/account/usage` | Get usage stats | `{ tier, monthly_snapshots, project_count, by_program }` |
| GET | `/v1/account/subscription` | Get subscription info | `SubscriptionInfo` |
| POST | `/v1/account/subscription/cancel` | Cancel subscription | `{ subscription_id, status, message }` |
| GET | `/v1/account/credits` | Get credit balance | `CreditsInfo` |
| GET | `/v1/account/seats` | List team seats | `{ seats, count, limit, remaining }` |
| POST | `/v1/account/seats/invite` | Invite team member | `{ seat: Seat }` |
| DELETE | `/v1/account/seats/{seatId}` | Revoke team member | `void` |
| POST | `/v1/account/checkout` | Create Stripe checkout | `{ checkout_url, tier, variant_id }` |

**Key TypeScript Interfaces:**

```typescript
export interface Account {
  account_id: string;
  name: string;
  email: string;
  tier: "free" | "paid" | "suite";
  created_at: string;
}

export interface ApiKeyInfo {
  key_id: string;
  label: string;
  created_at: string;
  revoked_at: string | null;
  prefix: string;  // e.g., "axis_1234"
}

export interface SubscriptionInfo {
  has_active_subscription: boolean;
  active_subscription?: {
    subscription_id: string;
    status: string;  // "active" | "cancelled" | "past_due"
    current_period_end?: string;  // ISO date
    card_brand?: string;  // "visa", "mastercard", etc.
    card_last_four?: string;
    cancel_at?: string;  // ISO date, if cancelling
  };
}

export interface Seat {
  seat_id: string;
  email: string;
  role: string;  // "member" | "admin"?
  created_at: string;
  invited_by?: string;
}
```

---

### 5. Sign-Up Modal Component

**Location:** `apps/web/src/components/SignUpModal.tsx`

**Props:**
```typescript
interface Props {
  onSuccess: () => void;           // Called on signup complete
  onClose?: () => void;             // Called on cancel (if allowClose=true)
  allowClose?: boolean;             // Show cancel button
}
```

**Modes:**
1. **Email/name form** → POST `/v1/accounts` → localStorage key → onSuccess()
2. **Paste existing key** → localStorage.setItem → onSuccess()

**UI:**
- Modal overlay (blocks interaction outside)
- "Create Your Account" heading
- Name/email inputs
- Error display (inline)
- Create Account button (shows spinner while submitting)
- OR divider
- "Sign in with existing API key" section (paste box + Sign In button)
- Cancel button (only if allowClose=true)

---

## Pages Deep Dive

### UploadPage

**Purpose:** Initial snapshot creation

**Inputs:**
- ZIP file upload (drag-drop or file picker)
- GitHub URL input (auto-clone + analyze)
- Project metadata (name, type, frameworks, goals)

**Flow:**
1. User uploads ZIP or pastes GitHub URL
2. Page collects manifest metadata
3. Calls `createSnapshot(payload)` (120s timeout for large uploads)
4. On success:
   - If logged in → Save result to localStorage → Navigate to dashboard
   - If NOT logged in → Show SignUpModal, queue result in pendingResultRef
5. Errors show toast notifications

**Components Used:**
- File upload zone
- GitHub URL input
- Metadata form (multiselect dropdowns)
- Progress bar (during upload)
- Toast messages

---

### DashboardPage

**Purpose:** Explore snapshot results, run programs, search code

**Props:**
```typescript
interface Props {
  result: SnapshotResponse;                // Snapshot data
  onGeneratedCountChange?: (count: number) => void;  // Sync file count to parent
}
```

**Tabs (6 total):**

| Tab | Component | Shows |
|-----|-----------|-------|
| **Overview** | `OverviewTab` | Project summary, key stats, dependencies list, entry points, routes |
| **Structure** | `FilesTab` | File tree, LOC by language, directory breakdown |
| **Dependencies** | `GraphTab` | Dependency graph visualization, import hotspots |
| **Generated Files** | `GeneratedTab` | List of generated artifacts, preview/download each |
| **Programs** | `ProgramLauncher` | Run any of 18 programs on the snapshot, show results |
| **Search** | `SearchTab` | Full-text search, symbol search, cross-reference |

**Key Features:**
- Keyboard shortcuts: Alt+1–6 to switch tabs
- Real-time search indexing
- Program runner with tier blocking (402 TIER_REQUIRED)
- Export all files as ZIP
- Download individual programs' output

**Tier Blocking:**
```typescript
// If user runs Pro-only program but is on Free tier:
// API returns 402 with error_code="TIER_REQUIRED"
// Blocked programs list shown in UpsellModal
```

**Next Steps Card:**
```
1. Download your artifacts
2. Copy AGENTS.md to repo root
3. Copy .cursorrules
4. Open AI tool and start coding
```

---

### AccountPage

**Two Modes:**

#### Mode 1: Not Logged In
- Sign-up form (name, email)
- GitHub OAuth button
- "Already have a key?" section (paste box)

#### Mode 2: Logged In
- Account info (name, email, tier badge, logout)
- Upgrade banners (tier-specific CTAs)
- Subscription info (if subscribed)
- Usage stats (monthly snapshots, projects, by-program table)
- API Keys management (create, revoke, reveal once)
- Team Seats management (invite, revoke, list members)
- Credits display (if enabled)

**Error Handling:**
- Display error banner if load fails
- Retry on specific endpoints individually (don't block whole page)

---

### PlansPage

**Purpose:** Tier comparison + upsell

**Content:**
- 3-column feature matrix (Free/Pro/Suite)
- Highlights per tier
- Pricing: monthly & annual
- Feature rows:
  - Snapshots/month
  - Projects
  - Programs available (3/15/18)
  - Team seats
  - API rate limits
  - Support level
  - etc.

**CTAs:**
- "Get Started" (Free) — navigate to signup
- "Upgrade to Pro" (Pro) — AccountPage with checkout
- "Contact Sales" (Suite) — mailto or form

---

### Other Pages (Brief)

| Page | Content |
|------|---------|
| **Docs** | Links to `/v1/docs`, SDK, API reference |
| **Help** | FAQ, troubleshooting, support email, chat widget |
| **Q&A** | Q&A content (FAQ or external embed) |
| **Programs** | 18 program descriptions, use cases, output samples |
| **Terms** | ToS, Privacy Policy, EULA (static legal) |
| **For Agents** | MCP server setup, agent capabilities, tools list |
| **Examples** | Demo projects, case studies, screenshots |
| **Install** | Self-host instructions, Docker, deploy guides |

---

## App.tsx Root Component

**Key Responsibilities:**
1. **Router:** Hash-based page navigation
2. **Auth state:** `loggedIn` computed from localStorage
3. **Result persistence:** Load/save `axis_last_result` to localStorage
4. **Theme:** Light/dark mode toggle + localStorage persistence
5. **Error boundary:** Top-level error catcher (class component wrapper)
6. **Global components:**
   - Header (nav, logo, theme toggle, mobile menu)
   - Command palette (Ctrl+K, quick nav)
   - Status bar (version, stats)
   - Toast provider (error/success notifications)
   - SignUpModal (fullscreen overlay on demand)

**Navigation:**
- Desktop nav: 11 buttons (Analyze, Dashboard*, Programs, Plans, Account, Docs, Help, Q&A, For Agents, Examples, Install, Cmd, Theme)
- Mobile: Hamburger menu + theme toggle
- Keyboard shortcuts: Ctrl+1–7 for quick page nav

**SignUp Flow in App:**
```
1. User uploads files without login
2. onUploadComplete() → pendingResultRef = data, setShowSignUp(true)
3. SignUpModal opens (modal overlay)
4. User fills form or pastes key
5. SignUpModal onSuccess() callback:
   → setShowSignUp(false)
   → Restore pendingResultRef
   → Navigate to dashboard
   → Sync result to localStorage
```

---

## Component Hierarchy

```
App
├── Header
│   ├── Logo (click = reset)
│   ├── Nav (desktop)
│   ├── Mobile hamburger + menu
│   └── Theme toggle
├── ErrorBoundary
│   └── [Current Page Component]
│       ├── UploadPage
│       ├── DashboardPage
│       │   ├── OverviewTab
│       │   ├── FilesTab
│       │   ├── GraphTab
│       │   ├── GeneratedTab
│       │   ├── ProgramLauncher
│       │   └── SearchTab
│       ├── AccountPage
│       ├── PlansPage
│       ├── ... (7 other pages)
├── SignUpModal (conditional render)
├── ToastProvider
├── CommandPalette
└── StatusBar
```

---

## Styling & Theme

**CSS Variables (Dark Mode):**
```css
--bg-primary, --bg-secondary, --bg-tertiary
--text-primary, --text-muted, --text-inverse
--border, --border-light
--accent, --red, --yellow, --green
--radius (border-radius)
--mono (monospace font)
```

**Theme Toggle:**
```typescript
document.documentElement.setAttribute("data-theme", theme);  // "light" or "dark"
localStorage.setItem("axis_theme", theme);
```

**Classes:**
- `.btn`, `.btn-primary`, `.btn-small`
- `.card` (bordered container)
- `.badge`, `.badge-green`, `.badge-accent`, `.badge-yellow`
- `.flex`, `.flex-between`, `.grid`, `.grid-3` (layout)
- `.spinner` (loading indicator)
- `.modal-overlay`, `.modal-content`
- `.empty-state` (no data placeholder)

---

## Error Handling

**API Errors:**
```typescript
class ApiError extends Error {
  status: number;
  errorCode: string;  // e.g., "TIER_REQUIRED", "TIMEOUT", "NETWORK_ERROR"
  extra: Record<string, unknown>;  // Extra context (blocked_programs, allowed_programs, etc.)
}
```

**Common Error Codes:**
- `TIER_REQUIRED` (402) — User needs to upgrade
- `TIMEOUT` (0) — Network request timed out (120s default)
- `NETWORK_ERROR` (0) — Connection failed, check internet
- `UNAUTHORIZED` (401) — API key invalid or revoked

**User Feedback:**
- Inline error messages in modals/forms
- Toast notifications for page-level errors
- Error banner in AccountPage if data load fails
- Retry buttons for transient failures

---

## State Persistence Strategy

| State | Storage | Scope | TTL |
|-------|---------|-------|-----|
| API Key | localStorage | Tab-wide, survives reload | Until explicitly logged out |
| Last Result | localStorage | Tab-wide, survives reload | Until manually cleared or replaced |
| Theme | localStorage | Tab-wide, survives reload | Persists indefinitely |
| Page (hash) | URL hash | Tab-wide, survives reload | Until user navigates |
| UI state (tab, open modals) | React memory | Session only | Lost on reload |

---

## Performance Optimizations

1. **Lazy component loading:** Pages are co-located (not code-split yet)
2. **Memoization:** useMemo for command palette actions, route handlers
3. **Event debouncing:** Keyboard nav doesn't cause rapid re-renders
4. **Large upload handling:** Gzip compression for payloads >1 MB
5. **Request timeout:** 120s for uploads, 30s default
6. **Search indexing:** Happens server-side; frontend polls for completion

---

## Security Considerations

1. **API Key Storage:** localStorage (not httpOnly due to SPA architecture)
   - Risk: XSS vulnerability would expose key
   - Mitigation: No eval(), sanitize user input, CSP headers on server
   
2. **GitHub OAuth:** Redirect-based, key passed in URL
   - Mitigation: Immediate localStorage.setItem + reload to clear URL
   
3. **Generated Files:** Downloaded as ZIP, no script execution in frontend
   - User manually extracts and uses in their repo

4. **CORS:** API requires explicit headers (Bearer token in header, not cookie)

5. **Error Messages:** Never log sensitive data (API keys, file contents) to console

---

## Testing Notes

- **Components tested:** UploadPage, DashboardPage, AccountPage, pages (15 tests total)
- **API mocked:** Yes, in test setup
- **localStorage mocked:** Yes, jest.setup
- **Integration tests:** E2E flows (upload → dashboard → export) in cli-edge-cases.test.ts

---

## Future Enhancements

1. **Code splitting:** Lazy-load page components on route change
2. **PWA mode:** Offline caching of results, service workers
3. **Dark mode improvements:** Syntax highlighting for generated files
4. **Accessibility:** ARIA labels, keyboard nav polishing
5. **Mobile UX:** Optimized layouts for small screens
6. **WebSockets:** Real-time progress updates on long-running programs
7. **Wallet integration:** Accept crypto for credits
8. **Team collaboration:** Real-time co-viewing of results, comments
