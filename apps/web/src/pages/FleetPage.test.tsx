/**
 * @vitest-environment happy-dom
 */

// R2.6 — GET /v1/account/fleet had a real handler and an api.ts wrapper
// (getFleetReport) but no UI anywhere. Covers the three states the handler
// can return: tier-blocked (free tier, 403 TIER_REQUIRED), ready:false (paid
// tier, not enough analyzed projects yet), and ready:true (renders the
// report via ArtifactExplorer).

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { FleetPage } from "./FleetPage.tsx";

function stubFetch(body: unknown, status = 200) {
  const fn = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: { get: () => null },
  } as unknown as Response));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("FleetPage — tier gating", () => {
  it("shows an upgrade upsell (not a raw error) when the account is free tier", async () => {
    stubFetch({ error: "Fleet intelligence requires a paid plan", error_code: "TIER_REQUIRED" }, 403);
    const onNavigate = vi.fn();
    render(<FleetPage onNavigate={onNavigate} />);

    await waitFor(() => expect(screen.getByText("Fleet requires a paid plan")).toBeTruthy());
    expect(screen.queryByText(/TIER_REQUIRED/)).toBeNull();

    screen.getByRole("button", { name: "View plans" }).click();
    expect(onNavigate).toHaveBeenCalledWith("usage");
  });

  it("shows a real error Callout for a non-tier failure", async () => {
    stubFetch({ error: "Database unavailable" }, 500);
    render(<FleetPage onNavigate={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Couldn't load your fleet report")).toBeTruthy());
  });
});

describe("FleetPage — ready:false (not enough analyzed projects)", () => {
  it("shows the server's reason and an eligible/total progress line", async () => {
    stubFetch({
      ready: false,
      project_count: 3,
      eligible_projects: 1,
      reason: "Fleet reports need at least 2 analyzed projects; this account has 1 with a completed analysis.",
    });
    render(<FleetPage onNavigate={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Not enough analyzed projects yet")).toBeTruthy());
    expect(screen.getByText(/need at least 2 analyzed projects/)).toBeTruthy();
    expect(screen.getByText("1 of 3 projects ready today.")).toBeTruthy();
  });
});

describe("FleetPage — ready:true (renders the report)", () => {
  it("shows project stats and the report content via ArtifactExplorer", async () => {
    stubFetch({
      ready: true,
      project_count: 4,
      eligible_projects: 3,
      projects: ["alpha", "beta", "gamma"],
      files: [
        {
          path: "fleet-report.md",
          content: "# Fleet Report\n\nShared stack: TypeScript, React.",
          content_type: "text/markdown",
          program: "fleet",
          description: "Portfolio health across this account's projects.",
        },
      ],
    });
    render(<FleetPage onNavigate={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Projects in this report")).toBeTruthy());
    expect(screen.getByText("4")).toBeTruthy(); // project_count
    expect(screen.getByText("3")).toBeTruthy(); // eligible_projects
    expect(screen.getByText("fleet-report.md")).toBeTruthy();
  });
});
