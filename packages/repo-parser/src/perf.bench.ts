/**
 * eq_108: Parser performance benchmarks — CPU-bound code path analysis.
 * Run with: npx vitest bench
 */
import { bench, describe } from "vitest";
import type { FileEntry } from "@axis/snapshots";
import { parseRepo } from "./parser.js";
import { detectLanguage, countLines } from "./language-detector.js";
import { detectFrameworks } from "./framework-detector.js";
import { extractImports } from "./import-resolver.js";
import { extractSQLSchema } from "./sql-extractor.js";
import { extractDomainModels } from "./domain-extractor.js";

// ─── Fixtures ───────────────────────────────────────────────────

const TS_FILE = (i: number): FileEntry => ({
  path: `src/module${i}/handler.ts`,
  content: [
    `import { Router } from "express";`,
    `import { db } from "../db";`,
    `import { User } from "../models/user";`,
    `import { validateInput } from "../lib/validation";`,
    ``,
    `interface CreateUserRequest {`,
    `  name: string;`,
    `  email: string;`,
    `  role: "admin" | "user";`,
    `}`,
    ``,
    `export class UserService {`,
    `  constructor(private readonly db: typeof db) {}`,
    ``,
    `  async getUser(id: string): Promise<User | null> {`,
    `    return this.db.query("SELECT * FROM users WHERE id = ?", [id]);`,
    `  }`,
    ``,
    `  async createUser(data: CreateUserRequest): Promise<User> {`,
    `    const validated = validateInput(data);`,
    `    return this.db.query("INSERT INTO users (name, email, role) VALUES (?, ?, ?)", [validated.name, validated.email, validated.role]);`,
    `  }`,
    `}`,
    ``,
    `const router = Router();`,
    `router.get("/users/:id", async (req, res) => { /* ... */ });`,
    `router.post("/users", async (req, res) => { /* ... */ });`,
    `export default router;`,
  ].join("\n"),
  size: 800,
});

const PY_FILE = (i: number): FileEntry => ({
  path: `app/services/service${i}.py`,
  content: [
    `from flask import Blueprint, request, jsonify`,
    `from sqlalchemy import Column, Integer, String`,
    `from .models import Base, db`,
    ``,
    `class Product(Base):`,
    `    __tablename__ = 'products'`,
    `    id = Column(Integer, primary_key=True)`,
    `    name = Column(String(100), nullable=False)`,
    `    price = Column(Integer, nullable=False)`,
    ``,
    `bp = Blueprint('products', __name__)`,
    ``,
    `@bp.route('/products', methods=['GET'])`,
    `def list_products():`,
    `    products = db.session.query(Product).all()`,
    `    return jsonify([p.to_dict() for p in products])`,
  ].join("\n"),
  size: 500,
});

const GO_FILE = (i: number): FileEntry => ({
  path: `internal/handler/handler${i}.go`,
  content: [
    `package handler`,
    ``,
    `import (`,
    `\t"encoding/json"`,
    `\t"net/http"`,
    `\t"github.com/gorilla/mux"`,
    `)`,
    ``,
    `type Item${i} struct {`,
    `\tID   int    \`json:"id"\``,
    `\tName string \`json:"name"\``,
    `}`,
    ``,
    `func GetItem${i}(w http.ResponseWriter, r *http.Request) {`,
    `\tvars := mux.Vars(r)`,
    `\tjson.NewEncoder(w).Encode(Item${i}{ID: 1, Name: vars["id"]})`,
    `}`,
  ].join("\n"),
  size: 400,
});

const MIXED_SMALL = Array.from({ length: 20 }, (_, i) => [TS_FILE(i), PY_FILE(i)]).flat();
const MIXED_MEDIUM = Array.from({ length: 50 }, (_, i) => [TS_FILE(i), PY_FILE(i), GO_FILE(i)]).flat();
const TS_LARGE = Array.from({ length: 200 }, (_, i) => TS_FILE(i));

const PKG_JSON: FileEntry = {
  path: "package.json",
  content: JSON.stringify({
    dependencies: { express: "^4.18.0", "better-sqlite3": "^9.0.0", zod: "^3.22.0" },
    devDependencies: { typescript: "^5.3.0", vitest: "^1.0.0", eslint: "^8.56.0" },
  }),
  size: 200,
};

const SQL_FILE: FileEntry = {
  path: "migrations/001.sql",
  content: [
    "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE);",
    "CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), total INTEGER);",
    "CREATE INDEX idx_orders_user ON orders(user_id);",
    "CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, price INTEGER, category TEXT);",
    "ALTER TABLE orders ADD COLUMN product_id INTEGER REFERENCES products(id);",
  ].join("\n"),
  size: 400,
};

// ─── Full parseRepo ─────────────────────────────────────────────

describe("parseRepo (full pipeline)", () => {
  bench("20 mixed files (small)", () => {
    parseRepo([PKG_JSON, SQL_FILE, ...MIXED_SMALL]);
  });

  bench("150 mixed files (medium)", () => {
    parseRepo([PKG_JSON, SQL_FILE, ...MIXED_MEDIUM]);
  });

  bench("200 TypeScript files (large)", () => {
    parseRepo([PKG_JSON, SQL_FILE, ...TS_LARGE]);
  });
});

// ─── Individual Sub-parsers ─────────────────────────────────────

describe("detectLanguage", () => {
  bench("TypeScript file", () => {
    detectLanguage(TS_FILE(0).path, TS_FILE(0).content);
  });

  bench("Python file", () => {
    detectLanguage(PY_FILE(0).path, PY_FILE(0).content);
  });

  bench("Go file", () => {
    detectLanguage(GO_FILE(0).path, GO_FILE(0).content);
  });
});

describe("detectFrameworks", () => {
  bench("20 files with express/flask deps", () => {
    detectFrameworks(MIXED_SMALL, { express: "^4.18.0", flask: "^3.0.0" });
  });
});

describe("extractImports", () => {
  bench("20 mixed files", () => {
    extractImports(MIXED_SMALL);
  });

  bench("200 TypeScript files", () => {
    extractImports(TS_LARGE);
  });
});

describe("extractSQLSchema", () => {
  bench("single SQL migration", () => {
    extractSQLSchema([SQL_FILE]);
  });

  bench("inline SQL in 200 TS files + migration", () => {
    extractSQLSchema([SQL_FILE, ...TS_LARGE]);
  });
});

describe("extractDomainModels", () => {
  bench("20 mixed files", () => {
    extractDomainModels(MIXED_SMALL);
  });

  bench("200 TypeScript files", () => {
    extractDomainModels(TS_LARGE);
  });
});
