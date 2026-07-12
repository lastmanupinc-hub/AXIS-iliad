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
import { HomePage } from "./pages/HomePage";
import { AnalyzePage } from "./pages/AnalyzePage";
import { AccountDashboardPage } from "./pages/AccountDashboardPage";

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
    const { container } = render(<PlansPage loggedIn={false} onSelectPlan={() => {}} onRequireLogin={() => {}} />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("ProgramsPage renders with noop callback", () => {
    const { container } = render(<ProgramsPage onAnalyze={() => {}} />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("HomePage renders with noop callbacks (WO-P1)", () => {
    const { container } = render(<HomePage onAnalyze={() => {}} onRequireLogin={() => {}} />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("AnalyzePage renders with noop callback (WO-P1)", () => {
    const { container } = render(<AnalyzePage onComplete={() => {}} />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("AccountDashboardPage renders with noop callbacks (WO-P3)", () => {
    const { container } = render(<AccountDashboardPage onOpenProject={() => {}} onNavigate={() => {}} />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });
});

// ─── HomePage — live demo + live stats (WO-P1) ──────────────────

describe("HomePage — live demo teaser + live stats (WO-P1)", () => {
  it("renders the value prop, the live demo CTA, and a free-tier CTA to #analyze", () => {
    const onAnalyze = vi.fn();
    render(<HomePage onAnalyze={onAnalyze} onRequireLogin={() => {}} />);

    expect(screen.getByText(/Analyze any repo in seconds/i)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /Analyze your repo/i })[0]);
    expect(onAnalyze).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "▶ Run live demo" })).toBeTruthy();
  });

  it("runs a real anonymous demo analysis and shows the actual response — not canned data", async () => {
    const demoResponse = {
      snapshot_id: "snap_demo",
      project_id: "proj_demo",
      status: "ready",
      snapshot_summary: { pro_unlock: "Pro unlock: 15 more programs." },
      analysis: {
        project_name: "Hello-World",
        language: "TypeScript",
        frameworks: ["react"],
        file_count: 3,
        routes_detected: 0,
        domain_models_detected: 0,
        separation_score: 0.5,
      },
      files: [{ path: "AGENTS.md", program: "skills", description: "agent guide", placement: "repo root", adoption_hint: "drop at repo root", content: "# AGENTS.md\nSample content." }],
      programs_run: 3,
      total_files: 12,
      next_steps: ["Adopt AGENTS.md"],
    };
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => ({
      ok: true,
      status: 201,
      json: async () => demoResponse,
      text: async () => JSON.stringify(demoResponse),
      headers: { get: () => null },
    }));
    vi.stubGlobal("fetch", fetchFn as unknown as typeof fetch);

    render(<HomePage onAnalyze={() => {}} onRequireLogin={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "▶ Run live demo" }));

    await waitFor(() => expect(screen.getByText("Hello-World")).toBeTruthy());
    expect(screen.getByText("TypeScript")).toBeTruthy();
    // <pre><code> share textContent — disambiguate with a selector.
    expect(screen.getByText(/# AGENTS.md/, { selector: "code" })).toBeTruthy();

    // HomePage also fires GET /v1/stats on mount — find the analyze call
    // specifically rather than assuming call order.
    const analyzeCall = fetchFn.mock.calls.find(([u]) => String(u).includes("/v1/analyze"));
    expect(analyzeCall).toBeTruthy();
    const [url, init] = analyzeCall!;
    expect(String(url)).toContain("/v1/analyze");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.programs).toEqual(["search", "skills", "debug"]);
    expect(body.github_url).toContain("github.com");
  });

  it("live demo failure shows a Callout with retry — not a raw error or a crash", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: "boom" }),
      text: async () => JSON.stringify({ error: "boom" }),
      headers: { get: () => null },
    })) as unknown as typeof fetch);

    render(<HomePage onAnalyze={() => {}} onRequireLogin={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "▶ Run live demo" }));

    await screen.findByText("boom");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("fetches and renders live GET /v1/stats numbers (not hardcoded)", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/v1/stats")) {
        return {
          ok: true, status: 200,
          json: async () => ({ mcp_calls_today: 42, mcp_calls_total: 9001, top_tools: [{ tool: "analyze_repo", count: 7 }], process_started_at: "", date: "2026-07-07" }),
          text: async () => "{}",
          headers: { get: () => null },
        };
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => "{}", headers: { get: () => null } };
    }) as unknown as typeof fetch);

    render(<HomePage onAnalyze={() => {}} onRequireLogin={() => {}} />);

    await screen.findByText("42");
    expect(screen.getByText("9K")).toBeTruthy(); // formatCompact(9001) → "9K"
    expect(screen.getByText("analyze_repo")).toBeTruthy();
  });

  it("stays silent (no error UI) when GET /v1/stats is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, status: 200, json: async () => ({}), text: async () => "{}", headers: { get: () => null },
    })) as unknown as typeof fetch);

    const { container } = render(<HomePage onAnalyze={() => {}} onRequireLogin={() => {}} />);

    // Give the effect a tick to resolve; the stats grid must never mount.
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container.querySelector('[aria-label="Live platform activity"]')).toBeNull();
  });
});

