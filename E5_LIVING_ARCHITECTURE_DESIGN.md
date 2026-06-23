# E5 — Living Architecture: design contract

**Tool:** `analyze_repo` (engineer mode) · **Branch:** `feat/engineer-e5-living-architecture` · **Status:** design (pre-build)

The engineer upgrade makes `analyze_repo` output repo-*specific*, not repo-*shaped* — without surrendering the determinism guarantee. The mechanism is a **verified LLM specificity pass**: the model proposes discrete claims, and a deterministic verifier **drops every claim it can't ground in the extracted facts**. The verifier *is* the structured contract `begin.yaml` requires ("no AI without structured contracts").

## Why this is safe to build now

| Concern | Resolution (from research) |
|---|---|
| New dependency / API key | **None.** Reuses local `runCompletion()` ([llm-inference.ts:173](apps/api/src/llm-inference.ts#L173)) — node-llama-cpp + GGUF, no remote call, no key. |
| Breaks the determinism test | Engineer prose lands in a **separate, engineer-only artifact** excluded from `expectByteIdentical`; the 133-artifact core is emitted **unchanged**. [determinism.test.ts](packages/generator-core/src/determinism.test.ts) passes unmodified. |
| Hallucinated facts | Every claim carries an `evidence_ref` checked against a deterministic **FactOracle**; unresolved → dropped. |
| Untestable without a key | Verifier is pure TS (tested with hand-built facts). LLM step gated by `isLlmConfigured()`; client is injectable (a fake `runCompletion` returns canned claims). Live test is `skipIf(no model)`. |

## The contract

**INPUT** (already computed in `runAnalyzeRepo`/`runAnalyzeFiles`): `ContextMap` + `extractSymbols(source_files)` (line-accurate) + raw `source_files`.

**1. PROPOSE (LLM, gated, `temperature:0` + snapshot-derived `seed`, reuses `runCompletion`).**
Prompt the local model with a compact fact digest → ask for *N* discrete claims, each:
```ts
interface ArchClaim {
  type: "symbol" | "route" | "model" | "dependency" | "import";
  evidence_ref: { file: string; symbol?: string; line?: number; route?: { method: string; path: string }; dep?: string };
  insight: string; // the repo-specific prose this claim asserts
}
```
The model supplies the *insight*; the `evidence_ref` is what it's grounded on.

**2. VERIFY (pure, deterministic TypeScript — the structured contract).**
Build a `FactOracle` once from the facts:
- symbols keyed by `file → set(symbol_name)` (+ optional line match) from `extractSymbols`
- routes set `(method, path)` from `ctx.routes`
- domain-model map `name → field_count`
- dependency set from `ParseResult.dependencies`
- import edges set from `ctx.dependency_graph` / `internal_imports`

For each claim, resolve `evidence_ref` against the oracle → **KEEP** (grounded) or **DROP** (hallucinated file/symbol/route/dep), accumulating drop reasons. Deterministic: same facts + same claims → same keep/drop set.

**3. EMIT** a new engineer-only artifact `living-architecture.md`:
- verified claims rendered as prose grouped by area
- a **Verification footer**: `claims_proposed`, `claims_kept`, `claims_dropped` + each dropped claim with its reason
- excluded from the determinism hash; the deterministic core is untouched.

**DEGRADE:** model not configured → artifact carries a `_not_configured` note (standard output unaffected). Optionally fall back to today's deterministic templated summary, labeled as such.

**PRICE:** re-add `analyze_repo.engineer_cents` to `PRICING_TIERS` (the harden pass removed it as unbuilt; now it ships). Premium over the $0.50 standard. The ladder test (`engineer_cents > standard_cents`) and the implemented-set test update accordingly.

## Scope

**E5 v1 (this branch):** the verified specificity pass above — the core novelty, fully testable, determinism-preserving.

**E5.2 (deferred, own candidate):** **push-triggered PR drift mode** — a GitHub webhook that re-runs analysis on push and opens a PR when `living-architecture.md` drifts. This is a *distinct mechanism* (webhook ingestion + PR creation via the GitHub app), shares no code with the specificity pass, and is XL on its own. Splitting it keeps v1 shippable and reviewable.

## Test plan (no API key needed)

- `FactOracle` + claim verifier: pure unit tests — a claim referencing a real symbol/route/dep is KEPT; a fabricated one is DROPPED with the right reason; line-mismatch handling; empty-claims and all-dropped cases.
- Artifact assembly: verified claims render; the footer counts are correct; the artifact is absent/`_not_configured` when the model isn't configured.
- Determinism: the existing `determinism.test.ts` still passes (core unchanged); the engineer artifact is excluded.
- Dispatcher: engineer mode triggers the pass with an injected fake `runCompletion`; standard mode is byte-identical to today.
