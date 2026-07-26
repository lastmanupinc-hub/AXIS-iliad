# Session Cookie Cutover

> **ARCHIVED 2026-07-26:** all stages below shipped in H1. The `localStorage`
> fallback has been removed from the frontend — **do not reintroduce it.**
> Web auth is the `HttpOnly axis_session` cookie only.

Moving the browser session off an XSS-stealable `localStorage` bearer onto an
`HttpOnly; Secure; SameSite=Lax` cookie. Done in stages so nothing breaks
mid-flight. Tracks the **HIGH** item in `HARDENING_AUDIT.md` ("Session token in
`localStorage` + OAuth key in URL").

## Stage A — backend plumbing (this PR, `harden/session-cookie-plumbing`) ✅
- `resolveAuth` (`billing.ts`) now accepts the API key from an `axis_session`
  **HttpOnly** cookie as a fallback, **after** `Authorization` / `X-Axis-Key`.
  Additive: API clients (MCP, CLI) are unchanged; the cookie is only consulted
  when no auth header is present.
- `POST /v1/auth/exchange` (`oauth.ts`) now **sets** the `axis_session` cookie
  (`HttpOnly; SameSite=Lax; Path=/; Max-Age=30d`; `Secure` when `AXIS_WEB_URL`
  is HTTPS) in addition to returning the key in the body.
- `POST /v1/auth/logout` (new) clears the cookie server-side (an `HttpOnly`
  cookie can't be cleared by JS).

**No behavior change yet for the browser:** the cookie is only sent on
*same-site* requests. Today the web app (`iliad.trustfabric.ai`) and the API
(`axis-api-6c7z.onrender.com`) are **cross-site**, so the browser won't attach
the cookie and the app keeps using the body key. Stage A is safe to ship now.

## Stage B — serve the API same-site (ops, prerequisite for the cookie to work)
Put the API on a sibling of the web origin, e.g. `api.iliad.trustfabric.ai`, so
the cookie is first-party. Then `SameSite=Lax` lets it ride on the app's own
requests while still blocking cross-site POST/XHR (CSRF). Update `AXIS_WEB_URL`
and CORS `Access-Control-Allow-Origin` accordingly; the frontend `fetch` calls
need `credentials: "include"`.

## Stage C — frontend stops touching the raw key (follow-up PR)
- On OAuth return, call `/v1/auth/exchange` for its **side effect** (the cookie)
  and stop persisting `api_key` to `localStorage`.
- Send requests with `credentials: "include"` instead of an `Authorization`
  header; drop the bearer from `localStorage`.
- Wire "Sign out" to `POST /v1/auth/logout`.
- Keep a one-release fallback for users with an existing `localStorage` key,
  then remove it.

## Why this ordering
Stage A is backward-compatible and ships value immediately (logout endpoint,
cookie issued for when B lands). The XSS-exposure is only fully closed after C,
which depends on B. Shipping A first de-risks the later, smaller changes.
