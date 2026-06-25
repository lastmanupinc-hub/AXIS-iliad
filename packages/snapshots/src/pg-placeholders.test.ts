import { describe, it, expect } from "vitest";
import { pgPlaceholders } from "./pg.js";

describe("pgPlaceholders — SQL-aware ? → $N (A5)", () => {
  it("rewrites bare positional placeholders left-to-right", () => {
    expect(pgPlaceholders("SELECT * FROM t WHERE a = ? AND b = ?")).toBe(
      "SELECT * FROM t WHERE a = $1 AND b = $2",
    );
  });

  it("leaves ? inside single-quoted string literals (the corrupting bug)", () => {
    expect(pgPlaceholders("SELECT * FROM t WHERE note = 'why?' AND x = ?")).toBe(
      "SELECT * FROM t WHERE note = 'why?' AND x = $1",
    );
  });

  it("handles '' escaped quotes inside string literals", () => {
    expect(pgPlaceholders("WHERE s = 'it''s a ?' AND x = ?")).toBe("WHERE s = 'it''s a ?' AND x = $1");
  });

  it("leaves ? inside double-quoted identifiers", () => {
    expect(pgPlaceholders('SELECT "weird?col" FROM t WHERE x = ?')).toBe(
      'SELECT "weird?col" FROM t WHERE x = $1',
    );
  });

  it("leaves ? inside line and block comments", () => {
    expect(pgPlaceholders("-- is this ?\nSELECT ?")).toBe("-- is this ?\nSELECT $1");
    expect(pgPlaceholders("SELECT /* a ? b */ ?")).toBe("SELECT /* a ? b */ $1");
  });

  it("leaves ? inside dollar-quoted strings", () => {
    expect(pgPlaceholders("SELECT $$ a ? b $$ , ?")).toBe("SELECT $$ a ? b $$ , $1");
    expect(pgPlaceholders("SELECT $tag$ ? $tag$ , ?")).toBe("SELECT $tag$ ? $tag$ , $1");
  });

  it("keeps jsonb ?| and ?& operators verbatim while numbering real params", () => {
    expect(pgPlaceholders("WHERE data ?| array['a','b'] AND id = ?")).toBe(
      "WHERE data ?| array['a','b'] AND id = $1",
    );
    expect(pgPlaceholders("WHERE data ?& array['a'] AND id = ?")).toBe(
      "WHERE data ?& array['a'] AND id = $1",
    );
  });

  it("numbers params correctly when interleaved with skipped ?", () => {
    expect(pgPlaceholders("a=? AND b='x?y' AND c=? -- ?\nAND d=?")).toBe(
      "a=$1 AND b='x?y' AND c=$2 -- ?\nAND d=$3",
    );
  });

  it("is a faithful no-op on SQL with no placeholders", () => {
    expect(pgPlaceholders("SELECT 1")).toBe("SELECT 1");
    expect(pgPlaceholders("INSERT INTO t (a,b) VALUES ('?', '??')")).toBe(
      "INSERT INTO t (a,b) VALUES ('?', '??')",
    );
  });
});

describe("pgPlaceholders — edge cases + numbering invariant (A5 hardening)", () => {
  it("tracks NESTED block-comment depth (does not regress to flat /* */ matching)", () => {
    expect(pgPlaceholders("SELECT /* a /* b ? */ c ? */ ?")).toBe("SELECT /* a /* b ? */ c ? */ $1");
  });

  it("numbers adjacent placeholders", () => {
    expect(pgPlaceholders("VALUES (?, ?, ?)")).toBe("VALUES ($1, $2, $3)");
    expect(pgPlaceholders("??")).toBe("$1$2");
  });

  it("leaves a ? inside an unterminated string verbatim (pg rejects the malformed SQL — no silent corruption)", () => {
    expect(pgPlaceholders("WHERE x = 'oops ? ")).toBe("WHERE x = 'oops ? ");
  });

  it("handles a placeholder immediately after a closing quote", () => {
    expect(pgPlaceholders("WHERE s = 'x'=?")).toBe("WHERE s = 'x'=$1");
  });

  it("emits dense, sequential $1..$N — a skipped ? never consumes an index", () => {
    const out = pgPlaceholders("a=? AND b='skip?' AND c=? /* ? */ AND d=? -- ?\nAND e=?");
    const nums = [...out.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
    expect(nums).toEqual([1, 2, 3, 4]); // four real params; the three skipped ? contribute none
  });
});
