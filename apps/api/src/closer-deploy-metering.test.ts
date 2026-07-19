/**
 * H-Phase-A cycle 3 — the MCP `closer`/`deploy` tools checked entitlement
 * (isProgramEnabled) but never called any charge function at all, while their
 * REST twins (handleCloserGenerate/handleDeployGenerate, via
 * makeProgramHandler) charge every call through chargeWithDiscounts. An
 * entitled account got unlimited free closer/deploy runs via MCP. Fixed by
 * wiring both through the standard authorize/capture pair (mirrors
 * runAnalyzeFiles/runPreparePurchasing), and by adding both tools to
 * METERED_MCP_TOOLS + PRICING_TIERS so discover_commerce_tools's catalog
 * stops describing them as "included in plan".
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { IncomingMessage } from "node:http";
import {
  resetTestDb,
  createAccount,
  createApiKey,
  getUsageCreditSummary,
  createSnapshot,
  saveContextMap,
  saveRepoProfile,
} from "@axis/snapshots";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { BillingTier } from "@axis/snapshots";
import { runAnalyzeFiles, runCloser, runDeploy } from "./mcp-tool-impls.js";
import { METERED_MCP_TOOLS } from "./mcp-runtime.js";
import { PRICING_TIERS } from "@axis/mpp";

function reqWithKey(rawKey: string, extraHeaders: Record<string, string> = {}): IncomingMessage {
  return { headers: { authorization: `Bearer ${rawKey}`, ...extraHeaders } } as unknown as IncomingMessage;
}

async function makeSuiteAccountWithSnapshot(label: string): Promise<{ accountId: string; rawKey: string; snapshotId: string }> {
  const acc = await createAccount(label, `${label.toLowerCase().replace(/\s+/g, "-")}@test.local`, "suite");
  const { rawKey } = await createApiKey(acc.account_id, "test");
  const text = await runAnalyzeFiles(
    {
      project_name: label,
      project_type: "web_application",
      frameworks: ["react"],
      goals: ["ship it"],
      files: [
        { path: "package.json", content: '{"name":"x","dependencies":{"react":"18.0.0"}}' },
        { path: "src/index.ts", content: "export const x = 1;" },
      ],
    },
    reqWithKey(rawKey),
  );
  const { snapshot_id } = JSON.parse(text) as { snapshot_id: string };
  return { accountId: acc.account_id, rawKey, snapshotId: snapshot_id };
}

/**
 * An account (any tier) with a real, valid snapshot, built via the SAME
 * low-level primitives runAnalyzeFiles itself uses (createSnapshot +
 * buildContextMap/buildRepoProfile + saveContextMap/saveRepoProfile) —
 * deliberately bypassing runAnalyzeFiles' own program-entitlement gate.
 * That gate (blockedPrograms, computed over ALL 20 programs regardless of
 * what's actually requested) has the SAME unset-entitlement hard-block bug
 * this cycle fixed on runCloser/runDeploy/runPreparePurchasing — but it
 * lives in a different function and is disclosed, not fixed, this cycle
 * (see HARDEN_POLISH_LOOP.md). A "paid"/"free" account created directly
 * (never having passed through "suite", which is the only tier createAccount/
 * updateAccountTier auto-populates program_entitlements for) would never
 * reach a snapshot via runAnalyzeFiles at all — going around it here isolates
 * THIS test from that separate, already-disclosed bug.
 */
async function makeAccountWithSnapshot(label: string, tier: BillingTier): Promise<{ accountId: string; rawKey: string; snapshotId: string }> {
  const acc = await createAccount(label, `${label.toLowerCase().replace(/\s+/g, "-")}@test.local`, tier);
  const { rawKey } = await createApiKey(acc.account_id, "test");
  const files = [
    { path: "package.json", content: '{"name":"x","dependencies":{"react":"18.0.0"}}', size: 50 },
    { path: "src/index.ts", content: "export const x = 1;", size: 20 },
  ];
  const snapshot = await createSnapshot(
    {
      input_method: "api_submission",
      manifest: {
        project_name: label,
        project_type: "web_application",
        frameworks: ["react"],
        goals: ["ship it"],
        requested_outputs: [],
      },
      files,
    },
    acc.account_id,
  );
  const ctxMap = buildContextMap(snapshot);
  const repoProfile = buildRepoProfile(snapshot);
  await saveContextMap(snapshot.snapshot_id, ctxMap);
  await saveRepoProfile(snapshot.snapshot_id, repoProfile);
  return { accountId: acc.account_id, rawKey, snapshotId: snapshot.snapshot_id };
}

beforeAll(async () => {
  await resetTestDb();
});

describe("METERED_MCP_TOOLS / PRICING_TIERS — closer and deploy are genuinely metered", () => {
  it("both tools are registered as metered", () => {
    expect(METERED_MCP_TOOLS).toContain("closer");
    expect(METERED_MCP_TOOLS).toContain("deploy");
  });

  it("both tools have an explicit PRICING_TIERS entry (not just the default fallback)", () => {
    expect(PRICING_TIERS.closer).toBeDefined();
    expect(PRICING_TIERS.deploy).toBeDefined();
    expect(PRICING_TIERS.closer.standard_cents).toBe(50);
    expect(PRICING_TIERS.deploy.standard_cents).toBe(50);
  });
});

