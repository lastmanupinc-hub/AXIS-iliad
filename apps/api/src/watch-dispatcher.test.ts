import { describe, it, expect, vi, beforeEach } from "vitest";

const processSkillsRefresh = vi.fn();
const processThemeTokenSync = vi.fn();
const processMcpHostedSync = vi.fn();
const processSearchIndexSync = vi.fn();
const processCanvasDiagramSync = vi.fn();
const processSeoApply = vi.fn();

vi.mock("./skills-refresh-watcher.js", () => ({
  processSkillsRefresh: (...args: unknown[]) => processSkillsRefresh(...args),
  defaultSkillsRefreshDeps: () => "skills-deps",
}));
vi.mock("./theme-token-sync-watcher.js", () => ({
  processThemeTokenSync: (...args: unknown[]) => processThemeTokenSync(...args),
  defaultThemeTokenSyncDeps: () => "theme-deps",
}));
vi.mock("./mcp-hosted.js", () => ({
  processMcpHostedSync: (...args: unknown[]) => processMcpHostedSync(...args),
  defaultMcpHostedSyncDeps: () => "mcp-deps",
}));
vi.mock("./search-index-watcher.js", () => ({
  processSearchIndexSync: (...args: unknown[]) => processSearchIndexSync(...args),
  defaultSearchIndexSyncDeps: () => "search-deps",
}));
vi.mock("./canvas-diagram-watcher.js", () => ({
  processCanvasDiagramSync: (...args: unknown[]) => processCanvasDiagramSync(...args),
  defaultCanvasDiagramSyncDeps: () => "canvas-deps",
}));
vi.mock("./seo-apply-watcher.js", () => ({
  processSeoApply: (...args: unknown[]) => processSeoApply(...args),
  defaultSeoApplyDeps: () => "seo-deps",
}));
vi.mock("@axis/snapshots", () => ({
  registerWatchWorker: vi.fn(async (handler: unknown) => {
    (globalThis as { __capturedHandler?: unknown }).__capturedHandler = handler;
    return "sub-id";
  }),
}));

async function loadDispatchWatchJob() {
  const { startWatchDispatcher } = await import("./watch-dispatcher.js");
  await startWatchDispatcher();
  return (globalThis as { __capturedHandler?: (payload: unknown) => Promise<void> }).__capturedHandler!;
}

const payload = { account_id: "a", product_id: "skills", repo_full_name: "o/r", event_type: "push", ref: "refs/heads/main" };

describe("watch-dispatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers exactly one watch worker for the whole process", async () => {
    const { registerWatchWorker } = await import("@axis/snapshots");
    await loadDispatchWatchJob();
    expect(registerWatchWorker).toHaveBeenCalledTimes(1);
  });

  it("tries the skills processor first, and stops there when it claims the job", async () => {
    processSkillsRefresh.mockResolvedValue({ status: "no_changes" });
    const dispatch = await loadDispatchWatchJob();
    await dispatch(payload);
    expect(processSkillsRefresh).toHaveBeenCalledWith(payload, "skills-deps");
    expect(processThemeTokenSync).not.toHaveBeenCalled();
  });

  it("falls through to the theme processor when skills declines the product_id", async () => {
    processSkillsRefresh.mockResolvedValue({ status: "not_skills_product" });
    processThemeTokenSync.mockResolvedValue({ status: "no_drift" });
    const dispatch = await loadDispatchWatchJob();
    await dispatch({ ...payload, product_id: "theme" });
    expect(processSkillsRefresh).toHaveBeenCalled();
    expect(processThemeTokenSync).toHaveBeenCalledWith({ ...payload, product_id: "theme" }, "theme-deps");
    expect(processMcpHostedSync).not.toHaveBeenCalled();
  });

  it("falls through to the mcp-hosted processor when both skills and theme decline the product_id", async () => {
    processSkillsRefresh.mockResolvedValue({ status: "not_skills_product" });
    processThemeTokenSync.mockResolvedValue({ status: "not_theme_product" });
    processMcpHostedSync.mockResolvedValue({ status: "synced" });
    const dispatch = await loadDispatchWatchJob();
    await dispatch({ ...payload, product_id: "mcp" });
    expect(processMcpHostedSync).toHaveBeenCalledWith({ ...payload, product_id: "mcp" }, "mcp-deps");
    expect(processSearchIndexSync).not.toHaveBeenCalled();
  });

  it("falls through to the search-index processor when skills/theme/mcp all decline the product_id", async () => {
    processSkillsRefresh.mockResolvedValue({ status: "not_skills_product" });
    processThemeTokenSync.mockResolvedValue({ status: "not_theme_product" });
    processMcpHostedSync.mockResolvedValue({ status: "not_mcp_product" });
    processSearchIndexSync.mockResolvedValue({ status: "indexed" });
    const dispatch = await loadDispatchWatchJob();
    await dispatch({ ...payload, product_id: "search" });
    expect(processSearchIndexSync).toHaveBeenCalledWith({ ...payload, product_id: "search" }, "search-deps");
    expect(processCanvasDiagramSync).not.toHaveBeenCalled();
  });

  it("falls through to the canvas-diagram processor when skills/theme/mcp/search all decline the product_id", async () => {
    processSkillsRefresh.mockResolvedValue({ status: "not_skills_product" });
    processThemeTokenSync.mockResolvedValue({ status: "not_theme_product" });
    processMcpHostedSync.mockResolvedValue({ status: "not_mcp_product" });
    processSearchIndexSync.mockResolvedValue({ status: "not_search_product" });
    processCanvasDiagramSync.mockResolvedValue({ status: "pr_opened" });
    const dispatch = await loadDispatchWatchJob();
    await dispatch({ ...payload, product_id: "canvas" });
    expect(processCanvasDiagramSync).toHaveBeenCalledWith({ ...payload, product_id: "canvas" }, "canvas-deps");
    expect(processSeoApply).not.toHaveBeenCalled();
  });

  it("falls through to the seo processor when every earlier handler declines the product_id", async () => {
    processSkillsRefresh.mockResolvedValue({ status: "not_skills_product" });
    processThemeTokenSync.mockResolvedValue({ status: "not_theme_product" });
    processMcpHostedSync.mockResolvedValue({ status: "not_mcp_product" });
    processSearchIndexSync.mockResolvedValue({ status: "not_search_product" });
    processCanvasDiagramSync.mockResolvedValue({ status: "not_canvas_product" });
    processSeoApply.mockResolvedValue({ status: "pr_opened" });
    const dispatch = await loadDispatchWatchJob();
    await dispatch({ ...payload, product_id: "seo" });
    expect(processSeoApply).toHaveBeenCalledWith({ ...payload, product_id: "seo" }, "seo-deps");
  });

  it("does not throw when no processor claims the product_id (an unhandled product is a log line, not a crash)", async () => {
    processSkillsRefresh.mockResolvedValue({ status: "not_skills_product" });
    processThemeTokenSync.mockResolvedValue({ status: "not_theme_product" });
    processMcpHostedSync.mockResolvedValue({ status: "not_mcp_product" });
    processSearchIndexSync.mockResolvedValue({ status: "not_search_product" });
    processCanvasDiagramSync.mockResolvedValue({ status: "not_canvas_product" });
    processSeoApply.mockResolvedValue({ status: "not_seo_product" });
    const dispatch = await loadDispatchWatchJob();
    await expect(dispatch({ ...payload, product_id: "some-future-product" })).resolves.toBeUndefined();
  });
});
