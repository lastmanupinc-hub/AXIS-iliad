// app_31 Apply stage. Deps are injected, so every path here is exercised for
// real — no live model, no network, no "it probably works in prod".
//
// The cases that matter are the ones where generation goes BADLY, because that
// is where a watcher is tempted to do something dishonest: ship a component that
// failed its gate, or report "no changes" when in fact nothing survived.
import { describe, it, expect, vi } from "vitest";
import type { WatchJobPayload } from "@axis/snapshots";
import {
  processFrontendApply,
  buildPrBody,
  componentPath,
  AXIS_COMPONENT_DIR,
  PRIMITIVE_REQUESTS,
  type FrontendApplyDeps,
} from "./frontend-apply-watcher.js";
import type { ComponentResult } from "./frontend-components.js";

const payload = (over: Partial<WatchJobPayload> = {}): WatchJobPayload =>
  ({
    repo_full_name: "acme/widget",
    product_id: "frontend",
    ref: "refs/heads/main",
    ...over,
  }) as WatchJobPayload;

// `size` is required — createSnapshot writes it as an integer, and omitting it
// makes the insert fail with NaN rather than anything that names the real cause.
const file = (path: string, content: string) => ({ path, content, size: content.length });

const REPO_FILES = [
  file("package.json", JSON.stringify({ name: "widget", dependencies: { react: "^19" } })),
  file("src/App.tsx", "export const App = () => <div />;"),
];

function good(name: string): ComponentResult {
  return {
    status: "generated",
    component: { component_name: name, code: `export const ${name} = () => <button type="button">ok</button>;` },
    path: `${name}.tsx`,
    invented_colors: [],
    findings: [],
  };
}

function deps(over: Partial<FrontendApplyDeps> = {}): FrontendApplyDeps {
  return {
    token: "gh-token",
    fetchRepo: vi.fn(async () => ({ files: REPO_FILES as never })),
    openPr: vi.fn(async () => ({ opened: true, url: "https://github.com/acme/widget/pull/1", number: 1 }) as never),
    generateComponent: vi.fn(async (_ctx, request: string) => {
      const p = PRIMITIVE_REQUESTS.find((x) => x.request === request);
      return good(p?.name ?? "Unknown");
    }),
    ...over,
  };
}

describe("processFrontendApply — routing and preconditions", () => {
  it("ignores jobs for other products so the dispatcher can fall through", async () => {
    const r = await processFrontendApply(payload({ product_id: "seo" }), deps());
    expect(r.status).toBe("not_frontend_product");
  });

  it("does nothing without a GitHub token rather than failing mid-apply", async () => {
    const r = await processFrontendApply(payload(), deps({ token: undefined }));
    expect(r.status).toBe("no_token");
  });
});

describe("processFrontendApply — the honest-failure paths", () => {
  it("opens a PR containing every component that passed its gates", async () => {
    const d = deps();
    const r = await processFrontendApply(payload(), d);
    expect(r.status).toBe("pr_opened");
    expect(r.applied).toEqual(PRIMITIVE_REQUESTS.map((p) => componentPath(p.name, ".tsx")));
    expect(r.withheld).toEqual([]);
    expect(d.openPr).toHaveBeenCalledTimes(1);
  });

  // The gate that keeps a bad component out of a customer's repo.
  it("APPLIES the good components and WITHHOLDS the failed one, in the same run", async () => {
    const d = deps({
      generateComponent: vi.fn(async (_ctx, request: string) => {
        const p = PRIMITIVE_REQUESTS.find((x) => x.request === request)!;
        if (p.name === "Card") {
          return { status: "withheld", reason: "invented_colors", invented_colors: ["#ff00ff"], findings: [] } as ComponentResult;
        }
        return good(p.name);
      }),
    });
    const r = await processFrontendApply(payload(), d);

    expect(r.status).toBe("pr_opened");
    expect(r.applied).not.toContain(componentPath("Card", ".tsx"));
    expect(r.applied).toHaveLength(PRIMITIVE_REQUESTS.length - 1);
    expect(r.withheld).toEqual([
      { name: "Card", reason: "invented_colors", invented_colors: ["#ff00ff"], findings: undefined },
    ]);
    // The withheld component must not be smuggled into the PR payload.
    const sent = (d.openPr as ReturnType<typeof vi.fn>).mock.calls[0][0] as { files: Array<{ path: string }> };
    expect(sent.files.map((f) => f.path)).not.toContain(componentPath("Card", ".tsx"));
  });

  // Collapsing this into "no_changes" would hide a total failure behind a
  // reassuring status — the false-green shape this repo keeps finding.
  it("reports all_withheld (NOT no_changes) when nothing survived its gates", async () => {
    const d = deps({
      generateComponent: vi.fn(async () => ({ status: "withheld", reason: "audit_failed", findings: [] }) as ComponentResult),
    });
    const r = await processFrontendApply(payload(), d);
    expect(r.status).toBe("all_withheld");
    expect(r.withheld).toHaveLength(PRIMITIVE_REQUESTS.length);
    expect(d.openPr).not.toHaveBeenCalled();
  });

  it("reports no_changes and opens NO PR when every component already matches the repo", async () => {
    const current = PRIMITIVE_REQUESTS.map((p) =>
      file(componentPath(p.name, ".tsx"), good(p.name).component!.code),
    );
    const d = deps({ fetchRepo: vi.fn(async () => ({ files: [...REPO_FILES, ...current] as never })) });
    const r = await processFrontendApply(payload(), d);
    expect(r.status).toBe("no_changes");
    expect(d.openPr).not.toHaveBeenCalled();
  });

  it("never feeds its own prior output back into its own regeneration", async () => {
    const stale = file(componentPath("Button", ".tsx"), "export const Button = () => <div>stale</div>;");
    const d = deps({ fetchRepo: vi.fn(async () => ({ files: [...REPO_FILES, stale] as never })) });
    await processFrontendApply(payload(), d);
    const seen = (d.generateComponent as ReturnType<typeof vi.fn>).mock.calls[0][2] as Array<{ path: string }>;
    expect(seen.some((f) => f.path.startsWith(`${AXIS_COMPONENT_DIR}/`))).toBe(false);
  });

  it("targets the pushed branch, not a hardcoded main", async () => {
    const d = deps();
    await processFrontendApply(payload({ ref: "refs/heads/release/2.0" }), d);
    const sent = (d.openPr as ReturnType<typeof vi.fn>).mock.calls[0][0] as { baseBranch: string };
    expect(sent.baseBranch).toBe("release/2.0");
  });

  it("asks for the same deterministic component set every run", async () => {
    const d = deps();
    await processFrontendApply(payload(), d);
    const requested = (d.generateComponent as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[1]);
    expect(requested).toEqual(PRIMITIVE_REQUESTS.map((p) => p.request));
  });
});

describe("buildPrBody", () => {
  it("states the conformance guarantee and lists the applied paths", () => {
    const body = buildPrBody([componentPath("Button", ".tsx")], []);
    expect(body).toContain("already existed in your design system");
    expect(body).toContain(componentPath("Button", ".tsx"));
    expect(body).not.toContain("Withheld");
  });

  it("names withheld components and why, rather than quietly omitting them", () => {
    const body = buildPrBody([componentPath("Button", ".tsx")], [
      { name: "Card", reason: "invented_colors", invented_colors: ["#ff00ff"] },
    ]);
    expect(body).toContain("Withheld");
    expect(body).toContain("Card");
    expect(body).toContain("#ff00ff");
  });
});
