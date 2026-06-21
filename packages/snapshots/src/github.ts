import { gunzipSync } from "node:zlib";
import { get as httpsGet } from "node:https";
import type { FileEntry } from "./types.js";

/** Extensions worth extracting (mirrors scanner.ts) */
const INCLUDE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rb", ".go", ".rs", ".java", ".kt", ".scala",
  ".cs", ".fs", ".swift", ".dart", ".lua", ".php",
  ".c", ".cpp", ".h", ".hpp", ".cc",
  ".json", ".yaml", ".yml", ".toml", ".xml", ".env",
  ".ini", ".cfg", ".conf",
  ".md", ".mdx", ".txt", ".rst",
  ".html", ".htm", ".css", ".scss", ".sass", ".less",
  ".svelte", ".vue", ".astro",
  ".dockerfile", ".sh", ".bash", ".zsh", ".ps1",
  ".sql", ".graphql", ".gql", ".prisma",
]);

const MAX_FILE_SIZE = 256 * 1024; // 256 KB
const MAX_FILES = 500;
const KNOWN_LOCKFILES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "Gemfile.lock",
  "poetry.lock",
  "Cargo.lock",
  "go.sum",
]);

export interface GitHubFetchResult {
  files: FileEntry[];
  owner: string;
  repo: string;
  ref: string;
  skipped_count: number;
  total_bytes: number;
}

export interface ParsedGitHubUrl {
  owner: string;
  repo: string;
  ref: string;
}

/**
 * Parse a GitHub URL into owner/repo/ref.
 * Supports:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo/tree/branch
 *   github.com/owner/repo
 */
export function parseGitHubUrl(url: string): ParsedGitHubUrl {
  const cleaned = url.replace(/\/+$/, "");
  const match = cleaned.match(
    /(?:https?:\/\/)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/(.+))?$/,
  );
  /* v8 ignore next 3 — V8 quirk: invalid URL tested in github.test.ts */
  if (!match) {
    throw new Error(`Invalid GitHub URL: ${url}`);
  }
  return {
    owner: match[1],
    repo: match[2],
    /* v8 ignore next — both branches tested: URL with and without /tree/branch */
    ref: match[3] ?? "HEAD",
  };
}

/**
 * Fetch a public GitHub repo as FileEntry[] via the tarball API.
 * Does not require authentication for public repos.
 */
