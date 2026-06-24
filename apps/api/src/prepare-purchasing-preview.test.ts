import { beforeEach, describe, expect, it } from "vitest";
import { resetTestDb } from "@axis/snapshots";
import { runPreparePurchasingPreview } from "./mcp-server.js";

function preview(args: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(runPreparePurchasingPreview(args));
}

describe("prepare_agentic_purchasing_preview (free, no auth)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("scores a codebase for free with gaps + a conversion CTA", async () => {
    const r = preview({
      project_name: "demo",
      project_type: "api_service",
      files: [
        { path: "README.md", content: "# demo" },
        { path: "package.json", content: '{"dependencies":{"stripe":"^14"}}' },
      ],
    }) as any;
    expect(typeof r.score).toBe("number");
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(Array.isArray(r.gaps)).toBe(true);
    expect(["low", "medium", "high"]).toContain(r.risk_level);
    expect(r.conversion.tool).toBe("prepare_agentic_purchasing");
    expect(r.cost).toContain("free");
    expect(r.frameworks_detected).toContain("stripe"); // detected from package.json dep
  });

  it("requires project_name and a non-empty files array", async () => {
    expect(() => preview({ files: [{ path: "a", content: "b" }] })).toThrow(/project_name/);
    expect(() => preview({ project_name: "x", files: [] })).toThrow(/non-empty/);
  });

  it("enforces the 25-file preview cap (pushes larger jobs to the paid tool)", async () => {
    const files = Array.from({ length: 26 }, (_, i) => ({ path: `f${i}.ts`, content: "x" }));
    expect(() => preview({ project_name: "x", files })).toThrow(/max 25 files/);
  });
});