// ─── AccountDashboardPage (WO-P3) ────────────────────────────────

function mockFetchByPath(handlers: Record<string, unknown>): void {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [suffix, body] of Object.entries(handlers)) {
      if (url.includes(suffix)) {
        return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } };
      }
    }
    return { ok: true, status: 200, json: async () => ({}), text: async () => "{}", headers: { get: () => null } };
  }) as unknown as typeof fetch);
}

describe("AccountDashboardPage (WO-P3)", () => {
  it("empty-project state onboards to first analysis", async () => {
    mockFetchByPath({
      "/v1/projects": { projects: [], total: 0 },
      "/v1/account/quota": { rate_limit: {}, authenticated: true, resource_quota: { tier: "free", snapshots_this_month: 0, max_snapshots_per_month: 10, project_count: 0, max_projects: 3, max_files_per_snapshot: 100 } },
      "/v1/account/usage/timeseries": { buckets: [] },
      "/v1/account/upgrade-prompt": { prompt: null },
    });
    const onNavigate = vi.fn();

    render(<AccountDashboardPage onOpenProject={() => {}} onNavigate={onNavigate} />);

    await screen.findByText("No projects yet");
    fireEvent.click(screen.getByRole("button", { name: "Analyze a repo" }));
    expect(onNavigate).toHaveBeenCalledWith("analyze");
  });

  it("renders recent-project cards with real data and opens one on click", async () => {
    mockFetchByPath({
      "/v1/projects": {
        projects: [
          {
            project_id: "proj_acme",
            name: "acme/widgets",
            github_url: "https://github.com/acme/widgets",
            created_at: "2026-06-01T00:00:00.000Z",
            latest_snapshot: {
              snapshot_id: "snap_1",
              status: "ready",
              created_at: "2026-07-01T00:00:00.000Z",
              file_count: 42,
              compliance_grade: { grade: "A", checks_passed: 7, checks_total: 8, score: 90 },
            },
            snapshot_count: 3,
          },
        ],
        total: 1,
      },
      "/v1/account/quota": { rate_limit: {}, authenticated: true, resource_quota: { tier: "paid", snapshots_this_month: 5, max_snapshots_per_month: 200, project_count: 1, max_projects: -1, max_files_per_snapshot: 500 } },
      "/v1/account/usage/timeseries": { buckets: [{ date: "2026-07-06", runs: 2, by_program: { skills: 2 }, credits_spent: 0 }, { date: "2026-07-07", runs: 1, by_program: { debug: 1 }, credits_spent: 1 }] },
      "/v1/account/upgrade-prompt": { prompt: null },
    });
    const onOpenProject = vi.fn();

    render(<AccountDashboardPage onOpenProject={onOpenProject} onNavigate={() => {}} />);

    await screen.findByText("acme/widgets");
    expect(screen.getByText("https://github.com/acme/widgets")).toBeTruthy();
    expect(screen.getByText("Grade A")).toBeTruthy();
    expect(screen.getByText("ready")).toBeTruthy();
    expect(screen.getByText("3 snapshots")).toBeTruthy();

    fireEvent.click(screen.getByText("acme/widgets").closest("button")!);
    expect(onOpenProject).toHaveBeenCalledWith("proj_acme");
  });

  it("a load failure shows a Callout with retry — not a raw error or a crash", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: "boom" }),
      text: async () => JSON.stringify({ error: "boom" }),
      headers: { get: () => null },
    })) as unknown as typeof fetch);

    render(<AccountDashboardPage onOpenProject={() => {}} onNavigate={() => {}} />);

    await screen.findByText("boom");
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
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
    expect(seen).toEqual(["analyze", "docs", "help"]);
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

