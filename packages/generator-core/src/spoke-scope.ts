// ─── spoke_06: narrowing a run to one product's programs ─────────────────────
//
// A spoke (theme.trustfabric.ai) sells ONE program. The hub sells all of them.
// The requirement is not merely that a spoke produces less — it is that a spoke
// produces THE SAME BYTES for the program it sells, because the alternative is
// a forked code path that drifts silently.
//
// This repo already has that bug family by name: REST/MCP twin-implementation
// divergence, where two surfaces answer the same question differently because
// each grew its own copy. Twenty-one spokes are twenty-one invitations to repeat
// it. So a spoke does not get its own generator, its own filter, or its own
// output list — it gets a narrowed `requested_outputs` computed HERE, and then
// calls exactly the same generateFiles() the hub calls.
//
// The guard in spoke-scope.test.ts asserts byte-identity between the two paths
// for every product, so a fork cannot be introduced without failing the suite.
import { GENERATOR_PROGRAMS } from "./program-manifest.js";

/** The outputs a program emits, straight from the generator registry. */
export function outputsForPrograms(programs: readonly string[]): string[] {
  const want = new Set(programs);
  const out: string[] = [];
  for (const [generator, program] of Object.entries(GENERATOR_PROGRAMS)) {
    if (want.has(program as string)) out.push(generator);
  }
  // Sorted so a spoke's request is deterministic regardless of registry order —
  // generateFiles dedupes into a Set, but a stable request keeps logs diffable.
  return out.sort();
}

/**
 * The program set a product sells, from the registry.
 *
 * Returns null for an unknown id rather than an empty list: an empty list is a
 * legitimate answer ("this product sells nothing") and would silently produce a
 * near-empty run, whereas an unknown product id is a caller bug and must be
 * distinguishable from it.
 */
export function programsForProduct(
  registry: ReadonlyArray<{ id: string; programs: string[] }>,
  productId: string,
): string[] | null {
  const found = registry.find((p) => p.id === productId);
  return found ? [...found.programs] : null;
}

/** Convenience: the exact `requested_outputs` a spoke should ask for. */
export function outputsForProduct(
  registry: ReadonlyArray<{ id: string; programs: string[] }>,
  productId: string,
): string[] | null {
  const programs = programsForProduct(registry, productId);
  return programs ? outputsForPrograms(programs) : null;
}
