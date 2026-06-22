import { useState, useEffect } from "react";
import { getPlans, createCheckout, getPaidConfig, type PlanDefinition, type PlanFeature } from "../api.ts";

interface Props {
  onSelectPlan: () => void;
  onRequireLogin?: () => void;
}

function formatPrice(cents: number): string {
  if (cents === 0) return "Free";
  if (cents < 0) return "Contact Sales";
  return `$${(cents / 100).toFixed(0)}`;
}

export function PlansPage({ onSelectPlan, onRequireLogin }: Props) {
  const [plans, setPlans] = useState<PlanDefinition[]>([]);
  const [features, setFeatures] = useState<PlanFeature[]>([]);
  const [annual, setAnnual] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const isLoggedIn = !!localStorage.getItem("axis_api_key");

  async function handlePlanSelect(planId: string) {
    if (planId === "free") {
      onSelectPlan(); // Navigate to account page for free signup
      return;
    }
    if (planId === "enterprise") {
      // Enterprise is contact-sales
      window.location.href = "mailto:sales@lastmanup.com?subject=Axis%27%20Iliad%20Enterprise";
      return;
    }
    if (!isLoggedIn) {
      if (onRequireLogin) {
        onRequireLogin();
      } else {
        onSelectPlan();
      }
      return;
    }
    // Trigger checkout
    setCheckoutLoading(planId);
    setCheckoutError(null);
    // Starter (tier "paid") can use the embedded PAI'D checkout when the
    // server has it configured. Probe lazily on click; any failure falls
    // through to the standard Stripe checkout below.
    if (planId === "starter") {
      try {
        const cfg = await getPaidConfig();
        if (cfg.configured) {
          setCheckoutLoading(null);
          window.location.hash = "paid-checkout";
          return;
        }
      } catch {
        // Config probe failed — use the standard Stripe checkout.
      }
    }
    try {
      const result = await createCheckout(planId as "starter" | "pro" | "growth", annual ? "annual" : "monthly");
      window.location.href = result.checkout_url;
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "Checkout failed");
      setCheckoutLoading(null);
    }
  }

  useEffect(() => {
    getPlans()
      .then((data) => {
        setPlans(data.plans);
        setFeatures(data.features);
      })
      .catch(() => {
        // Fallback if API not running — show static data
        setPlans([
          { id: "free", name: "Free", tagline: "Core files and evaluation tier", price_monthly_cents: 0, price_annual_cents: 0, highlights: ["10,000 monthly credits", "Core outputs stay free", "Best for evaluation"] },
          { id: "starter", name: "Starter", tagline: "Best for solo builders and small agents", price_monthly_cents: 2900, price_annual_cents: 27840, highlights: ["75,000 monthly credits", "All 19 programs", "Overage at $0.0018/credit"] },
          { id: "pro", name: "Pro", tagline: "More credits for active teams", price_monthly_cents: 9900, price_annual_cents: 95040, highlights: ["300,000 monthly credits", "All 19 programs", "Overage at $0.0018/credit"] },
          { id: "growth", name: "Growth", tagline: "Production scale and heavier usage", price_monthly_cents: 29900, price_annual_cents: 287040, highlights: ["1,200,000 monthly credits", "All 19 programs", "Priority support"] },
          { id: "enterprise", name: "Enterprise", tagline: "Custom contracts and volume pricing", price_monthly_cents: -1, price_annual_cents: -1, highlights: ["Custom credits and limits", "Dedicated support", "Security review"] },
        ]);
      })
      .finally(() => setLoading(false));
  }, []);

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
        <div className="card" style={{ borderColor: "var(--red)", marginBottom: 16 }}>
          <p style={{ color: "var(--red)", fontSize: "0.875rem", margin: 0 }}>{checkoutError}</p>
        </div>
      )}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <h2 style={{ fontSize: "2rem", marginBottom: 8 }}>Choose Your Plan</h2>
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
            style={{ fontSize: "0.8125rem" }}
          >
            Monthly
          </button>
          <button
            className={`btn ${annual ? "btn-primary" : ""}`}
            onClick={() => setAnnual(true)}
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
              <h3 style={{ color: tierColors[plan.id], fontSize: "1.25rem" }}>{plan.name}</h3>
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
              onClick={() => handlePlanSelect(plan.id)}
              disabled={checkoutLoading === plan.id}
            >
              {checkoutLoading === plan.id
                ? "Redirecting to checkout…"
                : plan.price_monthly_cents === 0
                  ? "Get Started Free"
                  : plan.price_monthly_cents < 0
                    ? "Contact Sales"
                    : isLoggedIn
                      ? `Choose ${plan.name}`
                      : `Sign Up for ${plan.name}`}
            </button>            {plan.price_monthly_cents > 0 && (
              <p style={{ color: "var(--text-muted)", fontSize: "0.72rem", textAlign: "center", margin: "8px 0 0", lineHeight: 1.5 }}>
                By subscribing you agree to our{" "}
                <a href="#terms" style={{ color: "var(--accent)" }}>Terms of Service</a>.
                Payments processed by Stripe. Cancel any time.
              </p>
            )}          </div>
        ))}
      </div>

      {features.length > 0 && (
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Feature Comparison</h3>
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
