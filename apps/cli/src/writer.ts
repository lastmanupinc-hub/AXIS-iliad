import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type { GeneratedFile } from "@axis/generator-core";

export interface WriteResult {
  files_written: number;
  total_bytes: number;
  paths: string[];
}

/**
 * Writes generated files to disk under the specified output directory.
 * Creates subdirectories as needed.
 */
export function writeGeneratedFiles(
  files: GeneratedFile[],
  outputDir: string,
): WriteResult {
  let totalBytes = 0;
  const paths: string[] = [];

  for (const file of files) {
    const dest = join(outputDir, file.path);
    const dir = dirname(dest);

    mkdirSync(dir, { recursive: true });
    writeFileSync(dest, file.content, "utf-8");

    const size = Buffer.byteLength(file.content, "utf-8");
    totalBytes += size;
    paths.push(file.path);
  }

  return {
    files_written: files.length,
    total_bytes: totalBytes,
    paths,
  };
}
