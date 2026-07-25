# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.5.x   | ✓ Current |
| < 0.5   | ✗         |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report security vulnerabilities to: **<security@jonathanarvay.com>**, or privately via
[GitHub Security Advisories](https://github.com/lastmanupinc-hub/axis-iliad/security/advisories)
(also the canonical contacts served at `/.well-known/security.txt`).

Include in your report:
- Description of the vulnerability
- Steps to reproduce
- Affected component (`@axis/repo-parser`, `@axis/context-engine`, `@axis/generator-core`, `@axis/snapshots`, or the hosted API)
- Severity assessment (CVSS score if available)
- Any suggested mitigations

We target a response within **72 hours** and a patch within **14 days** for confirmed high-severity issues.

## Scope

### In scope
- Remote code execution via malformed repo input to the parser
- Authentication bypass in the API server (API key validation, OAuth)
- SQLi or path traversal in snapshot or file-serving endpoints
- Secrets or private keys leaked in generated artifacts
- x402/MPP payment token forgery or replay attacks
- SSRF via GitHub URL analysis endpoint

### Out of scope
- Rate-limit bypass on free-tier tools (by design — these are public)
- Social engineering
- Physical access

## Security Practices

- **No secrets in generated artifacts** — the repo-parser runs Secretlint patterns before including any file content in snapshots
- **Input validation at all API boundaries** — all request bodies are schema-validated before processing
- **SQLite WAL mode** — no raw SQL concatenation; all queries use parameterized statements via `better-sqlite3`
- **CORS restricted to known origins** — wildcard `*` is not used on authenticated endpoints
- **HTTP 402 payment tokens** — MPP challenge tokens are HMAC-bound to the request; replay attacks produce verification failures
- **GitHub OAuth** — state parameter validated on callback; no open redirects

## Vulnerability Disclosure

We follow coordinated disclosure. After a patch is released, we will publish a CVE and credit the reporter (unless they prefer anonymity).

See also: [/.well-known/security.txt](https://axis-api-6c7z.onrender.com/.well-known/security.txt)
