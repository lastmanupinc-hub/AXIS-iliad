# Token Budget Plan — axis-toolbox

Generated: 2026-04-14T00:32:39.337Z

## Project Token Profile

| Metric | Value |
|--------|-------|
| Total LOC | 105,772 |
| Total Files | 461 |
| Est. Total Tokens | 475,974 |
| Avg Tokens/File | 1,032 |

## Token Budget by Language

| Language | LOC | Tokens | % of Budget |
|----------|-----|--------|-------------|
| TypeScript | 77,996 | 350,982 | 73.7% |
| YAML | 15,388 | 69,246 | 14.5% |
| JSON | 6,549 | 29,471 | 6.2% |
| Markdown | 4,155 | 18,698 | 3.9% |
| CSS | 849 | 3,821 | 0.8% |
| JavaScript | 673 | 3,029 | 0.6% |
| HTML | 113 | 509 | 0.1% |
| Dockerfile | 49 | 221 | 0.0% |

## Context Window Allocation

| Model | Context Window | Repo Fits | Recommended Strategy |
|-------|---------------|-----------|----------------------|
| GPT-4o | 128K | ❌ No | Chunked / RAG approach |
| Claude 3.5 Sonnet | 200K | ❌ No | Selective file context |
| Claude Opus 4 | 200K | ❌ No | Selective file context |
| Gemini 1.5 Pro | 1000K | ✅ Yes | Full repo context |

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
| API endpoint work (428 routes detected) | 8,000 | 2,000 | 5 | $4.40 |
| Hotspot refactor (6 hotspots, avg 918 tok each) | 12,000 | 1,500 | 3 | $2.97 |
| Domain model change (146 models) | 8,000 | 2,500 | 2 | $1.98 |
| Documentation | 23,799 | 1,500 | 2 | $3.28 |

> Token estimates derived from detected project signals: routes, hotspots, domain models, and average file size.

## Source-Verified Token Estimate

- Source files scanned: 466
- Total source lines: 127,165
- Estimated tokens: ~572,243
