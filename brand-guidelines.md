# Brand Guidelines — axis-toolbox

> Brand identity and communication standards for axis-toolbox

## Project Overview

axis-toolbox is a monorepo built with TypeScript using React. It contains 466 files across 21 top-level directories. It defines 146 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Brand Identity

**Product Name:** axis-toolbox
**Category:** monorepo
**Primary Technology:** TypeScript
**Description:** AI-native development operating system. Upload or point at any codebase — get 87 generated artifacts across 18 specialized programs: context maps, debug playbooks, governance files, design tokens, SEO analysis, brand systems, and more.

## Positioning

axis-toolbox is a monorepo built with TypeScript.

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
| Product name | Capitalized | axis-toolbox |
| Feature names | Sentence case | "Context analysis" |
| CLI commands | kebab-case | `generate-report` |
| API endpoints | kebab-case | `/v1/search/export` |
| Config keys | snake_case | `max_file_size` |
| Environment vars | SCREAMING_SNAKE | `AXIS_DB_PATH` |

## Existing Brand Assets

- `CONTRIBUTING.md` (3217 bytes)
- `examples/01-paid-platform/README.md` (947 bytes)
- `examples/02-axis-scalpel/README.md` (724 bytes)
- `examples/03-spacey/README.md` (748 bytes)
