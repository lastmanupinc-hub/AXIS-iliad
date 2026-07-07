// ─── Detached JWS, alg=EdDSA (Ed25519) — node:crypto only ─────────
//
// Mirrors the proven template in apps/api/src/attestation.ts: pure node:crypto,
// no JOSE/JWS library dependency. "Detached" means the JWS carries a protected
// header + signature but NOT the payload itself (RFC 7515 §7.2.2) — the payload
// is the mandate/message object itself, canonicalized the same way on both sides.
//
// TRUST MODEL — read this. verifyDetached() / verifyMandate() etc. WITHOUT a
// pinned public key only prove the message is INTERNALLY consistent: that
// whoever holds the embedded public_key signed this exact payload. They do NOT
// prove any particular party (AXIS, a merchant, an issuer) signed it — an
// attacker can sign their own forged message with their own embedded key. A
// verifier that wants to trust a signer's IDENTITY must separately pin that
// party's published public key and compare it to the message's public_key
// field out of band. This is the same caveat attestation.ts documents.

import {
  generateKeyPairSync,
  sign as edSign,
  verify as edVerify,
  createPrivateKey,
  createPublicKey,
  type KeyObject,
} from "node:crypto";
import { canonicalize } from "./canonical.js";

export interface DetachedJws {
  protected: string; // base64url(JSON header)
  signature: string; // base64url(Ed25519 signature)
}

export interface Ed25519KeyPair {
  privateKey: KeyObject;
  publicKeySpkiB64: string; // base64 SPKI DER — convenience, embeds in messages
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decode base64url -> Buffer. Tolerant of missing padding; never throws on
 *  garbage input (returns whatever bytes Buffer.from can salvage) — callers
 *  that need strict validation should check the decoded length/shape. */
function fromB64url(s: string): Buffer {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64");
}

/** Fresh, random Ed25519 identity — use for real signing identities. */
export function generateEd25519(): Ed25519KeyPair {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateKey,
    publicKeySpkiB64: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
  };
}

/** Import a public key from its base64 SPKI DER encoding (as embedded in a
 *  signed message's `public_key` field). */
export function importPublicSpki(b64: string): KeyObject {
  return createPublicKey({ key: Buffer.from(b64, "base64"), format: "der", type: "spki" });
}

// RFC 8410 §7: the fixed 16-byte PKCS8 boilerplate for an UNENCRYPTED Ed25519
// private key — SEQUENCE{ version=0, AlgorithmIdentifier{OID 1.3.101.112},
// OCTET STRING{ OCTET STRING{ <32-byte seed> } } }. Only the trailing 32 bytes
// vary per key.
const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

/**
 * Build a DETERMINISTIC Ed25519 keypair from a fixed 32-byte seed. NOT a
 * production signing identity — use generateEd25519() + a real secret store
 * for those. This exists so generated documentation samples and committed
 * golden-vector fixtures can embed a STABLE public key + signature that never
 * changes between runs (a determinism gate for byte-identical output).
 */
export function keyPairFromSeed(seed: Buffer): Ed25519KeyPair {
  if (seed.length !== 32) throw new Error("keyPairFromSeed: seed must be exactly 32 bytes");
  const der = Buffer.concat([ED25519_PKCS8_PREFIX, seed]);
  const privateKey = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  return {
    privateKey,
    publicKeySpkiB64: createPublicKey(privateKey).export({ format: "der", type: "spki" }).toString("base64"),
  };
}

/** Fixed 32-byte demo seed ("AXP2" repeated 8x) — deterministic, NOT secret,
 *  NOT a production identity. Used only for reproducible generated samples
 *  and committed golden vectors. */
export const DEMO_SEED_HEX = "41585032".repeat(8);

/** Convenience: the deterministic demo keypair derived from DEMO_SEED_HEX. */
export function demoKeyPair(): Ed25519KeyPair {
  return keyPairFromSeed(Buffer.from(DEMO_SEED_HEX, "hex"));
}

/**
 * Sign `payload` as a detached JWS: alg=EdDSA over
 * base64url(protectedHeader) + "." + base64url(canonicalize(payload)).
 * The payload itself is NOT embedded in the returned JWS (detached, RFC 7515
 * §7.2.2) — verifiers re-supply it and re-canonicalize the same way.
 */
export function signDetached(payload: object, privateKey: KeyObject, opts?: { kid?: string }): DetachedJws {
  const header: Record<string, string> = { alg: "EdDSA" };
  if (opts?.kid) header.kid = opts.kid;
  const protectedB64 = b64url(Buffer.from(JSON.stringify(header), "utf8"));
  const payloadB64 = b64url(Buffer.from(canonicalize(payload), "utf8"));
  const signingInput = Buffer.from(`${protectedB64}.${payloadB64}`, "utf8");
  const signature = edSign(null, signingInput, privateKey);
  return { protected: protectedB64, signature: b64url(signature) };
}

/**
 * Verify a detached JWS against `payload` re-canonicalized the same way, using
 * the given base64-SPKI public key. Never throws — any malformed input
 * (bad base64, wrong-length signature, wrong key encoding) resolves to false.
 */
export function verifyDetached(payload: object, jws: DetachedJws, publicKeySpkiB64: string): boolean {
  try {
    const payloadB64 = b64url(Buffer.from(canonicalize(payload), "utf8"));
    const signingInput = Buffer.from(`${jws.protected}.${payloadB64}`, "utf8");
    const pub = importPublicSpki(publicKeySpkiB64);
    const sig = fromB64url(jws.signature);
    return edVerify(null, signingInput, pub, sig);
  } catch {
    return false;
  }
}
