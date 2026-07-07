# @axis/ap2

Real, schema-validating, cryptographically-verifiable codecs for three
agentic-commerce message families:

- **AP2 mandates** — Intent / Cart / Payment
- **TAP token-lifecycle messages** — provision / activate / suspend / resume / delete
- **UCP settlement messages**

Each protocol module (`ap2.ts`, `tap.ts`, `ucp.ts`) exposes the same shape:

- `encode*` — canonical JSON (RFC 8785 JCS-style; see [Canonicalization](#canonicalization))
- `decode*` — parse + structural validation; throws a `*DecodeError` on malformed JSON or an invalid message
- `validate*` — structural + (for carts) cross-reference validation, returns `{ valid, issues[] }`, never throws
- `sign*` — detached JWS, `alg=EdDSA` (Ed25519), via `node:crypto` only — zero new runtime dependencies
- `verify*` — schema + signature verification, never throws

## Zero new runtime dependencies

This package uses only `node:crypto` for all cryptography (the same proven
pattern as `apps/api/src/attestation.ts`). `package.json` has no `dependencies`
key beyond the workspace — `devDependencies` are limited to `@types/node` and
`typescript`.

## Canonicalization

`canonical.ts` implements RFC 8785's actual invariants — sorted object keys
(by UTF-16 code unit), standard JSON string escaping, no insignificant
whitespace — **scoped to strings, integers, booleans, null, arrays, and
objects**. Full JCS additionally requires ECMAScript "shortest round-trip"
serialization of arbitrary IEEE-754 doubles, which this package does not
implement — it doesn't need to, because this domain represents money as
decimal **strings** (`MoneyAmount.value`) and uses integer quantities
everywhere else. Any non-integer number, `NaN`, `Infinity`, or `undefined`
passed to `canonicalize()` throws rather than silently producing bytes that
aren't actually canonical.

## Trust model

`verify*(...)` **without a separately pinned public key** only proves a
message is *internally consistent* — that whoever holds the embedded
`public_key` signed this exact payload. It does **not** prove any particular
party (AXIS, a merchant, an issuer) signed it: an attacker can sign their own
forged message with their own embedded key. A verifier that wants to trust a
signer's *identity* must pin that party's published public key out of band
and compare it to the message's `public_key` field itself. (Same caveat
`apps/api/src/attestation.ts` documents for compute attestations.)

## Scope honesty — read before calling anything "interoperable"

These codecs are conformant to:

1. **our TypeScript encoding of the public AP2 mandate schema**, and
2. **TAP and UCP message shapes modeled from public documentation** — neither
   protocol has a public wire schema this package conforms against —

verified only against **self-authored, frozen golden-vector fixtures**
(`src/__fixtures__/golden/`). They are **not** certified against an official
AP2/TAP/UCP conformance suite, nor exercised against a live Visa/Mastercard
network or counterparty.

**"Interoperability" in this package's context means:** produces and verifies
well-formed, cryptographically-signed messages matching the modeled schemas.
It does **not** mean certified network interoperability. Official conformance
certification and live counterparty/network interop testing are external
gates outside what code alone can satisfy — see WO-07's `external_gates`.

## Determinism

`keyPairFromSeed(seed)` / `demoKeyPair()` derive a **deterministic** Ed25519
keypair from a fixed 32-byte seed. This is not a production signing identity —
real callers should use `generateEd25519()` plus a real secret store. The
deterministic keypair exists so generated documentation samples (see
`@axis/generator-core`'s `buildTapInteropSection` / `generateAp2InteropSamples`)
and this package's own committed golden vectors can embed a stable public key
and signature that never changes between runs.
