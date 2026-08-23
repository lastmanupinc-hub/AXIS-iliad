import { describe, it, expect, vi, beforeEach } from "vitest";

const processSkillsRefresh = vi.fn();
const processThemeTokenSync = vi.fn();
const processMcpHostedSync = vi.fn();
const processSearchIndexSync = vi.fn();
const processCanvasDiagramSync = vi.fn();
const processSeoApply = vi.fn();
const processFrontendApply = vi.fn();
const processNotebookReindex = vi.fn();
const processObsidianVaultSync = vi.fn();
const processArtifactsApply = vi.fn();
const processMarketingApply = vi.fn();
const processDebugPostmortem = vi.fn();

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
vi.mock("./frontend-apply-watcher.js", () => ({
  processFrontendApply: (...args: unknown[]) => processFrontendApply(...args),
  defaultFrontendApplyDeps: () => "frontend-deps",
}));
vi.mock("./notebook-reindex-watcher.js", () => ({
  processNotebookReindex: (...args: unknown[]) => processNotebookReindex(...args),
  defaultNotebookReindexDeps: () => "notebook-deps",
}));
vi.mock("./obsidian-vault-watcher.js", () => ({
  processObsidianVaultSync: (...args: unknown[]) => processObsidianVaultSync(...args),
  defaultObsidianVaultDeps: () => "obsidian-deps",
}));
vi.mock("./artifacts-apply-watcher.js", () => ({
  processArtifactsApply: (...args: unknown[]) => processArtifactsApply(...args),
  defaultArtifactsApplyDeps: () => "artifacts-deps",
}));
vi.mock("./marketing-apply-watcher.js", () => ({
  processMarketingApply: (...args: unknown[]) => processMarketingApply(...args),
  defaultMarketingApplyDeps: () => "marketing-deps",
}));
vi.mock("./debug-postmortem-watcher.js", () => ({
  processDebugPostmortem: (...args: unknown[]) => processDebugPostmortem(...args),
  defaultDebugPostmortemDeps: () => "debug-deps",
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
    expect(processFrontendApply).not.toHaveBeenCalled();
  });

  // Pre-existing gap found while adding notebook below: frontend was wired
  // into the dispatcher (5686df7) but never got a fall-through test of its
  // own — the chain silently relied on the real (unmocked) processFrontendApply
  // in every test after it, which only worked because none of those tests'
  // product_ids happened to be "frontend". Closed alongside notebook rather
  // than left to rot further.
  it("falls through to the frontend processor when every earlier handler declines the product_id", async () => {
    processSkillsRefresh.mockResolvedValue({ status: "not_skills_product" });
    processThemeTokenSync.mockResolvedValue({ status: "not_theme_product" });
    processMcpHostedSync.mockResolvedValue({ status: "not_mcp_product" });
    processSearchIndexSync.mockResolvedValue({ status: "not_search_product" });
    processCanvasDiagramSync.mockResolvedValue({ status: "not_canvas_product" });
    processSeoApply.mockResolvedValue({ status: "not_seo_product" });
    processFrontendApply.mockResolvedValue({ status: "pr_opened" });
    const dispatch = await loadDispatchWatchJob();
    await dispatch({ ...payload, product_id: "frontend" });
    expect(processFrontendApply).toHaveBeenCalledWith({ ...payload, product_id: "frontend" }, "frontend-deps");
    expect(processNotebookReindex).not.toHaveBeenCalled();
  });

  it("falls through to the notebook processor when every earlier handler declines the product_id", async () => {
    processSkillsRefresh.mockResolvedValue({ status: "not_skills_product" });
    processThemeTokenSync.mockResolvedValue({ status: "not_theme_product" });
    processMcpHostedSync.mockResolvedValue({ status: "not_mcp_product" });
    processSearchIndexSync.mockResolvedValue({ status: "not_search_product" });
    processCanvasDiagramSync.mockResolvedValue({ status: "not_canvas_product" });
    processSeoApply.mockResolvedValue({ status: "not_seo_product" });
    processFrontendApply.mockResolvedValue({ status: "not_frontend_product" });
    processNotebookReindex.mockResolvedValue({ status: "indexed" });
    const dispatch = await loadDispatchWatchJob();
    await dispatch({ ...payload, product_id: "notebook" });
    expect(processNotebookReindex).toHaveBeenCalledWith({ ...payload, product_id: "notebook" }, "notebook-deps");
    expect(processObsidianVaultSync).not.toHaveBeenCalled();
  });

  it("falls through to the obsidian processor when every earlier handler declines the product_id", async () => {
    processSkillsRefresh.mockResolvedValue({ status: "not_skills_product" });
    processThemeTokenSync.mockResolvedValue({ status: "not_theme_product" });
    processMcpHostedSync.mockResolvedValue({ status: "not_mcp_product" });
    processSearchIndexSync.mockResolvedValue({ status: "not_search_product" });
    processCanvasDiagramSync.mockResolvedValue({ status: "not_canvas_product" });
    processSeoApply.mockResolvedValue({ status: "not_seo_product" });
    processFrontendApply.mockResolvedValue({ status: "not_frontend_product" });
    processNotebookReindex.mockResolvedValue({ status: "not_notebook_product" });
    processObsidianVaultSync.mockResolvedValue({ status: "pr_opened" });
    const dispatch = await loadDispatchWatchJob();
    await dispatch({ ...payload, product_id: "obsidian" });
    expect(processObsidianVaultSync).toHaveBeenCalledWith({ ...payload, product_id: "obsidian" }, "obsidian-deps");
    expect(processArtifactsApply).not.toHaveBeenCalled();
  });

  it("falls through to the artifacts processor when every earlier handler declines the product_id", async () => {
    processSkillsRefresh.mockResolvedValue({ status: "not_skills_product" });
    processThemeTokenSync.mockResolvedValue({ status: "not_theme_product" });
    processMcpHostedSync.mockResolvedValue({ status: "not_mcp_product" });
    processSearchIndexSync.mockResolvedValue({ status: "not_search_product" });
    processCanvasDiagramSync.mockResolvedValue({ status: "not_canvas_product" });
    processSeoApply.mockResolvedValue({ status: "not_seo_product" });
    processFrontendApply.mockResolvedValue({ status: "not_frontend_product" });
    processNotebookReindex.mockResolvedValue({ status: "not_notebook_product" });
    processObsidianVaultSync.mockResolvedValue({ status: "not_obsidian_product" });
    processArtifactsApply.mockResolvedValue({ status: "uploaded" });
    processMarketingApply.mockResolvedValue({ status: "test_sent" });
    const dispatch = await loadDispatchWatchJob();
    await dispatch({ ...payload, product_id: "artifacts" });
    expect(processArtifactsApply).toHaveBeenCalledWith({ ...payload, product_id: "artifacts" }, "artifacts-deps");
    expect(processMarketingApply).not.toHaveBeenCalled();
  });

  it("falls through to the marketing processor when every earlier handler declines the product_id", async () => {
    processSkillsRefresh.mockResolvedValue({ status: "not_skills_product" });
    processThemeTokenSync.mockResolvedValue({ status: "not_theme_product" });
    processMcpHostedSync.mockResolvedValue({ status: "not_mcp_product" });
    processSearchIndexSync.mockResolvedValue({ status: "not_search_product" });
    processCanvasDiagramSync.mockResolvedValue({ status: "not_canvas_product" });
    processSeoApply.mockResolvedValue({ status: "not_seo_product" });
    processFrontendApply.mockResolvedValue({ status: "not_frontend_product" });
    processNotebookReindex.mockResolvedValue({ status: "not_notebook_product" });
    processObsidianVaultSync.mockResolvedValue({ status: "not_obsidian_product" });
    processArtifactsApply.mockResolvedValue({ status: "not_artifacts_product" });
    processMarketingApply.mockResolvedValue({ status: "test_sent" });
    const dispatch = await loadDispatchWatchJob();
    await dispatch({ ...payload, product_id: "marketing" });
    expect(processMarketingApply).toHaveBeenCalledWith({ ...payload, product_id: "marketing" }, "marketing-deps");
    expect(processDebugPostmortem).not.toHaveBeenCalled();
  });

  it("falls through to the debug-postmortem processor when every earlier handler declines the product_id", async () => {
    processSkillsRefresh.mockResolvedValue({ status: "not_skills_product" });
    processThemeTokenSync.mockResolvedValue({ status: "not_theme_product" });
    processMcpHostedSync.mockResolvedValue({ status: "not_mcp_product" });
    processSearchIndexSync.mockResolvedValue({ status: "not_search_product" });
    processCanvasDiagramSync.mockResolvedValue({ status: "not_canvas_product" });
    processSeoApply.mockResolvedValue({ status: "not_seo_product" });
    processFrontendApply.mockResolvedValue({ status: "not_frontend_product" });
    processNotebookReindex.mockResolvedValue({ status: "not_notebook_product" });
    processObsidianVaultSync.mockResolvedValue({ status: "not_obsidian_product" });
    processArtifactsApply.mockResolvedValue({ status: "not_artifacts_product" });
    processMarketingApply.mockResolvedValue({ status: "not_marketing_product" });
    processDebugPostmortem.mockResolvedValue({ status: "pr_opened" });
    const dispatch = await loadDispatchWatchJob();
    await dispatch({ ...payload, product_id: "debug" });
    expect(processDebugPostmortem).toHaveBeenCalledWith({ ...payload, product_id: "debug" }, "debug-deps");
  });

  it("does not throw when no processor claims the product_id (an unhandled product is a log line, not a crash)", async () => {
    processSkillsRefresh.mockResolvedValue({ status: "not_skills_product" });
    processThemeTokenSync.mockResolvedValue({ status: "not_theme_product" });
    processMcpHostedSync.mockResolvedValue({ status: "not_mcp_product" });
    processSearchIndexSync.mockResolvedValue({ status: "not_search_product" });
    processCanvasDiagramSync.mockResolvedValue({ status: "not_canvas_product" });
    processSeoApply.mockResolvedValue({ status: "not_seo_product" });
    processFrontendApply.mockResolvedValue({ status: "not_frontend_product" });
    processNotebookReindex.mockResolvedValue({ status: "not_notebook_product" });
    processObsidianVaultSync.mockResolvedValue({ status: "not_obsidian_product" });
    processArtifactsApply.mockResolvedValue({ status: "not_artifacts_product" });
    processMarketingApply.mockResolvedValue({ status: "not_marketing_product" });
    processDebugPostmortem.mockResolvedValue({ status: "not_debug_product" });
    const dispatch = await loadDispatchWatchJob();
    await expect(dispatch({ ...payload, product_id: "some-future-product" })).resolves.toBeUndefined();
  });
});
