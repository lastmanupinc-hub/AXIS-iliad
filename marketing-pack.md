# AXIS Toolbox — Marketing Pack

## Executive Summary

**Product**: AXIS Toolbox v0.4.0
**Category**: AI Development Intelligence Platform
**Tagline**: The operating system for AI-native development
**Owner**: Last Man Up Inc.
**Model**: Freemium SaaS — Free tier (3 programs, 14 generators) → Pro tier (18 programs, 87 generators)

---

## Competitive Landscape

### Market Map

| Category | Players | Market Size | AXIS Position |
|----------|---------|------------|---------------|
| AI Code Assistants | GitHub Copilot, Cursor, Cody, Tabnine | $2B+ (2024) | **Upstream enabler** — AXIS feeds context to these tools |
| Static Analysis | SonarQube, ESLint, Semgrep, CodeClimate | $800M | **Different axis** — AXIS analyzes architecture, not lint rules |
| Code Intelligence | Sourcegraph, Codeium, Codacy | $500M | **Deeper output** — 87 artifacts vs. search results |
| DevOps Intelligence | LinearB, Sleuth, Faros AI | $300M | **Repo-level** — AXIS operates at code level, not workflow |
| Documentation | Mintlify, ReadMe, GitBook | $200M | **Broader scope** — docs are 1 of 18 program outputs |
| AI Dev Tools (new) | Devin, SWE-Agent, OpenHands | $1B+ (projected) | **Infrastructure layer** — AXIS provides the context these agents need |

### Competitive Advantages (Evidence-Backed)

| Advantage | Evidence | Defensibility |
|-----------|---------|---------------|
| 87 generators across 18 programs | axis_all_tools.yaml canonical spec | High — breadth creates switching cost |
| Self-governing YAML constitution | 12 governance files, automated_remedial_action.yaml | Very High — novel architecture |
| Zero runtime HTTP dependencies | Custom router, verified in package.json | Medium — engineering discipline |
| 99.99% test coverage (3,906 tests) | vitest --coverage output | High — quality compounds |
| Deterministic output | 6 byte-identical determinism tests | High — unique in category |
| 81/82 capabilities Grade A | capability_inventory.yaml with evidence | High — continuous self-audit |

### Competitor Feature Matrix

| Feature | AXIS Toolbox | Sourcegraph | SonarQube | Devin |
|---------|-------------|-------------|-----------|-------|
| Repo analysis | ✅ 87 artifacts | ✅ Search + navigation | ✅ Quality gates | ✅ Task completion |
| Agent instructions gen | ✅ AGENTS.md, CLAUDE.md | ❌ | ❌ | ❌ |
| Design tokens gen | ✅ Theme program | ❌ | ❌ | ❌ |
| Brand guidelines gen | ✅ Brand program | ❌ | ❌ | ❌ |
| Video storyboard gen | ✅ Remotion program | ❌ | ❌ | ❌ |
| MCP config gen | ✅ MCP program | ❌ | ❌ | ❌ |
| Self-audit loop | ✅ YAML governance | ❌ | ❌ | ❌ |
| Deterministic output | ✅ 6 tests | ❌ | N/A | ❌ |
| Zero HTTP deps | ✅ Custom router | ❌ Express | ❌ Java | ❌ |

---

## Funnel Architecture

