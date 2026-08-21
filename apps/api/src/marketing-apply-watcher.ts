// ─── app_42_marketing_connected: the marketing program's Watch → Apply ──────
//
// "connected to a channel" scoped deliberately to a TEST-SEND ROUND TRIP, per
// the candidate's own wording ("test-send round-trip before any real
// audience") — not a real-audience campaign. This repo has no consent/
// unsubscribe/audience-list infrastructure at all, and building a real send
// path without it would be a compliance defect, not a feature. What this
// closes: proving the generation -> Resend -> delivery -> funnel-tracking
// pipeline genuinely works, by actually sending one real email to the
// account's OWN address (a safe, consenting recipient by construction) —
// never a report, never a dry-run stub.
//
// Mirrors artifacts-apply-watcher.ts's shape: deps-injected for testability,
// a discriminated status with a real reason on every non-happy path, and the
// `not_<product>_product` sentinel the watch-dispatcher's fall-through chain
// expects.
import { fetchGitHubRepo, createSnapshot, getAccount, trackEvent } from "@axis/snapshots";
import type { SnapshotManifest, FileEntry, WatchJobPayload } from "@axis/snapshots";
import { buildContextMap, type ContextMap } from "@axis/context-engine";
import { buildMarketingSequences, type MarketingSequenceStep } from "@axis/generator-core";
import { sendSequenceStep, defaultSendSequenceStepDeps, type SendSequenceStepDeps } from "./marketing-send.js";

const MARKETING_PRODUCT_ID = "marketing";

export interface MarketingApplyDeps {
  token: string | undefined;
  fetchRepo: (url: string, token: string) => Promise<{ files: FileEntry[] }>;
  sendStep: (step: MarketingSequenceStep, toEmail: string, deps: SendSequenceStepDeps) => Promise<Awaited<ReturnType<typeof sendSequenceStep>>>;
  sendStepDeps: SendSequenceStepDeps;
  getAccountById: (account_id: string) => Promise<{ email: string } | undefined>;
  track: typeof trackEvent;
}

export type MarketingApplyStatus =
  | "not_marketing_product"
  | "no_token"
  | "account_not_found"
  | "not_configured"
  | "test_send_failed"
  | "test_sent";

export interface MarketingApplyResult {
  status: MarketingApplyStatus;
  sequence_name?: string;
  step_label?: string;
  message_id?: string;
  reason?: string;
}

/** The single representative step sent per run — enough to prove the pipeline works without spamming the inbox with every step of every sequence. */
function pickTestStep(ctx: ContextMap): { sequence_name: string; step: MarketingSequenceStep } | null {
  const sequences = buildMarketingSequences(ctx);
  const first = sequences[0];
  const step = first?.steps[0];
  if (!first || !step) return null;
  return { sequence_name: first.sequence_name, step };
}

export async function processMarketingApply(
  payload: WatchJobPayload,
  deps: MarketingApplyDeps,
): Promise<MarketingApplyResult> {
  if (payload.product_id !== MARKETING_PRODUCT_ID) return { status: "not_marketing_product" };
  if (!deps.token) return { status: "no_token" };

  const account = await deps.getAccountById(payload.account_id);
  if (!account) return { status: "account_not_found" };

  const fr = await deps.fetchRepo(`https://github.com/${payload.repo_full_name}`, deps.token);
  const manifest: SnapshotManifest = {
    project_name: payload.repo_full_name,
    project_type: "github_repository",
    frameworks: [],
    goals: ["Prove the marketing sequence pipeline is deliverable"],
    requested_outputs: [],
  };
  const snapshot = await createSnapshot({ input_method: "github_repo_url", manifest, files: fr.files }, undefined);
  const ctx: ContextMap = buildContextMap(snapshot);

  const picked = pickTestStep(ctx);
  if (!picked) return { status: "test_send_failed", reason: "no_sequence_steps_generated" };
  const { sequence_name, step } = picked;

  const sent = await deps.sendStep(step, account.email, deps.sendStepDeps);
  if (sent.status === "not_configured") return { status: "not_configured" };
  if (sent.status === "send_failed") {
    // Best-effort tracking of the failure itself — never let a bookkeeping
    // write mask the real result the caller needs (the failure status/reason
    // below is returned regardless of whether this tracking call succeeds).
    await deps.track(payload.account_id, "marketing_sequence_test_send_failed", "engagement", {
      sequence_name,
      step_label: step.label,
      error: sent.error,
    }).catch(() => {});
    return { status: "test_send_failed", sequence_name, step_label: step.label, reason: sent.error };
  }

  await deps.track(payload.account_id, "marketing_sequence_test_sent", "engagement", {
    sequence_name,
    step_label: step.label,
    message_id: sent.message_id,
  }).catch(() => {});

  return { status: "test_sent", sequence_name, step_label: step.label, message_id: sent.message_id };
}

export function defaultMarketingApplyDeps(): MarketingApplyDeps {
  return {
    token: process.env.GITHUB_TOKEN,
    fetchRepo: (url, token) => fetchGitHubRepo(url, token),
    sendStep: (step, toEmail, sendDeps) => sendSequenceStep(step, toEmail, sendDeps),
    sendStepDeps: defaultSendSequenceStepDeps(),
    getAccountById: (account_id) => getAccount(account_id),
    track: trackEvent,
  };
}
