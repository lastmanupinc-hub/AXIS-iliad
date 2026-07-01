# Merchant‑Integration Dogfooding Template

A repeatable process for validating that Iliad's **agentic‑commerce / payment artifacts** (the agentic‑purchasing playbook, negotiation rules, commerce registry, MCP paid‑access, etc.) produce **honest, evidence‑grounded, correct** output for a real merchant integration **before** it ships or is enabled for a customer.

**Why this exists.** These artifacts are consumed by autonomous agents that *act* on them — an agent reads "provider X supports network tokenization ✅" or "per‑session cap $50,000" and behaves accordingly. A fabricated or ungrounded claim is not a cosmetic bug; it is a correctness/integrity failure that can cause an agent to attempt an unsupported flow or over‑spend. The only reliable way to catch this is to **run the real generator against a real merchant codebase and check what it actually emits** — deterministic tests on synthetic fixtures don't reveal fabrication.

Use it for: every new merchant integration, every change to a commerce/payment generator, and before enabling paid MCP access for a merchant. The worked example throughout is the **agentic‑purchasing generator validated against the PAI'D `no-fate-payment-engine` Go backend**.

---

## The dogfood loop

```
pick real merchant repo  →  run the REAL generator  →  integrity-check output
        ↑                                                      │
        └──────────  fix generator  ←  spot-check claims  ←────┘
```

1. **Pick a real payment/commerce repo as the test bed.** Prefer the merchant's actual codebase; failing that, a representative real repo (PAI'D's go‑backend is the canonical internal one — a genuine payment engine referencing Stripe/Plaid/Circle/etc.). Never validate integrity on synthetic fixtures — they can't surface fabrication.
2. **Run the real generator, not a mock.** Build a `ContextMap` from the repo and call the actual `generate*` function with the real `SourceFile[]`. (Harness pattern below.)
3. **Integrity‑check the output** against the red‑flags list. The key question for every claim: *"Is this grounded in evidence from this repo, or asserted as a fact?"*
4. **Spot‑check load‑bearing claims** against the real code (open the files the output points at; confirm the numbers).
5. **Fix the generator** so every claim is evidence‑derived or clearly labeled as policy/placeholder. Add a unit test that asserts the evidence behavior **and regression‑guards the fabricated value** (`expect(...).not.toContain("$50,000")`).
6. **Re‑run** until the integrity check is clean. Record the run.

---

## Integrity red‑flags (what to hunt for)

These are the fabrication patterns found and fixed in the agentic‑purchasing generator — check every commerce artifact for them:

| Red flag | Example (real, now fixed) | Honest replacement |
|----------|---------------------------|--------------------|
| **Per‑provider capability asserted as fact** | `p === "stripe" ? "✅ Supported"` (tokenization) | Scan files that reference the provider; report `"detected in repo (N files)"` / `"not found — verify with PSP"` |
| **Hardcoded money figures** | `cap = stripe ? "$50,000" : "$5,000"` | `"set per policy"` — caps are merchant policy, not provider facts |
| **Brand‑based risk/score favoritism** | `+5 points if stripe/adyen detected` | Score a real detected signal (`has_mandate_management`), not a brand |
| **Fixed short‑list masquerading as complete** | URL switch for 6 frameworks → Google for the rest | Cover **every** detected item; curated map + registry fallback |
| **Dead context variable** | `const frameworks = ...` computed then ignored | Use the detected data; if it's computed, render it |
| **Compliance/legal certainty** | "SCA compliant ✅" | "SCA code detected in repo — not a certification; verify" |

**Rule:** a cell that reports repo *evidence* is fine; a cell that asserts a *provider/market fact* the repo can't back up is not. When in doubt, label it "detected in repo" or "verify with PSP / set per policy."

---

## Validation harness (pattern)

Run the built generators against a real repo. Adapt paths per integration:

```js
// validate-<artifact>-<merchant>.mjs — run with: node validate-...mjs
import fs from "node:fs"; import path from "node:path";
const ROOT = "…/AXIS Toolbox";
const MERCHANT = "…/merchant-repo";            // the real codebase under test
const { buildContextMap, buildRepoProfile } = await import(`file:///${ROOT}/packages/context-engine/dist/index.js`);
const gen = await import(`file:///${ROOT}/packages/generator-core/dist/index.js`);

