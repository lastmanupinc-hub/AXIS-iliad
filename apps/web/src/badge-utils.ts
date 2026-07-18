// H-Phase-A cycle 9: statusBadgeClass and gradeBadgeClass were each
// independently copy-pasted into AccountDashboardPage.tsx, ProjectsPage.tsx,
// and VersionsTab.tsx. Cycle 3 already found and fixed one drifted VALUE
// inside this triplication (AccountDashboardPage's copy didn't treat "A+"
// the same as "A") — a symptom of there being three separate places to fix
// the same bug in, not three coincidentally-parallel bugs. Consolidated to
// one source so nothing can drift between the three views of the same
// project/snapshot/grade data again.
//
// DiffViewer.tsx's own statusBadgeClass is NOT part of this — it maps a
// different vocabulary (FileDiff["status"]: "added"/"removed"/"modified")
// and only coincidentally shares a name; folding it in here would change
// its behavior, not just its location.

/** Badge class for a snapshot/project's lifecycle status. */
export function statusBadgeClass(status: string): string {
  if (status === "ready") return "badge badge-green";
  if (status === "failed") return "badge badge-red";
  return "badge badge-yellow"; // "processing"
}

/** Badge class for a compliance-grade letter ("A+".."D", or null/unknown). */
export function gradeBadgeClass(letter: string | null): string {
  if (letter === "A" || letter === "A+") return "badge badge-green";
  if (letter === "B") return "badge badge-blue";
  if (letter === "C") return "badge badge-yellow";
  if (letter === "D") return "badge badge-red";
  return "badge";
}
