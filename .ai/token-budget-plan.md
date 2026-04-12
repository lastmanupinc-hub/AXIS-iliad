# Token Budget Plan — axis-toolbox

Generated: 2026-04-11T22:24:48.051Z

## Project Token Profile

| Metric | Value |
|--------|-------|
| Total LOC | 93,769 |
| Total Files | 428 |
| Est. Total Tokens | 421,961 |
| Avg Tokens/File | 986 |

## Token Budget by Language

| Language | LOC | Tokens | % of Budget |
|----------|-----|--------|-------------|
| TypeScript | 66,752 | 300,384 | 71.2% |
| YAML | 14,963 | 67,334 | 16.0% |
| JSON | 6,426 | 28,917 | 6.9% |
| Markdown | 3,944 | 17,748 | 4.2% |
| CSS | 849 | 3,821 | 0.9% |
| JavaScript | 673 | 3,029 | 0.7% |
| HTML | 113 | 509 | 0.1% |
| Dockerfile | 49 | 221 | 0.1% |

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
| API endpoint work (387 routes detected) | 8,000 | 2,000 | 5 | $4.40 |
| Hotspot refactor (6 hotspots, avg 873 tok each) | 12,000 | 1,500 | 3 | $2.97 |
| Domain model change (131 models) | 8,000 | 2,500 | 2 | $1.98 |
| Documentation | 21,098 | 1,500 | 2 | $2.98 |

> Token estimates derived from detected project signals: routes, hotspots, domain models, and average file size.

## Source-Verified Token Estimate

- Source files scanned: 432
- Total source lines: 112,878
- Estimated tokens: ~507,951
