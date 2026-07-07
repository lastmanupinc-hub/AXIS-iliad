import { describe, it, expect } from "vitest";
import { generateEd25519 } from "./jws.js";
import {
  validateTapMessage,
  encodeTapMessage,
  decodeTapMessage,
  signTapMessage,
  verifyTapMessage,
  TapDecodeError,
  type TapTokenMessage,
} from "./tap.js";

const sample: TapTokenMessage = {
  kind: "tap.token",
  version: "tap/1",
  token_id: "tok_1",
  event: "provision",
  token_requestor_id: "trid_1",
  dpan_last4: "1234",
  mandate_ref: "cart_abc",
  occurred_at: "2026-01-01T00:00:00.000Z",
};

describe("tap token messages — structural validation", () => {
  it("the sample message validates", () => {
    const result = validateTapMessage(sample);
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("validates without the optional mandate_ref", () => {
    const { mandate_ref, ...rest } = sample;
    expect(validateTapMessage(rest).valid).toBe(true);
  });

  it("rejects a bad `event` enum value", () => {
    expect(validateTapMessage({ ...sample, event: "explode" }).valid).toBe(false);
  });

  it("rejects a bad `kind` discriminant", () => {
    expect(validateTapMessage({ ...sample, kind: "bogus" }).valid).toBe(false);
  });

  it("rejects a malformed dpan_last4", () => {
    expect(validateTapMessage({ ...sample, dpan_last4: "12" }).valid).toBe(false);
    expect(validateTapMessage({ ...sample, dpan_last4: "abcd" }).valid).toBe(false);
  });

  it("rejects a non-object", () => {
    expect(validateTapMessage(null).valid).toBe(false);
    expect(validateTapMessage("nope").valid).toBe(false);
  });
});

describe("tap token messages — encode/decode round-trip", () => {
  it("decodeTapMessage(encodeTapMessage(m)) deep-equals m", () => {
    expect(decodeTapMessage(encodeTapMessage(sample))).toEqual(sample);
  });

  it("encodeTapMessage is byte-stable regardless of input key order", () => {
    const reordered: TapTokenMessage = {
      occurred_at: sample.occurred_at,
      mandate_ref: sample.mandate_ref,
      dpan_last4: sample.dpan_last4,
      token_requestor_id: sample.token_requestor_id,
      event: sample.event,
      token_id: sample.token_id,
      version: sample.version,
      kind: sample.kind,
    };
    expect(encodeTapMessage(reordered)).toBe(encodeTapMessage(sample));
  });

  it("decodeTapMessage throws TapDecodeError on malformed JSON", () => {
    expect(() => decodeTapMessage("{not json")).toThrow(TapDecodeError);
  });

  it("decodeTapMessage throws TapDecodeError on a structurally invalid message", () => {
    expect(() => decodeTapMessage(JSON.stringify({}))).toThrow(TapDecodeError);
  });
});

describe("tap token messages — sign/verify + tamper detection", () => {
  it("verifyTapMessage(signTapMessage(m)) is valid", () => {
    const kp = generateEd25519();
    const signed = signTapMessage(sample, kp.privateKey, kp.publicKeySpkiB64);
    expect(verifyTapMessage(signed).valid).toBe(true);
  });

  it("mutating the message after signing invalidates verification", () => {
    const kp = generateEd25519();
    const signed = signTapMessage(sample, kp.privateKey, kp.publicKeySpkiB64);
    const tampered = { ...signed, message: { ...signed.message, event: "delete" as const } };
    expect(verifyTapMessage(tampered).valid).toBe(false);
  });

  it("substituting a different public_key invalidates verification", () => {
    const kp1 = generateEd25519();
    const kp2 = generateEd25519();
    const signed = signTapMessage(sample, kp1.privateKey, kp1.publicKeySpkiB64);
    expect(verifyTapMessage({ ...signed, public_key: kp2.publicKeySpkiB64 }).valid).toBe(false);
  });
});
