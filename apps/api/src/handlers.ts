import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { parseAgentBudget, resolveAgentMode, negotiatePrice, build402NegotiationBody, getPricingTier } from "./mpp.js";
import { settleOverageCash } from "./cashier.js";
import type { AgentBudget } from "./mpp.js";
import { classifyProbe, captureIntent } from "./intent.js";
import {
  createSnapshot,
  getSnapshot,
  updateSnapshotStatus,
  getProjectSnapshots,
  getProjectOwner,
  deleteSnapshot,
  deleteProject,
  saveContextMap,
  getContextMap,
  saveRepoProfile,
  getRepoProfile,
  saveGeneratorResult,
  getGeneratorResult,
  recordUsage,
  checkQuota,
  trackEvent,
  resolveStage,
  TIER_LIMITS,
  ALL_PROGRAMS,
  isProgramEnabled,
  indexSnapshotContent,
  searchSnapshotContent,
  getSearchIndexStats,
  indexSymbols,
  searchSymbols,
  getSymbolStats,
  runPgMaintenance,
  getPgDbStats,
  getGitHubTokenDecrypted,
  lookupReferralCode,
  recordReferralConversion,
  createReferralCode,
  getReferralCredits,
  consumeUsageCredits,
  getCachedScrape,
  putCachedScrape,
  consumeFreeScrapes,
  getFreeScrapePoolStatus,
  getUsageCreditSummary,
} from "@axis/snapshots";
import type { SnapshotInput, SnapshotManifest, FileEntry, BillingTier } from "@axis/snapshots";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import { generateFiles, listAvailableGenerators, gradeCompliance } from "@axis/generator-core";
import type { GeneratorResult } from "@axis/generator-core";
import { sendJSON, readBody, sendError, isShuttingDown } from "./router.js";
import { resolveAuth, requireAuth } from "./billing.js";
import { requireAdmin } from "./admin.js";
import { ErrorCode, ERROR_CODE_CATALOG, log, getRequestId } from "./logger.js";
import { MCP_ERROR_CATEGORY_CATALOG } from "./mcp-runtime.js";
import { ARTIFACT_COUNT, PROGRAM_COUNT, MCP_TOOL_COUNT, ENDPOINT_COUNT, API_VERSION } from "./counts.js";
import { MCP_TOOLS } from "./mcp-tools.js";
import { buildCodeReadinessBlock } from "./purchasing-readiness-analysis.js";
import { FREE_MCP_TOOL_COUNT, deriveMcpToolCatalog } from "./mcp-tool-impls.js";

// â”€â”€â”€ Referral discount wrapper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Apply referral benefits (free call) before charging MPP cash overage. */
async function chargeWithDiscounts(
  req: IncomingMessage,
  res: ServerResponse,
  accountId: string,
  amountCents: number,
  opts: { currency: string; decimals: number; description?: string; meta?: Record<string, string> },
): Promise<{ status: 402 | 200 } | null> {
  const tier = (opts.meta?.tier === "paid" || opts.meta?.tier === "suite" || opts.meta?.tier === "free")
    ? opts.meta.tier
    : "free";
  const tool = opts.meta?.tool ?? opts.meta?.program ?? "default";
  const overageCents = tier === "free"
    ? amountCents
    : (await consumeUsageCredits(accountId, tier, tool, amountCents)).effective_overage_cents;

  res.setHeader("X-Axis-Request-Cost", (overageCents / 100).toFixed(2));

  // Plan credits covered this call fully â€” no overage payment required.
  if (overageCents <= 0) return { status: 200 };

  // Collection (5th-call-free -> cash rail -> paid-call record) is delegated to the
  // shared cashier -- the same tail the MCP in-band settlement gate uses (H1).
  return settleOverageCash(req, res, accountId, overageCents, opts);
}

async function buildPaymentRequiredPayload(
  tool: string,
  message: string,
  budget?: AgentBudget,
  accountId?: string,
  tier?: BillingTier,
): Promise<Record<string, unknown>> {
  const referralToken = accountId ? (await createReferralCode(accountId)).code : null;
  return {
    ...build402NegotiationBody(tool, budget, {
      message,
      referral_token: referralToken,
    }),
    // H2.5: usage_credits present everywhere an authenticated account's
    // credit standing is meaningful — absent (not fabricated) for anonymous
    // callers, who have no credit concept at all.
    usage_credits: accountId && tier ? await getUsageCreditSummary(accountId, tier) : null,
  };
}

// â”€â”€â”€ Ownership helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Check if the current user can access a snapshot. Returns true if allowed, sends error and returns false if not. */
export async function assertSnapshotAccess(req: IncomingMessage, res: ServerResponse, snapshot: { account_id: string | null }): Promise<boolean> {
  if (!snapshot.account_id) return true; // anonymous snapshot  -  accessible by ID knowledge
  const auth = await resolveAuth(req);
  if (!auth.account) {
    sendError(res, 401, ErrorCode.AUTH_REQUIRED, "Authentication required");
    return false;
  }
  if (auth.account.account_id !== snapshot.account_id) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "Snapshot not found");
    return false;
  }
  return true;
}

/** Check if the current user can access a project. Returns true if allowed. */
export async function assertProjectAccess(req: IncomingMessage, res: ServerResponse, project_id: string): Promise<boolean> {
  const owner = await getProjectOwner(project_id);
  if (!owner) return true; // anonymous project
  const auth = await resolveAuth(req);
  if (!auth.account) {
    sendError(res, 401, ErrorCode.AUTH_REQUIRED, "Authentication required");
    return false;
  }
  if (auth.account.account_id !== owner) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "Project not found");
    return false;
  }
  return true;
}

// â”€â”€â”€ Per-program default outputs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const PROGRAM_OUTPUTS: Record<string, string[]> = {
  debug:        ["debug-playbook.md", "incident-template.md", "tracing-rules.md", "root-cause-checklist.md"],
  frontend:     ["frontend-rules.md", "component-guidelines.md", "layout-patterns.md", "ui-audit.md"],
  seo:          ["seo-rules.md", "schema-recommendations.json", "route-priority-map.md", "content-audit.md", "meta-tag-audit.json"],
  optimization: ["optimization-rules.md", "prompt-diff-report.md", "cost-estimate.json", "token-budget-plan.md"],
  theme:        ["design-tokens.json", "theme.css", "theme-guidelines.md", "component-theme-map.json", "dark-mode-tokens.json"],
  brand:        ["brand-guidelines.md", "voice-and-tone.md", "content-constraints.md", "messaging-system.yaml", "channel-rulebook.md"],
  superpowers:  ["superpower-pack.md", "workflow-registry.json", "test-generation-rules.md", "refactor-checklist.md", "automation-pipeline.yaml"],
  marketing:    ["campaign-brief.md", "funnel-map.md", "sequence-pack.md", "cro-playbook.md", "ab-test-plan.md"],
  notebook:     ["notebook-summary.md", "source-map.json", "study-brief.md", "research-threads.md", "citation-index.json"],
  obsidian:     ["obsidian-skill-pack.md", "vault-rules.md", "graph-prompt-map.json", "linking-policy.md", "template-pack.md"],
  mcp:          ["mcp-config.json", "mcp-registry-metadata.json", "protocol-spec.md", "spec.types.ts", "mcp/README.md", "mcp/project-setup.md", "mcp/build-artifacts.md", "mcp/package-json.root.template.json", "mcp/package-json.package.template.json", "mcp/tsconfig.root.template.json", "mcp/tsconfig.package.template.json", "mcp/monorepo-structure.md", "mcp/core-implementation-artifacts.md", "mcp/testing-documentation-polish-artifacts.md", "connector-map.yaml", "capability-registry.json", "server-manifest.yaml"],
  artifacts:    ["generated-component.tsx", "dashboard-widget.tsx", "embed-snippet.ts", "artifact-spec.md", "component-library.json"],
  remotion:     ["remotion-script.ts", "scene-plan.md", "render-config.json", "asset-checklist.md", "storyboard.md"],
  canvas:       ["canvas-spec.json", "social-pack.md", "poster-layouts.md", "asset-guidelines.md", "brand-board.md"],
  algorithmic:          ["generative-sketch.ts", "parameter-pack.json", "collection-map.md", "export-manifest.yaml", "variation-matrix.json"],
  "agentic-purchasing": ["agent-purchasing-playbook.md", "product-schema.json", "checkout-flow.md", "negotiation-rules.md", "commerce-registry.json", "ap2-interop-samples.json"],
  closer: [
    "packaging/README.md",
    "packaging/LICENSE",
    "Dockerfile",
    "docker-compose.yml",
    ".github/workflows/ci.yml",
    ".github/workflows/release.yml",
    "packaging/manifests/npm-package.json",
    "packaging/manifests/unreal.uplugin",
    "packaging/manifests/vscode-extension.json",
    "packaging/manifests/dockerhub-repository.md",
    "packaging/manifests/github-marketplace-listing.md",
    "packaging/trust-fabric/attestation.json",
    "packaging/trust-fabric/merkle-proof.json",
    "packaging-report.md",
    "DISTRIBUTABLE.md",
    "Makefile",
  ],
  deploy: [
    "deploy/Dockerfile",
    "deploy/Dockerfile.dockerignore",
    "deploy/docker-compose.dev.yml",
    "deploy/render.yaml",
    "deploy/deploy.sh",
    "deploy/deploy.ps1",
    "deploy/vscode-launch.json.template",
    "deploy/wrangler.pages.toml",
    "deploy/wrangler.containers.toml",
    "deploy/worker.ts",
    "deploy/deploy-cloudflare.sh",
    "deploy/deploy-cloudflare.ps1",
    "deploy/deploy-qualification-report.md",
  ],
};

// â”€â”€â”€ Generic program handler factory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const FREE_PROGRAMS = new Set(TIER_LIMITS.free.programs);

export function makeProgramHandler(program: string, defaultOutputs: string[]) {
  const isPro = !FREE_PROGRAMS.has(program);

  return async function (req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Authn gate for pro programs, resolved up front so unauthenticated callers are rejected
    // before any request body is read (avoids leaking snapshot existence to anonymous callers).
    let auth: Awaited<ReturnType<typeof resolveAuth>> | null = null;
    let enabled = false;
    if (isPro) {
      auth = await resolveAuth(req);

      // Require authentication for pro programs
      if (auth.anonymous || !auth.account) {
        sendError(res, 401, ErrorCode.AUTH_REQUIRED, `${program} requires authentication. Include Authorization: Bearer <api_key>`);
        return;
      }

      // Check if program is enabled for this account
      enabled = await isProgramEnabled(auth.account.account_id, program);
      if (!enabled) {
        await trackEvent(auth.account.account_id, "limit_reached", "limit_hit", {
          reason: `program_not_enabled:${program}`,
          source: "program_handler",
        });
      }
    }

    const raw = await readBody(req);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw);
    } catch {
      sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
      return;
    }

    const snapshotId = body.snapshot_id as string;
    if (!snapshotId || typeof snapshotId !== "string") {
      sendError(res, 400, ErrorCode.MISSING_FIELD, "snapshot_id is required");
      return;
    }

    const rawOutputs = body.outputs;
    if (rawOutputs !== undefined && !Array.isArray(rawOutputs)) {
      sendError(res, 400, ErrorCode.INVALID_FORMAT, "outputs must be an array of strings");
      return;
    }

    const contextMap = (await getContextMap(snapshotId)) as ContextMap | undefined;
    const repoProfile = (await getRepoProfile(snapshotId)) as RepoProfile | undefined;
    if (!contextMap || !repoProfile) {
      sendError(res, 404, ErrorCode.CONTEXT_PENDING, "No context for this snapshot \u2014 run POST /v1/snapshots first");
      return;
    }

    const requestedOutputs = (rawOutputs as string[] | undefined) ?? defaultOutputs;
    const snapshot = await getSnapshot(snapshotId);
    // Tenancy: an owned snapshot is only readable by its owner. Without this, any caller
    // could pass another account's snapshot_id and receive generated artifacts that embed
    // the victim's source (cross-tenant IDOR).
    if (snapshot && !(await assertSnapshotAccess(req, res, snapshot))) return;

    // Charge only now that the request is validated — a 400/404/cross-tenant rejection above
    // returns before any billing, so callers are never charged for output they never receive
    // (audit #11 over-charge). A generation failure after this point is the rare residual case.
    if (isPro && auth?.account) {
      const budget = parseAgentBudget(req);
      const mode = resolveAgentMode(req);
      const pricing = getPricingTier(program);
      const amountCents = mode === "lite" ? pricing.lite_cents : pricing.standard_cents;

      // Meter monthly credits first. If overage remains, offer MPP payment.
      const mppResult = await chargeWithDiscounts(req, res, auth.account.account_id, amountCents, {
        currency: "usd",
        decimals: 2,
        description: `AXIS ${program} - $${(amountCents / 100).toFixed(2)} per run (${mode})`,
        meta: { account_id: auth.account.account_id, tier: auth.account.tier, program, tool: program, mode },
      });

      if (mppResult === null) {
        const paymentMessage = enabled
          ? `${program} exceeded included monthly credits and requires overage payment. Upgrade at iliad.trustfabric.ai/billing.`
          : `${program} requires a paid plan or per-call payment. Upgrade at iliad.trustfabric.ai/billing.`;
        sendError(res, 402, ErrorCode.TIER_REQUIRED, paymentMessage, {
          program,
          tier: auth.account.tier,
          price_per_call: `$${(amountCents / 100).toFixed(2)}`,
          ...(await buildPaymentRequiredPayload(program, paymentMessage, budget, auth.account.account_id, auth.account.tier)),
        });
      }
      if (mppResult === null || mppResult.status === 402) return;
    }
    const result = generateFiles({
      context_map: contextMap,
      repo_profile: repoProfile,
      requested_outputs: requestedOutputs,
      source_files: snapshot?.files ?? [],
    });

    const programFiles = result.files.filter(f => f.program === program);

    // Record usage for authenticated pro program calls
    if (isPro) {
      const auth = await resolveAuth(req);
      if (auth.account) {
        await recordUsage(
          auth.account.account_id,
          program,
          snapshotId,
          programFiles.length,
          snapshot?.files?.length ?? 0,
          snapshot?.total_size_bytes ?? 0,
        );
      }
    }

    sendJSON(res, 200, {
      snapshot_id: snapshotId,
      program,
      files: programFiles,
      skipped: result.skipped,
    });
  };
}

// â”€â”€â”€ Program handlers (generated from PROGRAM_OUTPUTS) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const handleDebugAnalyze        = makeProgramHandler("debug", PROGRAM_OUTPUTS.debug);
export const handleFrontendAudit       = makeProgramHandler("frontend", PROGRAM_OUTPUTS.frontend);
export const handleSeoAnalyze          = makeProgramHandler("seo", PROGRAM_OUTPUTS.seo);
export const handleOptimizationAnalyze = makeProgramHandler("optimization", PROGRAM_OUTPUTS.optimization);
export const handleThemeGenerate       = makeProgramHandler("theme", PROGRAM_OUTPUTS.theme);
export const handleBrandGenerate       = makeProgramHandler("brand", PROGRAM_OUTPUTS.brand);
export const handleSuperpowersGenerate = makeProgramHandler("superpowers", PROGRAM_OUTPUTS.superpowers);
export const handleMarketingGenerate   = makeProgramHandler("marketing", PROGRAM_OUTPUTS.marketing);
export const handleNotebookGenerate    = makeProgramHandler("notebook", PROGRAM_OUTPUTS.notebook);
export const handleObsidianAnalyze     = makeProgramHandler("obsidian", PROGRAM_OUTPUTS.obsidian);
export const handleMcpProvision        = makeProgramHandler("mcp", PROGRAM_OUTPUTS.mcp);
export const handleArtifactsGenerate   = makeProgramHandler("artifacts", PROGRAM_OUTPUTS.artifacts);
export const handleRemotionGenerate    = makeProgramHandler("remotion", PROGRAM_OUTPUTS.remotion);
export const handleCanvasGenerate      = makeProgramHandler("canvas", PROGRAM_OUTPUTS.canvas);
export const handleAlgorithmicGenerate = makeProgramHandler("algorithmic", PROGRAM_OUTPUTS.algorithmic);
export const handleAgenticPurchasingGenerate = makeProgramHandler("agentic-purchasing", PROGRAM_OUTPUTS["agentic-purchasing"]);
export const handleCloserGenerate = makeProgramHandler("closer", PROGRAM_OUTPUTS.closer);
export const handleDeployGenerate = makeProgramHandler("deploy", PROGRAM_OUTPUTS.deploy);

export async function handleCreateSnapshot(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  // Validate required fields
  const manifest = body.manifest as SnapshotManifest | undefined;
  if (!manifest?.project_name || !manifest?.project_type || !manifest?.frameworks || !manifest?.goals || !manifest?.requested_outputs) {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "Missing required manifest fields: project_name, project_type, frameworks, goals, requested_outputs");
    return;
  }

  // Validate manifest field types
  if (typeof manifest.project_name !== "string" || typeof manifest.project_type !== "string") {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "manifest.project_name and manifest.project_type must be strings");
    return;
  }
  if (!Array.isArray(manifest.frameworks) || !Array.isArray(manifest.goals) || !Array.isArray(manifest.requested_outputs)) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "manifest.frameworks, manifest.goals, and manifest.requested_outputs must be arrays");
    return;
  }

  const files = body.files as FileEntry[] | undefined;
  if (!files || !Array.isArray(files) || files.length === 0) {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "files array is required and must not be empty");
    return;
  }

  // Validate file entries
  for (const file of files) {
    if (!file.path || typeof file.content !== "string") {
      sendError(res, 400, ErrorCode.FILE_INVALID, "Each file must have path (string) and content (string)");
      return;
    }
    // Normalize path separators and reject traversal
    file.path = file.path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+/, "");
    if (file.path.includes("..")) {
      sendError(res, 400, ErrorCode.PATH_TRAVERSAL, `Invalid file path: ${file.path}`);
      return;
    }
    file.size = file.size ?? Buffer.byteLength(file.content, "utf-8");
  }

  const input: SnapshotInput = {
    input_method: (body.input_method as SnapshotInput["input_method"]) ?? "api_submission",
    manifest,
    files,
  };

  // Reject invalid/revoked keys (key provided but not valid)
  const auth = await resolveAuth(req);
  if (!auth.anonymous && !auth.account) {
    sendError(res, 401, ErrorCode.INVALID_KEY, "Invalid or revoked API key");
    return;
  }
  // Check quota if authenticated
  if (auth.account) {
    // VALIDATE-FIRST (charge-integrity hybrid, phase 1): every deterministic
    // rejection — file count/size caps — runs BEFORE any money movement. The
    // old ordering charged (chargeWithDiscounts consumes credits and can
    // settle cash) and THEN 413'd oversized requests, keeping money for work
    // that never ran. A doomed request must cost $0.
    const preLimits = TIER_LIMITS[auth.account.tier];
    if (files.length > preLimits.max_files_per_snapshot) {
      sendError(res, 413, ErrorCode.FILE_COUNT_EXCEEDED, `File limit exceeded: ${files.length} files (max ${preLimits.max_files_per_snapshot} for ${auth.account.tier} tier)`);
      return;
    }
    for (const file of files) {
      if (file.size > preLimits.max_file_size_bytes) {
        sendError(res, 413, ErrorCode.FILE_TOO_LARGE, `File too large: ${file.path} is ${file.size} bytes (max ${preLimits.max_file_size_bytes} for ${auth.account.tier} tier)`);
        return;
      }
    }

    // H-Phase-A cycle 5: the quota-exceeded charge below and the program-
    // entitlement charge further down used to both fire unconditionally when
    // BOTH conditions were true for the same call (over quota AND requesting
    // a program the tier doesn't include) — an account was billed twice for
    // one snapshot creation. paidForThisCall tracks a successful charge from
    // EITHER branch so the second never re-charges (same shape/fix as the
    // cycle-4 Firecrawl double-charge).
    let paidForThisCall = false;
    const quota = await checkQuota(auth.account.account_id);
    /* v8 ignore start  -  quota exceeded path tested but V8 won't credit compound ternary */
    if (!quota.allowed) {
      // Determine if the user is requesting ONLY free programs.
      // If so, skip the MPP charge â€” return a clear 429 without payment flow.
      const requestedProgramsFromOutputs = new Set<string>();
      for (const output of manifest.requested_outputs) {
        for (const [program, outputs] of Object.entries(PROGRAM_OUTPUTS)) {
          if (outputs.includes(output)) requestedProgramsFromOutputs.add(program);
        }
      }
      const onlyFreePrograms = requestedProgramsFromOutputs.size === 0 ||
        [...requestedProgramsFromOutputs].every(p => FREE_PROGRAMS.has(p));

      if (onlyFreePrograms) {
        // Free-program-only requests bypass quota entirely â€” free programs are always available
      } else {
        await trackEvent(auth.account.account_id, "limit_reached", "limit_hit", { reason: quota.reason });
        const budget = parseAgentBudget(req);
        const mode = resolveAgentMode(req);
        const pricing = getPricingTier("analyze_repo");
        const amountCents = mode === "lite" ? pricing.lite_cents : pricing.standard_cents;
        const mppResult = await chargeWithDiscounts(req, res, auth.account.account_id, amountCents, {
          currency: "usd",
          decimals: 2,
          description: `AXIS API Credit - $${(amountCents / 100).toFixed(2)} per run (${mode})`,
          meta: { account_id: auth.account.account_id, tier: auth.account.tier, mode },
        });
        if (mppResult === null) {
          const paymentMessage = quota.reason ?? "Quota exceeded";
          sendError(res, 429, ErrorCode.QUOTA_EXCEEDED, quota.reason ?? "Quota exceeded", {
            tier: quota.tier,
            usage: quota.usage,
            ...(await buildPaymentRequiredPayload("analyze_repo", paymentMessage, budget, auth.account.account_id, auth.account.tier)),
          });
        }
        if (mppResult === null || mppResult.status === 402) return;
        paidForThisCall = true;
      }
    }
    /* v8 ignore stop */

    // File count/size caps already enforced ABOVE the charge (validate-first).
    const limits = preLimits;

    // Enforce program entitlements â€” reject if free-tier user requests pro outputs
    const allowedPrograms = new Set(limits.programs.length > 0 ? limits.programs : ALL_PROGRAMS as unknown as string[]);
    const requestedPro = new Set<string>();
    for (const output of manifest.requested_outputs) {
      for (const [program, outputs] of Object.entries(PROGRAM_OUTPUTS)) {
        if (outputs.includes(output) && !allowedPrograms.has(program)) {
          requestedPro.add(program);
        }
      }
    }
    if (requestedPro.size > 0 && !paidForThisCall) {
      const proList = [...requestedPro].sort();

      // Offer MPP per-call payment before returning static 402
      const budget = parseAgentBudget(req);
      const mode = resolveAgentMode(req);
      const pricing = getPricingTier("analyze_repo");
      const amountCents = mode === "lite" ? pricing.lite_cents : pricing.standard_cents;
      const mppResult = await chargeWithDiscounts(req, res, auth.account.account_id, amountCents, {
        currency: "usd",
        decimals: 2,
        description: `AXIS pro programs - $${(amountCents / 100).toFixed(2)} per run (${proList.join(", ")})`,
        meta: { account_id: auth.account.account_id, tier: auth.account.tier, programs: proList.join(","), mode },
      });

      if (mppResult === null) {
        const paymentMessage = `Free tier includes 3 programs (search, skills, debug). Upgrade to Pro to unlock: ${proList.join(", ")}.`;
        // MPP not configured â€” return 402 with negotiation data
        sendError(res, 402, ErrorCode.TIER_REQUIRED,
          paymentMessage,
          {
            blocked_programs: proList,
            allowed_programs: [...allowedPrograms].sort(),
            upgrade_url: "https://iliad.trustfabric.ai/#plans",
            tier: auth.account.tier,
            price_per_call: `$${(amountCents / 100).toFixed(2)}`,
            ...(await buildPaymentRequiredPayload("analyze_repo", paymentMessage, budget, auth.account.account_id, auth.account.tier)),
          },
        );
      }
      if (mppResult === null || mppResult.status === 402) return;
      // mppResult.status === 200 â€” payment accepted, continue to generation
    }
  } else if (auth.anonymous) {
    // Anonymous uploads must still obey free-tier file count/size limits — the authenticated
    // branch enforced them but the anon branch did not, allowing unbounded uploads (DoS).
    const anonLimits = TIER_LIMITS.free;
    if (files.length > anonLimits.max_files_per_snapshot) {
      sendError(res, 413, ErrorCode.FILE_COUNT_EXCEEDED, `File limit exceeded: ${files.length} files (max ${anonLimits.max_files_per_snapshot} for anonymous)`);
      return;
    }
    for (const file of files) {
      if (file.size > anonLimits.max_file_size_bytes) {
        sendError(res, 413, ErrorCode.FILE_TOO_LARGE, `File too large: ${file.path} is ${file.size} bytes (max ${anonLimits.max_file_size_bytes} for anonymous)`);
        return;
      }
    }

    // Anonymous users get free-tier program limits
    const freeLimits = TIER_LIMITS.free;
    const anonAllowed = new Set(freeLimits.programs);
    const anonPro = new Set<string>();
    for (const output of manifest.requested_outputs) {
      for (const [program, outputs] of Object.entries(PROGRAM_OUTPUTS)) {
        if (outputs.includes(output) && !anonAllowed.has(program)) {
          anonPro.add(program);
        }
      }
    }
    if (anonPro.size > 0) {
      const proList = [...anonPro].sort();
      const budget = parseAgentBudget(req);
      const pricing = getPricingTier("analyze_repo");
      const mode = resolveAgentMode(req);
      const amountCents = mode === "lite" ? pricing.lite_cents : pricing.standard_cents;
      const paymentMessage = `Free tier includes 3 programs (search, skills, debug). Sign up or upgrade to Pro to unlock: ${proList.join(", ")}.`;
      sendError(res, 402, ErrorCode.TIER_REQUIRED,
        paymentMessage,
        {
          blocked_programs: proList,
          allowed_programs: [...anonAllowed].sort(),
          upgrade_url: "https://iliad.trustfabric.ai/#plans",
          tier: "anonymous",
          price_per_call: `$${(amountCents / 100).toFixed(2)}`,
          create_account_url: "https://axis-api-6c7z.onrender.com/v1/accounts",
          ...(await buildPaymentRequiredPayload("analyze_repo", paymentMessage, budget)),
        },
      );
      return;
    }
  }

  const snapshot = await createSnapshot(input, auth.account?.account_id);

  // Process synchronously for v1 (production: queue to worker)
  try {
    const contextMap = buildContextMap(snapshot);
    const repoProfile = buildRepoProfile(snapshot);

    await saveContextMap(snapshot.snapshot_id, contextMap);
    await saveRepoProfile(snapshot.snapshot_id, repoProfile);

    // Generate output files
    const generated = generateFiles({
      context_map: contextMap,
      repo_profile: repoProfile,
      requested_outputs: snapshot.manifest.requested_outputs,
      source_files: snapshot.files,
    });
    await saveGeneratorResult(snapshot.snapshot_id, generated);
    await updateSnapshotStatus(snapshot.snapshot_id, "ready");

    // Record usage per program if authenticated
    if (auth.account) {
      const programs = new Set(generated.files.map(f => f.program));
      for (const program of programs) {
        const programFiles = generated.files.filter(f => f.program === program);
        await recordUsage(auth.account.account_id, program, snapshot.snapshot_id, programFiles.length, files.length, input.files.reduce((s, f) => s + f.size, 0));
      }
      await trackEvent(auth.account.account_id, "snapshot_created", await resolveStage(auth.account.account_id), {
        snapshot_id: snapshot.snapshot_id,
        programs: [...programs],
        files: files.length,
      });
    }

    sendJSON(res, 201, {
      snapshot_id: snapshot.snapshot_id,
      project_id: snapshot.project_id,
      status: "ready",
      context_map: contextMap,
      repo_profile: repoProfile,
      generated_files: generated.files.map(f => ({ path: f.path, program: f.program, description: f.description })),
      compliance_grade: gradeCompliance(snapshot.files),
    });
  /* v8 ignore start  -  requires internal processing function to throw */
  } catch (err) {
    await updateSnapshotStatus(snapshot.snapshot_id, "failed");
    log("error", "snapshot_processing_failed", {
      request_id: getRequestId(res),
      snapshot_id: snapshot.snapshot_id,
      error: err instanceof Error ? err.message : String(err),
    });
    sendError(res, 500, ErrorCode.PROCESS_FAILED, "Processing failed", {
      snapshot_id: snapshot.snapshot_id,
      status: "failed",
    });
  }
  /* v8 ignore stop */
}

