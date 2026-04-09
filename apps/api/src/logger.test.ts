import { describe, it, expect, vi, afterEach } from "vitest";
import { log } from "./logger.js";

describe("LOG_LEVEL filtering", () => {
  afterEach(() => {
    delete process.env.LOG_LEVEL;
    vi.restoreAllMocks();
  });

  it("writes info by default (LOG_LEVEL unset)", () => {
    const spy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    log("info", "test_msg");
    expect(spy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.level).toBe("info");
    expect(parsed.msg).toBe("test_msg");
  });

  it("writes error to stderr", () => {
    const spy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    log("error", "err_msg");
    expect(spy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.level).toBe("error");
  });

  it("writes warn to stdout", () => {
    const spy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    log("warn", "warn_msg");
    expect(spy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.level).toBe("warn");
  });

  it("writes debug when LOG_LEVEL=debug", () => {
    process.env.LOG_LEVEL = "debug";
    const spy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    log("debug", "debug_msg");
    expect(spy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.level).toBe("debug");
  });

  it("suppresses debug when LOG_LEVEL=info (default)", () => {
    process.env.LOG_LEVEL = "info";
    const spy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    log("debug", "should_not_appear");
    expect(spy).not.toHaveBeenCalled();
  });

  it("suppresses info when LOG_LEVEL=warn", () => {
    process.env.LOG_LEVEL = "warn";
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    log("info", "suppressed");
    expect(stdoutSpy).not.toHaveBeenCalled();
    // warn should still go through
    log("warn", "visible");
    expect(stdoutSpy).toHaveBeenCalledOnce();
    // error should still go through
    log("error", "also_visible");
    expect(stderrSpy).toHaveBeenCalledOnce();
  });

  it("suppresses info and warn when LOG_LEVEL=error", () => {
    process.env.LOG_LEVEL = "error";
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    log("info", "suppressed");
    log("warn", "also_suppressed");
    expect(stdoutSpy).not.toHaveBeenCalled();
    log("error", "visible");
    expect(stderrSpy).toHaveBeenCalledOnce();
  });

  it("falls back to info for invalid LOG_LEVEL", () => {
    process.env.LOG_LEVEL = "garbage";
    const spy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    log("debug", "suppressed_because_fallback_is_info");
    expect(spy).not.toHaveBeenCalled();
    log("info", "visible_because_fallback_is_info");
    expect(spy).toHaveBeenCalledOnce();
  });

  it("includes extra data fields in log entry", () => {
    const spy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    log("info", "with_data", { port: 4000, service: "test" });
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.port).toBe(4000);
    expect(parsed.service).toBe("test");
    expect(parsed.timestamp).toBeDefined();
  });
});
