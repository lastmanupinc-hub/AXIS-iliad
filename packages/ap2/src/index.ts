/**
 * @axis/ap2 — AP2 / TAP / UCP message codecs
 *
 * Real, schema-validating, cryptographically-verifiable codecs for three
 * agentic-commerce message families:
 *   - AP2 mandates (Intent / Cart / Payment)
 *   - TAP token-lifecycle messages (provision/activate/suspend/resume/delete)
 *   - UCP settlement messages
 *
 * Each supports encode (RFC 8785 JCS-style canonical JSON) / decode (parse +
 * schema-validate) / validate (structural + cross-reference) / sign (detached
 * JWS, EdDSA/Ed25519 over node:crypto — zero new runtime deps) / verify
 * (schema + signature + cross-ref).
 *
 * SCOPE HONESTY — read this before calling anything "interoperable" in a
 * customer-facing claim. These codecs are conformant to OUR TypeScript
 * encoding of the public AP2 mandate schema, and to TAP/UCP message shapes
 * MODELED from public documentation (neither has a public wire schema this
 * package conforms against) — verified only against self-authored, frozen
 * golden-vector fixtures in src/__fixtures__/golden/. They are NOT certified
 * against an official AP2/TAP/UCP conformance suite, nor exercised against a
 * live Visa/Mastercard network or counterparty. "Interoperability" therefore
 * means "produces and verifies well-formed, cryptographically-signed messages
 * matching the modeled schemas" — not "certified network interoperability."
 * See README.md for the full caveat.
 */

export { canonicalize } from "./canonical.js";

export {
  generateEd25519,
  importPublicSpki,
  keyPairFromSeed,
  demoKeyPair,
  DEMO_SEED_HEX,
  signDetached,
  verifyDetached,
} from "./jws.js";
export type { DetachedJws, Ed25519KeyPair } from "./jws.js";

export type { MoneyAmount, ValidationIssue, ValidationResult, CartItem } from "./types.js";

export {
  validateMandate,
  encodeMandate,
  decodeMandate,
  signMandate,
  verifyMandate,
  Ap2DecodeError,
} from "./ap2.js";
export type { IntentMandate, CartMandate, PaymentMandate, Mandate, SignedMandate, MandateValidationContext } from "./ap2.js";

export {
  validateTapMessage,
  encodeTapMessage,
  decodeTapMessage,
  signTapMessage,
  verifyTapMessage,
  TapDecodeError,
} from "./tap.js";
export type { TapTokenMessage, SignedTapMessage, TapEvent } from "./tap.js";

export {
  validateUcpMessage,
  encodeUcpMessage,
  decodeUcpMessage,
  signUcpMessage,
  verifyUcpMessage,
  UcpDecodeError,
} from "./ucp.js";
export type { UcpSettlementMessage, SignedUcpMessage, ClearingSystem, SettlementFinality } from "./ucp.js";
