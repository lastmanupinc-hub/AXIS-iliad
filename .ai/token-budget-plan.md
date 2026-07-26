# Token Budget Plan — axis-iliad

Generated: 1970-01-01T00:00:00.000Z

## Project Token Profile

| Metric | Value |
|--------|-------|
| Total LOC | 108,805 |
| Total Files | 500 |
| Est. Total Tokens | 489,623 |
| Avg Tokens/File | 979 |

## Token Budget by Language

| Language | LOC | Tokens | % of Budget |
|----------|-----|--------|-------------|
| TypeScript | 73,592 | 331,164 | 72.0% |
| YAML | 12,895 | 58,028 | 12.6% |
| Markdown | 8,954 | 40,293 | 8.8% |
| JSON | 2,991 | 13,460 | 2.9% |
| JavaScript | 1,815 | 8,168 | 1.8% |
| CSS | 1,744 | 7,848 | 1.7% |
| HTML | 172 | 774 | 0.2% |
| PowerShell | 39 | 176 | 0.0% |
| Shell | 38 | 171 | 0.0% |
| Dockerfile | 22 | 99 | 0.0% |

## Context Window Allocation

| Model | Context Window | Repo Fits | Recommended Strategy |
|-------|---------------|-----------|----------------------|
| GPT-4o | 128K | ❌ No | Chunked / RAG approach |
| Claude Sonnet 4 | 200K | ❌ No | Selective file context |
| Claude Opus 4 | 200K | ❌ No | Selective file context |
| Gemini 2.5 Pro | 1M | ✅ Yes | Full repo context |

## Budget Allocation Strategy

### Recommended Context Packing Order

1. **System prompt + instructions** (~500 tokens)
2. **Architecture summary** (~800 tokens)
3. **Relevant file contents** (variable)
4. **Type definitions** (~200 tokens per interface)
5. **Test context** (~300 tokens per test file)
6. **User query** (~100 tokens)

### Cost Optimization Rules

1. **Never send the entire repo** when a subset suffices
2. **Prioritize type definitions** over implementation details
3. **Include test files** only when debugging test failures
4. **Trim comments and blank lines** from context (saves ~15% tokens)
5. **Cache repeated context** across multi-turn conversations

## Daily Budget Estimates

| Operation | Input | Output | Daily | Monthly Cost (GPT-4o) |
|-----------|-------|--------|-------|----------------------|
| Code review (1 file) | 1,500 | 500 | 10 | $1.93 |
| API endpoint work (591 routes detected) | 8,000 | 2,000 | 5 | $4.40 |
| Hotspot refactor (20 hotspots, avg 4775 tok each) | 12,000 | 1,500 | 3 | $2.97 |
| Domain model change (278 models) | 8,000 | 2,500 | 2 | $1.98 |
| Documentation | 24,481 | 1,500 | 2 | $3.35 |

> Token estimates derived from detected project signals: routes, hotspots, domain models, and average file size.

## Source-Verified Token Estimate (cross-check)

- Source files scanned: 500
- Total physical lines (incl. blanks + comments): 137,817
- Estimated tokens (physical-line basis): ~620,177

> Cross-check only. The headline **489,623** tokens is from code LOC (108,805) and is the budgeting number; this 620,177 counts every physical line (blanks + comments) of the 500 scanned files, so it's higher.


---

## ⟳ Continue the loop

- **You are here:** `token-budget-plan.md` — agent step 57 of 71.
- **Next:** `channel-rulebook.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
