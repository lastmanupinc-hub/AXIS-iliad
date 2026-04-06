import { describe, it, expect } from "vitest";
import { detectProjectType, detectFrameworks } from "./runner.js";
import type { FileEntry } from "@axis/snapshots";

function f(path: string, content = ""): FileEntry {
  return { path, content, size: content.length };
}

describe("detectProjectType (multi-signal scorer)", () => {
  it("returns monorepo for packages/ layout", () => {
    const files = [f("packages/core/index.ts"), f("packages/ui/index.ts"), f("package.json", '{"name":"mono"}')];
    expect(detectProjectType(files, [])).toBe("monorepo");
  });

  it("returns monorepo for apps/ layout", () => {
    const files = [f("apps/web/index.ts"), f("apps/api/index.ts")];
    expect(detectProjectType(files, [])).toBe("monorepo");
  });

  it("returns fullstack_web for Next.js", () => {
    const files = [f("app/page.tsx"), f("package.json", '{"name":"web"}')];
    expect(detectProjectType(files, ["Next.js", "React"])).toBe("fullstack_web");
  });

  it("returns backend_api for Go Chi without frontend files", () => {
    const files = [
      f("main.go", 'package main\nimport "github.com/go-chi/chi"'),
      f("internal/handler/routes.go", "r.Get(\"/users\", list)"),
      f("Dockerfile", "FROM golang:1.22"),
    ];
    expect(detectProjectType(files, ["Chi"])).toBe("backend_api");
  });

  it("returns backend_api for Express without frontend files", () => {
    const files = [f("src/server.ts"), f("Dockerfile", "FROM node")];
    expect(detectProjectType(files, ["Express"])).toBe("backend_api");
  });

  it("returns frontend_web for React-only project", () => {
    const files = [f("src/App.tsx"), f("src/index.tsx"), f("index.html")];
    expect(detectProjectType(files, ["React"])).toBe("frontend_web");
  });

  it("returns native_app for React Native", () => {
    const files = [f("android/build.gradle"), f("ios/Podfile"), f("App.tsx")];
    expect(detectProjectType(files, ["React Native"])).toBe("native_app");
  });

  it("returns library for package with exports and no framework", () => {
    const files = [
      f("src/index.ts"),
      f("package.json", '{"name":"my-lib","exports":{".":{}},"main":"dist/index.js"}'),
    ];
    expect(detectProjectType(files, [])).toBe("library");
  });

  it("does NOT misclassify Go API with .html as static_site", () => {
    const files = [
      f("main.go", 'package main\nimport "github.com/go-chi/chi"'),
      f("cmd/api/main.go", "package main"),
      f("internal/handler/routes.go", "r.Get(\"/health\", healthCheck)"),
      f("templates/index.html", "<html></html>"),
      f("Dockerfile", "FROM golang:1.22"),
    ];
    const type = detectProjectType(files, ["Chi"]);
    expect(type).not.toBe("static_site");
    expect(type).toBe("backend_api");
  });

  it("returns static_site only when nothing else matches", () => {
    const files = [f("index.html", "<html></html>"), f("style.css", "body{}")];
    expect(detectProjectType(files, [])).toBe("static_site");
  });

  it("returns library as default fallback", () => {
    const files = [f("data.csv", "a,b,c")];
    expect(detectProjectType(files, [])).toBe("library");
  });

  it("prefers fullstack_web over backend when frontend + backend coexist", () => {
    const files = [
      f("src/App.tsx"),
      f("api/routes.ts"),
      f("package.json", '{"name":"app"}'),
    ];
    const type = detectProjectType(files, ["Express", "React"]);
    expect(type).toBe("fullstack_web");
  });

  // Layer 11: workspace config detection (line 167 TRUE branch)
  it("detects monorepo from workspace config alone (lerna.json)", () => {
    const files = [f("lerna.json", "{}"), f("packages/a/index.ts")];
    expect(detectProjectType(files, [])).toBe("monorepo");
  });

  it("detects monorepo from pnpm-workspace.yaml + apps", () => {
    const files = [f("pnpm-workspace.yaml", "packages:\n  - apps/*"), f("apps/web/index.ts")];
    expect(detectProjectType(files, [])).toBe("monorepo");
  });

  it("detects monorepo from turbo.json + packages", () => {
    const files = [f("turbo.json", "{}"), f("packages/ui/index.ts")];
    expect(detectProjectType(files, [])).toBe("monorepo");
  });

  // Layer 11: fullstack_web via Go routes + frontend (line 192 hasGoRoutes branch)
  it("detects fullstack_web from Go routes + frontend files", () => {
    const files = [
      f("src/App.tsx"),
      f("cmd/api/main.go", 'func main() { r.Get("/users", list) }'),
      f("internal/handler/routes.go", 'r.Post("/api/data", handler)'),
    ];
    // No backend framework passed — uses hasGoRoutes path
    expect(detectProjectType(files, [])).toBe("fullstack_web");
  });

  // Layer 11: Python backend detection (backendFileCount > 50%)
  it("detects backend_api for Python-heavy project", () => {
    const files = [
      f("app/main.py", "from flask import Flask"),
      f("app/routes.py", ""),
      f("app/models.py", ""),
      f("app/utils.py", ""),
      f("requirements.txt", "flask"),
      f("Dockerfile", "FROM python:3.12"),
    ];
    expect(detectProjectType(files, ["Flask"])).toBe("backend_api");
  });

  // Layer 11: Electron native app detection
  it("detects native_app for Electron project", () => {
    const files = [
      f("src/main.ts"),
      f("src/renderer.tsx"),
      f("package.json", '{"name":"electron-app","main":"dist/main.js"}'),
    ];
    expect(detectProjectType(files, ["Electron"])).toBe("native_app");
  });

  // Layer 11: static_site edge case with HTML but no frameworks
  it("detects static_site for HTML+CSS only project", () => {
    const files = [
      f("index.html", "<html></html>"),
      f("about.html", "<html></html>"),
      f("css/style.css", "body {}"),
    ];
    expect(detectProjectType(files, [])).toBe("static_site");
  });
});

describe("detectFrameworks (runner-level)", () => {
  it("detects SvelteKit from @sveltejs/kit dep", () => {
    const pkg = { dependencies: { "@sveltejs/kit": "2.0.0", svelte: "4.0.0" } };
    const result = detectFrameworks(pkg, []);
    expect(result).toContain("SvelteKit");
  });

  it("detects Go Chi from source import", () => {
    const files = [f("router.go", 'import "github.com/go-chi/chi/v5"')];
    const result = detectFrameworks({}, files);
    expect(result).toContain("Chi");
  });

  it("detects Go stdlib HTTP", () => {
    const files = [f("main.go", 'import "net/http"\nhttp.ListenAndServe(":8080", nil)')];
    const result = detectFrameworks({}, files);
    expect(result).toContain("Go stdlib HTTP");
  });
});
