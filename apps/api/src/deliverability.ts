// ─── E11 Deliverability: email auth + warmup kit ────────────────
//
// iliad_transactional_email's engineer mode: given a domain, generate a complete
// deliverability setup — SPF / DKIM / DMARC DNS records (with a freshly generated
// DKIM keypair), a sender warmup schedule, and a verification checklist. Pure
// generation: no email is sent and no ESP key is needed (it's setup, not send).
// Dependency-free (node:crypto). The DKIM keypair is intentionally random (a
// unique signing key per setup) — not byte-deterministic.

import { generateKeyPairSync } from "node:crypto";

export interface DnsRecord {
  type: "TXT";
  host: string;
  value: string;
  purpose: "SPF" | "DKIM" | "DMARC";
}

export interface WarmupDay {
  day: number;
  max_sends: number;
  note: string;
}

export interface DeliverabilityKit {
  domain: string;
  provider: string;
  dns_records: DnsRecord[];
  dkim_private_key_pem: string;
  dkim_selector: string;
  warmup_schedule: WarmupDay[];
  checklist: string[];
}

// SPF include for known ESPs (Resend sends through Amazon SES).
const PROVIDER_SPF_INCLUDE: Record<string, string> = {
  resend: "include:amazonses.com",
  ses: "include:amazonses.com",
  sendgrid: "include:sendgrid.net",
  mailgun: "include:mailgun.org",
  postmark: "include:spf.mtasv.net",
  google: "include:_spf.google.com",
};

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

/** Validate a domain — rejects anything that could break a DNS record value. */
export function assertValidDomain(domain: string): void {
  if (typeof domain !== "string" || !DOMAIN_RE.test(domain)) {
    throw new Error("deliverability: `domain` must be a valid DNS domain (e.g. mail.example.com)");
  }
}

export function buildSpfRecord(domain: string, provider: string): DnsRecord {
  const include = PROVIDER_SPF_INCLUDE[provider.toLowerCase()] ?? "include:amazonses.com";
  return { type: "TXT", host: domain, value: `v=spf1 ${include} ~all`, purpose: "SPF" };
}

export function buildDmarcRecord(domain: string, policy: "none" | "quarantine" | "reject" = "none"): DnsRecord {
  return {
    type: "TXT",
    host: `_dmarc.${domain}`,
    value: `v=DMARC1; p=${policy}; rua=mailto:dmarc@${domain}; adkim=s; aspf=s; pct=100`,
    purpose: "DMARC",
  };
}

/** Generate a fresh DKIM RSA-2048 keypair → the public DNS record + the private key (PEM). */
export function generateDkim(domain: string, selector: string): { record: DnsRecord; private_key_pem: string } {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return {
    record: {
      type: "TXT",
      host: `${selector}._domainkey.${domain}`,
      value: `v=DKIM1; k=rsa; p=${(publicKey as Buffer).toString("base64")}`,
      purpose: "DKIM",
    },
    private_key_pem: privateKey as string,
  };
}

/** Deterministic doubling warmup ramp, capped. */
export function buildWarmupSchedule(opts?: { days?: number; start?: number; cap?: number }): WarmupDay[] {
  const days = Math.min(60, Math.max(1, Math.floor(opts?.days ?? 14)));
  const start = Math.max(1, Math.floor(opts?.start ?? 50));
  const cap = Math.max(start, Math.floor(opts?.cap ?? 100_000));
  const schedule: WarmupDay[] = [];
  let vol = start;
  for (let day = 1; day <= days; day++) {
    schedule.push({
      day,
      max_sends: Math.min(vol, cap),
      note: day === 1 ? "Start with your most engaged recipients." : "Hold >98% delivered & <0.1% complaints before the next step.",
    });
    vol = Math.min(vol * 2, cap);
  }
  return schedule;
}

const SELECTOR_RE = /^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/i;

/**
 * Build the full deliverability kit for a domain. Validates the domain + selector
 * (so neither can break a DNS record), generates a fresh DKIM keypair, and
 * assembles SPF/DKIM/DMARC records + a warmup schedule + a checklist.
 */
export function buildDeliverabilityKit(
  domain: string,
  opts?: { provider?: string; selector?: string; dmarc_policy?: "none" | "quarantine" | "reject" },
): DeliverabilityKit {
  assertValidDomain(domain);
  const provider = (opts?.provider ?? "resend").toLowerCase();
  const selector = opts?.selector ?? "axis";
  if (!SELECTOR_RE.test(selector)) {
    throw new Error("deliverability: `selector` must be alphanumeric/hyphen (1-32 chars)");
  }

  const spf = buildSpfRecord(domain, provider);
  const dkim = generateDkim(domain, selector);
  const dmarc = buildDmarcRecord(domain, opts?.dmarc_policy ?? "none");

  return {
    domain,
    provider,
    dns_records: [spf, dkim.record, dmarc],
    dkim_private_key_pem: dkim.private_key_pem,
    dkim_selector: selector,
    warmup_schedule: buildWarmupSchedule(),
    checklist: [
      `Add the 3 TXT records to ${domain}'s DNS.`,
      `Install the DKIM private key in ${provider} under selector "${selector}".`,
      "Verify propagation (dig +short TXT) before sending real mail.",
      "Follow the warmup schedule; watch the DMARC aggregate reports (rua).",
      "Raise the DMARC policy none → quarantine → reject once SPF+DKIM align.",
    ],
  };
}
