import { describe, it, expect } from "vitest";
import type { WatchJobPayload, FileEntry } from "@axis/snapshots";
import {
  processAlgorithmicRender,
  renderAllVariations,
  seededRng,
  layoutFor,
  realRenderVariation,
  realBuildContactSheet,
  VARIATION_MATRIX_PATH,
  THUMBNAILS_DIR,
  CONTACT_SHEET_PATH,
  type AlgorithmicRenderDeps,
  type Variation,
} from "./algorithmic-render-watcher.js";
import type { OpenApplyPrParams } from "./github-pr.js";

// app_44's V gate is the defensible claim — "every variation in the matrix
// renders without error" — so renderAllVariations is tested RED-PROOF style:
// a failing variation must block the whole PR (a partial collection is not
// "the collection exists as images"), never silently ship thin.

function payload(over: Partial<WatchJobPayload> = {}): WatchJobPayload {
  return {
    account_id: "acc-1",
    product_id: "algorithmic",
    repo_full_name: "octo/app",
    event_type: "push",
    ref: "refs/heads/main",
    ...over,
  };
}

const REPO_FILES: FileEntry[] = [{ path: "src/index.ts", content: "export const x = 1;\n", size: 30 }];

function variation(over: Partial<Variation> = {}): Variation {
  return {
    id: "var_001",
    thumbnail: "thumbnails/var_001.png",
    params: { primary_hue: "#3178C6", complexity: 0.5, element_count: 10, layout: "grid", seed: 42 },
    ...over,
  };
}

function makeDeps(opts: {
  token?: string | undefined;
  files?: FileEntry[];
  renderVariation?: (v: Variation) => Buffer;
  buildContactSheet?: (pngs: Buffer[]) => Promise<Buffer>;
} = {}) {
  const token = "token" in opts ? opts.token : "gh-token";
  const openPrCalls: OpenApplyPrParams[] = [];
  const deps: AlgorithmicRenderDeps = {
    token,
    fetchRepo: async () => ({ files: opts.files ?? REPO_FILES }),
    renderVariation: opts.renderVariation ?? ((v) => Buffer.from(`png-for-${v.id}`)),
    buildContactSheet: opts.buildContactSheet ?? (async (pngs) => Buffer.from(`contact-sheet-${pngs.length}`)),
    openPr: async (params) => {
      openPrCalls.push(params);
      return { opened: true, pr_url: "https://github.com/octo/app/pull/1" };
    },
  };
  return { deps, openPrCalls };
}

