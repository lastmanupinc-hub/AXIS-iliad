Audit complete. All findings below are from reading the generated artifacts and the app source; nothing was written.

# Dogfood Audit: Generated Design System vs. apps/web Actual Usage

## (a) Generated tokens / brand values available

**`C:\Users\lastm\No Fate Platform\AXIS Toolbox\.ai\theme.css` (356 lines) — the crown jewel, ready to import as-is.** Full CSS custom-property contract: `--color-primary-50..900` (averionics HUD cyan), `--color-neutral-50..900` (cool slate, **scale inverts in dark mode** so token names stay stable), `--color-accent/--color-accent-ink/--color-amber/--color-success/--color-warning/--color-error`, `--font-sans/--font-mono`, `--font-size-xs..4xl`, `--space-1..16`, `--radius-sm..full`, `--shadow-sm..lg`, `--z-*`, `--transition-*`, `--ease-*` (incl. bounce), `--surface-page/card/elevated/inset/overlay-backdrop`, `--ring-*`, `--glow`. Plus: dark mode via BOTH `@media (prefers-color-scheme: dark)` (`:root:not([data-theme='light'])`) and explicit `[data-theme="dark"]`; `prefers-reduced-motion`; global `:focus-visible` ring; 7 keyframes + `.animate-*` utilities (incl. `pulse`/`shimmer` for skeletons); a base reset; and exactly one component primitive, `.surface-card`.

**`.ai\design-tokens.json`** — same palette in W3C design-tokens format, plus breakpoints, opacity, letter-spacing, line-heights, z-index, motion durations, and a `surfaces` map. **`.ai\dark-mode-tokens.json`** — dark palette with documented contrast ratios (15.3:1 AAA primary-on-base, etc.). **`.ai\theme-guidelines.md`** — usage rules (surface tokens, 4-pt grid, component patterns: buttons/cards/inputs/modals/badges, motion rules, a11y contrast table). **`.ai\component-guidelines.md`** — naming/structure/anti-patterns. **`.ai\component-theme-map.json`** — all 34 app components mapped to token categories. **`.ai\brand-guidelines.md`** — voice/copy only, no visual tokens.

**Generator-side inconsistencies worth fixing while dogfooding:**
- `.ai\brand-board.md` claims Brand Primary `#6366f1` indigo / `#8b5cf6` violet — **contradicts** design-tokens.json/theme.css cyan (`#06b6d4`/`#22d3ee`). The brand generator emitted a generic palette instead of reading the real tokens.
- `theme.css` sets `--font-sans: system-ui...` while brand-board.md and the app's actual CSS both say **Inter + JetBrains Mono**. The app's fonts should win.
- `theme.css` light accent is `#0a8aa6`; the app deliberately deepened it to `#0a5a6b` for WCAG AA on light tints (comment at `apps\web\src\index.css:21-23`). The app's value is the correct one to feed back into the generator.

## (b) What the app hardcodes vs. derives

`C:\Users\lastm\No Fate Platform\AXIS Toolbox\apps\web\src\index.css` (1,349 lines) defines its **own ad-hoc ~23-var contract** — `--bg, --bg-card, --bg-hover, --bg-inset, --bg-tertiary, --border, --border-strong, --text, --text-muted, --accent(-hover/-soft/-ink), --amber, --green, --yellow, --red, --blue, --radius` (single 7px), `--font, --mono, --shadow, --glow`. It does **not** import theme.css and shares zero token names with the generated contract. There is no spacing scale, no type scale, no z-index scale, no transition tokens — every rule hardcodes `padding: 8px 16px`, `transition: 0.15s`, `z-index: 200/1000`, `font-size: 0.8125rem` literals.

