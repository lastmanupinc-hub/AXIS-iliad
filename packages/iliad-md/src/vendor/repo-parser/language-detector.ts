// Vendored from @axis/repo-parser (packages/repo-parser/src/language-detector.ts).

import { extname } from "node:path";

const EXTENSION_MAP: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".py": "Python",
  ".go": "Go",
  ".rs": "Rust",
  ".rb": "Ruby",
  ".java": "Java",
  ".kt": "Kotlin",
  ".swift": "Swift",
  ".c": "C",
  ".cpp": "C++",
  ".h": "C",
  ".hpp": "C++",
  ".cs": "C#",
  ".php": "PHP",
  ".vue": "Vue",
  ".svelte": "Svelte",
  ".html": "HTML",
  ".css": "CSS",
  ".scss": "SCSS",
  ".sass": "SASS",
  ".less": "LESS",
  ".sql": "SQL",
  ".sh": "Shell",
  ".bash": "Shell",
  ".zsh": "Shell",
  ".ps1": "PowerShell",
  ".yaml": "YAML",
  ".yml": "YAML",
  ".json": "JSON",
  ".toml": "TOML",
  ".xml": "XML",
  ".md": "Markdown",
  ".mdx": "MDX",
  ".graphql": "GraphQL",
  ".gql": "GraphQL",
  ".proto": "Protobuf",
  ".dockerfile": "Dockerfile",
  ".tf": "Terraform",
  ".r": "R",
  ".lua": "Lua",
  ".dart": "Dart",
  ".ex": "Elixir",
  ".exs": "Elixir",
  ".erl": "Erlang",
  ".zig": "Zig",
  ".nim": "Nim",
};

export function detectLanguage(filePath: string): string | null {
  const ext = extname(filePath).toLowerCase();
  if (filePath.toLowerCase().includes("dockerfile")) return "Dockerfile";
  return EXTENSION_MAP[ext] ?? null;
}

export function countLines(content: string): number {
  if (!content) return 0;
  return content.split("\n").filter((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !trimmed.startsWith("//") && !trimmed.startsWith("#") && !trimmed.startsWith("/*") && !trimmed.startsWith("*");
  }).length;
}