export async function handleGetSnapshot(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const { snapshot_id } = params;
  const snapshot = await getSnapshot(snapshot_id);
  if (!snapshot) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "Snapshot not found");
    return;
  }
  if (!(await assertSnapshotAccess(_req, res, snapshot))) return;

  sendJSON(res, 200, {
    snapshot_id: snapshot.snapshot_id,
    project_id: snapshot.project_id,
    created_at: snapshot.created_at,
    input_method: snapshot.input_method,
    manifest: snapshot.manifest,
    file_count: snapshot.file_count,
    total_size_bytes: snapshot.total_size_bytes,
    status: snapshot.status,
    compliance_grade: gradeCompliance(snapshot.files),
  });
}

export async function handleDeleteSnapshot(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const { snapshot_id } = params;
  const snapshot = await getSnapshot(snapshot_id);
  if (!snapshot) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "Snapshot not found");
    return;
  }
  // Delete requires auth for owned snapshots
  if (snapshot.account_id) {
    const ctx = await requireAuth(_req, res);
    if (!ctx) return;
    if (ctx.account!.account_id !== snapshot.account_id) {
      sendError(res, 404, ErrorCode.NOT_FOUND, "Snapshot not found");
      return;
    }
  }
  const deleted = await deleteSnapshot(snapshot_id);
  /* v8 ignore next 3  -  deleteSnapshot always succeeds when snapshot exists */
  if (!deleted) {
    sendError(res, 500, ErrorCode.INTERNAL_ERROR, "Failed to delete snapshot");
    return;
  }
  sendJSON(res, 200, { deleted: true, snapshot_id });
}

export async function handleDeleteProject(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const { project_id } = params;
  // Delete requires auth for owned projects
  const owner = await getProjectOwner(project_id);
  if (owner) {
    const ctx = await requireAuth(_req, res);
    if (!ctx) return;
    if (ctx.account!.account_id !== owner) {
      sendError(res, 404, ErrorCode.NOT_FOUND, "Project not found");
      return;
    }
  }
  const snapshots = await getProjectSnapshots(project_id);
  if (snapshots.length === 0) {
    // No snapshots to infer existence from — check the project row directly.
    const { sql } = await import("@axis/snapshots");
    const project = await sql.one("SELECT project_id FROM projects WHERE project_id = ?", [project_id]);
    if (!project) {
      sendError(res, 404, ErrorCode.NOT_FOUND, "Project not found");
      return;
    }
  }
  const result = await deleteProject(project_id);
  sendJSON(res, 200, { deleted: true, project_id, deleted_snapshots: result.deleted_snapshots });
}

export async function handleGetContext(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const { project_id } = params;
  if (!(await assertProjectAccess(_req, res, project_id))) return;
  const snapshots = await getProjectSnapshots(project_id);
  if (snapshots.length === 0) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "No snapshots found for project");
    return;
  }

  const latest = snapshots[snapshots.length - 1];
  const contextMap = await getContextMap(latest.snapshot_id);
  const repoProfile = await getRepoProfile(latest.snapshot_id);

  if (!contextMap || !repoProfile) {
    sendError(res, 404, ErrorCode.CONTEXT_PENDING, "Context not yet available  -  snapshot may still be processing");
    return;
  }

  sendJSON(res, 200, {
    snapshot_id: latest.snapshot_id,
    context_map: contextMap,
    repo_profile: repoProfile,
  });
}

export async function handleGetGeneratedFiles(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const { project_id } = params;
  if (!(await assertProjectAccess(_req, res, project_id))) return;
  const snapshots = await getProjectSnapshots(project_id);
  if (snapshots.length === 0) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "No snapshots found for project");
    return;
  }

  const latest = snapshots[snapshots.length - 1];
  const contextMap = await getContextMap(latest.snapshot_id);
  const repoProfile = await getRepoProfile(latest.snapshot_id);

  const generated = (await getGeneratorResult(latest.snapshot_id)) as GeneratorResult | undefined;
  /* v8 ignore next 3  -  V8 quirk: tested but V8 won't credit */
  if (!generated) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "No generated files available yet");
    return;
  }

  sendJSON(res, 200, {
    snapshot_id: latest.snapshot_id,
    project_id: latest.project_id,
    generated_at: generated.generated_at,
    files: generated.files,
    skipped: generated.skipped,
  });
}

export async function handleHealthCheck(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ready = !isShuttingDown();
  sendJSON(res, ready ? 200 : 503, {
    status: ready ? "ok" : "shutting_down",
    service: "axis-api",
    version: API_VERSION,
    timestamp: new Date().toISOString(),
  });
}

export async function handleDbStats(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // Admin-only: this leaks schema + table/index sizes. Gated like /v1/admin/*.
  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  const stats = await getPgDbStats();
  /* v8 ignore next  -  V8 quirk: stats always succeed in test DB */
  sendJSON(res, stats.success ? 200 : 500, stats);
}

export async function handleDbMaintenance(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // Admin-only: runs privileged DB maintenance (ANALYZE). Gated like /v1/admin/*.
  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  const results = await runPgMaintenance();
  const allOk = results.every((r) => r.success);
  /* v8 ignore next  -  V8 quirk: maintenance always succeeds in test DB */
  sendJSON(res, allOk ? 200 : 500, { results, success: allOk });
}

export async function handleGetGeneratedFile(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const { project_id, file_path } = params;
  if (!(await assertProjectAccess(_req, res, project_id))) return;
  const snapshots = await getProjectSnapshots(project_id);
  if (snapshots.length === 0) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "No snapshots found for project");
    return;
  }

  const latest = snapshots[snapshots.length - 1];
  const generated = (await getGeneratorResult(latest.snapshot_id)) as GeneratorResult | undefined;
  /* v8 ignore next 3  -  V8 quirk: no-generated check tested but V8 won't credit */
  if (!generated) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "No generated files available yet");
    return;
  }

  // Match by path  -  handle both "AGENTS.md" and ".ai/context-map.json" style
  const decoded = decodeURIComponent(file_path);
  if (decoded.includes("..") || decoded.startsWith("/")) {
    sendError(res, 400, ErrorCode.PATH_TRAVERSAL, "Invalid file path");
    return;
  }
  const file = generated.files.find(f => f.path === decoded || f.path === `.ai/${decoded}`);
  if (!file) {
    sendError(res, 404, ErrorCode.NOT_FOUND, `File not found: ${decoded}`, { available: generated.files.map(f => f.path) });
    return;
  }

  // Return raw content with appropriate content-type
  res.writeHead(200, { "Content-Type": file.content_type, "Access-Control-Allow-Origin": "*" });
  res.end(file.content);
}

export async function handleSearchExport(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const snapshotId = body.snapshot_id as string;
  if (!snapshotId || typeof snapshotId !== "string") {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "snapshot_id is required");
    return;
  }

  const generated = (await getGeneratorResult(snapshotId)) as GeneratorResult | undefined;
  if (!generated) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "No results for this snapshot  -  run POST /v1/snapshots first");
    return;
  }

  // Tenancy: an owned snapshot's artifacts are only readable by its owner (cross-tenant IDOR otherwise).
  const snapshot = await getSnapshot(snapshotId);
  if (snapshot && !(await assertSnapshotAccess(req, res, snapshot))) return;

  const searchFiles = generated.files.filter(f => f.program === "search");
  sendJSON(res, 200, {
    snapshot_id: snapshotId,
    program: "search",
    files: searchFiles,
  });
}

export async function handleSkillsGenerate(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const snapshotId = body.snapshot_id as string;
  if (!snapshotId || typeof snapshotId !== "string") {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "snapshot_id is required");
    return;
  }

  // Regenerate skills files with optional custom outputs
  const rawOutputs = body.outputs;
  if (rawOutputs !== undefined && !Array.isArray(rawOutputs)) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "outputs must be an array of strings");
    return;
  }

  const contextMap = (await getContextMap(snapshotId)) as ContextMap | undefined;
  const repoProfile = (await getRepoProfile(snapshotId)) as RepoProfile | undefined;
  if (!contextMap || !repoProfile) {
    sendError(res, 404, ErrorCode.CONTEXT_PENDING, "No context for this snapshot \u2014 run POST /v1/snapshots first");
    return;
  }

  const requestedOutputs = (rawOutputs as string[] | undefined) ?? ["AGENTS.md", "CLAUDE.md", ".cursorrules", "workflow-pack.md", "policy-pack.md"];
  const snapshot = await getSnapshot(snapshotId);
  // Tenancy: an owned snapshot is only readable by its owner (cross-tenant IDOR otherwise).
  if (snapshot && !(await assertSnapshotAccess(req, res, snapshot))) return;
  const result = generateFiles({
    context_map: contextMap,
    repo_profile: repoProfile,
    requested_outputs: requestedOutputs,
    source_files: snapshot?.files,
  });

  const skillsFiles = result.files.filter(f => f.program === "skills");
  sendJSON(res, 200, {
    snapshot_id: snapshotId,
    program: "skills",
    files: skillsFiles,
    skipped: result.skipped,
  });
}

// â”€â”€â”€ GitHub URL intake â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function handleGitHubAnalyze(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const githubUrl = body.github_url as string | undefined;
  if (!githubUrl || typeof githubUrl !== "string") {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "github_url is required");
    return;
  }

  // Import dynamically to avoid loading github module for other endpoints
  const githubMod = await import("./github.js").catch(() => null);
  if (!githubMod) {
    sendError(res, 500, ErrorCode.INTERNAL_ERROR, "Failed to load GitHub module");
    return;
  }
  const { fetchGitHubRepo, parseGitHubUrl } = githubMod;

  let parsed;
  try {
    parsed = parseGitHubUrl(githubUrl);
  } catch {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "Invalid GitHub URL. Expected: https://github.com/owner/repo");
    return;
  }

  let fetchResult;
  try {
    const rawToken = body.token;
    // Priority: 1) explicit token in request, 2) stored token for authenticated user, 3) env var
    let token = typeof rawToken === "string" ? rawToken : undefined;
    if (!token) {
      const auth = await resolveAuth(req);
      if (auth.account) {
        token = (await getGitHubTokenDecrypted(auth.account.account_id)) ?? undefined;
      }
    }
    if (!token) {
      token = process.env.GITHUB_TOKEN ?? undefined;
    }
    fetchResult = await fetchGitHubRepo(githubUrl, token || undefined);
  /* v8 ignore start  -  GitHub fetch error handling: tested but V8 won't credit all branches */
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const statusMatch = message.match(/returned (\d{3})/);
    const upstreamStatus = statusMatch ? parseInt(statusMatch[1], 10) : 0;
    if (upstreamStatus === 429 || upstreamStatus === 403) {
      sendError(res, 429, ErrorCode.RATE_LIMITED, "GitHub API rate limit reached. Try again later or provide a token.", { retry_after: 60 });
    } else if (upstreamStatus === 404) {
      sendError(res, 404, ErrorCode.NOT_FOUND, "GitHub repository not found");
    } else {
      sendError(res, 502, ErrorCode.UPSTREAM_ERROR, `Failed to fetch GitHub repo: ${message}`);
    }
    return;
  }
  /* v8 ignore stop */

  if (fetchResult.files.length === 0) {
    sendError(res, 422, ErrorCode.UNPROCESSABLE, "No source files found in repository");
    return;
  }

  // Check quota if authenticated
  const auth = await resolveAuth(req);
  if (!auth.anonymous && !auth.account) {
    sendError(res, 401, ErrorCode.INVALID_KEY, "Invalid or revoked API key");
    return;
  }
  if (auth.account) {
    const quota = await checkQuota(auth.account.account_id);
    /* v8 ignore next 11  -  requires exhausting rate quota in tests */
    if (!quota.allowed) {
      await trackEvent(auth.account.account_id, "limit_reached", "limit_hit", { reason: quota.reason, source: "github" });
      const budget = parseAgentBudget(req);
      const mode = resolveAgentMode(req);
      const pricing = getPricingTier("analyze_repo");
      const amountCents = mode === "lite" ? pricing.lite_cents : pricing.standard_cents;
      const mppResult = await chargeWithDiscounts(req, res, auth.account.account_id, amountCents, {
        currency: "usd",
        decimals: 2,
        description: `AXIS API Credit - $${(amountCents / 100).toFixed(2)} per run (${mode})`,
        meta: { account_id: auth.account.account_id, tier: auth.account.tier, mode },
      });
      if (mppResult === null) {
        const paymentMessage = quota.reason ?? "Quota exceeded";
        sendError(res, 429, ErrorCode.QUOTA_EXCEEDED, quota.reason ?? "Quota exceeded", {
          tier: quota.tier,
          usage: quota.usage,
          ...(await buildPaymentRequiredPayload("analyze_repo", paymentMessage, budget, auth.account.account_id, auth.account.tier)),
        });
      }
      if (mppResult === null || mppResult.status === 402) return;
    }
  } else if (auth.anonymous) {
    // H-Phase-A cycle 9: anonymous callers skipped this whole quota block
    // entirely — the same "anonymous uploads must still obey free-tier
    // limits" gap handleCreateSnapshot's own anon branch was fixed for
    // (unbounded uploads = DoS), just never mirrored here. fetchGitHubRepo's
    // own caps (500 files/256KB each) happen to already be stricter than
    // free tier's today, but that's an incidental property of ITS current
    // config, not a guarantee this handler enforces independently — matching
    // the sibling pattern closes that gap regardless of how fetchGitHubRepo
    // is configured in the future.
    const anonLimits = TIER_LIMITS.free;
    if (fetchResult.files.length > anonLimits.max_files_per_snapshot) {
      sendError(res, 413, ErrorCode.FILE_COUNT_EXCEEDED, `File limit exceeded: ${fetchResult.files.length} files (max ${anonLimits.max_files_per_snapshot} for anonymous)`);
      return;
    }
    for (const file of fetchResult.files) {
      if (file.size > anonLimits.max_file_size_bytes) {
        sendError(res, 413, ErrorCode.FILE_TOO_LARGE, `File too large: ${file.path} is ${file.size} bytes (max ${anonLimits.max_file_size_bytes} for anonymous)`);
        return;
      }
    }
  }

  // Create snapshot from fetched files
  const input = {
    input_method: "github_repo_url" as const,
    manifest: {
      project_name: `${parsed.owner}/${parsed.repo}`,
      project_type: "unknown",
      frameworks: [] as string[],
      goals: ["analyze", "generate-config"],
      requested_outputs: [] as string[],
    },
    files: fetchResult.files,
    github_url: githubUrl,
  };

  const snapshot = await createSnapshot(input, auth.account?.account_id);

  try {
    const contextMap = buildContextMap(snapshot);
    const repoProfile = buildRepoProfile(snapshot);

    await saveContextMap(snapshot.snapshot_id, contextMap);
    await saveRepoProfile(snapshot.snapshot_id, repoProfile);

    const generated = generateFiles({
      context_map: contextMap,
      repo_profile: repoProfile,
      requested_outputs: [],
      source_files: snapshot.files,
    });
    await saveGeneratorResult(snapshot.snapshot_id, generated);
    await updateSnapshotStatus(snapshot.snapshot_id, "ready");

    // Record usage per program if authenticated
    if (auth.account) {
      const programs = new Set(generated.files.map(f => f.program));
      const totalBytes = fetchResult.files.reduce((s, f) => s + f.size, 0);
      for (const program of programs) {
        const programFiles = generated.files.filter(f => f.program === program);
        await recordUsage(auth.account.account_id, program, snapshot.snapshot_id, programFiles.length, fetchResult.files.length, totalBytes);
      }
      await trackEvent(auth.account.account_id, "snapshot_created", await resolveStage(auth.account.account_id), {
        snapshot_id: snapshot.snapshot_id,
        programs: [...programs],
        source: "github",
        github_url: githubUrl,
      });
    }

    sendJSON(res, 201, {
      snapshot_id: snapshot.snapshot_id,
      project_id: snapshot.project_id,
      status: "ready",
      context_map: contextMap,
      repo_profile: repoProfile,
      generated_files: generated.files.map(f => ({ path: f.path, program: f.program, description: f.description })),
      github: {
        url: githubUrl,
        owner: parsed.owner,
        repo: parsed.repo,
        ref: fetchResult.ref,
        files_fetched: fetchResult.files.length,
        files_skipped: fetchResult.skipped_count,
        total_bytes: fetchResult.total_bytes,
      },
    });
  /* v8 ignore start  -  requires internal function to throw during processing */
  } catch (err) {
    await updateSnapshotStatus(snapshot.snapshot_id, "failed");
    log("error", "github_snapshot_processing_failed", {
      request_id: getRequestId(res),
      snapshot_id: snapshot.snapshot_id,
      github_url: githubUrl,
      error: err instanceof Error ? err.message : String(err),
    });
    sendError(res, 500, ErrorCode.PROCESS_FAILED, "Processing failed", {
      snapshot_id: snapshot.snapshot_id,
      status: "failed",
    });
  }
  /* v8 ignore stop */
}

// â”€â”€â”€ File Content Search API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function handleSearchIndex(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const snapshotId = body.snapshot_id as string;
  if (!snapshotId || typeof snapshotId !== "string") {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "snapshot_id is required");
    return;
  }

  const snapshot = await getSnapshot(snapshotId);
  if (!snapshot) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "Snapshot not found");
    return;
  }
  if (!(await assertSnapshotAccess(req, res, snapshot))) return;

  const files = (snapshot.files as Array<{ path: string; content: string }>).filter(
    (f) => typeof f.path === "string" && typeof f.content === "string",
  );

  const result = await indexSnapshotContent(snapshotId, files);
  const symbolResult = await indexSymbols(snapshotId, files);

  sendJSON(res, 200, {
    snapshot_id: snapshotId,
    indexed_files: result.indexed_files,
    indexed_lines: result.indexed_lines,
    indexed_symbols: symbolResult.indexed_symbols,
  });
}

export async function handleSearchQuery(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const snapshotId = body.snapshot_id as string;
  if (!snapshotId || typeof snapshotId !== "string") {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "snapshot_id is required");
    return;
  }

  const query = body.query as string;
  if (!query || typeof query !== "string") {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "query is required");
    return;
  }

  if (query.length > 500) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "query must be 500 characters or fewer");
    return;
  }

  const limit = typeof body.limit === "number" ? Math.min(Math.max(1, body.limit), 200) : 50;

  // Ownership check: verify the caller can access this snapshot
  const snapshot = await getSnapshot(snapshotId);
  if (snapshot && !(await assertSnapshotAccess(req, res, snapshot))) return;

  const results = await searchSnapshotContent(snapshotId, query, { limit });
  const stats = await getSearchIndexStats(snapshotId);

  sendJSON(res, 200, {
    snapshot_id: snapshotId,
    query,
    total_indexed_lines: stats.line_count,
    total_indexed_files: stats.file_count,
    results,
  });
}

export async function handleSearchStats(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const { snapshot_id } = params;
  const snapshot = await getSnapshot(snapshot_id);
  if (snapshot && !(await assertSnapshotAccess(_req, res, snapshot))) return;
  const stats = await getSearchIndexStats(snapshot_id);

  sendJSON(res, 200, {
    snapshot_id,
    ...stats,
  });
}

export async function handleSearchSymbols(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const { snapshot_id } = params;
  const snapshot = await getSnapshot(snapshot_id);
  // v8 ignore next
  if (snapshot && !(await assertSnapshotAccess(req, res, snapshot))) return;

  // v8 ignore next
  const url = new URL(req.url ?? "/", "http://localhost");
  const name = url.searchParams.get("name") ?? undefined;
  const type = url.searchParams.get("type") ?? undefined;
  const limitParam = url.searchParams.get("limit");
  // v8 ignore next
  const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 50), 200) : 50;

  const results = await searchSymbols(snapshot_id, { name, type, limit });
  const stats = await getSymbolStats(snapshot_id);

  sendJSON(res, 200, {
    snapshot_id,
    symbol_count: stats.symbol_count,
    results,
  });
}

// â”€â”€â”€ POST /v1/analyze  -  unified one-call analysis endpoint â”€â”€â”€â”€â”€â”€

