// ─── PAI'D Checkout — hosted-checkout redirect ──────────────────
//
// Collects the AXIS account email + billing cycle, asks the backend to create
// a PAI'D HOSTED checkout session, then redirects the buyer to PAI'D's hosted
// payment page. PAI'D hosts the card form — there is no inline Stripe Elements
// flow on this processor. Tier activation is webhook-driven on the API side
// after the payment completes, so the buyer simply returns via the success URL.

import { useState, useEffect, type FormEvent } from "react";
import { getPaidConfig, paidSubscribe, getAccount, ApiError } from "../api.ts";
import { Callout } from "../components/primitives/index.ts";
import { useFocusRetention } from "../useFocusRetention.ts";

type Step =
  | "loading"      // fetching /portal/api/paid/config
  | "unavailable"  // config says not configured (or config fetch failed)
  | "form"         // plan + email form
  | "redirecting"; // POST /portal/api/subscribe in flight → handing off to PAI'D

export function PaidCheckoutPage() {
  const [step, setStep] = useState<Step>("loading");
  const [plan, setPlan] = useState<"monthly" | "annual">("monthly");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Which tier the buyer picked on the Plans page (Starter is the back-compat default).
  const [planId] = useState<"starter" | "pro" | "growth">(() => {
    const p = sessionStorage.getItem("axis_paid_plan");
    return p === "pro" || p === "growth" ? p : "starter";
  });
  const planLabel = planId.charAt(0).toUpperCase() + planId.slice(1);

  const isLoggedIn = !!localStorage.getItem("axis_api_key");
  const submitButtonRef = useFocusRetention<HTMLButtonElement>(step === "redirecting");

  // Load PAI'D config on mount.
  useEffect(() => {
    let cancelled = false;
    getPaidConfig()
      .then((cfg) => {
        if (cancelled) return;
        setStep(cfg.configured ? "form" : "unavailable");
      })
      .catch(() => {
        if (!cancelled) setStep("unavailable");
      });
    return () => { cancelled = true; };
  }, []);

  // Prefill email from the signed-in account, if any.
  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    getAccount()
      .then((acct) => {
        if (!cancelled) setEmail((current) => current || acct.email);
      })
      .catch(() => { /* not signed in or account fetch failed — leave blank */ });
    return () => { cancelled = true; };
  }, [isLoggedIn]);

  async function handleSubscribe(e: FormEvent) {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Enter the email on your AXIS account.");
      return;
    }
    setError(null);
    setStep("redirecting");
    try {
      const result = await paidSubscribe(plan, trimmedEmail, crypto.randomUUID(), planId);
      // PAI'D hosts the payment page — hand off the browser to it.
      window.location.href = result.checkout_url;
    } catch (err) {
      setStep("form");
      if (err instanceof ApiError) {
        if (err.status === 503) {
          setError("Subscription billing isn't configured on the server right now. No charge was made. Please try again shortly.");
        } else if (err.status === 404) {
          setError("No AXIS account exists for that email. Create a free account first (Sign Up in the header), then come back here.");
        } else if (err.status === 502) {
          setError("The PAI'D billing service returned an error. No charge was made. Try again in a minute.");
        } else {
          setError(err.message);
        }
      } else {
        setError(err instanceof Error ? err.message : "Subscribe failed.");
      }
    }
  }

  if (step === "loading") {
    return (
      <div className="empty-state">
        <span className="spinner" /> Checking subscription availability...
      </div>
    );
  }

  if (step === "unavailable") {
    return (
      <div className="card" style={{ maxWidth: 520, margin: "40px auto", textAlign: "center" }}>
        <h2 style={{ marginBottom: 8 }}>Subscription checkout isn't available</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: 16 }}>
          This server doesn't have PAI'D billing configured, so checkout can't run right now.
          Please try again shortly.
        </p>
        <a className="btn btn-primary" href="#plans" style={{ display: "inline-flex", justifyContent: "center" }}>
          Back to Plans
        </a>
      </div>
    );
  }

  // step === "form" | "redirecting"
  const submitting = step === "redirecting";
  return (
    <div className="card" style={{ maxWidth: 520, margin: "40px auto" }}>
      <h2 style={{ marginBottom: 4 }}>Subscribe to {planLabel}</h2>
      <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: 16 }}>
        Billed securely through PAI'D. We'll take you to PAI'D's hosted checkout to enter payment.
        Your account is matched by email.
      </p>

      {error && (
        <div style={{ marginBottom: 16 }}>
          <Callout tone="danger">{error}</Callout>
        </div>
      )}

      <form onSubmit={(e) => { void handleSubscribe(e); }}>
        <fieldset style={{ border: "none", padding: 0, margin: "0 0 16px" }}>
          <legend style={{ padding: 0, marginBottom: 6, fontSize: "inherit", fontWeight: "inherit" }}>Billing cycle</legend>
          <div className="flex" style={{ gap: 8 }}>
            <button
              type="button"
              className={`btn ${plan === "monthly" ? "btn-primary" : ""}`}
              onClick={() => setPlan("monthly")}
              aria-pressed={plan === "monthly"}
              style={{ fontSize: "0.8125rem" }}
            >
              Monthly
            </button>
            <button
              type="button"
              className={`btn ${plan === "annual" ? "btn-primary" : ""}`}
              onClick={() => setPlan("annual")}
              aria-pressed={plan === "annual"}
              style={{ fontSize: "0.8125rem" }}
            >
              Annual
            </button>
          </div>
        </fieldset>

        <label htmlFor="paid-email">Email</label>
        <input
          id="paid-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          style={{ marginBottom: 16 }}
        />

        <button
          ref={submitButtonRef}
          type="submit"
          className="btn btn-primary"
          disabled={submitting}
          style={{ width: "100%", justifyContent: "center" }}
        >
          {submitting ? <><span className="spinner" /> Redirecting to checkout...</> : "Continue to checkout"}
        </button>
      </form>

      <p style={{ color: "var(--text-muted)", fontSize: "0.72rem", textAlign: "center", margin: "12px 0 0", lineHeight: 1.5 }}>
        By subscribing you agree to our{" "}
        <a href="#terms" style={{ color: "var(--accent)" }}>Terms of Service</a>.
        Payments processed securely by PAI'D. Cancel any time.
      </p>
    </div>
  );
}
