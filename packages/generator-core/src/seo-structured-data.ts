// ─── Structured-data validation (app_30_seo_applies, the V stage) ──────────
//
// The candidate's V is "structured-data validation passes on the rendered
// output". This is that gate: the Watch consumer runs it on the generated
// <head> markup and refuses to open a PR if it fails, so invalid JSON-LD can
// never reach a user's site through AXIS.
//
// Hand-rolled rather than a dependency. schema-dts (named in the original
// candidate) is TYPES ONLY — it validates at compile time against a schema.org
// type graph and does nothing at runtime, so it cannot check generated output.
// A runtime validator for the handful of types this program emits is a few
// rules, and pulling in a full schema.org runtime for them would be a large
// dependency doing less than this file.
//
// Scope is deliberately narrow: structural validity plus the required fields
// Google's rich-results documentation lists for the emitted types. It does not
// try to be a general schema.org validator — a check that pretends to more
// authority than it has is worse than one with honest limits.

export interface StructuredDataIssue {
  /** 1-based index of the JSON-LD block within the document. */
  block: number;
  message: string;
}

export interface StructuredDataResult {
  ok: boolean;
  /** How many <script type="application/ld+json"> blocks were found. */
  blocks: number;
  issues: StructuredDataIssue[];
}

/** Required properties per emitted @type, per Google's rich-results guidance. */
const REQUIRED_FIELDS: Record<string, string[]> = {
  SoftwareApplication: ["name", "applicationCategory"],
  WebSite: ["name"],
  Article: ["headline"],
  Product: ["name"],
};

const LD_BLOCK = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/** Extract every JSON-LD payload from an HTML document or fragment. */
export function extractJsonLdBlocks(html: string): string[] {
  return [...html.matchAll(LD_BLOCK)].map((m) => m[1].trim());
}

/**
 * Validate every JSON-LD block in the given markup.
 *
 * Returns ok:false with specific issues rather than throwing, so a caller can
 * log exactly what was wrong (the Watch consumer surfaces this in its result
 * instead of silently skipping the PR).
 */
export function validateStructuredData(html: string): StructuredDataResult {
  const payloads = extractJsonLdBlocks(html);
  const issues: StructuredDataIssue[] = [];

  payloads.forEach((raw, i) => {
    const block = i + 1;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      issues.push({ block, message: `not valid JSON: ${(err as Error).message}` });
      return;
    }

    // A top-level array of nodes is legal schema.org; check each.
    const nodes = Array.isArray(parsed) ? parsed : [parsed];
    for (const node of nodes) {
      if (typeof node !== "object" || node === null) {
        issues.push({ block, message: "JSON-LD node is not an object" });
        continue;
      }
      const obj = node as Record<string, unknown>;

      const context = obj["@context"];
      if (typeof context !== "string" || !/^https?:\/\/schema\.org\/?$/.test(context)) {
        issues.push({ block, message: `@context must be https://schema.org (got ${JSON.stringify(context)})` });
      }

      const type = obj["@type"];
      if (typeof type !== "string" || type.length === 0) {
        issues.push({ block, message: "@type is missing or not a string" });
        continue; // required-field checks below key off @type
      }

      for (const field of REQUIRED_FIELDS[type] ?? []) {
        const value = obj[field];
        const empty =
          value === undefined ||
          value === null ||
          (typeof value === "string" && value.trim() === "") ||
          (Array.isArray(value) && value.length === 0);
        if (empty) issues.push({ block, message: `${type} requires a non-empty "${field}"` });
      }

      // A generator that emits its own placeholder into a user's <head> is
      // worse than one that omits the tag, so treat placeholders as failures.
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === "string" && /^(TODO|TBD|FIXME|<[^>]+>|\{\{.*\}\})$/i.test(value.trim())) {
          issues.push({ block, message: `"${key}" is an unfilled placeholder (${value.trim()})` });
        }
      }
    }
  });

  return { ok: issues.length === 0, blocks: payloads.length, issues };
}
