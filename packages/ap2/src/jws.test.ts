import { describe, it, expect } from "vitest";
import { generateEd25519, signDetached, verifyDetached, keyPairFromSeed, demoKeyPair, DEMO_SEED_HEX } from "./jws.js";

describe("jws detached EdDSA signatures", () => {
  it("verifies a fresh signature with the matching keypair", () => {
    const kp = generateEd25519();
    const payload = { hello: "world", n: 1 };
    const jws = signDetached(payload, kp.privateKey);
    expect(verifyDetached(payload, jws, kp.publicKeySpkiB64)).toBe(true);
  });

  it("rejects when the payload is mutated after signing", () => {
    const kp = generateEd25519();
    const payload = { hello: "world", n: 1 };
    const jws = signDetached(payload, kp.privateKey);
    const tampered = { hello: "world", n: 2 }; // one field flipped
    expect(verifyDetached(tampered, jws, kp.publicKeySpkiB64)).toBe(false);
  });

  it("rejects a byte-level mutation of a string payload field", () => {
    const kp = generateEd25519();
    const payload = { message: "abcdefg" };
    const jws = signDetached(payload, kp.privateKey);
    const tampered = { message: "abcdefh" }; // last char flipped
    expect(verifyDetached(tampered, jws, kp.publicKeySpkiB64)).toBe(false);
  });

  it("rejects verification with the wrong public key", () => {
    const kp1 = generateEd25519();
    const kp2 = generateEd25519();
    const payload = { a: 1 };
    const jws = signDetached(payload, kp1.privateKey);
    expect(verifyDetached(payload, jws, kp2.publicKeySpkiB64)).toBe(false);
  });

  it("returns false (never throws) for a malformed signature", () => {
    const kp = generateEd25519();
    const payload = { a: 1 };
    const jws = signDetached(payload, kp.privateKey);
    const malformed = { ...jws, signature: "!!!not-base64url!!!" };
    expect(() => verifyDetached(payload, malformed, kp.publicKeySpkiB64)).not.toThrow();
    expect(verifyDetached(payload, malformed, kp.publicKeySpkiB64)).toBe(false);
  });

  it("returns false (never throws) for a garbage public key", () => {
    const kp = generateEd25519();
    const payload = { a: 1 };
    const jws = signDetached(payload, kp.privateKey);
    expect(() => verifyDetached(payload, jws, "not-a-real-key")).not.toThrow();
    expect(verifyDetached(payload, jws, "not-a-real-key")).toBe(false);
  });

  it("returns false (never throws) for an empty signature", () => {
    const kp = generateEd25519();
    const payload = { a: 1 };
    const jws = signDetached(payload, kp.privateKey);
    expect(verifyDetached(payload, { ...jws, signature: "" }, kp.publicKeySpkiB64)).toBe(false);
  });

  it("keyPairFromSeed is deterministic — same seed always yields the same public key", () => {
    const seed = Buffer.from(DEMO_SEED_HEX, "hex");
    const kp1 = keyPairFromSeed(seed);
    const kp2 = keyPairFromSeed(seed);
    expect(kp1.publicKeySpkiB64).toBe(kp2.publicKeySpkiB64);
  });

  it("demoKeyPair() is stable across calls and can sign/verify", () => {
    const kp1 = demoKeyPair();
    const kp2 = demoKeyPair();
    expect(kp1.publicKeySpkiB64).toBe(kp2.publicKeySpkiB64);
    const payload = { demo: true };
    const jws = signDetached(payload, kp1.privateKey);
    expect(verifyDetached(payload, jws, kp2.publicKeySpkiB64)).toBe(true);
  });

  it("keyPairFromSeed rejects a seed that isn't exactly 32 bytes", () => {
    expect(() => keyPairFromSeed(Buffer.alloc(31))).toThrow();
    expect(() => keyPairFromSeed(Buffer.alloc(33))).toThrow();
  });
});