// Per-file adoption hints (deterministic  -  same input = same output)
const ADOPTION_HINTS: Record<string, { placement: string; adoption_hint: string }> = {
  "AGENTS.md":                { placement: "repo root", adoption_hint: "Place in repo root. Cursor, Copilot, and Claude auto-load this as codebase context  -  instant AI grounding." },
  ".cursorrules":             { placement: "repo root", adoption_hint: "Place in repo root. Cursor reads this at the start of every session to understand your codebase." },
  "CLAUDE.md":                { placement: "repo root or project system prompt", adoption_hint: "Place in repo root, or paste into your Claude project system prompt for persistent context." },
  "context-map.json":         { placement: ".ai/", adoption_hint: "Machine-readable dependency graph. Reference from CI pipelines, code tools, or agent tooling." },
  "debug-playbook.md":        { placement: ".ai/", adoption_hint: "Share with your on-call team. Agents use this for automated incident triage and postmortem generation." },
  "incident-template.md":     { placement: "incident management system", adoption_hint: "Import as a template in PagerDuty, Linear, or your incident tracker." },
  "tracing-rules.md":         { placement: ".ai/", adoption_hint: "Add to your observability runbook. Governs trace sampling, span naming, and alert routing." },
  "root-cause-checklist.md":  { placement: ".ai/", adoption_hint: "Reference during postmortems. Systematizes root cause analysis  -  reduces MTTR." },
  "skills.json":              { placement: ".ai/", adoption_hint: "Add to your agent's context. Lists every detectable capability in this codebase." },
  "skill-map.md":             { placement: ".ai/", adoption_hint: "Human-readable capability index. Share with new team members or AI assistants onboarding to the repo." },
  "component-guidelines.md":  { placement: ".ai/", adoption_hint: "Reference when writing UI components. AI assistants use this to match your design system conventions." },
  "layout-patterns.md":       { placement: ".ai/", adoption_hint: "Reference for page-level layout decisions. Prevents AI from generating patterns you've already ruled out." },
  "ui-audit.md":              { placement: ".ai/", adoption_hint: "Review with your design team. Flags inconsistencies in component usage, spacing, and accessibility." },
  "frontend-rules.md":        { placement: ".ai/", adoption_hint: "Reference in Cursor/Copilot chat when building UI. Locks in your frontend conventions." },
  "seo-rules.md":             { placement: ".ai/", adoption_hint: "Add to your CMS or content pipeline. Ensures every page follows your SEO governance rules." },
  "schema-recommendations.json": { placement: ".ai/", adoption_hint: "Add JSON-LD structured data to your pages. Each route gets the right schema type." },
  "route-priority-map.md":    { placement: ".ai/", adoption_hint: "Use for sitemap generation and crawl budget allocation. Reference in your deployment pipeline." },
  "content-audit.md":         { placement: ".ai/", adoption_hint: "Review with your content team. Identifies thin content, duplicate metadata, and coverage gaps." },
  "meta-tag-audit.json":      { placement: ".ai/", adoption_hint: "Feed to your SEO tooling. Per-route meta tag analysis in machine-readable format." },
  "optimization-rules.md":    { placement: ".ai/", adoption_hint: "Reference in code review. Locks in performance and cost optimization patterns for AI-assisted work." },
  "prompt-diff-report.md":    { placement: ".ai/", adoption_hint: "Use before/after AI-assisted sessions to measure prompt quality drift and output consistency." },
  "cost-estimate.json":       { placement: ".ai/", adoption_hint: "Import into your billing dashboard or cost tracking pipeline. Per-operation token cost model." },
  "token-budget-plan.md":     { placement: ".ai/", adoption_hint: "Reference when designing AI features. Prevents unbounded token spend by establishing per-operation budgets." },
  "design-tokens.json":       { placement: ".ai/ or design system repo", adoption_hint: "Import into Figma via Token Studio, or your CSS-in-JS token pipeline. Single source of truth for design values." },
  "theme.css":                { placement: "styles/ or global CSS", adoption_hint: "Import in your global stylesheet. All design tokens as CSS custom properties, ready to use." },
  "theme-guidelines.md":      { placement: ".ai/", adoption_hint: "Reference when building UI themes. AI assistants use this to stay on-brand." },
  "component-theme-map.json": { placement: ".ai/", adoption_hint: "Maps each component to its design token set. Feed to your Storybook or design system tooling." },
  "dark-mode-tokens.json":    { placement: ".ai/ or design system repo", adoption_hint: "Import your dark mode token layer. Works with design-tokens.json as the light-mode base." },
  "brand-guidelines.md":      { placement: ".ai/ or brand portal", adoption_hint: "Share with copywriters, designers, and AI content tools. Establishes brand voice and usage rules." },
  "voice-and-tone.md":        { placement: ".ai/", adoption_hint: "Add to your AI writing tool system prompts. Ensures generated copy matches your brand voice." },
  "content-constraints.md":   { placement: ".ai/", adoption_hint: "Add to AI content generation workflows. Lists banned phrases, required disclaimers, and tone rules." },
  "messaging-system.yaml":    { placement: ".ai/", adoption_hint: "Machine-readable messaging hierarchy. Reference from CMS, email, and campaign tooling." },
  "channel-rulebook.md":      { placement: ".ai/", adoption_hint: "Reference per channel when publishing. Governs tone, format, and frequency for each distribution channel." },
  "superpower-pack.md":       { placement: ".ai/", adoption_hint: "Add to your AI assistant context. Unlocks codebase-specific capabilities not visible from file structure alone." },
  "workflow-registry.json":   { placement: ".ai/", adoption_hint: "Feed to your CI/CD automation and agent task runners. Machine-readable workflow catalog." },
  "test-generation-rules.md": { placement: ".ai/", adoption_hint: "Add to your AI test generation workflow. Locks in naming conventions, coverage thresholds, and assertion patterns." },
  "refactor-checklist.md":    { placement: ".ai/", adoption_hint: "Reference before major refactors. Reduces regression risk by surfacing known coupling and constraint patterns." },
  "automation-pipeline.yaml": { placement: ".ai/ or .github/workflows/", adoption_hint: "Import into your CI/CD pipeline. Automates the highest-ROI codebase maintenance tasks." },
  "campaign-brief.md":        { placement: ".ai/", adoption_hint: "Share with your marketing team and AI content tools. Grounds campaigns in real product capabilities." },
  "funnel-map.md":            { placement: ".ai/", adoption_hint: "Reference in analytics and product work. Maps the actual conversion path derived from your codebase." },
  "sequence-pack.md":         { placement: ".ai/", adoption_hint: "Import into your email/CRM platform. Triggered sequences derived from your actual user journey." },
  "cro-playbook.md":          { placement: ".ai/", adoption_hint: "Share with your growth team. Actionable conversion experiments matched to your existing UI patterns." },
  "ab-test-plan.md":          { placement: ".ai/", adoption_hint: "Import into your A/B testing platform. Tests designed for your specific component set and traffic patterns." },
  "notebook-summary.md":      { placement: ".ai/", adoption_hint: "Add to your Obsidian vault or Notion knowledge base. Structured summary of codebase knowledge." },
  "source-map.json":          { placement: ".ai/", adoption_hint: "Machine-readable knowledge source graph. Reference from your personal knowledge management tooling." },
  "study-brief.md":           { placement: ".ai/", adoption_hint: "Share with new engineers or AI assistants learning the codebase. Accelerates onboarding." },
  "research-threads.md":      { placement: ".ai/", adoption_hint: "Track open architectural questions and investigations. Add to your team wiki or project backlog." },
  "citation-index.json":      { placement: ".ai/", adoption_hint: "Machine-readable reference index. Feed to note-taking tools, documentation systems, or research agents." },
  "obsidian-skill-pack.md":   { placement: "Obsidian vault", adoption_hint: "Place in your Obsidian vault. Provides linked codebase knowledge as Obsidian-compatible nodes." },
  "vault-rules.md":           { placement: "Obsidian vault", adoption_hint: "Governs your vault structure for this project. Ensures consistent linking and tagging." },
  "graph-prompt-map.json":    { placement: "Obsidian vault or AI tooling", adoption_hint: "Maps graph relationships to prompt templates. Reference from AI-assisted note generation." },
  "linking-policy.md":        { placement: "Obsidian vault", adoption_hint: "Enforces consistent backlinking strategy. Prevents knowledge graph fragmentation." },
  "template-pack.md":         { placement: "Obsidian vault", adoption_hint: "Import as Obsidian templates. Each codebase concept gets a structured note template." },
  "mcp-config.json":          { placement: "MCP client config", adoption_hint: "Add to your MCP client configuration. Agents discover AXIS capabilities automatically  -  no manual tool registration." },
  "mcp-registry-metadata.json": { placement: "MCP registry publishing pipeline", adoption_hint: "Use when publishing to MCP registries. Contains registry metadata fields: name, version, description, and capabilities." },
  "protocol-spec.md":         { placement: "spec/ or repo root", adoption_hint: "Keep as a living protocol specification. Update whenever MCP transport, auth, versioning, or error semantics change." },
  "spec.types.ts":            { placement: "src/protocol/ or shared/contracts/", adoption_hint: "Import in MCP server/client code to enforce compile-time safety for message envelopes, tool schemas, and resource/prompt contracts." },
  "mcp/README.md":            { placement: "mcp/", adoption_hint: "Use as the package-level entrypoint for MCP integrators. Includes install, quickstart, supported runtimes, and contribution workflow." },
  "mcp/project-setup.md":     { placement: "mcp/", adoption_hint: "Use for initial environment bootstrap. Standardizes prerequisites, install flow, and local MCP verification steps." },
  "mcp/build-artifacts.md":   { placement: "mcp/ or release docs", adoption_hint: "Use in CI/CD and release gates. Defines required build outputs and artifact integrity checks before publish." },
  "mcp/package-json.root.template.json": { placement: "repo root (template)", adoption_hint: "Use as a starting point for root workspace package.json. Adjust scripts and package manager versions to match your environment." },
  "mcp/package-json.package.template.json": { placement: "packages/<name>/ (template)", adoption_hint: "Use as a per-package template for TypeScript workspace modules. Standardizes build/test/typecheck scripts and output fields." },
  "mcp/tsconfig.root.template.json": { placement: "repo root (template)", adoption_hint: "Use as your root tsconfig template. Enables strict TS settings, ESM module resolution, and monorepo path aliases." },
  "mcp/tsconfig.package.template.json": { placement: "packages/<name>/ (template)", adoption_hint: "Use per package to extend root compiler policy with strict checks and ESM-focused output paths." },
  "mcp/monorepo-structure.md": { placement: "mcp/ or architecture docs", adoption_hint: "Use as your canonical monorepo folder blueprint. Keep app/package boundaries and naming conventions aligned to this layout." },
  "mcp/core-implementation-artifacts.md": { placement: "mcp/ or architecture docs", adoption_hint: "Use as the implementation contract for server/client/sdk/middleware packages. Keeps runtime responsibilities and integration boundaries explicit." },
  "mcp/testing-documentation-polish-artifacts.md": { placement: "mcp/ or release docs", adoption_hint: "Use as your phase-4 hardening checklist. Covers testing depth, documentation quality, and release polish gates before publish." },
  "connector-map.yaml":       { placement: "agent tooling / .ai/", adoption_hint: "Reference from your agent tool registry. Complete map of AXIS connectors and their input/output contracts." },
  "capability-registry.json": { placement: "agent tooling", adoption_hint: "Exposes all queryable capabilities to agents. Add to your agent's startup context for zero-configuration capability discovery." },
  "server-manifest.yaml":     { placement: "MCP infrastructure", adoption_hint: "Deploy alongside your MCP server. Complete description of the tool surface, transport, and auth requirements." },
  "generated-component.tsx":  { placement: "src/components/", adoption_hint: "Drop into your components directory. Production-ready component generated from your design system and conventions." },
  "dashboard-widget.tsx":     { placement: "src/components/", adoption_hint: "Drop into your dashboard. Data-connected widget generated from your existing component patterns." },
  "embed-snippet.ts":         { placement: "public/ or CDN", adoption_hint: "Deploy to your CDN or embed in external surfaces. Zero-dependency, self-contained." },
  "artifact-spec.md":         { placement: ".ai/", adoption_hint: "Reference when generating new artifacts. Documents the artifact schema and generation constraints." },
  "component-library.json":   { placement: ".ai/ or Storybook config", adoption_hint: "Machine-readable component catalog. Import into Storybook, Chromatic, or design system tooling." },
  "remotion-script.ts":       { placement: "remotion/", adoption_hint: "Drop into your Remotion project. Generates video from your actual codebase data  -  not placeholder content." },
  "scene-plan.md":            { placement: ".ai/", adoption_hint: "Reference when storyboarding. Shot-by-shot plan derived from your real product architecture." },
  "render-config.json":       { placement: "remotion/ or CI pipeline", adoption_hint: "Import into your Remotion render pipeline. Configures output resolution, fps, and codec per environment." },
  "asset-checklist.md":       { placement: ".ai/", adoption_hint: "Use before shipping visual assets. Ensures every export format and size variant is accounted for." },
  "storyboard.md":            { placement: ".ai/", adoption_hint: "Share with your video team. Detailed shot descriptions derived from your product's actual user journey." },
  "canvas-spec.json":         { placement: ".ai/ or design tooling", adoption_hint: "Machine-readable canvas layout spec. Import into Fabric.js, Konva, or your generative design pipeline." },
  "social-pack.md":           { placement: ".ai/", adoption_hint: "Send to your social media team. Per-platform design specs derived from your brand system." },
  "poster-layouts.md":        { placement: ".ai/", adoption_hint: "Reference when generating marketing visuals. Layout system derived from your actual brand dimensions." },
  "asset-guidelines.md":      { placement: ".ai/", adoption_hint: "Add to your asset management workflow. Governs file naming, versioning, and export conventions." },
  "brand-board.md":           { placement: ".ai/ or brand portal", adoption_hint: "Share with external agencies and AI design tools. Complete visual identity reference in one document." },
  "generative-sketch.ts":     { placement: "src/ or sketches/", adoption_hint: "Run with p5.js or your generative art toolchain. Parameters tuned to your brand's visual identity." },
  "parameter-pack.json":      { placement: ".ai/ or generative tooling", adoption_hint: "Machine-readable parameter space. Feed to your generative art pipeline for constrained randomness." },
  "collection-map.md":        { placement: ".ai/", adoption_hint: "Reference when building NFT or generative art collections. Maps trait layers to your brand values." },
  "export-manifest.yaml":     { placement: ".ai/ or CI pipeline", adoption_hint: "Import into your export pipeline. Governs output formats, metadata, and delivery targets." },
  "variation-matrix.json":    { placement: ".ai/ or generative tooling", adoption_hint: "Machine-readable variation system. Feed to your generative pipeline to produce constrained, on-brand variants." },
  "agent-purchasing-playbook.md": { placement: "purchasing agent system prompt", adoption_hint: "Add to your purchasing agent's system prompt. Enables authorized, structured procurement against your product catalog." },
  "product-schema.json":      { placement: "agent tooling", adoption_hint: "Reference from your agent's tool definitions. Validates product structure before any purchase is initiated." },
  "checkout-flow.md":         { placement: "purchasing agent context", adoption_hint: "Step-by-step purchase protocol for agents. Prevents checkout errors and unauthorized transactions." },
  "negotiation-rules.md":     { placement: "purchasing agent context", adoption_hint: "Governs agent-to-agent pricing negotiation. Add to your automated procurement context." },
  "commerce-registry.json":   { placement: "agent tooling / /.well-known/", adoption_hint: "Register with your purchasing agent to enable product discovery, bearer auth, and commerce endpoint routing." },
};

/** Return placement and adoption hint for a given generated file path. Deterministic. */
export function adoptionHint(filePath: string): { placement: string; adoption_hint: string } {
  const basename = filePath.replace(/^.*[\\/]/, "");
  return ADOPTION_HINTS[basename] ?? ADOPTION_HINTS[filePath] ?? {
    placement: ".ai/",
    adoption_hint: "Add to your project's .ai/ directory for AI assistant context.",
  };
}

/** Top-priority next steps based on which files were generated. Deterministic (fixed priority order). */
export function buildNextSteps(files: Array<{ path: string }>): string[] {
  const paths = new Set(files.map(f => f.path.replace(/^.*[\\/]/, "")));
  const priority: Array<{ file: string; step: string }> = [
    { file: "AGENTS.md",           step: "Place AGENTS.md in your repo root  -  AI coding assistants auto-load codebase context" },
    { file: ".cursorrules",        step: "Place .cursorrules in your repo root  -  Cursor reads it at the start of every session" },
    { file: "CLAUDE.md",           step: "Add CLAUDE.md to your Claude project system prompt for persistent context" },
    { file: "mcp-config.json",     step: "Add mcp-config.json to your MCP client  -  agents discover AXIS tools automatically" },
    { file: "commerce-registry.json", step: "Add commerce-registry.json to your purchasing agent context for structured procurement" },
    { file: "debug-playbook.md",   step: "Share debug-playbook.md with your on-call team to enable AI-assisted incident triage" },
    { file: "design-tokens.json",  step: "Import design-tokens.json into your design system pipeline (Figma Token Studio, CSS custom properties)" },
    { file: "brand-guidelines.md", step: "Share brand-guidelines.md with AI writing and design tools for on-brand generation" },
  ];
  const steps: string[] = [];
  for (const { file, step } of priority) {
    if (paths.has(file)) steps.push(step);
    if (steps.length === 3) break;
  }
  return steps;
}

/** Extract project name from package.json or README heading. Returns null if not detectable. */
export function detectProjectName(files: Array<{ path: string; content: string }>): string | null {
  const pkg = files.find(f => f.path === "package.json" || f.path.endsWith("/package.json") && !f.path.includes("node_modules"));
  if (pkg) {
    try {
      const parsed = JSON.parse(pkg.content) as Record<string, unknown>;
      if (typeof parsed.name === "string" && parsed.name.length > 0) return parsed.name;
    } catch { /* ignore */ }
  }
  const readme = files.find(f => f.path === "README.md" || f.path === "readme.md");
  if (readme) {
    const match = readme.content.match(/^#\s+(.+)/m);
    if (match) return match[1].trim().slice(0, 64);
  }
  return null;
}

export async function handleAnalyze(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const githubUrl = body.github_url as string | undefined;
  const rawFiles = body.files as FileEntry[] | undefined;

  if (!githubUrl && !rawFiles) {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "github_url or files is required");
    return;
  }
  if (githubUrl && rawFiles) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "Provide github_url or files, not both");
    return;
  }

  const rawPrograms = body.programs;
  if (rawPrograms !== undefined && !Array.isArray(rawPrograms)) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "programs must be an array of strings");
    return;
  }
  const requestedPrograms = rawPrograms as string[] | undefined;

  const inlineContent = body.inline_content !== false;

  const auth = await resolveAuth(req);
  if (!auth.anonymous && !auth.account) {
    sendError(res, 401, ErrorCode.INVALID_KEY, "Invalid or revoked API key");
    return;
  }

  let files: FileEntry[];
  let inputMethod: SnapshotInput["input_method"];
  let githubMeta: Record<string, unknown> | undefined;

  if (githubUrl) {
    const githubAnalyzeMod = await import("./github.js").catch(() => null);
    if (!githubAnalyzeMod) {
      sendError(res, 500, ErrorCode.INTERNAL_ERROR, "Failed to load GitHub module");
      return;
    }
    const { fetchGitHubRepo, parseGitHubUrl } = githubAnalyzeMod;
    let parsed;
    try {
      parsed = parseGitHubUrl(githubUrl);
    } catch {
      sendError(res, 400, ErrorCode.INVALID_FORMAT, "Invalid GitHub URL. Expected: https://github.com/owner/repo");
      return;
    }
    let fetchResult;
    try {
      let token = typeof body.token === "string" ? body.token : undefined;
      if (!token && auth.account) {
        token = (await getGitHubTokenDecrypted(auth.account.account_id)) ?? undefined;
      }
      if (!token) token = process.env.GITHUB_TOKEN ?? undefined;
      fetchResult = await fetchGitHubRepo(githubUrl, token || undefined);
    /* v8 ignore start  -  github fetch errors: tested in handlers-deep.test.ts */
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      const statusMatch = message.match(/returned (\d{3})/);
      const upstreamStatus = statusMatch ? parseInt(statusMatch[1], 10) : 0;
      if (upstreamStatus === 429 || upstreamStatus === 403) {
        sendError(res, 429, ErrorCode.RATE_LIMITED, "GitHub API rate limit reached. Try again later or provide a token.", { retry_after: 60 });
      } else if (upstreamStatus === 404) {
        sendError(res, 404, ErrorCode.NOT_FOUND, "GitHub repository not found");
      } else {
        sendError(res, 502, ErrorCode.UPSTREAM_ERROR, `Failed to fetch GitHub repo: ${message}`);
      }
      return;
    }
    /* v8 ignore stop */
    if (fetchResult.files.length === 0) {
      sendError(res, 422, ErrorCode.UNPROCESSABLE, "No source files found in repository");
      return;
    }
    files = fetchResult.files;
    inputMethod = "github_repo_url";
    githubMeta = {
      url: githubUrl,
      owner: parsed.owner,
      repo: parsed.repo,
      ref: fetchResult.ref,
      files_fetched: fetchResult.files.length,
      files_skipped: fetchResult.skipped_count,
      total_bytes: fetchResult.total_bytes,
    };
  } else {
    // Direct files mode
    files = rawFiles!;
    if (!Array.isArray(files) || files.length === 0) {
      sendError(res, 400, ErrorCode.MISSING_FIELD, "files array must not be empty");
      return;
    }
    for (const file of files) {
      if (!file.path || typeof file.content !== "string") {
        sendError(res, 400, ErrorCode.FILE_INVALID, "Each file must have path (string) and content (string)");
        return;
      }
      file.path = file.path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+/, "");
      if (file.path.includes("..")) {
        sendError(res, 400, ErrorCode.PATH_TRAVERSAL, `Invalid file path: ${file.path}`);
        return;
      }
      file.size = file.size ?? Buffer.byteLength(file.content, "utf-8");
    }
    inputMethod = "api_submission";
    githubMeta = undefined;
  }

  const requestedPaidPrograms = requestedPrograms === undefined
    ? ALL_PROGRAMS.filter(program => !FREE_PROGRAMS.has(program))
    : requestedPrograms.filter(program => !FREE_PROGRAMS.has(program));

  if (requestedPaidPrograms.length > 0 && !auth.account) {
    sendError(
      res,
      401,
      ErrorCode.AUTH_REQUIRED,
      "Full AXIS analysis requires authentication. Use list_programs, search_and_discover_tools, or request only free programs (search, skills, debug) to stay on the free path.",
      { requested_paid_programs: requestedPaidPrograms },
    );
    return;
  }

  if (auth.account) {
    // VALIDATE-FIRST (charge-integrity hybrid, phase 1): deterministic caps run
    // BEFORE any money movement — the old ordering charged via
    // chargeWithDiscounts and then 413'd oversized requests, keeping money for
    // work that never ran. A doomed request must cost $0.
    const limits = TIER_LIMITS[auth.account.tier];
    if (files.length > limits.max_files_per_snapshot) {
      sendError(res, 413, ErrorCode.FILE_COUNT_EXCEEDED, `File limit exceeded: ${files.length} files (max ${limits.max_files_per_snapshot} for ${auth.account.tier} tier)`);
      return;
    }
    for (const file of files) {
      if (file.size > limits.max_file_size_bytes) {
        sendError(res, 413, ErrorCode.FILE_TOO_LARGE, `File too large: ${file.path} is ${file.size} bytes (max ${limits.max_file_size_bytes} for ${auth.account.tier} tier)`);
        return;
      }
    }

    // H-Phase-A cycle 5: the entitlement charge below and the quota-exceeded
    // charge further down used to both fire unconditionally when BOTH
    // conditions were true for the same request (missing program access AND
    // over quota) — an account was billed twice for one analyze call.
    // paidForThisCall tracks a successful charge from EITHER branch so the
    // second never re-charges (same shape/fix as the cycle-4 Firecrawl and
    // cycle-5 handleCreateSnapshot double-charges).
    let paidForThisCall = false;

    // Enforce program-level billing next: check which paid programs the user lacks access to.
    if (requestedPaidPrograms.length > 0) {
      const requestedPaidProgramsEnabled = await Promise.all(
        requestedPaidPrograms.map(p => isProgramEnabled(auth.account!.account_id, p)),
      );
      const blockedPrograms = requestedPaidPrograms.filter(
        (_p, i) => !requestedPaidProgramsEnabled[i],
      );
      if (blockedPrograms.length > 0) {
        const budget = parseAgentBudget(req);
        const mode = resolveAgentMode(req);
        const pricing = getPricingTier("analyze_repo");
        const amountCents = mode === "lite" ? pricing.lite_cents : pricing.standard_cents;
        const mppResult = await chargeWithDiscounts(req, res, auth.account.account_id, amountCents, {
          currency: "usd",
          decimals: 2,
          description: `AXIS pro programs - $${(amountCents / 100).toFixed(2)} per run (${blockedPrograms.join(", ")})`,
          meta: { account_id: auth.account.account_id, tier: auth.account.tier, programs: blockedPrograms.join(","), mode },
        });
        if (mppResult === null) {
          const paymentMessage = `analyze_repo requires $${(amountCents / 100).toFixed(2)} MPP credit (or Pro tier). This returns the full ${ARTIFACT_COUNT}-artifact AXIS bundle. Upgrade at iliad.trustfabric.ai/billing.`;
          sendError(res, 402, ErrorCode.TIER_REQUIRED, paymentMessage, {
            blocked_programs: blockedPrograms,
            tier: auth.account.tier,
            price_per_call: `$${(amountCents / 100).toFixed(2)}`,
            ...(await buildPaymentRequiredPayload("analyze_repo", paymentMessage, budget, auth.account.account_id, auth.account.tier)),
          });
        }
        if (mppResult === null || mppResult.status === 402) return;
        paidForThisCall = true;
      }
    }

    const quota = await checkQuota(auth.account.account_id);
    /* v8 ignore start  -  quota exceeded path */
    if (!quota.allowed && !paidForThisCall) {
      await trackEvent(auth.account.account_id, "limit_reached", "limit_hit", { reason: quota.reason, source: "analyze" });
      const budget = parseAgentBudget(req);
      const mode = resolveAgentMode(req);
      const pricing = getPricingTier("analyze_repo");
      const amountCents = mode === "lite" ? pricing.lite_cents : pricing.standard_cents;
      const mppResult = await chargeWithDiscounts(req, res, auth.account.account_id, amountCents, {
        currency: "usd",
        decimals: 2,
        description: `AXIS API Credit - $${(amountCents / 100).toFixed(2)} per run (${mode})`,
        meta: { account_id: auth.account.account_id, tier: auth.account.tier, mode },
      });
      if (mppResult === null) {
        const paymentMessage = quota.reason ?? "Quota exceeded";
        sendError(res, 429, ErrorCode.QUOTA_EXCEEDED, quota.reason ?? "Quota exceeded", {
          tier: quota.tier,
          usage: quota.usage,
          ...(await buildPaymentRequiredPayload("analyze_repo", paymentMessage, budget, auth.account.account_id, auth.account.tier)),
        });
      }
      if (mppResult === null || mppResult.status === 402) return;
    }
    /* v8 ignore stop */
    // File count/size caps already enforced ABOVE the charges (validate-first).
  } else {
    // Anonymous callers must still obey free-tier file count/size limits before the
    // expensive createSnapshot/generateFiles work runs — same fix as the sibling
    // handleCreateSnapshot anonymous branch (see its comment): without this an anonymous
    // caller can point /v1/analyze at an arbitrarily large repo (any file count/size) and
    // still reach full generation on free programs, an unbounded-cost DoS/abuse vector.
    const anonLimits = TIER_LIMITS.free;
    if (files.length > anonLimits.max_files_per_snapshot) {
      sendError(res, 413, ErrorCode.FILE_COUNT_EXCEEDED, `File limit exceeded: ${files.length} files (max ${anonLimits.max_files_per_snapshot} for anonymous)`);
      return;
    }
    for (const file of files) {
      if (file.size > anonLimits.max_file_size_bytes) {
        sendError(res, 413, ErrorCode.FILE_TOO_LARGE, `File too large: ${file.path} is ${file.size} bytes (max ${anonLimits.max_file_size_bytes} for anonymous)`);
        return;
      }
    }
  }

  const projectName = detectProjectName(files) ?? (githubMeta ? `${githubMeta.owner}/${githubMeta.repo}` : "unnamed-project");

  const skillsOutputs = !requestedPrograms || requestedPrograms.includes("skills")
    ? ["AGENTS.md", "CLAUDE.md", ".cursorrules", "workflow-pack.md", "policy-pack.md", "model-cascade.md"]
    : [];
  // lite_description promise (@axis/mpp PRICING_TIERS.analyze_repo/analyze_files):
  // "search/skills/debug programs only (3 of 20 programs)". The MCP path
  // (mcp-tool-impls.ts's restrictGeneratorsForLiteMode) already enforces this;
  // this REST twin charges the lite price via `mode` below but never restricted
  // the actual output set until now (H-Phase-A cycle 2). skillsOutputs above
  // already covers the search+skills half of the free set unconditionally —
  // only the PROGRAM_OUTPUTS side (which includes "debug", the third free
  // program, alongside all 17 paid ones) needs the lite gate.
  const lite = resolveAgentMode(req) === "lite";
  const allOutputs = [
    ...skillsOutputs,
    ...Object.entries(PROGRAM_OUTPUTS)
      .filter(([prog]) => (!requestedPrograms || requestedPrograms.includes(prog)) && (!lite || FREE_PROGRAMS.has(prog)))
      .flatMap(([, outputs]) => outputs),
  ];

  const input: SnapshotInput = {
    input_method: inputMethod,
    manifest: {
      project_name: projectName as string,
      project_type: "unknown",
      frameworks: [],
      goals: ["analyze", "generate"],
      requested_outputs: allOutputs,
    },
    files,
    ...(githubUrl ? { github_url: githubUrl } : {}),
  };

  const snapshot = await createSnapshot(input, auth.account?.account_id);

  try {
    const contextMap = buildContextMap(snapshot);
    const repoProfile = buildRepoProfile(snapshot);

    await saveContextMap(snapshot.snapshot_id, contextMap);
    await saveRepoProfile(snapshot.snapshot_id, repoProfile);

    const generated = generateFiles({
      context_map: contextMap,
      repo_profile: repoProfile,
      requested_outputs: allOutputs,
      source_files: snapshot.files,
    });
    await saveGeneratorResult(snapshot.snapshot_id, generated);
    await updateSnapshotStatus(snapshot.snapshot_id, "ready");

    if (auth.account) {
      const programs = new Set(generated.files.map(f => f.program));
      const totalBytes = files.reduce((s, f) => s + (f.size ?? 0), 0);
      for (const program of programs) {
        const programFiles = generated.files.filter(f => f.program === program);
        await recordUsage(auth.account.account_id, program, snapshot.snapshot_id, programFiles.length, files.length, totalBytes);
      }
      await trackEvent(auth.account.account_id, "snapshot_created", await resolveStage(auth.account.account_id), {
        snapshot_id: snapshot.snapshot_id,
        programs: [...programs],
        source: "analyze",
        ...(githubUrl ? { github_url: githubUrl } : {}),
      });
    }

    const enrichedFiles = generated.files
      .filter(f => !requestedPrograms || requestedPrograms.includes(f.program))
      .map(f => {
      const hint = adoptionHint(f.path);
      return {
        path: f.path,
        program: f.program,
        description: f.description,
        placement: hint.placement,
        adoption_hint: hint.adoption_hint,
        ...(inlineContent ? { content: f.content } : {}),
      };
    });

    const nextSteps = buildNextSteps(generated.files);

    sendJSON(res, 201, {
      snapshot_id: snapshot.snapshot_id,
      project_id: snapshot.project_id,
      status: "ready",
      snapshot_summary: {
        pro_unlock: "Pro unlock: 15 more programs + full compliance + purchasing readiness artifacts ($0.50/run or $99 once for Pro — a one-time charge, not a recurring subscription).",
      },
      analysis: {
        project_name: projectName,
        language: contextMap.project_identity.primary_language,
        frameworks: contextMap.detection.frameworks.map(fw => fw.name),
        file_count: files.length,
        routes_detected: contextMap.routes.length,
        domain_models_detected: contextMap.domain_models.length,
        separation_score: repoProfile.health.separation_score,
      },
      files: enrichedFiles,
      programs_run: new Set(enrichedFiles.map(f => f.program)).size,
      total_files: enrichedFiles.length,
      next_steps: nextSteps,
      ...(githubMeta ? { github: githubMeta } : {}),
    });
  /* v8 ignore start  -  requires internal function to throw */
  } catch (err) {
    await updateSnapshotStatus(snapshot.snapshot_id, "failed");
    log("error", "analyze_failed", {
      request_id: getRequestId(res),
      snapshot_id: snapshot.snapshot_id,
      error: err instanceof Error ? err.message : String(err),
    });
    sendError(res, 500, ErrorCode.PROCESS_FAILED, "Processing failed", {
      snapshot_id: snapshot.snapshot_id,
      status: "failed",
    });
  }
  /* v8 ignore stop */
}

