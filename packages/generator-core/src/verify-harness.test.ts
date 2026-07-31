import { describe, it, expect } from "vitest";
import { verifyGeneratedFiles } from "./verify-harness.js";
import type { GeneratedFile } from "./types.js";

const file = (over: Partial<GeneratedFile>): GeneratedFile => ({
  path: "out.txt",
  content: "hello",
  content_type: "text/plain",
  program: "search",
  description: "test file",
  ...over,
});

describe("verifyGeneratedFiles", () => {
  it("groups evidence by program and passes clean files", () => {
    const results = verifyGeneratedFiles([
      file({ path: "a.md", program: "search", content_type: "text/markdown", content: "# hi" }),
      file({ path: "b.md", program: "search", content_type: "text/markdown", content: "# bye" }),
      file({ path: "c.md", program: "brand", content_type: "text/markdown", content: "# brand" }),
    ]);
    expect(results.map((r) => r.program)).toEqual(["brand", "search"]); // sorted
    const search = results.find((r) => r.program === "search")!;
    expect(search.pass).toBe(true);
    expect(search.evidence.length).toBeGreaterThanOrEqual(2); // 1 check x 2 files (both text/markdown)
    expect(search.evidence.every((e) => e.pass)).toBe(true);
  });

  it("fails a program when any of its files has empty content", () => {
    const results = verifyGeneratedFiles([file({ program: "theme", content: "   " })]);
    const theme = results.find((r) => r.program === "theme")!;
    expect(theme.pass).toBe(false);
    expect(theme.evidence.find((e) => e.check === "non-empty")).toMatchObject({ pass: false });
  });

  it("does not flag \"{{...}}\"-shaped content — legitimate for programs that emit user-facing templates", () => {
    const results = verifyGeneratedFiles([file({ program: "superpowers", content: "message: \"{{branch}} deployed to {{environment}}\"" })]);
    const superpowers = results.find((r) => r.program === "superpowers")!;
    expect(superpowers.pass).toBe(true);
  });

  it("validates JSON content_type — passes on valid JSON", () => {
    const results = verifyGeneratedFiles([file({ program: "theme", content_type: "application/json", content: '{"a":1}' })]);
    const theme = results.find((r) => r.program === "theme")!;
    expect(theme.pass).toBe(true);
    expect(theme.evidence.find((e) => e.check === "valid-json")).toMatchObject({ pass: true });
  });

  it("tolerates a leading whole-line // comment banner ahead of the JSON payload (JSONC, e.g. vscode launch.json.template)", () => {
    const results = verifyGeneratedFiles([
      file({ program: "deploy", content_type: "application/json", content: '// AXIS banner comment\n// second line\n{"a":1}\n' }),
    ]);
    const deploy = results.find((r) => r.program === "deploy")!;
    expect(deploy.pass).toBe(true);
    expect(deploy.evidence.find((e) => e.check === "valid-json")).toMatchObject({ pass: true });
  });

  it("does not let a whole-line-comment strip mask a genuine syntax error in the remaining JSON", () => {
    const results = verifyGeneratedFiles([file({ program: "deploy", content_type: "application/json", content: "// banner\n{not valid" })]);
    const deploy = results.find((r) => r.program === "deploy")!;
    expect(deploy.pass).toBe(false);
    expect(deploy.evidence.find((e) => e.check === "valid-json")).toMatchObject({ pass: false });
  });

  it("does not strip an inline // that appears inside a string value (e.g. a URL), only whole-line comments", () => {
    const results = verifyGeneratedFiles([file({ program: "deploy", content_type: "application/json", content: '{"url":"https://example.com"}' })]);
    const deploy = results.find((r) => r.program === "deploy")!;
    expect(deploy.pass).toBe(true);
  });

  it("validates JSON content_type — fails on malformed JSON with a real parse error in detail", () => {
    const results = verifyGeneratedFiles([file({ program: "theme", content_type: "application/json", content: "{not json" })]);
    const theme = results.find((r) => r.program === "theme")!;
    expect(theme.pass).toBe(false);
    const ev = theme.evidence.find((e) => e.check === "valid-json")!;
    expect(ev.pass).toBe(false);
    expect(ev.detail.length).toBeGreaterThan(0);
  });

  it("validates YAML content_type both spellings (application/yaml and text/yaml)", () => {
    const results = verifyGeneratedFiles([
      file({ path: "a.yaml", program: "closer", content_type: "application/yaml", content: "key: value" }),
      file({ path: "b.yaml", program: "closer", content_type: "text/yaml", content: "key: value" }),
    ]);
    const closer = results.find((r) => r.program === "closer")!;
    expect(closer.pass).toBe(true);
    expect(closer.evidence.filter((e) => e.check === "yaml-structural-heuristic")).toHaveLength(2);
  });

  it("fails YAML with unbalanced brackets", () => {
    const results = verifyGeneratedFiles([file({ program: "closer", content_type: "application/yaml", content: "key: [unclosed" })]);
    const closer = results.find((r) => r.program === "closer")!;
    expect(closer.pass).toBe(false);
    expect(closer.evidence.find((e) => e.check === "yaml-structural-heuristic")).toMatchObject({ pass: false });
  });

  it("fails YAML with a tab-indented line", () => {
    const results = verifyGeneratedFiles([file({ program: "closer", content_type: "text/yaml", content: "key:\n\tvalue: 1" })]);
    const closer = results.find((r) => r.program === "closer")!;
    expect(closer.pass).toBe(false);
    expect(closer.evidence.find((e) => e.check === "yaml-structural-heuristic")).toMatchObject({ pass: false });
  });

  it("checks shell scripts for a shebang", () => {
    const good = verifyGeneratedFiles([file({ program: "deploy", content_type: "text/x-shellscript", content: "#!/usr/bin/env bash\necho hi" })]);
    expect(good.find((r) => r.program === "deploy")!.pass).toBe(true);

    const bad = verifyGeneratedFiles([file({ program: "deploy", content_type: "text/x-shellscript", content: "echo hi" })]);
    const deployBad = bad.find((r) => r.program === "deploy")!;
    expect(deployBad.pass).toBe(false);
    expect(deployBad.evidence.find((e) => e.check === "has-shebang")).toMatchObject({ pass: false });
  });

  it("checks Dockerfiles for a FROM instruction", () => {
    const good = verifyGeneratedFiles([file({ program: "deploy", content_type: "text/x-dockerfile", content: "FROM node:22\nCMD [\"node\", \"x\"]" })]);
    expect(good.find((r) => r.program === "deploy")!.pass).toBe(true);

    const bad = verifyGeneratedFiles([file({ program: "deploy", content_type: "text/x-dockerfile", content: "CMD [\"node\", \"x\"]" })]);
    const deployBad = bad.find((r) => r.program === "deploy")!;
    expect(deployBad.pass).toBe(false);
    expect(deployBad.evidence.find((e) => e.check === "has-from-instruction")).toMatchObject({ pass: false });
  });

  it("returns an empty array for an empty file list", () => {
    expect(verifyGeneratedFiles([])).toEqual([]);
  });
});
