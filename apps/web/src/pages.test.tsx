/**
 * @vitest-environment happy-dom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

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

// ─── Prop-taking page smoke tests ───────────────────────────────

import { AccountPage } from "./pages/AccountPage";
import { PlansPage } from "./pages/PlansPage";
import { ProgramsPage } from "./pages/ProgramsPage";
import { UploadPage } from "./pages/UploadPage";

describe("Page smoke tests — pages with required props", () => {
  it("AccountPage renders with minimal props", () => {
    const { container } = render(<AccountPage />);
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

  it("SignUpModal renders with noop callbacks", () => {
    const { container } = render(<SignUpModal onSuccess={() => {}} onClose={() => {}} />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });
});
