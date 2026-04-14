# Channel Rulebook — axis-toolbox

Generated: 2026-04-14T05:01:49.158Z

## Project Overview

axis-toolbox is a monorepo built with TypeScript using React. It contains 500 files across 20 top-level directories. It defines 152 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

Channel-specific brand and content rules for consistent communication.

## Channel: Documentation

| Rule | Value |
|------|-------|
| Tone | Technical, precise, helpful |
| Person | Second person ("you") |
| Code examples | Required for every concept |
| Max paragraph length | 3 sentences |
| Key terms | AuthContext, EnvSpec, ValidationError, ValidationResult, ZipEntry |
| Emoji | None |
| CTA style | Inline links, "Learn more" |

## Channel: GitHub (README, Issues, PRs)

| Rule | Value |
|------|-------|
| Tone | Professional, direct, action-oriented |
| Format | Markdown with headers and code blocks |
| Issue templates | Use structured templates with sections |
| PR descriptions | What, Why, How, Testing |
| Labels | Use consistent label taxonomy |
| Response time target | < 24 hours |

## Channel: Social Media (Twitter/X)

| Rule | Value |
|------|-------|
| Tone | Confident, concise, technical-but-approachable |
| Max length | 280 chars (aim for < 200) |
| Hashtags | Max 2 per post |
| Branded hashtags | #axistoolbox, #BuiltWithaxistoolbox |
| Thread style | Numbered, each tweet self-contained |
| Media | Screenshot or GIF with every thread |

## Channel: LinkedIn

| Rule | Value |
|------|-------|
| Tone | Professional, thought-leadership, use cases |
| Format | Hook → Context → Insight → CTA |
| Max length | 1300 chars (pre-fold: 140 chars) |
| Media | Carousel or single image |
| Frequency | 2–3 posts per week |

## Channel: Email (Product Updates)

| Rule | Value |
|------|-------|
| Tone | Friendly, informative, value-first |
| Subject line | < 50 chars, benefit-driven |
| Preview text | < 90 chars, complements subject |
| CTA | Single primary CTA per email |
| Unsubscribe | Always visible, one-click |

## Channel: Contact & Support

| Rule | Value |
|------|-------|
| Tone | Empathetic, direct, solution-first |
| Auto-reply SLA | Acknowledge within 5 minutes |
| Resolution target | Define tiered SLAs (critical/high/normal) |
| Escalation path | In-app help → GitHub Issues → Email → Direct |
| Error messages | State what failed, why, and next step |
| Bug reports | Always acknowledge, provide issue tracker link |
| Feature requests | Thank + route to roadmap or GitHub Discussions |
| Billing issues | High priority SLA — respond within 2 business hours |

## Channel: In-App (UI Copy)

| Rule | Value |
|------|-------|
| Tone | Clear, scannable, action-oriented |
| Buttons | Verb + Object ("Create Snapshot", "Export Files") |
| Errors | What happened + What to do (never blame user) |
| Empty states | Explain value + CTA to get started |
| Loading | Skeleton screens over spinners |
| Confirmation | Always confirm destructive actions |

## Forbidden Patterns (All Channels)

- Never use "simple" or "easy" (dismisses complexity)
- Never use "just" before instructions (implies triviality)
- Never promise specific timelines for features
- Never use jargon without explanation on public channels
- Never use competitor names negatively

## Detected Public-Facing Files

These files should comply with channel rules:

- `examples/01-paid-platform/README.md` (947 bytes)
- `examples/02-axis-scalpel/README.md` (724 bytes)
- `examples/03-spacey/README.md` (748 bytes)
- `examples/04-slate-certification/README.md` (722 bytes)
