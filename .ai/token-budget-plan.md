# Token Budget Plan — axis-iliad

Generated: 2026-05-22T17:35:44.954Z

## Project Token Profile

| Metric | Value |
|--------|-------|
| Total LOC | 119,856 |
| Total Files | 485 |
| Est. Total Tokens | 539,352 |
| Avg Tokens/File | 1,112 |

## Token Budget by Language

| Language | LOC | Tokens | % of Budget |
|----------|-----|--------|-------------|
| TypeScript | 90,421 | 406,895 | 75.4% |
| YAML | 9,885 | 44,483 | 8.2% |
| JSON | 8,478 | 38,151 | 7.1% |
| Markdown | 8,125 | 36,563 | 6.8% |
| JavaScript | 2,093 | 9,419 | 1.7% |
| CSS | 675 | 3,038 | 0.6% |
| HTML | 158 | 711 | 0.1% |
| Dockerfile | 21 | 95 | 0.0% |

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
| API endpoint work (497 routes detected) | 8,000 | 2,000 | 5 | $4.40 |
| Hotspot refactor (7 hotspots, avg 1287 tok each) | 12,000 | 1,500 | 3 | $2.97 |
| Domain model change (243 models) | 8,000 | 2,500 | 2 | $1.98 |
| Documentation | 26,968 | 1,500 | 2 | $3.63 |

> Token estimates derived from detected project signals: routes, hotspots, domain models, and average file size.

## Source-Verified Token Estimate

- Source files scanned: 500
- Total source lines: 153,329
- Estimated tokens: ~689,981
