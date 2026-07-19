import { useState, useEffect } from "react";
import { getPlans, getPaidConfig, getAccount, type PlanDefinition, type PlanFeature, type BillingTier } from "../api.ts";
import { Callout } from "../components/primitives/index.ts";
// Single-source counts (WO-F5) — never inline these numbers.
import { PROGRAM_COUNT } from "../config.ts";

interface Props {
  loggedIn: boolean;
  onSelectPlan: () => void;
  onRequireLogin?: () => void;
}

function formatPrice(cents: number): string {
  if (cents === 0) return "Free";
  if (cents < 0) return "Contact Sales";
  return `$${(cents / 100).toFixed(0)}`;
}

export function PlansPage({ loggedIn, onSelectPlan, onRequireLogin }: Props) {
  const [plans, setPlans] = useState<PlanDefinition[]>([]);
  const [features, setFeatures] = useState<PlanFeature[]>([]);
  const [annual, setAnnual] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [fallbackPricing, setFallbackPricing] = useState(false);
  // H-Phase-A cycle 7: PAI'D is the only live checkout path and has no
  // cancel/modify API — starting a new checkout while already on a paid
  // plan creates a SECOND, separate subscription rather than replacing the
  // first (nothing in this codebase can ever cancel it afterward). Best-
  // effort, not gating the button: an account this reads wrong for still
  // sees a real checkout, just without the warning.
  const [accountTier, setAccountTier] = useState<BillingTier | null>(null);

  async function handlePlanSelect(planId: string) {
    if (planId === "free") {
      onSelectPlan(); // Signed-in users land on Settings (account redirects there); signed-out users hit the login gate first.
      return;
    }
    if (planId === "enterprise") {
      // Enterprise is contact-sales
      window.location.href = "mailto:sales@lastmanup.com?subject=Axis%27%20Iliad%20Enterprise";
      return;
    }
    if (!loggedIn) {
      if (onRequireLogin) {
        onRequireLogin();
      } else {
        onSelectPlan();
      }
      return;
    }
    // Trigger checkout — PAI'D is the ONLY checkout path. PAI'D → Stripe is the sole
    // money path; the app never charges Stripe directly. The chosen tier is handed to
    // the PAI'D checkout page via sessionStorage.
    setCheckoutLoading(planId);
    setCheckoutError(null);
    try {
      const cfg = await getPaidConfig();
      if (cfg.configured) {
        sessionStorage.setItem("axis_paid_plan", planId);
        setCheckoutLoading(null);
        window.location.hash = "paid-checkout";
        return;
      }
      setCheckoutError("Checkout is temporarily unavailable — please try again shortly.");
    } catch {
      setCheckoutError("Checkout is temporarily unavailable — please try again shortly.");
    }
    setCheckoutLoading(null);
  }

  useEffect(() => {
    getPlans()
      .then((data) => {
        // A malformed 200 is a failure too — never store junk (H1.2 class),
        // never present non-live data as live (H0.9).
        if (!Array.isArray(data.plans)) throw new Error("malformed plans payload");
        setPlans(data.plans);
        setFeatures(Array.isArray(data.features) ? data.features : []);
      })
      .catch(() => {
        // Fallback if API not running — show static data, DISCLOSED as such.
        setFallbackPricing(true);
        setPlans([
          { id: "free", name: "Free", tagline: "Core files and evaluation tier", price_monthly_cents: 0, price_annual_cents: 0, highlights: ["10,000 monthly credits", "Core outputs stay free", "Best for evaluation"] },
          { id: "starter", name: "Starter", tagline: "Best for solo builders and small agents", price_monthly_cents: 2900, price_annual_cents: 27840, highlights: ["75,000 monthly credits", `All ${PROGRAM_COUNT} programs`, "Overage at $0.0018/credit"] },
          { id: "pro", name: "Pro", tagline: "More credits for active teams", price_monthly_cents: 9900, price_annual_cents: 95040, highlights: ["300,000 monthly credits", `All ${PROGRAM_COUNT} programs`, "Overage at $0.0018/credit"] },
          { id: "growth", name: "Growth", tagline: "Production scale and heavier usage", price_monthly_cents: 29900, price_annual_cents: 287040, highlights: ["1,200,000 monthly credits", `All ${PROGRAM_COUNT} programs`, "Priority support"] },
          { id: "enterprise", name: "Enterprise", tagline: "Custom contracts and volume pricing", price_monthly_cents: -1, price_annual_cents: -1, highlights: ["Custom credits and limits", "Dedicated support", "Security review"] },
        ]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    getAccount()
      .then((account) => setAccountTier(account.tier))
      .catch(() => {}); // best-effort warning only — never blocks checkout on a failed read
  }, [loggedIn]);

  if (loading) {
    return (
      <div className="empty-state">
        <span className="spinner" /> Loading plans...
      </div>
    );
  }

  const tierColors: Record<string, string> = {
    free: "var(--green)",
    starter: "var(--accent)",
    pro: "var(--yellow)",
    growth: "var(--orange)",
    enterprise: "var(--text-muted)",
  };

  return (
    <div>
      {checkoutError && (
        <div style={{ marginBottom: 16 }}>
          <Callout tone="danger">{checkoutError}</Callout>
        </div>
      )}
      {fallbackPricing && (
        <div style={{ maxWidth: 640, margin: "0 auto 16px" }}>
          <Callout tone="warning" title="Showing standard pricing">
            Live plan data is unavailable right now — these are our standard published prices.
            Refresh to retry live pricing.
          </Callout>
        </div>
      )}
      {/* H-Phase-A cycle 7: PAI'D has no cancel/modify API — starting a new
          checkout below while already on a paid plan creates a SECOND,
          separate subscription rather than replacing the current one. */}
      {accountTier && accountTier !== "free" && (
        <div style={{ maxWidth: 640, margin: "0 auto 16px" }}>
          <Callout tone="warning" title="You're already on a paid plan">
            Choosing a plan below starts a brand-new subscription — it does NOT replace or
            cancel your current one, and you'd be billed for both. Email support@jonathanarvay.com
            to change or cancel your existing plan first.
          </Callout>
        </div>
      )}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 600, marginBottom: 8 }}>Choose Your Plan</h1>
        <p style={{ color: "var(--text-muted)", maxWidth: 500, margin: "0 auto 16px" }}>
          Blended credit model: Free, Starter, Pro, Growth, and Enterprise. Annual billing saves 20%.
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginBottom: 16 }}>
          Pro is $99/month with 300,000 monthly credits.
        </p>
        <div className="flex" style={{ gap: 8, justifyContent: "center" }}>
          <button
            className={`btn ${!annual ? "btn-primary" : ""}`}
            onClick={() => setAnnual(false)}
            aria-pressed={!annual}
            style={{ fontSize: "0.8125rem" }}
          >
            Monthly
          </button>
          <button
            className={`btn ${annual ? "btn-primary" : ""}`}
            onClick={() => setAnnual(true)}
            aria-pressed={annual}
            style={{ fontSize: "0.8125rem" }}
          >
            Annual <span className="badge badge-green" style={{ marginLeft: 4 }}>Save 20%</span>
          </button>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 32 }}>
        {plans.map((plan) => (
          <div
            key={plan.id}
            className="card"
            style={{
              borderColor: plan.id === "pro" ? "var(--accent)" : undefined,
              position: "relative",
            }}
          >
            {plan.id === "pro" && (
              <div
                style={{
                  position: "absolute",
                  top: -12,
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "var(--accent)",
                  color: "white",
                  padding: "2px 12px",
                  borderRadius: 12,
                  fontSize: "0.75rem",
                  fontWeight: 600,
                }}
              >
                Popular
              </div>
            )}
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <h2 style={{ color: tierColors[plan.id], fontSize: "1.25rem", marginBottom: 4 }}>{plan.name}</h2>
              <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginBottom: 12 }}>
                {plan.tagline}
              </p>
              <div style={{ fontSize: "2.5rem", fontWeight: 700 }}>
                {formatPrice(annual ? plan.price_annual_cents : plan.price_monthly_cents)}
              </div>
              {plan.price_monthly_cents > 0 && (
                <p style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                  {annual ? "/year" : "/month"}
                  {annual && (
                    <span style={{ marginLeft: 4 }}>
                      (${(plan.price_annual_cents / 100 / 12).toFixed(2)}/mo)
                    </span>
                  )}
                </p>
              )}
            </div>

            <ul style={{ listStyle: "none", padding: 0, marginBottom: 16 }}>
              {plan.highlights.map((h, i) => (
                <li
                  key={i}
                  style={{
                    padding: "6px 0",
                    borderBottom: "1px solid var(--border)",
                    fontSize: "0.875rem",
                    display: "flex",
                    gap: 8,
                  }}
                >
                  <span style={{ color: tierColors[plan.id] }}>✓</span>
                  {h}
                </li>
              ))}
            </ul>

            <button
              className={`btn ${plan.id === "pro" ? "btn-primary" : ""}`}
              style={{ width: "100%", justifyContent: "center" }}
              onClick={() => { void handlePlanSelect(plan.id); }}
              disabled={checkoutLoading === plan.id}
            >
              {checkoutLoading === plan.id
                ? "Redirecting to checkout…"
                : plan.price_monthly_cents === 0
                  ? "Get Started Free"
                  : plan.price_monthly_cents < 0
                    ? "Contact Sales"
                    : loggedIn
                      ? `Choose ${plan.name}`
                      : `Sign Up for ${plan.name}`}
            </button>            {plan.price_monthly_cents > 0 && (
              <p style={{ color: "var(--text-muted)", fontSize: "0.72rem", textAlign: "center", margin: "8px 0 0", lineHeight: 1.5 }}>
                By subscribing you agree to our{" "}
                <a href="#terms" style={{ color: "var(--accent)" }}>Terms of Service</a>.
                Payments processed securely by PAI'D. To cancel or change your plan, email support@jonathanarvay.com.
              </p>
            )}          </div>
        ))}
      </div>

      {features.length > 0 && (
        <div className="card">
          <h2 style={{ marginBottom: 16, fontSize: "1rem", fontWeight: 600 }}>Feature Comparison</h2>
          <table>
            <thead>
              <tr>
                <th style={{ width: "40%" }}>Feature</th>
                {plans.map((plan) => (
                  <th key={plan.id} style={{ width: `${60 / Math.max(plans.length, 1)}%`, textAlign: "center" }}>{plan.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {features.map((f) => (
                <tr key={f.name}>
                  <td>{f.name}</td>
                  {plans.map((plan) => (
                    <td key={plan.id} style={{ textAlign: "center" }}>{renderFeatureValue(f[plan.id as keyof PlanFeature] as string | boolean | number)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function renderFeatureValue(val: string | boolean | number) {
  if (val === true) return <span style={{ color: "var(--green)" }}>✓</span>;
  if (val === false) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  if (val === "Coming soon") return <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontStyle: "italic" }}>Coming soon</span>;
  return <span>{String(val)}</span>;
}
