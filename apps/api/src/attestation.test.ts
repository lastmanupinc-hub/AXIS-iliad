import { describe, it, expect, beforeEach } from "vitest";
import { attestRun, verifyAttestation, verifyChainLink, hashInput, hashOutput, resetChainForTests, resetKeyForTests, type Attestation } from "./attestation.js";

const input = { language: "python", code: "print(1)", stdin: "" };
const output = { stdout: "1\n", stderr: "", exit_code: 0 };

beforeEach(() => {
  resetChainForTests();
  resetKeyForTests();
  delete process.env.AXIS_ATTESTATION_PRIVATE_KEY;
});

describe("hashInput / hashOutput", () => {
  it("are deterministic and input-sensitive", () => {
    expect(hashInput(input)).toBe(hashInput(input));
    expect(hashInput(input)).not.toBe(hashInput({ ...input, code: "print(2)" }));
    expect(hashInput(input)).not.toBe(hashInput({ ...input, language: "node" }));
  });

  it("has unambiguous field boundaries (no code/stdin separator collision)", () => {
    expect(hashInput({ language: "python", code: "a", stdin: "b c" })).not.toBe(
      hashInput({ language: "python", code: "a b", stdin: "c" }),
    );
  });

  it("output hash covers only stdout/stderr/exit_code (duration/image ignored)", () => {
    const withNoise = { ...output, duration_ms: 999, image: "img" } as unknown as typeof output;
    expect(hashOutput(output)).toBe(hashOutput(withNoise));
    expect(hashOutput(output)).not.toBe(hashOutput({ ...output, exit_code: 1 }));
  });
});

describe("attestRun / verifyAttestation", () => {
  it("produces a self-verifying attestation bound to the input + output", () => {
    const att = attestRun(input, output, "acc-1");
    expect(att.version).toBe("axis-attestation/1");
    expect(att.code_sha256).toBe(hashInput(input));
    expect(att.output_sha256).toBe(hashOutput(output));
    expect(att.key_source).toBe("ephemeral"); // no env key in tests
    expect(verifyAttestation(att)).toBe(true);
  });

  it("rejects tampering of any signed field (incl. chain + leaf)", () => {
    const att = attestRun(input, output, "acc-1");
    const t = (patch: Partial<Attestation>) => verifyAttestation({ ...att, ...patch });
    expect(t({ code_sha256: hashInput({ ...input, code: "evil()" }) })).toBe(false);
    expect(t({ output_sha256: hashOutput({ ...output, stdout: "fake" }) })).toBe(false);
    expect(t({ exit_code: 1 })).toBe(false);
    expect(t({ account_id: "acc-2" })).toBe(false);
    expect(t({ attestation_hash: "0".repeat(64) })).toBe(false);
    expect(t({ chain: { ...att.chain, prev_root: "0".repeat(64) } })).toBe(false);
    expect(t({ chain: { ...att.chain, index: 99 } })).toBe(false);
    expect(t({ signature: Buffer.from("nope").toString("base64") })).toBe(false);
  });

  it("pins provenance with expectedPublicKey", () => {
    const att = attestRun(input, output, "acc-1");
    expect(verifyAttestation(att, { expectedPublicKey: att.public_key })).toBe(true);
    expect(verifyAttestation(att, { expectedPublicKey: "someone-elses-key" })).toBe(false);
  });

  it("a forged binding signed with an attacker key fails against the pinned AXIS key", () => {
    const real = attestRun(input, output, "acc-1");
    const axisKey = real.public_key;
    resetKeyForTests(); // simulate a different process / attacker key
    const forged = attestRun({ ...input, code: "rm -rf /" }, { stdout: "all clean", stderr: "", exit_code: 0 }, "acc-1");
    expect(verifyAttestation(forged)).toBe(true); // self-consistent...
    expect(verifyAttestation(forged, { expectedPublicKey: axisKey })).toBe(false); // ...but not AXIS's
  });
});

describe("per-account hash-chain", () => {
  it("links successive attestations within an account; verifyChainLink confirms ordering", () => {
    const a = attestRun(input, output, "acc-1");
    const b = attestRun({ ...input, code: "print(2)" }, output, "acc-1");
    expect(a.chain.index).toBe(0);
    expect(b.chain.index).toBe(1);
    expect(b.chain.prev_root).toBe(a.chain.root);
    expect(verifyChainLink(a, b)).toBe(true);
    expect(verifyChainLink(b, a)).toBe(false); // wrong order
  });

  it("keeps each account's chain independent (no cross-account interleave)", () => {
    const a1 = attestRun(input, output, "acc-1");
    const b1 = attestRun(input, output, "acc-2");
    expect(a1.chain.index).toBe(0);
    expect(b1.chain.index).toBe(0); // independent chains both start at 0
    expect(verifyChainLink(a1, b1)).toBe(false); // different accounts don't link
  });
});

describe("signing key handling", () => {
  it("FAILS LOUD when a configured key is present but malformed (no silent ephemeral downgrade)", () => {
    resetKeyForTests();
    process.env.AXIS_ATTESTATION_PRIVATE_KEY = "not-a-real-key";
    expect(() => attestRun(input, output, "acc-1")).toThrow();
  });
});
