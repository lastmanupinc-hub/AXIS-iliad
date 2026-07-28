# Hub and Spoke — selling each AXIS program as its own product

**Thesis:** Iliad stays the hub. Each of the 20 generator programs also gets a name,
a price, a landing page at `<name>.trustfabric.ai`, and a buyer who has exactly one
problem. The hub keeps bundle economics for people who want the whole read; the
spokes reach the much larger population who will never buy a 20-program bundle to
solve one thing.

One strategy guide per program lives beside this file. Every "what ships today"
section is generated from the live registry (`listAvailableGenerators()`), not from
documentation — this repo has a standing habit of docs drifting from the code, and a
strategy built on stale counts would inherit it.

## The portfolio, honestly graded

| Tier | Meaning | Count |
|---|---|---|
| **A** | Sellable now | 6 |
| **B** | Sellable after narrow, identified work | 5 |
| **C** | Not sellable standalone in current form | 9 |

### Tier A — ship these first

| Product | Program | Subdomain | Price | Why it stands alone |
|---|---|---|---|---|
| **Socket** | `mcp` | `socket.` | $29/mo | 19 generators, 11 machine-consumable. Best timing in the portfolio. |
| **Crate** | `closer` | `crate.` | $49 one-time | 16 generators. Turns working code into a shippable package. |
| **Runway** | `deploy` | `runway.` | $19/mo | Emits Dockerfiles that run. Acute, recurring pain. |
| **Embed** | `artifacts` | `embed.` | $29/mo | Real `.tsx` components against detected models. |
| **Palette** | `theme` | `palette.` | $19/mo | `theme.css` drops straight into a build. |
| **Onboard** | `skills` | `onboard.` | $9–29/mo | Already the revenue wedge. Highest re-run frequency. |

### Tier B — real output, one identified blocker each

**Atlas** (`search`) · **Checkout** (`agentic-purchasing`) · **Runbook** (`superpowers`) · **Reel** (`remotion`) · **Seed** (`algorithmic`)

### Tier C — do not launch as standalone SaaS

**Grain** (`frontend`) · **Postmortem** (`debug`) · **Burn** (`optimization`) · **Crawl** (`seo`) · **Voice** (`brand`) · **Funnel** (`marketing`) · **Marginalia** (`notebook`) · **Vault** (`obsidian`) · **Poster** (`canvas`)

---

## Where the gaps are

These surfaced while grading, and they matter more than the naming.

### 1. Nine of twenty programs emit only prose

`debug`, `frontend`, `marketing` and `skills` produce **zero** machine-consumable
files; five more are majority-markdown. A document describing what someone should do
is a consultancy deliverable, not software, and it will not sustain a subscription.

There is one important exception. `skills` is graded 0/6 runnable, but its markdown
**is** the product — an agent reads `AGENTS.md` directly. Contrast `frontend`, whose
markdown *describes* code a human still has to write. Same file extension, opposite
economics. Do not let the classifier flatten that distinction.

### 2. Grain cannot be sold against v0 as specified

This is the one to read before anything else, because it is the comparison that
prompted the exercise.

`frontend` emits four markdown files: rules, guidelines, layout patterns, an audit.
**v0 generates working UI.** Selling Grain beside it means selling a style guide
against a code generator. The market will make that comparison in about four seconds
and it will not go our way.

`artifacts` (Embed) already generates real components. Either merge Grain into Embed,
or give Grain a generator that emits code. Launching it as-is would damage the
portfolio's credibility more than the revenue would justify.

### 3. Runway's output is never executed

The highest-value fix in the portfolio. We emit Dockerfiles and never build one. A
Dockerfile that does not build is worse than no Dockerfile, because it costs the
buyer a debugging session before they conclude we were wrong.

Add a build-verification step and Runway becomes genuinely defensible — "our
Dockerfile builds, verified, or you don't pay" is a claim almost nobody in this
space can make.

### 4. Atlas should stay free

`search` produces the architecture read every other program consumes. Charging for it
closes the funnel that feeds the rest. It is the best demo we have; price it at zero
and let it sell the others.

### 5. Checkout's compliance claims are untested where it counts

`agentic-purchasing` is already sold at $0.50/call, so viability is proven. But this
repo's own `packages/ap2` carries a self-disclosed warning: shapes modelled from
public docs, verified only against self-authored golden vectors, never a live
counterparty. Compliance buyers are exactly the ones who will discover that. Fix
before raising the price to $99/mo.

### 6. Several products should merge rather than launch

- **Marginalia → Onboard.** Same source, and the agent market is the one that pays.
- **Postmortem → Onboard.** A debug playbook is onboarding material.
- **Crawl → Grain.** Neither is strong alone; together they are a site-quality product.
- **Voice + Funnel.** One go-to-market pack, not two documents.
- **Poster → Atlas.** Visual output for the architecture read.

Twenty programs do not imply twenty products. On this grading it is closer to
**eight or nine real products**, several of which absorb their weaker neighbours.

---

## Sequencing

1. **Ship Tier A behind one shared billing surface.** Six products, six landing pages,
   one checkout. Do not build six billing integrations.
2. **Close the Runway build-verification gap** before marketing it. It converts the
   strongest claim in the portfolio from assertion to proof.
3. **Resolve Grain** — merge or re-generate. Do not launch it as prose.
4. **Keep Atlas free** and instrument what fraction of its users convert to a paid spoke.
5. **Revisit Tier B** only after Tier A has revenue. Reel and Seed in particular may
   never justify their own landing pages.

## What this does not cover

Deliberately out of scope here, and each is real work:

- **20 subdomains** need DNS, TLS and Cloudflare Pages projects. The existing
  `axis-web` Git-connect is browser-only OAuth and needed manual owner setup — this
  multiplies that chore.
- **Per-product entitlements.** Today an account has one tier. Selling Socket to
  someone who does not get Palette needs per-product entitlement the schema has no
  concept of.
- **Recurring billing** is gated on the Terms change effective 2026-08-15. Every
  monthly price above is unbillable until then — today's checkout is one-time only.

That last point is the binding constraint on this entire strategy: **eleven of the
prices in this document cannot be charged yet.**
