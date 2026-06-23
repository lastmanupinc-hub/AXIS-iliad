// ─── E6 Sandbox verified-exec: signed compute attestation ────────
//
// iliad_code_sandbox's engineer core. After a sandbox run, AXIS emits an
// Ed25519-signed attestation binding a hash of the INPUT (language+code+stdin)
// to a hash of the deterministic OUTPUT (stdout+stderr+exit_code), plus a
// per-account hash-chain position. Every trust-bearing field is signed.
//
// TRUST MODEL — read this. verifyAttestation(a) WITHOUT a pinned key only proves
// the artifact is INTERNALLY consistent: that whoever holds `a.public_key` signed
// this code→output binding. It does NOT prove AXIS signed it (an attacker can
// sign their own forged binding with their own embedded key). To trust an
// attestation as AXIS's, a verifier MUST pin AXIS's published key and pass it as
// `expectedPublicKey`. The signing key comes from AXIS_ATTESTATION_PRIVATE_KEY (a
// stable, publishable identity); absent that, a per-process EPHEMERAL key is used
// — non-durable (a restart changes identity), so it can't be pinned. key_source
// says which. A present-but-malformed configured key fails loud (operator error),
// never silently downgrades to ephemeral.
//
// Pure, node:crypto only.

import { createHash, generateKeyPairSync, sign as edSign, verify as edVerify, createPrivateKey, createPublicKey, type KeyObject } from "node:crypto";

export interface AttestationInput {
  language: string;
  code: string;
  stdin?: string;
}

export interface AttestationOutput {
  stdout: string;
  stderr: string;
  exit_code: number;
}

export interface ChainLink {
  index: number;
  prev_root: string;
  root: string;
}

