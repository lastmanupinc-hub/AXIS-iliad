// ─── pitch — POST /v1/pitch/compose: draft-over-ask, productized ─────────────
//
// Fills the generated deck's owner-input slots with citation-verified
// inference from the snapshot's own documents (pitch-compose.ts) and persists
// the result as a sibling artifact, pitch-deck-composed.json, renderable via
// POST /v1/pitch/render with artifact:"composed". Owner doctrine (2026-08-26):
// a user correcting a labeled wrong draft beats a user answering a form.
//
// Billing: included in the pitch-program purchase, same as /v1/pitch/render —
// this converts already-paid-for content, no new charge. Reads SOURCE content
// (the documents the oracle checks citations against), so it carries the R5.7
// content-discarded guard like every other source-reading paid path.
//
// Degradation: with no local model configured (AXIS_LLM_MODEL_PATH absent),
// the endpoint returns 200 with composed:false and the labeled reason —
// mirroring Living Architecture's engineer-pass envelope — and persists
// nothing. It never fabricates and never crashes the deck.

import type { IncomingMessage, ServerResponse } from "node:http";
import { readBody, sendError, sendJSON } from "./router.js";
import { ErrorCode } from "./logger.js";
import { requireAuth } from "./billing.js";
import { getSnapshot, getGeneratorResult, saveGeneratorResult, isProgramEnabled } from "@axis/snapshots";
import type { GeneratorResult } from "@axis/generator-core";
import { composePitchDeck, type ComposeDeck, type ComposeSourceFile } from "./pitch-compose.js";
import { runCompletion } from "./llm-inference.js";
import type { CompletionFn } from "./living-architecture.js";

const GENERATED_PATH = "pitch-deck.json";
export const COMPOSED_PATH = "pitch-deck-composed.json";

export async function handlePitchCompose(
  req: IncomingMessage,
  res: ServerResponse,
  completionOverride?: CompletionFn,
): Promise<void> {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const snapshotId = body.snapshot_id;
  if (typeof snapshotId !== "string" || !snapshotId) {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "snapshot_id is required — run POST /v1/pitch/generate first");
    return;
  }

  const snapshot = await getSnapshot(snapshotId);
  if (!snapshot) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "Snapshot not found");
    return;
  }
  // Same ownership framing as pitch/render: a mismatched caller learns nothing.
  if (snapshot.account_id && snapshot.account_id !== ctx.account!.account_id) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "Snapshot not found");
    return;
  }

  const enabled = await isProgramEnabled(ctx.account!.account_id, "pitch");
  if (!enabled) {
    sendError(res, 402, ErrorCode.PAYMENT_REQUIRED, "The pitch program is not enabled on this account — call POST /v1/pitch/generate first, or upgrade at iliad.trustfabric.ai/billing.");
    return;
  }

  // R5.7: compose reads source documents — the citation oracle is meaningless
  // over blanked content, so reject rather than compose against nothing.
  if (snapshot.content_discarded_at) {
    sendError(res, 410, ErrorCode.CONTENT_DISCARDED, "Source content for this snapshot was discarded after web logout. Re-upload via POST /v1/snapshots, then regenerate and compose.");
    return;
  }

  const generated = (await getGeneratorResult(snapshotId)) as GeneratorResult | undefined;
  const deckFile = generated?.files.find((f) => f.path === GENERATED_PATH);
  if (!generated || !deckFile) {
    sendError(res, 404, ErrorCode.NOT_FOUND, `No ${GENERATED_PATH} artifact on this snapshot — call POST /v1/pitch/generate first.`);
    return;
  }

  let deck: ComposeDeck;
  try {
    deck = JSON.parse(deckFile.content) as ComposeDeck;
  } catch {
    sendError(res, 500, ErrorCode.INTERNAL_ERROR, "Stored pitch-deck.json is not valid JSON — regenerate via POST /v1/pitch/generate.");
    return;
  }
  if (!Array.isArray(deck.slides)) {
    sendError(res, 500, ErrorCode.INTERNAL_ERROR, "Stored pitch-deck.json has no slides array — regenerate via POST /v1/pitch/generate.");
    return;
  }

  const sourceFiles: ComposeSourceFile[] = (snapshot.files ?? [])
    .map((f) => ({ path: String(f.path ?? ""), content: String(f.content ?? "") }))
    .filter((f) => f.path && f.content);

  const completion: CompletionFn = completionOverride ?? ((opts) => runCompletion(opts));
  const { deck: composed, report } = await composePitchDeck(deck, sourceFiles, completion);

  if (!report.configured) {
    // Nothing composed, nothing persisted — the labeled envelope, not an error:
    // the deterministic deck is intact and the caller knows exactly why.
    sendJSON(res, 200, { snapshot_id: snapshotId, composed: false, report });
    return;
  }

  // Persist as a sibling artifact (upsert of the whole result row — replace
  // any prior composed copy, never duplicate).
  const withoutOld = generated.files.filter((f) => f.path !== COMPOSED_PATH);
  const composedFile = {
    path: COMPOSED_PATH,
    content: `${JSON.stringify(composed, null, 2)}\n`,
    content_type: "application/json",
    program: "pitch",
    description: "Composed deck: owner-input slots filled with citation-oracle-verified inference from the snapshot's own documents (draft-over-ask). Render via POST /v1/pitch/render with artifact:\"composed\".",
  };
  await saveGeneratorResult(snapshotId, { ...generated, files: [...withoutOld, composedFile] });

  sendJSON(res, 200, {
    snapshot_id: snapshotId,
    composed: true,
    artifact: COMPOSED_PATH,
    render_hint: 'POST /v1/pitch/render with {"snapshot_id": "...", "artifact": "composed"}',
    report,
  });
}
