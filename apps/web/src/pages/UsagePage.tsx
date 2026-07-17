import { useCallback, useEffect, useRef, useState } from "react";
import {
  getAccount,
  getAccountPlanId,
  getQuota,
  getUsage,
  getUsageTimeseries,
  getSubscription,
  cancelSubscription,
  getCredits,
  createCreditTopup,
  getPaidConfig,
  getProrationPreview,
  apiErrorDetails,
  type Account,
  type UsageSummary,
  type BillingTier,
  type SubscriptionInfo,
  type CreditsInfo,
  type UsageBucket,
  type ProrationPreview,
} from "../api.ts";
import { SectionHeader, StatTile, Sparkline, BarChart, Callout, Skeleton, Pill, TableWrap } from "../components/primitives/index.ts";
import { PROGRAM_COUNT } from "../config.ts";

// ─── UsagePage (WO-P10) ───────────────────────────────────────────────────
// Billing/usage half of the former AccountPage (split per the build plan;
// the profile/keys/seats half moved to Settings in WO-P12). New here: usage
// graphs (runs/day + credits-spent/day, 30d,
// GET /v1/account/usage/timeseries — WO-A3) and a tier-change proration
// preview (GET /v1/billing/proration). PAI'D remains the only checkout path
// for both the tier-upgrade banner and credit top-ups.

/** Click once to arm, click again to confirm — same pattern as
 *  VersionsTab.tsx/ProjectsPage.tsx/SettingsPage.tsx's DangerButton (each a
 *  small page-local copy; not shared, see any of them for the "why not a
 *  native confirm()"). */
