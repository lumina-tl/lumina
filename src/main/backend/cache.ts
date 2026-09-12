/** Temp cache — session artifacts + crash leftovers. */
import fs from "fs";
import os from "os";
import path from "path";
import { log } from "../core/logger";

export const CACHE_DIR = path.join(os.tmpdir(), "lumina");

function countFiles(dir: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = countFiles(full);
      files += sub.files;
      bytes += sub.bytes;
    } else if (entry.isFile()) {
      files++;
      try {
        bytes += fs.statSync(full).size;
      } catch {
        /* file vanished mid-walk */
      }
    }
  }
  return { files, bytes };
}

function clearCache(reason: string, skipOpenDirs = false): void {
  let files = 0;
  let bytes = 0;
  if (fs.existsSync(CACHE_DIR)) {
    for (const entry of fs.readdirSync(CACHE_DIR, { withFileTypes: true })) {
      if (
        skipOpenDirs &&
        entry.isDirectory() &&
        entry.name.startsWith("open-")
      ) {
        continue;
      }
      const full = path.join(CACHE_DIR, entry.name);
      try {
        if (entry.isDirectory()) {
          const sub = countFiles(full);
          files += sub.files;
          bytes += sub.bytes;
          fs.rmSync(full, { recursive: true, force: true });
        } else {
          files++;
          bytes += fs.statSync(full).size;
          fs.unlinkSync(full);
        }
      } catch (err) {
        log.warn(`Failed to remove cache entry ${full}: ${err}`);
      }
    }
  }
  if (files > 0) {
    const mb = (bytes / 1024 / 1024).toFixed(1);
    log.info(`Cache cleaned (${reason}): ${files} file(s), ${mb} MB`);
  }
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

/** Called once at startup — wipes leftovers from a previous crashed session. */
export function prepareCache(): void {
  log.info(`Cache dir: ${CACHE_DIR}`);
  clearCache("previous session leftovers");
}

/** Session-scoped patches — safe once backend down, keeps open-* extracts. */
export function clearSessionCache(): void {
  clearCache("app close", true);
}

/** Extracted .lmi source images — only safe when app quitting. */
export function clearExtractedCache(): void {
  clearCache("app quit", false);
}
