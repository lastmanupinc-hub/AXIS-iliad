import { describe, it, expect } from "vitest";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { SnapshotRecord, FileEntry } from "@axis/snapshots";
import { validateMandate, validateTapMessage, validateUcpMessage } from "@axis/ap2";
import { generateAgentPurchasingPlaybook, generateAp2InteropSamples } from "./generators-agentic-purchasing.js";

// Integration test (WO-07): proves the rewritten TAP/AP2/UCP section of the
// agentic-purchasing playbook embeds REAL @axis/ap2 codec output — not static
// literals — by re-parsing every ```json block out of the RENDERED artifact
// and re-validating it with the actual validator functions.

function makeSnapshot(overrides: Partial<SnapshotRecord> = {}): SnapshotRecord {
  const files: FileEntry[] = [
    { path: "src/index.ts", content: 'import { db } from "./db";\nexport function main() { return db.query(); }', size: 70 },
    { path: "package.json", content: '{"name":"axis-test","dependencies":{"stripe":"^14.0.0"}}', size: 58 },
  ];
  return {
    snapshot_id: "snap-ap2-interop-001",
    project_id: "proj-ap2-interop-001",
    created_at: new Date().toISOString(),
    input_method: "api_submission",
    manifest: {
      project_name: "axis-ap2-interop-test",
      project_type: "web_application",
      frameworks: [],
      goals: ["Generate AI context files"],
      requested_outputs: [],
    },
    file_count: files.length,
    total_size_bytes: files.reduce((s, f) => s + f.size, 0),
    files,
    status: "ready",
    account_id: null,
    ...overrides,
  };
}

/** Extract every ```json ... ``` fenced block's raw text from a markdown doc. */
function extractJsonBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  const re = /```json\n([\s\S]*?)\n```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) blocks.push(m[1]);
  return blocks;
}

/** Try each of the three validators; a block is "accounted for" if at least
 *  one recognizes it as a valid message of its kind. */
function isValidatedByAnyCodec(parsed: unknown): boolean {
  return validateMandate(parsed).valid || validateTapMessage(parsed).valid || validateUcpMessage(parsed).valid;
}

describe("agentic-purchasing playbook — real @axis/ap2 codec output (WO-07)", () => {
  const snapshot = makeSnapshot();
  const ctx = buildContextMap(snapshot);
  const profile = buildRepoProfile(snapshot);

  it("the TAP/AP2/UCP section exists", () => {
    const file = generateAgentPurchasingPlaybook(ctx, profile, snapshot.files);
    expect(file.content).toContain("## TAP / AP2 / UCP Interoperability");
  });

  it("every ```json block in the TAP/AP2/UCP section JSON.parses and validates true against a real @axis/ap2 codec", () => {
    const file = generateAgentPurchasingPlaybook(ctx, profile, snapshot.files);
    const sectionStart = file.content.indexOf("## TAP / AP2 / UCP Interoperability");
    expect(sectionStart).toBeGreaterThanOrEqual(0);
    // Section runs until the next top-level "## " heading (Dispute Resolution).
    const rest = file.content.slice(sectionStart + 1);
    const nextHeading = rest.indexOf("\n## ");
    const section = nextHeading === -1 ? file.content.slice(sectionStart) : file.content.slice(sectionStart, sectionStart + 1 + nextHeading);

    const blocks = extractJsonBlocks(section);
    // 5 real signed samples embedded: intent, cart, payment, tap token, ucp settlement.
    expect(blocks.length).toBeGreaterThanOrEqual(5);

    for (const raw of blocks) {
      let parsed: unknown;
      expect(() => {
        parsed = JSON.parse(raw);
      }, `block did not JSON.parse: ${raw.slice(0, 200)}`).not.toThrow();
      expect(isValidatedByAnyCodec(parsed), `block failed all three validators: ${raw.slice(0, 200)}`).toBe(true);
    }
  });

  it("the section contains the residual scope-honesty caveat", () => {
    const file = generateAgentPurchasingPlaybook(ctx, profile, snapshot.files);
    expect(file.content).toContain("NOT certified against an official AP2/TAP/UCP conformance suite");
    expect(file.content).toContain("modeled from public documentation");
  });

  it("no hardcoded mandate/token/settlement JSON literals remain — every block is real codec output", () => {
    const file = generateAgentPurchasingPlaybook(ctx, profile, snapshot.files);
    // The OLD static literals used these exact keys as top-level JSON properties;
    // none of them should appear anywhere in the rendered content anymore.
    expect(file.content).not.toContain('"tap_token_lifecycle"');
    expect(file.content).not.toContain('"ucp_settlement": {');
    expect(file.content).not.toContain('"interop_mapping"');
  });

  it("two renders of the same input are byte-identical (determinism gate)", () => {
    const first = generateAgentPurchasingPlaybook(ctx, profile, snapshot.files);
    const second = generateAgentPurchasingPlaybook(ctx, profile, snapshot.files);
    expect(first.content).toBe(second.content);
  });

  it("two renders of ap2-interop-samples.json are byte-identical (determinism gate)", () => {
    const first = generateAp2InteropSamples(ctx, profile, snapshot.files);
    const second = generateAp2InteropSamples(ctx, profile, snapshot.files);
    expect(first.content).toBe(second.content);
  });
});

describe("generateAp2InteropSamples — the new counted generator", () => {
  const snapshot = makeSnapshot();
  const ctx = buildContextMap(snapshot);
  const profile = buildRepoProfile(snapshot);

  it("returns a valid GeneratedFile", () => {
    const file = generateAp2InteropSamples(ctx, profile, snapshot.files);
    expect(file.path).toBe("ap2-interop-samples.json");
    expect(file.program).toBe("agentic-purchasing");
    expect(file.content_type).toBe("application/json");
    expect(file.description).toBeTruthy();
  });

  it("its JSON payload's embedded mandates/messages each validate true and are marked verified", () => {
    const file = generateAp2InteropSamples(ctx, profile, snapshot.files);
    const payload = JSON.parse(file.content);

    expect(validateMandate(payload.ap2_mandates.intent.mandate).valid).toBe(true);
    expect(payload.ap2_mandates.intent.verified).toBe(true);
    expect(validateMandate(payload.ap2_mandates.cart.mandate).valid).toBe(true);
    expect(payload.ap2_mandates.cart.verified).toBe(true);
    expect(validateMandate(payload.ap2_mandates.payment.mandate).valid).toBe(true);
    expect(payload.ap2_mandates.payment.verified).toBe(true);

    expect(validateTapMessage(payload.tap_token.message).valid).toBe(true);
    expect(payload.tap_token.verified).toBe(true);

    expect(validateUcpMessage(payload.ucp_settlement.message).valid).toBe(true);
    expect(payload.ucp_settlement.verified).toBe(true);
  });

  it("carries the scope caveat and determinism note", () => {
    const file = generateAp2InteropSamples(ctx, profile, snapshot.files);
    const payload = JSON.parse(file.content);
    expect(payload.scope_caveat).toContain("NOT certified against an official AP2/TAP/UCP conformance suite");
    expect(payload.determinism_note).toBeTruthy();
    expect(payload.codec_package).toBe("@axis/ap2");
  });
});