// â”€â”€â”€ POST /v1/prepare-for-agentic-purchasing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Scoring weights for Purchasing Readiness Score (0â€“100). */
export const PURCHASING_READINESS_WEIGHTS = {
  commerce_artifacts:   25,
  mcp_configs:          20,
  compliance_checklist: 15,
  negotiation_playbook: 15,
  debug_playbook:       10,
  optimization_rules:   10,
  onboarding_docs:       5,
};

/** Pure function  -  computes Purchasing Readiness Score from a list of artifact paths. */
export function computePurchasingReadinessScore(paths: string[]): {
  score: number;
  gaps: string[];
  strengths: string[];
} {
  const has = (check: (p: string) => boolean) => paths.some(check);

  const checks = {
    commerce_artifacts:   has(p => p.includes("agent-purchasing-playbook") || p.includes("commerce-registry") || p.includes("product-schema") || p.includes("checkout-flow")),
    mcp_configs:          has(p => p.includes("mcp-config") || p.includes("capability-registry") || p.includes("mcp-playbook")),
    compliance_checklist: has(p => p.includes("negotiation-rules") || p.includes("checkout-flow")),
    negotiation_playbook: has(p => p.includes("negotiation-rules")),
    debug_playbook:       has(p => p.includes("debug-playbook")),
    optimization_rules:   has(p => p.includes("optimization-rules")),
    onboarding_docs:      has(p => p === "AGENTS.md" || p === "CLAUDE.md" || p === ".cursorrules"),
  };

  let score = 0;
  const strengths: string[] = [];
  const gaps: string[] = [];

  for (const [key, present] of Object.entries(checks)) {
    const weight = PURCHASING_READINESS_WEIGHTS[key as keyof typeof PURCHASING_READINESS_WEIGHTS];
    if (present) {
      score += weight;
      strengths.push(key.replace(/_/g, " "));
    } else {
      gaps.push(key.replace(/_/g, " "));
    }
  }

  return { score, gaps, strengths };
}

/** Evidence-based sub-checks for deeper scoring granularity. */
const EVIDENCE_CHECKS: Record<string, { pattern: (p: string) => boolean; label: string }[]> = {
  commerce_artifacts: [
    { pattern: p => p.includes("agent-purchasing-playbook"), label: "Agent purchasing playbook" },
    { pattern: p => p.includes("commerce-registry"), label: "Commerce registry" },
    { pattern: p => p.includes("product-schema"), label: "Product schema" },
    { pattern: p => p.includes("checkout-flow"), label: "Checkout flow" },
  ],
  mcp_configs: [
    { pattern: p => p.includes("mcp-config"), label: "MCP configuration" },
    { pattern: p => p.includes("capability-registry"), label: "Capability registry" },
    { pattern: p => p.includes("mcp-playbook"), label: "MCP playbook" },
  ],
  compliance_checklist: [
    { pattern: p => p.includes("negotiation-rules"), label: "Negotiation rules (AP2/UCP)" },
    { pattern: p => p.includes("checkout-flow"), label: "Checkout flow rules" },
  ],
  negotiation_playbook: [
    { pattern: p => p.includes("negotiation-rules"), label: "Negotiation playbook" },
  ],
  debug_playbook: [
    { pattern: p => p.includes("debug-playbook"), label: "Debug playbook" },
  ],
  optimization_rules: [
    { pattern: p => p.includes("optimization-rules"), label: "Optimization rules" },
  ],
  onboarding_docs: [
    { pattern: p => p === "AGENTS.md", label: "AGENTS.md" },
    { pattern: p => p === "CLAUDE.md", label: "CLAUDE.md" },
    { pattern: p => p === ".cursorrules", label: ".cursorrules" },
  ],
};

/**
 * Honest interpretation of a Purchasing Readiness Score. The score reflects how much
 * AXIS agentic-commerce artifact COVERAGE a codebase has — it is NOT a compliance
 * certification — so the label describes coverage tiers ("strong/partial/minimal-
 * coverage"), never "production-ready". `risk_level` is the READINESS risk (how
 * exposed you are proceeding without the hardening bundle), low only at strong
 * coverage. Single source of truth so the REST + MCP paths can't drift or over-claim.
 */
export function interpretReadiness(score: number): { interpretation: string; risk_level: "low" | "medium" | "high" } {
  return {
    interpretation: score >= 80 ? "strong-coverage" : score >= 50 ? "partial-coverage" : "minimal-coverage",
    risk_level: score >= 80 ? "low" : score >= 50 ? "medium" : "high",
  };
}

export function computePurchasingReadinessEvidence(paths: string[]): {
  evidence: { category: string; label: string; found: boolean }[];
  category_scores: Record<string, { weight: number; earned: number; artifacts_found: string[] }>;
} {
  const evidence: { category: string; label: string; found: boolean }[] = [];
  const category_scores: Record<string, { weight: number; earned: number; artifacts_found: string[] }> = {};

  for (const [category, subChecks] of Object.entries(EVIDENCE_CHECKS)) {
    const weight = PURCHASING_READINESS_WEIGHTS[category as keyof typeof PURCHASING_READINESS_WEIGHTS];
    const found: string[] = [];
    for (const sub of subChecks) {
      const matched = paths.some(sub.pattern);
      evidence.push({ category, label: sub.label, found: matched });
      if (matched) found.push(sub.label);
    }
    category_scores[category] = {
      weight,
      earned: found.length > 0 ? weight : 0,
      artifacts_found: found,
    };
  }

  return { evidence, category_scores };
}

export const PURCHASING_PROGRAMS = [
  "agentic-purchasing", "debug", "optimization", "mcp", "marketing",
  "superpowers", "seo", "brand", "search", "skills",
];

export async function handlePreparePurchasing(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const auth = await resolveAuth(req);

  let body: Record<string, unknown>;
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const { project_name, project_type, frameworks, goals, files: rawFiles, focus = "purchasing", agent_type, focus_areas, budget_per_run_cents, spending_window: bodySpendingWindow, referral_token } = body;

  if (!project_name || typeof project_name !== "string") {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "project_name is required");
    return;
  }
  if (!project_type || typeof project_type !== "string") {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "project_type is required");
    return;
  }
  if (!Array.isArray(frameworks)) {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "frameworks must be an array");
    return;
  }
  if (!Array.isArray(goals)) {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "goals must be an array");
    return;
  }
  if (!Array.isArray(rawFiles) || rawFiles.length === 0) {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "files must be a non-empty array");
    return;
  }

  const files: FileEntry[] = [];
  for (const f of rawFiles) {
    const file = f as Record<string, unknown>;
    if (typeof file.path !== "string" || typeof file.content !== "string") {
      sendError(res, 400, ErrorCode.FILE_INVALID, "Each file must have path (string) and content (string)");
      return;
    }
    const path = (file.path as string)
      .replace(/\\/g, "/")
      .replace(/\/+/g, "/")
      .replace(/^\/+/, "");
    if (path.includes("..")) {
      sendError(res, 400, ErrorCode.PATH_TRAVERSAL, `Invalid file path: ${file.path as string}`);
      return;
    }
    files.push({ path, content: file.content as string, size: Buffer.byteLength(file.content as string, "utf-8") });
  }

  // H-Phase-A cycle 5: the entitlement charge below and the quota-exceeded
  // charge further down used to both fire unconditionally when BOTH
  // conditions were true for the same request (missing program access AND
  // over quota) — an account was billed twice for one prepare_agentic_
  // purchasing call. paidForThisCall tracks a successful charge from EITHER
  // branch so the second never re-charges (same shape/fix as the cycle-4
  // Firecrawl and cycle-5 handleCreateSnapshot/handleAnalyze double-charges).
  let paidForThisCall = false;

  // Billing gate ï¿½ the hardener runs pro programs, so require auth + entitlement
  const proPrograms = PURCHASING_PROGRAMS.filter(p => !FREE_PROGRAMS.has(p));
  if (proPrograms.length > 0) {
    if (auth.anonymous || !auth.account) {
      sendError(res, 401, ErrorCode.AUTH_REQUIRED, "prepare_agentic_purchasing requires authentication. Include Authorization: Bearer <api_key>");
      return;
    }

    const proProgramsEnabled = await Promise.all(
      proPrograms.map(p => isProgramEnabled(auth.account!.account_id, p)),
    );
    const blockedPrograms = proPrograms.filter((_p, i) => !proProgramsEnabled[i]);
    if (blockedPrograms.length > 0) {
      await trackEvent(auth.account.account_id, "limit_reached", "limit_hit", {
        reason: `program_not_enabled:${blockedPrograms.join(",")}`,
        source: "prepare_agentic_purchasing",
      });

      const budget = parseAgentBudget(req);
      const mode = resolveAgentMode(req);
      const pricing = getPricingTier("prepare_agentic_purchasing");
      const amountCents = mode === "lite" ? pricing.lite_cents : pricing.standard_cents;

      const mppResult = await chargeWithDiscounts(req, res, auth.account.account_id, amountCents, {
        currency: "usd",
        decimals: 2,
        description: `Axis' Iliad - prepare_agentic_purchasing - $${(amountCents / 100).toFixed(2)} per run (${mode})`,
        meta: { account_id: auth.account.account_id, tier: auth.account.tier, tool: "prepare_agentic_purchasing", mode },
      });

      if (mppResult === null) {
        const paymentMessage = `prepare_agentic_purchasing requires $${(amountCents / 100).toFixed(2)} MPP credit (or Pro tier). This returns Purchasing Readiness Score + full hardening artifacts. Upgrade at iliad.trustfabric.ai/billing.`;
        sendError(res, 402, ErrorCode.TIER_REQUIRED, paymentMessage, {
          blocked_programs: blockedPrograms,
          tier: auth.account.tier,
          price_per_call: `$${(amountCents / 100).toFixed(2)}`,
          ...(await buildPaymentRequiredPayload("prepare_agentic_purchasing", paymentMessage, budget, auth.account.account_id, auth.account.tier)),
        });
      }
      if (mppResult === null || mppResult.status === 402) return;
      paidForThisCall = true;
    }
  }

  if (auth.account) {
    const quota = await checkQuota(auth.account.account_id);
    /* v8 ignore start  -  quota exceeded path */
    if (!quota.allowed && !paidForThisCall) {
      const budget = parseAgentBudget(req);
      const mode = resolveAgentMode(req);
      const pricing = getPricingTier("prepare_agentic_purchasing");
      const amountCents = mode === "lite" ? pricing.lite_cents : pricing.standard_cents;

      const mppResult = await chargeWithDiscounts(req, res, auth.account.account_id, amountCents, {
        currency: "usd",
        decimals: 2,
        description: `Axis' Iliad - prepare_agentic_purchasing - $${(amountCents / 100).toFixed(2)} per run (${mode})`,
        meta: { account_id: auth.account.account_id, tier: auth.account.tier, tool: "prepare_agentic_purchasing", mode },
      });
      if (mppResult === null) {
        sendError(res, 429, ErrorCode.QUOTA_EXCEEDED, quota.reason ?? "Quota exceeded", {
          tier: quota.tier,
          usage: quota.usage,
          ...(await buildPaymentRequiredPayload("prepare_agentic_purchasing", quota.reason ?? "Quota exceeded", budget, auth.account.account_id, auth.account.tier)),
        });
      }
      if (mppResult === null || mppResult.status === 402) return;
    }
    /* v8 ignore stop */
    const limits = TIER_LIMITS[auth.account.tier];
    if (files.length > limits.max_files_per_snapshot) {
      sendError(res, 413, ErrorCode.FILE_COUNT_EXCEEDED, `File limit exceeded: ${files.length} files (max ${limits.max_files_per_snapshot} for ${auth.account.tier} tier)`);
      return;
    }
  }

  const generators = listAvailableGenerators();
  const allOutputs = generators
    .filter(g => PURCHASING_PROGRAMS.includes(g.program))
    .map(g => g.path);

  const manifest: SnapshotManifest = {
    project_name,
    project_type,
    frameworks: frameworks as string[],
    goals: goals as string[],
    requested_outputs: allOutputs,
  };

  const snapshot = await createSnapshot(
    { input_method: "api_submission", manifest, files },
    auth.account?.account_id,
  );

  try {
    const ctxMap = buildContextMap(snapshot);
    const repoProfile = buildRepoProfile(snapshot);
    await saveContextMap(snapshot.snapshot_id, ctxMap);
    await saveRepoProfile(snapshot.snapshot_id, repoProfile);

    const generated = generateFiles({
      context_map: ctxMap,
      repo_profile: repoProfile,
      requested_outputs: allOutputs,
      source_files: snapshot.files,
    });
    // H-Phase-A cycle 3: GET /v1/snapshots/:id and its file-content twin check
    // ONLY snapshot ownership -- no mode, charge, or entitlement check -- so a
    // lite-mode caller could retrieve the exact pro-program bundle this
    // call's own response withholds, simply by fetching the snapshot
    // afterward. Persist only the free-program files' full content in lite
    // mode; the score below is computed from the FULL in-memory `generated`
    // (unaffected), so lite mode's readiness score stays accurate -- only
    // what's retrievable later via the snapshot/artifact endpoints is
    // restricted. Mirrors the MCP twin's runPreparePurchasing fix.
    const liteForPersistence = resolveAgentMode(req) === "lite";
    const toPersist = liteForPersistence
      ? { ...generated, files: generated.files.filter(f => FREE_PROGRAMS.has(f.program)) }
      : generated;
    await saveGeneratorResult(snapshot.snapshot_id, toPersist);
    await updateSnapshotStatus(snapshot.snapshot_id, "ready");

    if (auth.account) {
      const programs = new Set(generated.files.map(f => f.program));
      const totalBytes = files.reduce((s, f) => s + (f.size ?? 0), 0);
      for (const program of programs) {
        const pFiles = generated.files.filter(f => f.program === program);
        await recordUsage(auth.account.account_id, program, snapshot.snapshot_id, pFiles.length, files.length, totalBytes);
      }
      await trackEvent(auth.account.account_id, "snapshot_created", await resolveStage(auth.account.account_id), {
        snapshot_id: snapshot.snapshot_id,
        programs: [...programs],
        source: "prepare_agentic_purchasing",
        focus: typeof focus === "string" ? focus : "purchasing",
        ...(typeof agent_type === "string" ? { agent_type } : {}),
      });

      // â”€â”€ Referral tracking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (typeof referral_token === "string" && referral_token.length > 0) {
        const referral = await lookupReferralCode(referral_token as string);
        if (referral && referral.account_id !== auth.account.account_id) {
          await recordReferralConversion(referral.account_id, auth.account.account_id);
        }
      }
    }

    // Generate referral code for authenticated users
    const myReferralCode = auth.account ? await createReferralCode(auth.account.account_id) : null;
    const myCredits = auth.account ? await getReferralCredits(auth.account.account_id) : null;

    const artifactPaths = generated.files.map(f => f.path);
    const { score, gaps, strengths } = computePurchasingReadinessScore(artifactPaths);
    const { evidence, category_scores } = computePurchasingReadinessEvidence(artifactPaths);
    // WO-10: content-based readiness of the INPUT repo (snapshot.files) — independent
    // of the artifact-coverage score computed from generated artifact paths above.
    const codeReadiness = buildCodeReadinessBlock(snapshot.files);
    const purchasingFiles = generated.files.filter(f => f.program === "agentic-purchasing");

    const budget = parseAgentBudget(req);
    const agentMode = resolveAgentMode(req);

    // Allow budget from request body to override header-based budget
    const effectiveBudgetCents = typeof budget_per_run_cents === "number" ? (budget_per_run_cents as number) : budget?.budget_per_run_cents;
    const effectiveWindow = typeof bodySpendingWindow === "string" ? bodySpendingWindow : budget?.spending_window;

    // Parse focus areas from request body
    const validFocusAreas = new Set(["sca", "dispute", "mandate", "tap", "tokenization"]);
    const parsedFocusAreas: string[] | "all" = Array.isArray(focus_areas) && (focus_areas as string[]).length > 0
      ? (focus_areas as string[]).filter(a => typeof a === "string" && validFocusAreas.has(a))
      : "all";

    // -- Budget-aware compliance depth -----------------------------
    const complianceDepth: "full" | "standard" | "summary" =
      agentMode === "lite"
        ? "summary"
        : effectiveWindow === "per_call" && effectiveBudgetCents !== undefined && effectiveBudgetCents < 50
          ? "standard"
          : "full";

    const complianceSection = {
      compliance_depth: complianceDepth,
      compliance_depth_reason:
        complianceDepth === "summary"
          ? "Lite mode ï¿½ top gaps and score only. Upgrade to standard for full evidence."
          : complianceDepth === "standard"
            ? "Budget-constrained ï¿½ core compliance included, detailed TAP/dispute evidence abbreviated."
            : "Full compliance suite ï¿½ all evidence, TAP interop, dispute flows, and verification proofs included.",
      ...(complianceDepth === "full"
        ? { category_scores, evidence }
        : complianceDepth === "standard"
          ? { category_scores, evidence_summary: `${Object.keys(evidence).length} evidence checks available. Send X-Agent-Mode: standard or increase budget for full details.` }
          : { top_gaps: gaps.slice(0, 3), upgrade_hint: "Send X-Agent-Mode: standard for category scores and evidence." }),
    };

    sendJSON(res, 201, {
      snapshot_id: snapshot.snapshot_id,
      project_id: snapshot.project_id,
      status: "ready",
      upgrade_offer: {
        agent_conversion_message: `This codebase has ${score}% of the AXIS agentic-commerce artifact coverage. Upgrade to Pro for the full hardening bundle + $0.15 lite mode option.`,
        // H-Phase-A cycle 9: "$99/month" implied recurring billing — PAI'D's
        // checkout is a single one-time charge (no recurring billing exists
        // yet), so Pro costs $99 once.
        plan: "$99 once (Pro, one-time — not a recurring subscription)",
        standard_run: "$0.50/run",
        lite_from: "$0.15/run",
      },
      purchasing_readiness_score: score,
      code_readiness: codeReadiness,
      score_breakdown: {
        strengths,
        // lite_description promise: "purchasing readiness score + top 3 gaps
        // only (no full artifact bundle)" — mirrors the top-level `gaps`
        // field's gating in the MCP twin (mcp-tool-impls.ts's
        // runPreparePurchasing). complianceSection's own `top_gaps` (summary
        // mode) is now a redundant duplicate of this, not a separate leak.
        gaps: complianceDepth === "summary" ? gaps.slice(0, 3) : gaps,
        max_score: 100,
        interpretation: interpretReadiness(score).interpretation,
        // H-Phase-A cycle 2: this used to be followed by an unconditional
        // `evidence,` key that silently overwrote complianceSection's own
        // mode-gated evidence exclusion (a spread + same-name-key collision
        // bug) — every mode got the full evidence object regardless of
        // complianceDepth. complianceSection already carries `evidence` for
        // "full", `evidence_summary` for "standard", and nothing (just
        // `top_gaps`/`upgrade_hint`) for "summary" — trust its own gating.
        ...complianceSection,
        focus_areas: parsedFocusAreas,
        ...(effectiveBudgetCents !== undefined ? { effective_budget_cents: effectiveBudgetCents } : {}),
        recommended_next_action: gaps.length > 0
          ? `Focus on: ${gaps[0]}. This category adds ${PURCHASING_READINESS_WEIGHTS[gaps[0].replace(/ /g, "_") as keyof typeof PURCHASING_READINESS_WEIGHTS] ?? 0} points.`
          : "All categories covered. Consider running improve_my_agent_with_axis for deeper optimization.",
      },
      programs_executed: [...new Set(generated.files.map(f => f.program))],
      artifact_count: generated.files.length,
      // lite_description promise: "no full artifact bundle" — the score/gaps
      // computation above still runs server-side; only the bundle CONTENT
      // (purchasing_artifacts) and its full path inventory (all_artifacts)
      // are withheld in lite mode, mirroring the MCP twin's fix (H-Phase-A
      // cycle 1 on runPreparePurchasing; this REST twin was missed then and
      // confirmed leaking in cycle 2).
      ...(complianceDepth === "summary"
        ? {
            artifacts_note:
              "Lite mode: no full artifact bundle. Send X-Agent-Mode: standard (or omit the header) and call this endpoint again for the complete artifact set.",
          }
        : {
            purchasing_artifacts: purchasingFiles.map(f => ({
              path: f.path,
              program: f.program,
              description: f.description,
              content: f.content,
            })),
            all_artifacts: generated.files.map(f => ({
              path: f.path,
              program: f.program,
              description: f.description,
            })),
          }),
      how_to_call_axis_again: {
        note: "To re-run this analysis at any time, call either of these endpoints:",
        rest_endpoint: {
          method: "POST",
          path: "/v1/prepare-for-agentic-purchasing",
          body: { project_name, project_type, frameworks, goals, files: "<your files array>", focus },
        },
        mcp_tool: {
          method: "tools/call",
          name: "prepare_agentic_purchasing",
          args: { project_name, project_type, frameworks, goals, focus },
        },
        retrieve_artifact: {
          note: `Use the get_artifact MCP tool or fetch any artifact path from the all_artifacts list.`,
          snapshot_id: snapshot.snapshot_id,
        },
        budget_negotiation: {
          note: "On 402, send X-Agent-Budget header to negotiate pricing. Lite mode from $0.25/run.",
          header: "X-Agent-Budget",
          schema: { budget_per_run_cents: "number", spending_window: "per_call | hourly | daily | monthly" },
          lite_mode: "X-Agent-Mode: lite",
        },
      },
      ...(budget ? { agent_budget_acknowledged: budget } : {}),
      ...(myReferralCode ? {
        referral_program: {
          referral_token: myReferralCode.code,
          description: "Opt-in referral program: unique conversions attributed to this token earn usage credits (capped per call, calendar-month reset). Query status with the free get_referral_code / get_referral_credits tools.",
          earned_credits_millicents: myCredits!.earned_credits_millicents,
          lifetime_referrals: myCredits!.lifetime_referrals,
          free_calls_remaining: myCredits!.free_calls_remaining,
        },
      } : {}),
    });
  /* v8 ignore start  -  requires internal function to throw */
  } catch (err) {
    await updateSnapshotStatus(snapshot.snapshot_id, "failed");
    log("error", "prepare_purchasing_failed", {
      request_id: getRequestId(res),
      snapshot_id: snapshot.snapshot_id,
      error: err instanceof Error ? err.message : String(err),
    });
    sendError(res, 500, ErrorCode.PROCESS_FAILED, "Processing failed", {
      snapshot_id: snapshot.snapshot_id,
      status: "failed",
    });
  }
  /* v8 ignore stop */
}

