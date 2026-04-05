import type { FileEntry } from "@axis/snapshots";
import type { FrameworkDetection } from "./types.js";

interface FrameworkRule {
  name: string;
  detect: (files: FileEntry[], deps: Record<string, string>) => { confidence: number; version: string | null; evidence: string[] } | null;
}

const rules: FrameworkRule[] = [
  {
    name: "Next.js",
    detect: (files, deps) => {
      const evidence: string[] = [];
      let confidence = 0;
      if (deps["next"]) { confidence += 0.6; evidence.push(`package.json: next@${deps["next"]}`); }
      if (files.some(f => f.path === "next.config.js" || f.path === "next.config.mjs" || f.path === "next.config.ts")) { confidence += 0.3; evidence.push("next.config found"); }
      if (files.some(f => f.path.startsWith("app/") || f.path.startsWith("pages/"))) { confidence += 0.1; evidence.push("app/ or pages/ directory"); }
      return confidence > 0 ? { confidence: Math.min(confidence, 1), version: deps["next"] ?? null, evidence } : null;
    },
  },
  {
    name: "React",
    detect: (_files, deps) => {
      if (deps["react"]) return { confidence: 0.95, version: deps["react"], evidence: [`package.json: react@${deps["react"]}`] };
      return null;
    },
  },
  {
    name: "Vue",
    detect: (files, deps) => {
      const evidence: string[] = [];
      let confidence = 0;
      if (deps["vue"]) { confidence += 0.7; evidence.push(`package.json: vue@${deps["vue"]}`); }
      if (files.some(f => f.path.endsWith(".vue"))) { confidence += 0.3; evidence.push(".vue files found"); }
      return confidence > 0 ? { confidence: Math.min(confidence, 1), version: deps["vue"] ?? null, evidence } : null;
    },
  },
  {
    name: "Svelte",
    detect: (files, deps) => {
      const evidence: string[] = [];
      let confidence = 0;
      if (deps["svelte"]) { confidence += 0.7; evidence.push(`package.json: svelte@${deps["svelte"]}`); }
      if (files.some(f => f.path.endsWith(".svelte"))) { confidence += 0.3; evidence.push(".svelte files found"); }
      return confidence > 0 ? { confidence: Math.min(confidence, 1), version: deps["svelte"] ?? null, evidence } : null;
    },
  },
  {
    name: "Express",
    detect: (_files, deps) => {
      if (deps["express"]) return { confidence: 0.9, version: deps["express"], evidence: [`package.json: express@${deps["express"]}`] };
      return null;
    },
  },
  {
    name: "Fastify",
    detect: (_files, deps) => {
      if (deps["fastify"]) return { confidence: 0.9, version: deps["fastify"], evidence: [`package.json: fastify@${deps["fastify"]}`] };
      return null;
    },
  },
  {
    name: "Tailwind CSS",
    detect: (files, deps) => {
      const evidence: string[] = [];
      let confidence = 0;
      if (deps["tailwindcss"]) { confidence += 0.6; evidence.push(`package.json: tailwindcss@${deps["tailwindcss"]}`); }
      if (files.some(f => f.path.includes("tailwind.config"))) { confidence += 0.4; evidence.push("tailwind.config found"); }
      return confidence > 0 ? { confidence: Math.min(confidence, 1), version: deps["tailwindcss"] ?? null, evidence } : null;
    },
  },
  {
    name: "Prisma",
    detect: (files, deps) => {
      const evidence: string[] = [];
      let confidence = 0;
      if (deps["prisma"] || deps["@prisma/client"]) { confidence += 0.6; evidence.push("prisma in dependencies"); }
      if (files.some(f => f.path.includes("prisma/schema.prisma"))) { confidence += 0.4; evidence.push("prisma/schema.prisma found"); }
      return confidence > 0 ? { confidence: Math.min(confidence, 1), version: deps["prisma"] ?? deps["@prisma/client"] ?? null, evidence } : null;
    },
  },
  {
    name: "Django",
    detect: (files) => {
      const evidence: string[] = [];
      let confidence = 0;
      if (files.some(f => f.path === "manage.py")) { confidence += 0.5; evidence.push("manage.py found"); }
      if (files.some(f => f.path.includes("settings.py"))) { confidence += 0.3; evidence.push("settings.py found"); }
      if (files.some(f => f.content.includes("from django"))) { confidence += 0.2; evidence.push("django import found"); }
      return confidence > 0 ? { confidence: Math.min(confidence, 1), version: null, evidence } : null;
    },
  },
  {
    name: "FastAPI",
    detect: (files) => {
      if (files.some(f => f.content.includes("from fastapi") || f.content.includes("import fastapi"))) {
        return { confidence: 0.9, version: null, evidence: ["fastapi import found"] };
      }
      return null;
    },
  },
  {
    name: "Chi",
    detect: (files) => {
      if (files.some(f => f.path.endsWith(".go") && f.content.includes("github.com/go-chi/chi"))) {
        return { confidence: 0.9, version: null, evidence: ["go import: github.com/go-chi/chi"] };
      }
      return null;
    },
  },
  {
    name: "Gin",
    detect: (files) => {
      if (files.some(f => f.path.endsWith(".go") && f.content.includes("github.com/gin-gonic/gin"))) {
        return { confidence: 0.9, version: null, evidence: ["go import: github.com/gin-gonic/gin"] };
      }
      return null;
    },
  },
  {
    name: "Echo",
    detect: (files) => {
      if (files.some(f => f.path.endsWith(".go") && f.content.includes("github.com/labstack/echo"))) {
        return { confidence: 0.9, version: null, evidence: ["go import: github.com/labstack/echo"] };
      }
      return null;
    },
  },
  {
    name: "Fiber",
    detect: (files) => {
      if (files.some(f => f.path.endsWith(".go") && f.content.includes("github.com/gofiber/fiber"))) {
        return { confidence: 0.9, version: null, evidence: ["go import: github.com/gofiber/fiber"] };
      }
      return null;
    },
  },
  {
    name: "Go stdlib HTTP",
    detect: (files) => {
      const hasImport = files.some(f => f.path.endsWith(".go") && f.content.includes('"net/http"'));
      if (!hasImport) return null;
      const hasServer = files.some(f => f.path.endsWith(".go") && (
        f.content.includes("http.ListenAndServe") ||
        f.content.includes("http.HandleFunc") ||
        f.content.includes("http.NewServeMux") ||
        f.content.includes("http.Handle(")
      ));
      const confidence = hasServer ? 0.7 : 0.3;
      return { confidence, version: null, evidence: ["go stdlib: net/http" + (hasServer ? " with server usage" : "")] };
    },
  },
];

export function detectFrameworks(files: FileEntry[], deps: Record<string, string>): FrameworkDetection[] {
  const results: FrameworkDetection[] = [];
  for (const rule of rules) {
    const match = rule.detect(files, deps);
    if (match) {
      results.push({ name: rule.name, ...match });
    }
  }
  return results.sort((a, b) => b.confidence - a.confidence);
}
