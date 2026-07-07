/**
 * @vitest-environment happy-dom
 */

// WO-P4 — Analyze Repo advanced options: the live GET /v1/programs-driven
// output picker, the explicit branch field, the private-repo token picker
// (stored vs. one-off paste, never persisted client-side), and the lite-mode
// budget toggle (X-Agent-Mode: lite). Broad smoke coverage (renders, the
// anonymous happy path) lives in pages.test.tsx / app-routing.test.tsx; this
// file isolates AnalyzePage's own WO-P4 contract.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AnalyzePage } from "./AnalyzePage.tsx";

/** Fetch stub routed by URL substring: [match, body, status?][] (first hit wins,
 *  matching the convention already used in app-routing.test.tsx). */
function stubFetch(handlers: Array<[match: string, body: unknown, status?: number]>) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const hit = handlers.find(([m]) => url.includes(m));
    const body = hit ? hit[1] : {};
    const status = hit?.[2] ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
      headers: { get: () => null },
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** Just enough of a SnapshotResponse for AnalyzePage's success-path toast
 *  (context_map.project_identity.name / .structure.total_files). */
const SUCCESS_FIXTURE = {
  snapshot_id: "snap_1",
  project_id: "proj_1",
  status: "ready",
  context_map: { project_identity: { name: "demo-repo" }, structure: { total_files: 3 } },
  repo_profile: {},
  generated_files: [],
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("AnalyzePage — live program catalog (WO-P4)", () => {
  it("renders the output picker from GET /v1/programs — including a program the old hardcoded list never had", async () => {
    stubFetch([
      ["/v1/programs", {
        programs: [
          { name: "search", outputs: ["context-map.json"], generator_count: 1 },
          { name: "deploy", outputs: ["deploy/render.yaml"], generator_count: 1 },
        ],
        total_generators: 2,
      }],
    ]);

    render(<AnalyzePage onComplete={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Upload Files" }));

    // "deploy" / "deploy/render.yaml" never appeared in the old hardcoded
    // 45-output list (AUDIT-pages.md item 4) — this can only come from the
    // live catalog fetch.
    await waitFor(() => expect(screen.getByText("deploy/render.yaml")).toBeTruthy());
    expect(screen.getByText(/Deploy/)).toBeTruthy();
    // "context-map.json" is pre-selected (an ESSENTIAL_CANDIDATES default), so
    // its badge also renders a "✓ " text node — match loosely for that.
    expect(screen.getByText(/context-map\.json/)).toBeTruthy();
  });

  it("shows a retry option when the catalog fails to load, and retry re-fetches", async () => {
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      call++;
      if (call === 1) {
        return { ok: false, status: 500, json: async () => ({ error: "boom" }), text: async () => JSON.stringify({ error: "boom" }), headers: { get: () => null } };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ programs: [{ name: "search", outputs: ["context-map.json"], generator_count: 1 }], total_generators: 1 }),
        text: async () => "",
        headers: { get: () => null },
      };
    }) as unknown as typeof fetch);

    render(<AnalyzePage onComplete={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Upload Files" }));

    await screen.findByText("boom");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(screen.getByText(/context-map\.json/)).toBeTruthy());
  });

  it("selecting a pro output as an anonymous user upsells without fabricating a price", async () => {
    stubFetch([
      ["/v1/programs", {
        programs: [{ name: "deploy", outputs: ["deploy/render.yaml"], generator_count: 1 }],
        total_generators: 1,
      }],
    ]);

    const { container } = render(<AnalyzePage onComplete={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Upload Files" }));
    await waitFor(() => expect(screen.getByText("deploy/render.yaml")).toBeTruthy());

    fireEvent.click(screen.getByText("deploy/render.yaml"));
    await waitFor(() => expect(screen.getByText(/5 selected/)).toBeTruthy());

    // The pre-check is the first thing handleSubmit does, before the
    // no-files/no-project-name guards — submit the form directly rather than
    // clicking the submit button, since native HTML5 required-field
    // validation on the (untouched) Project Name input would otherwise block
    // the click from ever dispatching a submit event, which isn't what this
    // test is about.
    fireEvent.submit(container.querySelector("form")!);

    // No network round trip happened (client-side pre-check) — the upsell
    // shows the blocked program but no dollar figure it can't back with a
    // live server price. Both the inline card and the UpsellModal render the
    // same heading text, so assert presence via getAllByText.
    await waitFor(() => expect(screen.getAllByText("🔒 Pro Programs Required").length).toBeGreaterThan(0));
    expect(screen.queryByText(/\$/)).toBeNull();
  });
});

describe("AnalyzePage — explicit branch field (WO-P4)", () => {
  it("folds a non-default branch into the URL sent to /v1/github/analyze", async () => {
    const fetchFn = stubFetch([["/v1/github/analyze", SUCCESS_FIXTURE, 201]]);
    const onComplete = vi.fn();

    render(<AnalyzePage onComplete={onComplete} />);
    fireEvent.change(screen.getByPlaceholderText("https://github.com/owner/repo"), {
      target: { value: "https://github.com/owner/repo" },
    });
    fireEvent.change(screen.getByPlaceholderText("main"), { target: { value: "feature-x" } });
    fireEvent.click(screen.getByRole("button", { name: "Analyze GitHub Repo" }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));

    const call = fetchFn.mock.calls.find(([u]) => String(u).includes("/v1/github/analyze"))!;
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body.github_url).toBe("https://github.com/owner/repo/tree/feature-x");
  });

  it("leaves the URL alone when the branch field is empty", async () => {
    const fetchFn = stubFetch([["/v1/github/analyze", SUCCESS_FIXTURE, 201]]);
    render(<AnalyzePage onComplete={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText("https://github.com/owner/repo"), {
      target: { value: "https://github.com/owner/repo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Analyze GitHub Repo" }));

    await waitFor(() => {
      const call = fetchFn.mock.calls.find(([u]) => String(u).includes("/v1/github/analyze"));
      expect(call).toBeTruthy();
    });
    const call = fetchFn.mock.calls.find(([u]) => String(u).includes("/v1/github/analyze"))!;
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body.github_url).toBe("https://github.com/owner/repo");
  });
});