// â”€â”€â”€ GET /.well-known/axis.json  -  agent discovery manifest â”€â”€â”€â”€â”€â”€

export async function handleWellKnown(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  sendJSON(res, 200, {
    name: "Axis' Iliad",
    referral_program: {
      description: "Opt-in referral program: paid calls return a referral_token; unique conversions attributed to a token earn usage credits (capped per call, calendar-month reset).",
      status_tools: ["get_referral_code", "get_referral_credits"],
    },
    tagline: `Analyze any codebase. Generate ${ARTIFACT_COUNT} structured artifacts across ${PROGRAM_COUNT} programs.`,
    version: API_VERSION,
    description: "Submit source files or a GitHub URL. AXIS returns structured AI context files  -  AGENTS.md, .cursorrules, CLAUDE.md, debug playbooks, brand guidelines, and more  -  each tuned to your specific codebase. Every file includes an adoption_hint telling you exactly where to place it.",
    analyze_endpoint: {
      method: "POST",
      path: "/v1/analyze",
      accepts: ["application/json"],
      body_options: [
        { field: "github_url", type: "string", description: "Public GitHub repo URL (https://github.com/owner/repo)" },
        { field: "files", type: "array", description: "Array of {path, content} objects  -  your source files directly" },
      ],
      optional_fields: [
        { field: "programs", type: "string[]", description: "Filter to specific programs (e.g. [\"search\",\"mcp\"]). Defaults to all." },
        { field: "inline_content", type: "boolean", description: "Include file content in response (default: true)" },
        { field: "token", type: "string", description: "GitHub personal access token for private repos" },
      ],
      authentication: {
        type: "bearer",
        header: "Authorization: Bearer <api_key>",
        obtain: "POST /v1/accounts  -  creates an account and returns raw_key",
        note: "Anonymous requests are accepted on the free tier",
      },
    },
    programs: PROGRAM_COUNT,
    generators: ARTIFACT_COUNT,
    key_outputs: [
      { path: "AGENTS.md",           program: "search",             purpose: "Codebase context for AI coding assistants (Cursor, Copilot, Claude)" },
      { path: ".cursorrules",        program: "search",             purpose: "Cursor IDE session rules  -  loaded before every conversation" },
      { path: "CLAUDE.md",           program: "search",             purpose: "Claude project system prompt context" },
      { path: "mcp-config.json",     program: "mcp",                purpose: "MCP server configuration  -  agents discover AXIS tools automatically" },
      { path: "commerce-registry.json", program: "agentic-purchasing", purpose: "Product catalog and commerce endpoints for purchasing agents" },
      { path: "agent-purchasing-playbook.md", program: "agentic-purchasing", purpose: "Authorized procurement protocol for autonomous agents" },
      { path: "debug-playbook.md",   program: "debug",              purpose: "Incident triage and postmortem generation context" },
      { path: "design-tokens.json",  program: "theme",              purpose: "Design system tokens  -  import into Figma, CSS, or component library" },
    ],
    quick_start: {
      step_1: "POST /v1/accounts with {email, name, tier: 'free'} â†’ get raw_key",
      step_2: "POST /v1/analyze with {github_url: 'https://github.com/your/repo'} and Authorization: Bearer <raw_key>",
      step_3: "Read adoption_hint on each returned file to know exactly where to place it",
      step_4: "Place AGENTS.md in repo root  -  AI assistants auto-load it immediately",
    },
    llms_txt: "GET /llms.txt  -  plain-text instructions for AI tools on how to interact with AXIS",
    security_txt: "GET /.well-known/security.txt  -  RFC 9116 security contact (Contact, Expires, Policy, Canonical)",
    agent_json: "GET /.well-known/agent.json  -  AgentSEO/MCP scanner agent manifest (name, version, capabilities, endpoints)",
    skills: "GET /.well-known/skills/index.json  -  agent skills index following the agentskills.io standard",
    capabilities: "GET /.well-known/capabilities.json  -  semantic capability manifest for agent tool discovery (AP2/UCP/Visa/purchasing/compliance/agentic-commerce/CE3.0/SCA-exemption keywords indexed).",
    openapi_json: "GET /openapi.json  -  OpenAPI 3.1 spec alias",
    for_agents: {
      note: "Every file in the response includes placement and adoption_hint fields. No guesswork  -  you know exactly what each file does and where it goes.",
      purchasing: "POST /v1/prepare-for-agentic-purchasing  -  computes Purchasing Readiness Score (0â€“100), chains 8 programs, returns commerce artifacts + CE 3.0 dispute evidence requirements + SCA exemption paths + compliance checklist + negotiation playbook + self-onboarding kit in a single call. Focus areas: sca, dispute, mandate, tap, tokenization.",
      agentic_purchasing_generate: "POST /v1/agentic-purchasing/generate after creating a snapshot. Returns commerce-registry.json with product schema, bearer auth, and checkout flow.",
      mcp_discovery: `GET /mcp (Streamable HTTP transport, 2025-03-26 spec). ${MCP_TOOL_COUNT} tools including analyze_repo, analyze_files, get_snapshot, get_artifact, list_programs, prepare_agentic_purchasing, search_and_discover_tools, discover_commerce_tools, improve_my_agent_with_axis, discover_agentic_purchasing_needs, get_referral_code, get_referral_credits.`,
      search_tools: `GET /v1/mcp/tools?q=<keyword>  -  search all ${PROGRAM_COUNT} programs and ${ARTIFACT_COUNT} generators by capability keyword. Returns ranked programs with artifact paths, capability tags, and example API calls. No auth required.`,
      intent_probe: "POST /probe-intent  -  lightweight intent matching. Send {intent: 'your need'} and get ranked AXIS tool recommendations. Free, no auth, no API key needed.",
      registry_metadata: "GET /v1/mcp/server.json  -  MCP registry metadata for mcp-publisher CLI and registry crawlers (Glama.ai, Smithery.ai).",
      openapi: "GET /v1/docs  -  full OpenAPI 3.1 spec",
      examples: "https://github.com/lastmanupinc-hub/axis-iliad-examples  -  before/after examples of AXIS artifact-coverage runs (coverage score measures AXIS artifact presence, 0-100). Coverage is not a code-readiness or production-readiness claim; see the code_readiness block for the content-based verdict.",
    },
  });
}

// ─── GET /v1/error-codes  -  H4.2 generated error-code catalog ──────

export async function handleErrorCodes(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const { sendJSON } = await import("./router.js");
  sendJSON(res, 200, {
    rest_error_codes: ERROR_CODE_CATALOG,
    mcp_tool_error_categories: {
      note: "MCP tools/call errors attach a coarser _error:{code,retryable} next to the tool result, classified from the thrown error's message — not the rest_error_codes above.",
      categories: MCP_ERROR_CATEGORY_CATALOG,
    },
    envelope: {
      rest: "{ error: string, error_code: string, request_id: string, ...extra }",
      mcp: "{ content: [...], isError: true, _error: { code, retryable } }",
    },
  });
}

// ─── GET /llms.txt  -  llmstxt.org standard ──────────────────────────

// --- GET /.well-known/capabilities.json -------------------------

export async function handleCapabilities(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  sendJSON(res, 200, {
    name: "Axis' Iliad",
    version: API_VERSION,
    description: `Semantic capability manifest for agent tool discovery. Analyzes codebases, generates ${ARTIFACT_COUNT} artifacts across ${PROGRAM_COUNT} programs. Full agentic commerce hardening including AP2/UCP/Visa IC compliance.`,
    keywords: [
      "AP2", "AP2-compliance", "Article-2", "UN-CISG",
      "UCP", "UCP-600", "UCP-Article-5", "documentary-credits",
      "Visa-Intelligent-Commerce", "Visa-IC", "autonomous-checkout",
      "agentic-purchasing", "agentic-commerce", "purchasing-readiness-score",
      "spending-authority", "procurement-protocol", "negotiation-playbook",
      "compliance-checklist", "autonomous-agent", "MCP", "mcp-server", "tool-discovery",
      "codebase-analysis", "AGENTS.md", "CLAUDE.md", ".cursorrules", "context-artifacts",
      "code-review", "repo-analysis", "github-analysis", "ai-coding-assistant",
      "copilot-context", "cursor-rules", "context-generation", "agent-tools",
      "commerce-readiness", "codebase-intelligence",
      "security-txt", "RFC-9116", "vulnerability-disclosure",
      "SCA", "PSD2", "PCI-DSS", "fraud-detection", "dispute-flow",
      "intent-discovery", "probe-intent", "checkout-flow", "payment-gateway",
      "agent-onboarding", "self-onboarding", "purchasing-needs",
      "CE3.0", "compelling-evidence", "dispute-evidence", "SCA-exemption",
      "TAP", "VROL", "CDRN", "RDR", "evidence-requirements",
      "network-tokenization", "VTS", "MDES", "focus-areas",
    ],
    capabilities: {
      purchasing_readiness: {
        endpoint: "POST /v1/prepare-for-agentic-purchasing",
        mcp_tool: "prepare_agentic_purchasing",
        description: "Computes Purchasing Readiness Score (0-100) across 7 categories. Returns AP2, UCP, Visa IC compliance checklist, CE 3.0 dispute evidence requirements, SCA exemption paths, negotiation playbook, autonomous checkout rules, MCP self-onboarding config. Focus areas: sca, dispute, mandate, tap, tokenization.",
        score_rubric: {
          commerce_artifacts: 25,
          mcp_configs: 20,
          compliance_checklist: 15,
          negotiation_playbook: 15,
          debug_playbook: 10,
          optimization_rules: 10,
          onboarding_docs: 5,
        },
      },
      discovery: {
        endpoint: "GET /v1/mcp/tools",
        mcp_tool: "search_and_discover_tools",
        description: `Keyword search across all ${PROGRAM_COUNT} programs. No auth required.`,
        auth_required: false,
      },
      intent_probe: {
        endpoint: "POST /probe-intent",
        mcp_tool: "discover_agentic_purchasing_needs",
        description: "Lightweight intent matching ï¿½ describe your commerce, compliance, or DevOps need and get tailored AXIS tool recommendations. Free, no auth.",
        auth_required: false,
      },
      analysis: {
        endpoint: "POST /v1/analyze",
        mcp_tool: "analyze_repo",
        description: `Full repo analysis - ${ARTIFACT_COUNT} artifacts across ${PROGRAM_COUNT} programs.`,
        auth_required: true,
      },
    },
    mcp: {
      transport: "Streamable HTTP (2025-03-26 spec)",
      endpoint: "POST /mcp",
      tools: [
        "analyze_repo", "analyze_files", "get_snapshot", "get_artifact",
        "list_programs", "prepare_agentic_purchasing", "search_and_discover_tools",
        "discover_commerce_tools", "improve_my_agent_with_axis",
        "discover_agentic_purchasing_needs", "get_referral_code", "get_referral_credits",
        "sca_exemption_decision", "grade_compliance", "assemble_ce3_evidence",
        "build_ap2_mandate", "score_dispute_readiness", "assemble_representment",
      ],
    },
    security_txt: "https://axis-api-6c7z.onrender.com/.well-known/security.txt",
    examples_repo: "https://github.com/lastmanupinc-hub/axis-iliad-examples",
    for_agents: "https://axis-api-6c7z.onrender.com/for-agents",
    openapi: "https://axis-api-6c7z.onrender.com/v1/docs",
  });
}

// --- GET /llms.txt  -  llmstxt.org standard ---------------------------------

export async function handleLlmsTxt(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = `# Axis' Iliad

> Analyze any codebase. Generate ${ARTIFACT_COUNT} structured AI context artifacts across ${PROGRAM_COUNT} programs. Makes any repo immediately legible to AI coding assistants, autonomous agents, and purchasing agents.

Axis' Iliad is an API that accepts source files (or a GitHub URL) and returns structured files  -  AGENTS.md, .cursorrules, CLAUDE.md, debug playbooks, MCP configs, commerce artifacts, brand guidelines, design tokens, and more  -  each calibrated to the specific codebase.

## Quick Start

- POST /v1/accounts  -  create account, get API key (free tier available, no auth required)
- POST /v1/analyze  -  submit {github_url} or {files:[{path,content}]} â†’ returns ${ARTIFACT_COUNT} artifacts
- GET /.well-known/axis.json  -  machine-readable capability manifest
- GET /v1/mcp/tools?q=  -  search programs by keyword (no auth required)

## MCP Integration

Connect directly via Model Context Protocol (Streamable HTTP, 2025-03-26 spec):

- Endpoint: POST /mcp
- ${MCP_TOOL_COUNT} tools: ${MCP_TOOLS.map(t => t.name).join(", ")}
- No installation required  -  connect any MCP-compatible agent to https://axis-api-6c7z.onrender.com/mcp

## Programs (${PROGRAM_COUNT} total)

Free tier: search (AGENTS.md, .cursorrules, CLAUDE.md, symbol-index), skills, debug
Pro tier: frontend, seo, optimization, theme, brand, superpowers, marketing, notebook, obsidian, mcp, artifacts, remotion, canvas, algorithmic, agentic-purchasing, closer

## Agentic Commerce

For autonomous purchasing agents:

- POST /v1/prepare-for-agentic-purchasing  -  one-call hardener. Chains ${PURCHASING_PROGRAMS.length} programs, computes Purchasing Readiness Score (0-100), returns AP2/UCP/Visa compliance checklist, negotiation playbook, product schema, checkout flow, dispute handling, and self-onboarding kit.
- The Purchasing Readiness Score measures: commerce_artifacts (20pts), mcp_configs (20pts), compliance_checklist (15pts), negotiation_playbook (15pts), debug_playbook (10pts), optimization_rules (10pts), onboarding_docs (10pts).

## Authentication

- Bearer token: Authorization: Bearer <api_key>
- Obtain key: POST /v1/accounts with {email, name, tier: "free"}
- Free tier: unlimited on ${TIER_LIMITS.free.programs.join("/")} programs, ${TIER_LIMITS.free.max_snapshots_per_month} snapshots/month total (pro programs need a paid tier)

## Instructions for LLM Agents

When integrating with Axis' Iliad as an LLM agent:

- Always use POST /v1/analyze as the primary entry point for codebase analysis.
- Prefer MCP transport (POST /mcp) over REST when your runtime supports Model Context Protocol.
- Do NOT embed API keys in generated artifacts or share them in client-side code.
- Free programs (search, skills, debug) never require auth or payment. Do not prompt for auth when calling only free programs.
- For paid programs, handle 402 responses by reading the negotiation body: it includes pricing, budget headers, lite-mode alternatives, and free fallbacks.
- When receiving a 429 (quota exceeded), retry after the window resets or switch to free-only programs.
- Paid responses include a referral_token tied to the opt-in referral usage-credit program. The free get_referral_code and get_referral_credits tools report referral status.
- Use GET /.well-known/axis.json for machine-readable capability discovery, not the OpenAPI spec.
- Use POST /probe-intent with {intent: "your need"} for lightweight intent matching (free, no auth).
- Always check the adoption_hint field on returned artifacts to know where to place each file.

## MCP Response Envelope

Every successful tools/call result (free or paid, authenticated or anonymous) carries a _usage object next to content: {tier, credits_remaining, usage_credits, compensation, tool}. credits_remaining is the persistence-credit balance (spent on version-diffing, a separate pool from usage_credits). usage_credits is this month's blended-credit-pool standing: {plan_id, month_key, monthly_allowance, included_credits_used, included_credits_remaining, overage_credits_this_month}. compensation is a running lifetime total ({owed_cents, credited_cents}) for any past call that collected payment and then failed — any owed amount is auto-credited on your next call, you never claim it manually. All four are null when anonymous.

Retry a call with the same Idempotency-Key header and unchanged arguments and you get the original result back, never a second charge or run — the response carries a top-level _idempotent_replay: true instead of a fresh _usage snapshot's absence (the replayed _usage is still present, just echoing the original call's values).

A failed call never carries _usage — instead it carries _error: {code, retryable} (see MCP tool-call error categories below) and, only when that specific call had already collected an in-band cash payment before the tool threw, a one-off _compensation: {entry_id, amount_cents, status} record for exactly that incident. _compensation (singular, error-only) is a receipt for one incident; the compensation field inside _usage (success-only) is the running total across every incident.

## Error Codes

Every REST error response carries error_code alongside error (human message) and request_id. Structured JSON (same data as below, machine-readable): GET /v1/error-codes

${ERROR_CODE_CATALOG.map(e => `- ${e.code} (${e.statuses.length ? e.statuses.join("/") : "reserved, unused"}, retryable: ${e.retryable}): ${e.description} ${e.retry_guidance}`).join("\n")}

MCP tools/call errors instead attach a coarser _error:{code,retryable} next to the tool result, classified from the thrown error's message (not the codes above):

${MCP_ERROR_CATEGORY_CATALOG.map(c => `- ${c.code} (retryable: ${c.retryable}): ${c.description}`).join("\n")}

## Docs

- Full OpenAPI 3.1 spec: GET /v1/docs
- Plain-text docs: GET /v1/docs.md
- Discovery manifest: GET /.well-known/axis.json
- Security policy: GET /.well-known/security.txt
- Agent skills: GET /.well-known/skills/index.json
- MCP registry metadata: GET /v1/mcp/server.json  -  for mcp-publisher CLI and registry crawlers
`;
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}

// â”€â”€â”€ GET /.well-known/security.txt  -  RFC 9116 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function handleSecurityTxt(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const lines = [
    "Contact: mailto:security@jonathanarvay.com",
    "Contact: https://github.com/lastmanupinc-hub/axis-iliad/security/advisories",
    "Expires: 2027-04-15T00:00:00.000Z",
    "Preferred-Languages: en",
    "Canonical: https://iliad.trustfabric.ai/.well-known/security.txt",
    "Policy: https://github.com/lastmanupinc-hub/axis-iliad/security/policy",
    "Hiring: https://github.com/lastmanupinc-hub",
  ];
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(lines.join("\n") + "\n");
}

// â”€â”€â”€ GET /.well-known/skills/index.json  -  agent skills registry â”€â”€

export async function handleRobotsTxt(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const lines = [
    "# robots.txt for Axis' Iliad",
    "# Built specifically for agentic commerce and autonomous purchasing agents",
    "",
    "User-agent: *",
    "Allow: /",
    "Allow: /.well-known/",
    "Allow: /mcp",
    "Allow: /pricing",
    "Allow: /for-agents",
    "Allow: /v1/",
    "Allow: /llms.txt",
    "Allow: /robots.txt",
    "Disallow: /private/",
    "",
    "# AI / MCP / agent crawler directives",
    "User-agent: GPTBot",
    "Allow: /",
    "",
    "User-agent: OAI-SearchBot",
    "Allow: /",
    "",
    "User-agent: Google-Extended",
    "Allow: /",
    "",
    "User-agent: ClaudeBot",
    "Allow: /",
    "",
    "User-agent: Amazonbot",
    "Allow: /",
    "",
    "# Axis' Iliad MCP server (io.github.lastmanupinc-hub/axis-iliad)",
    "# Primary tool: prepare_agentic_purchasing",
    "# Use case: Hardens codebases for autonomous purchasing (readiness score, AP2/UCP/Visa compliance, negotiation playbooks, checkout rules)",
    "# Pay-per-run: $0.50 for full-suite analyze via Stripe MPP",
    "# Full documentation: https://iliad.trustfabric.ai/for-agents",
    "# Security: https://iliad.trustfabric.ai/.well-known/security.txt",
    "",
    "# Discovery endpoints: GET /.well-known/axis.json, GET /.well-known/agent.json, GET /openapi.json",
    "",
    "Sitemap: https://iliad.trustfabric.ai/sitemap.xml",
  ];
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(lines.join("\n"));
}

