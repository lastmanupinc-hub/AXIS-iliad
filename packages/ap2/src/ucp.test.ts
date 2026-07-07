import { describe, it, expect } from "vitest";
import { generateEd25519 } from "./jws.js";
import {
  validateUcpMessage,
  encodeUcpMessage,
  decodeUcpMessage,
  signUcpMessage,
  verifyUcpMessage,
  UcpDecodeError,
  type UcpSettlementMessage,
} from "./ucp.js";

const sample: UcpSettlementMessage = {
  kind: "ucp.settlement",
  version: "ucp/1",
  settlement_id: "settle_1",
  payment_ref: "payment_abc",
  clearing_system: "VISA_NET",
  amount: { currency: "USD", value: "25.00" },
  value_date: "2026-01-02",
  settlement_finality: "final",
};

describe("ucp settlement messages — structural validation", () => {
  it("the sample message validates", () => {
    const result = validateUcpMessage(sample);
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("rejects a bad `clearing_system` enum value", () => {
    expect(validateUcpMessage({ ...sample, clearing_system: "BITCOIN_NET" }).valid).toBe(false);
  });

  it("rejects a bad `settlement_finality` enum value", () => {
    expect(validateUcpMessage({ ...sample, settlement_finality: "maybe" }).valid).toBe(false);
  });

  it("rejects a bad `kind` discriminant", () => {
    expect(validateUcpMessage({ ...sample, kind: "bogus" }).valid).toBe(false);
  });

  it("rejects a malformed value_date", () => {
    expect(validateUcpMessage({ ...sample, value_date: "01/02/2026" }).valid).toBe(false);
  });

  it("rejects an invalid MoneyAmount", () => {
    expect(validateUcpMessage({ ...sample, amount: { currency: "usd", value: "25.00" } }).valid).toBe(false);
    expect(validateUcpMessage({ ...sample, amount: { currency: "USD", value: 25 } }).valid).toBe(false);
  });

  it("rejects a non-object", () => {
    expect(validateUcpMessage(undefined).valid).toBe(false);
    expect(validateUcpMessage([1]).valid).toBe(false);
  });
});

describe("ucp settlement messages — encode/decode round-trip", () => {
  it("decodeUcpMessage(encodeUcpMessage(m)) deep-equals m", () => {
    expect(decodeUcpMessage(encodeUcpMessage(sample))).toEqual(sample);
  });

  it("encodeUcpMessage is byte-stable regardless of input key order", () => {
    const reordered: UcpSettlementMessage = {
      settlement_finality: sample.settlement_finality,
      value_date: sample.value_date,
      amount: sample.amount,
      clearing_system: sample.clearing_system,
      payment_ref: sample.payment_ref,
      settlement_id: sample.settlement_id,
      version: sample.version,
      kind: sample.kind,
    };
    expect(encodeUcpMessage(reordered)).toBe(encodeUcpMessage(sample));
  });

  it("decodeUcpMessage throws UcpDecodeError on malformed JSON", () => {
    expect(() => decodeUcpMessage("{not json")).toThrow(UcpDecodeError);
  });

  it("decodeUcpMessage throws UcpDecodeError on a structurally invalid message", () => {
    expect(() => decodeUcpMessage(JSON.stringify({}))).toThrow(UcpDecodeError);
  });
});

describe("ucp settlement messages — sign/verify + tamper detection", () => {
  it("verifyUcpMessage(signUcpMessage(m)) is valid", () => {
    const kp = generateEd25519();
    const signed = signUcpMessage(sample, kp.privateKey, kp.publicKeySpkiB64);
    expect(verifyUcpMessage(signed).valid).toBe(true);
  });

  it("mutating the message after signing invalidates verification", () => {
    const kp = generateEd25519();
    const signed = signUcpMessage(sample, kp.privateKey, kp.publicKeySpkiB64);
    const tampered = { ...signed, message: { ...signed.message, settlement_finality: "pending" as const } };
    expect(verifyUcpMessage(tampered).valid).toBe(false);
  });

  it("substituting a different public_key invalidates verification", () => {
    const kp1 = generateEd25519();
    const kp2 = generateEd25519();
    const signed = signUcpMessage(sample, kp1.privateKey, kp1.publicKeySpkiB64);
    expect(verifyUcpMessage({ ...signed, public_key: kp2.publicKeySpkiB64 }).valid).toBe(false);
  });
});
