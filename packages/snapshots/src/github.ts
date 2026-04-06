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

const SKIP_LOCKFILES = new Set([
  "package-lock.json", "pnpm-lock.yaml", "yarn.lock",
  "Gemfile.lock", "poetry.lock", "Cargo.lock",
]);

const MAX_FILE_SIZE = 256 * 1024; // 256 KB
const MAX_FILES = 500;

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
  const tarballUrl = `https://api.github.com/repos/${owner}/${repo}/tarball/${ref}`;

  const buffer = await httpGetBuffer(tarballUrl, token);
  const decompressed = gunzipSync(buffer);
  const files = parseTarball(decompressed);

  return { files: files.files, owner, repo, ref, skipped_count: files.skipped, total_bytes: files.totalBytes };
}

// ─── HTTP fetch ─────────────────────────────────────────────────

function httpGetBuffer(url: string, token?: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      "User-Agent": "axis-toolbox/0.2.0",
      Accept: "application/vnd.github+json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const doRequest = (requestUrl: string, redirectCount: number) => {
      if (redirectCount > 5) {
        reject(new Error("Too many redirects"));
        return;
      }

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

  while (offset + 512 <= data.length && files.length < MAX_FILES) {
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
        files.push({ path: relativePath, content, size });
        totalBytes += size;
      } else {
        skipped++;
      }
    }

    // Advance past file data (padded to 512-byte boundary)
    offset += Math.ceil(fileSize / 512) * 512;
  }

  return { files, skipped, totalBytes };
}

/** @internal — exported for testing only */
export function shouldInclude(path: string, size: number): boolean {
  if (size > MAX_FILE_SIZE) return false;

  /* v8 ignore next — V8 quirk: path.split always has segments */
  const fileName = path.split("/").pop() ?? "";
  if (SKIP_LOCKFILES.has(fileName)) return false;

  // Skip hidden directories (but keep hidden files at root like .gitignore)
  const parts = path.split("/");
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i].startsWith(".")) return false;
  }

  // Skip known junk dirs
  for (const part of parts) {
    if (part === "node_modules" || part === "dist" || part === "build" || part === "__pycache__" || part === ".git") {
      return false;
    }
  }

  /* v8 ignore start — V8 quirk: fileName.split always has segments */
  const ext = ("." + (fileName.split(".").pop() ?? "")).toLowerCase();

  // Extensionless root config files
  if (ext === "." && (fileName === "Dockerfile" || fileName === "Makefile")) return true;
  /* v8 ignore stop */

  return INCLUDE_EXTENSIONS.has(ext);
}
