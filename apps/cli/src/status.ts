// ─── Account status against the live AXIS API ───────────────────
//
// Uses global fetch (Node 20+, zero dependencies). Never throws: every
// network / timeout / auth failure degrades to an honest AccountStatus so
// `axis-iliad status` can print the truth and still exit 0.

export interface AccountStatus {
  reachable: boolean;
  authenticated: boolean;
  plan?: string;
  usage?: { calls?: number; period?: string };
  api_url: string;
  error?: string;
}

/** Public production API — override with AXIS_API_URL or `auth` config. */
export const DEFAULT_API_URL = "https://axis-api-6c7z.onrender.com";

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v !== null && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/**
 * Map a GET /v1/account payload to { plan, usage }.
 *
 * Accepts both the real API shape
 *   { account: { tier }, usage_credits: { month_key, included_credits_used,
 *     overage_credits_this_month }, quota: { tier, snapshots_this_month } }
 * and the simple stub shape { plan, usage: { calls, period } }.
 */
export function mapAccountPayload(body: unknown): { plan?: string; usage?: { calls?: number; period?: string } } {
  const root = asRecord(body);
  if (!root) return {};

  const account = asRecord(root.account);
  const quota = asRecord(root.quota);
  const credits = asRecord(root.usage_credits);

  const plan = asString(root.plan) ?? asString(account?.tier) ?? asString(quota?.tier);

  let usage: { calls?: number; period?: string } | undefined;
  const directUsage = asRecord(root.usage);
  if (directUsage) {
    usage = { calls: asNumber(directUsage.calls), period: asString(directUsage.period) };
  } else if (credits) {
    const included = asNumber(credits.included_credits_used) ?? 0;
    const overage = asNumber(credits.overage_credits_this_month) ?? 0;
    usage = { calls: included + overage, period: asString(credits.month_key) };
  } else if (quota) {
    usage = { calls: asNumber(quota.snapshots_this_month), period: "this month" };
  }

  return { plan, usage };
}

/**
 * GET `${apiUrl}/v1/account` with a Bearer key and a hard timeout.
 * Never throws — degrades to { reachable/authenticated: false, error }.
 */
export async function fetchAccountStatus(
  apiUrl: string,
  apiKey?: string,
  timeoutMs = 3000,
): Promise<AccountStatus> {
  const base = apiUrl.replace(/\/+$/, "");
  const result: AccountStatus = {
    reachable: false,
    authenticated: false,
    api_url: base,
  };

  let res: Response;
  try {
    res = await fetch(`${base}/v1/account`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.error = /abort|timeout/i.test(message) ? `timed out after ${timeoutMs}ms` : message;
    return result;
  }

  result.reachable = true;

  if (res.status === 401 || res.status === 403) {
    result.error = apiKey
      ? `unauthorized (HTTP ${res.status}) — check your API key`
      : `authentication required (HTTP ${res.status}) — run: axis-iliad auth --key <api_key>`;
    return result;
  }

  if (!res.ok) {
    result.error = `unexpected response: HTTP ${res.status}`;
    return result;
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    result.error = "API returned a non-JSON response";
    return result;
  }

  const { plan, usage } = mapAccountPayload(body);
  result.authenticated = true;
  result.plan = plan;
  result.usage = usage;
  return result;
}
