import { describe, it, expect, beforeEach } from "vitest";
import { attestRun, verifyAttestation, hashInput, hashOutput, resetChainForTests, resetKeyForTests, type Attestation } from "./attestation.js";

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

  it("rejects tampering of any signed field", () => {
    const att = attestRun(input, output, "acc-1");
    const tamper = (patch: Partial<Attestation>) => verifyAttestation({ ...att, ...patch });
    expect(tamper({ code_sha256: hashInput({ ...input, code: "evil()" }) })).toBe(false);
    expect(tamper({ output_sha256: hashOutput({ ...output, stdout: "fake" }) })).toBe(false);
    expect(tamper({ exit_code: 1 })).toBe(false);
    expect(tamper({ account_id: "acc-2" })).toBe(false);
    expect(tamper({ signature: Buffer.from("nope").toString("base64") })).toBe(false);
  });

  it("rejects a swapped public key (signature no longer matches)", () => {
    const att = attestRun(input, output, "acc-1");
    resetKeyForTests();
    const other = attestRun(input, output, "acc-1"); // forces a fresh ephemeral key
    expect(verifyAttestation({ ...att, public_key: other.public_key })).toBe(false);
  });
});

describe("attestation chain (merkle tie-in)", () => {
  it("links successive attestations (prev_root chains, index increments)", () => {
    const a = attestRun(input, output, "acc-1");
    const b = attestRun({ ...input, code: "print(2)" }, output, "acc-1");
    expect(a.chain.index).toBe(0);
    expect(b.chain.index).toBe(1);
    expect(b.chain.prev_root).toBe(a.chain.root); // b builds on a's root
    expect(a.chain.root).not.toBe(b.chain.root);
    expect(verifyAttestation(a)).toBe(true);
    expect(verifyAttestation(b)).toBe(true);
  });

  it("reproduces the input+output binding but keeps each attestation chain-unique", () => {
    const a = attestRun(input, output, "acc-1");
    const b = attestRun(input, output, "acc-1");
    expect(b.code_sha256).toBe(a.code_sha256);
    expect(b.output_sha256).toBe(a.output_sha256);
    expect(b.chain.root).not.toBe(a.chain.root);
  });
});
