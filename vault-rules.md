# Vault Rules — axis-toolbox

> Governance rules for maintaining a clean, linked knowledge vault

## Project Overview

axis-toolbox is a monorepo built with TypeScript using React. It contains 500 files across 20 top-level directories. It defines 152 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Notes | Title Case, descriptive | `API Authentication Design.md` |
| Daily notes | ISO date | `2026-04-03.md` |
| ADRs | Numbered prefix | `ADR-001 Database Choice.md` |
| Templates | Prefixed | `Template - Daily Note.md` |
| Tags | lowercase, hyphenated | `#code-review`, `#architecture` |
| Folders | PascalCase | `MeetingNotes/`, `ADRs/` |

## Tagging System

### Required Tags

Every note must have at least one of:

| Tag | When to Use |
|-----|-----------|
| `#project/axis-toolbox` | Anything related to this project |
| `#decision` | Architecture or design decisions |
| `#bug` | Bug reports and investigations |
| `#feature` | Feature specifications |
| `#meeting` | Meeting notes |
| `#retrospective` | Retrospective notes |
| `#reference` | External references and resources |
| `#prompt` | AI prompt templates |

## Linking Rules

1. **Always link to the project note** — Every project-related note must include `[[axis-toolbox]]`
2. **Link decisions to context** — ADRs must link to the notes that prompted them
3. **Link bugs to code areas** — Bug notes should reference the affected module or file
4. **Cross-link related notes** — If two notes discuss the same topic, link them
5. **Use aliases for common references** — Add YAML frontmatter aliases for frequently linked notes

## Frontmatter Standard

All notes should include YAML frontmatter:

```yaml
---
created: {{date:YYYY-MM-DD}}
updated: {{date:YYYY-MM-DD}}
tags:
  - project/axis-toolbox
  - [additional tags]
status: [draft | active | archived]
---
```

## Maintenance Rules

- **Weekly**: Review orphan notes (no incoming links) — link or archive them
- **Weekly**: Review `#draft` notes — promote or delete
- **Monthly**: Archive stale notes older than 90 days with no updates
- **Monthly**: Review tag usage — merge redundant tags
- **Per session**: Update daily note with changes made

## Existing Markdown Files

Found 107 markdown files in the project — candidates for vault import.
