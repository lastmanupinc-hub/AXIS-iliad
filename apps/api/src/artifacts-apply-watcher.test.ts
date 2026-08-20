// app_23 Apply stage. Deps are injected — no live esbuild/happy-dom timing
// dependency and no real R2 bucket needed to exercise every path here.
//
// The cases that matter are the ones where the pipeline does NOT produce a
// hosted URL: a watcher tempted to report "uploaded" when the widget was
// actually withheld, or invent a URL when R2 isn't configured, is exactly
// the money_02-shaped failure this repo has already been burned by once.
import { describe, it, expect, vi } from "vitest";
import type { WatchJobPayload } from "@axis/snapshots";
import { processArtifactsApply, type ArtifactsApplyDeps } from "./artifacts-apply-watcher.js";
import type { BuildWidgetResult } from "./artifacts-bundler.js";
import type { UploadWidgetResult } from "./artifacts-upload.js";

const payload = (over: Partial<WatchJobPayload> = {}): WatchJobPayload =>
  ({
    account_id: "acct_1",
    repo_full_name: "acme/widget",
    product_id: "artifacts",
    ref: "refs/heads/main",
    event_type: "push",
    ...over,
  }) as WatchJobPayload;

const file = (path: string, content: string) => ({ path, content, size: content.length });
const REPO_FILES = [
  file("package.json", JSON.stringify({ name: "widget", dependencies: { react: "^19" } })),
  file("src/App.tsx", "export const App = () => <div />;"),
];

const BUILT: BuildWidgetResult = { status: "built", code: "(()=>{/* real bundle */})();" };

function deps(over: Partial<ArtifactsApplyDeps> = {}): ArtifactsApplyDeps {
  return {
    token: "gh-token",
    fetchRepo: vi.fn(async () => ({ files: REPO_FILES as never })),
    buildWidget: vi.fn(async () => BUILT),
    uploadWidget: vi.fn(async () => ({ status: "uploaded", url: "https://r2.example/signed", expires_at: "2026-08-27T12:00:00.000Z", key: "accounts/acct_1/cas/deadbeef.js" }) as UploadWidgetResult),
    ...over,
  };
}

describe("processArtifactsApply — routing and preconditions", () => {
  it("ignores jobs for other products so the dispatcher can fall through", async () => {
    const r = await processArtifactsApply(payload({ product_id: "seo" }), deps());
    expect(r.status).toBe("not_artifacts_product");
  });

  it("does nothing without a GitHub token rather than failing mid-apply", async () => {
    const r = await processArtifactsApply(payload(), deps({ token: undefined }));
    expect(r.status).toBe("no_token");
  });
});

describe("processArtifactsApply — the honest-outcome paths", () => {
  it("uploads a built widget and returns the real hosted URL", async () => {
    const d = deps();
    const r = await processArtifactsApply(payload(), d);
    expect(r.status).toBe("uploaded");
    expect(r.url).toBe("https://r2.example/signed");
    expect(r.expires_at).toBe("2026-08-27T12:00:00.000Z");
    expect(d.buildWidget).toHaveBeenCalledTimes(1);
    expect(d.uploadWidget).toHaveBeenCalledTimes(1);
    expect(d.uploadWidget).toHaveBeenCalledWith(BUILT.code, "acct_1");
  });

  it("reports withheld with the real reason and NEVER calls uploadWidget for a failed build", async () => {
    const d = deps({
      buildWidget: vi.fn(async () => ({
        status: "withheld",
        reason: "audit_failed",
        findings: [{ file: "x.tsx", line: 3, category: "missing-alt", klass: "A11Y", note: "no alt" }],
      }) as BuildWidgetResult),
    });
    const r = await processArtifactsApply(payload(), d);
    expect(r.status).toBe("withheld");
    expect(r.reason).toBe("audit_failed");
    expect(r.findings).toEqual(["missing-alt:3"]);
    // The core guard: a withheld widget must never reach the upload step —
    // that would be shipping the exact caveated-half-good artifact the
    // frontend program's own precedent explicitly refuses to do.
    expect(d.uploadWidget).not.toHaveBeenCalled();
  });

  it("reports not_configured honestly rather than fabricating a URL when R2 is absent", async () => {
    const d = deps({ uploadWidget: vi.fn(async () => ({ status: "not_configured" }) as UploadWidgetResult) });
    const r = await processArtifactsApply(payload(), d);
    expect(r.status).toBe("not_configured");
    expect(r.url).toBeUndefined();
  });

  it("surfaces a real upload failure rather than reporting success", async () => {
    const d = deps({
      uploadWidget: vi.fn(async () => ({ status: "upload_failed", error: "R2 PUT returned HTTP 403" }) as UploadWidgetResult),
    });
    const r = await processArtifactsApply(payload(), d);
    expect(r.status).toBe("upload_failed");
    expect(r.reason).toBe("R2 PUT returned HTTP 403");
    expect(r.url).toBeUndefined();
  });
});