### Awareness → Activation → Revenue

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────┐
│  AWARENESS   │───▶│  ACQUISITION  │───▶│  ACTIVATION  │───▶│ REVENUE  │
│              │    │              │    │              │    │          │
│ - Content    │    │ - Free tier  │    │ - First      │    │ - Pro    │
│ - Social     │    │ - CLI install│    │   snapshot   │    │   unlock │
│ - Community  │    │ - GitHub     │    │ - View 13    │    │ - Per-   │
│ - Dev events │    │ - API key    │    │   free files  │    │   program│
└─────────────┘    └──────────────┘    └─────────────┘    └──────────┘
```

### Key Metrics Per Stage

| Stage | Metric | Target |
|-------|--------|--------|
| Awareness | Monthly unique visitors | 10,000 |
| Acquisition | Free tier signups / month | 500 |
| Activation | Users completing first snapshot | 60% of signups |
| Revenue | Free → Pro conversion | 8-12% |
| Retention | Monthly active (2+ snapshots) | 40% |

### Free Tier Strategy
The free tier is the product's moat. It delivers genuine value (Search + Debug + Skills = 13 generators) so users experience the output quality before paying. The free outputs include AGENTS.md and CLAUDE.md — files that make their AI tools immediately better. This creates a reference point: "If the free tier does this, what does Pro unlock?"

---

## Content Strategy

### Pillar Content (Long-Form)

| # | Title | Format | Channel | Goal |
|---|-------|--------|---------|------|
| 1 | "Why Your AI Coding Assistant Needs Better Context" | Blog post (2,000 words) | Blog, HN, Dev.to | Problem awareness |
| 2 | "87 Artifacts From One Upload: How AXIS Toolbox Works" | Technical deep-dive | Blog, YouTube | Product understanding |
| 3 | "The YAML Constitution: How We Built a Self-Governing AI System" | Architecture blog | Blog, HN | Technical credibility |
| 4 | "From 0 to 99.99% Coverage: Testing an 18-Program Generator" | Engineering blog | Blog, Dev.to | Developer respect |
| 5 | "Zero Dependencies: Why We Built Our Own HTTP Router" | Opinion piece | Blog, HN, Reddit | Philosophy alignment |

### Social Content Calendar (Monthly)

| Week | Monday | Wednesday | Friday |
|------|--------|-----------|--------|
| 1 | Program spotlight (thread) | Code snippet from generator | User story / case study |
| 2 | "Did you know" statistic | Architecture diagram | Community highlight |
| 3 | New feature announcement | Behind-the-scenes engineering | Comparison post |
| 4 | "How to" tutorial | YAML governance explainer | Monthly metrics update |

### Developer Community Touchpoints

| Channel | Content Type | Frequency |
|---------|-------------|-----------|
| GitHub Discussions | Support, feature requests | Daily |
| Discord / Slack | Real-time community | Daily |
| Hacker News | Launch posts, architecture blogs | Monthly |
| Dev.to | Tutorials, deep-dives | Bi-weekly |
| YouTube | Demo videos, architecture walkthroughs | Monthly |
| Twitter/X | Threads, quick updates | 3x/week |
| Reddit (r/programming, r/webdev) | Discussion, launches | Monthly |

---

## Email Sequences

### Sequence 1: Onboarding (Free Tier Signup)

| Day | Subject | Content |
|-----|---------|---------|
| 0 | Your first snapshot is ready | Welcome + link to generated artifacts. Highlight AGENTS.md. |
| 2 | 3 files that make Copilot 10x better | Tutorial: using AGENTS.md, CLAUDE.md, .cursorrules with their existing tools |
| 5 | Your debug playbook is waiting | Show debug-playbook.md value. "Found a bug faster? Tell us." |
| 10 | What 67 more generators look like | Preview of Pro outputs: Theme, Brand, Marketing. Show examples. |
| 15 | "We analyzed 500 repos this month" | Social proof + conversion CTA |

### Sequence 2: Pro Trial / Conversion

| Day | Subject | Content |
|-----|---------|---------|
| 0 | You just unlocked 73 more generators | Welcome to Pro. Guide to all 18 programs. |
| 3 | Your brand guidelines are generated | Highlight Brand program output. "Share with your designer." |
| 7 | Ship a video about your project | Remotion storyboard walkthrough |
| 14 | Your optimization rules are saving tokens | Cost savings report from Optimization program |
| 21 | You've generated [N] artifacts this month | Usage summary + renewal CTA |

### Sequence 3: Re-Engagement (30-Day Inactive)

| Day | Subject | Content |
|-----|---------|---------|
| 0 | Your codebase changed. Did your context? | Prompt to re-run analysis. "Repos drift. Context should keep up." |
| 5 | New: [Latest Feature] | Feature update. Show what they're missing. |
| 14 | We miss your snapshots | Final gentle nudge. Link to re-analyze. |

---

## Landing Page Copy

### Hero Section
**Headline**: 87 generators. 18 programs. One upload.
**Subhead**: AXIS Toolbox analyzes your codebase and generates structured intelligence — from agent instructions to brand guidelines to video storyboards.
**CTA**: Analyze your repo free →

### Value Props (3 columns)

| Column | Headline | Body |
|--------|----------|------|
| 1 | Make AI tools smarter | Generate AGENTS.md, CLAUDE.md, and .cursorrules that give your AI assistant real context about your codebase. |
| 2 | 87 artifacts, zero effort | From architecture diagrams to marketing copy to design tokens — all generated from a single snapshot of your repo. |
| 3 | Self-auditing quality | 83 of 83 capabilities at Grade A. 3,906 tests. 99.99% coverage. A system that checks its own work. |

### Social Proof Section
- "3,906 tests passing"
- "99.99% statement coverage"
- "83/83 capabilities at Grade A"
- "60+ languages detected"
- "0 external HTTP dependencies"

### Pricing Section

| | Free | Pro |
|-|------|-----|
| Programs | Search, Debug, Skills | All 18 programs |
| Generators | 14 | 87 |
| Outputs | AGENTS.md, debug playbook, context map | + Theme, Brand, Marketing, MCP, Obsidian, Remotion... |
| Snapshots | 5/month | Unlimited |
| Price | $0 | Per-program pricing |

---

## Launch Strategy

### Phase 1: Developer Preview (Current)
- Open beta with free tier
- Collect feedback on generator quality
- Build case studies from real repos

### Phase 2: Product Hunt Launch
- Timing: After v1.0 (all 82 capabilities Grade A)
- Assets needed: 60s demo video, 5 screenshots, maker comment
- Goal: Top 5 of the day

### Phase 3: Community Growth
- GitHub stars campaign
- "Analyze this repo" badge for READMEs
- Integration guides for Copilot, Cursor, Cody, Claude

### Phase 4: Enterprise
- Team accounts
- Self-hosted deployment option
- Custom program development
- SLA and audit logging
