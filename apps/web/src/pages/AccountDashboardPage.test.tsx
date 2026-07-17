import { describe, it, expect } from "vitest";
import { gradeBadgeClass } from "./AccountDashboardPage.tsx";

// H-Phase-A cycle 3: this page's gradeBadgeClass was one of three copy-pasted
// implementations (also ProjectsPage.tsx, VersionsTab.tsx). The other two
// treat "A+" the same as "A" (green badge); this one only matched "A",
// falling through to the plain gray default for an A+-graded project — a
// real, user-visible inconsistency between three views of the same grade.
describe("gradeBadgeClass", () => {
  it("treats A+ the same as A (green) — matches ProjectsPage.tsx and VersionsTab.tsx", () => {
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
