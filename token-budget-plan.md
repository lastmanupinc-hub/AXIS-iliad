# Token Budget Plan — axis-toolbox

Generated: 2026-04-14T01:46:20.585Z

## Project Token Profile

| Metric | Value |
|--------|-------|
| Total LOC | 112,861 |
| Total Files | 496 |
| Est. Total Tokens | 507,875 |
| Avg Tokens/File | 1,024 |

## Token Budget by Language

| Language | LOC | Tokens | % of Budget |
|----------|-----|--------|-------------|
| TypeScript | 78,309 | 352,391 | 69.4% |
| JSON | 12,409 | 55,841 | 11.0% |
| YAML | 10,865 | 48,893 | 9.6% |
| Markdown | 9,559 | 43,016 | 8.5% |
| CSS | 849 | 3,821 | 0.8% |
| JavaScript | 673 | 3,029 | 0.6% |
| HTML | 113 | 509 | 0.1% |
| Dockerfile | 49 | 221 | 0.0% |
| PowerShell | 21 | 95 | 0.0% |
| Shell | 14 | 63 | 0.0% |

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
| Hotspot refactor (6 hotspots, avg 923 tok each) | 12,000 | 1,500 | 3 | $2.97 |
| Domain model change (151 models) | 8,000 | 2,500 | 2 | $1.98 |
| Documentation | 25,394 | 1,500 | 2 | $3.45 |

> Token estimates derived from detected project signals: routes, hotspots, domain models, and average file size.

## Source-Verified Token Estimate

- Source files scanned: 500
- Total source lines: 135,331
- Estimated tokens: ~608,990
