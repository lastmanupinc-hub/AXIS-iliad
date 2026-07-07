// ─── Commerce engine reproducibility proofs (WO-13) ────────────────
//
// The compliance-kit engines (gradeCompliance, decideScaExemption,
// renderScaExemptionMatrix here; assembleCe3 / scoreWinProbability /
// buildStripeRepresentment in @axis/agentic-compliance; the AP2/TAP/UCP
// codecs in @axis/ap2) are pure, deterministic functions. `proofDigest`
// gives every surface that exposes them (generateCommerceRegistry's
// `verified_decisions` block, the free commerce MCP tools) a reproducible
// sha256 over canonical (sorted-key) JSON of the inputs + outputs, so two
// identical calls always carry a byte-identical digest — an auditable
// "same inputs → same decision" receipt, not a signature and not a
// certification.

import { createHash } from "node:crypto";

export interface ReproProof {
  algo: "sha256";
  /** hex sha256 over canonical (recursively key-sorted) JSON of the payload. */
  digest: string;
  /** Human-readable names of what the digest covers, in payload order. */
  over: string[];
}

/** Recursively key-sort plain objects so JSON.stringify is canonical. */
function canonicalSort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalSort);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonicalSort((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/**
 * Canonical (sorted-key) JSON hash so identical inputs+outputs ⇒ identical
 * digest, regardless of property insertion order. Deterministic and pure.
 */
export function proofDigest(over: string[], payload: unknown): ReproProof {
  const canonical = JSON.stringify(canonicalSort(payload));
  return {
    algo: "sha256",
    digest: createHash("sha256").update(canonical, "utf8").digest("hex"),
    over: [...over],
  };
}
