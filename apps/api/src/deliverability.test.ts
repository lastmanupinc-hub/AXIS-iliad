import { describe, it, expect } from "vitest";
import { createPrivateKey, createPublicKey } from "node:crypto";
import { assertValidDomain, buildSpfRecord, buildDmarcRecord, generateDkim, buildWarmupSchedule, buildDeliverabilityKit } from "./deliverability.js";

describe("assertValidDomain", () => {
  it("accepts valid domains", () => {
    expect(() => assertValidDomain("example.com")).not.toThrow();
    expect(() => assertValidDomain("mail.sub.example.co.uk")).not.toThrow();
    expect(() => assertValidDomain("shop.xn--p1ai")).not.toThrow(); // internationalized (punycode) TLD
  });
  it("rejects injection / malformed domains", () => {
    expect(() => assertValidDomain("ex ample.com")).toThrow();
    expect(() => assertValidDomain("example.com\nv=spf1 evil")).toThrow();
    expect(() => assertValidDomain("nope")).toThrow();
    expect(() => assertValidDomain("")).toThrow();
    expect(() => assertValidDomain("-bad.com")).toThrow();
  });
});

describe("buildSpfRecord / buildDmarcRecord", () => {
  it("uses the provider include, defaults for unknown", () => {
    expect(buildSpfRecord("x.com", "sendgrid").value).toContain("include:sendgrid.net");
    expect(buildSpfRecord("x.com", "mystery").value).toContain("include:amazonses.com");
    expect(buildSpfRecord("x.com", "resend").value).toBe("v=spf1 include:amazonses.com ~all");
  });
  it("builds DMARC at the _dmarc host with the policy", () => {
    const r = buildDmarcRecord("x.com", "quarantine");
    expect(r.host).toBe("_dmarc.x.com");
    expect(r.value).toContain("p=quarantine");
    expect(r.value).toContain("rua=mailto:dmarc@x.com");
  });
});

describe("generateDkim", () => {
  it("produces a parseable keypair + a valid DKIM record", () => {
    const { record, private_key_pem } = generateDkim("x.com", "sel1");
    expect(record.host).toBe("sel1._domainkey.x.com");
    expect(record.value).toMatch(/^v=DKIM1; k=rsa; p=[A-Za-z0-9+/=]+$/);
    expect(() => createPrivateKey(private_key_pem)).not.toThrow();
    const pubB64 = record.value.split("p=")[1];
    expect(() => createPublicKey({ key: Buffer.from(pubB64, "base64"), format: "der", type: "spki" })).not.toThrow();
  });
  it("generates a fresh key each call", () => {
    expect(generateDkim("x.com", "s").private_key_pem).not.toBe(generateDkim("x.com", "s").private_key_pem);
  });
});

describe("buildWarmupSchedule", () => {
  it("doubles, caps, and bounds days", () => {
    const s = buildWarmupSchedule({ days: 5, start: 100, cap: 800 });
    expect(s.length).toBe(5);
    expect(s[0].max_sends).toBe(100);
    expect(s[1].max_sends).toBe(200);
    expect(s[s.length - 1].max_sends).toBeLessThanOrEqual(800);
    expect(buildWarmupSchedule({ days: 999 }).length).toBe(60); // day count is bounded
  });
});

describe("buildDeliverabilityKit", () => {
  it("assembles SPF + DKIM + DMARC + warmup + checklist", () => {
    const kit = buildDeliverabilityKit("mail.example.com", { provider: "resend", selector: "axis2026" });
    expect(kit.dns_records.map((r) => r.purpose).sort()).toEqual(["DKIM", "DMARC", "SPF"]);
    expect(kit.dkim_private_key_pem).toContain("PRIVATE KEY");
    expect(kit.dkim_selector).toBe("axis2026");
    expect(kit.warmup_schedule.length).toBeGreaterThan(0);
    expect(kit.checklist.length).toBeGreaterThan(0);
  });
  it("rejects a bad domain or selector", () => {
    expect(() => buildDeliverabilityKit("bad domain")).toThrow();
    expect(() => buildDeliverabilityKit("x.com", { selector: "bad selector!" })).toThrow();
  });
});
