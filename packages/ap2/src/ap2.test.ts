import { describe, it, expect } from "vitest";
import { generateEd25519 } from "./jws.js";
import {
  validateMandate,
  encodeMandate,
  decodeMandate,
  signMandate,
  verifyMandate,
  Ap2DecodeError,
  type IntentMandate,
  type CartMandate,
  type PaymentMandate,
  type Mandate,
} from "./ap2.js";

const intent: IntentMandate = {
  kind: "intent",
  version: "ap2/1",
  id: "intent_abc",
  user_id: "user_1",
  description: "buy widgets",
  constraints: { max_amount: { currency: "USD", value: "50.00" }, allowed_merchants: ["m1"] },
  created_at: "2026-01-01T00:00:00.000Z",
  expires_at: "2026-01-02T00:00:00.000Z",
};

const cart: CartMandate = {
  kind: "cart",
  version: "ap2/1",
  id: "cart_abc",
  intent_ref: "intent_abc",
  merchant_id: "m1",
  items: [
    { sku: "sku-1", name: "Widget", quantity: 2, unit_price: { currency: "USD", value: "10.00" } },
    { sku: "sku-2", name: "Gadget", quantity: 1, unit_price: { currency: "USD", value: "5.00" } },
  ],
  total: { currency: "USD", value: "25.00" },
  created_at: "2026-01-01T00:00:00.000Z",
};

const payment: PaymentMandate = {
  kind: "payment",
  version: "ap2/1",
  id: "payment_abc",
  cart_ref: "cart_abc",
  method: { type: "card", token_ref: "tok_1" },
  amount: { currency: "USD", value: "25.00" },
  created_at: "2026-01-01T00:00:00.000Z",
};

const SAMPLES: Mandate[] = [intent, cart, payment];

describe("ap2 mandates — structural validation", () => {
  it("all three sample mandates validate", () => {
    for (const m of SAMPLES) {
      const result = validateMandate(m);
      expect(result.issues, JSON.stringify(result.issues)).toEqual([]);
      expect(result.valid).toBe(true);
    }
  });

  it("validateMandate({}) is invalid with non-empty issues", () => {
    const result = validateMandate({});
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("validateMandate(null) / validateMandate(array) are invalid", () => {
    expect(validateMandate(null).valid).toBe(false);
    expect(validateMandate([1, 2, 3]).valid).toBe(false);
  });

  it("a CartMandate whose total does not equal sum(items) is invalid", () => {
    const bad: CartMandate = { ...cart, total: { currency: "USD", value: "99.00" } };
    const result = validateMandate(bad);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.path === "total.value")).toBe(true);
  });

  it("a CartMandate total that matches sum(items) with different trailing-zero formatting is valid", () => {
    const ok: CartMandate = { ...cart, total: { currency: "USD", value: "25" } };
    expect(validateMandate(ok).valid).toBe(true);
  });

  it("a CartMandate whose intent_ref does not match the linked IntentMandate id fails cross-reference validation", () => {
    const mismatched: CartMandate = { ...cart, intent_ref: "intent_WRONG" };
    const result = validateMandate(mismatched, { intent });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.path === "intent_ref")).toBe(true);
  });

  it("a CartMandate whose intent_ref DOES match the linked IntentMandate id passes cross-reference validation", () => {
    const result = validateMandate(cart, { intent });
    expect(result.valid).toBe(true);
  });

  it("rejects an unknown mandate kind", () => {
    expect(validateMandate({ ...intent, kind: "bogus" }).valid).toBe(false);
  });

  it("rejects the wrong version string", () => {
    expect(validateMandate({ ...intent, version: "ap2/2" }).valid).toBe(false);
  });

  it("rejects a payment with an invalid method.type", () => {
    expect(validateMandate({ ...payment, method: { type: "crypto" } }).valid).toBe(false);
  });

  it("rejects a cart with an empty items array", () => {
    expect(validateMandate({ ...cart, items: [] }).valid).toBe(false);
  });

  it("rejects a cart item with a non-positive quantity", () => {
    const bad = { ...cart, items: [{ ...cart.items[0], quantity: 0 }] };
    expect(validateMandate(bad).valid).toBe(false);
  });
});

describe("ap2 mandates — encode/decode round-trip", () => {
  it("decodeMandate(encodeMandate(m)) deep-equals m for Intent/Cart/Payment", () => {
    for (const m of SAMPLES) {
      const decoded = decodeMandate(encodeMandate(m));
      expect(decoded).toEqual(m);
    }
  });

  it("encodeMandate is byte-stable across differently-ordered (shuffled-key) input objects", () => {
    const shuffled: CartMandate = {
      created_at: cart.created_at,
      total: cart.total,
      items: cart.items,
      merchant_id: cart.merchant_id,
      intent_ref: cart.intent_ref,
      id: cart.id,
      version: cart.version,
      kind: cart.kind,
    };
    expect(encodeMandate(shuffled)).toBe(encodeMandate(cart));
  });

  it("decodeMandate throws Ap2DecodeError on malformed JSON", () => {
    expect(() => decodeMandate("{not valid json")).toThrow(Ap2DecodeError);
  });

  it("decodeMandate throws Ap2DecodeError on structurally invalid (but syntactically valid) JSON", () => {
    expect(() => decodeMandate(JSON.stringify({}))).toThrow(Ap2DecodeError);
  });
});

describe("ap2 mandates — sign/verify + tamper detection", () => {
  it("verifyMandate(signMandate(m)) is valid for every sample kind", () => {
    const kp = generateEd25519();
    for (const m of SAMPLES) {
      const signed = signMandate(m, kp.privateKey, kp.publicKeySpkiB64);
      const result = verifyMandate(signed);
      expect(result.issues, JSON.stringify(result.issues)).toEqual([]);
      expect(result.valid).toBe(true);
    }
  });

  it("mutating any mandate field after signing invalidates verification", () => {
    const kp = generateEd25519();
    const signed = signMandate(intent, kp.privateKey, kp.publicKeySpkiB64);
    const tampered = { ...signed, mandate: { ...signed.mandate, description: "steal everything" } };
    expect(verifyMandate(tampered).valid).toBe(false);
  });

  it("substituting a different (but validly-formed) public_key invalidates verification", () => {
    const kp1 = generateEd25519();
    const kp2 = generateEd25519();
    const signed = signMandate(payment, kp1.privateKey, kp1.publicKeySpkiB64);
    const substituted = { ...signed, public_key: kp2.publicKeySpkiB64 };
    expect(verifyMandate(substituted).valid).toBe(false);
  });

  it("verifyMandate rejects a structurally invalid mandate even with a valid signature", () => {
    const kp = generateEd25519();
    const brokenCart = { ...cart, total: { currency: "USD", value: "999.00" } };
    const signed = signMandate(brokenCart, kp.privateKey, kp.publicKeySpkiB64);
    const result = verifyMandate(signed);
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});
