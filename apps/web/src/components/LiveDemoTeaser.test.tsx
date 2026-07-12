/**
 * @vitest-environment happy-dom
 */

// WO-P1 — LiveDemoTeaser: the embedded landing-page playground teaser. Broad
// end-to-end coverage (real analyze call, error/retry, live stats) lives in
// pages.test.tsx's HomePage suite since that's how it's actually mounted;
// this file isolates the component's own contract — states, request shape,
// and the onRequireLogin wiring specifically.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LiveDemoTeaser } from "./LiveDemoTeaser.tsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockFetch(body: unknown, status = 200) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: { get: () => null },
  })) as unknown as typeof fetch;
}

const DEMO_RESPONSE = {
  snapshot_id: "snap_demo",
  project_id: "proj_demo",
  status: "ready",
  snapshot_summary: { pro_unlock: "Pro unlock: 15 more programs." },
  analysis: {
    project_name: "Hello-World",
    language: "TypeScript",
    frameworks: [],
    file_count: 2,
    routes_detected: 0,
    domain_models_detected: 0,
    separation_score: 0.5,
  },
  files: [{ path: "AGENTS.md", program: "skills", description: "agent guide", placement: "repo root", adoption_hint: "drop at repo root", content: "# AGENTS.md" }],
  programs_run: 3,
  total_files: 12,
  next_steps: [],
};

describe("LiveDemoTeaser", () => {
  it("idle state: shows the run button and no results", () => {
    render(<LiveDemoTeaser onRequireLogin={() => {}} onOpenPlayground={() => {}} />);
    expect(screen.getByRole("button", { name: "▶ Run live demo" })).toBeTruthy();
    expect(screen.queryByText("Hello-World")).toBeNull();
  });

  it("free tier only: requests exactly the free programs, never the paid bundle", async () => {
    const fetchFn = mockFetch(DEMO_RESPONSE, 201);
    vi.stubGlobal("fetch", fetchFn);

    render(<LiveDemoTeaser onRequireLogin={() => {}} onOpenPlayground={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "▶ Run live demo" }));

    await waitFor(() => expect(screen.getByText("Hello-World")).toBeTruthy());

    const [url, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/v1/analyze");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.programs).toEqual(["search", "skills", "debug"]);
    expect(body).not.toHaveProperty("token");
  });

  it("calls onRequireLogin when the post-demo 'Sign up free' CTA is clicked", async () => {
    vi.stubGlobal("fetch", mockFetch(DEMO_RESPONSE, 201));
    const onRequireLogin = vi.fn();

    render(<LiveDemoTeaser onRequireLogin={onRequireLogin} onOpenPlayground={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "▶ Run live demo" }));
    await waitFor(() => expect(screen.getByText("Hello-World")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Sign up free" }));
    expect(onRequireLogin).toHaveBeenCalledTimes(1);
  });

  it("links to the full Playground (WO-P15) from the idle state", () => {
    const onOpenPlayground = vi.fn();
    render(<LiveDemoTeaser onRequireLogin={() => {}} onOpenPlayground={onOpenPlayground} />);

    fireEvent.click(screen.getByRole("button", { name: /Try your own repo in the Playground/ }));
    expect(onOpenPlayground).toHaveBeenCalledTimes(1);
  });

  it("network failure: shows api.ts's human-readable message and lets the user retry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network down"); }) as unknown as typeof fetch);

    render(<LiveDemoTeaser onRequireLogin={() => {}} onOpenPlayground={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "▶ Run live demo" }));

    // api.ts maps a fetch-level TypeError to a NETWORK_ERROR ApiError with a
    // "Check your connection" sentence — never an unhandled crash.
    await screen.findByRole("button", { name: "Try again" });
    expect(screen.getByText(/Check your connection/i)).toBeTruthy();
  });

  it("retry after failure re-runs the same request and can succeed", async () => {
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      call++;
      if (call === 1) return { ok: false, status: 500, json: async () => ({ error: "boom" }), text: async () => JSON.stringify({ error: "boom" }), headers: { get: () => null } };
      return { ok: true, status: 201, json: async () => DEMO_RESPONSE, text: async () => JSON.stringify(DEMO_RESPONSE), headers: { get: () => null } };
    }) as unknown as typeof fetch);

    render(<LiveDemoTeaser onRequireLogin={() => {}} onOpenPlayground={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "▶ Run live demo" }));
    await screen.findByText("boom");

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("Hello-World")).toBeTruthy());
    expect(call).toBe(2);
  });
});
