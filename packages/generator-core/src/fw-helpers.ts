import type { ContextMap } from "@axis/context-engine";

/** Case-insensitive check: does the project use any of the named frameworks? */
export function hasFw(ctx: ContextMap, ...names: string[]): boolean {
  return ctx.detection.frameworks.some(f => names.some(n => f.name.toLowerCase() === n.toLowerCase()));
}

/** Case-insensitive lookup: find a framework detection entry by name. */
export function getFw(ctx: ContextMap, name: string) {
  return ctx.detection.frameworks.find(f => f.name.toLowerCase() === name.toLowerCase());
}
