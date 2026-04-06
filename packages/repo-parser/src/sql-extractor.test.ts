import { describe, it, expect } from "vitest";
import { extractSQLSchema } from "./sql-extractor.js";
import type { FileEntry } from "@axis/snapshots";

function sqlFile(path: string, content: string): FileEntry {
  return { path, content, size: content.length };
}

describe("extractSQLSchema", () => {
  it("extracts a simple CREATE TABLE with columns", () => {
    const tables = extractSQLSchema([
      sqlFile("schema.sql", `
        CREATE TABLE users (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT
        );
      `),
    ]);
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe("users");
    expect(tables[0].columns).toHaveLength(3);
    expect(tables[0].columns[0]).toMatchObject({ name: "id", is_pk: true, nullable: false });
    expect(tables[0].columns[1]).toMatchObject({ name: "name", nullable: false });
    expect(tables[0].columns[2]).toMatchObject({ name: "email", nullable: true });
  });

  it("handles CREATE TABLE IF NOT EXISTS", () => {
    const tables = extractSQLSchema([
      sqlFile("init.sql", `CREATE TABLE IF NOT EXISTS accounts (id INT PRIMARY KEY);`),
    ]);
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe("accounts");
  });

  it("extracts FOREIGN KEY constraints", () => {
    const tables = extractSQLSchema([
      sqlFile("fk.sql", `
        CREATE TABLE orders (
          id INTEGER PRIMARY KEY,
          user_id INTEGER NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users (id)
        );
      `),
    ]);
    expect(tables[0].foreign_keys).toHaveLength(1);
    expect(tables[0].foreign_keys[0]).toMatchObject({
      column: "user_id",
      references_table: "users",
      references_column: "id",
    });
  });

  it("extracts inline REFERENCES on column", () => {
    const tables = extractSQLSchema([
      sqlFile("inline.sql", `
        CREATE TABLE posts (
          id INTEGER PRIMARY KEY,
          author_id INTEGER REFERENCES users(id)
        );
      `),
    ]);
    expect(tables[0].foreign_keys).toHaveLength(1);
    expect(tables[0].foreign_keys[0].references_table).toBe("users");
  });

  it("handles standalone PRIMARY KEY", () => {
    const tables = extractSQLSchema([
      sqlFile("pk.sql", `
        CREATE TABLE tags (
          post_id INTEGER,
          tag_id INTEGER,
          PRIMARY KEY(post_id, tag_id)
        );
      `),
    ]);
    expect(tables[0].columns.filter(c => c.is_pk)).toHaveLength(2);
  });

  it("handles multiple tables in one file", () => {
    const tables = extractSQLSchema([
      sqlFile("multi.sql", `
        CREATE TABLE a (id INT PRIMARY KEY);
        CREATE TABLE b (id INT PRIMARY KEY);
        CREATE TABLE c (id INT PRIMARY KEY);
      `),
    ]);
    expect(tables).toHaveLength(3);
    expect(tables.map(t => t.name)).toEqual(["a", "b", "c"]);
  });

  it("skips non-sql files", () => {
    const tables = extractSQLSchema([
      { path: "readme.md", content: "CREATE TABLE fake (id INT);", size: 30 },
      sqlFile("real.sql", "CREATE TABLE real (id INT PRIMARY KEY);"),
    ]);
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe("real");
  });

  it("returns empty array when no sql files", () => {
    const tables = extractSQLSchema([
      { path: "index.ts", content: "export const x = 1;", size: 20 },
    ]);
    expect(tables).toEqual([]);
  });

  it("sorts tables alphabetically", () => {
    const tables = extractSQLSchema([
      sqlFile("schema.sql", `
        CREATE TABLE zeta (id INT PRIMARY KEY);
        CREATE TABLE alpha (id INT PRIMARY KEY);
      `),
    ]);
    expect(tables[0].name).toBe("alpha");
    expect(tables[1].name).toBe("zeta");
  });

  it("handles quoted identifiers", () => {
    const tables = extractSQLSchema([
      sqlFile("quoted.sql", `CREATE TABLE "user_data" ("id" INTEGER PRIMARY KEY, "full_name" TEXT NOT NULL);`),
    ]);
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe("user_data");
    expect(tables[0].columns[0].name).toBe("id");
  });

  it("extracts standalone PRIMARY KEY constraint", () => {
    const tables = extractSQLSchema([
      sqlFile("pk.sql", `CREATE TABLE composite (
        a INTEGER NOT NULL,
        b INTEGER NOT NULL,
        PRIMARY KEY(a, b)
      );`),
    ]);
    expect(tables).toHaveLength(1);
    expect(tables[0].columns[0]).toMatchObject({ name: "a", is_pk: true, nullable: false });
    expect(tables[0].columns[1]).toMatchObject({ name: "b", is_pk: true, nullable: false });
  });

  it("extracts FOREIGN KEY constraints", () => {
    const tables = extractSQLSchema([
      sqlFile("fk.sql", `CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );`),
    ]);
    expect(tables).toHaveLength(1);
    expect(tables[0].foreign_keys).toHaveLength(1);
    expect(tables[0].foreign_keys[0]).toMatchObject({
      column: "user_id",
      references_table: "users",
      references_column: "id",
    });
  });

  it("skips unrecognized constraint types (UNIQUE, CHECK)", () => {
    const tables = extractSQLSchema([
      sqlFile("constraints.sql", `CREATE TABLE items (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        UNIQUE(name),
        CHECK(length(name) > 0)
      );`),
    ]);
    expect(tables).toHaveLength(1);
    expect(tables[0].columns).toHaveLength(2);
  });
});
