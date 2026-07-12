import { useCallback, useEffect, useMemo, useState } from "react";
import type { SnapshotResponse, ProjectSummary, GeneratedFile, MppPricing } from "../api.ts";
import {
  listProjects,
  runProgram,
  getGeneratedFiles,
  mppPricing,
  mppPricePerCall,
  apiErrorDetails,
  complianceGradeLetter,
  ApiError,
} from "../api.ts";
import { UpsellModal } from "../components/UpsellModal.tsx";
import { useToast } from "../components/Toast.tsx";
import { SectionHeader, Callout, EmptyState, Skeleton, MarkdownLite, CodeBlock, Pill } from "../components/primitives/index.ts";
import type { SignUpTrigger } from "../components/SignUpModal.tsx";
import type { PageId } from "../routes.tsx";
// Single-source counts (WO-F5) — never inline these numbers.
import { FREE_PROGRAM_NAMES } from "../config.ts";

// ─── CommercePage (WO-P9) ─────────────────────────────────────────────────
// Agentic Purchasing / Commerce hub: generates and renders the
// "agentic-purchasing" program's 6 artifacts in-app (playbook, negotiation
// rules, checkout flow, product schema, commerce registry, AP2 interop
// samples) — no ZIP download needed to read them.
//
// Deviation from the build-plan's literal API list, disclosed: the plan
// names POST /v1/prepare-for-agentic-purchasing as this page's "readiness
// check" call, but that endpoint requires FRESH raw file content (its own
// `files` body field) — the web app only retains already-analyzed project
// state (WO-F3's architecture), not source files, once a project exists.
// Forcing that endpoint into this context would mean re-uploading a repo
// just to preview readiness. Instead: the "readiness" signal shown here is
// the project's EXISTING compliance grade (already computed during analysis,
// free, no extra call) labeled honestly for what it is, and kit generation
// itself uses the same runProgram(snapshot_id) mechanism WO-P7 already
// shipped and tested for every other paid program — no new server-side
// plumbing needed. probe-intent's live demo already lives on the MCP
// Configuration page (WO-P8); this page links there rather than duplicating
// that UI for a second time.
//
// Honesty (H3): checkout-flow.md is a generated SPECIFICATION for how an
// agent would complete a purchase — never an executable checkout. The flow
// steps shown here are a visualization of that spec, explicitly labeled.

interface Props {
  loggedIn: boolean;
  currentProjectId: string | null;
  anonResult: SnapshotResponse | null;
  onNavigate: (page: PageId) => void;
  onRequireLogin: (trigger?: SignUpTrigger) => void;
}

interface Target {
  project_id: string;
  name: string;
  snapshot_id: string | null;
  complianceGrade: string | null;
}

interface TierBlockState {
  blocked: string[];
  allowed: string[];
  pricing: MppPricing | null;
  pricePerCall: string | null;
}

const ARTIFACT_LABELS: Record<string, string> = {
  "agent-purchasing-playbook.md": "Purchasing Playbook",
  "negotiation-rules.md": "Negotiation Rules",
  "checkout-flow.md": "Checkout Flow",
  "product-schema.json": "Product Schema",
  "commerce-registry.json": "Commerce Registry",
  "ap2-interop-samples.json": "AP2 Interop Samples",
};
// Render order: narrative docs first, then the JSON wire artifacts.
const ARTIFACT_ORDER = Object.keys(ARTIFACT_LABELS);

function prettyJson(raw: string): string {
  try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
}

/** The checkout-flow doc's "Flow Overview" fence is a single arrow-chain
 *  line (e.g. "Agent Request → Validate Intent → ... → Return Artifacts") —
 *  pulled out and rendered as connected step pills above the full doc. */
function extractFlowSteps(content: string): string[] | null {
  const match = content.match(/```\n([^`]*(?:→)[^`]*)\n```/);
  if (!match) return null;
  const steps = match[1].split("→").map((s) => s.trim()).filter(Boolean);
  return steps.length > 1 ? steps : null;
}