// Load the files that matter for this artifact (here: provider-referencing source), cap count+size.
const RELEVANT = /stripe|plaid|circle|paypal|adyen|braintree|square/i;
const files = /* walk MERCHANT, keep files matching RELEVANT, {path, content: c.slice(0,24000), size} */ [];

const snapshot = { snapshot_id:"val", project_id:"val", created_at:"2026-01-01T00:00:00Z",
  input_method:"api_submission", manifest:{ project_name:"merchant", project_type:"api_service",
  frameworks:[], goals:[], requested_outputs:[] }, file_count:files.length,
  total_size_bytes:files.reduce((s,f)=>s+f.size,0), files, status:"ready", account_id:null };

const ctx = buildContextMap(snapshot); const profile = buildRepoProfile(snapshot);
const out = gen.generateAgentPurchasingPlaybook(ctx, profile, files).content;   // the artifact under test

// INTEGRITY GATE — fabricated strings must be absent; evidence language present.
const banned = ["$50,000","$10,000","$5,000","✅ Supported"];
const hits = banned.filter(b => out.includes(b));
console.log("fabricated strings:", hits.length ? hits : "NONE ✅");
console.log("evidence language:", /detected in repo|not found — verify|set per policy/.test(out) ? "YES ✅" : "NO ❌");
```

> Use `import.meta`/`Date` constants (not `Date.now()`) so the run is reproducible. The gate is intentionally simple: **any banned string present = fail**, plus a positive check that evidence language is used.

---

## Per‑integration checklist

- [ ] Real merchant (or representative) repo selected; **not** a synthetic fixture.
- [ ] Generator run against real `SourceFile[]` via `buildContextMap` (harness above).
- [ ] Output scanned for every red‑flag pattern; **zero** fabricated capability/money/compliance claims.
- [ ] Every load‑bearing number spot‑checked against the source (e.g. "tokenization detected in 120 files" → the files actually reference token APIs).
- [ ] Providers the repo does **not** implement show "not found — verify with PSP", never a checkmark.
- [ ] Money limits / risk tiers say "set per policy", never invented figures.
- [ ] Any score/grade ties to a detected signal, not a provider brand.
- [ ] Unit test added: asserts the evidence behavior **and** `.not.toContain` the removed fabricated value.
- [ ] Run recorded (repo + date + result) in the integration's PR.
- [ ] For **paid MCP access**: also dogfood the debit path against real PAI'D in read‑only/shadow mode before enabling live debits (see the MCP paid‑access design).

---

## Sign‑off criteria

An integration is **dogfood‑clean** when, against a real merchant repo:
1. The integrity gate passes (no banned strings, evidence language present).
2. Every load‑bearing claim is traceable to real code in that repo.
3. Regression tests lock in the evidence behavior and guard the removed fabrications.
4. The run is recorded in the PR.

Anything short of that ships a document an agent could act on incorrectly — treat it as a release blocker for commerce/payment artifacts.

---

## Worked example (2026‑07‑01)

**Artifact:** agentic‑purchasing playbook + negotiation rules. **Test bed:** PAI'D `no-fate-payment-engine/go-backend` (180 provider‑referencing Go files).

- **Found:** `stripe/adyen → "✅ Supported"`, `stripe → "single/recurring/setup"`, per‑brand caps (`$50,000/$10,000/$5,000`), and a `+5` art11 score just for detecting stripe/adyen — all fabricated, untethered from the repo.
- **Fixed:** `detectProviderEvidence()` scans the files referencing each provider and reports what's actually there. Caps → "set per policy". Score → `has_mandate_management`.
- **Validated:** stripe tokenization "detected in repo (120 files)", paypal (22), adyen/apple_pay/google_pay "not found — verify with PSP"; **zero** fabricated strings. 130 unit tests (5 rewritten to assert evidence + regression‑guard the fabrications).

That's the bar for every future merchant integration.
