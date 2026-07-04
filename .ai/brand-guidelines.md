# Brand Guidelines — axis-iliad

> Brand identity and communication standards for axis-iliad

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 16 top-level directories. It defines 242 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Brand Identity

**Product Name:** axis-iliad
**Category:** monorepo
**Primary Technology:** TypeScript
**Description:** > **Axis' Iliad — The modern epic that shapes raw codebases into canonical, agent-ready artifacts. Axis' Iliad authors the definitive foundation for the next era of natural-language workspace development.**

## Positioning

axis-iliad is a monorepo built with TypeScript.

**Target Audience:** Technical users and developers.

## Voice Attributes

| Attribute | Description | Do | Don't |
|-----------|-------------|-----|-------|
| Clear | Say exactly what you mean | Use plain language | Use jargon without context |
| Confident | State facts directly | "This does X" | "This might help with X" |
| Helpful | Anticipate the next question | Provide examples | Leave the user guessing |
| Technical | Respect the audience's skill | Use correct terminology | Over-simplify for experts |
| Concise | Respect the reader's time | Get to the point | Add filler paragraphs |

## Communication Standards

### Documentation

- Lead with what the user can do, not how the code works internally
- Every page should have a clear "what", "why", and "how" structure
- Code examples must be copy-paste ready and tested
- Use imperative mood for instructions: "Run the command" not "You should run the command"

### Error Messages

- State what happened, why, and what the user can do about it
- Include the specific value that caused the error when safe to do so
- Never show raw stack traces to end users
- Format: `[What went wrong]. [Why]. [What to do next].`

### UI Copy

- Button labels: use verbs ("Save", "Export", "Generate") not nouns
- Empty states: explain what will appear and how to get there
- Loading states: describe what's happening ("Analyzing repository...")
- Success states: confirm what happened ("3 files generated")

### API Responses

- Error responses include `error` (human-readable) and machine-parseable status codes
- Success responses include the created/modified resource
- Use consistent field naming (snake_case)
- Include `timestamp` in all responses for debugging

## Stack-Specific Application

This project uses: React

- Component names should be descriptive and PascalCase
- User-facing strings should be extractable for i18n readiness
- Use aria-labels that match the brand voice (clear, concise)

## Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Product name | Capitalized | axis-iliad |
| Feature names | Sentence case | "Context analysis" |
| CLI commands | kebab-case | `generate-report` |
| API endpoints | kebab-case | `/v1/search/export` |
| Config keys | snake_case | `max_file_size` |
| Environment vars | SCREAMING_SNAKE | `AXIS_DB_PATH` |

## Existing Brand Assets

- `.github/actions/context-freshness/README.md` (5411 bytes)
- `CONTRIBUTING.md` (6516 bytes)
- `README.md` (17793 bytes)
- `docs/agentic-asset/README.md` (2807 bytes)


---

## ⟳ Continue the loop

- **You are here:** `brand-guidelines.md` — agent step 15 of 70.
- **Next:** `voice-and-tone.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
