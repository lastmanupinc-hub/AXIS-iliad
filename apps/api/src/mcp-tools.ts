// MCP tool catalog — the canonical tools/list definitions + their JSON schemas.
// Extracted from mcp-server.ts (the 1,400-line literal dominated the god-file). Pure
// data + the toolAnnotations helper; depends only on the artifact/program counts.

import { ARTIFACT_COUNT, PROGRAM_COUNT } from "./counts.js";

// A planned-but-unshipped capability: advertised in tools/list with a structured
// `_planned: true` envelope until its AXIS-owned implementation lands. The array is
// currently empty (every advertised tool is real) but the typed machinery is kept — the
// dispatcher (mcp-server.ts) and the MCP_TOOLS spread below both derive from it.
export interface PlannedCapability {
  /** Tool name as registered in MCP_TOOLS. */
  name: string;
  /** Short title used in MCP annotations. */
  title: string;
  /** One-line capability summary (top of description). */
  summary: string;
  /** Status — drives the response envelope. */
  status: "planned_proxy" | "planned_owned";
  /** Concrete inputSchema properties. */
  input_properties: Record<string, { type: string; description: string; enum?: string[] }>;
  /** Inputs that are required. */
  required_inputs: string[];
  /** Concrete outputSchema properties (used when the tool is live; documented now). */
  output_properties: Record<string, { type: string; description: string }>;
  /** Recommended third-party provider an agent should call right now. */
  recommended_provider: { name: string; url: string };
  /** Capability-map id this stub maps to. */
  capability_id: string;
}

export const PLANNED_CAPABILITIES: readonly PlannedCapability[] = [];
export const PLANNED_CAPABILITY_NAMES: ReadonlySet<string> = new Set(PLANNED_CAPABILITIES.map((c) => c.name));

// H-Phase-A cycle 7: destructiveHint was hardcoded false for every tool —
// iliad_object_storage's engineer-mode `delete` and iliad_web_search's
// `delete`/`delete_namespace` (the latter wipes an entire namespace's
// indexed corpus in one call) are genuinely irreversible, so they need the
// real signal an MCP client/orchestrator uses to require extra confirmation
// before invoking a data-destroying tool. Defaults to false (unchanged for
// every other call site) so only these two need updating.
function toolAnnotations(title: string, readOnly: boolean, idempotent: boolean, destructive = false) {
  return {
    title,
    readOnlyHint: readOnly,
    destructiveHint: destructive,
    idempotentHint: idempotent,
  };
}

const ARTIFACT_ENTRY_SCHEMA = {
  type: "object",
  properties: {
    path: { type: "string" },
    program: { type: "string" },
    description: { type: "string" },
  },
  required: ["path", "program", "description"],
};

const SNAPSHOT_RESULT_SCHEMA = {
  type: "object",
  properties: {
    snapshot_id: { type: "string" },
    project_id: { type: "string" },
    status: { type: "string" },
    artifact_count: { type: "number" },
    programs_executed: { type: "array", items: { type: "string" } },
    artifacts: { type: "array", items: ARTIFACT_ENTRY_SCHEMA },
  },
  required: ["snapshot_id", "project_id", "status", "artifact_count", "artifacts"],
};

const TOOL_MATCH_SCHEMA = {
  type: "object",
  properties: {
    program: { type: "string" },
    tier: { type: "string" },
    score: { type: "number" },
    capability_tags: { type: "array", items: { type: "string" } },
    matching_artifacts: { type: "array", items: { type: "string" } },
    all_artifacts: { type: "array", items: { type: "string" } },
    example_call: { type: "string" },
  },
  required: ["program", "tier", "score", "capability_tags", "matching_artifacts", "all_artifacts", "example_call"],
};