describe("PlansPage honest pricing fallback (H0.9)", () => {
  const starterPlan = { id: "starter", name: "Starter", tagline: "t", price_monthly_cents: 2900, price_annual_cents: 27840, highlights: [] };

  it("shows the standard-pricing notice when live plans can't be fetched", async () => {
    vi.stubGlobal("fetch", paidFetchStub({
      "/v1/plans": { status: 500, body: { error: "down" } },
    }));

    render(<PlansPage loggedIn onSelectPlan={() => {}} onRequireLogin={() => {}} />);

    // The static fallback still renders the plans…
    expect(await screen.findByRole("button", { name: "Choose Starter" })).toBeTruthy();
    // …but discloses it isn't live data.
    expect(screen.getByText(/live plan data is unavailable/i)).toBeTruthy();
  });

  it("shows the notice when the API answers 200 with a malformed plans payload", async () => {
    vi.stubGlobal("fetch", paidFetchStub({
      "/v1/plans": { body: { nope: true } },
    }));

    render(<PlansPage loggedIn onSelectPlan={() => {}} onRequireLogin={() => {}} />);

    expect(await screen.findByRole("button", { name: "Choose Starter" })).toBeTruthy();
    expect(screen.getByText(/live plan data is unavailable/i)).toBeTruthy();
  });

  it("no notice when live plans load", async () => {
    vi.stubGlobal("fetch", paidFetchStub({
      "/v1/plans": { body: { plans: [starterPlan], features: [] } },
    }));

    render(<PlansPage loggedIn onSelectPlan={() => {}} onRequireLogin={() => {}} />);

    expect(await screen.findByRole("button", { name: "Choose Starter" })).toBeTruthy();
    expect(screen.queryByText(/live plan data is unavailable/i)).toBeNull();
  });
});

describe("PlansPage PAI'D routing", () => {
  const starterPlan = { id: "starter", name: "Starter", tagline: "t", price_monthly_cents: 2900, price_annual_cents: 27840, highlights: [] };

  afterEach(() => {
    window.location.hash = "";
  });

  it("routes Starter to #paid-checkout when PAI'D is configured", async () => {
    vi.stubGlobal("fetch", paidFetchStub({
      "/v1/plans": { body: { plans: [starterPlan], features: [] } },
      "/portal/api/paid/config": { body: PAID_CONFIG_OK },
    }));

    render(<PlansPage loggedIn onSelectPlan={() => {}} onRequireLogin={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: "Choose Starter" }));

    await waitFor(() => expect(window.location.hash).toBe("#paid-checkout"));
  });

  it("never falls back to direct Stripe when PAI'D is not configured (PAI'D is the only money path)", async () => {
    const fetchFn = paidFetchStub({
      "/v1/plans": { body: { plans: [starterPlan], features: [] } },
      "/portal/api/paid/config": { body: PAID_CONFIG_OFF },
      // /v1/checkout intentionally NOT stubbed — it must never be called.
    });
    vi.stubGlobal("fetch", fetchFn);

    render(<PlansPage loggedIn onSelectPlan={() => {}} onRequireLogin={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: "Choose Starter" }));

    // Surfaces an "unavailable" message and does NOT charge Stripe directly (no /v1/checkout).
    await screen.findByText(/temporarily unavailable/i);
    const urls = fetchFn.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.endsWith("/v1/checkout"))).toBe(false);
    expect(window.location.hash).not.toBe("#paid-checkout");
  });
});

