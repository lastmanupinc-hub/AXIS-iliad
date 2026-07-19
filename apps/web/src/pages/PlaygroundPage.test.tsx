/**
 * @vitest-environment happy-dom
 */

// WO-P15 — Live Demo / Playground: a fuller standalone version of HomePage's
// LiveDemoTeaser. Public, no login. Real anonymous analysis (POST
// /v1/analyze, free programs only), inline artifact previews, an anon
// rate-limit meter (GET /v1/account/quota), and the shared ProbeIntentDemo.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PlaygroundPage } from "./PlaygroundPage.tsx";

/** Fetch stub routed by URL substring: [match, body, status?][] (first hit
 *  wins — the convention established by McpPage.test.tsx). */
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

const noop = () => {};

const QUOTA_ANON = {
  rate_limit: { limit: 60, remaining: 45, count: 15, reset_in_seconds: 30, window_ms: 60000 },
  authenticated: false,
};

const ANALYZE_RESPONSE = {
  snapshot_id: "snap_pg1",
  project_id: "prj_pg1",
  status: "ready",
  snapshot_summary: { pro_unlock: "17 more programs" },
  analysis: {
    project_name: "Hello-World",
    language: "TypeScript",
    frameworks: ["React"],
    file_count: 12,
    routes_detected: 0,
    domain_models_detected: 0,
    separation_score: 0,
  },
  files: [
    { path: "AGENTS.md", program: "skills", description: "Agent guide", placement: "root", adoption_hint: "add", content: "# AGENTS.md\ncontent here" },
    { path: ".ai/context-map.json", program: "search", description: "Context map", placement: "root", adoption_hint: "add", content: '{"ok":true}' },
  ],
  programs_run: 3,
  total_files: 2,
  next_steps: [],
};

const DEFAULT_HANDLERS: Array<[string, unknown, number?]> = [
  ["/v1/account/quota", QUOTA_ANON],
  ["/v1/analyze", ANALYZE_RESPONSE],
];

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("PlaygroundPage — idle state", () => {
  it("renders 3 sample-repo options and a URL input", async () => {
    stubFetch(DEFAULT_HANDLERS);
    render(<PlaygroundPage loggedIn={false} onRequireLogin={noop} />);

    expect(screen.getByText("Hello World")).toBeTruthy();
    expect(screen.getByText("Express + TypeScript")).toBeTruthy();
    expect(screen.getByText("Django + Python")).toBeTruthy();
    expect(screen.getByLabelText("Public GitHub repo URL")).toBeTruthy();
  });

  it("shows the anonymous rate-limit meter from the live quota endpoint", async () => {
    stubFetch(DEFAULT_HANDLERS);
    render(<PlaygroundPage loggedIn={false} onRequireLogin={noop} />);

    expect(await screen.findByText(/45 \/ 60 requests remaining/)).toBeTruthy();
  });

  it("does not show the anon meter when the caller is authenticated", async () => {
    stubFetch([["/v1/account/quota", { ...QUOTA_ANON, authenticated: true }], ["/v1/analyze", ANALYZE_RESPONSE]]);
    render(<PlaygroundPage loggedIn onRequireLogin={noop} />);

    await waitFor(() => expect(screen.getByLabelText("Public GitHub repo URL")).toBeTruthy());
    expect(screen.queryByText(/requests remaining/)).toBeNull();
  });
});

