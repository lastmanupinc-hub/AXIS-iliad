// ─── app_42_marketing_connected: the actual send ────────────────────────
//
// Turns one MarketingSequenceStep (packages/generator-core's structured
// sequence data) into a real Resend send via email.ts's sendTransactionalEmail
// — the same low-level function the iliad_transactional_email MCP tool uses,
// not a new integration. Body content is the step's own bullet outline
// (a content brief, not drafted prose — see generators-marketing.ts's own
// doc comment) rendered as plain text, clearly labeled as a draft so a
// test-send never reads as a finished campaign.
import type { MarketingSequenceStep } from "@axis/generator-core";
import { sendTransactionalEmail, readEmailConfigFromEnv, type EmailConfig, type SendEmailResult } from "./email.js";

export type SendSequenceStepResult =
  | { status: "not_configured" }
  | { status: "sent"; message_id: string }
  | { status: "send_failed"; error: string };

/** Plain-text body from a step's bullet outline — explicit about being a draft. */
export function renderStepBodyText(step: MarketingSequenceStep): string {
  const lines = [
    `[AXIS marketing test-send — this is the generated CONTENT BRIEF, not finished copy.]`,
    ``,
    `Replace the bullets below with real drafted copy before this ever reaches a real audience:`,
    ``,
    ...step.body_bullets.map((b) => `- ${b}`),
  ];
  return lines.join("\n");
}

export interface SendSequenceStepDeps {
  config: EmailConfig | null;
  send: (opts: { to: string; subject: string; body_text: string }, config: EmailConfig) => Promise<SendEmailResult>;
}

/** Sends ONE step to ONE recipient (a test-send target, never a real audience list — see the module header). */
export async function sendSequenceStep(
  step: MarketingSequenceStep,
  toEmail: string,
  deps: SendSequenceStepDeps,
): Promise<SendSequenceStepResult> {
  if (!deps.config) return { status: "not_configured" };
  try {
    const result = await deps.send(
      { to: toEmail, subject: `[TEST] ${step.subject}`, body_text: renderStepBodyText(step) },
      deps.config,
    );
    return { status: "sent", message_id: result.message_id };
  } catch (err) {
    return { status: "send_failed", error: err instanceof Error ? err.message : String(err) };
  }
}

export function defaultSendSequenceStepDeps(): SendSequenceStepDeps {
  return {
    config: readEmailConfigFromEnv(),
    send: (opts, config) => sendTransactionalEmail(opts, config),
  };
}