describe("PlansPage login gate (WO-P14 regression)", () => {
  // Real auth is an HttpOnly session cookie, invisible to JS by design — this
  // page previously derived its own "logged in" state from
  // localStorage.getItem("axis_api_key"), which the app has not written to
  // since the H1 cookie-auth migration. Every real user therefore saw the
  // signed-OUT button label ("Sign Up for X") and hit the login gate on
  // click even when already authenticated. `loggedIn` must come from the
  // route's real auth state (ctx.loggedIn), not a page-local guess.
  const starterPlan = { id: "starter", name: "Starter", tagline: "t", price_monthly_cents: 2900, price_annual_cents: 27840, highlights: [] };

  it("a signed-out user sees the signup label and hits the login gate, not checkout", async () => {
    vi.stubGlobal("fetch", paidFetchStub({
      "/v1/plans": { body: { plans: [starterPlan], features: [] } },
      "/portal/api/paid/config": { body: PAID_CONFIG_OK },
    }));
    const onRequireLogin = vi.fn();

    render(<PlansPage loggedIn={false} onSelectPlan={() => {}} onRequireLogin={onRequireLogin} />);

    fireEvent.click(await screen.findByRole("button", { name: "Sign Up for Starter" }));

    expect(onRequireLogin).toHaveBeenCalledTimes(1);
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

// ─── SignUpModal contextual copy (WO-P2) ─────────────────────────
// The header/subhead varies by why the gate fired; the providers offered
// never do — every trigger must still surface GitHub + Google.

describe("SignUpModal contextual copy (WO-P2)", () => {
  it("defaults to generic sign-in copy when no trigger is given", () => {
    render(<SignUpModal onSuccess={() => {}} onClose={() => {}} />);
    expect(screen.getByRole("heading", { name: "Sign in to Iliad" })).toBeTruthy();
  });

  it("save-project trigger explains what signing in saves", () => {
    render(<SignUpModal onSuccess={() => {}} onClose={() => {}} trigger="save-project" />);
    expect(screen.getByRole("heading", { name: "Save this project" })).toBeTruthy();
  });

  it("paid-program trigger frames sign-in as the first step to upgrading", () => {
    render(<SignUpModal onSuccess={() => {}} onClose={() => {}} trigger="paid-program" />);
    expect(screen.getByRole("heading", { name: "Sign in to upgrade" })).toBeTruthy();
  });

  it("quota trigger explains the free usage limit", () => {
    render(<SignUpModal onSuccess={() => {}} onClose={() => {}} trigger="quota" />);
    expect(screen.getByText(/hit the free usage limit/i)).toBeTruthy();
  });

  it("every trigger still offers GitHub + Google OAuth — copy never hides the providers", () => {
    const triggers = ["generic", "save-project", "paid-program", "quota"] as const;
    for (const trigger of triggers) {
      const { unmount } = render(<SignUpModal onSuccess={() => {}} onClose={() => {}} trigger={trigger} />);
      expect(screen.getByRole("link", { name: /GitHub/i }).getAttribute("href")).toContain("/v1/auth/github");
      expect(screen.getByRole("link", { name: /Google/i }).getAttribute("href")).toContain("/v1/auth/google");
      unmount();
    }
  });
});

// ─── AccountPage OAuth callback — return-to (WO-P2) ──────────────
// The provider redirect always lands on /account?code=…, but sign-in should
// hand the user back to whatever page's gate sent them there. AccountPage's
// finishAuthAndReload restores the remembered hash before the hard reload
// the OAuth handoff requires (a fresh mount re-reads the session cookie).

describe("AccountPage OAuth callback — return-to (WO-P2)", () => {
  function mockLocationForOAuthCallback() {
    const reload = vi.fn();
    const fakeLocation = { search: "?code=abc123&login=github", pathname: "/account", hash: "", reload };
    const original = window.location;
    Object.defineProperty(window, "location", { configurable: true, writable: true, value: fakeLocation });
    const replaceStateSpy = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
    return {
      fakeLocation,
      reload,
      restore: () => {
        Object.defineProperty(window, "location", { configurable: true, writable: true, value: original });
        replaceStateSpy.mockRestore();
      },
    };
  }

  function stubExchangeFetch() {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/auth/exchange")) {
        return { ok: true, status: 200, json: async () => ({ api_key: "axis_new" }) } satisfies Partial<Response> as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } satisfies Partial<Response> as Response;
    }));
  }

  afterEach(() => {
    localStorage.removeItem("axis_api_key");
    sessionStorage.clear();
  });

  it("restores the pending return hash before reloading after a successful exchange", async () => {
    sessionStorage.setItem("axis_return_to", "dashboard"); // as App.tsx's openSignUp would record it
    const { fakeLocation, reload, restore } = mockLocationForOAuthCallback();
    stubExchangeFetch();

    try {
      render(<AccountPage />);
      await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
      expect(fakeLocation.hash).toBe("dashboard");
      // One-time use: consumed, not left behind for the next login.
      expect(sessionStorage.getItem("axis_return_to")).toBeNull();
    } finally {
      restore();
    }
  });

  it("falls back to the default /account landing when nothing was pending", async () => {
    const { fakeLocation, reload, restore } = mockLocationForOAuthCallback();
    stubExchangeFetch();

    try {
      render(<AccountPage />);
      await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
      expect(fakeLocation.hash).toBe(""); // untouched — plain reload of /account
    } finally {
      restore();
    }
  });
});