describe("PlaygroundPage — running a real analysis", () => {
  it("clicking a sample repo runs a real analysis and shows results with artifact previews", async () => {
    const fetchFn = stubFetch(DEFAULT_HANDLERS);
    render(<PlaygroundPage loggedIn={false} onRequireLogin={noop} />);

    fireEvent.click(screen.getByText("Hello World"));

    expect(await screen.findByText("Hello-World")).toBeTruthy();
    expect(screen.getByText("TypeScript")).toBeTruthy();
    // "AGENTS.md" legitimately appears twice once results show (the file-list
    // button and the preview pane's CodeBlock label) — the button query
    // disambiguates to the list entry specifically.
    expect(screen.getByRole("button", { name: /AGENTS\.md/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /\.ai\/context-map\.json/ })).toBeTruthy();

    // The default-selected file's content renders in the preview pane.
    expect(screen.getByText(/content here/)).toBeTruthy();

    const analyzeCall = fetchFn.mock.calls.find((c) => String(c[0]).includes("/v1/analyze"));
    expect(analyzeCall).toBeTruthy();
    const body = JSON.parse(String((analyzeCall![1] as RequestInit).body));
    expect(body.github_url).toBe("https://github.com/octocat/Hello-World");
  });

  it("submitting a pasted URL runs the same flow", async () => {
    stubFetch(DEFAULT_HANDLERS);
    render(<PlaygroundPage loggedIn={false} onRequireLogin={noop} />);

    fireEvent.change(screen.getByLabelText("Public GitHub repo URL"), { target: { value: "https://github.com/foo/bar" } });
    fireEvent.click(screen.getByRole("button", { name: "Analyze" }));

    expect(await screen.findByText("Hello-World")).toBeTruthy();
  });

  it("clicking a different generated file swaps the preview", async () => {
    stubFetch(DEFAULT_HANDLERS);
    render(<PlaygroundPage loggedIn={false} onRequireLogin={noop} />);

    fireEvent.click(screen.getByText("Hello World"));
    await screen.findByRole("button", { name: /AGENTS\.md/ });

    fireEvent.click(screen.getByRole("button", { name: /\.ai\/context-map\.json/ }));
    expect(await screen.findByText(/"ok":true/)).toBeTruthy();
  });

  it("shows a retry option when the analysis fails", async () => {
    stubFetch([["/v1/account/quota", QUOTA_ANON], ["/v1/analyze", { error: "quota exceeded" }, 429]]);
    render(<PlaygroundPage loggedIn={false} onRequireLogin={noop} />);

    fireEvent.click(screen.getByText("Hello World"));

    await screen.findByText("quota exceeded");
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("'Try another repo' clears the result and the local cache", async () => {
    stubFetch(DEFAULT_HANDLERS);
    render(<PlaygroundPage loggedIn={false} onRequireLogin={noop} />);

    fireEvent.click(screen.getByText("Hello World"));
    await screen.findByText("Hello-World");
    expect(localStorage.getItem("axis_playground_result")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Try another repo" }));

    expect(screen.queryByText("Hello-World")).toBeNull();
    expect(localStorage.getItem("axis_playground_result")).toBeNull();
  });
});

describe("PlaygroundPage — result persistence across a refresh", () => {
  it("restores the last result from localStorage on mount, without calling analyze again", async () => {
    localStorage.setItem("axis_playground_result", JSON.stringify(ANALYZE_RESPONSE));
    const fetchFn = stubFetch(DEFAULT_HANDLERS);

    render(<PlaygroundPage loggedIn={false} onRequireLogin={noop} />);

    expect(await screen.findByText("Hello-World")).toBeTruthy();
    expect(fetchFn.mock.calls.some((c) => String(c[0]).includes("/v1/analyze"))).toBe(false);
  });

  it("discards a corrupted cache entry instead of crashing", () => {
    localStorage.setItem("axis_playground_result", "{not json");
    stubFetch(DEFAULT_HANDLERS);

    render(<PlaygroundPage loggedIn={false} onRequireLogin={noop} />);

    expect(screen.getByText("Hello World")).toBeTruthy(); // idle state, not a crash
    expect(localStorage.getItem("axis_playground_result")).toBeNull();
  });
});

describe("PlaygroundPage — quota meter race (H-Phase-A cycle 12)", () => {
  it("a slow mount-time quota response cannot overwrite the fresher post-run one", async () => {
    // loadQuota() fires on mount AND again after a successful run(). Hold the
    // mount call open, let the post-run call resolve first (with a DIFFERENT,
    // fresher remaining count), then release the stale mount call and confirm
    // it's discarded rather than overwriting the fresher number.
    let resolveMountQuota!: (v: unknown) => void;
    const mountQuotaGate = new Promise((resolve) => { resolveMountQuota = resolve; });
    let quotaCallCount = 0;
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const respond = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } }) as unknown as Response;
      if (url.includes("/v1/account/quota")) {
        quotaCallCount++;
        if (quotaCallCount === 1) {
          const body = await mountQuotaGate; // held open until the test explicitly releases it, below
          return respond(body);
        }
        return respond({ rate_limit: { limit: 60, remaining: 44, count: 16, reset_in_seconds: 30, window_ms: 60000 }, authenticated: false });
      }
      if (url.includes("/v1/analyze")) return respond(ANALYZE_RESPONSE);
      return respond({});
    });
    vi.stubGlobal("fetch", fetchFn);

    render(<PlaygroundPage loggedIn={false} onRequireLogin={noop} />);
    // Mount's quota call is now held open on mountQuotaGate (quotaCallCount === 1).

    fireEvent.click(screen.getByText("Hello World")); // runs analyze, then fires loadQuota() again (call #2)
    expect(await screen.findByText(/44 \/ 60 requests remaining/)).toBeTruthy(); // fresh post-run quota lands first

    resolveMountQuota({ rate_limit: { limit: 60, remaining: 45, count: 15, reset_in_seconds: 30, window_ms: 60000 }, authenticated: false }); // now let the stale mount response land
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));

    expect(screen.queryByText(/45 \/ 60 requests remaining/)).toBeNull();
    expect(screen.getByText(/44 \/ 60 requests remaining/)).toBeTruthy();
  });
});

describe("PlaygroundPage — signup CTA", () => {
  it("shows the signup CTA for a logged-out visitor after a result, and wires the click through", async () => {
    stubFetch(DEFAULT_HANDLERS);
    const onRequireLogin = vi.fn();
    render(<PlaygroundPage loggedIn={false} onRequireLogin={onRequireLogin} />);

    fireEvent.click(screen.getByText("Hello World"));
    await screen.findByText("Hello-World");

    fireEvent.click(screen.getByRole("button", { name: "Sign up free" }));
    expect(onRequireLogin).toHaveBeenCalledTimes(1);
  });

  it("never shows the signup CTA for an already-logged-in visitor", async () => {
    stubFetch(DEFAULT_HANDLERS);
    render(<PlaygroundPage loggedIn onRequireLogin={noop} />);

    fireEvent.click(screen.getByText("Hello World"));
    await screen.findByText("Hello-World");

    expect(screen.queryByRole("button", { name: "Sign up free" })).toBeNull();
  });
});

describe("PlaygroundPage — probe-intent box", () => {
  it("renders the shared ProbeIntentDemo", () => {
    stubFetch(DEFAULT_HANDLERS);
    render(<PlaygroundPage loggedIn={false} onRequireLogin={noop} />);

    expect(screen.getByText("Describe your need")).toBeTruthy();
  });
});
