import { sql } from "./pg.js";
import { randomUUID } from "node:crypto";

// ─── Email types ────────────────────────────────────────────────

export type EmailTemplate =
  | "seat_invitation"
  | "welcome"
  | "upgrade_confirmation"
  | "usage_alert"
  | "api_key_created";

export interface EmailMessage {
  to: string;
  subject: string;
  template: EmailTemplate;
  variables: Record<string, string>;
}

export interface EmailDelivery {
  delivery_id: string;
  to_email: string;
  template: EmailTemplate;
  subject: string;
  variables: string;           // JSON
  status: "pending" | "sent" | "failed";
  provider_id: string | null;  // external ID from email provider
  error: string | null;
  created_at: string;
  sent_at: string | null;
}

export type EmailProvider = (msg: EmailMessage) => Promise<{ provider_id: string }>;

// ─── Template rendering ─────────────────────────────────────────

const TEMPLATES: Record<EmailTemplate, { subject: string; body: string }> = {
  seat_invitation: {
    subject: "You've been invited to {{org_name}} on Axis' Iliad",
    body: [
      "Hi {{invitee_email}},",
      "",
      "{{inviter_name}} has invited you to join {{org_name}} as a {{role}} on Axis' Iliad.",
      "",
      "To accept, create an account with this email address or sign in at:",
      "{{accept_url}}",
      "",
      "— The Axis' Iliad Team",
    ].join("\n"),
  },
  welcome: {
    subject: "Welcome to Axis' Iliad, {{name}}!",
    body: [
      "Hi {{name}},",
      "",
      "Your Axis' Iliad account is ready. You're on the {{tier}} plan.",
      "",
      "Get started:",
      "1. Upload a project or paste a GitHub URL at {{web_url}}",
      "2. Run any of our 17 analysis programs",
      "3. Browse and export generated outputs",
      "",
      "Your API key has been created — find it in your account dashboard.",
      "",
      "— The Axis' Iliad Team",
    ].join("\n"),
  },
  upgrade_confirmation: {
    subject: "You've upgraded to {{tier_name}}!",
    body: [
      "Hi {{name}},",
      "",
      "Your Axis' Iliad account has been upgraded to {{tier_name}}.",
      "",
      "What's new:",
      "- {{snapshots_limit}} snapshots per month",
      "- {{projects_limit}} projects",
      "- All {{programs_count}} programs unlocked",
      "",
      "— The Axis' Iliad Team",
    ].join("\n"),
  },
  usage_alert: {
    subject: "Axis' Iliad: You've used {{percent}}% of your monthly snapshots",
    body: [
      "Hi {{name}},",
      "",
      "You've used {{used}} of {{limit}} snapshots this month ({{percent}}%).",
      "",
      "Consider upgrading to Pro for 200 snapshots/month:",
      "{{upgrade_url}}",
      "",
      "— The Axis' Iliad Team",
    ].join("\n"),
  },
  api_key_created: {
    subject: "New API key created on your Axis' Iliad account",
    body: [
      "Hi {{name}},",
      "",
      "A new API key labeled \"{{label}}\" was created on your account.",
      "",
      "If you didn't do this, revoke it immediately in your account dashboard:",
      "{{account_url}}",
      "",
      "— The Axis' Iliad Team",
    ].join("\n"),
  },
};

export function renderTemplate(
  template: EmailTemplate,
  variables: Record<string, string>,
): { subject: string; body: string } {
  const tpl = TEMPLATES[template];
  const interpolate = (str: string) =>
    str.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? `{{${key}}}`);
  return {
    subject: interpolate(tpl.subject),
    body: interpolate(tpl.body),
  };
}

// ─── Delivery tracking ──────────────────────────────────────────

