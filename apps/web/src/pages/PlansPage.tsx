import { useState, useEffect } from "react";
import { getPlans, createCheckout, type PlanDefinition, type PlanFeature, type BillingTier } from "../api.ts";

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
    if (planId === "suite") {
      // Enterprise is contact-sales
      window.location.href = "mailto:sales@lastmanup.com?subject=AXIS%20Toolbox%20Enterprise";
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
    // Trigger Lemon Squeezy checkout
    setCheckoutLoading(planId);
    setCheckoutError(null);
    try {
      const result = await createCheckout(planId as BillingTier);
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
          { id: "free", name: "Free", tagline: "Get started with core analysis tools", price_monthly_cents: 0, price_annual_cents: 0, highlights: ["3 core programs", "10 snapshots/month", "1 project"] },
          { id: "paid", name: "Pro", tagline: "Full toolkit for professional teams", price_monthly_cents: 2900, price_annual_cents: 27900, highlights: ["All 17 programs", "200 snapshots/month", "20 projects", "5 team seats"] },
          { id: "suite", name: "Enterprise Suite", tagline: "Unlimited scale for engineering orgs", price_monthly_cents: -1, price_annual_cents: -1, highlights: ["Unlimited everything", "SSO & audit logs", "Dedicated support"] },
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
    paid: "var(--accent)",
    suite: "var(--yellow)",
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
          Start free. Upgrade when you need more power.
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
              borderColor: plan.id === "paid" ? "var(--accent)" : undefined,
              position: "relative",
            }}
          >
            {plan.id === "paid" && (
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
                Most Popular
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
              className={`btn ${plan.id === "paid" ? "btn-primary" : ""}`}
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
                      ? "Upgrade to Pro"
                      : "Sign Up for Pro"}
            </button>
          </div>
        ))}
      </div>

      {features.length > 0 && (
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Feature Comparison</h3>
          <table>
            <thead>
              <tr>
                <th style={{ width: "40%" }}>Feature</th>
                <th style={{ width: "20%", textAlign: "center" }}>Free</th>
                <th style={{ width: "20%", textAlign: "center" }}>Pro</th>
                <th style={{ width: "20%", textAlign: "center" }}>Enterprise</th>
              </tr>
            </thead>
            <tbody>
              {features.map((f) => (
                <tr key={f.name}>
                  <td>{f.name}</td>
                  <td style={{ textAlign: "center" }}>{renderFeatureValue(f.free)}</td>
                  <td style={{ textAlign: "center" }}>{renderFeatureValue(f.pro)}</td>
                  <td style={{ textAlign: "center" }}>{renderFeatureValue(f.suite)}</td>
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
