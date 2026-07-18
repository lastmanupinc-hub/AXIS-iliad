import { describe, it, expect } from "vitest";
import { gradeBadgeClass, statusBadgeClass } from "./badge-utils.ts";

// H-Phase-A cycle 9: gradeBadgeClass/statusBadgeClass were each copy-pasted
// into AccountDashboardPage.tsx, ProjectsPage.tsx, and VersionsTab.tsx.
// Cycle 3 already found one drifted VALUE inside that triplication (one
// copy didn't treat "A+" the same as "A") — a symptom of three separate
// places to fix the same bug, not three coincidental ones. This test now
// pins the one shared implementation all three pages import.
describe("gradeBadgeClass", () => {
  it("treats A+ the same as A (green)", () => {
    expect(gradeBadgeClass("A+")).toBe("badge badge-green");
    expect(gradeBadgeClass("A")).toBe("badge badge-green");
  });

  it("maps B/C/D and an unknown/null grade correctly", () => {
    expect(gradeBadgeClass("B")).toBe("badge badge-blue");
    expect(gradeBadgeClass("C")).toBe("badge badge-yellow");
    expect(gradeBadgeClass("D")).toBe("badge badge-red");
    expect(gradeBadgeClass(null)).toBe("badge");
    expect(gradeBadgeClass("F")).toBe("badge");
  });
});

describe("statusBadgeClass", () => {
  it("maps ready/failed/processing statuses", () => {
    expect(statusBadgeClass("ready")).toBe("badge badge-green");
    expect(statusBadgeClass("failed")).toBe("badge badge-red");
    expect(statusBadgeClass("processing")).toBe("badge badge-yellow");
  });
});