describe("runCloser meters through authorize/capture", () => {
  it("a successful call debits plan credits", async () => {
    const { accountId, rawKey, snapshotId } = await makeSuiteAccountWithSnapshot("Closer Metered");
    const before = await getUsageCreditSummary(accountId, "suite");
    const text = await runCloser({ snapshot_id: snapshotId }, reqWithKey(rawKey));
    const after = await getUsageCreditSummary(accountId, "suite");
    expect(after.included_credits_used).toBeGreaterThan(before.included_credits_used);

    const parsed = JSON.parse(text) as { program: string; artifact_count: number };
    expect(parsed.program).toBe("closer");
    expect(parsed.artifact_count).toBeGreaterThan(0);
  });

  it("a failed call (unknown snapshot) never debits", async () => {
    const acc = await createAccount("Closer Unbilled", "closer-unbilled@test.local", "suite");
    const { rawKey } = await createApiKey(acc.account_id, "test");
    const before = await getUsageCreditSummary(acc.account_id, "suite");
    await expect(runCloser({ snapshot_id: "snap_does_not_exist" }, reqWithKey(rawKey))).rejects.toThrow("Snapshot not found");
    const after = await getUsageCreditSummary(acc.account_id, "suite");
    expect(after.included_credits_used).toBe(before.included_credits_used);
  });

  it("H-Phase-A cycle 16: a fresh 'paid' account with NO program_entitlements row still succeeds (matches the REST twin, doesn't hard-block on an unset entitlement)", async () => {
    const { accountId, rawKey, snapshotId } = await makeAccountWithSnapshot("Closer Paid Fresh", "paid");
    const before = await getUsageCreditSummary(accountId, "paid");
    const text = await runCloser({ snapshot_id: snapshotId }, reqWithKey(rawKey));
    const after = await getUsageCreditSummary(accountId, "paid");
    expect(after.included_credits_used).toBeGreaterThan(before.included_credits_used);
    const parsed = JSON.parse(text) as { program: string; artifact_count: number };
    expect(parsed.program).toBe("closer");
    expect(parsed.artifact_count).toBeGreaterThan(0);
  });

  it("a genuinely free-tier account is still rejected before any charge", async () => {
    const { accountId, rawKey, snapshotId } = await makeAccountWithSnapshot("Closer Free", "free");
    const before = await getUsageCreditSummary(accountId, "free");
    await expect(runCloser({ snapshot_id: snapshotId }, reqWithKey(rawKey))).rejects.toThrow("closer requires a paid plan");
    const after = await getUsageCreditSummary(accountId, "free");
    expect(after.included_credits_used).toBe(before.included_credits_used);
  });
});

describe("runDeploy meters through authorize/capture", () => {
  it("a successful call debits plan credits", async () => {
    const { accountId, rawKey, snapshotId } = await makeSuiteAccountWithSnapshot("Deploy Metered");
    const before = await getUsageCreditSummary(accountId, "suite");
    const text = await runDeploy({ snapshot_id: snapshotId }, reqWithKey(rawKey));
    const after = await getUsageCreditSummary(accountId, "suite");
    expect(after.included_credits_used).toBeGreaterThan(before.included_credits_used);

    const parsed = JSON.parse(text) as { program: string; artifact_count: number };
    expect(parsed.program).toBe("deploy");
    expect(parsed.artifact_count).toBeGreaterThan(0);
  });

  it("a failed call (unknown snapshot) never debits", async () => {
    const acc = await createAccount("Deploy Unbilled", "deploy-unbilled@test.local", "suite");
    const { rawKey } = await createApiKey(acc.account_id, "test");
    const before = await getUsageCreditSummary(acc.account_id, "suite");
    await expect(runDeploy({ snapshot_id: "snap_does_not_exist" }, reqWithKey(rawKey))).rejects.toThrow("Snapshot not found");
    const after = await getUsageCreditSummary(acc.account_id, "suite");
    expect(after.included_credits_used).toBe(before.included_credits_used);
  });

  it("H-Phase-A cycle 16: a fresh 'paid' account with NO program_entitlements row still succeeds (matches the REST twin, doesn't hard-block on an unset entitlement)", async () => {
    const { accountId, rawKey, snapshotId } = await makeAccountWithSnapshot("Deploy Paid Fresh", "paid");
    const before = await getUsageCreditSummary(accountId, "paid");
    const text = await runDeploy({ snapshot_id: snapshotId }, reqWithKey(rawKey));
    const after = await getUsageCreditSummary(accountId, "paid");
    expect(after.included_credits_used).toBeGreaterThan(before.included_credits_used);
    const parsed = JSON.parse(text) as { program: string; artifact_count: number };
    expect(parsed.program).toBe("deploy");
    expect(parsed.artifact_count).toBeGreaterThan(0);
  });

  it("a genuinely free-tier account is still rejected before any charge", async () => {
    const { accountId, rawKey, snapshotId } = await makeAccountWithSnapshot("Deploy Free", "free");
    const before = await getUsageCreditSummary(accountId, "free");
    await expect(runDeploy({ snapshot_id: snapshotId }, reqWithKey(rawKey))).rejects.toThrow("deploy requires a paid plan");
    const after = await getUsageCreditSummary(accountId, "free");
    expect(after.included_credits_used).toBe(before.included_credits_used);
  });
});