export interface Attestation {
  version: "axis-attestation/1";
  code_sha256: string;
  output_sha256: string;
  language: string;
  exit_code: number;
  account_id: string;
  /** Leaf hash chained into the per-account log; = leafHash(code,output,account). */
  attestation_hash: string;
  /** Per-account hash-chain position (index + prev_root + root) — all signed. */
  chain: ChainLink;
  payload_sha256: string;
  signature: string; // base64 Ed25519 over the canonical payload
  public_key: string; // base64 SPKI — convenience; PIN AXIS's key to trust provenance
  key_source: "configured" | "ephemeral";
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/** Canonical hash of the run INPUT. JSON-encoded so field boundaries can't be
 *  confused — code/stdin can contain any bytes (NUL, quotes), so a delimiter
 *  would let them collide. */
export function hashInput(input: AttestationInput): string {
  return sha256Hex(JSON.stringify({ language: input.language, code: input.code, stdin: input.stdin ?? "" }));
}

/** Canonical hash of the deterministic OUTPUT — excludes duration_ms / image. */
export function hashOutput(o: AttestationOutput): string {
  return sha256Hex(JSON.stringify({ stdout: o.stdout, stderr: o.stderr, exit_code: o.exit_code }));
}

/** The leaf hash chained into the per-account log. Derivable from signed fields,
 *  so a verifier can recompute and confirm it. */
export function leafHash(code_sha256: string, output_sha256: string, accountId: string): string {
  return sha256Hex(JSON.stringify({ code_sha256, output_sha256, account_id: accountId }));
}

/** The exact bytes signed — covers ALL trust-bearing fields incl. the full chain. */
function canonicalPayload(
  a: Pick<Attestation, "version" | "code_sha256" | "output_sha256" | "language" | "exit_code" | "account_id" | "attestation_hash" | "chain">,
): string {
  return JSON.stringify({
    version: a.version,
    code_sha256: a.code_sha256,
    output_sha256: a.output_sha256,
    language: a.language,
    exit_code: a.exit_code,
    account_id: a.account_id,
    attestation_hash: a.attestation_hash,
    chain_index: a.chain.index,
    chain_prev_root: a.chain.prev_root,
    chain_root: a.chain.root,
  });
}

// ─── Per-account append-only hash-chain (in-process) ───
// Keyed by account so one tenant's chain never interleaves another's (no
// cross-account ordering leak). root = sha256(prev_root + leaf); the whole link
// is signed, so it's tamper-proof and recomputable (see verifyChainLink).

const GENESIS = sha256Hex("axis-attestation-genesis");
const chains = new Map<string, { root: string; index: number }>();

function appendToChain(accountId: string, leaf: string): ChainLink {
  const state = chains.get(accountId) ?? { root: GENESIS, index: 0 };
  const prev_root = state.root;
  const index = state.index;
  const root = sha256Hex(prev_root + leaf);
  chains.set(accountId, { root, index: index + 1 });
  return { index, prev_root, root };
}

/** Test-only: clear all per-account chains. */
export function resetChainForTests(): void {
  chains.clear();
}

// ─── Signing key (configured identity, else per-process ephemeral) ───

let cachedKey: { priv: KeyObject; pubB64: string; source: "configured" | "ephemeral" } | null = null;

function getSigningKey(): { priv: KeyObject; pubB64: string; source: "configured" | "ephemeral" } {
  if (cachedKey) return cachedKey;
  const configured = process.env.AXIS_ATTESTATION_PRIVATE_KEY;
  if (configured) {
    // Present-but-broken is an OPERATOR error — let createPrivateKey throw rather
    // than silently downgrade to an unpinnable ephemeral identity.
    const priv = createPrivateKey({ key: Buffer.from(configured, "base64"), format: "der", type: "pkcs8" });
    const pubB64 = createPublicKey(priv).export({ format: "der", type: "spki" }).toString("base64");
    cachedKey = { priv, pubB64, source: "configured" };
    return cachedKey;
  }
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  cachedKey = { priv: privateKey, pubB64: publicKey.export({ format: "der", type: "spki" }).toString("base64"), source: "ephemeral" };
  return cachedKey;
}

/** Test-only: drop the cached signing key. */
export function resetKeyForTests(): void {
  cachedKey = null;
}

/** Build a signed attestation for a completed sandbox run. */
export function attestRun(input: AttestationInput, output: AttestationOutput, accountId: string): Attestation {
  const code_sha256 = hashInput(input);
  const output_sha256 = hashOutput(output);
  const attestation_hash = leafHash(code_sha256, output_sha256, accountId);
  const chain = appendToChain(accountId, attestation_hash);

  const base = {
    version: "axis-attestation/1" as const,
    code_sha256,
    output_sha256,
    language: input.language,
    exit_code: output.exit_code,
    account_id: accountId,
    attestation_hash,
    chain,
  };
  const payload = canonicalPayload(base);
  const key = getSigningKey();
  const signature = edSign(null, Buffer.from(payload, "utf8"), key.priv).toString("base64");

  return { ...base, payload_sha256: sha256Hex(payload), signature, public_key: key.pubB64, key_source: key.source };
}

/**
 * Verify an attestation: recompute the leaf + chain root from signed fields,
 * confirm the canonical payload + its hash, then verify the Ed25519 signature.
 * Pass `expectedPublicKey` to PIN AXIS's identity (without it, this only proves
 * self-consistency, not provenance). Never throws.
 */
export function verifyAttestation(a: Attestation, opts?: { expectedPublicKey?: string }): boolean {
  try {
    if (opts?.expectedPublicKey !== undefined && a.public_key !== opts.expectedPublicKey) return false;
    if (leafHash(a.code_sha256, a.output_sha256, a.account_id) !== a.attestation_hash) return false;
    if (sha256Hex(a.chain.prev_root + a.attestation_hash) !== a.chain.root) return false;
    const payload = canonicalPayload(a);
    if (sha256Hex(payload) !== a.payload_sha256) return false;
    const pub = createPublicKey({ key: Buffer.from(a.public_key, "base64"), format: "der", type: "spki" });
    return edVerify(null, Buffer.from(payload, "utf8"), pub, Buffer.from(a.signature, "base64"));
  } catch {
    return false;
  }
}

/**
 * Verify `next` is a genuine successor of `prev` in the same account's chain —
 * both valid, same account, next.prev_root == prev.root, index incremented. Lets
 * a third party check ordering, not just trust a scalar.
 */
export function verifyChainLink(prev: Attestation, next: Attestation, opts?: { expectedPublicKey?: string }): boolean {
  return (
    verifyAttestation(prev, opts) &&
    verifyAttestation(next, opts) &&
    prev.account_id === next.account_id &&
    next.chain.prev_root === prev.chain.root &&
    next.chain.index === prev.chain.index + 1
  );
}