describe("AnalyzePage — private-repo token (WO-P4)", () => {
  it("sends a pasted token as `token` and clears it from state after a successful run (never persisted)", async () => {
    const fetchFn = stubFetch([["/v1/github/analyze", SUCCESS_FIXTURE, 201]]);
    const onComplete = vi.fn();

    render(<AnalyzePage onComplete={onComplete} />);
    fireEvent.change(screen.getByPlaceholderText("https://github.com/owner/repo"), {
      target: { value: "https://github.com/owner/repo" },
    });
    const tokenInput = screen.getByPlaceholderText(/used once for this request/i);
    fireEvent.change(tokenInput, { target: { value: "ghp_pasted_secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Analyze GitHub Repo" }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));

    const call = fetchFn.mock.calls.find(([u]) => String(u).includes("/v1/github/analyze"))!;
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body.token).toBe("ghp_pasted_secret");
    expect(JSON.stringify(localStorage)).not.toContain("ghp_pasted_secret");
    expect((tokenInput as HTMLInputElement).value).toBe("");
  });

  it("logged-in with a stored token: shows the auto-use hint and sends no token override", async () => {
    const fetchFn = stubFetch([
      ["/v1/account/github-token", {
        tokens: [{ token_id: "t1", label: "laptop", token_prefix: "ghp_ab", scopes: [], created_at: "2026-01-01", expires_at: null, last_used_at: null, valid: true }],
      }],
      ["/v1/github/analyze", SUCCESS_FIXTURE, 201],
    ]);
    const onComplete = vi.fn();

    render(<AnalyzePage onComplete={onComplete} loggedIn />);

    await waitFor(() => expect(screen.getByText("laptop")).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText("https://github.com/owner/repo"), {
      target: { value: "https://github.com/owner/repo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Analyze GitHub Repo" }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));

    const call = fetchFn.mock.calls.find(([u]) => String(u).includes("/v1/github/analyze"))!;
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body).not.toHaveProperty("token");
  });

  it("logged-out visitors never fetch the account-scoped token list", () => {
    const fetchFn = stubFetch([]);
    render(<AnalyzePage onComplete={() => {}} />);

    const urls = fetchFn.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("/v1/account/github-token"))).toBe(false);
  });
});

