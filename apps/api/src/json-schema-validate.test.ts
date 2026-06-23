import { describe, it, expect } from "vitest";
import { validateAgainstSchema, parseJsonOutput, isUsableSchema, validateStructuredOutput } from "./json-schema-validate.js";

const ok = (v: unknown, s: unknown) => expect(validateAgainstSchema(v, s).valid).toBe(true);
const bad = (v: unknown, s: unknown) => expect(validateAgainstSchema(v, s).valid).toBe(false);

describe("validateAgainstSchema — types", () => {
  it("checks primitive types incl. integer vs number and type unions", () => {
    ok("hi", { type: "string" });
    bad(1, { type: "string" });
    ok(1, { type: "integer" });
    bad(1.5, { type: "integer" });
    ok(1.5, { type: "number" });
    ok(true, { type: "boolean" });
    ok(null, { type: "null" });
    ok([], { type: "array" });
    ok({}, { type: "object" });
    ok("x", { type: ["string", "null"] });
    ok(null, { type: ["string", "null"] });
    bad(3, { type: ["string", "null"] });
  });
});

describe("validateAgainstSchema — objects", () => {
  const schema = {
    type: "object",
    required: ["name", "age"],
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 1 },
      age: { type: "integer", minimum: 0, maximum: 150 },
      tags: { type: "array", items: { type: "string" }, minItems: 1 },
      role: { enum: ["admin", "user"] },
    },
  };

  it("accepts a valid object", () => {
    ok({ name: "Ada", age: 36, tags: ["x"], role: "admin" }, schema);
  });

  it("rejects missing-required / wrong-type / out-of-range / bad-enum / extra-props / bad-item", () => {
    bad({ name: "Ada" }, schema); // missing age
    bad({ name: "", age: 36 }, schema); // minLength
    bad({ name: "Ada", age: -1 }, schema); // minimum
    bad({ name: "Ada", age: 1.5 }, schema); // integer
    bad({ name: "Ada", age: 36, role: "root" }, schema); // enum
    bad({ name: "Ada", age: 36, extra: 1 }, schema); // additionalProperties: false
    bad({ name: "Ada", age: 36, tags: [] }, schema); // minItems
    bad({ name: "Ada", age: 36, tags: [3] }, schema); // item type
  });

  it("reports specific error paths", () => {
    const r = validateAgainstSchema({ name: "Ada", age: -1 }, schema);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("$.age"))).toBe(true);
  });
});

describe("validateAgainstSchema — const + depth guard", () => {
  it("matches const deeply", () => {
    ok({ a: [1, 2] }, { const: { a: [1, 2] } });
    bad({ a: [1, 3] }, { const: { a: [1, 2] } });
  });

  it("guards against unbounded nesting (no stack overflow)", () => {
    const makeSchema = (d: number): unknown => (d === 0 ? { type: "object" } : { type: "object", properties: { x: makeSchema(d - 1) } });
    const makeValue = (d: number): unknown => (d === 0 ? {} : { x: makeValue(d - 1) });
    const r = validateAgainstSchema(makeValue(70), makeSchema(70));
    expect(r.errors.some((e) => e.includes("nesting"))).toBe(true);
  });
});

describe("parseJsonOutput", () => {
  it("parses bare JSON, JSON-in-prose, arrays; rejects garbage", () => {
    expect(parseJsonOutput('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonOutput('Here you go: {"a":1} — done')).toEqual({ a: 1 });
    expect(parseJsonOutput("[1,2,3]")).toEqual([1, 2, 3]);
    expect(parseJsonOutput("no json here")).toBeUndefined();
  });
});

describe("validateStructuredOutput", () => {
  const schema = { type: "object", required: ["n"], properties: { n: { type: "integer" } } };
  it("parses + validates valid model output", () => {
    const r = validateStructuredOutput('{"n": 5}', schema);
    expect(r.valid).toBe(true);
    expect(r.parsed).toEqual({ n: 5 });
  });
  it("extracts JSON from prose then validates", () => {
    const r = validateStructuredOutput('Sure: {"n": 5}', schema);
    expect(r.valid).toBe(true);
  });
  it("flags schema-invalid output", () => {
    const r = validateStructuredOutput('{"n": "five"}', schema);
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });
  it("flags non-JSON output", () => {
    const r = validateStructuredOutput("I cannot do that", schema);
    expect(r.valid).toBe(false);
    expect(r.parsed).toBeUndefined();
    expect(r.errors[0]).toMatch(/parseable JSON/);
  });
});

describe("isUsableSchema", () => {
  it("accepts a recognized shape, rejects junk", () => {
    expect(isUsableSchema({ type: "object" })).toBe(true);
    expect(isUsableSchema({ enum: [1, 2] })).toBe(true);
    expect(isUsableSchema({})).toBe(false);
    expect(isUsableSchema(null)).toBe(false);
    expect(isUsableSchema("x")).toBe(false);
  });
});
