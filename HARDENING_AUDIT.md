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
- **✅ Billing charges before the work can fail — DONE (auth/capture split).** `meterMcpToolCredits` was committing the debit *before* failure-prone steps. Fixed via a `previewUsageCredits` (read-only gate) + `consumeUsageCredits` (commit) split: handlers now **authorize** up front (rejects 402 over-allowance with *no write* — also fixes the allowance-boundary partial-charge) and **capture** only after the work succeeds. Applied to the flagged money-losers (`analyze_repo`, `embeddings`, `transactional_email`, `llm_inference`). *Still open:* convert the remaining fallible handlers (`object_storage`, `document_parsing`, `web_search`, `tts`/`stt`, `code_sandbox`, `vector_database`) to the same pattern, and add **idempotency** on the paid path (retries still double-charge). *(HIGH — real money)*
- **SSRF in server-side URL fetch.** `document-parsing.ts`, `speech-to-text.ts` fetch a caller-supplied URL after only an `http(s)` check → reach `169.254.169.254` (cloud creds), localhost, RFC1918. Add a host guard (reject loopback/link-local/private/metadata; `redirect: "manual"` + re-validate hops) and fetch timeouts + streaming size caps (embeddings has no timeout; doc/STT buffer before the size check → OOM). *(HIGH)*
- **Session token in `localStorage` + OAuth key in URL.** `apps/web/src/api.ts` / `AccountPage.tsx` / `oauth.ts` — XSS-stealable bearer; raw key in the callback query string. Move to an `HttpOnly; Secure; SameSite` cookie + a one-time code exchange; at minimum `Referrer-Policy: no-referrer` on the callback. *(HIGH — bigger refactor)*
- **Rate-limit key trusts `X-Forwarded-For`.** `rate-limiter.ts:102` — spoofable to get a fresh bucket per request, bypassing the only throttle on `POST /v1/accounts`/webhooks/OAuth. Use a trusted-proxy-aware client IP. *(MEDIUM — needs proxy config)*
- **Unbounded PDF/DOCX parsing (DoS).** `document-parsing.ts` parses every page / runs mammoth with no cap/timeout on the main thread. Cap pages + wrap in a wall-clock timeout. *(MEDIUM)*

## ⏭ Correctness (smaller, mostly safe)
- **`iliad_code_sandbox` stdin is broken** — `code-sandbox.ts:308` pipes `code + stdin` as one stream, so runtime stdin is executed as source. Deliver source separately. *(MEDIUM)*
- **Domain-extractor drops fields on nested braces** — `repo-parser/src/domain-extractor.ts` `\{([^}]*)\}` stops at the first `}`; nested types under-report (affects the model count). Depth-count braces. *(MEDIUM)*
- **`web_research`/`web_research_crawl` advertised in `tools/list` but missing from the `tools/call` dispatcher** — MCP callers get "Unknown tool". Wire the cases or drop the schemas. *(MEDIUM)*
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