describe("AnalyzePage — lite mode budget toggle (WO-P4)", () => {
  it("sends X-Agent-Mode: lite when the toggle is checked", async () => {
    const fetchFn = stubFetch([["/v1/github/analyze", SUCCESS_FIXTURE, 201]]);
    const onComplete = vi.fn();

    render(<AnalyzePage onComplete={onComplete} />);
    fireEvent.change(screen.getByPlaceholderText("https://github.com/owner/repo"), {
      target: { value: "https://github.com/owner/repo" },
    });
    fireEvent.click(screen.getByLabelText(/Lite mode/i));
    fireEvent.click(screen.getByRole("button", { name: "Analyze GitHub Repo" }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));

    const call = fetchFn.mock.calls.find(([u]) => String(u).includes("/v1/github/analyze"))!;
    const init = call[1] as RequestInit;
    expect((init.headers as Record<string, string>)["X-Agent-Mode"]).toBe("lite");
  });

  it("does not send X-Agent-Mode when the toggle is left off", async () => {
    const fetchFn = stubFetch([["/v1/github/analyze", SUCCESS_FIXTURE, 201]]);
    const onComplete = vi.fn();

    render(<AnalyzePage onComplete={onComplete} />);
    fireEvent.change(screen.getByPlaceholderText("https://github.com/owner/repo"), {
      target: { value: "https://github.com/owner/repo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Analyze GitHub Repo" }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));

    const call = fetchFn.mock.calls.find(([u]) => String(u).includes("/v1/github/analyze"))!;
    const init = call[1] as RequestInit;
    expect((init.headers as Record<string, string> | undefined)?.["X-Agent-Mode"]).toBeUndefined();
  });

  it("a 402/429 pricing payload renders both tiers so the toggle's effect is visible", async () => {
    stubFetch([
      ["/v1/github/analyze", {
        error: "Quota exceeded",
        error_code: "QUOTA_EXCEEDED",
        pricing: {
          standard: { amount_cents: 50, currency: "usd", description: "Full run" },
          lite: { amount_cents: 15, currency: "usd", description: "Lite run" },
        },
      }, 429],
    ]);

    render(<AnalyzePage onComplete={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("https://github.com/owner/repo"), {
      target: { value: "https://github.com/owner/repo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Analyze GitHub Repo" }));

    // Both the inline tier-block card and the UpsellModal render a pricing
    // line, so both tiers appear at least once (getAllByText — never zero).
    await waitFor(() => expect(screen.getAllByText(/\$0\.50/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/\$0\.15/).length).toBeGreaterThan(0);
  });

  it("pins the quoted price/mode label to what was actually sent — toggling the checkbox afterward doesn't relabel it", async () => {
    stubFetch([
      ["/v1/github/analyze", {
        error: "Free tier includes 3 programs",
        error_code: "TIER_REQUIRED",
        blocked_programs: ["deploy"],
        allowed_programs: ["search", "skills", "debug"],
        price_per_call: "$0.50",
      }, 402],
    ]);

    render(<AnalyzePage onComplete={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("https://github.com/owner/repo"), {
      target: { value: "https://github.com/owner/repo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Analyze GitHub Repo" }));

    // Submitted with the toggle off — the quote should say plain "$0.50", no
    // "(lite mode)" qualifier.
    await waitFor(() => expect(screen.getAllByText(/This run would cost/).length).toBeGreaterThan(0));
    expect(screen.queryByText(/\(lite mode\)/)).toBeNull();

    // Toggling the checkbox AFTER the 402 must not relabel the already-quoted
    // price — it reflects what was actually sent, not the live checkbox state.
    fireEvent.click(screen.getByLabelText(/Lite mode/i));
    expect(screen.queryByText(/\(lite mode\)/)).toBeNull();
  });
});