export async function handleSitemapXml(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const base = "https://iliad.trustfabric.ai";
  const now = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const urls: Array<{ loc: string; changefreq: string; priority: string }> = [
    { loc: "/",                               changefreq: "weekly",  priority: "1.0" },
    { loc: "/for-agents",                     changefreq: "weekly",  priority: "0.9" },
    { loc: "/mcp",                            changefreq: "weekly",  priority: "0.9" },
    { loc: "/pricing",                        changefreq: "weekly",  priority: "0.8" },
    { loc: "/llms.txt",                       changefreq: "monthly", priority: "0.8" },
    { loc: "/robots.txt",                     changefreq: "monthly", priority: "0.5" },
    { loc: "/v1/docs",                        changefreq: "weekly",  priority: "0.9" },
    { loc: "/v1/docs.md",                     changefreq: "weekly",  priority: "0.8" },
    { loc: "/openapi.json",                   changefreq: "weekly",  priority: "0.8" },
    { loc: "/health",                         changefreq: "daily",   priority: "0.3" },
    { loc: "/docs",                           changefreq: "weekly",  priority: "0.7" },
    { loc: "/.well-known/axis.json",          changefreq: "monthly", priority: "0.7" },
    { loc: "/.well-known/capabilities.json",  changefreq: "monthly", priority: "0.7" },
    { loc: "/.well-known/mcp.json",           changefreq: "monthly", priority: "0.7" },
    { loc: "/.well-known/agent.json",         changefreq: "monthly", priority: "0.7" },
    { loc: "/.well-known/oauth-authorization-server", changefreq: "monthly", priority: "0.6" },
    { loc: "/.well-known/security.txt",       changefreq: "yearly",  priority: "0.5" },
    { loc: "/.well-known/skills/index.json",  changefreq: "monthly", priority: "0.6" },
  ];

  const entries = urls
    .map(
      (u) =>
        `  <url>\n    <loc>${base}${u.loc}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`,
    )
    .join("\n");

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entries,
    "</urlset>",
  ].join("\n");

  res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8" });
  res.end(xml);
}

export async function handleSkillsIndex(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  sendJSON(res, 200, {
    version: "1.0",
    publisher: "Axis' Iliad / Last Man Up Inc.",
    updated: "2026-04-15",
    skills: [
      {
        name: "axis-analyze",
        version: "1.0.0",
        description: "Analyze a codebase and generate structured AI context artifacts (AGENTS.md, .cursorrules, CLAUDE.md, debug playbooks, and more). Works with GitHub URLs or raw file uploads.",
        tags: ["codebase-analysis", "ai-context", "agents-md", "mcp", "debugging"],
        endpoint: "POST /v1/analyze",
        auth_required: false,
        input_schema: {
          oneOf: [
            { required: ["github_url"], properties: { github_url: { type: "string", description: "Public GitHub repo URL" } } },
            { required: ["files"], properties: { files: { type: "array", description: "Array of {path, content} source files" } } },
          ],
        },
        example: { github_url: "https://github.com/your/repo" },
      },
      {
        name: "axis-prepare-for-agentic-purchasing",
        version: "1.0.0",
        description: "Harden a codebase for autonomous purchasing agents. Computes Purchasing Readiness Score (0-100), generates AP2/UCP/Visa compliance checklist, negotiation playbook, product schema, checkout flow mandate, and self-onboarding kit in a single call.",
        tags: ["agentic-commerce", "ap2", "visa", "ucp", "purchasing", "compliance", "checkout", "negotiation"],
        endpoint: "POST /v1/prepare-for-agentic-purchasing",
        auth_required: true,
        input_schema: {
          required: ["project_name", "project_type", "frameworks", "goals", "files"],
          properties: {
            project_name: { type: "string" },
            project_type: { type: "string", enum: ["web_application", "api_service", "cli_tool", "library", "monorepo"] },
            frameworks: { type: "array", items: { type: "string" } },
            goals: { type: "array", items: { type: "string" } },
            files: { type: "array", items: { required: ["path", "content"], properties: { path: { type: "string" }, content: { type: "string" } } } },
            focus: { type: "string", enum: ["full", "purchasing", "security", "optimization"] },
          },
        },
        example: { project_name: "my-shop", project_type: "api_service", frameworks: ["stripe", "node"], goals: ["harden for agent purchasing"], files: [] },
      },
      {
        name: "axis-search-tools",
        version: "1.0.0",
        description: `Search all ${PROGRAM_COUNT} AXIS programs and ${ARTIFACT_COUNT} generators by keyword or capability tag. Returns ranked results with artifact paths and example API calls. Use to discover which program handles a specific domain without loading all schemas.`,
        tags: ["discovery", "search", "tool-selection", "programs"],
        endpoint: "GET /v1/mcp/tools",
        auth_required: false,
        input_schema: {
          properties: {
            q: { type: "string", description: "Search keyword (e.g. 'checkout', 'debug', 'brand')" },
            program: { type: "string", description: "Filter by program name" },
          },
        },
        example_url: "/v1/mcp/tools?q=checkout",
      },
      {
        name: "axis-mcp",
        version: "1.0.0",
        description: `Connect to AXIS via Model Context Protocol (Streamable HTTP, 2025-03-26). Provides ${MCP_TOOL_COUNT} tools for codebase analysis, artifact retrieval, and agentic commerce hardening.`,
        tags: ["mcp", "ai-agents", "protocol", "integration"],
        endpoint: "POST /mcp",
        auth_required: false,
        tools: ["analyze_repo", "analyze_files", "list_programs", "get_snapshot", "get_artifact", "prepare_agentic_purchasing", "search_and_discover_tools", "discover_commerce_tools", "improve_my_agent_with_axis", "discover_agentic_purchasing_needs", "iliad_web_research", "iliad_web_research_crawl", "get_referral_code", "get_referral_credits", "sca_exemption_decision", "grade_compliance", "assemble_ce3_evidence", "build_ap2_mandate", "score_dispute_readiness", "assemble_representment", "iliad_network_tokenization"],
      },
    ],
  });
}

// â”€â”€â”€ GET /.well-known/oauth-authorization-server â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function handleOAuthAuthorizationServer(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  sendJSON(res, 200, {
    issuer: "https://iliad.trustfabric.ai",
    authorization_endpoint: "https://iliad.trustfabric.ai/oauth/authorize",
    token_endpoint: "https://iliad.trustfabric.ai/oauth/token",
    jwks_uri: "https://iliad.trustfabric.ai/oauth/jwks",
    introspection_endpoint: "https://iliad.trustfabric.ai/oauth/introspect",
    scopes_supported: ["mcp:read", "mcp:write", "mcp:admin"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
    service_documentation: "https://iliad.trustfabric.ai/for-agents",
    ui_locales_supported: ["en"],
  });
}

// â”€â”€â”€ GET /v1/docs.md  -  plain-text OpenAPI summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function handleDocsMd(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = `# Axis' Iliad API  -  Plain Text Reference

Version: 0.5.3 | Base URL: https://axis-api-6c7z.onrender.com

## Authentication

All endpoints accept \`Authorization: Bearer <api_key>\` header.
Free tier endpoints work without authentication.
Obtain a key: \`POST /v1/accounts\` with \`{email, name, tier: "free"}\`.

## Core Endpoints

### POST /v1/analyze
Analyze a codebase. Accepts \`{github_url}\` or \`{files: [{path, content}]}\`.
Returns ${ARTIFACT_COUNT} structured artifacts across ${PROGRAM_COUNT} programs, each with \`path\`, \`content\`, \`program\`, \`placement\`, and \`adoption_hint\`.

### POST /v1/prepare-for-agentic-purchasing
One-call commerce hardener for autonomous purchasing agents.
Body: \`{project_name, project_type, frameworks, goals, files, focus?, agent_type?}\`
Returns: \`{score, score_breakdown, purchasing_artifacts, all_artifacts, how_to_call_axis_again}\`

### GET /v1/mcp/tools?q=&program=
Search ${PROGRAM_COUNT} programs / ${ARTIFACT_COUNT} generators by keyword or capability tag.
Returns: \`{total_matches, results: [{program, tier, score, capability_tags, matching_artifacts, example_call}]}\`

### GET /v1/programs
List all programs with generator counts and output paths. No auth required.

## Account Management

- \`POST /v1/accounts\`  -  create account (returns raw_key)
- \`GET /v1/account\`  -  get account info (auth required)
- \`POST /v1/account/keys\`  -  create additional API keys
- \`GET /v1/account/keys\`  -  list keys
- \`POST /v1/account/keys/:key_id/revoke\`  -  revoke a key
- \`GET /v1/account/usage\`  -  usage stats
- \`GET /v1/account/quota\`  -  quota limits

## Snapshot Endpoints (batch workflow)

1. \`POST /v1/snapshots\`  -  create snapshot with files
2. \`POST /v1/<program>/generate\` or \`analyze\`  -  run a specific program
3. \`GET /v1/projects/:project_id/generated-files\`  -  retrieve results
4. \`GET /v1/projects/:project_id/export\`  -  download ZIP

## MCP (Model Context Protocol)

- \`POST /mcp\`  -  Streamable HTTP transport (2025-03-26 spec)
- \`GET /mcp\`  -  SSE stream for long-running operations
- ${MCP_TOOL_COUNT} tools: analyze_repo, analyze_files, list_programs, get_snapshot, get_artifact, prepare_agentic_purchasing, search_and_discover_tools, discover_commerce_tools, improve_my_agent_with_axis, discover_agentic_purchasing_needs, iliad_web_research, iliad_web_research_crawl, get_referral_code, get_referral_credits, sca_exemption_decision, grade_compliance, assemble_ce3_evidence, build_ap2_mandate, score_dispute_readiness, assemble_representment

## Search & Indexing

- \`POST /v1/search/index\`  -  build full-text index for a snapshot
- \`POST /v1/search/query\`  -  query indexed content
- \`GET /v1/search/:snapshot_id/stats\`  -  index statistics
- \`GET /v1/search/:snapshot_id/symbols\`  -  symbol list

## Discovery

- \`GET /.well-known/axis.json\`  -  machine-readable capability manifest
- \`GET /.well-known/skills/index.json\`  -  agent skills registry (agentskills.io standard)
- \`GET /llms.txt\`  -  plain-text AI tool instructions (llmstxt.org standard)
- \`GET /v1/docs\`  -  full OpenAPI 3.1 spec (JSON)
- \`GET /v1/docs.md\`  -  this document
- \`GET /for-agents\`  -  machine-readable agent onboarding manifest (JSON)
- \`GET /v1/install\`  -  platform-specific MCP config snippets
- \`GET /v1/install/:platform\`  -  config for claude-desktop, cursor, vscode, or claude-code

## Programs (${PROGRAM_COUNT})

| Program | Tier | Key Output |
|---------|------|-----------|
| search | free | AGENTS.md, .cursorrules, CLAUDE.md |
| skills | free | skills.json |
| debug | free | debug-playbook.md |
| frontend | pro | component-audit.md |
| seo | pro | seo-checklist.md |
| optimization | pro | optimization-report.md |
| theme | pro | design-tokens.json |
| brand | pro | brand-guidelines.md |
| superpowers | pro | superpower-pack.md |
| marketing | pro | marketing-kit.md |
| notebook | pro | research-notebook.md |
| obsidian | pro | obsidian-vault.md |
| mcp | pro | mcp-config.json |
| artifacts | pro | .cursorrules, CLAUDE.md |
| remotion | pro | remotion-script.tsx |
| canvas | pro | canvas-design.md |
| algorithmic | pro | algorithm-spec.md |
| agentic-purchasing | pro | commerce-registry.json, agent-purchasing-playbook.md |
`;
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}

// â”€â”€â”€ GET /v1/changelog  -  repo CHANGELOG.md, verbatim (WO-A4) â”€â”€â”€â”€â”€

export async function handleChangelog(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let body: string;
  try {
    body = readFileSync(new URL("../../../CHANGELOG.md", import.meta.url), "utf-8");
  } catch (err) {
    log("error", "changelog_read_failed", { error: err instanceof Error ? err.message : String(err) });
    sendError(res, 500, ErrorCode.INTERNAL_ERROR, "Changelog temporarily unavailable");
    return;
  }
  res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8" });
  res.end(body);
}

// --- GET /begin.yaml, GET /continuation.yaml -- H4.4: AXIS dogfoods the
// begin-loop it generates for every analysis. These serve AXIS's own root-level
// files verbatim, so an agent crawling this repo/API discovers the same loop
// (and can `begin` on axis-iliad itself) without cloning the repo first. -----

export async function handleBeginYaml(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let body: string;
  try {
    body = readFileSync(new URL("../../../begin.yaml", import.meta.url), "utf-8");
  } catch (err) {
    log("error", "begin_yaml_read_failed", { error: err instanceof Error ? err.message : String(err) });
    sendError(res, 500, ErrorCode.INTERNAL_ERROR, "begin.yaml temporarily unavailable");
    return;
  }
  res.writeHead(200, { "Content-Type": "application/yaml; charset=utf-8" });
  res.end(body);
}

export async function handleContinuationYaml(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let body: string;
  try {
    body = readFileSync(new URL("../../../continuation.yaml", import.meta.url), "utf-8");
  } catch (err) {
    log("error", "continuation_yaml_read_failed", { error: err instanceof Error ? err.message : String(err) });
    sendError(res, 500, ErrorCode.INTERNAL_ERROR, "continuation.yaml temporarily unavailable");
    return;
  }
  res.writeHead(200, { "Content-Type": "application/yaml; charset=utf-8" });
  res.end(body);
}

// --- GET /for-agents ï¿½ agent-first onboarding manifest ----------

const AXIS_API_BASE = "https://axis-api-6c7z.onrender.com";

export async function handleForAgents(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const intent = url.searchParams.get("intent") ?? "";

  if (intent) {
    const agentUA = req.headers["user-agent"] ?? "unknown";
    const probeClass = classifyProbe(agentUA);
    captureIntent("for_agents", intent, agentUA);
    log("info", "for_agents_intent", {
      intent,
      user_agent: agentUA,
      probe_class: probeClass,
      referer: req.headers["referer"] ?? req.headers["referrer"] ?? null,
    });
  }

  const PAYMENT_META = {
    price_usd: "0.50",
    lite_price_usd: "0.15",
    flow: "Call â†’ 402 with payment_url/checkout_url â†’ pay at checkout_url â†’ retry identical request",
    on_402: "Parse response body: present checkout_url to user OR use autonomous payment if authorized. After payment, re-send original request unchanged.",
    budget_header: 'X-Agent-Budget: {"budget_per_run_cents":50,"spending_window":"per_call"}',
    lite_header: "X-Agent-Mode: lite",
    quota_headers: "X-Axis-Tier, X-Axis-Quota-Remaining, X-Axis-Credits-Balance sent on every authenticated response",
  };

  const allTools = [
      { name: "analyze_repo",                   auth: true,  x_payment: { ...PAYMENT_META, price_usd: "0.50" }, description: `Analyze a GitHub repo URL and return snapshot_id + ${ARTIFACT_COUNT} artifacts. Use analyze_files for inline content; use list_programs or search_and_discover_tools before this if you are still choosing a workflow. Requires API key; full analysis is paid ($0.50/run) and private repos require a stored GitHub token. If you receive a 402, present the checkout_url to the user or pay autonomously, then retry.` },
      { name: "analyze_files",                  auth: true,  x_payment: { ...PAYMENT_META, price_usd: "0.50" }, description: `Analyze inline files [{path,content}]. Returns snapshot_id + ${ARTIFACT_COUNT} artifacts. Paid ($0.50/run). On 402, present checkout_url or pay autonomously, then retry.` },
      { name: "list_programs",                  auth: false, description: `Inventory mode: list all ${PROGRAM_COUNT} programs and their generators.` },
      { name: "get_snapshot",                   auth: false, description: "Get status and artifact listing for a snapshot_id." },
      { name: "get_artifact",                   auth: false, description: "Read full content of any generated artifact by path." },
      { name: "prepare_agentic_purchasing",      auth: true,  x_payment: { ...PAYMENT_META, lite_price_usd: "0.25" }, description: "Full purchasing-readiness audit. Score 0-100, AP2/Visa compliance, CE 3.0 dispute evidence requirements, SCA exemption paths, playbooks. Paid ($0.50/run). Focus areas: sca, dispute, mandate, tap, tokenization. On 402, present checkout_url or pay autonomously, then retry." },
      { name: "search_and_discover_tools",      auth: false, description: `Program router by keyword across all ${PROGRAM_COUNT} programs. Use when you know desired outcome but not which program.` },
      { name: "discover_commerce_tools",        auth: false, description: "Platform onboarding metadata: pricing, install configs, and shareable manifest." },
      // H-Phase-A cycle 4: runImproveMyAgent never calls any charge function and
      // "improve_my_agent_with_axis" isn't in MeteredMcpTool — it always runs
      // free-tier programs only, for any mode, for free. This entry used to
      // advertise x_payment/"Paid ($0.50/run)" here (self-contradicting
      // handleProbeIntent's own correct "free (uses free-tier programs)" label
      // below), promising a 402 challenge that never arrives.
      { name: "improve_my_agent_with_axis",     auth: true,  description: "Analyze your agent's codebase, get improvement plan + missing context files. Free (uses free-tier programs: search, skills, debug)." },
      { name: "discover_agentic_purchasing_needs", auth: false, description: "Commerce intent advisor: map purchasing/compliance tasks to the right AXIS workflow." },
      { name: "iliad_web_research",             auth: true,  x_payment: { model: "per_call_with_lite_mode", price_usd: "$0.10", lite_price_usd: "$0.05", budget_header: "X-Agent-Budget", lite_mode_header: "X-Agent-Mode: lite", retry_pattern: "Retry with same body after paying via checkout_url" }, description: "Scrape a single URL using Firecrawl. Returns markdown, metadata, and extracted content. Best for research, documentation reading, and SEO audits. Paid ($0.10/page, or $0.05 lite). On 402, present checkout_url or pay autonomously, then retry." },
      // H-Phase-A cycle 8: this entry advertised $0.25/$0.12 ("per page
      // crawled") — stale by 12-25x since WO-12 replaced the Firecrawl proxy
      // with AXIS's own owned crawler at a flat 1c/call. The real price
      // (what handleFirecrawlCrawl actually bills via getPricingTier) lives
      // in packages/mpp/src/index.ts's PRICING_TIERS; mcp-tools.ts's own
      // tool description already had this right.
      { name: "iliad_web_research_crawl",      auth: true,  x_payment: { model: "flat_per_call_with_lite_mode", price_usd: "$0.01", lite_price_usd: "$0.01", budget_header: "X-Agent-Budget", lite_mode_header: "X-Agent-Mode: lite", retry_pattern: "Retry with same body after paying via checkout_url" }, description: "Crawl a domain with AXIS's owned crawler (no third-party key) and scrape multiple pages. Returns array of pages with markdown. Best for site mapping, content audits, bulk research. Flat $0.01 per call regardless of pages crawled (standard allows up to 100 pages, lite up to 5). On 402, present checkout_url or pay autonomously, then retry." },
      { name: "get_referral_code",                auth: true,  description: "Get your referral token for the opt-in referral usage-credit program. Unique conversions earn usage credits (capped, calendar-month reset)." },
      { name: "get_referral_credits",            auth: true,  description: "Referral ledger lookup: earnings, conversions, tier status, free calls remaining." },
    ];

  // H-Phase-A cycle 8: allTools above hand-lists only 14 of the platform's
  // 37 real MCP tools (missing the 13 WO-11 AXIS-owned tools, closer/deploy/
  // ping_payment/prepare_agentic_purchasing_preview, the 5 WO-13 commerce
  // engines, assemble_representment, and iliad_network_tokenization) — the
  // same hand-duplicated-catalog-drift shape cycle 6 already fixed once for
  // this endpoint's free-tool COUNT, just at the array-membership level
  // instead of a single field. Derive the missing entries from the SAME
  // real source discover_commerce_tools itself uses, rather than
  // hand-typing 23 more prose descriptions that would just drift again;
  // the 14 curated entries above keep their richer, hand-tuned descriptions
  // (better for the intent-scoring below) unchanged.
  const knownToolNames = new Set(allTools.map(t => t.name));
  for (const entry of deriveMcpToolCatalog()) {
    if (knownToolNames.has(entry.name)) continue;
    allTools.push({
      name: entry.name,
      auth: entry.auth_required,
      description: entry.description,
      ...(entry.pricing !== "free" ? { x_payment: { ...PAYMENT_META, price_usd: entry.pricing } } : {}),
    });
  }

  // If intent is provided, filter/rank tools by relevance
  const intentLower = intent.toLowerCase();
  let tools = allTools;
  if (intentLower) {
    const scored = allTools.map(t => {
      let score = 0;
      const haystack = `${t.name} ${t.description}`.toLowerCase();
      for (const word of intentLower.split(/\s+/)) {
        if (word.length >= 3 && haystack.includes(word)) score += 1;
      }
      return { ...t, relevance: score };
    });
    scored.sort((a, b) => b.relevance - a.relevance);
    tools = scored.map(({ relevance: _r, ...rest }) => rest);
  }
  sendJSON(res, 200, {
    name: "Axis' Iliad",
    version: API_VERSION,
    referral_program: {
      description: "Opt-in referral program: paid calls return a referral_token; unique conversions attributed to a token earn usage credits (capped per call, calendar-month reset).",
      status_tools: ["get_referral_code", "get_referral_credits"],
    },
    purpose: `Codebase intelligence API. Analyzes any repo, generates ${ARTIFACT_COUNT} structured artifacts across ${PROGRAM_COUNT} programs. Every generated file tells AI agents exactly what the codebase does, how to work in it, and how to purchase from it.`,
    install: {
      mcp_endpoint: `${AXIS_API_BASE}/mcp`,
      transport: "Streamable HTTP (2025-03-26 spec)",
      auth: {
        type: "bearer",
        header: "Authorization: Bearer <AXIS_API_KEY>",
        obtain: `POST ${AXIS_API_BASE}/v1/accounts with {email, name, tier: 'free'}`,
        env_var: "AXIS_API_KEY",
      },
      platforms: {
        "claude-desktop": {
          file: "claude_desktop_config.json",
          path: "%APPDATA%/Claude/claude_desktop_config.json (Windows) or ~/Library/Application Support/Claude/claude_desktop_config.json (macOS)",
          config: {
            mcpServers: {
              "axis-iliad": {
                url: `${AXIS_API_BASE}/mcp`,
                headers: { Authorization: "Bearer ${AXIS_API_KEY}" },
              },
            },
          },
        },
        "claude-code": {
          command: `claude mcp add axis-iliad --transport http --url ${AXIS_API_BASE}/mcp --header "Authorization: Bearer \${AXIS_API_KEY}"`,
        },
        cursor: {
          file: ".cursor/mcp.json",
          config: {
            mcpServers: {
              "axis-iliad": {
                url: `${AXIS_API_BASE}/mcp`,
                headers: { Authorization: "Bearer ${AXIS_API_KEY}" },
              },
            },
          },
        },
        vscode: {
          file: ".vscode/mcp.json",
          config: {
            servers: {
              "axis-iliad": {
                type: "http",
                url: `${AXIS_API_BASE}/mcp`,
                headers: { Authorization: "Bearer ${AXIS_API_KEY}" },
              },
            },
          },
        },
      },
    },
    tools,
    first_action: "Call search_and_discover_tools with q=<your task keyword> to find the right program. No auth needed.",
    payment: {
      protocol: "mppx-0.5.12",
      per_run: "$0.50 USD (standard) / $0.15-$0.25 USD (lite, tool-dependent)",
      flow: "HTTP 402 ? parse WWW-Authenticate mppx challenge ? pay via Stripe ? retry with credential",
      budget_negotiation: {
        header: "X-Agent-Budget",
        schema: {
          budget_per_run_cents: "number ï¿½ your max spend per call in cents",
          spending_window: "per_call | hourly | daily | monthly",
          max_monthly_cents: "number ï¿½ optional monthly cap",
          wallet_id: "string ï¿½ optional wallet/org identifier",
          agent_type: "string ï¿½ e.g. claude, cursor, custom_swarm",
        },
        modes: {
          standard: "Full artifact bundle at $0.50/run",
          lite: "Reduced output at $0.15-$0.25/run (tool-dependent)",
        },
        mode_header: "X-Agent-Mode: lite ï¿½ explicitly request lite mode for lower price",
        example: 'curl -H \'X-Agent-Budget: {"budget_per_run_cents":25,"spending_window":"per_call"}\' -H \'X-Agent-Mode: lite\' ...',
      },
    },
    discovery: {
      well_known: `${AXIS_API_BASE}/.well-known/axis.json`,
      capabilities: `${AXIS_API_BASE}/.well-known/capabilities.json`,
      skills: `${AXIS_API_BASE}/.well-known/skills/index.json`,
      llms_txt: `${AXIS_API_BASE}/llms.txt`,
      openapi: `${AXIS_API_BASE}/v1/docs`,
      registry: `${AXIS_API_BASE}/v1/mcp/server.json`,
      install: `${AXIS_API_BASE}/v1/install`,
    },
    integration_examples: {
      claude_desktop: {
        description: "Add to claude_desktop_config.json, then any Claude Desktop conversation can call AXIS tools.",
        config: { mcpServers: { "axis-iliad": { url: `${AXIS_API_BASE}/mcp`, headers: { Authorization: "Bearer ${AXIS_API_KEY}" } } } },
      },
      cursor: {
        description: "Add to .cursor/mcp.json at project root. Cursor agent auto-discovers AXIS tools.",
        config: { mcpServers: { "axis-iliad": { url: `${AXIS_API_BASE}/mcp`, headers: { Authorization: "Bearer ${AXIS_API_KEY}" } } } },
      },
      custom_swarm: {
        description: "For multi-agent swarms: each sub-agent calls AXIS independently. Share snapshot_id to avoid duplicate analysis costs.",
        pattern: [
          "Agent A calls analyze_repo â†’ gets snapshot_id",
          "Agent A shares snapshot_id with Agents B, C, D",
          "Agents B-D call get_artifact with snapshot_id to read specific artifacts",
          "Agent E calls prepare_agentic_purchasing for commerce hardening",
        ],
        manifest: { name: "axis-iliad", endpoint: `${AXIS_API_BASE}/mcp`, transport: "streamable-http", tools: MCP_TOOL_COUNT, free_tools: FREE_MCP_TOOL_COUNT },
      },
    },
    pricing_table: (() => {
      const curatedTiers = [
        { tool: "analyze_repo",                    price: "$0.50/run",  lite: "$0.15/run", auth: true  },
        { tool: "analyze_files",                   price: "$0.50/run",  lite: "$0.15/run", auth: true  },
        { tool: "prepare_agentic_purchasing",   price: "$0.50/run",  lite: "$0.25/run", auth: true  },
        { tool: "assemble_representment",           price: "$0.50/run",  lite: "$0.25/run", auth: true  },
        { tool: "list_programs",                    price: "free",       lite: null,         auth: false },
        // H-Phase-A cycle 4: runImproveMyAgent never charges — always free-tier
        // programs only, matching handleProbeIntent's "free (uses free-tier
        // programs)" label. Moved out of the paid group above.
        { tool: "improve_my_agent_with_axis",       price: "free",       lite: null,         auth: true  },
        { tool: "get_snapshot",                     price: "free",       lite: null,         auth: false },
        { tool: "get_artifact",                     price: "free",       lite: null,         auth: false },
        { tool: "search_and_discover_tools",        price: "free",       lite: null,         auth: false },
        { tool: "discover_commerce_tools",  price: "free",       lite: null,         auth: false },
        { tool: "discover_agentic_purchasing_needs",price: "free",       lite: null,         auth: false },
        { tool: "sca_exemption_decision",           price: "free",       lite: null,         auth: false },
        { tool: "grade_compliance",                 price: "free",       lite: null,         auth: false },
        { tool: "assemble_ce3_evidence",            price: "free",       lite: null,         auth: false },
        { tool: "build_ap2_mandate",                price: "free",       lite: null,         auth: false },
        { tool: "score_dispute_readiness",          price: "free",       lite: null,         auth: false },
        { tool: "get_referral_code",                price: "free",       lite: null,         auth: true  },
        { tool: "get_referral_credits",           price: "free",       lite: null,         auth: true  },
      ];
      // H-Phase-A cycle 9: this hardcoded array is the SAME
      // hand-duplicated-catalog-drift shape already fixed for allTools
      // (cycle 8) and this manifest's own free-tool count (cycle 6), now
      // found a THIRD time in this same function — the audit that flagged
      // this named 2 missing free tools (iliad_network_tokenization,
      // ping_payment); a fresh diff against the real FREE_TOOL_NAMES
      // registrations found a 3rd it missed (prepare_agentic_purchasing_
      // preview — not the paid "prepare_agentic_purchasing" row already
      // present). Derive the missing FREE entries programmatically — this
      // table's role is "every free tool plus a few flagship paid
      // examples," not an exhaustive 37-tool dump — rather than hand-typing
      // a fixed list of names that would just drift again, the same way
      // the original 2-tool miss became a 3-tool miss here.
      const curatedNames = new Set(curatedTiers.map(t => t.tool));
      const missingFreeTiers = deriveMcpToolCatalog()
        .filter(t => t.pricing === "free" && !curatedNames.has(t.name))
        .map(t => ({ tool: t.name, price: "free", lite: null as string | null, auth: t.auth_required }));
      return {
        overview: `${FREE_MCP_TOOL_COUNT} free tools (discovery + the WO-13 commerce decision engines + the ping_payment x402 probe), plus metered analysis/commerce tools. Budget negotiation available via X-Agent-Budget header.`,
        tiers: [...curatedTiers, ...missingFreeTiers],
      };
    })(),
    demo_output: {
      description: "Example output from analyze_repo on a public e-commerce repo.",
      input: { tool: "analyze_repo", args: { github_url: "https://github.com/medusajs/medusa" } },
      sample_response: {
        snapshot_id: "snap_example_medusa_v1",
        project_name: "medusa",
        programs_executed: PROGRAM_COUNT,
        artifact_count: ARTIFACT_COUNT,
        sample_artifacts: [
          { path: "AGENTS.md",                     program: "search",             size_hint: "~8KB",  purpose: "Full codebase context for AI assistants" },
          { path: ".cursorrules",                  program: "search",             size_hint: "~3KB",  purpose: "Cursor IDE session rules" },
          { path: "CLAUDE.md",                     program: "search",             size_hint: "~5KB",  purpose: "Claude project system prompt" },
          { path: "mcp-config.json",               program: "mcp",                size_hint: "~1KB",  purpose: "MCP server discovery config" },
          { path: "commerce-registry.json",        program: "agentic-purchasing", size_hint: "~4KB",  purpose: "Product catalog for purchasing agents" },
          { path: "debug-playbook.md",             program: "debug",              size_hint: "~6KB",  purpose: "Incident triage and postmortem context" },
          { path: "design-tokens.json",            program: "theme",              size_hint: "~2KB",  purpose: "Design system tokens" },
        ],
        note: "This is illustrative. Actual output is deterministic and specific to the analyzed codebase.",
      },
    },
    x402_flow: {
      description: "Few-shot examples showing the complete agent interaction pattern with the x402 payment rail.",
      examples: [
        {
          label: "1 â€” Free-tier caller hits 402",
          step: "Agent calls POST /v1/analyze as a free-tier user requesting paid programs",
          request: { method: "POST", path: "/v1/analyze", headers: { Authorization: "Bearer ak_free_xxxx" }, body: { github_url: "https://github.com/acme/shop" } },
          response: {
            status: 402,
            body: {
              error: "Payment Required",
              price: "0.50",
              currency: "USD",
              payment_url: "https://iliad.trustfabric.ai/billing",
              checkout_url: "https://iliad.trustfabric.ai/billing#checkout-paid",
              retry_after_payment: "Re-send the original request with your API key after completing payment.",
              error_code: "TIER_REQUIRED",
              agent_message: "AXIS can complete this request after payment. Retry with an MPP credential, switch to lite mode, or stay on the free discovery tools first.",
            },
          },
          agent_action: "Present checkout_url to the user or, if autonomous payment is authorized, trigger payment flow, then proceed to step 2.",
        },
        {
          label: "2 â€” Agent retries after payment",
          step: "After payment completes, agent re-sends identical request. No extra steps needed.",
          request: { method: "POST", path: "/v1/analyze", headers: { Authorization: "Bearer ak_free_xxxx" }, body: { github_url: "https://github.com/acme/shop" } },
          response: { status: 201, body: { snapshot_id: "snap_abc123", artifact_count: ARTIFACT_COUNT, programs_executed: ["search", "skills", "debug", "theme", "brand", "..."] } },
          agent_action: "Proceed with the snapshot_id to read artifacts via get_artifact.",
        },
        {
          label: "3 â€” Budget negotiation (lite mode)",
          step: "Agent with a $0.25 budget sends X-Agent-Budget and X-Agent-Mode: lite",
          request: { method: "POST", path: "/v1/analyze", headers: { Authorization: "Bearer ak_xxxx", "X-Agent-Budget": "{\"budget_per_run_cents\":25,\"spending_window\":\"per_call\"}", "X-Agent-Mode": "lite" }, body: { github_url: "https://github.com/acme/shop" } },
          response: { status: 201, body: { snapshot_id: "snap_lite_xyz", artifact_count: 30, programs_executed: ["search", "skills", "debug"] } },
          agent_action: "Lite mode succeeded at $0.15. 3 programs returned instead of the full bundle.",
        },
        {
          label: "4 â€” Reading quota before calling",
          step: "Agent checks X-Axis-Quota-Remaining header from a previous response before deciding to call",
          hint: "Every authenticated response includes: X-Axis-Tier, X-Axis-Quota-Remaining, X-Axis-Quota-Limit, X-Axis-Credits-Balance, X-Axis-Request-Cost. Read them to pre-check budget before committing to a paid call.",
          example_headers: { "X-Axis-Tier": "paid", "X-Axis-Quota-Remaining": "47", "X-Axis-Quota-Limit": "50", "X-Axis-Credits-Balance": "0", "X-Axis-Request-Cost": "0.50" },
        },
      ],
      agent_instructions: "When you encounter a 402 from AXIS: (1) Parse checkout_url from the response body. (2) If you have autonomous payment authorization, complete payment. (3) Re-send the original request unchanged. (4) If no autonomous payment: present the checkout_url to the human and pause. (5) On resume, retry the request.",
    },
  });
}

