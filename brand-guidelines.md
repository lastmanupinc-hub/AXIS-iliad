# AXIS Toolbox — Brand Guidelines

## Brand Identity

### Name
**AXIS Toolbox**

### Tagline
*The operating system for AI-native development.*

### One-Liner
Analyze any codebase. Generate 87 structured artifacts across 18 programs. Make AI coding tools measurably more effective.

### What AXIS Toolbox IS
- A development intelligence platform
- A structured knowledge extractor for codebases
- A multi-program generator that produces actionable artifacts
- A self-governing system with 12 YAML constitutional files
- An operating system layer between developers and AI coding tools

### What AXIS Toolbox IS NOT
- Not an IDE or editor
- Not a code generation tool (it generates *about* code, not *more* code)
- Not a static analysis linter
- Not a CI/CD pipeline
- Not a competitor to GitHub Copilot — it makes Copilot better

---

## Brand Voice

### Tone: Operator
The voice of AXIS Toolbox is **operator-grade**: precise, authoritative, unadorned. It speaks like mission control — every word serves a function.

| Attribute | Description |
|-----------|-------------|
| **Precise** | Numbers over adjectives. "99.99% coverage" not "really well tested" |
| **Authoritative** | Earned through 3,906 tests and 83/83 Grade A capabilities |
| **Direct** | Commands, not suggestions. "Run `axis analyze .`" not "You might want to try..." |
| **Technical** | Respects the intelligence of the audience. No dumbing down |
| **Restrained** | No exclamation marks in product copy. No emoji in docs. Power is quiet |

### Voice Examples

| Context | Wrong | Right |
|---------|-------|-------|
| Feature description | "Our amazing AI-powered analysis engine!" | "Snapshot ingestion: 5 input methods, 87 generators, deterministic output." |
| Error message | "Oops! Something went wrong" | "Snapshot ingestion failed: missing package.json at project root" |
| Marketing headline | "Supercharge your development workflow!" | "87 generators. 18 programs. One upload." |
| Capability claim | "Best-in-class code analysis" | "83 of 83 capabilities at Grade A. Evidence-verified." |

### Vocabulary

#### Preferred Terms
| Use | Instead Of |
|-----|-----------|
| Snapshot | Scan, analysis |
| Generator | Template, output |
| Program | Module, feature, tool |
| Invariant | Rule, constraint |
| Grade (A/B/F) | Score, rating |
| Evidence | Proof, verification |
| Governance | Configuration |
| Artifact | File, output, deliverable |
| Intake | Import, upload |
| Vertical | Feature area, domain |

#### Banned Terms
- "AI-powered" (overused, meaningless)
- "Revolutionary" / "Game-changing"
- "Seamlessly" / "Effortlessly"
- "Leverage" (as verb in marketing)
- "Cutting-edge" / "State-of-the-art"
- "Robust" (say what it actually does)
- "Enterprise-grade" (prove it with numbers instead)

---

## Brand Positioning

### Market Position
AXIS Toolbox sits in a category it's creating: **AI Development Intelligence**. Not DevOps. Not DevTools. Not AI coding assistants. The layer *beneath* all of those.

### Positioning Statement
For developers and AI-native teams who need structured context from their codebases, AXIS Toolbox is the development intelligence platform that analyzes repositories and generates 87 specialized artifacts across 18 programs. Unlike static analysis tools that find bugs, or AI assistants that write code, AXIS Toolbox produces the structured knowledge that makes every other tool in the chain more effective.

### Competitive Landscape

| Category | Example Tools | How AXIS Differs |
|----------|--------------|-----------------|
| AI Code Assistants | Copilot, Cursor, Cody | AXIS feeds these. It generates the context files they consume |
| Static Analysis | ESLint, SonarQube | AXIS analyzes architecture, not syntax. Programs > rules |
| Documentation | Mintlify, ReadMe | AXIS generates 87 artifact types, not just docs |
| DevOps Intelligence | LinearB, Sleuth | AXIS operates at repo level, not workflow/deployment level |
| Code Search | Sourcegraph, grep.app | AXIS produces structured outputs, not search results |

### Differentiators (Evidence-Backed)

| Claim | Evidence |
|-------|---------|
| Self-governing AI system | 12 YAML constitutional files enforce behavior at every layer |
| Deterministic generators | 6 dedicated determinism tests verify byte-identical output |
| Zero external runtime dependencies | Custom HTTP router, no Express/Fastify/Koa. Verified in package.json |
| Quantified quality | 83/83 capabilities at Grade A, continuous self-audit via automated_remedial_action.yaml |
| Comprehensive generation | 87 generators across 18 programs, each with specific output contract |

---

## Brand Architecture

### Product Hierarchy
```
AXIS Toolbox (Platform)
├── Free Tier
│   ├── Axis Search (4 generators)
│   ├── Axis Skills (5 generators)
│   └── Axis Debug (4 generators)
│
└── Pro Tier
    ├── Axis Frontend + SEO (5 generators)
    ├── Axis Theme (3 generators)
    ├── Axis Brand (4 generators)
    ├── Axis Notebook (4 generators)
    ├── Axis Artifacts (5 generators)
    ├── Axis Optimization (4 generators)
    ├── Axis Marketing (6 generators)
    ├── Axis MCP (4 generators)
    ├── Axis Obsidian (5 generators)
    ├── Axis Superpowers (4 generators)
    ├── Axis Remotion (5 generators)
    ├── Axis Canvas (4 generators)
    └── Axis Algorithmic (5 generators)
```

### Naming Convention
- Platform: **AXIS Toolbox**
- Programs: **Axis [Name]** (e.g., Axis Search, Axis Brand)
- Owner: **Last Man Up Inc.**
- Internal codename: axis-toolbox

---

## Visual Identity

### Color System
- **Primary Palette**: Midnight command — dark backgrounds (#0d1117), cyan accent (#58a6ff), orange signal (#d29922)
- **Theme Name**: midnight_command
- **Alternate**: precision_white (light, for print/export)
- See `.ai/design-tokens.json` for full token specification

### Design Characteristics
1. **Control Room Clarity** — Every visual element serves information delivery
2. **Premium Restraint** — No gradients, no decorative elements, no visual noise
3. **Modular Surfaces** — Cards and panels with clear hierarchy via elevation
4. **Disciplined Signaling** — Cyan for interactive/linked, orange for attention/warning. Never mixed arbitrarily

### Logo Usage
- Wordmark: "AXIS" in semibold, "Toolbox" in regular weight
- Monogram: "AX" lettermark for compact contexts (favicons, badges)
- Always on dark backgrounds preferred. Precision white variant exists
- Minimum clear space: 1× the height of the "A" on all sides

### Imagery Guidelines
- **Screenshots**: Always dark theme, real data (never lorem ipsum)
- **Diagrams**: ASCII-style preferred for technical docs, SVG for marketing
- **Icons**: Outline style, 1.5px stroke, consistent with Lucide/Heroicons outline sets
- **No stock photography**. Product screenshots and architecture diagrams only

---

## Content Guidelines

### Documentation
- Start with what the reader needs to do, not what the system is
- Code examples must be runnable as-is
- Every configuration option needs a default value documented
- API endpoints include curl example, TypeScript example, and response schema

### Error Messages
Format: `[Component] [Action] failed: [specific reason]`
Example: `Snapshot ingestion failed: ZIP archive exceeds 50MB limit`

### Changelog Entries
Format: `[Category] [Description] ([scope])`
Example: `feat: Add Go Chi framework detection (repo-parser)`

### Commit Messages
Format: Conventional Commits — `type(scope): description`
Example: `fix(generator-core): deterministic output for markdown tables`
