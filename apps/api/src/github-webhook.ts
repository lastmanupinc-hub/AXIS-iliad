// ─── GitHub App webhook handler ─────────────────────────────────
//
// Accepts events from a registered GitHub App installation and creates a
// snapshot for each push/pull_request event. The GitHub App manifest at
// .github/app-manifest.json bootstraps the App; the webhook URL points at
// POST /v1/github/webhook.
//
// Security: every event must carry an X-Hub-Signature-256 header whose
// value matches HMAC-SHA256(GITHUB_WEBHOOK_SECRET, rawBody). Without
// GITHUB_WEBHOOK_SECRET configured, the endpoint returns 503 so the App
// retries until ops finishes the deploy.

import type { IncomingMessage, ServerResponse } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { readBody, sendJSON, sendError } from "./router.js";
import { log, ErrorCode } from "./logger.js";
import { buildDeltaReport, type GeneratorResult, type GeneratedFile } from "@axis/generator-core";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import { parseRepo } from "@axis/repo-parser";
import type { ContextMap } from "@axis/context-engine";
import { listSubscriptionsForRepo, enqueueWatchJob } from "@axis/snapshots";

// ─── Signature verification ────────────────────────────────────

/**
 * Verify a GitHub webhook signature.
 *
 * GitHub signs the raw request body with HMAC-SHA256 using the App's webhook
 * secret and sends the result in the `X-Hub-Signature-256` header formatted
 * as `sha256=<hex>`. We use `timingSafeEqual` to avoid leaking timing data on
 * mismatch.
 */