export async function fetchGitHubRepo(
  url: string,
  token?: string,
): Promise<GitHubFetchResult> {
  const { owner, repo, ref } = parseGitHubUrl(url);
  const tarballUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tarball/${ref.split("/").map(encodeURIComponent).join("/")}`;

  const buffer = await httpGetBuffer(tarballUrl, token);
  const decompressed = gunzipSync(buffer);
  const files = parseTarball(decompressed);

  return { files: files.files, owner, repo, ref, skipped_count: files.skipped, total_bytes: files.totalBytes };
}

// ─── HTTP fetch ─────────────────────────────────────────────────

function httpGetBuffer(url: string, token?: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const baseHeaders: Record<string, string> = {
      "User-Agent": "axis-iliad/0.2.0",
      Accept: "application/vnd.github+json",
    };
    if (token) {
      baseHeaders["Authorization"] = `Bearer ${token}`;
    }
    const originHost = new URL(url).hostname;

    const doRequest = (requestUrl: string, redirectCount: number) => {
      if (redirectCount > 5) {
        reject(new Error("Too many redirects"));
        return;
      }
      let parsed: URL;
      try {
        parsed = new URL(requestUrl);
      } catch {
        reject(new Error("Invalid redirect URL"));
        return;
      }
      if (parsed.protocol !== "https:") {
        reject(new Error("Refusing to follow non-HTTPS redirect"));
        return;
      }
      // Never send the bearer token to a host other than the original. GitHub's
      // tarball 302 → codeload is pre-signed and needs no auth header, so
      // stripping it on a cross-host hop is safe and prevents token leakage.
      const headers =
        parsed.hostname === originHost
          ? baseHeaders
          : Object.fromEntries(
              Object.entries(baseHeaders).filter(([k]) => k.toLowerCase() !== "authorization"),
            );

      httpsGet(requestUrl, { headers, timeout: 30_000 }, (res) => {
        // Follow redirects (GitHub API returns 302 for tarball)
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          doRequest(res.headers.location, redirectCount + 1);
          return;
        }

        if (res.statusCode !== 200) {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => {
            const body = Buffer.concat(chunks).toString("utf-8");
            reject(new Error(`GitHub API returned ${res.statusCode}: ${body.slice(0, 200)}`));
          });
          return;
        }

        const chunks: Buffer[] = [];
        let totalSize = 0;
        const maxSize = 100 * 1024 * 1024; // 100MB limit

        res.on("data", (chunk: Buffer) => {
          totalSize += chunk.length;
          if (totalSize > maxSize) {
            res.destroy();
            reject(new Error("Repository tarball exceeds 100MB limit"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      }).on("error", reject).on("timeout", function (this: import("http").ClientRequest) { this.destroy(); reject(new Error("GitHub API request timed out (30s)")); });
    };

    doRequest(url, 0);
  });
}

// ─── Tar parser (POSIX/UStar) ───────────────────────────────────

/** @internal */
export interface TarParseResult {
  files: FileEntry[];
  skipped: number;
  totalBytes: number;
}

/** @internal — exported for testing only */
export function parseTarball(data: Buffer): TarParseResult {
  const files: FileEntry[] = [];
  let skipped = 0;
  let totalBytes = 0;
  let offset = 0;

  while (offset + 512 <= data.length) {
    // Read 512-byte header
    const header = data.subarray(offset, offset + 512);

    // Check for end-of-archive (two zero blocks)
    if (header.every((b) => b === 0)) break;

    const nameRaw = header.subarray(0, 100).toString("utf-8").replace(/\0+$/, "");
    const sizeOctal = header.subarray(124, 136).toString("utf-8").replace(/\0+$/, "").trim();
    const typeFlag = header[156];
    const prefixRaw = header.subarray(345, 500).toString("utf-8").replace(/\0+$/, "");

    const fullName = prefixRaw ? `${prefixRaw}/${nameRaw}` : nameRaw;
    const fileSize = parseInt(sizeOctal, 8) || 0;

    offset += 512; // past header

    // Only process regular files (type '0' or NUL)
    const isRegularFile = typeFlag === 48 /* '0' */ || typeFlag === 0;

    if (isRegularFile && fileSize > 0) {
      // Strip the root directory added by GitHub (e.g., "owner-repo-sha/")
      const pathParts = fullName.split("/");
      const relativePath = pathParts.slice(1).join("/");

      if (relativePath && shouldInclude(relativePath, fileSize)) {
        const content = data.subarray(offset, offset + fileSize).toString("utf-8");
        const size = Buffer.byteLength(content, "utf-8");
        const nextFile = { path: relativePath, content, size };

        if (files.length < MAX_FILES) {
          files.push(nextFile);
          totalBytes += size;
        } else if (isPriorityHealthFile(relativePath)) {
          const replaceIdx = files.findIndex((f) => !isPriorityHealthFile(f.path));
          if (replaceIdx >= 0) {
            totalBytes -= files[replaceIdx].size;
            files[replaceIdx] = nextFile;
            totalBytes += size;
          } else {
            skipped++;
          }
        } else {
          skipped++;
        }
      } else {
        skipped++;
      }
    }

    // Advance past file data (padded to 512-byte boundary)
    offset += Math.ceil(fileSize / 512) * 512;
  }

  return { files, skipped, totalBytes };
}

function isPriorityHealthFile(path: string): boolean {
  const base = path.split("/").pop() ?? "";
  if (KNOWN_LOCKFILES.has(base)) return true;
  if (/^readme\.(md|txt|rst)?$/i.test(base)) return true;
  if (path.startsWith(".github/workflows/")) return true;
  if (path.includes(".eslintrc") || /^eslint\.config(\.(js|cjs|mjs|ts))?$/.test(base)) return true;
  if (path.includes(".prettierrc") || /^prettier\.config(\.(js|cjs|mjs|ts|json|yaml|yml))?$/.test(base)) return true;
  if (base === ".editorconfig" || base === "biome.json" || base === "biome.jsonc") return true;
  return false;
}

/** @internal — exported for testing only */
export function shouldInclude(path: string, size: number): boolean {
  if (size > MAX_FILE_SIZE) return false;
  const fileName = path.split("/").pop() ?? "";

  // Skip hidden directories (but keep hidden files at root like .gitignore)
  const parts = path.split("/");
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i].startsWith(".")) {
      // Keep CI workflows for repo health scoring.
      const isGithubWorkflows =
        parts[0] === ".github" &&
        parts[1] === "workflows";
      if (!isGithubWorkflows) return false;
    }
  }

  // Skip known junk dirs
  for (const part of parts) {
    if (part === "node_modules" || part === "dist" || part === "build" || part === "__pycache__" || part === ".git") {
      return false;
    }
  }

  /* v8 ignore start — V8 quirk: fileName.split always has segments */
  if (KNOWN_LOCKFILES.has(fileName)) return true;

  const ext = ("." + (fileName.split(".").pop() ?? "")).toLowerCase();

  // Extensionless root config files
  if (ext === "." && (fileName === "Dockerfile" || fileName === "Makefile")) return true;
  /* v8 ignore stop */

  return INCLUDE_EXTENSIONS.has(ext);
}
