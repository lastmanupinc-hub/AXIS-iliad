# Voice & Tone — axis-toolbox

> Context-sensitive tone guidance for every communication surface

## Project Overview

axis-toolbox is a monorepo built with TypeScript using React. It contains 466 files across 21 top-level directories. It defines 146 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Tone Spectrum

The voice stays constant (clear, confident, helpful). The **tone** adapts to context:

```
Casual ──────────────────────────────────────── Formal
         Blog    Docs    UI    API    Error
         posts   guides  copy  docs   messages
```

## Tone by Context

### Celebration / Success

- Tone: Warm, brief, affirming
- Do: "Done. 8 files generated."
- Don't: "Congratulations! Your amazing files have been successfully created!"
- Rule: Acknowledge without over-celebrating. The user's goal was the work, not the notification.

### Error / Failure

- Tone: Direct, calm, solution-oriented
- Do: "Upload failed — file exceeds 10MB limit. Reduce file size or exclude binary assets."
- Don't: "Oops! Something went wrong."
- Rule: Name the problem, explain why, give the next step. Never blame the user.

### Onboarding / First Use

- Tone: Welcoming, clear, low-pressure
- Do: "Upload a project snapshot to get started. You'll receive a full context analysis."
- Don't: "Welcome to the most powerful analysis platform ever created!"
- Rule: Show the first action. Don't sell — let the product demonstrate value.

### Technical Documentation

- Tone: Precise, neutral, structured
- Do: "The `buildContextMap()` function accepts a `SnapshotRecord` and returns a `ContextMap`."
- Don't: "You can easily use buildContextMap to get cool context data."
- Rule: Use exact types, function names, and parameter names. Skip adjectives.

### Loading / In-Progress

- Tone: Informative, patient
- Do: "Analyzing 237 files..." → "Detecting frameworks..." → "Generating outputs..."
- Don't: "Please wait while we process your request."
- Rule: Describe the current step. Give the user a mental model of progress.

### Empty States

- Tone: Oriented, actionable
- Do: "No snapshots yet. Upload a project to see analysis results here."
- Don't: "Nothing to display."
- Rule: Explain what will appear and how to make it appear.

## Writing Checklist

Before publishing any user-facing text:

- [ ] Is it clear on first read?
- [ ] Can any words be removed without losing meaning?
- [ ] Does it tell the user what to do next?
- [ ] Is the tone appropriate for the context (error, success, docs, UI)?
- [ ] Are technical terms used correctly and consistently?
- [ ] Would a new user understand this without prior context?

## Documentation Tone Samples

Found 81 documentation files to audit for tone consistency.

- `AGENTS.md`
- `architecture-summary.md`
- `artifact-spec.md`
- `AXIS_Board_Pitch.md`
- `AXIS_DEMO_REPORT.md`
- `brand-guidelines.md`
