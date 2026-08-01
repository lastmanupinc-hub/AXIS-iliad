import { describe, it, expect, vi, beforeEach } from "vitest";

const processSkillsRefresh = vi.fn();
const processThemeTokenSync = vi.fn();

vi.mock("./skills-refresh-watcher.js", () => ({
  processSkillsRefresh: (...args: unknown[]) => processSkillsRefresh(...args),
  defaultSkillsRefreshDeps: () => "skills-deps",
}));
vi.mock("./theme-token-sync-watcher.js", () => ({
  processThemeTokenSync: (...args: unknown[]) => processThemeTokenSync(...args),
  defaultThemeTokenSyncDeps: () => "theme-deps",
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
  });

  it("does not throw when no processor claims the product_id (an unhandled product is a log line, not a crash)", async () => {
    processSkillsRefresh.mockResolvedValue({ status: "not_skills_product" });
    processThemeTokenSync.mockResolvedValue({ status: "not_theme_product" });
    const dispatch = await loadDispatchWatchJob();
    await expect(dispatch({ ...payload, product_id: "mcp" })).resolves.toBeUndefined();
  });
});
