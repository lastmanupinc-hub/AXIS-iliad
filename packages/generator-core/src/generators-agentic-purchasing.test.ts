import { describe, it, expect } from "vitest";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { SnapshotRecord, FileEntry } from "@axis/snapshots";
import {
  generateAgentPurchasingPlaybook,
  generateProductSchema,
  generateCheckoutFlow,
  generateNegotiationRules,
  generateCommerceRegistry,
} from "./generators-agentic-purchasing.js";

function makeSnapshot(overrides: Partial<SnapshotRecord> = {}): SnapshotRecord {
  const files: FileEntry[] = [
    { path: "src/index.ts", content: 'import { db } from "./db";\nexport function main() { return db.query(); }', size: 70 },
    { path: "src/db.ts", content: 'export const db = { query: () => [] };', size: 38 },
    { path: "next.config.mjs", content: "export default {}", size: 18 },
    { path: "package.json", content: '{"name":"axis-test","dependencies":{"next":"14.0.0","react":"18.0.0"}}', size: 72 },
    { path: "app/page.tsx", content: "export default function Home() { return <div>Home</div> }", size: 58 },
    { path: ".github/workflows/ci.yml", content: "name: CI\non: [push]", size: 20 },
    { path: "tsconfig.json", content: '{"compilerOptions":{"strict":true}}', size: 34 },
  ];
  return {
    snapshot_id: "snap-ap-001",
    project_id: "proj-ap-001",
    created_at: new Date().toISOString(),
    input_method: "api_submission",
    manifest: {
      project_name: "axis-test",
      project_type: "web_application",
      frameworks: ["next", "react"],
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

describe("generateAgentPurchasingPlaybook", () => {
  const snapshot = makeSnapshot();
  const ctx = buildContextMap(snapshot);
  const profile = buildRepoProfile(snapshot);

  it("returns a GeneratedFile with correct path and program", () => {
    const file = generateAgentPurchasingPlaybook(ctx, profile);
    expect(file.path).toBe("agent-purchasing-playbook.md");
    expect(file.program).toBe("agentic-purchasing");
    expect(file.content_type).toBe("text/markdown");
    expect(file.description).toBeTruthy();
  });

  it("content contains project name and MCP endpoint", () => {
    const file = generateAgentPurchasingPlaybook(ctx, profile);
    expect(file.content).toContain("axis-test");
    expect(file.content).toContain("POST /mcp");
  });

  it("content includes step-by-step purchasing flow", () => {
    const file = generateAgentPurchasingPlaybook(ctx, profile);
    expect(file.content).toContain("Step 1");
    expect(file.content).toContain("Step 2");
    expect(file.content).toContain("Step 3");
    expect(file.content).toContain("Step 4");
  });

  it("content includes free and pro program classification", () => {
    const file = generateAgentPurchasingPlaybook(ctx, profile);
    expect(file.content).toContain("free");
    expect(file.content).toContain("pro");
    expect(file.content).toContain("skills");
    expect(file.content).toContain("debug");
  });

  it("includes framework recommendations when frameworks detected", () => {
    const file = generateAgentPurchasingPlaybook(ctx, profile);
    // next.js detected → frontend mention
    expect(file.content).toContain("**frontend**");
  });

  it("content includes autonomous purchase decision rules", () => {
    const file = generateAgentPurchasingPlaybook(ctx, profile);
    expect(file.content).toContain("SHOULD purchase");
    expect(file.content).toContain("SHOULD NOT");
  });
});

describe("generateProductSchema", () => {
  const snapshot = makeSnapshot();
  const ctx = buildContextMap(snapshot);
  const profile = buildRepoProfile(snapshot);

  it("returns a GeneratedFile with correct path and program", () => {
    const file = generateProductSchema(ctx, profile);
    expect(file.path).toBe("product-schema.json");
    expect(file.program).toBe("agentic-purchasing");
    expect(file.content_type).toBe("application/json");
    expect(file.description).toBeTruthy();
  });

  it("content is valid JSON", () => {
    const file = generateProductSchema(ctx, profile);
    expect(() => JSON.parse(file.content)).not.toThrow();
  });

  it("schema includes all 18 programs", () => {
    const file = generateProductSchema(ctx, profile);
    const schema = JSON.parse(file.content);
    expect(schema.programs).toHaveLength(18);
    expect(schema.total_programs).toBe(18);
    expect(schema.total_outputs).toBe(87);
  });

  it("schema includes required structural fields", () => {
    const file = generateProductSchema(ctx, profile);
    const schema = JSON.parse(file.content);
    expect(schema.schema_version).toBe("1.0");
    expect(schema.product).toBe("AXIS Toolbox");
    expect(schema.mcp_endpoint).toBe("POST /mcp");
    expect(schema.auth).toBeTruthy();
    expect(schema.auth.type).toBe("bearer");
  });

  it("schema programs have required fields", () => {
    const file = generateProductSchema(ctx, profile);
    const schema = JSON.parse(file.content);
    for (const program of schema.programs) {
      expect(program.slug).toBeTruthy();
      expect(["free", "pro"]).toContain(program.tier);
      expect(typeof program.outputs).toBe("number");
      expect(program.description).toBeTruthy();
    }
  });

  it("schema includes agentic-purchasing entry", () => {
    const file = generateProductSchema(ctx, profile);
    const schema = JSON.parse(file.content);
    const ap = schema.programs.find((p: { slug: string }) => p.slug === "agentic-purchasing");
    expect(ap).toBeTruthy();
    expect(ap.tier).toBe("pro");
    expect(ap.outputs).toBe(5);
  });
});

describe("generateCheckoutFlow", () => {
  const snapshot = makeSnapshot();
  const ctx = buildContextMap(snapshot);
  const profile = buildRepoProfile(snapshot);

  it("returns a GeneratedFile with correct path and program", () => {
    const file = generateCheckoutFlow(ctx, profile);
    expect(file.path).toBe("checkout-flow.md");
    expect(file.program).toBe("agentic-purchasing");
    expect(file.content_type).toBe("text/markdown");
    expect(file.description).toBeTruthy();
  });

  it("content contains project name", () => {
    const file = generateCheckoutFlow(ctx, profile);
    expect(file.content).toContain("axis-test");
  });

  it("content includes decision tree steps", () => {
    const file = generateCheckoutFlow(ctx, profile);
    expect(file.content).toContain("Intent Validation");
    expect(file.content).toContain("Program Selection");
    expect(file.content).toContain("API Call Sequence");
    expect(file.content).toContain("Post-Purchase Verification");
  });

  it("content includes all API call steps", () => {
    const file = generateCheckoutFlow(ctx, profile);
    expect(file.content).toContain("Step 1:");
    expect(file.content).toContain("Step 2:");
    expect(file.content).toContain("analyze_repo");
  });

  it("content includes error recovery table", () => {
    const file = generateCheckoutFlow(ctx, profile);
    expect(file.content).toContain("401");
    expect(file.content).toContain("429");
    expect(file.content).toContain("404 Snapshot Not Found");
    expect(file.content).toContain("Quota Exceeded");
  });

  it("content includes agent authorization policy", () => {
    const file = generateCheckoutFlow(ctx, profile);
    expect(file.content).toContain("pro");
    expect(file.content).toContain("free");
    expect(file.content).toContain("bearer");
  });
});

describe("generateNegotiationRules", () => {
  const snapshot = makeSnapshot();
  const ctx = buildContextMap(snapshot);
  const profile = buildRepoProfile(snapshot);

  it("returns a GeneratedFile with correct path and program", () => {
    const file = generateNegotiationRules(ctx, profile);
    expect(file.path).toBe("negotiation-rules.md");
    expect(file.program).toBe("agentic-purchasing");
    expect(file.content_type).toBe("text/markdown");
    expect(file.description).toBeTruthy();
  });

  it("content contains project name and complexity estimate", () => {
    const file = generateNegotiationRules(ctx, profile);
    expect(file.content).toContain("axis-test");
    expect(file.content).toMatch(/low|medium|high/);
  });

  it("content includes value assessment formula", () => {
    const file = generateNegotiationRules(ctx, profile);
    expect(file.content).toContain("value_score");
    expect(file.content).toContain("Estimated value score");
  });

  it("content includes purchase decision rules", () => {
    const file = generateNegotiationRules(ctx, profile);
    expect(file.content).toContain("Automatic APPROVE");
    expect(file.content).toContain("Automatic REJECT");
    expect(file.content).toContain("Negotiate");
  });

  it("content includes comparison matrix", () => {
    const file = generateNegotiationRules(ctx, profile);
    expect(file.content).toContain("Comparison Matrix");
    expect(file.content).toContain("AXIS analyze");
    expect(file.content).toContain("Manual grep");
  });

  it("content includes agent accountability section", () => {
    const file = generateNegotiationRules(ctx, profile);
    expect(file.content).toContain("Agent Accountability");
    expect(file.content).toContain("snapshot_id");
  });

  it("uses 'high' complexity when profile has >2 risk flags", () => {
    const richSnapshot = makeSnapshot({
      manifest: {
        project_name: "axis-test",
        project_type: "web_application",
        frameworks: ["next", "react"],
        goals: [],
        requested_outputs: [],
      },
    });
    const richCtx = buildContextMap(richSnapshot);
    const richProfile = buildRepoProfile(richSnapshot);
    // Inject low separation_score for high-complexity branch
    const flaggedProfile = { ...richProfile, health: { ...richProfile.health, separation_score: 0.1 } };
    const file = generateNegotiationRules(richCtx, flaggedProfile);
    expect(file.content).toContain("high");
  });

  it("uses 'medium' complexity when profile has 1-2 risk flags", () => {
    const profile2 = buildRepoProfile(makeSnapshot());
    const flaggedProfile = { ...profile2, health: { ...profile2.health, separation_score: 0.5 } };
    const file = generateNegotiationRules(ctx, flaggedProfile);
    expect(file.content).toContain("medium");
  });
});

describe("generateCommerceRegistry", () => {
  const snapshot = makeSnapshot();
  const ctx = buildContextMap(snapshot);
  const profile = buildRepoProfile(snapshot);

  it("returns a GeneratedFile with correct path and program", () => {
    const file = generateCommerceRegistry(ctx, profile);
    expect(file.path).toBe("commerce-registry.json");
    expect(file.program).toBe("agentic-purchasing");
    expect(file.content_type).toBe("application/json");
    expect(file.description).toBeTruthy();
  });

  it("content is valid JSON", () => {
    const file = generateCommerceRegistry(ctx, profile);
    expect(() => JSON.parse(file.content)).not.toThrow();
  });

  it("registry has required top-level fields", () => {
    const file = generateCommerceRegistry(ctx, profile);
    const registry = JSON.parse(file.content);
    expect(registry.registry_version).toBe("1.0");
    expect(registry.product).toBe("AXIS Toolbox");
    expect(registry.mcp_endpoint).toBe("POST /mcp");
    expect(registry.auth).toBeTruthy();
    expect(registry.auth.type).toBe("bearer");
    expect(registry.catalog).toBeInstanceOf(Array);
    expect(registry.agent_endpoints).toBeInstanceOf(Array);
  });

  it("registry contains project name", () => {
    const file = generateCommerceRegistry(ctx, profile);
    const registry = JSON.parse(file.content);
    expect(registry.project).toBe("axis-test");
  });

  it("catalog includes free and pro bundles", () => {
    const file = generateCommerceRegistry(ctx, profile);
    const registry = JSON.parse(file.content);
    const freeBundle = registry.catalog.find((c: { id: string }) => c.id === "free-bundle");
    const proAll = registry.catalog.find((c: { id: string }) => c.id === "pro-all");
    expect(freeBundle).toBeTruthy();
    expect(proAll).toBeTruthy();
    expect(freeBundle.tier).toBe("free");
    expect(proAll.tier).toBe("pro");
  });

  it("agent_endpoints includes MCP endpoint", () => {
    const file = generateCommerceRegistry(ctx, profile);
    const registry = JSON.parse(file.content);
    const mcpEndpoint = registry.agent_endpoints.find(
      (e: { path: string }) => e.path === "/mcp"
    );
    expect(mcpEndpoint).toBeTruthy();
    expect(mcpEndpoint.method).toBe("POST");
  });

  it("auth has obtain instructions", () => {
    const file = generateCommerceRegistry(ctx, profile);
    const registry = JSON.parse(file.content);
    expect(registry.auth.obtain).toContain("raw_key");
    expect(registry.auth.format).toContain("Bearer");
  });
});

// ─── eq_190: Commerce Signal Detection (via generators) ──────────

const stripeFiles: FileEntry[] = [
  { path: "src/payments/stripe.ts", content: "import Stripe from 'stripe'; const stripe = new Stripe(key); async function checkout() { return stripe.paymentIntents.create({}); }", size: 130 },
  { path: "src/webhooks.ts",        content: "app.post('/webhook', (req) => { const event = stripe.webhooks.constructEvent(req.body, sig, secret); })", size: 100 },
  { path: "src/checkout.ts",        content: "export async function handleCheckout() { const session = await stripe.checkout.sessions.create({}); }", size: 95 },
  { path: "src/subscriptions.ts",   content: "// recurring billing: create subscription mandate with billing_cycle_anchor", size: 70 },
  { path: "src/disputes.ts",        content: "// handle chargeback and refund events", size: 45 },
  { path: "src/3ds.ts",             content: "// 3ds2 sca challenge flow — frictionless vs redirect", size: 55 },
];

function makeStripeSnapshot(): SnapshotRecord {
  return {
    snapshot_id: "snap-stripe-001",
    project_id: "proj-stripe-001",
    created_at: new Date().toISOString(),
    input_method: "api_submission",
    manifest: {
      project_name: "stripe-commerce",
      project_type: "web_application",
      frameworks: ["react"],
      goals: ["Enable agentic purchasing"],
      requested_outputs: [],
    },
    file_count: stripeFiles.length,
    total_size_bytes: stripeFiles.reduce((s, f) => s + f.size, 0),
    files: stripeFiles,
    status: "ready",
    account_id: null,
  };
}

describe("generateAgentPurchasingPlaybook — commerce signal detection", () => {
  const stripeSnap = makeStripeSnapshot();
  const stripeCtx = buildContextMap(stripeSnap);
  const stripeProfile = buildRepoProfile(stripeSnap);

  it("detects stripe provider and includes in content", () => {
    const file = generateAgentPurchasingPlaybook(stripeCtx, stripeProfile, stripeFiles);
    expect(file.content).toContain("stripe");
  });

  it("shows checkout flow as detected", () => {
    const file = generateAgentPurchasingPlaybook(stripeCtx, stripeProfile, stripeFiles);
    expect(file.content).toContain("✅ Detected");
  });

  it("shows SCA/3DS2 as detected when 3ds file present", () => {
    const file = generateAgentPurchasingPlaybook(stripeCtx, stripeProfile, stripeFiles);
    expect(file.content).toContain("SCA/3DS2 handling: ✅ Detected");
  });

  it("shows recurring billing as detected", () => {
    const file = generateAgentPurchasingPlaybook(stripeCtx, stripeProfile, stripeFiles);
    expect(file.content).toContain("Recurring/mandate billing: ✅ Detected");
  });

  it("shows dispute handling as detected", () => {
    const file = generateAgentPurchasingPlaybook(stripeCtx, stripeProfile, stripeFiles);
    expect(file.content).toContain("Dispute/refund handling: ✅ Detected");
  });

  it("includes AP2 Mandate Requirements table header", () => {
    const file = generateAgentPurchasingPlaybook(stripeCtx, stripeProfile, stripeFiles);
    expect(file.content).toContain("AP2 Mandate Requirements");
  });

  it("paypal provider — mandate type shows single/recurring", () => {
    const paypalFiles: FileEntry[] = [
      { path: "src/pay.ts", content: "import { PayPalScriptProvider } from '@paypal/react-paypal-js'; const checkout = () => paypal.order.create({})", size: 100 },
    ];
    const snap = makeSnapshot({ files: paypalFiles, file_count: 1, total_size_bytes: 100 });
    const ctx = buildContextMap(snap);
    const profile = buildRepoProfile(snap);
    const file = generateAgentPurchasingPlaybook(ctx, profile, paypalFiles);
    expect(file.content).toContain("single/recurring");
    expect(file.content).toContain("⚠️ Verify");
  });

  it("unknown provider — mandate type shows single and Verify", () => {
    const klarnaFiles: FileEntry[] = [
      { path: "src/pay.ts", content: "import Klarna from 'klarna'; const buy = () => klarna.payments.init({})", size: 85 },
    ];
    const snap = makeSnapshot({ files: klarnaFiles, file_count: 1, total_size_bytes: 85 });
    const ctx = buildContextMap(snap);
    const profile = buildRepoProfile(snap);
    const file = generateAgentPurchasingPlaybook(ctx, profile, klarnaFiles);
    // "single" appears as the mandate type for unknown providers
    expect(file.content).toContain("klarna");
    expect(file.content).toContain("⚠️ Verify");
  });

  it("without files — shows not detected for all signals", () => {
    const file = generateAgentPurchasingPlaybook(stripeCtx, stripeProfile, undefined);
    expect(file.content).toContain("No payment providers detected");
    expect(file.content).toContain("❌ Not detected");
  });

  it("empty files array — shows not detected", () => {
    const file = generateAgentPurchasingPlaybook(stripeCtx, stripeProfile, []);
    expect(file.content).toContain("No payment providers detected");
  });
});

describe("generateProductSchema — repo_commerce_profile", () => {
  const stripeSnap = makeStripeSnapshot();
  const stripeCtx = buildContextMap(stripeSnap);
  const stripeProfile = buildRepoProfile(stripeSnap);

  it("includes repo_commerce_profile in schema", () => {
    const file = generateProductSchema(stripeCtx, stripeProfile, stripeFiles);
    const schema = JSON.parse(file.content);
    expect(schema.repo_commerce_profile).toBeDefined();
  });

  it("repo_commerce_profile.detected_payment_providers includes stripe", () => {
    const file = generateProductSchema(stripeCtx, stripeProfile, stripeFiles);
    const schema = JSON.parse(file.content);
    expect(schema.repo_commerce_profile.detected_payment_providers).toContain("stripe");
  });

  it("repo_commerce_profile.capabilities.checkout_flow is true for stripe files", () => {
    const file = generateProductSchema(stripeCtx, stripeProfile, stripeFiles);
    const schema = JSON.parse(file.content);
    expect(schema.repo_commerce_profile.capabilities.checkout_flow).toBe(true);
  });

  it("repo_commerce_profile.capabilities.sca_3ds2 is true when 3ds file present", () => {
    const file = generateProductSchema(stripeCtx, stripeProfile, stripeFiles);
    const schema = JSON.parse(file.content);
    expect(schema.repo_commerce_profile.capabilities.sca_3ds2).toBe(true);
  });

  it("ap2_mandate_compliance.ready_for_autonomous_purchase is true when providers detected", () => {
    const file = generateProductSchema(stripeCtx, stripeProfile, stripeFiles);
    const schema = JSON.parse(file.content);
    expect(schema.repo_commerce_profile.ap2_mandate_compliance.ready_for_autonomous_purchase).toBe(true);
  });

  it("ap2_mandate_compliance.ready_for_autonomous_purchase is false when no files", () => {
    const snapshot = makeSnapshot();
    const ctx = buildContextMap(snapshot);
    const profile = buildRepoProfile(snapshot);
    const file = generateProductSchema(ctx, profile, []);
    const schema = JSON.parse(file.content);
    expect(schema.repo_commerce_profile.ap2_mandate_compliance.ready_for_autonomous_purchase).toBe(false);
  });

  it("ap2_mandate_compliance contains mandate_data_format", () => {
    const file = generateProductSchema(stripeCtx, stripeProfile, stripeFiles);
    const schema = JSON.parse(file.content);
    expect(schema.repo_commerce_profile.ap2_mandate_compliance.mandate_data_format).toContain("AP2");
  });

  it("ap2_mandate_compliance contains ucp_settlement_path", () => {
    const file = generateProductSchema(stripeCtx, stripeProfile, stripeFiles);
    const schema = JSON.parse(file.content);
    expect(schema.repo_commerce_profile.ap2_mandate_compliance.ucp_settlement_path).toContain("UCP");
  });

  it("ap2_mandate_compliance contains visa_intelligent_commerce", () => {
    const file = generateProductSchema(stripeCtx, stripeProfile, stripeFiles);
    const schema = JSON.parse(file.content);
    expect(schema.repo_commerce_profile.ap2_mandate_compliance.visa_intelligent_commerce).toContain("Visa IC");
  });
});

describe("generateCheckoutFlow — AP2 mandate schema and SCA spec", () => {
  const stripeSnap = makeStripeSnapshot();
  const stripeCtx = buildContextMap(stripeSnap);
  const stripeProfile = buildRepoProfile(stripeSnap);

  it("includes Payment Mandate Schema section", () => {
    const file = generateCheckoutFlow(stripeCtx, stripeProfile, stripeFiles);
    expect(file.content).toContain("Payment Mandate Schema");
  });

  it("mandate schema contains AP2 Article 2 fields", () => {
    const file = generateCheckoutFlow(stripeCtx, stripeProfile, stripeFiles);
    expect(file.content).toContain("mandate_type");
    expect(file.content).toContain("network_token");
    expect(file.content).toContain("sca_exemption");
    expect(file.content).toContain("ucp_settlement");
  });

  it("includes SCA / 3DS2 Handling section", () => {
    const file = generateCheckoutFlow(stripeCtx, stripeProfile, stripeFiles);
    expect(file.content).toContain("SCA / 3DS2 Handling");
  });

  it("shows SCA detected when 3ds file present", () => {
    const file = generateCheckoutFlow(stripeCtx, stripeProfile, stripeFiles);
    expect(file.content).toContain("✅ SCA/3DS2 code detected");
  });

  it("shows SCA not detected when no 3ds files", () => {
    const snapshot = makeSnapshot();
    const ctx = buildContextMap(snapshot);
    const profile = buildRepoProfile(snapshot);
    const file = generateCheckoutFlow(ctx, profile, []);
    expect(file.content).toContain("⚠️ No SCA/3DS2 code detected");
  });

  it("includes SCA exemption reason table", () => {
    const file = generateCheckoutFlow(stripeCtx, stripeProfile, stripeFiles);
    expect(file.content).toContain("low_value exemption");
    expect(file.content).toContain("trusted_beneficiary");
    expect(file.content).toContain("recurring exemption");
  });

  it("includes Zero-Click Checkout Rule", () => {
    const file = generateCheckoutFlow(stripeCtx, stripeProfile, stripeFiles);
    expect(file.content).toContain("Zero-Click Checkout Rule");
  });

  it("includes Dispute and Return Flow section", () => {
    const file = generateCheckoutFlow(stripeCtx, stripeProfile, stripeFiles);
    expect(file.content).toContain("Dispute and Return Flow");
  });

  it("shows dispute handling detected when dispute file present", () => {
    const file = generateCheckoutFlow(stripeCtx, stripeProfile, stripeFiles);
    expect(file.content).toContain("✅ Dispute/refund handling detected");
  });

  it("shows dispute not detected when no dispute files", () => {
    const snapshot = makeSnapshot();
    const ctx = buildContextMap(snapshot);
    const profile = buildRepoProfile(snapshot);
    const file = generateCheckoutFlow(ctx, profile, []);
    expect(file.content).toContain("⚠️ No dispute handling code detected");
  });

  it("includes 402 Payment Required in error recovery", () => {
    const file = generateCheckoutFlow(stripeCtx, stripeProfile, stripeFiles);
    expect(file.content).toContain("402 Payment Required");
  });

  it("includes Return Policy section", () => {
    const file = generateCheckoutFlow(stripeCtx, stripeProfile, stripeFiles);
    expect(file.content).toContain("Return Policy");
  });
});

describe("generateNegotiationRules — AP2/UCP mandate constraints", () => {
  const stripeSnap = makeStripeSnapshot();
  const stripeCtx = buildContextMap(stripeSnap);
  const stripeProfile = buildRepoProfile(stripeSnap);

  it("includes AP2/UCP Mandate Compliance Constraints section", () => {
    const file = generateNegotiationRules(stripeCtx, stripeProfile, stripeFiles);
    expect(file.content).toContain("AP2/UCP Mandate Compliance Constraints");
  });

  it("includes provider rows in mandate constraints table", () => {
    const file = generateNegotiationRules(stripeCtx, stripeProfile, stripeFiles);
    expect(file.content).toContain("stripe");
    expect(file.content).toContain("Per-transaction");
    expect(file.content).toContain("$50,000");
  });

  it("includes AP2 Article 6 hard limits", () => {
    const file = generateNegotiationRules(stripeCtx, stripeProfile, stripeFiles);
    expect(file.content).toContain("AP2 Article 6");
    expect(file.content).toContain("Hard limits");
  });

  it("includes Autonomous Purchase Bounds table", () => {
    const file = generateNegotiationRules(stripeCtx, stripeProfile, stripeFiles);
    expect(file.content).toContain("Autonomous Purchase Bounds");
  });

  it("includes mandate spend summary in accountability section", () => {
    const file = generateNegotiationRules(stripeCtx, stripeProfile, stripeFiles);
    expect(file.content).toContain("spend summary");
  });

  it("no-provider case shows (none detected) rows", () => {
    const snapshot = makeSnapshot();
    const ctx = buildContextMap(snapshot);
    const profile = buildRepoProfile(snapshot);
    const file = generateNegotiationRules(ctx, profile, []);
    expect(file.content).toContain("(none detected)");
  });

  it("paypal provider results in $10,000 cap", () => {
    const paypalFiles: FileEntry[] = [
      { path: "src/pay.ts", content: "import { PayPalScriptProvider } from '@paypal/react-paypal-js'; const checkout = () => paypal.order.create({})", size: 100 },
    ];
    const snap = makeSnapshot({ files: paypalFiles, file_count: 1, total_size_bytes: 100 });
    const ctx = buildContextMap(snap);
    const profile = buildRepoProfile(snap);
    const file = generateNegotiationRules(ctx, profile, paypalFiles);
    expect(file.content).toContain("$10,000");
  });

  it("non-stripe non-paypal provider results in $5,000 cap and High risk", () => {
    const klarnaFiles: FileEntry[] = [
      { path: "src/pay.ts", content: "import Klarna from 'klarna'; const buy = () => klarna.payments.init({})", size: 85 },
    ];
    const snap = makeSnapshot({ files: klarnaFiles, file_count: 1, total_size_bytes: 85 });
    const ctx = buildContextMap(snap);
    const profile = buildRepoProfile(snap);
    const file = generateNegotiationRules(ctx, profile, klarnaFiles);
    expect(file.content).toContain("$5,000");
    expect(file.content).toContain("High");
  });
});

describe("generateCommerceRegistry — repo_commerce_signals and ap2_assessment", () => {
  const stripeSnap = makeStripeSnapshot();
  const stripeCtx = buildContextMap(stripeSnap);
  const stripeProfile = buildRepoProfile(stripeSnap);

  it("includes repo_commerce_signals in registry", () => {
    const file = generateCommerceRegistry(stripeCtx, stripeProfile, stripeFiles);
    const registry = JSON.parse(file.content);
    expect(registry.repo_commerce_signals).toBeDefined();
  });

  it("detects stripe in repo_commerce_signals.detected_providers", () => {
    const file = generateCommerceRegistry(stripeCtx, stripeProfile, stripeFiles);
    const registry = JSON.parse(file.content);
    expect(registry.repo_commerce_signals.detected_providers).toContain("stripe");
  });

  it("repo_commerce_signals.has_checkout is true for checkout file", () => {
    const file = generateCommerceRegistry(stripeCtx, stripeProfile, stripeFiles);
    const registry = JSON.parse(file.content);
    expect(registry.repo_commerce_signals.has_checkout).toBe(true);
  });

  it("repo_commerce_signals.has_webhooks is true for webhook file", () => {
    const file = generateCommerceRegistry(stripeCtx, stripeProfile, stripeFiles);
    const registry = JSON.parse(file.content);
    expect(registry.repo_commerce_signals.has_webhooks).toBe(true);
  });

  it("includes ap2_compliance_assessment", () => {
    const file = generateCommerceRegistry(stripeCtx, stripeProfile, stripeFiles);
    const registry = JSON.parse(file.content);
    expect(registry.ap2_compliance_assessment).toBeDefined();
  });

  it("ap2 readiness_score > 0 for stripe-enabled repo", () => {
    const file = generateCommerceRegistry(stripeCtx, stripeProfile, stripeFiles);
    const registry = JSON.parse(file.content);
    expect(registry.ap2_compliance_assessment.readiness_score).toBeGreaterThan(0);
  });

  it("ap2 readiness_score is 0 for empty repo", () => {
    const snapshot = makeSnapshot({ files: [], file_count: 0, total_size_bytes: 0 });
    const ctx = buildContextMap(snapshot);
    const profile = buildRepoProfile(snapshot);
    const file = generateCommerceRegistry(ctx, profile, []);
    const registry = JSON.parse(file.content);
    expect(registry.ap2_compliance_assessment.readiness_score).toBe(0);
  });

  it("ap2 interpretation is production-ready for fully-instrumented repo", () => {
    const file = generateCommerceRegistry(stripeCtx, stripeProfile, stripeFiles);
    const registry = JSON.parse(file.content);
    // stripeFiles has: providers(25) + checkout(20) + recurring(15) + sca(20) + dispute(10) + webhooks(10) = 100
    expect(registry.ap2_compliance_assessment.readiness_score).toBe(100);
    expect(registry.ap2_compliance_assessment.interpretation).toBe("production-ready");
  });

  it("ap2 interpretation is partially-ready for score 40-69", () => {
    // stripe(25) + checkout(20) = 45 → partially-ready
    const noScaFiles2: FileEntry[] = [
      { path: "src/checkout.ts", content: "stripe.checkout.sessions.create({})", size: 40 },
    ];
    const snap = makeSnapshot({ files: noScaFiles2, file_count: 1, total_size_bytes: 40 });
    const ctx = buildContextMap(snap);
    const profile = buildRepoProfile(snap);
    const file = generateCommerceRegistry(ctx, profile, noScaFiles2);
    const registry = JSON.parse(file.content);
    expect(registry.ap2_compliance_assessment.interpretation).toBe("partially-ready");
  });

  it("ap2 gaps includes missing SCA message when no 3ds files", () => {
    const noScaFiles: FileEntry[] = [
      { path: "src/checkout.ts", content: "stripe.checkout.sessions.create({})", size: 40 },
    ];
    const snap = makeSnapshot({ files: noScaFiles, file_count: 1, total_size_bytes: 40 });
    const ctx = buildContextMap(snap);
    const profile = buildRepoProfile(snap);
    const file = generateCommerceRegistry(ctx, profile, noScaFiles);
    const registry = JSON.parse(file.content);
    const gaps: string[] = registry.ap2_compliance_assessment.gaps;
    expect(gaps.some(g => g.includes("SCA"))).toBe(true);
  });

  it("visa_intelligent_commerce includes stripe as likely-supported", () => {
    const file = generateCommerceRegistry(stripeCtx, stripeProfile, stripeFiles);
    const registry = JSON.parse(file.content);
    expect(registry.ap2_compliance_assessment.visa_intelligent_commerce.network_tokenization).toBe("likely-supported");
  });

  it("visa_intelligent_commerce is unknown for unknown provider", () => {
    const unknownFiles: FileEntry[] = [
      { path: "src/pay.ts", content: "// some custom payment gateway", size: 35 },
    ];
    const snap = makeSnapshot({ files: unknownFiles, file_count: 1, total_size_bytes: 35 });
    const ctx = buildContextMap(snap);
    const profile = buildRepoProfile(snap);
    const file = generateCommerceRegistry(ctx, profile, unknownFiles);
    const registry = JSON.parse(file.content);
    expect(registry.ap2_compliance_assessment.visa_intelligent_commerce.network_tokenization).toBe("unknown");
  });

  it("catalog still has 4 bundles", () => {
    const file = generateCommerceRegistry(stripeCtx, stripeProfile, stripeFiles);
    const registry = JSON.parse(file.content);
    expect(registry.catalog).toHaveLength(4);
  });
});