export function verifyGitHubSignature(
  rawBody: string,
  sigHeader: string | undefined,
  secret: string,
): boolean {
  if (!sigHeader || !sigHeader.startsWith("sha256=")) return false;
  const provided = sigHeader.slice("sha256=".length).trim();
  if (provided.length === 0) return false;

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  try {
    const a = Buffer.from(provided, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ─── Event router ───────────────────────────────────────────────

/** Events we explicitly handle. Everything else returns 200 with handled=false. */
const HANDLED_EVENTS = new Set([
  "ping",
  "push",
  "pull_request",
  "installation",
  "installation_repositories",
]);

interface PushPayload {
  ref?: string;
  after?: string;
  repository?: {
    full_name?: string;
    clone_url?: string;
    html_url?: string;
    default_branch?: string;
    private?: boolean;
  };
  installation?: { id?: number };
}

interface PullRequestPayload {
  action?: string;
  pull_request?: {
    head?: { sha?: string; ref?: string; repo?: { full_name?: string; html_url?: string } };
    base?: { ref?: string };
    number?: number;
  };
  repository?: { full_name?: string; html_url?: string };
  installation?: { id?: number };
}

// The webhook handler is intentionally non-throwing — every event acks 200
// (or 401/503 on signature/config failure) and logs internal errors so
// GitHub's delivery panel reflects health, not transient snapshot work.

export async function handleGitHubWebhook(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    sendError(res, 503, ErrorCode.INTERNAL_ERROR, "GitHub webhook secret not configured");
    return;
  }

  const rawBody = await readBody(req);
  const sigHeader = req.headers["x-hub-signature-256"];
  const signature = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;

  if (!verifyGitHubSignature(rawBody, signature, secret)) {
    sendError(res, 401, ErrorCode.AUTH_REQUIRED, "Invalid webhook signature");
    return;
  }

  const eventHeader = req.headers["x-github-event"];
  const event = Array.isArray(eventHeader) ? eventHeader[0] : eventHeader;
  const deliveryHeader = req.headers["x-github-delivery"];
  const deliveryId = Array.isArray(deliveryHeader) ? deliveryHeader[0] : deliveryHeader;

  if (!event) {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "X-GitHub-Event header is required");
    return;
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  if (event === "ping") {
    sendJSON(res, 200, { received: true, event, pong: true, delivery_id: deliveryId ?? null });
    return;
  }

  if (!HANDLED_EVENTS.has(event)) {
    sendJSON(res, 200, { received: true, event, handled: false, delivery_id: deliveryId ?? null });
    return;
  }

  // Resolve target (repo + ref) per event type. We don't fetch the tarball or
  // create the snapshot synchronously yet — that pipeline lives in
  // dispatchWebhookSnapshot() so the request can ack inside GitHub's 10s
  // delivery window even on cold builds.
  const target = resolveSnapshotTarget(event, payload);
  if (!target) {
    sendJSON(res, 200, { received: true, event, handled: false, reason: "no_target", delivery_id: deliveryId ?? null });
    return;
  }

  // Fire-and-forget snapshot creation. Errors surface in the log only — the
  // webhook response is always a fast ack so GitHub doesn't retry on slow
  // snapshot builds. Idempotency on duplicate deliveries is enforced by the
  // upstream dispatcher.
  void dispatchWebhookSnapshot(event, target, deliveryId ?? null).catch((err) => {
    log("error", "github-webhook.dispatch_failed", {
      event,
      delivery_id: deliveryId ?? null,
      repo: target.repoFullName,
      ref: target.ref,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  sendJSON(res, 202, {
    received: true,
    event,
    handled: true,
    repo: target.repoFullName,
    ref: target.ref,
    delivery_id: deliveryId ?? null,
  });
}

// ─── Target resolution ─────────────────────────────────────────

interface SnapshotTarget {
  repoFullName: string;
  cloneUrl: string;
  ref: string;
  installationId: number | null;
  isPrivate: boolean;
}

function resolveSnapshotTarget(
  event: string,
  payload: Record<string, unknown>,
): SnapshotTarget | null {
  if (event === "push") {
    const p = payload as PushPayload;
    const repo = p.repository;
    if (!repo?.full_name || !repo.clone_url) return null;
    return {
      repoFullName: repo.full_name,
      cloneUrl: repo.clone_url,
      ref: p.ref ?? repo.default_branch ?? "HEAD",
      installationId: p.installation?.id ?? null,
      isPrivate: Boolean(repo.private),
    };
  }

  if (event === "pull_request") {
    const p = payload as PullRequestPayload;
    const action = p.action;
    // Only act on actions that change code; comments / labels / assignees skip.
    if (action !== "opened" && action !== "synchronize" && action !== "reopened") {
      return null;
    }
    const repoFull = p.pull_request?.head?.repo?.full_name ?? p.repository?.full_name;
    const headHtml = p.pull_request?.head?.repo?.html_url ?? p.repository?.html_url;
    if (!repoFull || !headHtml) return null;
    const cloneUrl = headHtml.endsWith(".git") ? headHtml : `${headHtml}.git`;
    return {
      repoFullName: repoFull,
      cloneUrl,
      ref: p.pull_request?.head?.sha ?? p.pull_request?.head?.ref ?? "HEAD",
      installationId: p.installation?.id ?? null,
      isPrivate: false,
    };
  }

  // installation / installation_repositories events are informational only —
  // we ack 200 so GitHub records the install but don't snapshot.
  return null;
}

// ─── Snapshot dispatch ─────────────────────────────────────────

// Module-scoped delivery cache (15 min TTL). Prevents duplicate snapshots when
// GitHub retries a delivery. Keyed by X-GitHub-Delivery (UUID per delivery).
const deliveryCache = new Map<string, number>();
const DELIVERY_TTL_MS = 15 * 60 * 1000;

function rememberDelivery(deliveryId: string): boolean {
  const now = Date.now();
  for (const [k, ts] of deliveryCache) {
    if (now - ts > DELIVERY_TTL_MS) deliveryCache.delete(k);
  }
  if (deliveryCache.has(deliveryId)) return false;
  deliveryCache.set(deliveryId, now);
  return true;
}

/** Test-only: reset the delivery dedup cache. */
export function resetGitHubWebhookState(): void {
  deliveryCache.clear();
}

async function dispatchWebhookSnapshot(
  event: string,
  target: SnapshotTarget,
  deliveryId: string | null,
): Promise<void> {
  if (deliveryId && !rememberDelivery(deliveryId)) {
    log("info", "github-webhook.duplicate_delivery", {
      delivery_id: deliveryId,
      repo: target.repoFullName,
    });
    return;
  }

  // The Watch mechanic (docs/saas-strategy/APPLICATION_BUILD_STRATEGY.md
  // substrate table): every account subscribed to this repo gets a durable
  // watch job per subscribed product, independent of the generic
  // re-analysis/delta-report flow below. This is also the installation ->
  // account mapping this function's own long-standing comment named as
  // missing (see the `undefined` account_id passed to createSnapshot further
  // down) — repo_subscriptions is that mapping for accounts that opted in,
  // though anonymous webhook snapshots still have no account and are
  // unaffected. Fail-open: a lookup/enqueue failure must never block the
  // webhook's ack or the snapshot flow that already existed.
  try {
    const subs = await listSubscriptionsForRepo(target.repoFullName);
    for (const sub of subs) {
      await enqueueWatchJob({
        account_id: sub.account_id,
        product_id: sub.product_id,
        repo_full_name: target.repoFullName,
        event_type: event,
        ref: target.ref,
      });
    }
    if (subs.length > 0) {
      log("info", "github-webhook.watch_jobs_enqueued", {
        repo: target.repoFullName,
        count: subs.length,
      });
    }
  } catch (err) {
    log("error", "github-webhook.watch_enqueue_failed", {
      repo: target.repoFullName,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const githubMod = await import("./github.js").catch(() => null);
  if (!githubMod) {
    log("error", "github-webhook.github_module_unavailable", { repo: target.repoFullName });
    return;
  }
  const snapshotsMod = await import("@axis/snapshots").catch(() => null);
  if (!snapshotsMod) {
    log("error", "github-webhook.snapshots_module_unavailable", { repo: target.repoFullName });
    return;
  }

  const { fetchGitHubRepo } = githubMod;
  const { createSnapshot, getProjectSnapshots, getContextMap, getGeneratorResult, saveGeneratorResult, saveContextMap, saveRepoProfile } = snapshotsMod;

  const token = process.env.GITHUB_TOKEN ?? undefined;
  const repoUrl = target.cloneUrl.replace(/\.git$/, "");
  let fetchResult;
  try {
    fetchResult = await fetchGitHubRepo(repoUrl, token);
  } catch (err) {
    log("warn", "github-webhook.fetch_failed", {
      repo: target.repoFullName,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  if (fetchResult.files.length === 0) {
    log("info", "github-webhook.no_source_files", { repo: target.repoFullName });
    return;
  }

  const [owner, name] = target.repoFullName.split("/");
  const snapshot = await createSnapshot(
    {
      input_method: "github_repo_url",
      manifest: {
        project_name: target.repoFullName,
        project_type: "unknown",
        frameworks: [],
        goals: ["analyze", "compliance-check"],
        requested_outputs: [],
      },
      files: fetchResult.files,
      github_url: repoUrl,
    },
    // Webhook-created snapshots are anonymous until an installation→account
    // mapping table lands. The compliance gate (GitHub Action) is the
    // user-facing surface; this background snapshot just primes the cache.
    undefined,
  );

  log("info", "github-webhook.snapshot_created", {
    event,
    delivery_id: deliveryId,
    repo: target.repoFullName,
    owner,
    name,
    ref: target.ref,
    installation_id: target.installationId,
    snapshot_id: snapshot.snapshot_id,
    file_count: fetchResult.files.length,
  });

  // Analysis-on-push: build + persist the context map so the delta below (and any
  // later consumer) has something to diff. Fail-open — analysis failure must never
  // surface past the webhook's success path; the snapshot itself already persisted.
  try {
    // Parse the repo once and reuse for both builders — each would otherwise
    // parse the whole uploaded file set independently on every push.
    const parsed = parseRepo(snapshot.files);
    const contextMap = buildContextMap(snapshot, parsed);
    const repoProfile = buildRepoProfile(snapshot, parsed);
    await saveContextMap(snapshot.snapshot_id, contextMap);
    await saveRepoProfile(snapshot.snapshot_id, repoProfile);
    log("info", "github-webhook.analysis_completed", {
      repo: target.repoFullName,
      snapshot_id: snapshot.snapshot_id,
    });
  } catch (err) {
    log("error", "github-webhook.analysis_failed", {
      repo: target.repoFullName,
      snapshot_id: snapshot.snapshot_id,
      error: err instanceof Error ? err.message : String(err),
    });
    // No ctx ⇒ the delta block below will skip with reason:no_ctx, as today.
  }

  // Watchtower v1: an unprompted delta narrative for every re-analysis. Own try/catch —
  // a throw here must never surface past the webhook's success path (fail-open).
  try {
    const snapshotsForProject = await getProjectSnapshots(snapshot.project_id);
    const prevSnapshot = snapshotsForProject[snapshotsForProject.length - 2];
    if (!prevSnapshot) {
      log("info", "github-webhook.delta_skipped", { reason: "first_snapshot", repo: target.repoFullName, snapshot_id: snapshot.snapshot_id });
      return;
    }

    const [prevCtx, currCtx] = await Promise.all([
      getContextMap(prevSnapshot.snapshot_id),
      getContextMap(snapshot.snapshot_id),
    ]);
    if (!prevCtx || !currCtx) {
      log("info", "github-webhook.delta_skipped", { reason: "no_ctx", repo: target.repoFullName, snapshot_id: snapshot.snapshot_id });
      return;
    }

    const report = buildDeltaReport(prevCtx as ContextMap, currCtx as ContextMap);
    if (!report) {
      log("info", "github-webhook.delta_skipped", { reason: "no_change", repo: target.repoFullName, snapshot_id: snapshot.snapshot_id });
      return;
    }

    // Not appendDeltaReport(): it no-ops on an empty `files` array (fits the export
    // surface, which always has a package already) — webhook snapshots start with none.
    const existing = (await getGeneratorResult(snapshot.snapshot_id)) as GeneratorResult | undefined;
    const generated: GeneratorResult = existing ?? {
      snapshot_id: snapshot.snapshot_id,
      project_id: snapshot.project_id,
      generated_at: new Date().toISOString(),
      files: [],
      skipped: [],
    };
    if (!generated.files.some((f) => f.path === "delta-report.md")) {
      const file: GeneratedFile = {
        path: "delta-report.md",
        content: report,
        content_type: "text/markdown",
        program: "skills",
        description: "What changed since the previous snapshot — computed diffs across stack, routes, models, hotspots, warnings, and size.",
      };
      generated.files.push(file);
    }
    await saveGeneratorResult(snapshot.snapshot_id, generated);

    log("info", "github-webhook.delta_stored", {
      project_id: snapshot.project_id,
      snapshot_id: snapshot.snapshot_id,
      bytes: Buffer.byteLength(report, "utf-8"),
    });
    // trackEvent("watchtower_delta", ...) intentionally left unwired (SPEC-06): the
    // FunnelEventType member now exists, but webhook snapshots have no account until
    // an installation→account mapping lands, so there's nothing to attribute this to.
  } catch (err) {
    log("error", "github-webhook.delta_failed", {
      repo: target.repoFullName,
      snapshot_id: snapshot.snapshot_id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