function DangerButton({ label, confirmLabel, busy, onConfirm }: { label: string; confirmLabel: string; busy: boolean; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  const labelRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const wasArmed = useRef(false);

  // The confirm step replaces this control's whole subtree, which unmounts
  // whatever was just clicked and silently drops keyboard focus to <body>.
  // Move focus to the safer default (Cancel, not the destructive action)
  // on arm, and back to the label button when disarmed.
  useEffect(() => {
    if (armed && !wasArmed.current) cancelRef.current?.focus();
    if (!armed && wasArmed.current) labelRef.current?.focus();
    wasArmed.current = armed;
  }, [armed]);

  if (!armed) {
    return (
      <button ref={labelRef} type="button" className="btn text-sm" onClick={() => setArmed(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="flex gap-2" style={{ alignItems: "center", flexWrap: "wrap" }}>
      <span className="text-muted text-sm">{confirmLabel}</span>
      <button type="button" className="btn btn-primary" style={{ background: "var(--red)", borderColor: "var(--red)" }} disabled={busy} onClick={onConfirm}>
        {busy ? "Working..." : "Yes, cancel"}
      </button>
      <button ref={cancelRef} type="button" className="btn" disabled={busy} onClick={() => setArmed(false)}>Never mind</button>
    </span>
  );
}

const TIMESERIES_DAYS = 30;
// Starter and Pro both collapse into tier==="paid" — this default is only
// correct for Starter; callers with a real plan_id should prefer
// planLabel() below (H-Phase-A cycle 2: this table alone was silently
// mislabeling every Pro subscriber as "Starter" on their own billing page).
const TIER_LABELS: Record<BillingTier, string> = { free: "Free", paid: "Starter", suite: "Growth" };
const TIER_ORDER: BillingTier[] = ["free", "paid", "suite"];

/** The account's real plan label — planId (from usage_credits.plan_id) wins
 *  when it distinguishes Starter from Pro; otherwise falls back to the
 *  coarse tier label (matches TIER_LABELS for free/suite, where there's no
 *  Starter/Pro-style ambiguity to resolve). */
function planLabel(tier: BillingTier, planId: string | null): string {
  if (tier === "paid" && planId === "pro") return "Pro";
  return TIER_LABELS[tier];
}

function tierBadgeClass(tier: BillingTier): string {
  if (tier === "free") return "badge badge-green";
  if (tier === "paid") return "badge badge-accent";
  return "badge badge-yellow";
}

interface Data {
  account: Account;
  planId: string | null;
  quota: Awaited<ReturnType<typeof getQuota>>;
  usage: { tier: BillingTier; monthly_snapshots: number; project_count: number; by_program: UsageSummary[] };
  buckets: UsageBucket[];
  subscription: SubscriptionInfo | null;
  credits: CreditsInfo | null;
}

export function UsagePage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<{ message: string; details: string | null } | null>(null);
  const [topupBusy, setTopupBusy] = useState<string | null>(null);
  // One busy flag disables N per-pack buttons, so useFocusRetention's
  // single-button shape doesn't fit — track each pack's element in a
  // registry and refocus whichever one was actually busy once it clears
  // (only reachable on the error-retry path; success navigates away).
  const topupButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const lastBusyTopup = useRef<string | null>(null);
  useEffect(() => {
    if (topupBusy === null && lastBusyTopup.current) {
      topupButtonRefs.current.get(lastBusyTopup.current)?.focus();
    }
    lastBusyTopup.current = topupBusy;
  }, [topupBusy]);
  const [previewTier, setPreviewTier] = useState<BillingTier | "">("");
  const [preview, setPreview] = useState<ProrationPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [account, planId, quota, usage, timeseries, subscription, credits] = await Promise.all([
        getAccount(),
        getAccountPlanId().catch(() => null),
        getQuota(),
        getUsage(),
        getUsageTimeseries({ sinceDays: TIMESERIES_DAYS }),
        getSubscription().catch(() => null),
        getCredits().catch(() => null),
      ]);
      setData({ account, planId, quota, usage, buckets: timeseries.buckets, subscription, credits });
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : "Failed to load usage & billing", details: apiErrorDetails(err) });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!previewTier) { setPreview(null); return; }
    let cancelled = false;
    setPreviewLoading(true);
    setPreview(null);
    getProrationPreview(previewTier)
      .then((p) => { if (!cancelled) setPreview(p); })
      .catch((err) => { if (!cancelled) setError({ message: err instanceof Error ? err.message : "Failed to preview proration", details: apiErrorDetails(err) }); })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [previewTier]);

  async function handleUpgrade(planId: "starter" | "pro" | "growth") {
    setError(null);
    try {
      const cfg = await getPaidConfig();
      if (cfg.configured) {
        sessionStorage.setItem("axis_paid_plan", planId);
        window.location.hash = "paid-checkout";
        return;
      }
      setError({ message: "Checkout is temporarily unavailable — please try again shortly.", details: null });
    } catch {
      setError({ message: "Checkout is temporarily unavailable — please try again shortly.", details: null });
    }
  }

  const [cancelingSubscription, setCancelingSubscription] = useState(false);
  async function handleCancelSubscription() {
    setError(null);
    setCancelingSubscription(true);
    try {
      await cancelSubscription();
      await load();
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : "Cancellation failed", details: apiErrorDetails(err) });
    } finally {
      setCancelingSubscription(false);
    }
  }

  async function handleTopup(packId: string) {
    setTopupBusy(packId);
    try {
      const session = await createCreditTopup(packId);
      window.location.href = session.checkout_url;
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : "Top-up failed", details: apiErrorDetails(err) });
      setTopupBusy(null);
    }
  }

  if (error && !data) {
    return (
      <div>
        <SectionHeader title="Usage & Billing" level="h1" />
        <Callout tone="danger" title="Couldn't load your usage & billing" details={error.details}>{error.message}</Callout>
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <SectionHeader title="Usage & Billing" level="h1" />
        <div role="status" aria-busy="true">
          <Skeleton lines={6} height={60} />
        </div>
      </div>
    );
  }

  const { account, planId, quota, usage, buckets, subscription, credits } = data;
  const currentPlanLabel = planLabel(account.tier, planId);
  const maxSnapshots = quota.resource_quota?.max_snapshots_per_month ?? 0;
  const runsInWindow = buckets.reduce((s, b) => s + b.runs, 0);
  const creditsInWindow = buckets.reduce((s, b) => s + b.credits_spent, 0);

  return (
    <div>
      <SectionHeader title="Usage & Billing" sub="Your current plan, usage over time, and credit balance." level="h1" />

      {error && (
        <div className="mb-4">
          <Callout tone="danger" title="Something went wrong" details={error.details}>{error.message}</Callout>
        </div>
      )}

      {/* Tier + proration preview */}
      <div className="card">
        <div className="flex-between mb-2">
          <div>
            <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: 4 }}>Current plan</h2>
            <p className="text-muted text-sm">You're on the <strong>{currentPlanLabel}</strong> tier.</p>
          </div>
          <span className={tierBadgeClass(account.tier)}>{currentPlanLabel}</span>
        </div>

        {account.tier === "free" && (
          <div className="card" style={{ borderColor: "var(--accent)" }}>
            <div className="flex-between">
              <div>
                <h2 style={{ color: "var(--accent)", fontSize: "1rem", fontWeight: 600, marginBottom: 4 }}>Unlock all {PROGRAM_COUNT} programs</h2>
                <p className="text-muted text-sm mt-1">Upgrade to Starter for $29/month and 75,000 monthly credits.</p>
              </div>
              <button type="button" className="btn btn-primary" onClick={() => void handleUpgrade("starter")}>Upgrade to Starter</button>
            </div>
          </div>
        )}
        {account.tier === "paid" && (
          <div className="card" style={{ borderColor: "var(--yellow)" }}>
            <div className="flex-between">
              <div>
                <h2 style={{ color: "var(--yellow)", fontSize: "1rem", fontWeight: 600, marginBottom: 4 }}>Need more?</h2>
                <p className="text-muted text-sm mt-1">Move to Growth for $299/month and 1,200,000 monthly credits.</p>
              </div>
              <button type="button" className="btn" onClick={() => void handleUpgrade("growth")}>View Growth plan</button>
            </div>
          </div>
        )}

        <div className="mt-4">
          <label className="text-sm text-muted" htmlFor="proration-target">Preview a plan change</label>
          <div className="flex gap-2 mt-1" style={{ flexWrap: "wrap", alignItems: "center" }}>
            <select id="proration-target" value={previewTier} onChange={(e) => setPreviewTier(e.target.value as BillingTier | "")} style={{ maxWidth: 200 }}>
              <option value="">Select a tier…</option>
              {TIER_ORDER.filter((t) => t !== account.tier).map((t) => <option key={t} value={t}>{TIER_LABELS[t]}</option>)}
            </select>
            {previewLoading && <span className="text-muted text-sm">Calculating…</span>}
            {preview && !previewLoading && (
              <Pill tone={preview.direction === "upgrade" ? "accent" : "muted"}>
                {preview.direction === "upgrade" ? "Additional charge" : "Credit"}: ${(Math.abs(preview.proration_amount) / 100).toFixed(2)}
                {" "}({preview.days_remaining_in_period} of {preview.days_in_period} days left in period)
              </Pill>
            )}
          </div>
          <p className="text-muted text-xs mt-1">Preview only — nothing changes until you complete checkout on the Plans page.</p>
        </div>
      </div>

      {/* Subscription */}
      {subscription?.has_active_subscription && subscription.active_subscription && (
        <div className="card">
          <h2 className="mb-2" style={{ fontSize: "1rem", fontWeight: 600 }}>Subscription</h2>
          <div className="grid grid-3 mb-2">
            <div>
              <div className="stat-label">Status</div>
              <span className={`badge ${subscription.active_subscription.status === "active" ? "badge-green" : "badge-yellow"}`}>
                {subscription.active_subscription.status}
              </span>
            </div>
            {subscription.active_subscription.current_period_end && (
              <div>
                <div className="stat-label">Renews</div>
                <div className="text-sm">{new Date(subscription.active_subscription.current_period_end).toLocaleDateString()}</div>
              </div>
            )}
            {subscription.active_subscription.card_brand && (
              <div>
                <div className="stat-label">Payment</div>
                <div className="text-sm">{subscription.active_subscription.card_brand} ····{subscription.active_subscription.card_last_four}</div>
              </div>
            )}
          </div>
          {subscription.active_subscription.cancel_at ? (
            <p className="text-sm" style={{ color: "var(--yellow)" }}>
              Cancels on {new Date(subscription.active_subscription.cancel_at).toLocaleDateString()}
            </p>
          ) : (
            <DangerButton
              label="Cancel Subscription"
              confirmLabel="Cancel your subscription? You'll keep access until the current period ends."
              busy={cancelingSubscription}
              onConfirm={() => void handleCancelSubscription()}
            />
          )}
        </div>
      )}

      {/* Usage graphs */}
      <div className="grid grid-4 mb-4">
        <StatTile
          label={`Snapshots this month`}
          value={usage.monthly_snapshots}
          hint={maxSnapshots > 0 ? `of ${maxSnapshots.toLocaleString()} limit` : "unlimited"}
        />
        <StatTile label="Active projects" value={usage.project_count} />
        <StatTile
          label={`Runs (${TIMESERIES_DAYS}d)`}
          value={runsInWindow}
          trend={<Sparkline data={buckets.map((b) => b.runs)} pointLabels={buckets.map((b) => b.date)} label={`Runs per day, last ${TIMESERIES_DAYS} days`} width={120} height={28} />}
        />
        <StatTile label={`Credits spent (${TIMESERIES_DAYS}d)`} value={creditsInWindow} />
      </div>

      {buckets.length > 0 && (
        <div className="card">
          <h2 className="mb-2" style={{ fontSize: "1rem", fontWeight: 600 }}>Runs per day ({TIMESERIES_DAYS}d)</h2>
          <BarChart
            data={buckets.map((b) => ({ label: new Date(b.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }), value: b.runs }))}
            label={`Runs per day, last ${TIMESERIES_DAYS} days`}
          />
        </div>
      )}

      {/* Credits */}
      {credits && (
        <div className="card">
          <h2 className="mb-2" style={{ fontSize: "1rem", fontWeight: 600 }}>Persistence Credits</h2>
          <div className="grid grid-3">
            <StatTile label="Credits remaining" value={credits.balance} />
            <StatTile label="Transactions" value={credits.ledger.length} />
            <StatTile label="Tier" value={credits.tier} />
          </div>
          {credits.credit_packs.length > 0 && (
            <div className="mt-4">
              <p className="text-sm text-muted mb-2">Buy more credits — secure checkout via PAI&apos;D</p>
              <div className="grid grid-3">
                {credits.credit_packs.map((p) => (
                  <button
                    key={p.pack_id}
                    ref={(el) => { if (el) topupButtonRefs.current.set(p.pack_id, el); else topupButtonRefs.current.delete(p.pack_id); }}
                    type="button"
                    className="btn"
                    disabled={topupBusy !== null}
                    onClick={() => void handleTopup(p.pack_id)}
                  >
                    {topupBusy === p.pack_id ? "Redirecting…" : `${p.credits.toLocaleString()} credits — $${(p.price_cents / 100).toFixed(0)}`}
                  </button>
                ))}
              </div>
            </div>
          )}
          {credits.ledger.length > 0 && (
            <details className="mt-4">
              <summary className="text-sm text-muted" style={{ cursor: "pointer" }}>Recent transactions</summary>
              <TableWrap label="Recent credit transactions">
                <table className="mt-2">
                  <thead>
                    <tr><th>Date</th><th style={{ textAlign: "right" }}>Amount</th><th>Reason</th></tr>
                  </thead>
                  <tbody>
                    {credits.ledger.slice(0, 10).map((e) => (
                      <tr key={e.entry_id}>
                        <td className="text-xs">{new Date(e.created_at).toLocaleDateString()}</td>
                        <td style={{ textAlign: "right", color: e.delta >= 0 ? "var(--success)" : "var(--danger)" }}>{e.delta >= 0 ? "+" : ""}{e.delta}</td>
                        <td className="text-sm">{e.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </details>
          )}
        </div>
      )}

      {/* Per-program usage */}
      {usage.by_program.length > 0 && (
        <div className="card">
          <h2 className="mb-2" style={{ fontSize: "1rem", fontWeight: 600 }}>Program Usage</h2>
          <TableWrap label="Program usage">
            <table>
              <thead>
                <tr><th>Program</th><th style={{ textAlign: "right" }}>Runs</th><th style={{ textAlign: "right" }}>Generators</th><th style={{ textAlign: "right" }}>Input Files</th></tr>
              </thead>
              <tbody>
                {usage.by_program.map((p) => (
                  <tr key={p.program}>
                    <td><span className="badge">{p.program}</span></td>
                    <td style={{ textAlign: "right" }}>{p.total_runs}</td>
                    <td style={{ textAlign: "right" }}>{p.total_generators}</td>
                    <td style={{ textAlign: "right" }}>{p.total_input_files}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </div>
      )}
    </div>
  );
}
