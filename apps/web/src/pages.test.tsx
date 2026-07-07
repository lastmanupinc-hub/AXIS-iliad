/**
 * @vitest-environment happy-dom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// ─── Zero-prop page smoke tests ─────────────────────────────────
// Each test renders the page and verifies it mounts without throwing.

import { DocsPage } from "./pages/DocsPage";
import { ExamplesPage } from "./pages/ExamplesPage";
import { ForAgentsPage } from "./pages/ForAgentsPage";
import { HelpPage } from "./pages/HelpPage";
import { InstallPage } from "./pages/InstallPage";
import { QAPage } from "./pages/QAPage";
import { TermsPage } from "./pages/TermsPage";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.endsWith("/v1/plans")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ plans: [], features: [] }),
      } satisfies Partial<Response> as Response;
    }

    if (url.endsWith("/v1/health")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: "ok", version: "test" }),
      } satisfies Partial<Response> as Response;
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({}),
    } satisfies Partial<Response> as Response;
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Page smoke tests — zero-prop pages", () => {
  it("DocsPage renders without crashing", () => {
    const { container } = render(<DocsPage />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("ExamplesPage renders without crashing", () => {
    const { container } = render(<ExamplesPage />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("ForAgentsPage renders without crashing", () => {
    const { container } = render(<ForAgentsPage />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("HelpPage renders without crashing", () => {
    const { container } = render(<HelpPage />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("InstallPage renders without crashing", () => {
    const { container } = render(<InstallPage />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("QAPage renders without crashing", () => {
    const { container } = render(<QAPage />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("TermsPage renders without crashing", () => {
    const { container } = render(<TermsPage />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });
});

describe("Referral copy stays factual — no growth-pitch framing", () => {
  it("ForAgentsPage describes the referral program neutrally", () => {
    const { container } = render(<ForAgentsPage />);
    const html = container.innerHTML;
    expect(html).not.toContain("The more agents you refer");
    expect(html).not.toContain("you can share");
    expect(html).toContain("Referral Program (Opt-In)");
    expect(html).toContain("get_referral_credits");
  });

  it("InstallPage describes the referral program neutrally", () => {
    const { container } = render(<InstallPage />);
    const html = container.innerHTML;
    expect(html).not.toContain("The more agents you refer");
    expect(html).toContain("Referral Program (Opt-In)");
  });

  it("QAPage billing answer avoids referral growth-pitch framing", () => {
    const { container } = render(<QAPage />);
    const html = container.innerHTML;
    expect(html).not.toContain("The more agents you refer");
  });
});

// ─── Prop-taking page smoke tests ───────────────────────────────

import { AccountPage } from "./pages/AccountPage";
import { AdminPage } from "./pages/AdminPage";
import { MyAnalyticsPage } from "./pages/MyAnalyticsPage";
import { PlansPage } from "./pages/PlansPage";
import { ProgramsPage } from "./pages/ProgramsPage";
import { UploadPage } from "./pages/UploadPage";

describe("Page smoke tests — pages with required props", () => {
  it("AccountPage renders with minimal props", () => {
    const { container } = render(<AccountPage />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("AdminPage renders with minimal props", () => {
    const { container } = render(<AdminPage />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("MyAnalyticsPage renders with minimal props", () => {
    const { container } = render(<MyAnalyticsPage />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("PlansPage renders with noop callbacks", () => {
    const { container } = render(<PlansPage onSelectPlan={() => {}} onRequireLogin={() => {}} />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("ProgramsPage renders with noop callback", () => {
    const { container } = render(<ProgramsPage onAnalyze={() => {}} />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("UploadPage renders with noop callback", () => {
    const { container } = render(<UploadPage onComplete={() => {}} />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });
});

// ─── 404 page (WO-F2) ───────────────────────────────────────────

import { NotFoundPage } from "./pages/NotFoundPage";

describe("NotFoundPage", () => {
  const destinations = [
    { page: "docs" as const, label: "Docs", hash: "docs" },
    { page: "plans" as const, label: "Plans", hash: "plans" },
  ];

  it("reports the bad hash", () => {
    render(<NotFoundPage badHash="bogus/route" destinations={destinations} onNavigate={() => {}} />);
    expect(screen.getByText("404")).toBeTruthy();
    expect(screen.getByText(/bogus\/route/)).toBeTruthy();
  });

  it("offers Analyze / Docs / Help quick links", () => {
    const seen: string[] = [];
    render(<NotFoundPage badHash="x" destinations={destinations} onNavigate={(p) => seen.push(p)} />);
    fireEvent.click(screen.getByRole("button", { name: "Analyze" }));
    fireEvent.click(screen.getByRole("button", { name: "Docs" }));
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(seen).toEqual(["upload", "docs", "help"]);
  });

  it("search filters destinations and navigates on click", () => {
    const seen: string[] = [];
    render(<NotFoundPage badHash="x" destinations={destinations} onNavigate={(p) => seen.push(p)} />);
    fireEvent.change(screen.getByLabelText("Search pages"), { target: { value: "pla" } });
    fireEvent.click(screen.getByRole("button", { name: "Go to Plans" }));
    expect(seen).toEqual(["plans"]);
  });
});

// ─── PAI'D checkout flow ────────────────────────────────────────

import { PaidCheckoutPage } from "./pages/PaidCheckoutPage";

/** Route-table fetch stub: matches by URL suffix, falls back to empty 200. */
function paidFetchStub(routes: Record<string, { status?: number; body: unknown }>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [path, route] of Object.entries(routes)) {
      if (url.endsWith(path)) {
        const status = route.status ?? 200;
        return {
          ok: status >= 200 && status < 300,
          status,
          json: async () => route.body,
          text: async () => JSON.stringify(route.body),
          headers: { get: () => null },
        } as unknown as Response;
      }
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => "{}",
      headers: { get: () => null },
    } as unknown as Response;
  });
}