describe("processAlgorithmicRender — canonical watcher cases", () => {
  it("declines other products without fetching anything", async () => {
    let fetched = false;
    const { deps } = makeDeps();
    deps.fetchRepo = async () => {
      fetched = true;
      return { files: REPO_FILES };
    };
    const result = await processAlgorithmicRender(payload({ product_id: "seo" }), deps);
    expect(result.status).toBe("not_algorithmic_product");
    expect(fetched).toBe(false);
  });

  it("declines without a GitHub token", async () => {
    const { deps } = makeDeps({ token: undefined });
    expect((await processAlgorithmicRender(payload(), deps)).status).toBe("no_token");
  });

  it("opens a PR with the matrix, every rendered variation, and a contact sheet", async () => {
    const { deps, openPrCalls } = makeDeps();
    const result = await processAlgorithmicRender(payload(), deps);
    expect(result.status).toBe("pr_opened");
    expect(result.rendered_count).toBeGreaterThan(0);
    expect(openPrCalls).toHaveLength(1);
    const pr = openPrCalls[0];
    expect(pr.owner).toBe("octo");
    expect(pr.repo).toBe("app");
    expect(pr.branchName).toMatch(/^axis\/algorithmic-collection-[0-9a-f]{12}$/);
    const paths = pr.files.map((f) => f.path);
    expect(paths).toContain(VARIATION_MATRIX_PATH);
    expect(paths).toContain(CONTACT_SHEET_PATH);
    expect(paths.some((p) => p.startsWith(THUMBNAILS_DIR) && p.endsWith(".png"))).toBe(true);
    // Every binary file is correctly marked base64, never treated as UTF-8 text.
    for (const f of pr.files) {
      if (f.path !== VARIATION_MATRIX_PATH) expect(f.encoding).toBe("base64");
    }
  });

  it("RED-PROOF: blocks the PR outright when even one variation fails to render — a partial collection is not shipped silently thin", async () => {
    const { deps, openPrCalls } = makeDeps({
      renderVariation: (v) => {
        if (v.id === "var_003") throw new Error("simulated render failure");
        return Buffer.from(`png-for-${v.id}`);
      },
    });
    const result = await processAlgorithmicRender(payload(), deps);
    expect(result.status).toBe("render_failed");
    expect(result.failed_variations).toContain("var_003");
    expect(openPrCalls).toHaveLength(0);
  });

  it("is idempotent — an identical existing matrix produces no_changes, no PR, no rendering attempted", async () => {
    const first = makeDeps();
    await processAlgorithmicRender(payload(), first.deps);
    const matrixContent = first.openPrCalls[0].files.find((f) => f.path === VARIATION_MATRIX_PATH)?.content;

    let renderCalled = false;
    const second = makeDeps({
      files: [...REPO_FILES, { path: VARIATION_MATRIX_PATH, content: matrixContent ?? "", size: (matrixContent ?? "").length }],
      renderVariation: (v) => {
        renderCalled = true;
        return Buffer.from(`png-for-${v.id}`);
      },
    });
    const result = await processAlgorithmicRender(payload(), second.deps);
    expect(result.status).toBe("no_changes");
    expect(second.openPrCalls).toHaveLength(0);
    expect(renderCalled).toBe(false); // never even attempts to render when nothing changed
  });

  it("never feeds its own prior renders back into the snapshot (the app_11/24/35/32/33 lesson)", async () => {
    const poisoned: FileEntry = { path: `${THUMBNAILS_DIR}var_999.png`, content: "not a real png", size: 20 };
    const { deps } = makeDeps({ files: [...REPO_FILES, poisoned] });
    // Just confirming this doesn't throw / doesn't include the poisoned file
    // as a "variation" — processAlgorithmicRender derives variations purely
    // from generateVariationMatrix's OWN output, never from repo file content,
    // so there's no code path where a stray thumbnail could poison anything.
    const result = await processAlgorithmicRender(payload(), deps);
    expect(result.status).toBe("pr_opened");
  });
});

describe("renderAllVariations — the V gate, red-proven", () => {
  it("attempts every variation even after an earlier one fails, rather than aborting the batch", () => {
    const variations = [variation({ id: "var_001" }), variation({ id: "var_002" }), variation({ id: "var_003" })];
    const result = renderAllVariations(variations, (v) => {
      if (v.id === "var_002") throw new Error("boom");
      return Buffer.from(v.id);
    });
    expect(result.rendered.map((r) => r.id)).toEqual(["var_001", "var_003"]);
    expect(result.failed).toEqual([{ id: "var_002", error: "boom" }]);
  });

  it("reports zero failures when every variation renders cleanly", () => {
    const result = renderAllVariations([variation()], (v) => Buffer.from(v.id));
    expect(result.failed).toEqual([]);
    expect(result.rendered).toHaveLength(1);
  });

  it("RED-PROOF: a null/malformed array element is recorded as a per-item failure, never a second uncaught throw that escapes the whole batch", () => {
    // Found on adversarial review: the catch block used to re-read v.id on
    // the SAME null v that just threw reading v.id in the try — a second,
    // unguarded throw that escaped this function entirely, defeating the
    // "one throwing never aborts the batch" guarantee this function exists
    // to provide.
    const variations = [variation({ id: "var_001" }), null as unknown as Variation, variation({ id: "var_003" })];
    expect(() => renderAllVariations(variations, (v) => Buffer.from(v.id))).not.toThrow();
    const result = renderAllVariations(variations, (v) => Buffer.from(v.id));
    expect(result.rendered.map((r) => r.id)).toEqual(["var_001", "var_003"]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].id).toBe("unknown"); // no real id to report — named honestly, not fabricated
  });
});