export const MCP_TOOLS = [
  {
    name: "analyze_repo",
    description:
      `Analyze a GitHub repository and generate ${ARTIFACT_COUNT} structured AXIS artifacts across ${PROGRAM_COUNT} programs. Returns snapshot_id plus an artifacts listing; use get_artifact to read files and get_snapshot to re-enumerate outputs without re-running analysis. Requires Authorization: Bearer <api_key>. Use this when the source of truth is a GitHub repo URL. Pricing: $0.50 standard, $0.15 lite budget mode, $25 engineer per repo. Engineer mode (X-Agent-Mode: engineer — Living Architecture) adds a verified LLM specificity pass: a living-architecture.md whose every architectural claim is grounded in the repo's extracted facts or dropped. This is the paid path for full repo analysis and can return authentication, quota, payment-required, invalid-URL, or GitHub-fetch errors. private repos require a stored GitHub token. Use analyze_files instead for inline file payloads or list_programs/search_and_discover_tools when you are still selecting a workflow.`,
    inputSchema: {
      type: "object",
      required: ["github_url"],
      properties: {
        github_url: {
          type: "string",
          description: "GitHub repository URL (https://github.com/owner/repo)",
        },
      },
    },
    outputSchema: SNAPSHOT_RESULT_SCHEMA,
    annotations: toolAnnotations("Analyze Repo", false, false),
    examples: [
      {
        name: "Analyze a GitHub repo",
        input: { github_url: "https://github.com/expressjs/express" },
        output: '{"snapshot_id":"abc-123","artifacts":[{"path":"AGENTS.md","program":"search","description":"Agent instructions"},{"path":".cursorrules","program":"search","description":"Cursor rules"},{"path":"CLAUDE.md","program":"search","description":"Claude context"}],"programs_executed":["search","skills","debug","theme"]}',
      },
    ],
  },
  {
    name: "analyze_files",
    description:
      `Analyze source files directly and generate the full ${ARTIFACT_COUNT}-artifact AXIS bundle without using GitHub. Returns snapshot_id plus artifact listing; use this for local, generated, or unsaved code. Requires Authorization: Bearer <api_key>. Pricing: $0.50 standard, $0.15 lite budget mode, $25 engineer per run (same tiers as analyze_repo). Can return authentication, quota, payment-required, file-limit, or validation errors. Use analyze_repo for GitHub URLs or improve_my_agent_with_axis for recommendation-first agent hardening.`,
    inputSchema: {
      type: "object",
      required: ["project_name", "project_type", "frameworks", "goals", "files"],
      properties: {
        project_name: { type: "string", description: "Name of the project" },
        project_type: {
          type: "string",
          description: "Project type (web_application, api_service, cli_tool, library, monorepo)",
        },
        frameworks: {
          type: "array",
          items: { type: "string" },
          description: "Detected or known frameworks",
        },
        goals: {
          type: "array",
          items: { type: "string" },
          description: "Analysis goals",
        },
        files: {
          type: "array",
          description: "Source files to analyze",
          items: {
            type: "object",
            required: ["path", "content"],
            properties: {
              path: { type: "string", description: "File path relative to project root" },
              content: { type: "string", description: "File content (UTF-8)" },
            },
          },
        },
      },
    },
    outputSchema: SNAPSHOT_RESULT_SCHEMA,
    annotations: toolAnnotations("Analyze Files", false, false),
    examples: [
      {
        name: "Analyze a Node.js project",
        input: {
          project_name: "my-api",
          project_type: "api_service",
          frameworks: ["express", "node"],
          goals: ["Generate AI context"],
          files: [
            { path: "package.json", content: "{\"name\":\"my-api\",\"version\":\"1.0.0\"}" },
            { path: "src/index.ts", content: "import express from 'express';" },
          ],
        },
        output: '{"snapshot_id":"def-456","artifacts":[{"path":"AGENTS.md","program":"search","description":"Agent instructions"},{"path":".cursorrules","program":"search","description":"Cursor rules"}],"programs_executed":["search","skills","debug"]}',
      },
    ],
  },
  {
    name: "list_programs",
    description:
      `Inventory mode. List all ${PROGRAM_COUNT} AXIS programs, their generators, pricing tier, and artifact paths. Free, no auth, and no side effects. Use search_and_discover_tools instead when you only have a keyword, or discover_commerce_tools when you need install and onboarding metadata.`,
    inputSchema: { type: "object", properties: {} },
    outputSchema: {
      type: "object",
      properties: {
        programs: { type: "array", items: { type: "object" } },
        total_programs: { type: "number" },
        total_generators: { type: "number" },
        free_programs: { type: "array", items: { type: "string" } },
        pro_programs: { type: "array", items: { type: "string" } },
      },
      required: ["programs", "total_programs", "total_generators", "free_programs", "pro_programs"],
    },
    annotations: toolAnnotations("List Programs", true, true),
    examples: [
      {
        name: "List all programs",
        input: {},
        output: '{"programs":[{"name":"search","tier":"free","generators":["AGENTS.md",".cursorrules","CLAUDE.md"]},{"name":"debug","tier":"free","generators":[".ai/debug-playbook.md"]}]}',
      },
    ],
  },
  {
    name: "get_snapshot",
    description:
      "Retrieve status and the full artifact listing for a prior analysis by snapshot_id. Use this to re-enumerate artifact paths without re-running analysis. Snapshots created with an API key are scoped to that same account — pass the same Authorization: Bearer <api_key> used to create it, or retrieval fails with a not-found error. Only anonymous (never-authenticated) snapshots are freely retrievable by any caller.",
    inputSchema: {
      type: "object",
      required: ["snapshot_id"],
      properties: {
        snapshot_id: {
          type: "string",
          description: "Snapshot ID returned by analyze_repo or analyze_files",
        },
      },
    },
    outputSchema: SNAPSHOT_RESULT_SCHEMA,
    annotations: toolAnnotations("Get Snapshot", true, true),
    examples: [
      {
        name: "Get a snapshot",
        input: { snapshot_id: "abc-123" },
        output: '{"snapshot_id":"abc-123","status":"complete","artifact_count":99,"artifacts":[{"path":"AGENTS.md","program":"search","description":"Agent instructions"}]}',
      },
    ],
  },
  {
    name: "get_artifact",
    description:
      "Read one generated artifact by snapshot_id and path. Requires access to the snapshot and may return snapshot-not-found, invalid-path, or artifact-not-found errors. Example: snapshot_id=abc-123, path=AGENTS.md. Use this when you need the full text of one artifact. Use get_snapshot instead when you first need the artifact list.",
    inputSchema: {
      type: "object",
      required: ["snapshot_id", "path"],
      properties: {
        snapshot_id: { type: "string", description: "Snapshot ID" },
        path: {
          type: "string",
          description: "Artifact file path as returned in the artifacts list",
        },
      },
    },
    outputSchema: {
      type: "string",
      description: "Raw UTF-8 artifact content — the exact bytes of the file at path, returned directly as the tool result text, not JSON-wrapped.",
    },
    annotations: toolAnnotations("Get Artifact", true, true),
    examples: [
      {
        name: "Get an AGENTS.md artifact",
        input: { snapshot_id: "abc-123", path: "AGENTS.md" },
        output: "# AGENTS.md — my-project\n\n## Project Context\n...",
      },
    ],
  },
  {
    name: "prepare_agentic_purchasing_preview",
    description:
      "Compute a free Purchasing Readiness Score (0-100) and gap list for a codebase without generating artifacts. No auth, no charge, no snapshot persisted. Hard caps: 25 files / 50KB per file / 1MB total. Returns score, risk_level, top gaps, frameworks detected, and which AXIS programs would close which gaps. Use this to triage 'should I pay for the full hardening bundle?' before calling prepare_agentic_purchasing. The paid version generates the full artifact bundle including CE 3.0 dispute evidence, SCA exemption matrix, and TAP interop.",
    inputSchema: {
      type: "object",
      required: ["project_name", "files"],
      properties: {
        project_name: { type: "string", description: "Name of the project being previewed" },
        project_type: { type: "string", description: "Optional project type hint (web_application, api_service, cli_tool, library, monorepo)" },
        frameworks: { type: "array", items: { type: "string" }, description: "Optional framework hints" },
        files: {
          type: "array",
          description: "Source files to triage (max 25 files, 50KB each, 1MB total)",
          items: {
            type: "object",
            required: ["path", "content"],
            properties: {
              path: { type: "string" },
              content: { type: "string" },
            },
          },
        },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        score: { type: "number", description: "Current Purchasing Readiness Score (0-100) for the codebase as submitted" },
        risk_level: { type: "string", enum: ["low", "medium", "high"] },
        interpretation: { type: "string" },
        strengths: { type: "array", items: { type: "string" } },
        gaps: { type: "array", items: { type: "string" } },
        top_3_gaps: { type: "array", items: { type: "string" } },
        frameworks_detected: { type: "array", items: { type: "string" } },
        what_axis_would_add: { type: "array", items: { type: "string" } },
        conversion: { type: "object" },
        cost: { type: "string" },
      },
    },
    annotations: toolAnnotations("Preview Purchasing Readiness", true, true),
    examples: [
      {
        name: "Triage purchasing readiness before paying",
        input: { project_name: "my-store", project_type: "api_service", files: [{ path: "package.json", content: "{\"dependencies\":{\"stripe\":\"^14\"}}" }] },
        output: '{"score":35,"risk_level":"high","interpretation":"minimal-coverage","gaps":["commerce artifacts","mcp configs"],"what_axis_would_add":["agent-purchasing-playbook.md","mcp-config.json"],"conversion":{"tool":"prepare_agentic_purchasing","price_standard_usd":"0.50"},"cost":"free — no auth required, no snapshot persisted"}',
      },
    ],
  },
  {
    name: "prepare_agentic_purchasing",
    description:
      "Prepare a codebase for agentic purchasing and return a readiness score plus commerce artifacts. Requires Authorization: Bearer <api_key>; paid analysis records a new snapshot and may return auth, quota, payment, file-limit, or validation errors. Pricing: $0.50 standard, $0.25 lite budget mode, $250 engineer per run. Every call returns the same full purchasing bundle — focus_areas is recorded and echoed back in the response for the caller's own bookkeeping; it does not filter which artifacts are generated. Use this when you need AP2/UCP/Visa, CE 3.0 dispute evidence, checkout, dispute, and negotiation hardening. Engineer mode (X-Agent-Mode: engineer — Commerce Integration) also emits a deployable x402/AP2/PAI'D endpoint + a runnable sandbox test + a schema-validatable CE 3.0 pack + a transparent dispute-readiness score (a working integration, not just a score), plus a deployable Stripe network-token read adapter when a stripe signal is detected. Use discover_agentic_purchasing_needs instead when you only need workflow triage.",
    inputSchema: {
      type: "object",
      required: ["project_name", "project_type", "frameworks", "goals", "files"],
      properties: {
        project_name: { type: "string", description: "Name of the project" },
        project_type: { type: "string", description: "Project type (web_application, api_service, cli_tool, library, monorepo)" },
        frameworks: { type: "array", items: { type: "string" }, description: "Detected or known frameworks" },
        goals: { type: "array", items: { type: "string" }, description: "Project goals" },
        files: {
          type: "array",
          description: "Array of {path, content} objects representing source files",
          items: {
            type: "object",
            required: ["path", "content"],
            properties: {
              path: { type: "string" },
              content: { type: "string" },
            },
          },
        },
        focus: {
          type: "string",
          enum: ["full", "purchasing", "security", "optimization"],
          description: "Analysis focus (default: purchasing)",
        },
        agent_type: { type: "string", description: "Consuming agent type hint" },
        focus_areas: {
          type: "array",
          items: { type: "string", enum: ["sca", "dispute", "mandate", "tap", "tokenization"] },
          description: "Compliance focus areas, recorded and echoed back in the response for the caller's own reference — does not filter which artifacts are generated.",
        },
        budget_per_run_cents: {
          type: "number",
          description: "Agent budget for this call in cents",
        },
        spending_window: {
          type: "string",
          enum: ["per_call", "hourly", "daily", "monthly"],
          description: "Agent spending window",
        },
        referral_token: {
          type: "string",
          description: "Optional referral token from another agent",
        },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        snapshot_id: { type: "string" },
        project_id: { type: "string" },
        status: { type: "string" },
        summary: {
          type: "object",
          properties: {
            purchasing_readiness_score: { type: "number" },
            risk_level: { type: "string" },
            recommended_next_action: { type: "string" },
            compliance_depth: { type: "string" },
            strengths: { type: "array", items: { type: "string" } },
            gaps: { type: "array", items: { type: "string" } },
          },
          required: ["purchasing_readiness_score", "risk_level", "recommended_next_action", "compliance_depth", "strengths", "gaps"],
        },
        artifact_count: { type: "number" },
        programs_executed: { type: "array", items: { type: "string" } },
      },
      required: ["snapshot_id", "project_id", "status", "summary", "artifact_count", "programs_executed"],
    },
    annotations: toolAnnotations("Prepare Agentic Purchasing", false, false),
    examples: [
      {
        name: "Basic purchasing hardening",
        input: { project_name: "my-checkout", project_type: "web_application", frameworks: ["react", "stripe"], goals: ["autonomous checkout"], files: [{ path: "src/checkout.ts", content: "export function checkout() { ... }" }] },
        output: '{"snapshot_id":"snap_...","score":62,"risk_level":"medium","artifact_count":99,"artifacts":{"AGENTS.md":"...","commerce-registry.json":"..."}}',
      },
      {
        name: "SCA + dispute compliance run with a budget cap",
        input: { project_name: "payments-api", project_type: "api_service", frameworks: ["express"], goals: ["PSD2 SCA compliance"], files: [{ path: "api.ts", content: "..." }], focus_areas: ["sca", "dispute"], budget_per_run_cents: 25 },
        output: '{"snapshot_id":"snap_...","score":45,"compliance_depth":"standard","risk_level":"high","recommended_next_action":"harden_codebase_before_commerce"}',
      },
    ],
  },
  {
    name: "closer",
    description:
      "Package an existing AXIS snapshot (create one first via analyze_repo, analyze_files, or prepare_agentic_purchasing) into complete professional packaging + marketplace certification artifacts so a 70-80%-complete project is ready to ship and sell. Requires a paid plan or entitlement. Pricing: $0.50 standard, $0.25 lite budget mode.",
    inputSchema: {
      type: "object",
      required: ["snapshot_id"],
      properties: {
        snapshot_id: {
          type: "string",
          description: "Existing AXIS snapshot_id to package into a distributable product",
        },
        project_root: {
          type: "string",
          description: "Optional local project root path hint (metadata only in remote MCP mode)",
        },
        product_name: {
          type: "string",
          description: "Optional branding override for product name",
        },
        tagline: {
          type: "string",
          description: "Optional branding tagline",
        },
        target_marketplaces: {
          type: "array",
          items: { type: "string" },
          description: "Optional marketplaces list (e.g. npm, unreal, vscode, dockerhub, github-marketplace)",
        },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        snapshot_id: { type: "string" },
        project_id: { type: "string" },
        program: { type: "string" },
        artifact_count: { type: "number" },
        artifacts: {
          type: "array",
          items: ARTIFACT_ENTRY_SCHEMA,
        },
      },
      required: ["snapshot_id", "project_id", "program", "artifact_count", "artifacts"],
    },
    annotations: toolAnnotations("Closer", false, false),
    examples: [
      {
        name: "Package existing snapshot",
        input: {
          snapshot_id: "snap_abc123",
          product_name: "Atlas Runtime Pro",
          tagline: "Turn your draft into a marketplace-ready product",
          target_marketplaces: ["npm", "vscode", "github-marketplace"],
        },
        output: '{"snapshot_id":"snap_abc123","program":"closer","artifact_count":16,"artifacts":[{"path":"packaging/README.md","program":"closer","description":"..."}]}',
      },
    ],
  },
  {
    name: "deploy",
    description:
      "Generate a zero-pipeline-minutes deploy bundle: stack-aware Dockerfile, .dockerignore, dev compose, render.yaml (Render existing-image), wrangler.pages.toml + wrangler.containers.toml + worker.ts (Cloudflare), bash/PowerShell push scripts, and a qualification report. The project builds locally in VSCode, pushes images to GHCR or via wrangler, and Render/Cloudflare just pulls — no GitHub Actions minutes, no Render build pipeline minutes, no CF build minutes. Requires a paid plan or entitlement. Pricing: $0.50 standard, $0.25 lite budget mode.",
    inputSchema: {
      type: "object",
      properties: {
        snapshot_id: {
          type: "string",
          description: "Existing AXIS snapshot_id to package into deploy artifacts",
        },
      },
      required: ["snapshot_id"],
    },
    outputSchema: {
      type: "object",
      properties: {
        snapshot_id: { type: "string" },
        project_id: { type: "string" },
        program: { type: "string" },
        artifact_count: { type: "number" },
        artifacts: {
          type: "array",
          items: ARTIFACT_ENTRY_SCHEMA,
        },
      },
      required: ["snapshot_id", "project_id", "program", "artifact_count", "artifacts"],
    },
    annotations: toolAnnotations("Deploy", false, false),
    examples: [
      {
        name: "Generate deploy bundle for an existing snapshot",
        input: { snapshot_id: "snap_abc123" },
        output: '{"snapshot_id":"snap_abc123","program":"deploy","artifact_count":13,"artifacts":[{"path":"deploy/Dockerfile","program":"deploy","description":"Multi-stage Dockerfile tuned for the detected stack"}]}',
      },
    ],
  },
  {
    name: "search_and_discover_tools",
    description:
      `Search AXIS programs by keyword and return ranked matches with artifact paths. Free, no auth, and no stateful side effects. Example: q=checkout returns commerce-relevant programs first. Use this when you know the outcome you want but not the right program. Use list_programs instead for the full catalog, discover_commerce_tools for install metadata, or discover_agentic_purchasing_needs for purchasing-specific triage.`,
    inputSchema: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description: "Search query — keyword or phrase",
        },
        program: {
          type: "string",
          description: "Optional: filter results to a specific program name",
        },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        query: { type: ["string", "null"] },
        program_filter: { type: ["string", "null"] },
        total_matches: { type: "number" },
        results: { type: "array", items: TOOL_MATCH_SCHEMA },
      },
      required: ["query", "program_filter", "total_matches", "results"],
    },
    annotations: toolAnnotations("Search And Discover Tools", true, true),
    examples: [
      {
        name: "Search for debug tools",
        input: { q: "debug playbook" },
        output: '{"query":"debug playbook","program_filter":null,"total_matches":1,"results":[{"program":"debug","tier":"free","score":8,"capability_tags":["debug","error","troubleshoot","breakpoints","logs","postmortem"],"matching_artifacts":[".ai/debug-playbook.md"],"all_artifacts":[".ai/debug-playbook.md",".ai/incident-template.md",".ai/tracing-rules.md"],"example_call":"POST /v1/debug/generate"}]}',
      },
      {
        name: "Filter results to one program",
        input: { program: "closer" },
        output: '{"query":null,"program_filter":"closer","total_matches":1,"results":[{"program":"closer","tier":"pro","score":0,"capability_tags":["closer","packaging","certification","marketplace"],"matching_artifacts":[],"all_artifacts":["packaging/README.md","packaging/LICENSE","Dockerfile"],"example_call":"POST /v1/closer/generate"}]}',
      },
    ],
  },
  {
    name: "discover_commerce_tools",
    description:
      "Discover AXIS install metadata, pricing, and shareable manifests for commerce-capable agents. Free, no auth, and no mutation beyond read access. Example: call before wiring AXIS into Claude Desktop, Cursor, or VS Code. Use this when you need onboarding and ecosystem setup details. Use search_and_discover_tools instead for keyword routing or discover_agentic_purchasing_needs for purchasing-task triage.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    outputSchema: {
      type: "object",
      properties: {
        axis_iliad: { type: "object" },
        tools: { type: "array", items: { type: "object" } },
        free_tools: { type: "array", items: { type: "string" } },
        install: { type: "object" },
        shareable_manifest: { type: "object" },
      },
      required: ["axis_iliad", "tools", "free_tools", "install", "shareable_manifest"],
    },
    annotations: toolAnnotations("Discover Commerce Tools", true, true),
    examples: [
      {
        name: "Discover all commerce tools",
        input: {},
        output: '{"axis_iliad":{"tagline":"The operating system for AI-native development"},"tools":[{"name":"analyze_repo","auth_required":true,"pricing":"$0.50/call or included in plan"},{"name":"search_and_discover_tools","auth_required":false,"pricing":"free"}],"free_tools":["search_and_discover_tools","list_programs"],"install":{"mcp_endpoint":"https://axis-api-6c7z.onrender.com/mcp"},"shareable_manifest":{"name":"Axis\' Iliad","tools":37}}',
      },
    ],
  },
  {
    name: "ping_payment",
    description:
      "Exercise the real x402 payment-flow loop at $0 — zero risk, no auth required. Call it once with no payment credential to receive a 402-style payment_required challenge (the exact same shape every real paid tool returns); retry the same tools/call carrying a payment credential in Authorization (with your API key moved to X-Axis-Key) to get a success envelope. Learn the vocabulary here before paying real money for prepare_agentic_purchasing or analyze_repo. No side effects on any other tool, no real payment rail is ever touched.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    outputSchema: {
      type: "object",
      properties: {
        _payment_required: { type: "boolean" },
        tool: { type: "string" },
        ok: { type: "boolean" },
        settled_cents: { type: "number" },
        message: { type: "string" },
      },
    },
    annotations: toolAnnotations("Ping Payment (x402 Probe)", false, true),
    examples: [
      {
        name: "First call, no payment credential — receives the challenge",
        input: {},
        output: '{"error":"Payment Required","message":"This is a free payment-flow probe. Fulfil the x402 challenge and retry the same tools/call with the payment credential.","price":"0.00","currency":"USD","_payment_required":true,"tool":"ping_payment","amount_cents":0,"retry":{"method":"tools/call","name":"ping_payment","headers_hint":["Authorization: <payment credential> — replaces the Bearer API key for this one retry","X-Axis-Key: <api_key> — your normal API key moves here on the retry"]}}',
      },
      {
        name: "Retry with a payment credential in Authorization — succeeds at $0",
        input: {},
        output: '{"ok":true,"tool":"ping_payment","settled_cents":0,"message":"Payment flow exercised successfully. You now know how to pay for any metered AXIS tool.","next":"Call prepare_agentic_purchasing or analyze_repo — same 402 vocabulary applies at real prices."}',
      },
    ],
  },
  {
    name: "improve_my_agent_with_axis",
    description:
      "Analyze an agent codebase and return a prioritized AXIS hardening plan. Requires Authorization: Bearer <api_key>; this creates a snapshot and may return auth, quota, file-limit, or validation errors. Example: pass your agent source files to see missing AGENTS.md, CLAUDE.md, and MCP config gaps. Use this when you want recommendations and missing-context detection. Use analyze_files instead when you want the full artifact bundle directly.",
    inputSchema: {
      type: "object",
      required: ["project_name", "files"],
      properties: {
        project_name: { type: "string", description: "Name of the agent/project to improve" },
        files: {
          type: "array",
          items: {
            type: "object",
            required: ["path", "content"],
            properties: {
              path: { type: "string", description: "File path relative to project root" },
              content: { type: "string", description: "File content (UTF-8)" },
            },
          },
          description: "Source files of the agent to analyze",
        },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        snapshot_id: { type: "string" },
        project_name: { type: "string" },
        analysis: { type: "object" },
        improvement_plan: { type: "object" },
        call_again: { type: "object" },
        mcp_config: { type: "object" },
      },
      required: ["snapshot_id", "project_name", "analysis", "improvement_plan", "call_again", "mcp_config"],
    },
    annotations: toolAnnotations("Improve My Agent With Axis", false, false),
    examples: [
      {
        name: "Improve a custom agent",
        input: { project_name: "my-agent", files: [{ path: "src/agent.ts", content: "export class Agent { ... }" }] },
        output: '{"snapshot_id":"snap_...","missing_context_files":["AGENTS.md",".cursorrules","CLAUDE.md"],"recommended_programs":["skills","debug","mcp"],"improvement_plan":[...]}',
      },
    ],
  },
  {
    name: "discover_agentic_purchasing_needs",
    description:
      "Discover the best AXIS workflow for a purchasing or compliance task. Free, no auth, and logs lightweight task metadata for intent analytics. Example: task_description='prepare for autonomous Visa checkout'. Use this when you need commerce-specific triage and next-step guidance. Use search_and_discover_tools instead for non-commerce keyword routing across all programs.",
    inputSchema: {
      type: "object",
      properties: {
        task_description: {
          type: "string",
          description: "What the agent is trying to accomplish",
        },
        current_readiness: {
          type: "number",
          description: "Optional: current Purchasing Readiness Score (0-100) if known",
        },
        focus_areas: {
          type: "array",
          items: { type: "string" },
          description: "Optional: specific areas to focus on",
        },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        task_description: { type: "string" },
        matched_capabilities: { type: "array", items: { type: "object" } },
        readiness: { type: "object" },
        recommended_next_step: { type: "object" },
      },
      required: ["task_description", "matched_capabilities", "readiness", "recommended_next_step"],
    },
    annotations: toolAnnotations("Discover Agentic Purchasing Needs", true, true),
    examples: [
      {
        name: "Discover tools for checkout compliance",
        input: { task_description: "prepare for autonomous Visa checkout" },
        output: '{"matched_capabilities":[{"program":"agentic-purchasing","relevance":9}],"readiness":{"note":"No current score provided..."},"recommended_next_step":{"tool":"prepare_agentic_purchasing"}}',
      },
      {
        name: "Check readiness with known score",
        input: { task_description: "dispute handling", current_readiness: 45 },
        output: '{"matched_capabilities":[...],"readiness":{"current_score":45,"interpretation":"minimal-coverage"}}',
      },
    ],
  },
  {
    name: "get_referral_code",
    description:
      "Get or create the caller's AXIS referral token. Requires Authorization: Bearer <api_key>, has no usage charge, and may persist a new referral code if one does not exist yet. Example: call before sharing AXIS with another agent or workspace. Use this when you need the shareable token itself. Use get_referral_credits instead when you need balances, milestones, and discount status.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    outputSchema: {
      type: "object",
      properties: {
        referral_token: { type: "string" },
        share_instruction: { type: "string" },
        current_earnings: { type: "object" },
        next_milestone: { type: "string" },
        cost: { type: "string" },
      },
      required: ["referral_token", "share_instruction", "current_earnings", "next_milestone", "cost"],
    },
    annotations: toolAnnotations("Get Referral Code", false, true),
    examples: [
      {
        name: "Get referral code",
        input: {},
        output: '{"referral_token":"ref_abc123","share_instruction":"Pass this referral_token to other agents...","current_earnings":{"lifetime_referrals":0}}',
      },
    ],
  },
  {
    name: "get_referral_credits",
    description:
      "Get the caller's referral earnings, milestones, and free-call status. Requires Authorization: Bearer <api_key>, has no usage charge, and returns the current discount ledger without creating a new analysis. Example: call after a referral campaign to inspect earned credits. Use this when you need balances and milestones. Use get_referral_code instead when you only need the shareable token.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    outputSchema: {
      type: "object",
      properties: {
        referral_token: { type: "string" },
        earned_credits_millicents: { type: "number" },
        earned_discount: { type: "string" },
        lifetime_referrals: { type: "number" },
        free_calls_remaining: { type: "number" },
        paid_call_count: { type: "number" },
        persistence_credits_remaining: { type: "number" },
        tier: { type: "string" },
        discount_active: { type: "boolean" },
        next_milestone: { type: "string" },
        cost: { type: "string" },
      },
      required: ["referral_token", "earned_credits_millicents", "earned_discount", "lifetime_referrals", "free_calls_remaining", "paid_call_count", "persistence_credits_remaining", "tier", "discount_active", "next_milestone", "cost"],
    },
    annotations: toolAnnotations("Get Referral Credits", false, true),
    examples: [
      {
        name: "Check referral credits",
        input: {},
        output: '{"referral_token":"ref_abc123","earned_credits_millicents":0,"lifetime_referrals":0,"free_calls_remaining":1}',
      },
    ],
  },
  {
    name: "iliad_web_research",
    description:
      "Scrape a single URL with AXIS's owned crawler (SSRF-guarded fetch, robots.txt-aware, readability extraction — no third-party key) and return markdown-formatted content. Honest scope: fetches static HTML only, no JavaScript rendering, so client-rendered SPA pages may extract thin content. Returns markdown body, extracted metadata, and title. Best for research, documentation reading, or SEO analysis. Requires Authorization: Bearer <api_key>. Pricing: $0.10 standard, $0.05 lite per page. If the operator's backend configuration is incomplete, this call returns {_not_configured:true} instead of scraping, and is not billed. Use iliad_web_research_crawl for crawling multiple pages or link following.",
    inputSchema: {
      type: "object",
      required: ["url"],
      properties: {
        url: {
          type: "string",
          description: "The URL to scrape (http or https)",
        },
        only_main_content: {
          type: "boolean",
          description: "Extract only the main content (default: true)",
          default: true,
        },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        data: {
          type: "object",
          properties: {
            url: { type: "string", description: "The scraped URL" },
            markdown: { type: "string", description: "Content as markdown" },
            metadata: { type: "object", description: "Extracted metadata (title, description, etc.)" },
          },
        },
        error: { type: "string", description: "Error message if request failed" },
      },
      required: ["success"],
    },
    annotations: toolAnnotations("Web Research", false, true),
    examples: [
      {
        name: "Scrape a documentation page",
        input: { url: "https://example.com/docs/api" },
        output: '{"success":true,"data":{"url":"https://example.com/docs/api","markdown":"# API Documentation\\n\\n## Overview\\n...","metadata":{"title":"API Documentation","description":"Full API reference"}}}',
      },
    ],
  },
  {
    name: "iliad_web_research_crawl",
    description:
      "Crawl a domain with AXIS's owned crawler — a same-origin BFS frontier with robots.txt compliance and per-host politeness, no third-party key — and scrape multiple pages. Honest scope: static HTML only, no JavaScript rendering. Returns array of scraped pages with markdown content. Best for site mapping, content audits, or bulk research. Requires Authorization: Bearer <api_key>. Pricing: $0.01/page beyond your account's shared 100-page/month free pool (standard and lite) — a crawl fully covered by the free pool costs $0.00; a fully-paid 100-page crawl costs up to $1.00. If the operator's backend configuration is incomplete, this call returns {_not_configured:true} instead of crawling, and is not billed. Use iliad_web_research for single-page scrapes.",
    inputSchema: {
      type: "object",
      required: ["url"],
      properties: {
        url: {
          type: "string",
          description: "The domain/URL to crawl (http or https)",
        },
        limit: {
          type: "number",
          description: "Maximum pages to crawl (1-100, default: 10)",
          minimum: 1,
          maximum: 100,
          default: 10,
        },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        data: {
          type: "object",
          properties: {
            url: { type: "string", description: "The domain that was crawled" },
            pages_crawled: { type: "number", description: "Number of pages successfully crawled" },
            pages: {
              type: "array",
              description: "Array of scraped pages",
              items: {
                type: "object",
                properties: {
                  url: { type: "string" },
                  markdown: { type: "string" },
                  metadata: { type: "object" },
                },
              },
            },
          },
        },
        error: { type: "string", description: "Error message if request failed" },
      },
      required: ["success"],
    },
    annotations: toolAnnotations("Web Research (Crawl)", false, true),
    examples: [
      {
        name: "Crawl a documentation site",
        input: { url: "https://example.com/docs", limit: 5 },
        output: '{"success":true,"data":{"url":"https://example.com/docs","pages_crawled":5,"pages":[{"url":"https://example.com/docs/intro","markdown":"# Introduction\\n...","metadata":{"title":"Introduction"}},{"url":"https://example.com/docs/api","markdown":"# API\\n...","metadata":{"title":"API Reference"}}]}}',
      },
    ],
  },
  // ─── iliad_object_storage (AXIS-owned, Cloudflare R2 SigV4) ─────
  // First member of the "owned" tier — not a Firecrawl-style proxy, not a
  // planned stub. The handler signs URLs locally; R2 is the storage layer
  // we picked because its zero-egress model is materially cheaper than S3
  // once download volume crosses ~10 GB/account/month.
  {
    name: "iliad_object_storage",
    description:
      "AXIS-owned signed-URL minter backed by Cloudflare R2. Returns a pre-signed PUT or GET URL scoped to the calling account (keys are prefixed with `accounts/<account_id>/` server-side, so accounts can't reach each other's objects). Requires Authorization: Bearer <api_key>. Returns the URL plus expires_at (ISO 8601), bucket, and scoped_key. Returns `{_not_configured: true, ...}` when the operator has not provisioned R2_* env vars (no crash, no leaked secrets); not billed when not configured. Pricing: $0.01 standard, free in lite mode. TTL is capped at 86400 seconds (24h). Engineer mode (X-Agent-Mode: engineer — Managed Bucket, $0.05): adds delete + list + copy (server-side, no bytes through the agent) operations, content-addressed dedup keys (content_sha256), and mint-time PUT policy (pin content_type / exact content_length as signed headers R2 enforces).",
    inputSchema: {
      type: "object" as const,
      required: ["key", "operation"],
      properties: {
        key: { type: "string", description: "Object key (max 1024 chars), or the prefix for operation=list. Path traversal and leading-/ are rejected." },
        operation: { type: "string", description: "put / get (standard). delete / list / copy and content-addressed put require X-Agent-Mode: engineer (Managed Bucket).", enum: ["put", "get", "delete", "list", "copy"] },
        content_sha256: { type: "string", description: "Engineer mode: 64-char hex sha256 of the bytes you'll PUT. When set, the object lands under accounts/<id>/cas/<sha256> so identical content dedupes." },
        ext: { type: "string", description: "Engineer mode: optional extension appended to the content-addressed key (e.g. 'png')." },
        source_key: { type: "string", description: "Engineer mode (operation=copy): source object key to copy from, scoped to your account; `key` is the destination. Echo the returned required_headers on the PUT." },
        content_type: { type: "string", description: "Engineer mode (put): pin the Content-Type the upload must send (signed; R2 rejects a mismatch). Printable ASCII type/subtype, ≤255 chars. Echo via required_headers." },
        content_length: { type: "number", description: "Engineer mode (put): pin the EXACT byte size the upload must be (signed; ≤5 GiB). Pairs with content_sha256 for verified content-addressed writes." },
        ttl_seconds: { type: "number", description: "Signed-URL lifetime, 1..86400. Defaults to 3600." },
      },
    },
    outputSchema: {
      type: "object" as const,
      required: ["url", "expires_at", "bucket", "scoped_key"],
      properties: {
        url: { type: "string", description: "Pre-signed URL valid for ttl_seconds." },
        expires_at: { type: "string", description: "ISO-8601 expiry timestamp." },
        bucket: { type: "string", description: "Resolved R2 bucket name." },
        scoped_key: { type: "string", description: "Server-side key after account scoping (the user-supplied key prefixed with accounts/<account_id>/)." },
        operation: { type: "string", description: "PUT or GET — what the URL was signed for." },
      },
    },
    annotations: toolAnnotations("Object Storage (signed URLs)", false, false, true),
    examples: [
      {
        name: "Pre-sign an upload URL",
        input: { key: "uploads/photo.png", operation: "put", ttl_seconds: 600 },
        output: '{"url":"https://<account>.r2.cloudflarestorage.com/<bucket>/accounts/<acc>/uploads/photo.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&...","expires_at":"2026-05-22T10:10:00.000Z","bucket":"axis-storage","scoped_key":"accounts/<acc>/uploads/photo.png","operation":"PUT"}',
      },
    ],
  },
  // ─── iliad_vector_database (AXIS-owned, SQLite-backed flat search) ─
  // Second member of the owned tier. MVP runs cosine-similarity flat
  // search over the existing @axis/snapshots SQLite database. Future
  // upgrade path: swap the module body for a LanceDB-on-R2 implementation
  // when query volume justifies the columnar index. Public function
  // signatures stay stable across the swap.
  {
    name: "iliad_vector_database",
    description:
      "AXIS-owned vector store. Two operations: `upsert` (insert or replace vectors) and `query` (cosine top-k nearest neighbors). Namespaces are account-scoped server-side (`acct:<account_id>:<namespace>`), so tenants cannot read each other's vectors. Persistent across restarts via Postgres. Requires Authorization: Bearer <api_key>. Pricing: $0.01 standard, free in lite mode. Best for RAG retrievers, deduplication, and similarity search. Engineer mode (X-Agent-Mode: engineer — Managed Memory, $0.05): query runs a pgvector/HNSW ANN candidate pool with optional recency-decay reranking (recency_half_life_days — managed forgetting), RRF hybrid fusion (sparse_ids), and metadata filter; upsert applies intra-batch semantic-dedup (dedup_threshold).",
    inputSchema: {
      type: "object" as const,
      required: ["operation"],
      properties: {
        operation: { type: "string", description: "upsert (insert/replace) or query (top-k cosine).", enum: ["upsert", "query"] },
        namespace: { type: "string", description: "Logical isolation key. Defaults to 'default'. Account ID is always prepended server-side." },
        vectors: { type: "array", description: "Array of {id, vector, metadata?} — required for upsert." },
        query: { type: "object", description: "{vector: number[], top_k?: number, filter?: object}. Engineer mode also reads recency_half_life_days (number — exponential recency decay) and sparse_ids (string[] — RRF hybrid fusion). Required for query." },
        dedup_threshold: { type: "number", description: "Engineer upsert: cosine threshold for intra-batch semantic-dedup (default 0.97)." },
        semantic_dedup: { type: "boolean", description: "Engineer upsert: set false to disable dedup (default on)." },
      },
    },
    outputSchema: {
      type: "object" as const,
      properties: {
        operation: { type: "string", description: "Echo of the operation that ran." },
        namespace: { type: "string", description: "Scoped namespace the call wrote to or queried." },
        upserted: { type: "number", description: "Vectors written (upsert mode only)." },
        total_in_namespace: { type: "number", description: "Total vectors in this namespace after the call (upsert mode only)." },
        matches: {
          type: "array",
          description: "Nearest neighbors sorted by score desc (query mode only).",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Vector id." },
              score: { type: "number", description: "Cosine similarity in [-1, 1] (decayed score in engineer mode with recency decay)." },
              metadata: { type: "object", description: "Stored metadata or null." },
            },
          },
        },
        backend: { type: "string", description: "Engineer query: 'pgvector' or 'js' — which ANN path served the query." },
        engineer: { type: "object", description: "Engineer query only: { ann, recency_decay, hybrid_fusion } flags." },
        semantic_dedup: { type: "object", description: "Engineer upsert only: { dropped: [{id, duplicate_of, similarity}] } — vectors dropped as intra-batch duplicates." },
      },
    },
    annotations: toolAnnotations("Vector Database", false, false),
    examples: [
      {
        name: "Upsert two vectors",
        input: { operation: "upsert", namespace: "docs", vectors: [{ id: "v1", vector: [0.1, 0.2, 0.3], metadata: { source: "intro.md" } }] },
        output: '{"operation":"upsert","namespace":"acct:<acc>:docs","upserted":1,"total_in_namespace":1}',
      },
      {
        name: "Query for top-3 nearest neighbors",
        input: { operation: "query", namespace: "docs", query: { vector: [0.1, 0.2, 0.3], top_k: 3 } },
        output: '{"operation":"query","namespace":"acct:<acc>:docs","matches":[{"id":"v1","score":0.999,"metadata":{"source":"intro.md"}}]}',
      },
    ],
  },
  // ─── iliad_embeddings (owned — in-process node-llama-cpp; OpenAI optional) ─
  // Natural pair to iliad_vector_database. Returns dense vectors that feed
  // directly into vector_database's upsert/query operations. Default backend
  // is AXIS-owned in-process inference (node-llama-cpp + an embedding-capable
  // GGUF at AXIS_EMBEDDING_MODEL_PATH — same sovereign pattern as
  // iliad_llm_inference; no upstream provider call). The legacy OpenAI proxy
  // remains available behind AXIS_EMBEDDING_BACKEND=openai.
  {
    name: "iliad_embeddings",
    description:
      "Convert text into dense vectors. Accepts a single string or a batch (max 2048). Returns one vector per input. AXIS-owned in-process inference by default (node-llama-cpp + an embedding-capable GGUF at AXIS_EMBEDDING_MODEL_PATH — no upstream provider call); an optional OpenAI /v1/embeddings backend is available behind AXIS_EMBEDDING_BACKEND=openai (model: text-embedding-3-small by default, overridable via OPENAI_EMBEDDING_MODEL; reports token usage). Requires Authorization: Bearer <api_key> to call. Pricing: $0.05 standard, $0.02 lite. When the selected backend is not provisioned (local: GGUF file absent; openai: OPENAI_API_KEY unset), returns a structured `_not_configured: true` envelope naming the backend and remediation, and is not billed. Pairs natively with iliad_vector_database — feed `vectors` from this tool's output into `vector` of the vector_database upsert/query calls. Engineer mode (X-Agent-Mode: engineer — Domain Embeddings, $0.08): pass `dimensions` (Matryoshka truncation → smaller vectors) and/or `corpus_adapter: true` (mean-center the batch to sharpen retrieval on your data); returns an `engineer` block with the fitted adapter_mean for query alignment.",
    inputSchema: {
      type: "object" as const,
      required: ["input"],
      properties: {
        input: { type: ["string", "array"] as unknown as string, description: "A single string or an array of strings to embed. Empty strings and entries > 32k chars are rejected (chunk before calling)." },
        dimensions: { type: "number", description: "Engineer mode: truncate each vector to this many leading dims (Matryoshka) + renormalize. Smaller, cheaper vectors." },
        corpus_adapter: { type: "boolean", description: "Engineer mode: mean-center the batch (all-but-the-mean) to sharpen retrieval; returns the fitted adapter_mean." },
      },
    },
    outputSchema: {
      type: "object" as const,
      required: ["vectors", "model_used", "input_count"],
      properties: {
        vectors: { type: "array", description: "Array of dense vectors. vectors[i] corresponds to input[i] (order preserved)." },
        model_used: { type: "string", description: "Concrete embedding model used: the GGUF filename on the local backend, or the provider model name on the openai backend." },
        input_count: { type: "number", description: "Number of inputs submitted (matches vectors.length)." },
        usage: { type: "object", description: "{prompt_tokens, total_tokens} — openai backend only (the local in-process backend has no provider token report)." },
        engineer: { type: "object", description: "Engineer mode only: { dimensions, truncated, adapter_applied, adapter_mean? } — the post-processing applied + the fitted corpus mean." },
      },
    },
    annotations: toolAnnotations("Vector Embeddings", false, true),
    examples: [
      {
        name: "Embed a single string (default local backend)",
        input: { input: "hello world" },
        output: '{"vectors":[[0.012,-0.034,...]],"model_used":"bge-small-en-v1.5-q4_k_m.gguf","input_count":1}',
      },
      {
        name: "Embed a batch for RAG indexing",
        input: { input: ["chunk 1 text", "chunk 2 text", "chunk 3 text"] },
        output: '{"vectors":[[...],[...],[...]],"model_used":"bge-small-en-v1.5-q4_k_m.gguf","input_count":3}',
      },
    ],
  },
  // ─── iliad_transactional_email (live_proxy → Resend) ────────────
  // Decoupled from the internal welcome/upgrade/usage-alert pipeline in
  // @axis/snapshots — that path stays template-bound for AXIS's own emails.
  // This tool serves arbitrary agent-supplied content under a single
  // verified From: address per deployment.
  {
    name: "iliad_transactional_email",
    description:
      "Send a single transactional email. Requires Authorization: Bearer <api_key>. Provide either body_html, body_text, or both (Resend will pick the best variant per recipient). All emails ship from RESEND_FROM_ADDRESS — operator must verify that domain in Resend before sending. Returns the provider-assigned message_id plus the accepted recipient list. Pricing: $0.02 standard, $0.01 lite. Returns a structured _not_configured envelope when RESEND_API_KEY or RESEND_FROM_ADDRESS is missing, and is not billed. Recipients capped at 50 per call; subject capped at 998 chars; bodies capped at 1 MB. Engineer mode (X-Agent-Mode: engineer — Deliverability, $0.50): instead of sending, pass a `domain` and get a full SPF/DKIM/DMARC setup (fresh DKIM keypair) + sender warmup schedule + verification checklist — no email sent, no ESP key needed.",
    inputSchema: {
      type: "object" as const,
      properties: {
        to: {
          type: ["string", "array"] as unknown as string,
          description: "Recipient address or array of addresses (max 50). Required for a send (standard mode).",
        },
        domain: { type: "string", description: "Engineer mode (Deliverability): domain to generate SPF/DKIM/DMARC setup for. Replaces the send." },
        provider: { type: "string", description: "Engineer mode: ESP for the SPF include (resend/sendgrid/mailgun/postmark/ses/google). Defaults resend." },
        dkim_selector: { type: "string", description: "Engineer mode: DKIM selector (alphanumeric/hyphen, 1-32). Defaults 'axis'." },
        dmarc_policy: { type: "string", description: "Engineer mode: DMARC policy none|quarantine|reject. Defaults none (monitoring)." },
        subject: { type: "string", description: "Email subject (max 998 chars, RFC 5322)." },
        body_html: { type: "string", description: "HTML body. At least one of body_html / body_text required." },
        body_text: { type: "string", description: "Plaintext body. At least one of body_html / body_text required." },
        reply_to: { type: "string", description: "Optional Reply-To address." },
      },
    },
    outputSchema: {
      type: "object" as const,
      required: ["message_id", "delivered_to", "from", "subject"],
      properties: {
        message_id: { type: "string", description: "Provider-assigned message ID." },
        delivered_to: { type: "array", description: "Recipients the provider accepted." },
        from: { type: "string", description: "RESEND_FROM_ADDRESS used as the From: header." },
        subject: { type: "string", description: "Subject sent (echo)." },
      },
    },
    annotations: toolAnnotations("Transactional Email", false, false),
    examples: [
      {
        name: "Send a simple notification",
        input: { to: "alice@example.com", subject: "Your snapshot is ready", body_text: "Hi Alice, your AXIS snapshot finished. Open https://iliad.trustfabric.ai/dashboard to view." },
        output: '{"message_id":"re_abc123","delivered_to":["alice@example.com"],"from":"noreply@iliad.trustfabric.ai","subject":"Your snapshot is ready"}',
      },
      {
        name: "Send HTML to multiple recipients with reply-to",
        input: { to: ["alice@example.com", "bob@example.com"], subject: "Weekly digest", body_html: "<h1>This week</h1><p>...</p>", reply_to: "support@iliad.trustfabric.ai" },
        output: '{"message_id":"re_xyz789","delivered_to":["alice@example.com","bob@example.com"],"from":"noreply@iliad.trustfabric.ai","subject":"Weekly digest"}',
      },
    ],
  },
  // ─── iliad_llm_inference (AXIS-hosted via node-llama-cpp + small GGUF) ─
  // Owned implementation: inference runs in this process via the
  // node-llama-cpp native addon. Operators choose the model by
  // setting AXIS_LLM_MODEL_PATH; the recommended picks are
  // Phi-3-mini (MIT, ~2.2GB), TinyLlama-1.1B (Apache-2.0, ~669MB),
  // or Llama-3.2-1B (Meta license, ~808MB). Latency is CPU-bound
  // (2-15s per 100 tokens depending on model). When the model file
  // isn't present, the tool returns a structured _not_configured
  // envelope so agents can branch deterministically.
  {
    name: "iliad_llm_inference",
    description:
      "AXIS-hosted LLM chat-completion via node-llama-cpp + a small GGUF model loaded in-process. Two input shapes accepted: `prompt` (single string) or `messages` (chat-style array of {role, content}). Sampling controls: `max_tokens` (≤2048), `temperature` (0-2), `top_k`, `top_p`, `seed` (threaded through for more deterministic output — NOT a proven byte-identical guarantee; thread count isn't pinned and GGML's multi-threaded matmul reduction order isn't guaranteed bit-exact across runs), `stop` (string[]). Inference runs in-process — no upstream LLM provider call — but this AXIS tool call is still billed: $0.02 standard, $0.01 lite. Operator sets AXIS_LLM_MODEL_PATH to point at a Phi-3-mini / TinyLlama / Llama-3.2-1B GGUF; if missing, the tool returns a `_not_configured: true` envelope and is not billed. Engineer mode (X-Agent-Mode: engineer — Constrained Inference, $0.10): pass a `json_schema` and decoding is grammar-constrained to it AND the output is validated against it (returns a `structured` block with valid + parsed + schema_errors) — guaranteed-valid structured output. Requires Authorization: Bearer <api_key>.",
    inputSchema: {
      type: "object" as const,
      properties: {
        prompt: { type: "string", description: "Single-prompt completion input. Use either this OR messages, not both." },
        messages: { type: "array", description: "Chat-style input. Array of {role: system|user|assistant, content: string}." },
        system: { type: "string", description: "Optional system prompt (prompt mode only). For messages mode, use role=system entries." },
        max_tokens: { type: "number", description: "Max tokens to generate. Defaults 512, hard cap 2048." },
        temperature: { type: "number", description: "Sampling temperature in [0, 2]. Defaults 0.7." },
        top_k: { type: "number", description: "Top-k sampling (positive integer). Defaults 40." },
        top_p: { type: "number", description: "Top-p nucleus sampling in (0, 1]. Defaults 0.95." },
        seed: { type: "number", description: "Optional seed, threaded through with temperature for more deterministic output. Not a proven byte-identical guarantee (thread count/matmul reduction order isn't pinned) — see the tool description." },
        stop: { type: "array", description: "Stop sequences. Generation halts when any string in the array is produced." },
        json_schema: { type: "object", description: "Engineer mode (required): a JSON Schema. Decoding is grammar-constrained to it and the output is validated against it; returns a `structured` block." },
      },
    },
    outputSchema: {
      type: "object" as const,
      properties: {
        text: { type: "string", description: "Generated completion text." },
        structured: { type: "object", description: "Engineer mode only: { schema_constrained, valid, parsed, schema_errors } — the guaranteed-valid structured-output verdict." },
        model_used: { type: "string", description: "Basename of the GGUF model file used." },
        prompt_tokens: { type: "number", description: "Token count of the input prompt (best-effort)." },
        completion_tokens: { type: "number", description: "Token count of the generated text (best-effort)." },
        _not_configured: { type: "boolean", description: "True when no GGUF model is present at AXIS_LLM_MODEL_PATH." },
        model_path: { type: "string", description: "Path checked for the GGUF file (only present when _not_configured=true)." },
        reason: { type: "string", description: "Why the tool returned _not_configured (only present when true)." },
        remediation: { type: "string", description: "How the operator should fix the missing-model condition." },
      },
    },
    annotations: toolAnnotations("LLM Inference", false, false),
    examples: [
      {
        name: "Single-prompt completion",
        input: { prompt: "Summarize: AXIS turns any codebase into deterministic agent-ready artifacts.", max_tokens: 64, temperature: 0.3 },
        output: '{"text":"AXIS is a deterministic codebase-to-artifact pipeline...","model_used":"Phi-3-mini-4k-instruct-q4.gguf","prompt_tokens":18,"completion_tokens":40}',
      },
      {
        name: "Chat-style with system prompt",
        input: { messages: [{ role: "system", content: "Reply with exactly one word." }, { role: "user", content: "What color is the sky on a clear day?" }], max_tokens: 8, seed: 1 },
        output: '{"text":"Blue.","model_used":"Phi-3-mini-4k-instruct-q4.gguf","prompt_tokens":24,"completion_tokens":2}',
      },
      {
        name: "More deterministic output via seed + temperature 0 (not a proven byte-identical guarantee)",
        input: { prompt: "Pick a random number 1-100:", max_tokens: 8, seed: 42, temperature: 0 },
        output: '{"text":"42","model_used":"Phi-3-mini-4k-instruct-q4.gguf"}',
      },
      {
        name: "Probe before model download",
        input: { prompt: "anything" },
        output: '{"_not_configured":true,"tool":"iliad_llm_inference","model_path":"/srv/axis/models/Llama-3.2-1B-Instruct-Q4_K_M.gguf","reason":"GGUF model file is not present...","remediation":"Operator must download a GGUF model..."}',
      },
    ],
  },
  // ─── iliad_code_sandbox (AXIS-owned, ephemeral Docker container) ─
  // Owned implementation: each call spawns a throwaway container
  // with NetworkMode=none, ReadonlyRootfs=true, all Linux caps
  // dropped, PidsLimit=64, Memory=256MB, NanoCPUs=0.5, User=nobody,
  // size-capped tmpfs /tmp, no-new-privileges. Timeout enforcement
  // via setTimeout → container.kill(SIGKILL) → container.remove(force).
  // dockerode is dynamically imported so tests pass without Docker.
  // Returns a _not_configured envelope when the daemon is unreachable.
  {
    name: "iliad_code_sandbox",
    description:
      "AXIS-owned secure code execution. Each call spawns a fresh ephemeral Docker container with hardened isolation: no network, read-only root filesystem, all Linux capabilities dropped, no-new-privileges, PID/memory/CPU limits, tmpfs /tmp only, runs as nobody:nobody. Container is force-removed after each call. Supports python | node | bash via the multi-runtime image `nikolaik/python-nodejs:python3.12-nodejs22-slim` (operator can override via AXIS_CODE_SANDBOX_IMAGE). Returns stdout/stderr/exit_code/timed_out/duration_ms/image. Wall-clock timeout enforced via SIGKILL + force-remove. Source is fed via stdin (no fs write to the read-only root). Code body capped at 256 KiB; stdin at 1 MiB; timeout 1-600 seconds (default 30); stdout/stderr each capped at 1 MiB output. Pricing: $0.05 standard, $0.02 lite — billed whenever a container actually ran, including a timeout or non-zero exit code. Not billed when the call instead returns `_not_configured: true`: no Docker daemon reachable (Render standard services don't expose /var/run/docker.sock), the operator has set AXIS_CODE_SANDBOX_DISABLED=1, or more than AXIS_SANDBOX_MAX_CONCURRENT (default 4) runs are already in flight (reason sandbox_busy — transient, retry shortly). Engineer mode (X-Agent-Mode: engineer — Verified Exec, $0.25): the result includes an Ed25519-signed attestation binding code-hash → output-hash + a per-account hash-chain entry, so another agent that pins AXIS's published key can verify the run without re-executing it. Requires Authorization: Bearer <api_key>.",
    inputSchema: {
      type: "object" as const,
      required: ["language", "code"],
      properties: {
        language: { type: "string", description: "Runtime language.", enum: ["python", "node", "bash"] },
        code: { type: "string", description: "Source code to execute. Fed via stdin to the interpreter. Max 256 KiB." },
        timeout_seconds: { type: "number", description: "Wall-clock limit. Defaults 30, max 600. SIGKILL on overrun." },
        stdin: { type: "string", description: "Optional additional stdin appended after the code body. Max 1 MiB." },
      },
    },
    outputSchema: {
      type: "object" as const,
      properties: {
        stdout: { type: "string", description: "Captured stdout (UTF-8, capped at 1 MiB with truncation marker)." },
        stderr: { type: "string", description: "Captured stderr (UTF-8, capped at 1 MiB)." },
        exit_code: { type: "number", description: "Process exit code (137 on SIGKILL)." },
        timed_out: { type: "boolean", description: "True if the wall-clock timeout fired." },
        duration_ms: { type: "number", description: "End-to-end wall time including container spawn + teardown." },
        image: { type: "string", description: "Container image actually used." },
        attestation: { type: "object", description: "Engineer mode only: Ed25519-signed attestation binding code-hash to output-hash, plus a per-account hash-chain entry." },
        _not_configured: { type: "boolean", description: "True when the call didn't run (unreachable daemon, disabled, or at concurrency limit)." },
        reason: { type: "string", description: "docker_daemon_unreachable | dockerode_import_failed | disabled | sandbox_busy (only when _not_configured=true)." },
        remediation: { type: "string", description: "How the operator (or, for sandbox_busy, the caller by retrying) should resolve the condition." },
      },
    },
    annotations: toolAnnotations("Code Sandbox", false, false),
    examples: [
      {
        name: "Run a Python one-liner",
        input: { language: "python", code: "print(sum(range(100)))" },
        output: '{"stdout":"4950\\n","stderr":"","exit_code":0,"timed_out":false,"duration_ms":1820,"image":"nikolaik/python-nodejs:python3.12-nodejs22-slim"}',
      },
      {
        name: "Run a Node script",
        input: { language: "node", code: "console.log(JSON.stringify({hello:'axis'}));" },
        output: '{"stdout":"{\\"hello\\":\\"axis\\"}\\n","stderr":"","exit_code":0,"timed_out":false,"duration_ms":1310,"image":"nikolaik/python-nodejs:python3.12-nodejs22-slim"}',
      },
      {
        name: "Bash with a hard timeout",
        input: { language: "bash", code: "sleep 60", timeout_seconds: 2 },
        output: '{"stdout":"","stderr":"","exit_code":137,"timed_out":true,"duration_ms":2080,"image":"nikolaik/python-nodejs:python3.12-nodejs22-slim"}',
      },
      {
        name: "Probe before Docker is wired",
        input: { language: "python", code: "print(1)" },
        output: '{"_not_configured":true,"reason":"docker_daemon_unreachable","detail":"...","remediation":"iliad_code_sandbox requires a reachable Docker daemon..."}',
      },
    ],
  },
  // ─── iliad_document_parsing (AXIS-owned PDF/DOCX/HTML/text → markdown) ─
  // Owned implementation: pdfjs-dist for PDFs, mammoth for DOCX,
  // pragmatic tag-strip for HTML, passthrough for markdown/text.
  // Both heavy parsers loaded via dynamic import so the API boot
  // stays fast and tests don't pay the load cost unless they
  // actually parse something. No third-party API, no per-page fee.
  // Empty PLANNED_CAPABILITIES after this lands — every advertised
  // tool serves a real implementation.
  {
    name: "iliad_document_parsing",
    description:
      "AXIS-owned document → Markdown extractor. Accepts either `document_url` (https fetch + 50 MiB cap + 60s timeout) or `document_base64` (inline bytes, 50 MiB decoded cap) — exactly one. Optional `mime_type` hint (application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document, text/html, text/markdown, text/plain); we sniff from magic bytes + URL extension when omitted. Format dispatch: PDF → pdfjs-dist text extraction (one block per page with `--- page N ---` separators); DOCX → mammoth → markdown (tables preserved); HTML → tag-strip with heading + list + entity handling (NOT a full HTML→MD converter — bring turndown if you need fancier); plain text + markdown → passthrough. Returns `{markdown, format_detected, byte_size, page_count, table_count, truncated}`. Output capped at 1 MiB markdown with a truncation marker. Pricing: $0.02 standard, $0.01 lite. Engineer mode (X-Agent-Mode: engineer — Document Intelligence, $0.10): adds an `engineer` block with retrieval chunks (heading-aware, overlapping) + extract-to-caller-schema (pass `json_schema` → a grammar-constrained, validated typed object) + image OCR (image/* via document_base64, capped at 10 MiB — smaller than the 50 MiB document cap; an OCR failure or oversized image returns a descriptive `reason` that may not match the standard-mode enum) — typed data, not just markdown. Requires Authorization: Bearer <api_key>.",
    inputSchema: {
      type: "object" as const,
      properties: {
        document_url: { type: "string", description: "https URL to a document. Use this OR document_base64, not both." },
        document_base64: { type: "string", description: "Base64-encoded document bytes. Use this OR document_url, not both." },
        mime_type: { type: "string", description: "Optional MIME-type hint. When omitted we sniff from magic bytes + URL extension. Engineer mode: an image/* mime triggers OCR." },
        json_schema: { type: "object", description: "Engineer mode: a JSON Schema. The document is extracted into a validated object matching it (returned in engineer.extracted)." },
      },
    },
    outputSchema: {
      type: "object" as const,
      properties: {
        markdown: { type: "string", description: "Extracted text, formatted as Markdown when the source had structure." },
        engineer: { type: "object", description: "Engineer mode only: { chunk_count, chunks, extracted? } — retrieval chunks + optional schema-validated extraction." },
        format_detected: { type: "string", description: "pdf | docx | html | markdown | text | unknown | image (engineer-mode OCR path only)." },
        byte_size: { type: "number", description: "Raw byte size of the source document." },
        page_count: { type: ["number", "null"] as unknown as string, description: "Page count for PDFs; null otherwise." },
        table_count: { type: "number", description: "Number of tables detected in the rendered markdown (DOCX only; 0 elsewhere)." },
        truncated: { type: "boolean", description: "True when the markdown output was capped at the 1 MiB ceiling." },
        _not_configured: { type: "boolean", description: "True when a prerequisite is missing or the document was unsupported." },
        reason: { type: "string", description: "document_download_failed | document_decode_failed | unsupported_format | parse_failed | pdf_runtime_missing | docx_runtime_missing (only when _not_configured=true)." },
        remediation: { type: "string", description: "Operator-actionable fix." },
      },
    },
    annotations: toolAnnotations("Document Parsing", true, true),
    examples: [
      {
        name: "Parse a PDF URL",
        input: { document_url: "https://example.com/whitepaper.pdf" },
        output: '{"markdown":"--- page 1 ---\\n\\nAXIS Iliad whitepaper. We turn any codebase into 99 deterministic AI-agent-ready artifacts...","format_detected":"pdf","byte_size":421334,"page_count":12,"table_count":0,"truncated":false}',
      },
      {
        name: "Parse an inline DOCX",
        input: { document_base64: "UEsDBBQA...", mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
        output: '{"markdown":"# Q3 Report\\n\\n| Metric | Value |\\n| --- | --- |\\n| MRR | $42k |","format_detected":"docx","byte_size":18432,"page_count":null,"table_count":1,"truncated":false}',
      },
      {
        name: "Parse HTML",
        input: { document_url: "https://example.com/article.html" },
        output: '{"markdown":"# Title\\n\\nFirst paragraph...","format_detected":"html","byte_size":4096,"page_count":null,"table_count":0,"truncated":false}',
      },
      {
        name: "Unsupported format → structured envelope",
        input: { document_base64: "<binary garbage>" },
        output: '{"_not_configured":true,"reason":"unsupported_format","detail":"Document is not recognized as PDF, DOCX, HTML, Markdown, or plain text","remediation":"Pass `mime_type` explicitly..."}',
      },
    ],
  },
  // ─── iliad_web_search (AXIS-owned BM25 search over cached corpus) ─
  // Honest scope: this is NOT a Google/Bing scraper. It's BM25
  // search over content YOUR AXIS instance has indexed. Agents
  // first call iliad_web_search with operation='index' (or
  // 'index' a batch of documents fetched via iliad_web_research),
  // then later operation='search' to retrieve. Persistent across
  // restarts via Postgres. Same account-scoped namespacing pattern
  // as iliad_vector_database / iliad_analytics.
  {
    name: "iliad_web_search",
    description:
      "AXIS-owned BM25 search engine over the corpus YOUR account has indexed. NOT a Google/Bing scraper — agents build their own searchable index by first calling operation='index' with documents (often pages fetched via iliad_web_research), then querying with operation='search'. Five operations: `index` (insert one or many documents), `search` (BM25 top-k ranked hits with snippet + score + metadata), `delete` (drop one doc), `delete_namespace` (drop all), `count`. Namespaces are account-scoped server-side (`acct:<id>:<namespace>`). Persistent across restarts via Postgres (the shared @axis/snapshots database). Search supports `max_results` (default 10, max 100) and `site` (restrict to a single URL host, case-insensitive). Only operation='search' is billed ($0.01 standard, free in lite mode) — index, delete, delete_namespace, and count are always free. Engineer mode (X-Agent-Mode: engineer — Answer Engine, $0.25): search also returns a grounded extractive answer with [n] citation spans over your corpus, reranked, refusing on weak evidence. Requires Authorization: Bearer <api_key>.",
    inputSchema: {
      type: "object" as const,
      required: ["operation"],
      properties: {
        operation: { type: "string", description: "index | search | delete | delete_namespace | count.", enum: ["index", "search", "delete", "delete_namespace", "count"] },
        namespace: { type: "string", description: "Logical isolation key. Defaults 'default'. Account id is always prepended server-side." },
        document: { type: "object", description: "Single document {doc_id, url?, title?, content, metadata?} — used in index mode (alternative to documents[])." },
        documents: { type: "array", description: "Batch of documents (max 100). Transactional — malformed entry aborts the whole call." },
        query: { type: "string", description: "Search query (1-1024 chars). Required in search mode." },
        max_results: { type: "number", description: "Cap on hits returned. Defaults 10, max 100." },
        site: { type: "string", description: "Filter to a single URL host (e.g. 'docs.python.org', case-insensitive)." },
        doc_id: { type: "string", description: "Document id to remove. Required in delete mode." },
      },
    },
    outputSchema: {
      type: "object" as const,
      properties: {
        operation: { type: "string", description: "Echo of the operation that ran." },
        namespace: { type: "string", description: "Scoped namespace the call touched." },
        indexed: { type: "number", description: "Documents written (index mode)." },
        total_in_namespace: { type: "number", description: "Documents currently in the namespace (index, search, count modes)." },
        query: { type: "string", description: "Echo of the search query (search mode)." },
        hits: { type: "array", description: "BM25-ranked hits [{doc_id, url, title, snippet, score, metadata}] (search mode)." },
        removed: { type: ["boolean", "number"] as unknown as string, description: "delete: boolean; delete_namespace: count of rows removed." },
        total: { type: "number", description: "Document count (count mode)." },
      },
    },
    annotations: toolAnnotations("Web Search (Owned Corpus)", false, false, true),
    examples: [
      {
        name: "Index a single document",
        input: { operation: "index", namespace: "docs", document: { doc_id: "intro", url: "https://example.com/intro", title: "Intro to AXIS", content: "AXIS is a deterministic codebase analyzer..." } },
        output: '{"operation":"index","namespace":"acct:<acc>:docs","indexed":1,"total_in_namespace":1}',
      },
      {
        name: "Batch index pages from iliad_web_research output",
        input: { operation: "index", namespace: "docs", documents: [{ doc_id: "p1", url: "https://example.com/a", content: "page A body..." }, { doc_id: "p2", url: "https://example.com/b", content: "page B body..." }] },
        output: '{"operation":"index","namespace":"acct:<acc>:docs","indexed":2,"total_in_namespace":2}',
      },
      {
        name: "Search the corpus",
        input: { operation: "search", namespace: "docs", query: "deterministic codebase analyzer", max_results: 3 },
        output: '{"operation":"search","namespace":"acct:<acc>:docs","query":"deterministic codebase analyzer","total_in_namespace":2,"hits":[{"doc_id":"intro","url":"https://example.com/intro","title":"Intro to AXIS","snippet":"…AXIS is a deterministic codebase analyzer…","score":2.34,"metadata":null}]}',
      },
      {
        name: "Search restricted to a domain",
        input: { operation: "search", namespace: "docs", query: "tutorial", site: "docs.python.org" },
        output: '{"operation":"search","namespace":"acct:<acc>:docs","query":"tutorial","total_in_namespace":2,"hits":[...]}',
      },
    ],
  },
  // ─── iliad_text_to_speech (AXIS-owned via Piper shell-out) ─────
  // Owned implementation: shell-out to the operator-installed
  // `piper` binary using a voice .onnx + .onnx.json pair from
  // AXIS_PIPER_VOICE_DIR. Synthesis writes a WAV tmpfile; if
  // format=mp3/opus, ffmpeg-static transcodes it. Output returned
  // inline as base64-encoded bytes (no R2 round-trip per call —
  // callers who want a URL can put the bytes through
  // iliad_object_storage themselves). _not_configured envelope
  // covers 6 distinct prerequisite-missing branches.
  {
    name: "iliad_text_to_speech",
    description:
      "AXIS-owned voice synthesis via Piper (rhasspy/piper) + ffmpeg-static. Accepts `text` (1-5000 chars), optional `voice` slug (filename without extension; defaults to AXIS_PIPER_DEFAULT_VOICE or the first available voice), optional `format` (wav | mp3 | opus; defaults wav), optional `sentence_silence` (0-5 seconds, default 0.2). Returns `{audio_base64, format, voice_used, sample_rate, duration_seconds, byte_size}`. Inference runs in-process — no upstream provider call — but this AXIS tool call is still billed: $0.02 standard, $0.01 lite. When operator hasn't installed piper or placed voice .onnx + .onnx.json files in AXIS_PIPER_VOICE_DIR (default models/piper/), returns `{_not_configured: true, reason, detail, remediation}` and is not billed. format=mp3/opus additionally requires ffmpeg-static. Engineer mode (X-Agent-Mode: engineer — Brand Voice, $0.10): requires `brand_text` (a brand / voice-and-tone artifact — the call throws without it in engineer mode) and AXIS auto-derives the voice persona (Piper voice slug + sentence pacing) and synthesizes in it; the persona is echoed in the response. Requires Authorization: Bearer <api_key>.",
    inputSchema: {
      type: "object" as const,
      required: ["text"],
      properties: {
        text: { type: "string", description: "Text to speak. 1-5000 chars after trim." },
        voice: { type: "string", description: "Voice slug (filename without extension, e.g. 'en_US-amy-medium'). Defaults to first available voice or AXIS_PIPER_DEFAULT_VOICE." },
        format: { type: "string", description: "Audio codec.", enum: ["wav", "mp3", "opus"] },
        sentence_silence: { type: "number", description: "Per-sentence silence in seconds (0-5). Defaults 0.2." },
        brand_text: { type: "string", description: "Required when X-Agent-Mode: engineer is set (the call throws without it); ignored otherwise. Brand / voice-and-tone artifact — AXIS derives a voice persona from it and synthesizes in that voice (overrides voice/sentence_silence)." },
        locale: { type: "string", description: "Engineer mode: persona locale override.", enum: ["us", "gb"] },
        gender: { type: "string", description: "Engineer mode: persona gender override.", enum: ["female", "male"] },
      },
    },
    outputSchema: {
      type: "object" as const,
      properties: {
        audio_base64: { type: "string", description: "Base64-encoded audio bytes in the requested format." },
        format: { type: "string", description: "Echo of the requested format." },
        voice_used: { type: "string", description: "Voice slug that was used (resolved if caller omitted `voice`)." },
        sample_rate: { type: "number", description: "WAV sample rate parsed from the RIFF header (typically 22050 for Piper)." },
        duration_seconds: { type: "number", description: "Audio duration in seconds, computed from the WAV header." },
        byte_size: { type: "number", description: "Byte length of the encoded audio (post-transcode for mp3/opus)." },
        persona: { type: "object", description: "Engineer mode only: the derived voice persona (voice slug, sentence_silence, locale, gender, tone_tags) used for this synthesis." },
        _not_configured: { type: "boolean", description: "True when a prerequisite is missing." },
        reason: { type: "string", description: "piper_cli_not_found | voice_dir_missing | no_voices_available | voice_model_not_found | voice_config_not_found | ffmpeg_static_missing | synthesis_failed (only when _not_configured=true)." },
        remediation: { type: "string", description: "Operator-actionable fix for the unconfigured prerequisite." },
      },
    },
    annotations: toolAnnotations("Text-to-Speech", false, true),
    examples: [
      {
        name: "Default-voice WAV synthesis",
        input: { text: "Welcome to AXIS Iliad." },
        output: '{"audio_base64":"UklGRl...","format":"wav","voice_used":"en_US-amy-medium","sample_rate":22050,"duration_seconds":1.74,"byte_size":76844}',
      },
      {
        name: "MP3 with explicit voice",
        input: { text: "Hello world.", voice: "en_GB-alan-low", format: "mp3" },
        output: '{"audio_base64":"SUQzAw...","format":"mp3","voice_used":"en_GB-alan-low","sample_rate":22050,"duration_seconds":1.10,"byte_size":12480}',
      },
      {
        name: "Probe before any voice is placed",
        input: { text: "anything" },
        output: '{"_not_configured":true,"reason":"no_voices_available","detail":"/srv/axis/models/piper contains no paired .onnx + .onnx.json voice files","remediation":"Download a Piper voice from https://huggingface.co/rhasspy/piper-voices..."}',
      },
    ],
  },
  // ─── iliad_speech_to_text (AXIS-owned via whisper.cpp shell-out) ─
  // Owned implementation: agent passes audio (URL or base64), we
  // download/decode → ffmpeg-static resamples to 16kHz mono WAV →
  // whisper-cli emits JSON sidecar with timestamped segments →
  // we parse + return. No third-party API, no per-minute provider
  // fee. Operator installs whisper.cpp once + places a GGML model
  // file; everything else is AXIS-owned. Graceful _not_configured
  // envelope covers all four prerequisite-missing branches
  // (model_file_not_found, whisper_cli_not_found, ffmpeg_static_missing,
  // audio_download_failed / audio_decode_failed).
  {
    name: "iliad_speech_to_text",
    description:
      "AXIS-owned audio transcription via whisper.cpp + ffmpeg-static. Accepts either `audio_url` (https URL we fetch, max 100 MiB, 60s download timeout) or `audio_base64` (inline bytes, max 100 MiB decoded) — exactly one. Accepts any audio format ffmpeg can decode (mp3, wav, m4a, opus, ogg, flac); we resample to 16 kHz mono WAV internally. Optional `language` (ISO-639-1 like \"en\" / \"fr\" / \"ja\", or \"auto\" — default). Optional `initial_prompt` (≤512 chars; biases spelling of rare names). Optional `word_timestamps` boolean. Returns `{text, segments: [{start, end, text}], language_detected, duration_seconds, model_used}`. Pricing: $0.03 standard, $0.01 lite. When operator hasn't installed whisper-cli or placed the GGML model file at AXIS_WHISPER_MODEL_PATH (default `models/ggml-base.en.bin`), returns `{_not_configured: true, reason, detail, remediation}` and is not billed. Engineer mode (X-Agent-Mode: engineer — Diarization, $0.10): the response adds `diarization` — speaker turns grouped from the segments by inter-segment pause gaps (tune with diarization_gap_seconds / max_speakers; this is pause-based turn segmentation, not acoustic speaker ID). Requires Authorization: Bearer <api_key>.",
    inputSchema: {
      type: "object" as const,
      properties: {
        audio_url: { type: "string", description: "https URL to an audio file. Use this OR audio_base64, not both." },
        audio_base64: { type: "string", description: "Base64-encoded audio bytes. Use this OR audio_url, not both." },
        language: { type: "string", description: "ISO-639-1 language code (en, fr, ja, ...) or 'auto' to autodetect. Defaults 'auto'." },
        initial_prompt: { type: "string", description: "Optional bias prompt (≤512 chars) — useful for spelling of rare names." },
        word_timestamps: { type: "boolean", description: "Emit word-level timestamps within segments. Defaults false." },
        diarization_gap_seconds: { type: "number", description: "Engineer mode: pause (seconds) between segments that starts a new speaker turn. Defaults 0.75." },
        max_speakers: { type: "number", description: "Engineer mode: max alternating speaker labels. Defaults 2." },
      },
    },
    outputSchema: {
      type: "object" as const,
      properties: {
        text: { type: "string", description: "Full transcript text, joined from segments." },
        segments: { type: "array", description: "[{start: seconds, end: seconds, text}] timestamped segments." },
        language_detected: { type: "string", description: "Language code whisper detected (or echoed from input language)." },
        duration_seconds: { type: "number", description: "Audio duration as inferred from the last segment end timestamp." },
        model_used: { type: "string", description: "Basename of the GGML model file used." },
        diarization: { type: "array", description: "Engineer mode only: speaker turns [{speaker, start, end, text}] grouped from segments by inter-segment pause gaps." },
        _not_configured: { type: "boolean", description: "True when a prerequisite is missing." },
        reason: { type: "string", description: "model_file_not_found | whisper_cli_not_found | ffmpeg_static_missing | audio_download_failed | audio_decode_failed (only when _not_configured=true)." },
        remediation: { type: "string", description: "Operator-actionable fix for the unconfigured prerequisite." },
      },
    },
    annotations: toolAnnotations("Speech-to-Text", false, true),
    examples: [
      {
        name: "Transcribe a URL",
        input: { audio_url: "https://example.com/podcast-clip.mp3" },
        output: '{"text":"Welcome to the show...","segments":[{"start":0,"end":2.4,"text":"Welcome to the show..."}],"language_detected":"en","duration_seconds":12.6,"model_used":"ggml-base.en.bin"}',
      },
      {
        name: "Transcribe inline audio with language hint",
        input: { audio_base64: "<base64-mp3>", language: "fr" },
        output: '{"text":"Bonjour le monde...","segments":[...],"language_detected":"fr","duration_seconds":3.1,"model_used":"ggml-base.en.bin"}',
      },
      {
        name: "Probe before model is placed",
        input: { audio_url: "https://x.com/a.mp3" },
        output: '{"_not_configured":true,"reason":"model_file_not_found","detail":"No GGML model at /srv/axis/models/ggml-base.en.bin","remediation":"Operator must download a GGML whisper model..."}',
      },
    ],
  },
  // ─── iliad_analytics (AXIS-owned, Postgres-backed events + aggregations) ─
  // Third member of the owned tier. Capture is one or many events;
  // query is one of four aggregation kinds (count, count_by_event,
  // distinct_users, count_by_bucket). Namespaces are account-scoped
  // server-side. Same upgrade path as vector-db: when scan volume
  // justifies a columnar engine we swap in DuckDB/ClickHouse without
  // changing this schema.
  {
    name: "iliad_analytics",
    description:
      "AXIS-owned product analytics. Two operations: `capture` (insert events) and `query` (aggregations). Capture accepts a single `event` or a batch via `events[]` (max 500). Query kinds: `count` (total events), `count_by_event` (top events by frequency), `distinct_users` (unique user_id count), `count_by_bucket` (time-series with minute/hour/day buckets). All queries support optional `event`, `from_ts`, `to_ts`, and `property_filter` filters. Namespaces are account-scoped server-side (`acct:<account_id>:<namespace>`). Persistent across restarts via Postgres (the shared @axis/snapshots database). Pricing: $0.01 standard, free in lite mode. Requires Authorization: Bearer <api_key>. Best for funnels, cohorts, and retention on workloads up to ~1M events per account.",
    inputSchema: {
      type: "object" as const,
      required: ["operation"],
      properties: {
        operation: { type: "string", description: "capture or query.", enum: ["capture", "query"] },
        namespace: { type: "string", description: "Logical isolation key. Defaults to 'default'. Account id is always prepended server-side." },
        event: { type: "object", description: "Single event payload {event, user_id?, properties?, timestamp?} — used in capture mode." },
        events: { type: "array", description: "Batch of event payloads (max 500). Transactional — partial inserts never persist." },
        query: { type: "object", description: "{kind, event?, from_ts?, to_ts?, property_filter?, bucket?, limit?} — used in query mode." },
      },
    },
    outputSchema: {
      type: "object" as const,
      properties: {
        operation: { type: "string", description: "Echo of the operation that ran." },
        namespace: { type: "string", description: "Scoped namespace the call wrote to or queried." },
        captured: { type: "number", description: "Events written (capture mode only)." },
        result: { type: "object", description: "Aggregation result shape depending on query.kind (query mode only)." },
      },
    },
    annotations: toolAnnotations("Product Analytics", false, false),
    examples: [
      {
        name: "Capture a single event",
        input: { operation: "capture", namespace: "web", event: { event: "purchase", user_id: "u_42", properties: { plan: "pro", amount_cents: 5000 } } },
        output: '{"operation":"capture","namespace":"acct:<acc>:web","captured":1}',
      },
      {
        name: "Capture a batch",
        input: { operation: "capture", namespace: "web", events: [{ event: "pageview", user_id: "u_1" }, { event: "pageview", user_id: "u_2" }] },
        output: '{"operation":"capture","namespace":"acct:<acc>:web","captured":2}',
      },
      {
        name: "Top events by frequency",
        input: { operation: "query", namespace: "web", query: { kind: "count_by_event", limit: 5 } },
        output: '{"operation":"query","namespace":"acct:<acc>:web","result":{"kind":"count_by_event","rows":[{"event":"pageview","count":1240},{"event":"click","count":312}]}}',
      },
      {
        name: "Daily active users in a window",
        input: { operation: "query", namespace: "web", query: { kind: "distinct_users", from_ts: 1717200000000, to_ts: 1717286400000 } },
        output: '{"operation":"query","namespace":"acct:<acc>:web","result":{"kind":"distinct_users","distinct_users":87}}',
      },
    ],
  },
  // ─── Planned-capability stubs (0 tools) ─────────────────────────
  // Discovery-only entries derived from PLANNED_CAPABILITIES. Agents
  // see the full iliad_* surface immediately. tools/call on any of
  // these returns a structured `_planned: true` envelope until the
  // AXIS-owned implementation ships.
  ...PLANNED_CAPABILITIES.map((c) => ({
    name: c.name,
    description:
      `${c.summary} Status: **${c.status}** — AXIS-owned implementation on the roadmap (see .ai/capability-map.yaml). ` +
      `Calls return a planned-capability envelope pointing at ${c.recommended_provider.name} (${c.recommended_provider.url}) as the recommended interim provider. ` +
      `When the AXIS-owned version ships, the dispatch handler swaps in without changing this schema.`,
    inputSchema: {
      type: "object" as const,
      required: c.required_inputs,
      properties: c.input_properties,
    },
    outputSchema: {
      type: "object" as const,
      properties: {
        _planned: { type: "boolean", description: "Always true while this tool is in development." },
        capability_id: { type: "string", description: "Capability slug matching capability-map.yaml." },
        status: { type: "string", description: "planned_proxy or planned_owned." },
        message: { type: "string", description: "Human-readable status note." },
        recommended_provider: { type: "object", description: "Third-party provider to call directly today." },
        // Once the AXIS-owned implementation lands, these fields take over:
        ...c.output_properties,
      },
      required: ["_planned"],
    },
    annotations: toolAnnotations(c.title, false, c.status === "planned_owned"),
    examples: [
      {
        name: `Probe ${c.title}`,
        input: Object.fromEntries(c.required_inputs.map((k) => [k, `<${k}>`])),
        output: `{"_planned":true,"capability_id":"${c.capability_id}","status":"${c.status}","recommended_provider":${JSON.stringify(c.recommended_provider)}}`,
      },
    ],
  })),
  {
    name: "iliad_hygiene",
    description:
      "AXIS-owned workspace hygiene grader. Analyzes an inline file set [{path,content}] and returns a letter grade (A-F) across a closed set of dimensions plus structured findings. Two modes: mode='scan' (DEFAULT, FREE) returns grade + findings (committed-secret scan, .env/secret-file detection, .gitignore gaps for build/scratch artifacts, oversized blobs, stub/placeholder markers, byte-identical duplicate files, source test-peer coverage, TODO/FIXME debt); mode='fix' (METERED, $0.05 standard / $0.02 lite) adds a prioritized remediation plan with ready-to-apply .gitignore additions and per-finding actions. Sending X-Agent-Mode: engineer always bills the fix-mode price, even if mode is 'scan' or omitted. Deterministic, dependency-free, never mutates your repo (fix returns a PLAN). Rules needing a live git checkout/toolchain (worktree pruning, build/vet, governance-source-of-truth checks, route-registration dup-handler analysis, ROI-queue coherence) are reported as repo_only_rules, not run. Engineer mode (X-Agent-Mode: engineer — Security Engineer, $5): the fix arrives as a git-applyable unified-diff patch (`patch`) + a SARIF 2.1.0 log for CI code-scanning (`sarif`). Requires Authorization: Bearer <api_key>.",
    inputSchema: {
      type: "object" as const,
      required: ["files"],
      properties: {
        files: { type: "array", description: "Inline files [{path, content}] to scan (non-empty; each content <= 5 MB)." },
        mode: { type: "string", description: "scan (free grade+findings, default) | fix (metered, adds remediation plan).", enum: ["scan", "fix"] },
        config: { type: "object", description: "Optional threshold overrides: maxFileBytes, coverageA, coverageB, coverageC, todoDebtThreshold." },
      },
    },
    outputSchema: {
      type: "object" as const,
      properties: {
        mode: { type: "string", description: "Echo of the mode that ran." },
        grade: { type: "string", description: "Overall hygiene grade A-F (minimum across dimensions)." },
        reasons: { type: "array", description: "Dimensions that capped the grade below A." },
        dimensions: { type: "array", description: "Per-dimension grade [{id, grade, detail}]." },
        counts: { type: "object", description: "{high, medium, low, deferredByPolicy} open-finding counts." },
        findings: { type: "array", description: "All findings [{id, ruleId, severity, path, message, policy, recommendedAction}]." },
        remediation_plan: { type: "object", description: "fix mode only: {ordered_steps, gitignore_additions, summary}." },
        scanned: { type: "object", description: "{files, bytes} actually analyzed." },
        paid_fix_hint: { type: "string", description: "scan mode only: how to obtain the metered remediation plan." },
        repo_only_rules: { type: "array", description: "Rules that need a live repo and were not run." },
        patch: { type: "string", description: "Engineer mode only: git-apply-able unified diff of the safe auto-fixes (currently .gitignore additions only); empty string when nothing is safely auto-fixable." },
        sarif: { type: "object", description: "Engineer mode only: SARIF 2.1.0 log of all open findings for CI code-scanning." },
      },
    },
    annotations: toolAnnotations("Workspace Hygiene", true, true),
    examples: [
      {
        name: "Free scan of a small file set",
        input: { files: [{ path: "src/app.ts", content: "// TODO: implement\nexport const x = 1;" }, { path: ".gitignore", content: "node_modules/\n" }] },
        output: '{"mode":"scan","grade":"B","dimensions":[],"counts":{"high":0,"medium":0,"low":1,"deferredByPolicy":0},"findings":[]}',
      },
      {
        name: "Paid fix plan for a committed secret",
        input: { mode: "fix", files: [{ path: ".env", content: "STRIPE_KEY=sk_live_0123456789abcdefghij" }] },
        output: '{"mode":"fix","grade":"F","remediation_plan":{"ordered_steps":[],"gitignore_additions":[".env"],"summary":"..."}}',
      },
    ],
  },
  // ─── Commerce engines as tools (WO-13) ──────────────────────────
  // The compliance kit's decision engines, exposed as callable capabilities
  // instead of generated documents. All five are FREE, no-auth, read-only,
  // and deterministic — pure functions over the caller's inputs (no snapshot,
  // no charge, no side effects). Each response carries a sha256 reproducibility
  // proof over canonical inputs+outputs so identical calls are verifiably
  // identical decisions.
  {
    name: "sca_exemption_decision",
    description:
      "Decide the lighter-SCA path for a single transaction using AXIS's published 7-priority PSD2 exemption matrix (the same decideScaExemption engine that renders the SCA Exemption Decision Matrix in generated artifacts). Input: amount_eur (required, PSD2 thresholds are EUR-denominated — convert before calling) plus optional context flags (secure corporate program, MIT, fixed recurring + prior SCA, trusted beneficiary + prior SCA, one-leg-out, acquirer TRA fraud rate in basis points). Returns the chosen exemption, its priority, sca_required, rationale, fallback path, all applicable candidates, the rendered priority matrix, and a sha256 reproducibility proof. Free, no auth, deterministic, no side effects. HONESTY: decision-support only, NOT an authorization oracle — final exemption eligibility is decided by the acquirer/issuer; TRA caps use published EBA RTS Art. 15 bands, not your acquirer's live fraud rate.",
    inputSchema: {
      type: "object" as const,
      required: ["amount_eur"],
      properties: {
        amount_eur: { type: "number", description: "Transaction amount in EUR (PSD2 thresholds are EUR-denominated)." },
        is_secure_corporate: { type: "boolean", description: "Dedicated/lodged corporate card program (RTS Art. 16)." },
        is_merchant_initiated: { type: "boolean", description: "MIT with stored credential + original SCA reference (out of SCA scope)." },
        is_recurring_fixed: { type: "boolean", description: "Fixed-amount subsequent collection (RTS Art. 13). Requires has_prior_sca." },
        is_trusted_beneficiary: { type: "boolean", description: "Merchant on the cardholder's trusted list (RTS Art. 12). Requires has_prior_sca." },
        is_one_leg_out: { type: "boolean", description: "Payer or payee outside the EEA (territorial scope, not a formal exemption)." },
        has_prior_sca: { type: "boolean", description: "A prior SCA exists — gates recurring_fixed and trusted_beneficiary." },
        tra_acquirer_fraud_bps: { type: "number", description: "Acquirer reference fraud rate in basis points (EBA RTS Art. 15 bands: <=1 → €500 cap, <=6 → €250, <=13 → €100)." },
      },
    },
    outputSchema: {
      type: "object" as const,
      required: ["decision", "matrix", "caveat", "proof"],
      properties: {
        decision: { type: "object", description: "{exemption, priority, sca_required, rationale, fallback, candidates, tra_cap_eur?}." },
        matrix: { type: "string", description: "The rendered 7-priority SCA Exemption Decision Matrix (markdown) this decision was taken from." },
        caveat: { type: "string", description: "Decision-support-only honesty caveat." },
        proof: { type: "object", description: "{algo:'sha256', digest, over[]} — reproducibility proof over canonical input+decision." },
      },
    },
    annotations: toolAnnotations("SCA Exemption Decision", true, true),
    examples: [
      {
        name: "Low-value exemption",
        input: { amount_eur: 20 },
        output: '{"decision":{"exemption":"low_value","priority":1,"sca_required":false,"fallback":"3ds2_challenge","candidates":["low_value"]},"proof":{"algo":"sha256","digest":"..."}}',
      },
      {
        name: "No lighter path → 3DS2 challenge",
        input: { amount_eur: 1000 },
        output: '{"decision":{"exemption":"3ds2_challenge","priority":8,"sca_required":true,"candidates":[]},"proof":{"algo":"sha256","digest":"..."}}',
      },
    ],
  },
  {
    name: "grade_compliance",
    description:
      "Run the real 8-check AP2/Visa compliance grading engine (gradeCompliance — the same engine behind computeComplianceGrade and the commerce registry's verified_decisions block) over an inline file set. Each of the 8 validators (SCA/3DS2 readiness, AP2 mandate validity, tokenization posture, CE 3.0 readiness, dispute rail wiring, idempotency/receipt hygiene, budget negotiation, refund/cancel path) is a multi-signal check with weight, evidence trail, and remediation. Returns grade A-D, score, checks_passed/8, the full checks[] detail, detected commerce signals, and a sha256 reproducibility proof. Free, no auth, deterministic, no snapshot persisted. Hard caps: 25 files / 50KB per file / 1MB total. HONESTY: deterministic static source-signal analysis — a checklist starting point, NOT a certification, audit, PCI assessment, or card-network certification.",
    inputSchema: {
      type: "object" as const,
      required: ["files"],
      properties: {
        files: {
          type: "array",
          description: "Source files to grade (max 25 files, 50KB each, 1MB total)",
          items: {
            type: "object",
            required: ["path", "content"],
            properties: {
              path: { type: "string" },
              content: { type: "string" },
            },
          },
        },
      },
    },
    outputSchema: {
      type: "object" as const,
      required: ["grade", "score", "checks_passed", "checks_total", "checks", "methodology", "signals", "proof"],
      properties: {
        grade: { type: "string", description: "A | B | C | D (score >= 85 / 65 / 40 / below)." },
        score: { type: "number", description: "Weighted 0-100 score across the 8 checks." },
        checks_passed: { type: "number" },
        checks_total: { type: "number", description: "Always 8." },
        checks: { type: "array", description: "Per-check {name, title, status, weight, score, evidence[], remediation}." },
        methodology: { type: "string", description: "The engine's own honesty statement (static analysis, not a certification)." },
        signals: { type: "object", description: "detectCommerceSignals(files) — providers + capability booleans the grade was derived from." },
        proof: { type: "object", description: "{algo:'sha256', digest, over[]} reproducibility proof." },
      },
    },
    annotations: toolAnnotations("Grade Compliance (8-Check)", true, true),
    examples: [
      {
        name: "Grade a payment-enabled repo",
        input: { files: [{ path: "src/checkout.ts", content: "stripe 3ds2 exemption mandate_id max_amount network_token dispute webhook submit_evidence idempotency_key receipt refund cancel" }] },
        output: '{"grade":"A","score":92,"checks_passed":7,"checks_total":8,"checks":[...],"proof":{"algo":"sha256","digest":"..."}}',
      },
    ],
  },
  {
    name: "assemble_ce3_evidence",
    description:
      "Assemble a Visa Compelling Evidence 3.0 packet + eligibility verdict for a disputed card-absent-fraud (reason code 10.4) transaction using the real assembleCe3 engine: finds prior undisputed transactions in the caller-supplied history that share >=2 qualified data elements (device_id / ip_address / email / shipping_address / login_id) and fall 120-365 days before the disputed transaction, per CE 3.0 rules. Returns {eligible, qualifying_priors, matched_element_union, rejection_reason?, evidence_packet, caveat} plus a sha256 reproducibility proof. Free, no auth, deterministic, no side effects. HONESTY: CE 3.0 applies to reason code 10.4 ONLY (10.2/10.3 are card-present conditions), and this is ASSEMBLY ONLY — not a submission to VROL/Verifi (use assemble_representment for the Stripe representment path). AXIS does not publish win-rate estimates.",
    inputSchema: {
      type: "object" as const,
      required: ["dispute"],
      properties: {
        dispute: {
          type: "object",
          description: "{txn: {id, amount_minor, currency, created_at, disputed, device_id?, ip_address?, email?, shipping_address?, login_id?}, reason_code: string (CE 3.0 requires '10.4'), disputed_at: ISO timestamp}",
        },
        transaction_history: {
          type: "array",
          description: "Candidate prior transactions (same Txn shape, max 500). Undisputed priors sharing >=2 qualified elements qualify.",
        },
      },
    },
    outputSchema: {
      type: "object" as const,
      required: ["eligible", "reason_code", "qualifying_priors", "matched_element_union", "evidence_packet", "caveat", "proof"],
      properties: {
        eligible: { type: "boolean", description: "True when >=2 qualifying priors were found under the CE 3.0 rules." },
        reason_code: { type: "string", description: "Always '10.4' — the only CE 3.0 reason code." },
        qualifying_priors: { type: "array", description: "[{txn_id, matched_elements[], age_days}] most-matching first, deterministic order." },
        matched_element_union: { type: "array", description: "Union of matched qualified data elements across priors, canonical order." },
        rejection_reason: { type: "string", description: "Present iff eligible=false — why the packet did not qualify." },
        evidence_packet: { type: "object", description: "The structured, submission-ready CE 3.0 packet (assembly only)." },
        caveat: { type: "string", description: "'assembly only; not a submission to VROL/Verifi'." },
        proof: { type: "object", description: "{algo:'sha256', digest, over[]} reproducibility proof." },
      },
    },
    annotations: toolAnnotations("Assemble CE 3.0 Evidence", true, true),
    examples: [
      {
        name: "Qualify two priors for a 10.4 dispute",
        input: { dispute: { txn: { id: "t9", amount_minor: 5000, currency: "usd", created_at: "2026-06-01T00:00:00Z", disputed: true, email: "a@b.com", device_id: "d1" }, reason_code: "10.4", disputed_at: "2026-06-10T00:00:00Z" }, transaction_history: [{ id: "t1", amount_minor: 900, currency: "usd", created_at: "2025-10-01T00:00:00Z", disputed: false, email: "a@b.com", device_id: "d1" }, { id: "t2", amount_minor: 700, currency: "usd", created_at: "2025-12-01T00:00:00Z", disputed: false, email: "a@b.com", device_id: "d1" }] },
        output: '{"eligible":true,"reason_code":"10.4","qualifying_priors":[{"txn_id":"t1","matched_elements":["device_id","email"],"age_days":243},{"txn_id":"t2","matched_elements":["device_id","email"],"age_days":182}],"caveat":"assembly only; not a submission to VROL/Verifi","proof":{"algo":"sha256","digest":"..."}}',
      },
    ],
  },
  {
    name: "build_ap2_mandate",
    description:
      "Validate, canonically encode, and optionally Ed25519-sign an AP2 mandate (Intent / Cart / Payment) using the real @axis/ap2 codecs — schema validation (including cart-total arithmetic and intent cross-references), RFC 8785 JCS-style canonical JSON encoding, and detached-JWS EdDSA signing over node:crypto. Pass seed_hex (64 hex chars = 32 bytes) to sign deterministically client-side-supplied key material — AXIS stores no keys; omit it for an unsigned template with encoding only. The signed envelope round-trips through verifyMandate before it is returned. Free, no auth, deterministic (Ed25519 signatures are deterministic per RFC 8032), no side effects. SCOPE HONESTY: conformant to AXIS's TypeScript encoding of the public AP2 mandate schema, verified against self-authored golden vectors — NOT certified against an official AP2 conformance suite or a live network counterparty.",
    inputSchema: {
      type: "object" as const,
      required: ["mandate"],
      properties: {
        mandate: {
          type: "object",
          description: "An AP2 mandate object: {kind: 'intent'|'cart'|'payment', version: 'ap2/1', id, created_at, ...kind-specific fields (intent: user_id/description/constraints.max_amount/expires_at; cart: intent_ref/merchant_id/items[]/total; payment: cart_ref/method/amount)}.",
        },
        seed_hex: { type: "string", description: "Optional 64-char hex (32-byte) Ed25519 seed to sign with. Caller-supplied key material — AXIS stores no keys. Omit for an unsigned template." },
        intent_context: { type: "object", description: "Optional IntentMandate to cross-reference a cart's intent_ref against." },
      },
    },
    outputSchema: {
      type: "object" as const,
      required: ["valid", "issues", "encoded", "note", "proof"],
      properties: {
        valid: { type: "boolean", description: "Structural validation verdict (validateMandate)." },
        issues: { type: "array", description: "[{path, message}] validation issues (empty when valid)." },
        mandate: { type: "object", description: "Echo of the validated mandate." },
        encoded: { type: "string", description: "Canonical (JCS-style) JSON wire encoding — null when invalid." },
        signed: { type: "object", description: "When seed_hex supplied: {jws: {protected, signature}, public_key} — a SignedMandate envelope, verified before return." },
        verified: { type: "boolean", description: "verifyMandate result for the signed envelope (null when unsigned)." },
        note: { type: "string", description: "Signed vs 'unsigned template — sign client-side' + trust-model caveat." },
        proof: { type: "object", description: "{algo:'sha256', digest, over[]} reproducibility proof." },
      },
    },
    annotations: toolAnnotations("Build AP2 Mandate", true, true),
    examples: [
      {
        name: "Unsigned intent-mandate template",
        input: { mandate: { kind: "intent", version: "ap2/1", id: "intent_1", user_id: "agent_1", description: "buy analysis", constraints: { max_amount: { currency: "USD", value: "5.00" } }, created_at: "2026-07-01T00:00:00Z", expires_at: "2026-08-01T00:00:00Z" } },
        output: '{"valid":true,"issues":[],"encoded":"{\\"constraints\\":...}","signed":null,"verified":null,"note":"unsigned template — sign client-side...","proof":{"algo":"sha256","digest":"..."}}',
      },
    ],
  },
  {
    name: "score_dispute_readiness",
    description:
      "Score how ready a disputed transaction's EVIDENCE FILE is for representment, per Visa reason-code family, using the transparent scoreWinProbability heuristic (win-prob-v0: hand-set, documented logistic coefficients — exported, inspectable, monotonic in evidence). Input: reason_code + the evidence on file (CE 3.0 eligibility, matching data elements, prior undisputed transactions, delivery proof, AVS/CVV, 3DS, signed mandate, customer communication). Returns the heuristic score, band, top missing evidence (what to capture next), recommended action, rationale, model version, and a sha256 reproducibility proof. Free, no auth, deterministic. HONESTY (read this): this scores evidence-capture readiness and is NOT a dispute-win prediction — the v0 heuristic is NOT empirically calibrated against real network outcomes, is NOT a Visa-published or Visa-endorsed win rate, and AXIS does not publish win-rate estimates. Treat it as a prioritization signal for evidence gathering only; always follow your operator's dispute policy.",
    inputSchema: {
      type: "object" as const,
      required: ["reason_code"],
      properties: {
        reason_code: { type: "string", description: "Visa dispute reason code (e.g. '10.4', '13.1', '12.5'). Unknown codes fall back to a documented default family." },
        evidence: {
          type: "object",
          description: "Evidence on file: {ce3Eligible?, matchingDataElements? (0-5), priorUndisputedTransactions? (0-10), hasDeliveryProof?, hasAvsMatch?, hasCvvMatch?, has3dsAuthenticated?, hasSignedMandate?, hasCustomerCommunication?}. Omitted fields default to false/0.",
        },
      },
    },
    outputSchema: {
      type: "object" as const,
      required: ["readiness", "disclaimer", "proof"],
      properties: {
        readiness: { type: "object", description: "{reasonCode, readiness_score (0-1 heuristic score), band, topMissingEvidence[], recommendedAction, rationale[], modelVersion}." },
        disclaimer: { type: "string", description: "The NOT-a-win-prediction honesty disclaimer (always present)." },
        proof: { type: "object", description: "{algo:'sha256', digest, over[]} reproducibility proof." },
      },
    },
    annotations: toolAnnotations("Score Dispute Evidence Readiness", true, true),
    examples: [
      {
        name: "10.4 with CE 3.0 + 3DS on file",
        input: { reason_code: "10.4", evidence: { ce3Eligible: true, matchingDataElements: 3, has3dsAuthenticated: true } },
        output: '{"readiness":{"reasonCode":"10.4","band":"high","recommendedAction":"represent","modelVersion":"win-prob-v0"},"disclaimer":"Scores evidence-capture readiness... NOT a dispute-win prediction...","proof":{"algo":"sha256","digest":"..."}}',
      },
    ],
  },
  // ─── assemble_representment (WO-08 — metered) ────────────────────
  {
    name: "assemble_representment",
    description:
      "Turn a webhook-ingested dispute (charge.dispute.* events persist DisputeRecords server-side) into a Stripe representment: qualifies CE 3.0 priors from your supplied transaction history (assembleCe3), builds the Stripe `evidence` hash (buildStripeRepresentment), walks the dispute state machine (needs_response → evidence_assembling → evidence_submitted) with a full transition ledger, and — when submit=true and Stripe is configured — submits the evidence through the live Stripe disputes API. Requires Authorization: Bearer <api_key>; metered ($0.50 standard, $0.25 lite) through the standard authorize/capture path — a failed assembly never charges. Returns {dispute, evidence, ce3, ce3_eligible, submitted, disclaimer}. HONESTY: the dispute lifecycle is LIVE on the Stripe rail only; VROL/RDR/CDRN (Verifi/Ethoca) is integration-ready code gated on acquirer provisioning (AXIS_ENABLE_VROL) and never fakes a submission. AXIS does not publish win-rate estimates.",
    inputSchema: {
      type: "object" as const,
      required: ["dispute_id"],
      properties: {
        dispute_id: { type: "string", description: "Provider dispute id (Stripe dp_...) previously ingested by the charge.dispute.created webhook." },
        disputed_txn: { type: "object", description: "Optional CE 3.0 data elements of the disputed transaction: {device_id?, ip_address?, email?, shipping_address?, login_id?}." },
        transaction_history: { type: "array", description: "Candidate prior transactions for CE 3.0 qualification (Txn shape, max 500)." },
        evidence_inputs: { type: "object", description: "{customerEmail?, shippingAddress?, billingAddress?, serviceDate?, productDescription?, deliveryTracking?, threeDsAuthenticated?} — merchant-supplied evidence fields." },
        submit: { type: "boolean", description: "true → submit the built evidence to the Stripe disputes API (requires STRIPE_SECRET_KEY server-side). Default false (assemble only)." },
      },
    },
    outputSchema: {
      type: "object" as const,
      required: ["dispute", "evidence", "ce3", "ce3_eligible", "submitted", "disclaimer"],
      properties: {
        dispute: { type: "object", description: "The DisputeRecord after state-machine bookkeeping (state, dueBy, representmentId, ...)." },
        evidence: { type: "object", description: "Stripe `evidence` hash: uncategorized_text (CE 3.0 narrative) + customer_email_address/shipping_address/... from evidence_inputs." },
        ce3: { type: "object", description: "Full assembleCe3 result (eligible, qualifying_priors, evidence_packet, caveat)." },
        ce3_eligible: { type: "boolean" },
        submitted: { type: "boolean", description: "True only when the evidence was actually submitted through the dispute client." },
        submit_note: { type: "string", description: "Present when submit was requested but skipped (e.g. Stripe not configured)." },
        disclaimer: { type: "string", description: "Stripe-rail-live / VROL-gated honesty split + no-win-rate stance." },
      },
    },
    annotations: toolAnnotations("Assemble Representment", false, false),
    examples: [
      {
        name: "Assemble (no submit) with CE 3.0 history",
        input: { dispute_id: "dp_123", disputed_txn: { email: "a@b.com", device_id: "d1" }, transaction_history: [{ id: "t1", amount_minor: 900, currency: "usd", created_at: "2025-10-01T00:00:00Z", disputed: false, email: "a@b.com", device_id: "d1" }], evidence_inputs: { customerEmail: "a@b.com", productDescription: "Pro plan" } },
        output: '{"dispute":{"id":"dp_123","state":"evidence_assembling"},"evidence":{"uncategorized_text":"Compelling Evidence 3.0...","customer_email_address":"a@b.com"},"ce3_eligible":false,"submitted":false,"disclaimer":"..."}',
      },
    ],
  },
  // ─── iliad_network_tokenization (WO-14 — owned capability, free) ─
  // `lifecycle` (executable state machine) and `capabilities` (config
  // probe) are live. `read`/`provision` are DISABLED as of H-Phase-A
  // cycle 10 — see the SECURITY comment on runNetworkTokenization
  // (mcp-tool-impls.ts): both resolved a caller-supplied id against the
  // platform's own Stripe key with no check it belongs to the calling
  // account, letting any authenticated caller read or provision against
  // another party's payment method. Re-enable only once a real
  // account<->payment-method ownership check exists.
  {
    name: "iliad_network_tokenization",
    description:
      "Network-tokenization capability. (1) `lifecycle`: an EXECUTABLE TAP-style token-lifecycle state machine (provision → activate → suspend → resume → delete; deleted is terminal; illegal transitions are rejected with an error, not silently accepted) — pure simulation, no real payment method involved. (2) `capabilities` reports which providers are configured (env-derived). (3) `read` and (4) `provision` are TEMPORARILY DISABLED: both would resolve a caller-supplied payment_method_id/pan_source against the platform's Stripe account, and this service has no way yet to verify that id belongs to the calling AXIS account — calling either always returns a structured `_not_configured: true` envelope explaining this, never real payment-method data. (For context once re-enabled: `read`'s underlying Stripe adapter is fully implemented; direct VTS/MDES `provision` is additionally capability-gated behind a network-issued Token Requestor ID — AXIS_VTS_TOKEN_REQUESTOR_ID / AXIS_MDES_TOKEN_REQUESTOR_ID — plus network onboarding, and NEVER fakes a token.) Raw PANs are never accepted even when disabled (pan_source is documented as an opaque reference only). Free (unmetered); requires Authorization: Bearer <api_key>.",
    inputSchema: {
      type: "object" as const,
      properties: {
        operation: { type: "string", description: "read (default, disabled) | provision (disabled) | lifecycle | capabilities.", enum: ["read", "provision", "lifecycle", "capabilities"] },
        payment_method_id: { type: "string", description: "read: ignored — this operation is disabled and always returns _not_configured." },
        provider: { type: "string", description: "provision: ignored — this operation is disabled and always returns _not_configured.", enum: ["stripe", "vts", "mdes"] },
        pan_source: { type: "string", description: "provision: ignored — this operation is disabled and always returns _not_configured. NEVER a raw PAN in any case." },
        events: { type: "array", description: "lifecycle: ordered TokenEvent list (provision|activate|suspend|resume|delete), max 100. Must start from provision; illegal transitions throw." },
        event: { type: "string", description: "lifecycle: single-event shorthand for `events: [event]`." },
      },
    },
    outputSchema: {
      type: "object" as const,
      properties: {
        tool: { type: "string", description: "Always 'iliad_network_tokenization'." },
        operation: { type: "string", description: "The operation that ran." },
        lifecycle: { type: "object", description: "lifecycle: { state, history: [{from, event, to}] } after applying every event." },
        capabilities: { type: "object", description: "{ stripe, vts, mdes } — which providers are configured (env-derived)." },
        honesty: { type: "string", description: "The stripe-live / VTS-MDES-gated honesty statement (capabilities only)." },
        _not_configured: { type: "boolean", description: "True for every read/provision call (disabled) and for capability-gated states." },
        provider_checked: { type: "string", description: "Always 'stripe' for the disabled read/provision envelope; the real provider gate name otherwise." },
        reason: { type: "string", description: "Why the call returned _not_configured (only when true)." },
        remediation: { type: "string", description: "What to use instead, or the exact env var / onboarding step required." },
      },
    },
    annotations: toolAnnotations("Network Tokenization", true, true),
    examples: [
      {
        name: "Run the executable token lifecycle",
        input: { operation: "lifecycle", events: ["provision", "activate", "suspend", "resume", "delete"] },
        output: '{"tool":"iliad_network_tokenization","operation":"lifecycle","lifecycle":{"state":"deleted","history":[{"from":null,"event":"provision","to":"provisioned"},{"from":"provisioned","event":"activate","to":"active"},{"from":"active","event":"suspend","to":"suspended"},{"from":"suspended","event":"resume","to":"active"},{"from":"active","event":"delete","to":"deleted"}]}}',
      },
      {
        name: "Attempt to read a Stripe PaymentMethod's network-token status (disabled)",
        input: { operation: "read", payment_method_id: "pm_1NXYZ" },
        output: '{"_not_configured":true,"tool":"iliad_network_tokenization","provider_checked":"stripe","reason":"The \'read\' operation is temporarily disabled: it would resolve a caller-supplied payment_method_id/pan_source against the platform\'s Stripe account with no verification that it belongs to the calling AXIS account, since no such ownership record exists in this system yet.","remediation":"Use \'capabilities\' (config probe) or \'lifecycle\' (pure state-machine simulation) instead..."}',
      },
      {
        name: "Probe capabilities before attempting provision",
        input: { operation: "capabilities" },
        output: '{"tool":"iliad_network_tokenization","operation":"capabilities","capabilities":{"stripe":true,"vts":false,"mdes":false},"honesty":"Stripe read adapter is live..."}',
      },
    ],
  },
];
