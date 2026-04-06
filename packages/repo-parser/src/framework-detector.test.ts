import { describe, it, expect } from "vitest";
import { detectFrameworks } from "./framework-detector.js";
import type { FileEntry } from "@axis/snapshots";

function makeFiles(paths: Array<{ path: string; content?: string }>): FileEntry[] {
  return paths.map(f => ({
    path: f.path,
    content: f.content ?? "",
    size: f.content?.length ?? 0,
  }));
}

describe("detectFrameworks", () => {
  it("detects Next.js with full confidence (dep + config + app dir)", () => {
    const files = makeFiles([
      { path: "next.config.mjs" },
      { path: "app/page.tsx" },
    ]);
    const deps = { next: "14.0.0", react: "18.0.0" };
    const result = detectFrameworks(files, deps);
    const nextjs = result.find(f => f.name === "Next.js");
    expect(nextjs).toBeTruthy();
    expect(nextjs!.confidence).toBeCloseTo(1, 5);
    expect(nextjs!.version).toBe("14.0.0");
    expect(nextjs!.evidence.length).toBe(3);
  });

  it("detects Next.js from dep only at 0.6 confidence", () => {
    const result = detectFrameworks([], { next: "14.0.0" });
    const nextjs = result.find(f => f.name === "Next.js");
    expect(nextjs).toBeTruthy();
    expect(nextjs!.confidence).toBe(0.6);
  });

  it("detects React at 0.95 confidence", () => {
    const result = detectFrameworks([], { react: "18.0.0" });
    const react = result.find(f => f.name === "React");
    expect(react).toBeTruthy();
    expect(react!.confidence).toBe(0.95);
    expect(react!.version).toBe("18.0.0");
  });

  it("detects Vue from dep + .vue files", () => {
    const files = makeFiles([{ path: "src/App.vue" }]);
    const result = detectFrameworks(files, { vue: "3.0.0" });
    const vue = result.find(f => f.name === "Vue");
    expect(vue).toBeTruthy();
    expect(vue!.confidence).toBe(1);
  });

  it("detects Vue from .vue files only at 0.3", () => {
    const files = makeFiles([{ path: "src/App.vue" }]);
    const result = detectFrameworks(files, {});
    const vue = result.find(f => f.name === "Vue");
    expect(vue).toBeTruthy();
    expect(vue!.confidence).toBe(0.3);
  });

  it("detects Svelte from dep + .svelte files", () => {
    const files = makeFiles([{ path: "src/App.svelte" }]);
    const result = detectFrameworks(files, { svelte: "4.0.0" });
    const svelte = result.find(f => f.name === "Svelte");
    expect(svelte).toBeTruthy();
    expect(svelte!.confidence).toBe(1);
  });

  it("detects Express at 0.9 confidence", () => {
    const result = detectFrameworks([], { express: "4.18.0" });
    const express = result.find(f => f.name === "Express");
    expect(express).toBeTruthy();
    expect(express!.confidence).toBe(0.9);
  });

  it("detects Fastify at 0.9 confidence", () => {
    const result = detectFrameworks([], { fastify: "4.0.0" });
    const fastify = result.find(f => f.name === "Fastify");
    expect(fastify).toBeTruthy();
    expect(fastify!.confidence).toBe(0.9);
  });

  it("detects Tailwind CSS from dep + config", () => {
    const files = makeFiles([{ path: "tailwind.config.ts" }]);
    const result = detectFrameworks(files, { tailwindcss: "3.0.0" });
    const tw = result.find(f => f.name === "Tailwind CSS");
    expect(tw).toBeTruthy();
    expect(tw!.confidence).toBe(1);
  });

  it("detects Prisma from dep + schema", () => {
    const files = makeFiles([{ path: "prisma/schema.prisma" }]);
    const result = detectFrameworks(files, { "@prisma/client": "5.0.0" });
    const prisma = result.find(f => f.name === "Prisma");
    expect(prisma).toBeTruthy();
    expect(prisma!.confidence).toBe(1);
  });

  it("detects Django from manage.py + settings.py + import", () => {
    const files = makeFiles([
      { path: "manage.py" },
      { path: "myapp/settings.py" },
      { path: "myapp/views.py", content: "from django.http import HttpResponse" },
    ]);
    const result = detectFrameworks(files, {});
    const django = result.find(f => f.name === "Django");
    expect(django).toBeTruthy();
    expect(django!.confidence).toBe(1);
  });

  it("detects FastAPI from import statement", () => {
    const files = makeFiles([
      { path: "main.py", content: "from fastapi import FastAPI\napp = FastAPI()" },
    ]);
    const result = detectFrameworks(files, {});
    const fastapi = result.find(f => f.name === "FastAPI");
    expect(fastapi).toBeTruthy();
    expect(fastapi!.confidence).toBe(0.9);
  });

  it("returns empty array when no frameworks detected", () => {
    const files = makeFiles([{ path: "README.md", content: "# Hello" }]);
    const result = detectFrameworks(files, {});
    expect(result).toEqual([]);
  });

  it("sorts results by confidence descending", () => {
    const files = makeFiles([{ path: "next.config.mjs" }, { path: "app/page.tsx" }]);
    const deps = { next: "14.0.0", react: "18.0.0", tailwindcss: "3.0.0" };
    const result = detectFrameworks(files, deps);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].confidence).toBeGreaterThanOrEqual(result[i].confidence);
    }
  });

  it("detects multiple frameworks simultaneously", () => {
    const files = makeFiles([
      { path: "next.config.mjs" },
      { path: "prisma/schema.prisma" },
      { path: "tailwind.config.ts" },
    ]);
    const deps = { next: "14.0.0", react: "18.0.0", "@prisma/client": "5.0.0", tailwindcss: "3.0.0" };
    const result = detectFrameworks(files, deps);
    const names = result.map(f => f.name);
    expect(names).toContain("Next.js");
    expect(names).toContain("React");
    expect(names).toContain("Prisma");
    expect(names).toContain("Tailwind CSS");
  });

  it("detects Chi from go-chi import", () => {
    const files = makeFiles([
      { path: "router.go", content: 'import "github.com/go-chi/chi/v5"' },
    ]);
    const result = detectFrameworks(files, {});
    const chi = result.find(f => f.name === "Chi");
    expect(chi).toBeTruthy();
    expect(chi!.confidence).toBe(0.9);
  });

  it("detects Gin from gin-gonic import", () => {
    const files = makeFiles([
      { path: "main.go", content: 'import "github.com/gin-gonic/gin"\nfunc main() {}' },
    ]);
    const result = detectFrameworks(files, {});
    const gin = result.find(f => f.name === "Gin");
    expect(gin).toBeTruthy();
    expect(gin!.confidence).toBe(0.9);
  });

  it("detects Echo from labstack import", () => {
    const files = makeFiles([
      { path: "server.go", content: 'import "github.com/labstack/echo/v4"' },
    ]);
    const result = detectFrameworks(files, {});
    const echo = result.find(f => f.name === "Echo");
    expect(echo).toBeTruthy();
  });

  it("detects Fiber from gofiber import", () => {
    const files = makeFiles([
      { path: "app.go", content: 'import "github.com/gofiber/fiber/v2"' },
    ]);
    const result = detectFrameworks(files, {});
    const fiber = result.find(f => f.name === "Fiber");
    expect(fiber).toBeTruthy();
  });

  it("detects Go stdlib HTTP with ListenAndServe", () => {
    const files = makeFiles([
      { path: "main.go", content: 'import "net/http"\nfunc main() { http.ListenAndServe(":8080", nil) }' },
    ]);
    const result = detectFrameworks(files, {});
    const stdlib = result.find(f => f.name === "Go stdlib HTTP");
    expect(stdlib).toBeTruthy();
    expect(stdlib!.confidence).toBe(0.7);
  });

  it("detects Go stdlib HTTP without server usage at low confidence", () => {
    const files = makeFiles([
      { path: "client.go", content: 'import "net/http"\nfunc fetch() { http.Get("https://example.com") }' },
    ]);
    const result = detectFrameworks(files, {});
    const stdlib = result.find(f => f.name === "Go stdlib HTTP");
    expect(stdlib).toBeTruthy();
    expect(stdlib!.confidence).toBe(0.3);
  });

  it("does not detect Go frameworks from non-.go files", () => {
    const files = makeFiles([
      { path: "readme.md", content: 'github.com/go-chi/chi is a great router' },
    ]);
    const result = detectFrameworks(files, {});
    const chi = result.find(f => f.name === "Chi");
    expect(chi).toBeUndefined();
  });

  // Go stdlib HTTP: alternate server patterns (Layer 10)
  it("detects Go stdlib HTTP via http.HandleFunc", () => {
    const files = makeFiles([
      { path: "main.go", content: 'import "net/http"\nfunc main() { http.HandleFunc("/", handler) }' },
    ]);
    const result = detectFrameworks(files, {});
    const stdlib = result.find(f => f.name === "Go stdlib HTTP");
    expect(stdlib).toBeTruthy();
    expect(stdlib!.confidence).toBe(0.7);
  });

  it("detects Go stdlib HTTP via http.NewServeMux", () => {
    const files = makeFiles([
      { path: "main.go", content: 'import "net/http"\nfunc main() { mux := http.NewServeMux() }' },
    ]);
    const result = detectFrameworks(files, {});
    const stdlib = result.find(f => f.name === "Go stdlib HTTP");
    expect(stdlib).toBeTruthy();
    expect(stdlib!.confidence).toBe(0.7);
  });

  it("detects Go stdlib HTTP via http.Handle(", () => {
    const files = makeFiles([
      { path: "main.go", content: 'import "net/http"\nfunc main() { http.Handle("/api", apiHandler) }' },
    ]);
    const result = detectFrameworks(files, {});
    const stdlib = result.find(f => f.name === "Go stdlib HTTP");
    expect(stdlib).toBeTruthy();
    expect(stdlib!.confidence).toBe(0.7);
  });
});
