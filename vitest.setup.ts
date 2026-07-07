import { beforeEach } from "vitest";

// Per-file `localStorage.clear()`/`sessionStorage.clear()` calls only reset
// state WITHIN a file's own beforeEach — with fileParallelism:false, all
// test files run sequentially in one worker sharing one happy-dom window, so
// a value one file writes and never cleans up (e.g. a route-triggering
// dashboard/anon-result key) silently leaks into the next file's tests.
// Guarded (typeof check) so plain `environment: "node"` test files — which
// have no `window`/storage — are unaffected.
beforeEach(() => {
  if (typeof localStorage !== "undefined") localStorage.clear();
  if (typeof sessionStorage !== "undefined") sessionStorage.clear();
});
