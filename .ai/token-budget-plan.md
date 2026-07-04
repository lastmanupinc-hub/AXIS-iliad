# Token Budget Plan — axis-iliad

Generated: 1970-01-01T00:00:00.000Z

## Project Token Profile

| Metric | Value |
|--------|-------|
| Total LOC | 115,124 |
| Total Files | 500 |
| Est. Total Tokens | 518,058 |
| Avg Tokens/File | 1,036 |

## Token Budget by Language

| Language | LOC | Tokens | % of Budget |
|----------|-----|--------|-------------|
| TypeScript | 89,597 | 403,187 | 80.0% |
| YAML | 10,597 | 47,687 | 9.5% |
| Markdown | 6,295 | 28,328 | 5.6% |
| JavaScript | 2,273 | 10,229 | 2.0% |
| JSON | 1,922 | 8,649 | 1.7% |
| CSS | 1,149 | 5,171 | 1.0% |
| HTML | 158 | 711 | 0.1% |
| Dockerfile | 21 | 95 | 0.0% |

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
| API endpoint work (540 routes detected) | 8,000 | 2,000 | 5 | $4.40 |
| Hotspot refactor (20 hotspots, avg 4032 tok each) | 12,000 | 1,500 | 3 | $2.97 |
| Domain model change (242 models) | 8,000 | 2,500 | 2 | $1.98 |
| Documentation | 25,903 | 1,500 | 2 | $3.51 |

> Token estimates derived from detected project signals: routes, hotspots, domain models, and average file size.

## Source-Verified Token Estimate

- Source files scanned: 500
- Total source lines: 138,726
- Estimated tokens: ~624,267


---

## ⟳ Continue the loop

- **You are here:** `token-budget-plan.md` — agent step 56 of 70.
- **Next:** `channel-rulebook.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