export function CommercePage({ loggedIn, currentProjectId, anonResult, onNavigate, onRequireLogin }: Props) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [targetId, setTargetId] = useState<string | null>(currentProjectId);
  const [listError, setListError] = useState<{ message: string; details: string | null } | null>(null);
  const [files, setFiles] = useState<GeneratedFile[] | null>(null);
  const [checkingExisting, setCheckingExisting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<{ message: string; details: string | null } | null>(null);
  const [tierBlock, setTierBlock] = useState<TierBlockState | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!loggedIn) { setProjects([]); return; }
    listProjects({ limit: 200 })
      .then((r) => setProjects(r.projects))
      .catch((err) => {
        setListError({ message: err instanceof Error ? err.message : "Failed to load projects", details: apiErrorDetails(err) });
        setProjects([]);
      });
  }, [loggedIn]);

  const target: Target | null = useMemo(() => {
    if (!loggedIn) {
      return anonResult
        ? { project_id: anonResult.project_id, name: anonResult.context_map.project_identity.name, snapshot_id: anonResult.snapshot_id, complianceGrade: null }
        : null;
    }
    if (!projects || projects.length === 0) return null;
    const p = projects.find((proj) => proj.project_id === targetId) ?? projects[0];
    return {
      project_id: p.project_id,
      name: p.name,
      snapshot_id: p.latest_snapshot?.snapshot_id ?? null,
      complianceGrade: complianceGradeLetter(p.latest_snapshot?.compliance_grade),
    };
  }, [loggedIn, anonResult, projects, targetId]);

  const checkExisting = useCallback(async (projectId: string) => {
    setCheckingExisting(true);
    try {
      const res = await getGeneratedFiles(projectId);
      const kit = Array.isArray(res.files) ? res.files.filter((f) => f.program === "agentic-purchasing") : [];
      setFiles(kit.length > 0 ? kit : null);
    } catch {
      setFiles(null);
    } finally {
      setCheckingExisting(false);
    }
  }, []);

  useEffect(() => {
    setFiles(null);
    if (target) void checkExisting(target.project_id);
  }, [target?.project_id, checkExisting]);

  async function handleGenerate() {
    if (!target?.snapshot_id) return;
    if (!loggedIn) {
      // Every paid-program handler 401s an anonymous caller before pricing is
      // ever computed (mirrors AnalyzePage/RunnerPage) — block client-side
      // rather than round-trip for a guaranteed 401.
      onRequireLogin("paid-program");
      return;
    }
    setGenerating(true);
    setGenError(null);
    setTierBlock(null);
    try {
      const res = await runProgram("agentic-purchasing/generate", target.snapshot_id);
      setFiles(res.files);
      toast("success", `Generated ${res.files.length} commerce artifact${res.files.length === 1 ? "" : "s"}`);
    } catch (err) {
      if (err instanceof ApiError && (err.errorCode === "TIER_REQUIRED" || err.status === 402)) {
        setTierBlock({
          blocked: (err.extra.blocked_programs as string[] | undefined) ?? ["agentic-purchasing"],
          allowed: (err.extra.allowed_programs as string[] | undefined) ?? [...FREE_PROGRAM_NAMES],
          pricing: mppPricing(err),
          pricePerCall: mppPricePerCall(err),
        });
      } else if (err instanceof ApiError && err.status === 401) {
        onRequireLogin("paid-program");
      } else {
        const message = err instanceof Error ? err.message : "Failed to generate purchasing kit";
        setGenError({ message, details: apiErrorDetails(err) });
      }
    } finally {
      setGenerating(false);
    }
  }

  const orderedFiles = useMemo(() => {
    if (!files) return [];
    return [...files].sort((a, b) => ARTIFACT_ORDER.indexOf(a.path) - ARTIFACT_ORDER.indexOf(b.path));
  }, [files]);

  const checkoutFlowFile = files?.find((f) => f.path === "checkout-flow.md");
  const flowSteps = checkoutFlowFile ? extractFlowSteps(checkoutFlowFile.content) : null;

  return (
    <div>
      <SectionHeader
        title="Agentic Commerce"
        sub="Generate the artifacts an autonomous purchasing agent needs to evaluate, negotiate, and complete an AXIS purchase for your repo."
      />

      <Callout tone="info" title="What this generates">
        A purchasing playbook, negotiation rules, a checkout-flow specification, and the AP2/product-schema wire
        formats an agent reads to buy AXIS programs on your behalf. Everything below is generated FOR your repo —
        nothing here is a live or executable checkout. Looking for the general capability-discovery tool instead?
        See MCP Configuration&apos;s probe-intent demo.
      </Callout>

      {listError && (
        <div className="mt-4">
          <Callout tone="danger" title="Couldn't load your projects" details={listError.details}>{listError.message}</Callout>
        </div>
      )}

      {loggedIn && projects === null && !listError && <div className="mt-4"><Skeleton lines={2} height={40} /></div>}

      {loggedIn && projects !== null && projects.length === 0 && !listError && (
        <div className="card mt-4">
          <EmptyState icon="scan" title="No projects yet" message="Analyze a repo first, then come back here to generate its commerce kit." />
        </div>
      )}

      {!loggedIn && !anonResult && (
        <div className="card mt-4">
          <EmptyState icon="scan" title="No project loaded" message="Analyze a repo to generate a commerce kit for it." />
        </div>
      )}

      {target && (
        <>
          <div className="card mt-4">
            <div className="flex-between" style={{ flexWrap: "wrap", gap: 12 }}>
              <div>
                {loggedIn && projects && projects.length > 1 ? (
                  <>
                    <label className="text-sm text-muted" htmlFor="commerce-target">Project</label>
                    <select id="commerce-target" value={target.project_id} onChange={(e) => setTargetId(e.target.value)} style={{ display: "block", marginTop: 4 }}>
                      {projects.map((p) => <option key={p.project_id} value={p.project_id}>{p.name}</option>)}
                    </select>
                  </>
                ) : (
                  <>
                    <div className="text-muted text-sm">Project</div>
                    <strong>{target.name}</strong>
                  </>
                )}
              </div>
              {target.complianceGrade && (
                <div style={{ textAlign: "right" }}>
                  <div className="text-muted text-sm">Compliance grade</div>
                  <Pill tone="accent">{target.complianceGrade}</Pill>
                  <div className="text-muted text-xs mt-1">from your last analysis — a starting signal, not a purchasing score</div>
                </div>
              )}
            </div>
          </div>

          {genError && (
            <div className="mt-4">
              <Callout tone="danger" title="Couldn't generate the purchasing kit" details={genError.details}>{genError.message}</Callout>
            </div>
          )}

          {checkingExisting && <div className="mt-4"><Skeleton lines={3} height={40} /></div>}

          {!checkingExisting && !files && (
            <div className="card mt-4" style={{ textAlign: "center" }}>
              <p className="text-muted mb-2">No purchasing kit generated yet for this project.</p>
              <button type="button" className="btn btn-primary" disabled={generating || !target.snapshot_id} onClick={() => void handleGenerate()}>
                {generating ? "Generating..." : "Generate Purchasing Kit"}
              </button>
            </div>
          )}

          {files && (
            <>
              <div className="flex-between mt-4 mb-2" style={{ flexWrap: "wrap", gap: 8 }}>
                <p className="text-muted text-sm">{files.length} artifact{files.length === 1 ? "" : "s"} generated.</p>
                <button type="button" className="btn text-sm" disabled={generating} onClick={() => void handleGenerate()}>
                  {generating ? "Regenerating..." : "Regenerate"}
                </button>
              </div>

              {flowSteps && (
                <div className="card">
                  <h3 className="mb-2">Checkout Flow — Overview</h3>
                  <p className="text-muted text-xs mb-2">A visualization of the generated flow specification below — not a live or executable checkout.</p>
                  <div className="flex gap-2" style={{ flexWrap: "wrap", alignItems: "center" }}>
                    {flowSteps.map((step, i) => (
                      <span key={step} className="flex gap-2" style={{ alignItems: "center" }}>
                        <Pill tone="outline">{step}</Pill>
                        {i < flowSteps.length - 1 && <span aria-hidden className="text-muted">→</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {orderedFiles.map((f) => (
                <div key={f.path} className="card">
                  <h3 className="mb-2">{ARTIFACT_LABELS[f.path] ?? f.path}</h3>
                  {f.path.endsWith(".json")
                    ? <CodeBlock code={prettyJson(f.content)} label={f.path} maxHeight={400} />
                    : <MarkdownLite text={f.content} />}
                </div>
              ))}
            </>
          )}
        </>
      )}

      {tierBlock && (
        <UpsellModal
          blocked={tierBlock.blocked}
          allowed={tierBlock.allowed}
          pricing={tierBlock.pricing ? { standardCents: tierBlock.pricing.standard.amount_cents, liteCents: tierBlock.pricing.lite.amount_cents } : undefined}
          mode="standard"
          onGoFree={() => { setTierBlock(null); onNavigate("runner"); }}
          onClose={() => setTierBlock(null)}
        />
      )}
    </div>
  );
}