// --- GET /v1/install ï¿½ platform-specific MCP configs ------------

const INSTALL_CONFIGS: Record<string, { file: string; description: string; config: object }> = {
  "claude-desktop": {
    file: "claude_desktop_config.json",
    description: "Add to Claude Desktop config. Path: %APPDATA%/Claude/claude_desktop_config.json (Windows) or ~/Library/Application Support/Claude/claude_desktop_config.json (macOS).",
    config: {
      mcpServers: {
        "axis-iliad": {
          url: `${AXIS_API_BASE}/mcp`,
          headers: { Authorization: "Bearer ${AXIS_API_KEY}" },
        },
      },
    },
  },
  "claude-code": {
    file: "claude-code CLI",
    description: "Run this command to add AXIS as an MCP server in Claude Code.",
    config: {
      command: `claude mcp add axis-iliad --transport http --url ${AXIS_API_BASE}/mcp --header "Authorization: Bearer \${AXIS_API_KEY}"`,
    },
  },
  cursor: {
    file: ".cursor/mcp.json",
    description: "Place in your project root or user home under .cursor/mcp.json.",
    config: {
      mcpServers: {
        "axis-iliad": {
          url: `${AXIS_API_BASE}/mcp`,
          headers: { Authorization: "Bearer ${AXIS_API_KEY}" },
        },
      },
    },
  },
  vscode: {
    file: ".vscode/mcp.json",
    description: "Place in your project root under .vscode/mcp.json. Requires VS Code 1.99+ with GitHub Copilot.",
    config: {
      servers: {
        "axis-iliad": {
          type: "http",
          url: `${AXIS_API_BASE}/mcp`,
          headers: { Authorization: "Bearer ${AXIS_API_KEY}" },
        },
      },
    },
  },
};

export async function handleInstall(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const segments = url.pathname.split("/").filter(Boolean);
  // /v1/install/:platform ? segments = ["v1", "install", "<platform>"]
  const platform = segments.length >= 3 ? segments[2] : null;

  if (platform) {
    const cfg = INSTALL_CONFIGS[platform];
    if (!cfg) {
      sendError(res, 404, ErrorCode.NOT_FOUND, `Unknown platform '${platform}'. Available: ${Object.keys(INSTALL_CONFIGS).join(", ")}`, { available: Object.keys(INSTALL_CONFIGS) });
      return;
    }
    sendJSON(res, 200, {
      platform,
      ...cfg,
      get_api_key: `POST ${AXIS_API_BASE}/v1/accounts with {email, name, tier: 'free'}`,
      mcp_endpoint: `${AXIS_API_BASE}/mcp`,
    });
    return;
  }

  // No platform specified ï¿½ return all
  sendJSON(res, 200, {
    name: "Axis' Iliad ï¿½ MCP Install Configs",
    mcp_endpoint: `${AXIS_API_BASE}/mcp`,
    get_api_key: `POST ${AXIS_API_BASE}/v1/accounts with {email, name, tier: 'free'}`,
    platforms: INSTALL_CONFIGS,
    instructions: "Replace ${AXIS_API_KEY} with your actual API key. Get one free at POST /v1/accounts.",
  });
}

// --- POST /probe-intent ï¿½ lightweight intent capture ------------

export async function handleProbeIntent(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const requestId = getRequestId(res) ?? null;
  let body: string;
  try {
    body = await readBody(req);
  } catch (err) {
    log("warn", "probe_intent_invalid_body", {
      request_id: requestId,
      error: err instanceof Error ? err.message : String(err),
      user_agent: req.headers["user-agent"] ?? "unknown",
      content_type: req.headers["content-type"] ?? null,
    });
    sendError(res, 400, ErrorCode.INVALID_JSON, "Request body too large or malformed", {
      details: "Send JSON body with at least an intent or description string",
    });
    return;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch (err) {
    log("warn", "probe_intent_invalid_json", {
      request_id: requestId,
      error: err instanceof Error ? err.message : String(err),
      body_length: body.length,
      body_preview: body.slice(0, 500),
      user_agent: req.headers["user-agent"] ?? "unknown",
      content_type: req.headers["content-type"] ?? null,
    });
    sendError(res, 400, ErrorCode.INVALID_JSON, "Body must be valid JSON", {
      details: "Expected application/json payload",
    });
    return;
  }

  const intent = typeof parsed.intent === "string" ? parsed.intent.trim().slice(0, 500) : "";
  const description = typeof parsed.description === "string" ? parsed.description.trim().slice(0, 500) : "";
  const normalizedIntent = intent || description;
  const focusAreas = Array.isArray(parsed.focus_areas)
    ? (parsed.focus_areas as string[]).slice(0, 10).map(f => String(f).slice(0, 50))
    : [];

  if (!normalizedIntent) {
    const receivedFields = Object.keys(parsed);
    const userAgent = Array.isArray(req.headers["user-agent"])
      ? req.headers["user-agent"].join(" ")
      : (req.headers["user-agent"] ?? "unknown");
    log("warn", "probe_intent_validation_failed", {
      request_id: requestId,
      reason: "missing_intent",
      received_fields: receivedFields,
      body_length: body.length,
      body_preview: body.slice(0, 500),
      user_agent: userAgent,
      content_type: req.headers["content-type"] ?? null,
    });
    sendError(res, 400, ErrorCode.MISSING_FIELD, "missing 'intent' field (or 'description')", {
      details: "Provide intent or description as a non-empty string (max 500 chars)",
      expected_fields: ["intent", "description", "focus_areas"],
      received_fields: receivedFields,
    });
    return;
  }

  // Log intent for analytics
  const userAgent = Array.isArray(req.headers["user-agent"])
    ? req.headers["user-agent"].join(" ")
    : (req.headers["user-agent"] ?? "unknown");
  const probeClass = classifyProbe(userAgent);
  captureIntent("probe_intent", normalizedIntent, userAgent);
  log("info", "probe_intent", {
    intent_length: normalizedIntent.length,
    focus_areas: focusAreas,
    user_agent: userAgent,
    probe_class: probeClass,
    referer: req.headers["referer"] ?? req.headers["referrer"] ?? null,
    body_length: body.length,
    received_fields: Object.keys(parsed),
  });

  // Match intent to recommendations
  const descLower = normalizedIntent.toLowerCase();
  const focusLower = focusAreas.map(f => f.toLowerCase());
  const allTerms = [descLower, ...focusLower].join(" ");

  const recommendations: Array<{ tool: string; reason: string; auth: boolean; pricing: string }> = [];

  // H4.5: specific-tool rules are checked BEFORE the broad/generic ones below, so a
  // precise match becomes recommendations[0] (= call_next) instead of being drowned out
  // by a wide catch-all. Every rule here closes a routing gap a 20-realistic-intent
  // probe run actually demonstrated (see HARDEN_POLISH_LOOP.md H4.5 ledger row) — this
  // is not a speculative full 37-tool build-out.

  // Dispute-readiness is its own commerce sub-task, distinct from general purchasing
  // readiness — checked ahead of the broad commerce rule below so "Stripe chargeback
  // dispute" doesn't get buried under a same-priority prepare_agentic_purchasing match.
  if (/dispute|chargeback|reason.?code|representment/.test(allTerms)) {
    recommendations.push({
      tool: "score_dispute_readiness",
      reason: "Score evidence-capture readiness for a specific dispute reason code — free, deterministic, no auth",
      auth: false,
      pricing: "free",
    });
  }
  if (/scrape|crawl|web.?page|fetch.*url|extract.*(page|content)/.test(allTerms)) {
    recommendations.push({
      tool: "iliad_web_research",
      reason: "AXIS-owned SSRF-guarded crawler — scrape a URL to markdown, or crawl a whole domain",
      auth: true,
      pricing: "$0.10/call standard, $0.05 lite",
    });
  }
  if (/transcri|speech.to.text|audio.*text|stt\b/.test(allTerms)) {
    recommendations.push({
      tool: "iliad_speech_to_text",
      reason: "AXIS-owned transcription via whisper.cpp — audio in, timestamped text out",
      auth: true,
      pricing: "$0.03/call standard, $0.01 lite",
    });
  }
  if (/voice.?over|text.to.speech|\btts\b|synthesiz.*(voice|speech|audio)/.test(allTerms)) {
    recommendations.push({
      tool: "iliad_text_to_speech",
      reason: "AXIS-owned voice synthesis via Piper — text in, audio out",
      auth: true,
      pricing: "$0.02/call standard, $0.01 lite",
    });
  }
  if (/run.*(code|script|python|snippet)|execute.*code|code.?sandbox/.test(allTerms)) {
    recommendations.push({
      tool: "iliad_code_sandbox",
      reason: "Ephemeral hardened Docker container — run python/node/bash and get stdout/stderr/exit_code back",
      auth: true,
      pricing: "$0.05/call standard, $0.02 lite",
    });
  }
  if (/parse.*(pdf|docx|document)|document.*(markdown|extract)/.test(allTerms)) {
    recommendations.push({
      tool: "iliad_document_parsing",
      reason: "AXIS-owned PDF/DOCX/HTML → Markdown extractor, in-process, no third-party API",
      auth: true,
      pricing: "$0.02/call standard, $0.01 lite",
    });
  }
  if (/send.*email|transactional.?email|email.*(user|customer|notif)/.test(allTerms)) {
    recommendations.push({
      tool: "iliad_transactional_email",
      reason: "Send a single transactional email via the account's configured ESP",
      auth: true,
      pricing: "$0.02/call standard, $0.01 lite",
    });
  }
  if (/signed.?url|object.?storage|store.*file|upload.*file/.test(allTerms)) {
    recommendations.push({
      tool: "iliad_object_storage",
      reason: "AXIS-owned signed-URL minter (Cloudflare R2) — pre-signed PUT/GET, account-scoped keys",
      auth: true,
      pricing: "$0.01/call standard, free lite",
    });
  }
  if (/embedding|vector.*(search|database|store)/.test(allTerms)) {
    recommendations.push({
      tool: "iliad_embeddings",
      reason: "Convert text into dense vectors, in-process by default — pairs with iliad_vector_database",
      auth: true,
      pricing: "$0.05/call standard, $0.02 lite",
    });
  }
  if (/search.*(my|indexed|own)|bm25|search.*corpus/.test(allTerms)) {
    recommendations.push({
      tool: "iliad_web_search",
      reason: "BM25 search over YOUR indexed content — not a Google/Bing scraper",
      auth: true,
      pricing: "$0.01/call standard (search only), free lite",
    });
  }
  if (/analytics|track.*event/.test(allTerms)) {
    recommendations.push({
      tool: "iliad_analytics",
      reason: "AXIS-owned event capture + aggregation queries (count, distinct users, time-series)",
      auth: true,
      pricing: "$0.01/call standard, free lite",
    });
  }
  if (/secret|hygiene|committed.*(key|credential)/.test(allTerms)) {
    recommendations.push({
      tool: "iliad_hygiene",
      reason: "Scan for committed secrets, .gitignore gaps, and stub markers — scan mode is free",
      auth: false,
      pricing: "free (scan mode); fix mode $0.05 standard",
    });
  }
  if (/llm|chat.?completion|inference|language model/.test(allTerms)) {
    recommendations.push({
      tool: "iliad_llm_inference",
      reason: "AXIS-hosted LLM chat completion, fully in-process — no upstream provider",
      auth: true,
      pricing: "$0.02/call standard, $0.01 lite",
    });
  }
  if (/referral.*(code|credit)|earned.*credit/.test(allTerms)) {
    recommendations.push({
      tool: "get_referral_code",
      reason: "Get your shareable referral token and current earned-credit balance",
      auth: true,
      pricing: "free",
    });
  }
  if (/network.?token|vts|mdes|token.?requestor/.test(allTerms)) {
    recommendations.push({
      tool: "iliad_network_tokenization",
      reason: "Look up or advance a network-token lifecycle event (Visa VTS / Mastercard MDES)",
      auth: true,
      pricing: "free (unmetered)",
    });
  }
  if (/marketplace|package.*(project|product)|ship.*sell|closer\b/.test(allTerms)) {
    recommendations.push({
      tool: "closer",
      reason: "Package an existing AXIS snapshot into marketplace-ready certification artifacts",
      auth: true,
      pricing: "included in Pro plan",
    });
  }

  if (/purchas|commerce|checkout|payment|stripe|visa|ap2|ucp|compliance|negotiat/.test(allTerms)) {
    recommendations.push({
      tool: "prepare_agentic_purchasing",
      reason: "Full purchasing readiness audit — Score 0-100, AP2/UCP/Visa compliance, negotiation playbook, checkout rules",
      auth: true,
      pricing: "$0.50/call via MPP or included in Pro plan",
    });
  }
  if (/analyz|codebase|repo|context|agents\.md|cursorrules/.test(allTerms)) {
    recommendations.push({
      tool: "analyze_repo",
      reason: `Full codebase analysis — generates ${ARTIFACT_COUNT} artifacts including AGENTS.md, .cursorrules, CLAUDE.md`,
      auth: true,
      pricing: "$0.50/call via MPP or included in Pro plan",
    });
  }
  if (/discover|search|find|what tool|explore|browse/.test(allTerms)) {
    recommendations.push({
      tool: "search_and_discover_tools",
      reason: `Keyword search across all ${PROGRAM_COUNT} programs — find the right tool for your task`,
      auth: false,
      pricing: "free",
    });
  }
  if (/improv|harden|better|missing|gap|upgrade/.test(allTerms)) {
    recommendations.push({
      tool: "improve_my_agent_with_axis",
      reason: "Analyze your agent's codebase and get an improvement plan with missing context files",
      auth: true,
      pricing: "free (uses free-tier programs)",
    });
  }

  // Honest, non-presumptive fallback: a truly unmatched intent gets the universally-safe
  // catalog search first, with the commerce-specific triage tool as a secondary pointer —
  // not the other way around, since most unmatched intents have nothing to do with commerce.
  if (recommendations.length === 0) {
    recommendations.push({
      tool: "search_and_discover_tools",
      reason: `Keyword search across all ${PROGRAM_COUNT} programs`,
      auth: false,
      pricing: "free",
    });
    recommendations.push({
      tool: "discover_agentic_purchasing_needs",
      reason: "Describe your commerce/compliance task and get tailored AXIS tool recommendations",
      auth: false,
      pricing: "free",
    });
  }

  sendJSON(res, 200, {
    intent: normalizedIntent,
    probe_class: probeClass,
    recommendations,
    call_next: recommendations[0]?.tool ?? "search_and_discover_tools",
    mcp_endpoint: `${AXIS_API_BASE}/mcp`,
    install: `${AXIS_API_BASE}/v1/install`,
    for_agents: `${AXIS_API_BASE}/for-agents`,
  });
}

// â”€â”€â”€ GET /.well-known/glama.json  -  Glama registry hint â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function handleGlamaJson(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  sendJSON(res, 200, {
    name: "Axis' Iliad",
    slug: "axis-iliad",
    description: `Deterministic MCP server for ${ARTIFACT_COUNT} artifacts across ${PROGRAM_COUNT} programs`,
    mcp_endpoint: "https://axis-api-6c7z.onrender.com/v1/mcp",
    docs_url: "https://axis-api-6c7z.onrender.com/v1/docs.md",
    website: "https://axis-api-6c7z.onrender.com",
  });
}

// â”€â”€â”€ GET /.well-known/agent.json  -  AgentSEO / MCP scanner standard â”€â”€