- **Derived (good):** colors flow through vars almost everywhere — 661 `var(--...)` references across 29 TSX files (`--text-muted` ×398, `--accent` ×67, `--radius` ×43, `--green` ×38, `--bg` ×38...).
- **Hardcoded in TSX:** 27 raw hex values in 7 files. Legit: Google logo SVG (`AuthButtons.tsx`). Not legit: `SearchTab.tsx:97-104` hardcodes an 8-color one-dark symbol palette (theme-blind — dark-tuned colors shown in light mode too) plus `#1a1a2e` at line 284; `#fff`-on-accent in `ExamplesPage.tsx` (430, 532, 591, 666) and `InstallPage.tsx:20` should be `var(--accent-ink)`.
- **Live bugs from having no single contract — TSX references vars that don't exist in index.css, with no fallback:** `var(--success)`/`var(--danger)` (`pages\AccountPage.tsx:410` — delta coloring silently inherits), `var(--orange)` (`pages\PlansPage.tsx:94`), `var(--surface)` (`pages\UploadPage.tsx:364` — transparent background), `var(--warning-bg)`/`var(--warning)` (`pages\UploadPage.tsx:492` — invisible badge tint). Others survive only via inline fallbacks (`var(--red, #ef4444)`, `var(--bg-elev, rgba(0,0,0,0.05))`).

## (c) Dark-mode state

Working but half-dogfooded. Toggle: `data-theme="dark"` set on `documentElement` in `App.tsx:177-182`, persisted as localStorage `axis_theme`, **default "light", no `prefers-color-scheme` detection** — the generated theme.css already solves OS-preference + explicit override; the app ignores it. The index.css dark palette (`#070b11`, `#0d141d`, `#22d3ee`, `#2ee6a6`, `#ffb020`...) matches `.ai\dark-mode-tokens.json` **exactly by value** — the dark system is dogfooded by value, just not by name. Known dark/light defect: SearchTab's hardcoded symbol colors are dark-optimized and fail contrast on light surfaces.

## (d) Concrete mapping proposal

