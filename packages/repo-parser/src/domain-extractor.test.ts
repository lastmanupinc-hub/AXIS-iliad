import { describe, it, expect } from "vitest";
import { extractDomainModels } from "./domain-extractor.js";
import type { FileEntry } from "@axis/snapshots";

function makeFile(path: string, content: string): FileEntry {
  return { path, content, size: content.length };
}

describe("extractDomainModels", () => {
  describe("Go structs and interfaces", () => {
    it("extracts exported Go struct with fields", () => {
      const models = extractDomainModels([
        makeFile("domain/user.go", `package domain

type User struct {
	ID   int
	Name string
	Email string
}
`),
      ]);
      expect(models).toHaveLength(1);
      expect(models[0]).toMatchObject({
        name: "User",
        kind: "struct",
        language: "Go",
        source_file: "domain/user.go",
      });
      expect(models[0].fields).toHaveLength(3);
      expect(models[0].fields[0]).toMatchObject({ name: "ID", type: "int" });
    });

    it("skips unexported Go structs", () => {
      const models = extractDomainModels([
        makeFile("internal/cache.go", `package internal

type cacheEntry struct {
	Key   string
	Value string
}

type Config struct {
	Timeout int
}
`),
      ]);
      expect(models).toHaveLength(1);
      expect(models[0].name).toBe("Config");
    });

    it("extracts Go interfaces", () => {
      const models = extractDomainModels([
        makeFile("repository/repo.go", `package repository

type UserRepository interface {
	FindByID(id int) *User
	Save(user User) error
}
`),
      ]);
      expect(models).toHaveLength(1);
      expect(models[0].kind).toBe("interface");
      expect(models[0].fields).toHaveLength(2);
      expect(models[0].fields[0].name).toBe("FindByID");
    });
  });

  describe("TypeScript types", () => {
    it("extracts TS interface", () => {
      const models = extractDomainModels([
        makeFile("src/types.ts", `export interface Product {
  id: string;
  name: string;
  price: number;
}
`),
      ]);
      expect(models).toHaveLength(1);
      expect(models[0]).toMatchObject({ name: "Product", kind: "interface", language: "TypeScript" });
      expect(models[0].fields).toHaveLength(3);
    });

    it("extracts TS type alias with object shape", () => {
      const models = extractDomainModels([
        makeFile("src/types.ts", `export type Config = {
  port: number;
  host: string;
}
`),
      ]);
      expect(models).toHaveLength(1);
      expect(models[0].kind).toBe("type_alias");
    });

    it("extracts TS enum", () => {
      const models = extractDomainModels([
        makeFile("src/status.ts", `export enum Status {
  Active,
  Inactive,
  Deleted,
}
`),
      ]);
      expect(models).toHaveLength(1);
      expect(models[0].kind).toBe("enum");
      expect(models[0].fields).toHaveLength(3);
    });
  });

  describe("Python classes", () => {
    it("extracts Python class with typed fields", () => {
      const models = extractDomainModels([
        makeFile("models/user.py", `class User:
    def __init__(self):
        self.name: str = ""
        self.email: str = ""
        self.age: int = 0
`),
      ]);
      expect(models).toHaveLength(1);
      expect(models[0]).toMatchObject({ name: "User", kind: "class", language: "Python" });
      expect(models[0].fields).toHaveLength(3);
      expect(models[0].fields[0]).toMatchObject({ name: "name", type: "str" });
    });

    it("skips lowercase class names", () => {
      const models = extractDomainModels([
        makeFile("internal.py", `class helper:
    pass

class Service:
    def __init__(self):
        self.active = True
`),
      ]);
      expect(models).toHaveLength(1);
      expect(models[0].name).toBe("Service");
    });
  });

  describe("filtering and sorting", () => {
    it("skips test files", () => {
      const models = extractDomainModels([
        makeFile("user_test.go", `package domain
type TestUser struct { ID int }
`),
        makeFile("user.test.ts", `interface MockUser { id: string }
`),
        makeFile("domain/user.go", `package domain
type User struct { ID int }
`),
      ]);
      expect(models).toHaveLength(1);
      expect(models[0].source_file).toBe("domain/user.go");
    });

    it("sorts by source_file then name", () => {
      const models = extractDomainModels([
        makeFile("b/types.ts", `export interface Zebra { z: string }
export interface Alpha { a: string }
`),
        makeFile("a/types.ts", `export interface Omega { o: string }
`),
      ]);
      expect(models[0].source_file).toBe("a/types.ts");
      expect(models[1].name).toBe("Alpha");
      expect(models[2].name).toBe("Zebra");
    });

    it("returns empty for no extractable files", () => {
      const models = extractDomainModels([
        makeFile("readme.md", "# Hello"),
        makeFile("config.json", "{}"),
      ]);
      expect(models).toEqual([]);
    });
  });

  describe("Go edge cases", () => {
    it("skips unexported Go interfaces", () => {
      const models = extractDomainModels([
        makeFile("internal/handler.go", `package internal
type handler interface {
	handle() error
}
`),
      ]);
      expect(models).toHaveLength(0);
    });

    it("handles Go struct with embedded types (single-token lines)", () => {
      const models = extractDomainModels([
        makeFile("domain/product.go", `package domain
type Product struct {
	BaseModel
	Name  string
	Price int
}
`),
      ]);
      expect(models).toHaveLength(1);
      expect(models[0].fields.some(f => f.name === "Name")).toBe(true);
      expect(models[0].fields.some(f => f.name === "Price")).toBe(true);
    });
  });

  describe("Python edge cases", () => {
    it("handles Python class with no self assignments", () => {
      const models = extractDomainModels([
        makeFile("utils/helper.py", `class EmptyHelper:
    pass

class NextClass:
    def __init__(self):
        self.name = "next"
`),
      ]);
      const empty = models.find(m => m.name === "EmptyHelper");
      expect(empty).toBeDefined();
      expect(empty!.fields).toHaveLength(0);
    });

    it("handles Python class with typed self attributes", () => {
      const models = extractDomainModels([
        makeFile("models/user.py", `class User:
    def __init__(self, name: str, age: int):
        self.name: str = name
        self.age: int = age
`),
      ]);
      expect(models).toHaveLength(1);
      expect(models[0].fields.some(f => f.name === "name" && f.type === "str")).toBe(true);
    });
  });
});