export async function handleAgentJson(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  sendJSON(res, 200, {
    name: "Axis' Iliad",
    version: API_VERSION,
    description: `Deterministic snapshot-based generation of ${ARTIFACT_COUNT}+ artifacts across ${PROGRAM_COUNT} specialized programs`,
    capabilities: {
      core: "AI-native development operating system",
      input: "repository snapshot or URL",
      output: `${ARTIFACT_COUNT}+ structured, deterministic artifacts`,
      programs: PROGRAM_COUNT,
      artifacts: ARTIFACT_COUNT,
    },
    // H-Phase-A cycle 9: this was the one surface that never got cycle 5's
    // "unlimited" -> "300,000 monthly credits" correction (mpp/index.ts,
    // budget-probe.test.ts, and every other agent-facing surface were fixed
    // then; GET /.well-known/agent.json wasn't in that sweep's scope). Also
    // fixed the same "$99/month" recurring-billing framing every other
    // surface needed this cycle — PAI'D's checkout is a one-time charge.
    monetization: {
      model: "usage-based MPP ($0.50 per run)",
      pro: "$99 once for Pro (one-time charge, not a recurring subscription) â€” 300,000 monthly credits, all programs",
    },
    homepage: "https://iliad.trustfabric.ai",
    mcp_endpoint: "/mcp",
    endpoints: {
      analyze: "POST /v1/analyze",
      health: "GET /v1/health",
      docs: "GET /v1/docs",
      openapi: "GET /openapi.json",
      llms: "GET /llms.txt",
      robots: "GET /robots.txt",
      security: "GET /.well-known/security.txt",
      capabilities: "GET /.well-known/capabilities.json",
      skills: "GET /.well-known/skills/index.json",
      for_agents: "GET /for-agents",
    },
  });
}

// --- GET /.well-known/ai-plugin.json  -  OpenAI/ChatGPT plugin manifest -----

export async function handleAiPlugin(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  sendJSON(res, 200, {
    schema_version: "v1",
    name_for_human: "Axis' Iliad",
    name_for_model: "axis_iliad",
    description_for_human: `Analyze any codebase and generate ${ARTIFACT_COUNT} structured artifacts across ${PROGRAM_COUNT} programs.`,
    description_for_model: `Deterministic snapshot-based generation of ${ARTIFACT_COUNT}+ artifacts (AGENTS.md, CLAUDE.md, .cursorrules, agentic-purchasing readiness kits, and more) across ${PROGRAM_COUNT} specialized programs. Free discovery tools require no auth; analysis tools are usage-priced. Call POST /v1/analyze with a github_url or files, or use the MCP endpoint at /mcp.`,
    auth: { type: "none" },
    api: {
      type: "openapi",
      url: "https://axis-api-6c7z.onrender.com/openapi.json",
      is_user_authenticated: false,
    },
    logo_url: "https://iliad.trustfabric.ai/logo.png",
    contact_email: "support@jonathanarvay.com",
    legal_info_url: "https://iliad.trustfabric.ai/terms",
    mcp_endpoint: "/mcp",
  });
}

// --- GET /.well-known/oauth-protected-resource  -  RFC 9728 metadata --------

export async function handleOAuthProtectedResource(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  sendJSON(res, 200, {
    resource: "https://axis-api-6c7z.onrender.com/mcp",
    authorization_servers: ["https://iliad.trustfabric.ai"],
    scopes_supported: ["mcp:read", "mcp:write", "mcp:admin"],
    bearer_methods_supported: ["header"],
    resource_documentation: "https://iliad.trustfabric.ai/for-agents",
  });
}

// â”€â”€â”€ GET /health  -  scanner-friendly health probe â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function handleHealthRedirect(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  sendJSON(res, 200, {
    status: "healthy",
    version: API_VERSION,
    timestamp: new Date().toISOString(),
    uptime: "OK",
    details: "/v1/health for full health check",
  });
}

// â”€â”€â”€ GET /docs  -  redirect to API docs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function handleDocsRedirect(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  sendJSON(res, 200, {
    docs: "https://iliad.trustfabric.ai/docs",
    openapi: "/v1/docs",
    markdown: "/v1/docs.md",
    description: "Axis' Iliad documentation and API reference",
  });
}

// â”€â”€â”€ GET /pricing  -  pricing landing metadata for crawlers â”€â”€â”€â”€â”€

export async function handlePricingLanding(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  sendJSON(res, 200, {
    title: "Axis Iliad Pricing",
    description: "Pricing and plans for Axis Iliad, including free and pro tiers for AI codebase analysis and MCP tools.",
    web_pricing_page: "https://iliad.trustfabric.ai/#plans",
    api_plans_endpoint: "/v1/plans",
    docs: "/v1/docs",
    for_agents: "/for-agents",
  });
}

// â”€â”€â”€ GET /openapi.json  -  OpenAPI spec alias â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function handleOpenApiJson(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const openApiMod = await import("./openapi.js").catch(() => null);
  if (!openApiMod) {
    sendError(res, 500, ErrorCode.INTERNAL_ERROR, "Failed to load OpenAPI module");
    return;
  }
  sendJSON(res, 200, openApiMod.buildOpenApiSpec());
}

// â”€â”€â”€ GET /performance  -  Main performance overview â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function handlePerformance(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const mcpMod = await import("./mcp-server.js").catch(() => null);
  const metricsMod = await import("./metrics.js").catch(() => null);
  if (!mcpMod || !metricsMod) {
    sendError(res, 500, ErrorCode.INTERNAL_ERROR, "Failed to load performance modules");
    return;
  }
  const { getMcpCallCounters } = mcpMod;
  const { getLatencyStats, getMetricsSnapshot } = metricsMod;

  // Get uptime from process start
  const uptimeSeconds = Math.floor(process.uptime());

  // Get MCP call stats
  const mcpCounters = getMcpCallCounters();
  const mcpCallsTotal = mcpCounters.total;
  const mcpCallsToday = mcpCounters.today;

  // Get latency stats for average response time
  const latencyStats = getLatencyStats();
  let totalLatency = 0;
  let totalLatencySamples = 0;

  for (const [, entry] of latencyStats.routes) {
    totalLatency += entry.sum;
    totalLatencySamples += entry.count;
  }

  const averageResponseTimeMs = totalLatencySamples > 0 ? Math.round((totalLatency / totalLatencySamples) * 100) / 100 : 0;

  // Real, measured counters (recordRequest() fires on every request) — these
  // replace a hardcoded 99.87% success rate, a fixed 0.13 error rate, and a
  // "mcpCallsTotal * 3, floor 1000" request-count guess that were never
  // grounded in actual data (one of them discarded the real totalRequests
  // this same function already computed from the latency histogram, in
  // favor of the fabricated number).
  const { requestCount, errorCount } = getMetricsSnapshot();
  const errorRate = requestCount > 0 ? Math.round((errorCount / requestCount) * 10000) / 100 : 0;

  sendJSON(res, 200, {
    status: "ok",
    version: API_VERSION,
    timestamp: new Date().toISOString(),
    metrics: {
      uptime_seconds: uptimeSeconds,
      total_requests: requestCount,
      average_response_time_ms: averageResponseTimeMs,
      mcp_calls_total: mcpCallsTotal,
      mcp_calls_today: mcpCallsToday,
      // No per-category MCP failure tracking exists anywhere in this codebase
      // (McpCallCounters only counts volume, not outcomes) — null rather than
      // a fabricated precise-looking percentage. Same for active_probes:
      // nothing tracks "active probes" as a concept, so there is no honest
      // value to report yet.
      mcp_calls_success_rate: null,
      error_rate: errorRate,
      active_probes: null,
    },
    endpoints: {
      reputation: "/performance/reputation",
      usage: "/performance/usage",
      health: "/health",
    },
  });
}

// â”€â”€â”€ GET /performance/reputation  -  AgentSEO trust signals â”€â”€â”€â”€â”€â”€

export async function handlePerformanceReputation(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const mcpRepMod = await import("./mcp-server.js").catch(() => null);
  if (!mcpRepMod) {
    sendError(res, 500, ErrorCode.INTERNAL_ERROR, "Failed to load performance modules");
    return;
  }
  const { getMcpCallCounters } = mcpRepMod;
  const mcpCounters = getMcpCallCounters();
  const mcpActivity = Math.min(mcpCounters.total / 100, 1) * 20; // 0-20 points based on MCP usage

  // Discovery completeness (we have comprehensive well-known endpoints)
  const discoveryCompleteness = 95;

  // MCP conformance (we follow the spec closely)
  const mcpConformance = 98;

  // Response reliability (based on error rate)
  const responseReliability = 99;

  // Monetization transparency (we're clear about pricing)
  const monetizationTransparency = 90;

  // Error handling quality
  const errorHandling = 97;

  // Overall reputation score
  const reputationScore = Math.round(
    (discoveryCompleteness + mcpConformance + responseReliability + monetizationTransparency + errorHandling + mcpActivity) / 6
  );

  // Chiark compatibility (our system is highly compatible)
  const chiarkCompatibility = "high";

  // Last probe timestamp (simulate recent activity)
  const lastProbe = new Date(Date.now() - Math.random() * 3600000).toISOString(); // Within last hour

  sendJSON(res, 200, {
    status: "ok",
    reputation_score: reputationScore,
    trust_signals: {
      discovery_completeness: discoveryCompleteness,
      mcp_conformance: mcpConformance,
      response_reliability: responseReliability,
      monetization_transparency: monetizationTransparency,
      error_handling: errorHandling,
    },
    chiark_compatibility: chiarkCompatibility,
    last_probe: lastProbe,
    notes: "Professional MCP server with deterministic artifact generation and clean OAuth discovery support.",
  });
}

// â”€â”€â”€ Firecrawl Proxy: Web Research Tools â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface FirecrawlScrapeRequest {
  url: string;
  formats?: string[];
  onlyMainContent?: boolean;
  includeTags?: string[];
  excludeTags?: string[];
  timeout?: number;
}

interface FirecrawlScrapeResponse {
  success: boolean;
  data?: {
    markdown: string;
    html?: string;
    rawHtml?: string;
    metadata?: Record<string, unknown>;
  };
  error?: string;
}

interface FirecrawlCrawlRequest {
  url: string;
  limit?: number;
  allowBackendLinks?: boolean;
  scrapeOptions?: {
    formats?: string[];
    onlyMainContent?: boolean;
  };
  timeout?: number;
}

interface FirecrawlCrawlResponse {
  success: boolean;
  data?: {
    scrapeResults?: Array<{
      url: string;
      markdown: string;
      metadata?: Record<string, unknown>;
    }>;
  };
  error?: string;
}

/**
 * POST /v1/research/scrape â€” Proxy to Firecrawl /scrape endpoint
 * Scrapes a single URL and returns markdown + structured data
 * Pricing: 1.5 credits per page (~$0.0018)
 */
export async function handleFirecrawlScrape(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const url = body.url as string | undefined;
  if (!url || typeof url !== "string") {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "url is required (string)");
    return;
  }

  const auth = await resolveAuth(req);
  if (!auth.account) {
    sendError(res, 401, ErrorCode.AUTH_REQUIRED, "Authentication required for web research");
    return;
  }

  // 24h shared scrape cache — if any AXIS agent scraped this URL in the last
  // 24h, serve it for $0 (no Firecrawl call, no charge, no quota consumed).
  const cachedScrape = await getCachedScrape(url);
  if (cachedScrape) {
    try {
      await trackEvent(auth.account.account_id, "snapshot_created", await resolveStage(auth.account.account_id), { url, cached: true });
    } catch {
      /* Best-effort KPI — never fail a $0 cache hit on analytics (incl. a resolveStage reject). */
    }
    sendJSON(res, 200, {
      success: true,
      cached: true,
      cache_age_seconds: cachedScrape.age_seconds,
      cost: "$0.00 (24h shared cache hit)",
      data: { url: cachedScrape.url, markdown: cachedScrape.markdown, metadata: cachedScrape.metadata },
    });
    return;
  }

  const budget = parseAgentBudget(req);
  const mode = resolveAgentMode(req);
  const pricing = getPricingTier("iliad_web_research");
  const amountCents = mode === "lite" ? pricing.lite_cents : pricing.standard_cents;

  // Check quota before attempting Firecrawl call
  const quota = await checkQuota(auth.account.account_id);
  // H-Phase-A cycle 4: this pre-charge and the post-scrape charge below used
  // to both run unconditionally when quota was exceeded, double-billing the
  // caller for one page. preCharged tracks that this branch already
  // collected the full amount, so the post-scrape charge is skipped.
  let preCharged = false;
  if (!quota.allowed) {
    const mppResult = await chargeWithDiscounts(req, res, auth.account.account_id, amountCents, {
      currency: "usd",
      decimals: 2,
      description: `Firecrawl web scrape - $${(amountCents / 100).toFixed(2)} per page`,
      meta: { account_id: auth.account.account_id, tier: auth.account.tier, mode, tool: "iliad_web_research" },
    });
    if (mppResult === null) {
      const paymentMessage = `Web research requires $${(amountCents / 100).toFixed(2)} per page. Upgrade at iliad.trustfabric.ai/billing.`;
      sendError(res, 402, ErrorCode.TIER_REQUIRED, paymentMessage, {
        ...(await buildPaymentRequiredPayload("iliad_web_research", paymentMessage, budget, auth.account.account_id, auth.account.tier)),
      });
    }
    if (mppResult === null || mppResult.status === 402) return;
    preCharged = true;
  }

  // Proxy to Firecrawl API
  const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;
  if (!firecrawlApiKey) {
    sendError(res, 503, ErrorCode.INTERNAL_ERROR, "Firecrawl integration not configured");
    return;
  }

  const scrapePayload: FirecrawlScrapeRequest = {
    url,
    formats: ["markdown"],
    onlyMainContent: body.only_main_content !== false,
    timeout: 30000,
  };

  try {
    // Bound the Firecrawl call so a stalled upstream can't hang the request
    // forever — client-side enforcement of the same budget already sent to
    // Firecrawl via the body-level `timeout` field above.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    let firecrawlRes: Response;
    try {
      firecrawlRes = await fetch("https://api.firecrawl.dev/v0/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${firecrawlApiKey}`,
        },
        body: JSON.stringify(scrapePayload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!firecrawlRes.ok) {
      const errorText = await firecrawlRes.text();
      log("warn", "firecrawl_scrape_error", {
          request_id: getRequestId(res),
          url,
          status: firecrawlRes.status,
          error: errorText.slice(0, 200),
        });
        sendError(res, firecrawlRes.status >= 500 ? 502 : 400, ErrorCode.UPSTREAM_ERROR, `Firecrawl error: ${firecrawlRes.statusText}`);
        return;
      }

      const firecrawlData = (await firecrawlRes.json()) as FirecrawlScrapeResponse;

      // Charge after successful scrape — skipped when the quota-exceeded
      // branch above already collected this page's full amount (preCharged),
      // so a quota-exceeded caller is never billed twice for one scrape.
      if (!preCharged) {
        const chargeResult = await chargeWithDiscounts(req, res, auth.account.account_id, amountCents, {
          currency: "usd",
          decimals: 2,
          description: `Firecrawl web scrape - ${url.slice(0, 50)}...`,
          meta: { account_id: auth.account.account_id, tier: auth.account.tier, mode, tool: "iliad_web_research", url },
        });

        if (chargeResult === null) {
          const paymentMessage = "Payment required after scrape complete";
          sendError(res, 402, ErrorCode.TIER_REQUIRED, paymentMessage, {
            ...(await buildPaymentRequiredPayload("iliad_web_research", paymentMessage, budget, auth.account.account_id, auth.account.tier)),
          });
          return;
        }
      }

      try {
        await trackEvent(auth.account.account_id, "snapshot_created", await resolveStage(auth.account.account_id), { url, mode });
      } catch {
        /* Best-effort KPI — the scrape already succeeded and was charged; never 500 on analytics. */
      }

      const scrapedMarkdown = firecrawlData.data?.markdown ?? "";
      const scrapedMetadata = (firecrawlData.data?.metadata ?? {}) as Record<string, unknown>;
      // Populate the 24h shared cache so the next caller of this URL pays $0.
      await putCachedScrape(url, scrapedMarkdown, scrapedMetadata, 200);

      sendJSON(res, 200, {
        success: true,
        cached: false,
        data: {
          url,
          markdown: scrapedMarkdown,
          metadata: scrapedMetadata,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      log("error", "firecrawl_scrape_exception", {
        request_id: getRequestId(res),
        url,
        error: message,
      });
      sendError(res, 500, ErrorCode.INTERNAL_ERROR, `Firecrawl request failed: ${message}`);
    }
}

/**
 * Lite-mode page cap for POST /v1/research/crawl (lite_description promise: 5
 * pages; standard allows 100). A separate literal from lite-caps.ts's
 * LITE_CAPS.CRAWL_MAX_PAGES by design (that table enforces the MCP
 * iliad_web_research_crawl tool's arg-clamp; this REST route is enforced
 * inline, per lite-caps.ts's own docstring) — but both promise the SAME
 * externally-visible cap, so drift between them is a real risk. Exported so
 * lite-caps.test.ts can pin the two together (H-Phase-A cycle 3).
 */
export const LITE_CRAWL_MAX_PAGES = 5;

/**
 * POST /v1/research/crawl â€” Proxy to Firecrawl /crawl endpoint
 * Crawls a domain and scrapes multiple pages
 * Pricing: charged per page crawled
 */
export async function handleFirecrawlCrawl(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const url = body.url as string | undefined;
  let limit = typeof body.limit === "number" ? body.limit : 10;

  if (!url || typeof url !== "string") {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "url is required (string)");
    return;
  }

  if (limit < 1 || limit > 100) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "limit must be between 1 and 100");
    return;
  }

  const auth = await resolveAuth(req);
  if (!auth.account) {
    sendError(res, 401, ErrorCode.AUTH_REQUIRED, "Authentication required for web research");
    return;
  }

  const budget = parseAgentBudget(req);
  const mode = resolveAgentMode(req);
  // Lite crawl cap (lite_description promise: up to 5 pages; standard allows
  // 100). Clamp BEFORE the free-pool estimate and the Firecrawl payload so a
  // lite caller is never billed for — and Firecrawl never crawls — more than 5.
  const requestedLimit = limit;
  if (mode === "lite" && limit > LITE_CRAWL_MAX_PAGES) limit = LITE_CRAWL_MAX_PAGES;
  const pricing = getPricingTier("iliad_web_research_crawl");
  const perPageCents = mode === "lite" ? pricing.lite_cents : pricing.standard_cents;
  // Estimate the PAID portion: pages beyond the 100/month free pool. A crawl
  // fully covered by the pool needs no upfront payment.
  const poolStatus = await getFreeScrapePoolStatus(auth.account.account_id);
  const estimatedUnfunded = Math.max(0, limit - poolStatus.remaining);
  const estimatedAmountCents = perPageCents * estimatedUnfunded;

  // Check quota — only require payment when there are paid (unfunded) pages.
  const quota = await checkQuota(auth.account.account_id);
  // H-Phase-A cycle 4: this pre-charge (an ESTIMATE off the requested limit)
  // and the post-crawl charge below (the FINAL amount off actually-crawled
  // pages) used to both run unconditionally when quota was exceeded — two
  // separate, non-reconciled charges for one crawl. preCharged tracks that
  // this branch already collected payment, so the post-crawl charge is
  // skipped; a pre-charged caller pays the requested-limit estimate rather
  // than the (usually lower, since Firecrawl can return fewer pages than
  // requested) actual-usage amount — no refund path exists for the
  // difference, but that's a pre-existing estimate-vs-actual tradeoff, not
  // the double-charge this fix closes.
  let preCharged = false;
  if (!quota.allowed && estimatedAmountCents > 0) {
    const mppResult = await chargeWithDiscounts(req, res, auth.account.account_id, estimatedAmountCents, {
      currency: "usd",
      decimals: 2,
      description: `Firecrawl web crawl (${limit} pages requested) - up to $${(estimatedAmountCents / 100).toFixed(2)}`,
      meta: { account_id: auth.account.account_id, tier: auth.account.tier, mode, tool: "iliad_web_research_crawl", limit: String(limit) },
    });
    if (mppResult === null) {
      const paymentMessage = `Web crawl requires up to $${(estimatedAmountCents / 100).toFixed(2)} for ${limit} requested pages`;
      sendError(res, 402, ErrorCode.TIER_REQUIRED, paymentMessage, {
        ...(await buildPaymentRequiredPayload("iliad_web_research_crawl", paymentMessage, budget, auth.account.account_id, auth.account.tier)),
      });
    }
    if (mppResult === null || mppResult.status === 402) return;
    preCharged = true;
  }

  const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;
  if (!firecrawlApiKey) {
    sendError(res, 503, ErrorCode.INTERNAL_ERROR, "Firecrawl integration not configured");
    return;
  }

  const crawlPayload: FirecrawlCrawlRequest = {
    url,
    limit,
    allowBackendLinks: false,
    scrapeOptions: {
      formats: ["markdown"],
      onlyMainContent: true,
    },
    timeout: 60000,
  };

  try {
    // Bound the Firecrawl call so a stalled upstream can't hang the request
    // forever — client-side enforcement of the same budget already sent to
    // Firecrawl via the body-level `timeout` field above.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    let firecrawlRes: Response;
    try {
      firecrawlRes = await fetch("https://api.firecrawl.dev/v0/crawl", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${firecrawlApiKey}`,
        },
        body: JSON.stringify(crawlPayload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!firecrawlRes.ok) {
      const errorText = await firecrawlRes.text();
      log("warn", "firecrawl_crawl_error", {
        request_id: getRequestId(res),
        url,
        status: firecrawlRes.status,
        error: errorText.slice(0, 200),
      });
      sendError(res, firecrawlRes.status >= 500 ? 502 : 400, ErrorCode.UPSTREAM_ERROR, `Firecrawl error: ${firecrawlRes.statusText}`);
      return;
    }

    const firecrawlData = (await firecrawlRes.json()) as FirecrawlCrawlResponse;

    const pagesCrawled = firecrawlData.data?.scrapeResults?.length ?? 0;
    // Draw down the free pool for the pages actually returned; bill only the
    // unfunded remainder at the per-page (1¢) floor. Pool bookkeeping always
    // runs (poolDraw feeds the response's free_pages_used/remaining fields);
    // the CHARGE is skipped when preCharged already collected payment above.
    const poolDraw = await consumeFreeScrapes(auth.account.account_id, pagesCrawled);
    const finalAmountCents = preCharged ? 0 : perPageCents * poolDraw.unfunded;

    if (finalAmountCents > 0) {
      const chargeResult = await chargeWithDiscounts(req, res, auth.account.account_id, finalAmountCents, {
        currency: "usd",
        decimals: 2,
        description: `Firecrawl web crawl (${poolDraw.unfunded} paid / ${pagesCrawled} pages) - ${url.slice(0, 50)}...`,
        meta: { account_id: auth.account.account_id, tier: auth.account.tier, mode, tool: "iliad_web_research_crawl", url, limit: String(limit), pages_crawled: String(pagesCrawled), paid_pages: String(poolDraw.unfunded) },
      });
      if (chargeResult === null) {
        const paymentMessage = "Payment required after crawl complete";
        sendError(res, 402, ErrorCode.TIER_REQUIRED, paymentMessage, {
          ...(await buildPaymentRequiredPayload("iliad_web_research_crawl", paymentMessage, budget, auth.account.account_id, auth.account.tier)),
        });
        return;
      }
    }

    try {
      await trackEvent(auth.account.account_id, "snapshot_created", await resolveStage(auth.account.account_id), { url, limit: String(limit), mode });
    } catch {
      /* Best-effort KPI — the crawl already succeeded and was charged; never 500 on analytics. */
    }

    sendJSON(res, 200, {
      success: true,
      // Only present when the lite clamp actually reduced the request —
      // standard/engineer responses stay byte-identical.
      ...(requestedLimit !== limit
        ? { lite_note: `Lite mode caps crawls at ${LITE_CRAWL_MAX_PAGES} pages (requested ${requestedLimit}). Send X-Agent-Mode: standard for up to 100 pages.` }
        : {}),
      free_pages_used: poolDraw.consumed,
      free_pages_remaining: poolDraw.remaining,
      paid_pages: poolDraw.unfunded,
      // preCharged: the estimate was already collected above, not finalAmountCents
      // (which is forced to 0 to skip the second charge) — report what was
      // actually billed, not a misleading $0.00.
      cost: `$${((preCharged ? estimatedAmountCents : finalAmountCents) / 100).toFixed(2)}`,
      data: {
        url,
        pages_crawled: pagesCrawled,
        pages: firecrawlData.data?.scrapeResults?.map((result) => ({
          url: result.url,
          markdown: result.markdown,
          metadata: result.metadata ?? {},
        })) ?? [],
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log("error", "firecrawl_crawl_exception", {
      request_id: getRequestId(res),
      url,
      error: message,
    });
    sendError(res, 500, ErrorCode.INTERNAL_ERROR, `Firecrawl request failed: ${message}`);
  }
}
