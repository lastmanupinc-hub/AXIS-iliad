# Hardening & Polish Audit (2026-06-21)

Multi-reviewer sweep (security · correctness/robustness · polish) over the
application source (`apps/api/src`, `apps/web/src`, `packages/*/src`). Generated
artifacts, tests, and `dist/` were out of scope. Items marked **✅ APPLIED** landed
in the `hardening/security-polish-pass` PR (verified: 2,276 tests green). The rest
is a prioritized backlog.

## ✅ Applied this pass (security + latent crash)
- **IDOR — version endpoints had no auth.** `apps/api/src/versions.ts` (`GET /v1/snapshots/:id/versions[/:n][/diff]`) returned other accounts' generated file content for any known/guessed snapshot id. Now loads the snapshot, 404s if absent, and enforces `assertSnapshotAccess` (same gate as `handleGetSnapshot`). *(CRITICAL)*
- **GitHub token leak on redirect.** `packages/snapshots/src/github.ts` reused the `Authorization: Bearer <token>` header across redirect hops to any host. Now: require HTTPS, validate the URL, and **strip the auth header on cross-host hops** (GitHub's codeload redirect is pre-signed). Also `encodeURIComponent`'d owner/repo/ref. *(HIGH)*
- **Timing-unsafe admin-key compare.** `admin.ts` / `billing.ts` compared `ADMIN_API_KEY` with `===`. Added `constantTimeEqual` (sha256 + `timingSafeEqual`) and used it for both the `/v1/admin/*` gate and `isAdminCaller`. *(HIGH)*
- **ESM `require()` crash in webhook dispatch.** `packages/snapshots/src/webhook-store.ts` used `require("node:https"/"node:http")` in a `"type": "module"` package — the first real production webhook POST would throw `require is not defined` (swallowed → silent delivery failure). Replaced with top-level imports. *(HIGH, latent)*

## ⏭ Recommended next (high value, need a decision/larger change)
- **✅ Billing charges before the work can fail — DONE (auth/capture split).** `meterMcpToolCredits` was committing the debit *before* failure-prone steps. Fixed via a `previewUsageCredits` (read-only gate) + `consumeUsageCredits` (commit) split: handlers **authorize** up front (rejects 402 over-allowance with *no write* — also fixes the allowance-boundary partial-charge) and **capture** only after the work succeeds. **All paid handlers now charge only on success:** `analyze_repo`, `analyze_files`, `prepare_agentic_purchasing`, `embeddings`, `transactional_email`, `llm_inference`, `object_storage`, `web_search`, `vector_database` (×2), `analytics` (×3), and `hygiene` converted to authorize→work→capture; `document_parsing`/`text_to_speech`/`speech_to_text`/`code_sandbox` already metered after the awaited work (and skip `_not_configured`), so they're correct as-is.
- **✅ Idempotency — DONE.** `tools/call` now honors an `Idempotency-Key` header: the first call runs + charges and its result is stored (per account, 24h TTL); a retry with the same key replays the stored result (`_idempotent_replay: true`) and **never re-charges**. A key reused with different arguments is rejected. Only successful results are stored, so a failed call (which doesn't charge) stays retryable. New `idempotency_keys` table (migration v24) + `idempotency-store.ts`. *(Billing-correctness track complete.)*
- **✅ SSRF in server-side URL fetch — DONE.** New `url-guard.ts` (`assertPublicUrl` + `safeFetch`): resolves the host and rejects loopback/link-local/private/CGNAT/metadata IPv4+IPv6 (incl. IPv4-mapped), refuses non-http(s), and re-validates every redirect hop with `redirect: "manual"`. Wired into `document-parsing.ts` and `speech-to-text.ts` (the caller-supplied-URL downloads). Added a 30s timeout to the embeddings provider call (its URL is operator-configured, not SSRF, but was unbounded). *Still open (lower priority):* stream the doc/STT body and abort at the size cap rather than `arrayBuffer()`-then-check (the Content-Length pre-check already covers the common case). *(HIGH → addressed)*
- **Session token in `localStorage` + OAuth key in URL.** `apps/web/src/api.ts` / `AccountPage.tsx` / `oauth.ts` — XSS-stealable bearer; raw key in the callback query string. Move to an `HttpOnly; Secure; SameSite` cookie + a one-time code exchange; at minimum `Referrer-Policy: no-referrer` on the callback. *(HIGH — bigger refactor)*
- **Rate-limit key trusts `X-Forwarded-For`.** `rate-limiter.ts:102` — spoofable to get a fresh bucket per request, bypassing the only throttle on `POST /v1/accounts`/webhooks/OAuth. Use a trusted-proxy-aware client IP. *(MEDIUM — needs proxy config)*
- **Unbounded PDF/DOCX parsing (DoS).** `document-parsing.ts` parses every page / runs mammoth with no cap/timeout on the main thread. Cap pages + wrap in a wall-clock timeout. *(MEDIUM)*

## ⏭ Correctness (smaller, mostly safe)
- **`iliad_code_sandbox` stdin is broken** — `code-sandbox.ts:308` pipes `code + stdin` as one stream, so runtime stdin is executed as source. Deliver source separately. *(MEDIUM)*
- **Domain-extractor drops fields on nested braces** — `repo-parser/src/domain-extractor.ts` `\{([^}]*)\}` stops at the first `}`; nested types under-report (affects the model count). Depth-count braces. *(MEDIUM)*
- **✅ `web_research`/`web_research_crawl` wired into the MCP dispatcher — DONE.** They were advertised in `tools/list` but missing from `tools/call` (callers got "Unknown tool"). Added `web-research.ts` (Firecrawl scrape/crawl core + `_not_configured` envelope) and `runWebResearch`/`runWebResearchCrawl`, metering after success (the meter-after pattern), plus the two `MeteredMcpTool` entries. MCP bills flat-per-call like every other MCP tool; the REST `/v1/research/*` path keeps its per-page x402 billing. *(MEDIUM → addressed; follow-up polish: dedupe the Firecrawl fetch now shared in shape with `handlers.ts`)*
- `resolveImportPath` mis-handles root-file relative imports (`import-resolver.ts:51`); `paid-client.ts:124` `JSON.parse` should throw `PaidError`; `applyReferralDiscount` always returns 0 (dead). *(LOW)*

## ⏭ Polish (zero/low risk — quick wins)
- Dead code: `filterGeneratorsByEntitlement` (`mcp-server.ts`, never called); duplicate OPTIONS-preflight block (`router.ts:288-293`); identical `if/else` arms (`App.tsx:270-274`); always-true `tokens.length >= 2` guard (`domain-extractor.ts:73`); likely-dead `oauth-server-simple.ts` (verify first).
- Unused imports: `MCP_TOOL_COUNT` (`mcp-server.ts`), `downloadExport` (`ProgramLauncher.tsx`), `Account`/`scope` (`oauth-server.ts`).
- Stale strings: `handlePaidSubscribe` doc comment describes the dead inline-Elements path (returns `checkout_url` now); `v0.5.0` in `App.tsx`/`StatusBar.tsx` vs `0.5.3`; hardcoded `"0.5.3"` API version duplicated ~10× (extract `API_VERSION`); program-count copy drift ("17"/"18"/"19" vs 20).
- Consistency: extract shared `ffmpeg-path`/`spawnWithTimeout` (STT/TTS dup), `scopeAccountNamespace` (vector-db/web-search dup), `extractRawKey` (billing dup); add `to_tsvector`-style grade helper reuse (`generators-agentic-purchasing.ts`).
- Types: validate the GitHub token response in `oauth-store.ts:69` instead of `as unknown as`; add `getFw` return type; drop redundant `&& !== -1` (`PlansPage.tsx:219`); remove production `console.log` in `api.ts`/`UploadPage.tsx`.

## ⚠ Flagged — behavior-change risk, confirm before touching
- Operator precedence in the Python field parser (`domain-extractor.ts:171`, `A || B && C`) — parenthesize to lock current behavior; changing grouping alters parsing.
- Stripe error-code mismatch (`INTERNAL_ERROR` vs `UPSTREAM_ERROR`) — may be asserted in tests/consumed by the frontend.

## Overall posture
Above-average and security-conscious: API keys hashed at rest, tokens AES-256-GCM encrypted (prod refuses the dev fallback), all four webhook integrations verify signatures with `timingSafeEqual` + replay windows, the Docker sandbox is genuinely isolated, SQL is fully parameterized, most snapshot handlers enforce ownership. The applied fixes close the worst gaps (unauth IDOR, token-leak redirect, timing-unsafe admin key, latent webhook crash). The top remaining theme is **billing correctness** (charge-before-success + no idempotency) — recommended as the next focused PR.