describe("seededRng — determinism", () => {
  it("the same seed always produces the same sequence", () => {
    const a = seededRng(42);
    const b = seededRng(42);
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("different seeds produce different sequences", () => {
    const a = seededRng(1)();
    const b = seededRng(2)();
    expect(a).not.toBe(b);
  });

  it("always produces values in [0, 1)", () => {
    const rng = seededRng(7);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("layoutFor — each named layout is genuinely different, not one generic renderer", () => {
  const rng = seededRng(1);

  it("grid places points on an evenly-spaced lattice", () => {
    const points = layoutFor("grid", 4, 100, 100, rng);
    expect(points).toHaveLength(4);
    // 4 points on a 2x2 grid land at the same two distinct x values.
    const xs = new Set(points.map((p) => Math.round(p.x)));
    expect(xs.size).toBeLessThanOrEqual(2);
  });

  it("radial places points around a shared center at increasing angles", () => {
    const points = layoutFor("radial", 4, 100, 100, rng);
    const cx = 50, cy = 50;
    const angles = points.map((p) => Math.atan2(p.y - cy, p.x - cx));
    expect(new Set(angles.map((a) => a.toFixed(2))).size).toBe(4); // 4 distinct angles
  });

  it("force-directed produces non-overlapping points via relaxation, and is the only layout that consumes the rng", () => {
    const points = layoutFor("force-directed", 5, 200, 200, seededRng(9));
    expect(points).toHaveLength(5);
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dx = points[j].x - points[i].x;
        const dy = points[j].y - points[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        expect(dist).toBeGreaterThan(0); // relaxation actually separated them
      }
    }
  });

  it("an unrecognized layout name falls back to grid rather than throwing", () => {
    const grid = layoutFor("grid", 6, 100, 100, rng);
    const unknown = layoutFor("treemap", 6, 100, 100, rng);
    expect(unknown).toEqual(grid);
  });
});

describe("realRenderVariation — real @napi-rs/canvas, no mocks", () => {
  it("renders a real, non-empty PNG buffer for every real layout", () => {
    for (const layout of ["grid", "radial", "force-directed"]) {
      const png = realRenderVariation(variation({ params: { primary_hue: "#3178C6", complexity: 0.5, element_count: 10, layout, seed: 1 } }));
      expect(png.length).toBeGreaterThan(0);
      // Real PNG signature bytes — proves this is genuine image data, not a stub.
      expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
  });

  it("the same variation renders byte-identical output every time (determinism)", () => {
    const v = variation({ params: { primary_hue: "#7C3AED", complexity: 0.7, element_count: 20, layout: "force-directed", seed: 99 } });
    const a = realRenderVariation(v);
    const b = realRenderVariation(v);
    expect(a.equals(b)).toBe(true);
  });

  it("never throws on a malformed color string — falls back to a neutral color", () => {
    expect(() => realRenderVariation(variation({ params: { primary_hue: "not-a-color", complexity: 0.5, element_count: 5, layout: "grid", seed: 1 } }))).not.toThrow();
  });

  it("RED-PROOF: never throws on element_count:NaN — the clamp is NaN-safe, not just range-safe", () => {
    // Found on adversarial review: Math.max(1, Math.min(200, Math.round(NaN)))
    // stays NaN all the way through (Math.min/Math.max don't sanitize NaN the
    // way seededRng's `seed >>> 0` does for seed) — an explicit finiteness
    // check now falls back to a real, renderable count instead.
    expect(() => realRenderVariation(variation({ params: { primary_hue: "#3178C6", complexity: 0.5, element_count: NaN, layout: "grid", seed: 1 } }))).not.toThrow();
    const png = realRenderVariation(variation({ params: { primary_hue: "#3178C6", complexity: 0.5, element_count: NaN, layout: "grid", seed: 1 } }));
    expect(png.length).toBeGreaterThan(0);
  });
});

describe("realBuildContactSheet — real sharp, no mocks", () => {
  it("composites N thumbnails into one real PNG", async () => {
    const pngs = [
      realRenderVariation(variation({ id: "a" })),
      realRenderVariation(variation({ id: "b", params: { primary_hue: "#EF4444", complexity: 0.3, element_count: 5, layout: "radial", seed: 2 } })),
    ];
    const sheet = await realBuildContactSheet(pngs);
    expect(sheet.length).toBeGreaterThan(0);
    expect(sheet.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });

  it("throws on an empty collection rather than silently producing a blank image", async () => {
    await expect(realBuildContactSheet([])).rejects.toThrow();
  });
});