const PAID_CONFIG_OK = { configured: true };
const PAID_CONFIG_OFF = { configured: false };

describe("PaidCheckoutPage", () => {
  afterEach(() => {
    localStorage.removeItem("axis_api_key");
  });

  it("renders the unavailable state when PAI'D is not configured", async () => {
    vi.stubGlobal("fetch", paidFetchStub({
      "/portal/api/paid/config": { body: PAID_CONFIG_OFF },
    }));

    render(<PaidCheckoutPage />);

    await screen.findByText(/Subscription checkout isn't available/i);
    const back = screen.getByText("Back to Plans");
    expect(back.getAttribute("href")).toBe("#plans");
    // No subscribe form when unconfigured.
    expect(screen.queryByLabelText("Email")).toBeNull();
  });

  it("renders the subscribe form when configured", async () => {
    vi.stubGlobal("fetch", paidFetchStub({
      "/portal/api/paid/config": { body: PAID_CONFIG_OK },
    }));

    render(<PaidCheckoutPage />);

    await screen.findByLabelText("Email");
    expect(screen.getByRole("button", { name: "Continue to checkout" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Monthly" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Annual" })).toBeTruthy();
  });

  it("redirects the buyer to PAI'D's hosted checkout URL on submit", async () => {
    vi.stubGlobal("fetch", paidFetchStub({
      "/portal/api/paid/config": { body: PAID_CONFIG_OK },
      "/portal/api/subscribe": { body: { checkout_url: "https://pay.paid.test/cs_redirect", session_id: "cs_redirect", status: "open" } },
    }));

    // Capture the redirect without navigating jsdom.
    const original = window.location;
    const loc = { href: "", hash: "", assign: vi.fn(), replace: vi.fn() };
    Object.defineProperty(window, "location", { configurable: true, writable: true, value: loc });

    try {
      render(<PaidCheckoutPage />);
      const emailInput = await screen.findByLabelText("Email");
      fireEvent.change(emailInput, { target: { value: "a@b.com" } });
      fireEvent.click(screen.getByRole("button", { name: "Continue to checkout" }));
      await waitFor(() => expect(loc.href).toBe("https://pay.paid.test/cs_redirect"));
    } finally {
      Object.defineProperty(window, "location", { configurable: true, writable: true, value: original });
    }
  });

  it("prompts signup when the subscribe call returns 404 (no account for email)", async () => {
    vi.stubGlobal("fetch", paidFetchStub({
      "/portal/api/paid/config": { body: PAID_CONFIG_OK },
      "/portal/api/subscribe": { status: 404, body: { error: "No account found for that email" } },
    }));

    render(<PaidCheckoutPage />);

    const emailInput = await screen.findByLabelText("Email");
    fireEvent.change(emailInput, { target: { value: "nobody@b.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue to checkout" }));

    await screen.findByText(/No AXIS account exists for that email/i);
  });
});

describe("PlansPage PAI'D routing", () => {
  const starterPlan = { id: "starter", name: "Starter", tagline: "t", price_monthly_cents: 2900, price_annual_cents: 27840, highlights: [] };

  afterEach(() => {
    localStorage.removeItem("axis_api_key");
    window.location.hash = "";
  });

  it("routes Starter to #paid-checkout when PAI'D is configured", async () => {
    localStorage.setItem("axis_api_key", "axis_test_key");
    vi.stubGlobal("fetch", paidFetchStub({
      "/v1/plans": { body: { plans: [starterPlan], features: [] } },
      "/portal/api/paid/config": { body: PAID_CONFIG_OK },
    }));

    render(<PlansPage onSelectPlan={() => {}} onRequireLogin={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: "Choose Starter" }));

    await waitFor(() => expect(window.location.hash).toBe("#paid-checkout"));
  });

  it("never falls back to direct Stripe when PAI'D is not configured (PAI'D is the only money path)", async () => {
    localStorage.setItem("axis_api_key", "axis_test_key");
    const fetchFn = paidFetchStub({
      "/v1/plans": { body: { plans: [starterPlan], features: [] } },
      "/portal/api/paid/config": { body: PAID_CONFIG_OFF },
      // /v1/checkout intentionally NOT stubbed — it must never be called.
    });
    vi.stubGlobal("fetch", fetchFn);

    render(<PlansPage onSelectPlan={() => {}} onRequireLogin={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: "Choose Starter" }));

    // Surfaces an "unavailable" message and does NOT charge Stripe directly (no /v1/checkout).
    await screen.findByText(/temporarily unavailable/i);
    const urls = fetchFn.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.endsWith("/v1/checkout"))).toBe(false);
    expect(window.location.hash).not.toBe("#paid-checkout");
  });
});