**Token bridge (alias, don't rename).** Copy the generated theme.css into `apps/web/src/theme.css` (imported before index.css from `main.tsx`), with fonts corrected to Inter/JetBrains Mono and light accent to `#0a5a6b`. Then redefine the app's existing short names as aliases so **zero JSX or CSS-rule churn** is needed:

| App var (keep) | Generated token |
|---|---|
| `--bg` / `--bg-card` / `--bg-inset` | `--surface-page` / `--surface-card` / `--surface-inset` |
| `--bg-hover` / `--bg-tertiary` | `--color-neutral-100` / `--color-neutral-200` (auto-invert) |
| `--text` / `--text-muted` | `--color-neutral-900` / `--color-neutral-500` |
| `--border` / `--border-strong` | `--color-neutral-200` / `--color-neutral-300` |
| `--accent` / `--accent-ink` | `--color-accent` / `--color-accent-ink` |
| `--green`/`--amber`/`--yellow`/`--red` | `--color-success` / `--color-amber` / `--color-warning` / `--color-error` |
| `--radius` | `--radius-lg` (0.5rem ≈ current 7px) |
| `--shadow`, `--glow`, `--font`, `--mono` | `--shadow-base`, `--glow`, `--font-sans`, `--font-mono` |

**Plus new aliases that instantly fix the (b) bugs:** `--success`, `--danger` → `--color-error`, `--warning`, `--warning-bg` (color-mix 12%), `--orange` → `--color-amber`, `--surface` → `--surface-card`, `--bg-elev` → `--surface-elevated`, `--bg-code`/`--bg-subtle` → `--surface-inset`. The `[data-theme="dark"]` block in index.css then collapses to near-nothing, and OS-preference dark comes free.

**Primitives — exist today (CSS classes in index.css):** `.card`, `.btn/.btn-primary/.btn-lg/.btn-sm`, `.badge` + 5 color variants, `.tabs/.tab`, `.grid/.grid-2/3/4`, `.flex/.flex-between`, `.stat-value/.stat-label`, element-level `table/th/td`, `.progress-bar/.progress-fill`, `.empty-state`, `.spinner`, `.modal-overlay/.modal-content`, `kbd`, `pre`, `.mono`, animation utilities. React components: `Toast`, `CommandPalette`, `StatusBar`, `SignUpModal`, `UpsellModal`, `ToolPage` (page template), `Icon`/`AxisIcons`, `ProgramLauncher`.

**Needed (each backed by a repeated inline pattern):** `StatTile` (the `textAlign:center + 2rem value + muted label` trio repeated in DocsPage/HelpPage/ExamplesPage), `SectionHeader`/`PageHero` (centered h2 + muted sub, top of nearly every page), `CodeBlock` with copy button (hand-rolled in InstallPage/ExamplesPage/DocsPage), `TableWrap` (`overflowX:auto` ×11), `Callout` (tinted bordered note boxes), `Skeleton` (theme.css already ships `shimmer`/`pulse` — app only has a spinner), and a generalized `Pill` (`.upload-hero-pill`/`.program-output-pill`/`.program-keyword` are three page-scoped clones). `EmptyState` exists as a class but pages hand-roll variants — promote to component.

## (e) The inline-style problem, quantified + migration

**1,205 `style={{...}}` occurrences across 31 of 35 TSX files** (~10,145 LOC). Worst offenders: `DocsPage.tsx` 333, `HelpPage.tsx` 216, `ExamplesPage.tsx` 103, `TermsPage.tsx` 83, `AccountPage.tsx` 67, `UploadPage.tsx` 53 — the four content pages alone hold 735 (61%). Property histogram: `fontSize` ×510, `color` ×493, `marginBottom` ×344, `padding` ×114, `lineHeight` ×111, `textAlign` ×96, `gap` ×91. Crucially, colors inside inline styles already use vars — the hardcoding is **spacing and type**, and the same 4 micro-patterns account for the bulk (e.g., `{ color: "var(--text-muted)", fontSize: "0.8125rem" }` and `{ marginBottom: 12|16|24 }` repeat hundreds of times).

**Pragmatic migration — no rewrite, 3 mechanical phases:**
1. **Token bridge (hours, zero JSX changes):** ship `theme.css` + the alias block above. Fixes the 6 undefined-var bugs and OS dark mode on day one.
2. **Utility classes (hours, grep-driven):** add ~12 utilities to index.css matching the dominant patterns — `.text-muted`, `.text-sm`, `.text-xs`, `.text-center`, `.mb-1..mb-6`/`.mt-*` (on the `--space-*` scale), `.gap-2/.gap-3`, `.stack`. Then per-page find/replace of the *exact-match* inline objects only. The histogram says this alone removes roughly 500-700 of the 1,205.
3. **Composite extraction (about a day):** build the 6 missing primitives from (d), then sweep DocsPage → HelpPage → ExamplesPage → TermsPage in separate reviewable PRs.
4. **Ratchet, don't ban:** keep `style={{}}` legal for genuinely dynamic values (progress-fill widths, GraphTab coordinates, stagger delays) and add a CI count-budget test ("inline-style count must not increase") — same pattern as the repo's existing count-honesty tests. Optionally `eslint react/forbid-component-props` scoped later. No new dependencies needed; all vanilla CSS, consistent with CLAUDE.md constraints.

**Closing the dogfood loop:** the generators already read `apps/web/src/index.css` (it's listed as `source_theme_files` in design-tokens.json) but the app never imports the generated contract back — and the brand generator invents an indigo palette instead of reading the real cyan one. The bridge in (d) closes the loop in one direction; fixing `generators-brand.ts` to source colors from the theme tokens closes the other.

Key files: `...\AXIS Toolbox\.ai\theme.css`, `.ai\design-tokens.json`, `.ai\dark-mode-tokens.json`, `.ai\theme-guidelines.md`, `.ai\brand-board.md` (contradicts tokens), `apps\web\src\index.css`, `apps\web\src\App.tsx` (theme toggle, lines 177-182), bug sites: `apps\web\src\pages\AccountPage.tsx:410`, `pages\PlansPage.tsx:94`, `pages\UploadPage.tsx:364,492`, `components\SearchTab.tsx:97-104,284`.