export async function recordEmailDelivery(msg: EmailMessage, status: "pending" | "sent" | "failed", providerId?: string, error?: string): Promise<EmailDelivery> {
  const delivery: EmailDelivery = {
    delivery_id: randomUUID(),
    to_email: msg.to,
    template: msg.template,
    subject: renderTemplate(msg.template, msg.variables).subject,
    variables: JSON.stringify(msg.variables),
    status,
    provider_id: providerId ?? null,
    error: error ?? null,
    created_at: new Date().toISOString(),
    sent_at: status === "sent" ? new Date().toISOString() : null,
  };

  await sql.run(
    `INSERT INTO email_deliveries (delivery_id, to_email, template, subject, variables, status, provider_id, error, created_at, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      delivery.delivery_id, delivery.to_email, delivery.template, delivery.subject,
      delivery.variables, delivery.status, delivery.provider_id, delivery.error,
      delivery.created_at, delivery.sent_at,
    ],
  );

  return delivery;
}

export async function getEmailDeliveries(toEmail?: string, limit: number = 50): Promise<EmailDelivery[]> {
  if (toEmail) {
    return await sql.many<EmailDelivery>(
      "SELECT * FROM email_deliveries WHERE to_email = ? ORDER BY created_at DESC LIMIT ?",
      [toEmail, limit],
    );
  }
  return await sql.many<EmailDelivery>(
    "SELECT * FROM email_deliveries ORDER BY created_at DESC LIMIT ?",
    [limit],
  );
}

export async function getEmailDelivery(deliveryId: string): Promise<EmailDelivery | undefined> {
  return await sql.one<EmailDelivery>(
    "SELECT * FROM email_deliveries WHERE delivery_id = ?",
    [deliveryId],
  );
}

// ─── Provider registry ──────────────────────────────────────────

let _provider: EmailProvider | null = null;

export function setEmailProvider(provider: EmailProvider): void {
  _provider = provider;
}

export function getEmailProvider(): EmailProvider | null {
  return _provider;
}

/** Console provider for development — logs email to stdout, records as "sent" */
export function consoleEmailProvider(): EmailProvider {
  return async (msg: EmailMessage) => {
    const rendered = renderTemplate(msg.template, msg.variables);
    const id = `console-${Date.now()}`;
    console.log(`[EMAIL] To: ${msg.to} | Subject: ${rendered.subject}\n${rendered.body}\n`);
    return { provider_id: id };
  };
}

// ─── Send email (main entry point) ──────────────────────────────

export async function sendEmail(msg: EmailMessage): Promise<EmailDelivery> {
  const provider = _provider;
  if (!provider) {
    // No provider configured — record as pending (queue for later)
    return await recordEmailDelivery(msg, "pending");
  }

  try {
    const result = await provider(msg);
    return await recordEmailDelivery(msg, "sent", result.provider_id);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return await recordEmailDelivery(msg, "failed", undefined, errorMsg);
  }
}

// ─── Convenience senders for specific events ────────────────────

const WEB_URL = () => process.env.AXIS_WEB_URL ?? "http://localhost:3000";

export async function sendSeatInvitation(
  inviteeEmail: string,
  orgName: string,
  inviterName: string,
  role: string,
  seatId: string,
): Promise<EmailDelivery> {
  return sendEmail({
    to: inviteeEmail,
    subject: "",
    template: "seat_invitation",
    variables: {
      invitee_email: inviteeEmail,
      org_name: orgName,
      inviter_name: inviterName,
      role,
      accept_url: `${WEB_URL()}/account?accept_seat=${seatId}`,
    },
  });
}

export async function sendWelcomeEmail(
  email: string,
  name: string,
  tier: string,
): Promise<EmailDelivery> {
  return sendEmail({
    to: email,
    subject: "",
    template: "welcome",
    variables: { name, tier, web_url: WEB_URL() },
  });
}

export async function sendUpgradeConfirmation(
  email: string,
  name: string,
  tierName: string,
  snapshotsLimit: string,
  projectsLimit: string,
  programsCount: string,
): Promise<EmailDelivery> {
  return sendEmail({
    to: email,
    subject: "",
    template: "upgrade_confirmation",
    variables: { name, tier_name: tierName, snapshots_limit: snapshotsLimit, projects_limit: projectsLimit, programs_count: programsCount },
  });
}

export async function sendUsageAlert(
  email: string,
  name: string,
  used: string,
  limit: string,
  percent: string,
): Promise<EmailDelivery> {
  return sendEmail({
    to: email,
    subject: "",
    template: "usage_alert",
    variables: { name, used, limit, percent, upgrade_url: `${WEB_URL()}/account?upgrade=true` },
  });
}

export async function sendApiKeyNotification(
  email: string,
  name: string,
  label: string,
): Promise<EmailDelivery> {
  return sendEmail({
    to: email,
    subject: "",
    template: "api_key_created",
    variables: { name, label, account_url: `${WEB_URL()}/account` },
  });
}