// ─── Component smoke tests ──────────────────────────────────────

import { Icon } from "./components/AxisIcons";
import { StatusBar } from "./components/StatusBar";
import { ToastProvider } from "./components/Toast";
import { SignUpModal } from "./components/SignUpModal";

describe("Component smoke tests", () => {
  it("Icon renders with name prop", () => {
    const { container } = render(<Icon name="check" size={16} />);
    expect(container.innerHTML).toContain("svg");
  });

  it("StatusBar renders with null snapshot", () => {
    const { container } = render(<StatusBar snapshot={null} fileCount={0} />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("ToastProvider renders children", () => {
    const { container } = render(
      <ToastProvider>
        <div data-testid="child">hello</div>
      </ToastProvider>,
    );
    expect(container.querySelector("[data-testid='child']")).toBeTruthy();
  });

  it("SignUpModal offers GitHub + Google OAuth and no API-key paste login", () => {
    render(<SignUpModal onSuccess={() => {}} onClose={() => {}} />);
    // OAuth is the login: both provider buttons link to the /v1/auth/* endpoints.
    const github = screen.getByRole("link", { name: /GitHub/i });
    const google = screen.getByRole("link", { name: /Google/i });
    expect(github.getAttribute("href")).toContain("/v1/auth/github");
    expect(google.getAttribute("href")).toContain("/v1/auth/google");
    // The bad-practice "paste your API key to sign in" flow is gone.
    expect(screen.queryByPlaceholderText(/paste.*key/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/axis_/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /^Sign In$/i })).toBeNull();
  });
});
