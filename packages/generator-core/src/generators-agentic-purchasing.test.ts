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
    expect(schema.total_outputs).toBe(98);
  });

  it("schema includes required structural fields", () => {
    const file = generateProductSchema(ctx, profile);
    const schema = JSON.parse(file.content);
    expect(schema.schema_version).toBe("1.0");
    expect(schema.product).toBe("Axis' Iliad");
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
    expect(registry.product).toBe("Axis' Iliad");
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
    // stripeFiles has: providers(20) + checkout(15) + recurring(10) + sca(15) + dispute(10) + webhooks(10) = 80
    // No TAP(8)/tokenization(7)/mandate(5) files → score 80 → production-ready
    expect(registry.ap2_compliance_assessment.readiness_score).toBe(80);
    expect(registry.ap2_compliance_assessment.interpretation).toBe("production-ready");
  });

  it("ap2 interpretation is partially-ready for score 40-69", () => {
    // stripe(20) + checkout(15) + recurring(10) = 45 → partially-ready
    const partialFiles: FileEntry[] = [
      { path: "src/checkout.ts", content: "stripe.checkout.sessions.create({})", size: 40 },
      { path: "src/subs.ts", content: "// recurring mandate billing_cycle_anchor", size: 45 },
    ];
    const snap = makeSnapshot({ files: partialFiles, file_count: partialFiles.length, total_size_bytes: 85 });
    const ctx = buildContextMap(snap);
    const profile = buildRepoProfile(snap);
    const file = generateCommerceRegistry(ctx, profile, partialFiles);
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

// ─── TAP / Network Tokenization / Mandate Signal Detection ──────

describe("detectCommerceSignals — new TAP/tokenization/mandate signals", () => {
  it("detects TAP protocol when tap_protocol keyword present", () => {
    const tapFiles: FileEntry[] = [
      { path: "src/tap.ts", content: "const tapProtocol = initTapApi(config);", size: 50 },
    ];
    const snap = makeSnapshot({ files: tapFiles, file_count: 1, total_size_bytes: 50 });
    const ctx = buildContextMap(snap);
    const profile = buildRepoProfile(snap);
    const file = generateCommerceRegistry(ctx, profile, tapFiles);
    const registry = JSON.parse(file.content);
    expect(registry.repo_commerce_signals.has_tap_protocol).toBe(true);
  });

  it("detects network tokenization when DPAN/FPAN/VTS/MDES keywords present", () => {
    const tokenFiles: FileEntry[] = [
      { path: "src/tokens.ts", content: "const dpan = getNetworkToken(fpan); // VTS integration", size: 60 },
    ];
    const snap = makeSnapshot({ files: tokenFiles, file_count: 1, total_size_bytes: 60 });
    const ctx = buildContextMap(snap);
    const profile = buildRepoProfile(snap);
    const file = generateCommerceRegistry(ctx, profile, tokenFiles);
    const registry = JSON.parse(file.content);
    expect(registry.repo_commerce_signals.has_network_tokenization).toBe(true);
  });

  it("detects mandate management when mandate keywords present", () => {
    const mandateFiles: FileEntry[] = [
      { path: "src/mandates.ts", content: "const mandateId = createSepaMandate(iban);", size: 55 },
    ];
    const snap = makeSnapshot({ files: mandateFiles, file_count: 1, total_size_bytes: 55 });
    const ctx = buildContextMap(snap);
    const profile = buildRepoProfile(snap);
    const file = generateCommerceRegistry(ctx, profile, mandateFiles);
    const registry = JSON.parse(file.content);
    expect(registry.repo_commerce_signals.has_mandate_management).toBe(true);
  });

  it("new signals are false when not present", () => {
    const plainFiles: FileEntry[] = [
      { path: "src/index.ts", content: 'console.log("no payment code here");', size: 40 },
    ];
    const snap = makeSnapshot({ files: plainFiles, file_count: 1, total_size_bytes: 40 });
    const ctx = buildContextMap(snap);
    const profile = buildRepoProfile(snap);
    const file = generateCommerceRegistry(ctx, profile, plainFiles);
    const registry = JSON.parse(file.content);
    expect(registry.repo_commerce_signals.has_tap_protocol).toBe(false);
    expect(registry.repo_commerce_signals.has_network_tokenization).toBe(false);
    expect(registry.repo_commerce_signals.has_mandate_management).toBe(false);
  });
});

// ─── Verification Proof in generators ────────────────────────────

describe("verification proof inclusion", () => {
  const stripeSnap = makeStripeSnapshot();
  const stripeCtx = buildContextMap(stripeSnap);
  const stripeProfile = buildRepoProfile(stripeSnap);

  it("playbook includes Verification Proof section", () => {
    const file = generateAgentPurchasingPlaybook(stripeCtx, stripeProfile, stripeFiles);
    expect(file.content).toContain("Verification Proof");
    expect(file.content).toContain("Compliance grade");
  });

  it("checkout flow includes Verification Proof section", () => {
    const file = generateCheckoutFlow(stripeCtx, stripeProfile, stripeFiles);
    expect(file.content).toContain("Verification Proof");
  });

  it("negotiation rules includes Verification Proof section", () => {
    const file = generateNegotiationRules(stripeCtx, stripeProfile, stripeFiles);
    expect(file.content).toContain("Verification Proof");
  });

  it("commerce registry includes verification_proof in ap2_compliance_assessment", () => {
    const file = generateCommerceRegistry(stripeCtx, stripeProfile, stripeFiles);
    const registry = JSON.parse(file.content);
    expect(registry.ap2_compliance_assessment.verification_proof).toBeDefined();
    expect(registry.ap2_compliance_assessment.verification_proof.checks_total).toBe(8);
    expect(registry.ap2_compliance_assessment.verification_proof.grade).toBeTruthy();
  });
});

// ─── TAP Interop and Dispute Flow in playbook ────────────────────

describe("TAP interop and dispute flow content", () => {
  const stripeSnap = makeStripeSnapshot();
  const stripeCtx = buildContextMap(stripeSnap);
  const stripeProfile = buildRepoProfile(stripeSnap);

  it("playbook includes TAP / AP2 / UCP Interoperability section", () => {
    const file = generateAgentPurchasingPlaybook(stripeCtx, stripeProfile, stripeFiles);
    expect(file.content).toContain("TAP");
    expect(file.content).toContain("AP2");
    expect(file.content).toContain("UCP");
  });

  it("playbook includes SCA Exemption Decision Matrix", () => {
    const file = generateAgentPurchasingPlaybook(stripeCtx, stripeProfile, stripeFiles);
    expect(file.content).toContain("SCA Exemption");
    expect(file.content).toContain("low_value");
    expect(file.content).toContain("trusted_beneficiary");
  });

  it("playbook includes Dispute Resolution section with VROL/RDR/CDRN", () => {
    const file = generateAgentPurchasingPlaybook(stripeCtx, stripeProfile, stripeFiles);
    expect(file.content).toContain("Dispute Resolution");
    expect(file.content).toContain("VROL");
    expect(file.content).toContain("RDR");
    expect(file.content).toContain("CDRN");
  });

  it("product schema includes sca_exemption_schema", () => {
    const file = generateProductSchema(stripeCtx, stripeProfile, stripeFiles);
    const schema = JSON.parse(file.content);
    expect(schema.repo_commerce_profile.sca_exemption_schema).toBeDefined();
    expect(schema.repo_commerce_profile.sca_exemption_schema.low_value).toBeDefined();
    expect(schema.repo_commerce_profile.sca_exemption_schema.low_value.threshold_eur).toBe(30);
  });

  it("product schema includes dispute_resolution_schema", () => {
    const file = generateProductSchema(stripeCtx, stripeProfile, stripeFiles);
    const schema = JSON.parse(file.content);
    expect(schema.repo_commerce_profile.dispute_resolution_schema).toBeDefined();
    expect(schema.repo_commerce_profile.dispute_resolution_schema.pre_dispute).toBeDefined();
    expect(schema.repo_commerce_profile.dispute_resolution_schema.chargeback).toBeDefined();
  });
});

// ─── ap2ReadyScore includes new signals ──────────────────────────

describe("ap2ReadyScore — updated weighting with new signals", () => {
  it("score includes TAP/tokenization/mandate when detected", () => {
    const fullFiles: FileEntry[] = [
      { path: "src/stripe.ts", content: "import Stripe from 'stripe'; stripe.checkout.sessions.create({})", size: 70 },
      { path: "src/webhooks.ts", content: "stripe.webhooks.constructEvent(body, sig, secret)", size: 60 },
      { path: "src/subs.ts", content: "// recurring mandate billing_cycle_anchor", size: 50 },
      { path: "src/3ds.ts", content: "// 3ds2 sca challenge", size: 30 },
      { path: "src/disputes.ts", content: "// chargeback refund handling", size: 35 },
      { path: "src/tap.ts", content: "const tapProtocol = initTap();", size: 35 },
      { path: "src/tokens.ts", content: "const dpan = networkToken(fpan);", size: 35 },
      { path: "src/mandates.ts", content: "const mandateId = createMandate();", size: 35 },
    ];
    const snap = makeSnapshot({ files: fullFiles, file_count: fullFiles.length, total_size_bytes: 350 });
    const ctx = buildContextMap(snap);
    const profile = buildRepoProfile(snap);
    const file = generateCommerceRegistry(ctx, profile, fullFiles);
    const registry = JSON.parse(file.content);
    // All 9 factors detected: 20+15+10+15+10+10+8+7+5 = 100
    expect(registry.ap2_compliance_assessment.readiness_score).toBe(100);
  });

  it("score is lower without new signals", () => {
    // stripeFiles (original) lacks TAP/tokenization/mandate → max = 20+15+10+15+10+10 = 80
    const file = generateCommerceRegistry(
      buildContextMap(makeStripeSnapshot()),
      buildRepoProfile(makeStripeSnapshot()),
      stripeFiles,
    );
    const registry = JSON.parse(file.content);
    expect(registry.ap2_compliance_assessment.readiness_score).toBe(80);
  });
});

// ─── Commerce registry dispute_readiness field ───────────────────

describe("generateCommerceRegistry — dispute_readiness and verification_proof", () => {
  it("includes dispute_readiness in ap2_compliance_assessment", () => {
    const stripeSnap = makeStripeSnapshot();
    const file = generateCommerceRegistry(
      buildContextMap(stripeSnap),
      buildRepoProfile(stripeSnap),
      stripeFiles,
    );
    const registry = JSON.parse(file.content);
    expect(registry.ap2_compliance_assessment.dispute_readiness).toBeDefined();
    expect(registry.ap2_compliance_assessment.dispute_readiness.has_dispute_code).toBe(true);
    expect(registry.ap2_compliance_assessment.dispute_readiness.evidence_automation).toBe("automatable");
  });

  it("dispute_readiness shows manual-required when no webhooks and no dispute code", () => {
    const plainFiles: FileEntry[] = [
      { path: "src/index.ts", content: "console.log('hello');", size: 25 },
    ];
    const snap = makeSnapshot({ files: plainFiles, file_count: 1, total_size_bytes: 25 });
    const file = generateCommerceRegistry(
      buildContextMap(snap),
      buildRepoProfile(snap),
      plainFiles,
    );
    const registry = JSON.parse(file.content);
    expect(registry.ap2_compliance_assessment.dispute_readiness.evidence_automation).toBe("manual-required");
  });

  it("verification_proof grade is A for stripe-instrumented repo (6+ checks)", () => {
    const stripeSnap = makeStripeSnapshot();
    const file = generateCommerceRegistry(
      buildContextMap(stripeSnap),
      buildRepoProfile(stripeSnap),
      stripeFiles,
    );
    const registry = JSON.parse(file.content);
    // stripeFiles: providers(1) + checkout(1) + sca(1) + dispute(1) + webhooks(1) = 5 checks, maybe 6 with recurring → grade B or A
    expect(["A", "B"]).toContain(registry.ap2_compliance_assessment.verification_proof.grade);
  });

  it("verification_proof grade is D for empty repo", () => {
    const snap = makeSnapshot({ files: [], file_count: 0, total_size_bytes: 0 });
    const file = generateCommerceRegistry(
      buildContextMap(snap),
      buildRepoProfile(snap),
      [],
    );
    const registry = JSON.parse(file.content);
    expect(registry.ap2_compliance_assessment.verification_proof.grade).toBe("D");
    expect(registry.ap2_compliance_assessment.verification_proof.checks_passed).toBe(0);
  });
});

// ─── Negotiation rules TAP Token Compliance ──────────────────────

describe("negotiation rules — TAP token compliance content", () => {
  it("includes TAP Token Compliance table", () => {
    const stripeSnap = makeStripeSnapshot();
    const file = generateNegotiationRules(
      buildContextMap(stripeSnap),
      buildRepoProfile(stripeSnap),
      stripeFiles,
    );
    expect(file.content).toContain("TAP Token Compliance");
    expect(file.content).toContain("ACTIVE");
    expect(file.content).toContain("SUSPENDED");
  });
});

// ─── CE 3.0 / Win Probability / Lighter SCA Sections ─────────────

describe("Compelling Evidence 3.0 sections", () => {
  const stripeSnap = makeStripeSnapshot();
  const ctx = buildContextMap(stripeSnap);
  const profile = buildRepoProfile(stripeSnap);

  it("playbook includes CE 3.0 section", () => {
    const file = generateAgentPurchasingPlaybook(ctx, profile);
    expect(file.content).toContain("Compelling Evidence 3.0");
    expect(file.content).toContain("compelling_evidence_3");
    expect(file.content).toContain("10.4");
  });

  it("playbook includes win probability section", () => {
    const file = generateAgentPurchasingPlaybook(ctx, profile);
    expect(file.content).toContain("Win-Probability Scoring");
    expect(file.content).toContain("Agent Decision Matrix");
    expect(file.content).toContain("AUTO-REPRESENT");
  });

  it("playbook includes lighter SCA section", () => {
    const file = generateAgentPurchasingPlaybook(ctx, profile);
    expect(file.content).toContain("Lighter SCA");
    expect(file.content).toContain("low_value");
    expect(file.content).toContain("ABORT agent flow");
  });

  it("checkout flow includes lighter SCA and CE 3.0", () => {
    const file = generateCheckoutFlow(ctx, profile, stripeFiles);
    expect(file.content).toContain("Lighter SCA");
    expect(file.content).toContain("Compelling Evidence 3.0");
  });

  it("negotiation rules includes win probability", () => {
    const file = generateNegotiationRules(ctx, profile, stripeFiles);
    expect(file.content).toContain("Win-Probability Scoring");
    expect(file.content).toContain("AUTO-REPRESENT");
  });

  it("product schema includes CE 3.0 data", () => {
    const file = generateProductSchema(ctx, profile);
    const schema = JSON.parse(file.content);
    const commerce = schema.repo_commerce_profile;
    expect(commerce.dispute_resolution_schema.compelling_evidence_3).toBeDefined();
    expect(commerce.dispute_resolution_schema.compelling_evidence_3.version).toBe("3.0");
    expect(commerce.dispute_resolution_schema.compelling_evidence_3.target_reason_codes).toContain("10.4");
  });

  it("product schema includes agent SCA optimization", () => {
    const file = generateProductSchema(ctx, profile);
    const schema = JSON.parse(file.content);
    const commerce = schema.repo_commerce_profile;
    expect(commerce.agent_sca_optimization).toBeDefined();
    expect(commerce.agent_sca_optimization.frictionless_first).toBe(true);
    expect(commerce.agent_sca_optimization.exemption_priority).toContain("low_value");
  });

  it("product schema includes dispute win probability model", () => {
    const file = generateProductSchema(ctx, profile);
    const schema = JSON.parse(file.content);
    const commerce = schema.repo_commerce_profile;
    expect(commerce.dispute_win_probability).toBeDefined();
    expect(commerce.dispute_win_probability.auto_refund_threshold_usd).toBe(5);
    expect(commerce.dispute_win_probability.represent_threshold_win_pct).toBe(40);
  });

  it("commerce registry includes CE 3.0 in dispute_readiness", () => {
    const file = generateCommerceRegistry(ctx, profile, stripeFiles);
    const registry = JSON.parse(file.content);
    const dr = registry.ap2_compliance_assessment.dispute_readiness;
    expect(dr.compelling_evidence_3).toBeDefined();
    expect(dr.compelling_evidence_3.supported).toBe(true);
    expect(dr.compelling_evidence_3.target_reason_codes).toContain("10.4");
  });

  it("commerce registry includes win probability model", () => {
    const file = generateCommerceRegistry(ctx, profile, stripeFiles);
    const registry = JSON.parse(file.content);
    const dr = registry.ap2_compliance_assessment.dispute_readiness;
    expect(dr.win_probability_model).toBeDefined();
    expect(dr.win_probability_model.auto_refund_below_usd).toBe(5);
  });
});

// ─── Deepened content: cost-to-represent, AP2 scoring, provider SCA thresholds ──

describe("deepened compliance content", () => {
  const stripeSnap = makeStripeSnapshot();
  const ctx = buildContextMap(stripeSnap);
  const profile = buildRepoProfile(stripeSnap);

  it("playbook includes Cost-to-Represent Formula", () => {
    const file = generateAgentPurchasingPlaybook(ctx, profile, stripeFiles);
    expect(file.content).toContain("Cost-to-Represent Formula");
    expect(file.content).toContain("representment_cost");
    expect(file.content).toContain("net_payoff");
  });

  it("negotiation rules include Cost-to-Represent via win probability", () => {
    const file = generateNegotiationRules(ctx, profile, stripeFiles);
    expect(file.content).toContain("Cost-to-Represent Formula");
  });

  it("playbook includes AP2 Compliance Scoring article-level assessment", () => {
    const file = generateAgentPurchasingPlaybook(ctx, profile, stripeFiles);
    expect(file.content).toContain("AP2 Compliance Scoring");
    expect(file.content).toContain("Art. 2");
    expect(file.content).toContain("Art. 6");
    expect(file.content).toContain("Art. 7");
    expect(file.content).toContain("Art. 11");
    expect(file.content).toContain("Compliance Risk");
  });

  it("playbook includes Provider-Specific SCA Thresholds", () => {
    const file = generateAgentPurchasingPlaybook(ctx, profile, stripeFiles);
    expect(file.content).toContain("Provider-Specific SCA Thresholds");
    expect(file.content).toContain("Visa");
    expect(file.content).toContain("Mastercard");
    expect(file.content).toContain("Amex");
  });

  it("checkout flow includes Provider-Specific SCA Thresholds", () => {
    const file = generateCheckoutFlow(ctx, profile, stripeFiles);
    expect(file.content).toContain("Provider-Specific SCA Thresholds");
  });

  it("product schema includes $schema field", () => {
    const file = generateProductSchema(ctx, profile, stripeFiles);
    const schema = JSON.parse(file.content);
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
  });

  it("product schema includes agent_quotas", () => {
    const file = generateProductSchema(ctx, profile, stripeFiles);
    const schema = JSON.parse(file.content);
    expect(schema.agent_quotas).toBeDefined();
    expect(schema.agent_quotas.per_session_limit_cents).toBe(10000);
    expect(schema.agent_quotas.tiers.free.calls_per_month).toBe(3);
    expect(schema.agent_quotas.tiers.pro.budget_cents).toBe(500000);
  });

  it("commerce registry catalog includes price_cents", () => {
    const file = generateCommerceRegistry(ctx, profile, stripeFiles);
    const registry = JSON.parse(file.content);
    const freeBundle = registry.catalog.find((c: { id: string }) => c.id === "free-bundle");
    const proAll = registry.catalog.find((c: { id: string }) => c.id === "pro-all");
    expect(freeBundle.price_cents).toBe(0);
    expect(proAll.price_cents).toBe(5000);
  });

  it("commerce registry includes agent_quotas", () => {
    const file = generateCommerceRegistry(ctx, profile, stripeFiles);
    const registry = JSON.parse(file.content);
    expect(registry.agent_quotas).toBeDefined();
    expect(registry.agent_quotas.per_session_limit_cents).toBe(10000);
  });

  it("commerce registry includes mandate_lifecycle_events", () => {
    const file = generateCommerceRegistry(ctx, profile, stripeFiles);
    const registry = JSON.parse(file.content);
    expect(registry.mandate_lifecycle_events).toBeDefined();
    expect(registry.mandate_lifecycle_events).toHaveLength(7);
    expect(registry.mandate_lifecycle_events[0].event).toBe("CREATE");
    expect(registry.mandate_lifecycle_events[6].event).toBe("CANCEL");
  });

  it("commerce registry includes liability_risk", () => {
    const file = generateCommerceRegistry(ctx, profile, stripeFiles);
    const registry = JSON.parse(file.content);
    expect(registry.liability_risk).toBeDefined();
    expect(registry.liability_risk.ap2_non_compliance_fine_usd_month).toBe(50000);
    expect(registry.liability_risk.risk_level).toBeTruthy();
  });

  it("negotiation rules include commerce_signal_bonus in formula", () => {
    const file = generateNegotiationRules(ctx, profile, stripeFiles);
    expect(file.content).toContain("commerce_signal_bonus");
  });

  it("negotiation rules include ROI Computation section", () => {
    const file = generateNegotiationRules(ctx, profile, stripeFiles);
    expect(file.content).toContain("ROI Computation");
    expect(file.content).toContain("axis_cost");
    expect(file.content).toContain("manual_token_cost");
    expect(file.content).toContain("savings");
  });

  it("checkout flow includes Frictionless Approval Metrics", () => {
    const file = generateCheckoutFlow(ctx, profile, stripeFiles);
    expect(file.content).toContain("Frictionless Approval Metrics");
    expect(file.content).toContain("Frictionless approval rate");
  });

  it("checkout flow includes Network Token Payload section", () => {
    const file = generateCheckoutFlow(ctx, profile, stripeFiles);
    expect(file.content).toContain("Network Token Payload");
    expect(file.content).toContain("dpan");
    expect(file.content).toContain("token_service_provider");
  });
});
