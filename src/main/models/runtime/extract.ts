/** Extract — sha512 + 7z archive extract. */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { app } from "electron";

export async function sha512File(file: string): Promise<string> {
  const h = createHash("sha512");
  await new Promise<void>((resolve, reject) => {
    const rs = fs.createReadStream(file);
    rs.on("data", (c: Buffer) => h.update(c));
    rs.on("end", () => resolve());
    rs.on("error", reject);
  });
  return h.digest("hex");
}

function sevenZrPath(): string | null {
  const res = process.resourcesPath;
  const appPath = app?.getAppPath ? app.getAppPath() : process.cwd();
  if (process.platform !== "win32") {
    const linuxBins = [
      path.join(res, "7zz"),
      path.join(res, "7z"),
      "/usr/bin/7zz",
      "/usr/bin/7z",
      "/usr/local/bin/7zz",
      "/usr/local/bin/7z",
    ];
    return linuxBins.find((c) => fs.existsSync(c)) || null;
  }
  const candidates = [
    path.join(res, "7zr.exe"),
    path.join(res, "resources", "7zr.exe"),
    path.join(res, "ort", "7zr.exe"),
    path.join(appPath, "build", "7zr.exe"),
    path.join(process.cwd(), "build", "7zr.exe"),
  ];
  return candidates.find((c) => fs.existsSync(c)) || null;
}

export function extract7z(
  archive: string,
  dest: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  if (
    process.platform !== "win32" &&
    (archive.endsWith(".tar.gz") ||
      archive.endsWith(".tgz") ||
      archive.endsWith(".tar.xz"))
  ) {
    fs.mkdirSync(dest, { recursive: true });
    return new Promise<void>((resolve, reject) => {
      const p = spawn("tar", ["-xf", archive, "-C", dest], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      let errOut = "";
      p.stderr?.on("data", (d: Buffer) => {
        errOut += d.toString();
      });
      p.on("error", reject);
      p.on("exit", (code) => {
        if (code === 0) {
          onProgress?.(100);
          resolve();
        } else {
          reject(new Error(`tar extract failed (exit ${code}): ${errOut.trim()}`));
        }
      });
    });
  }
  const exe = sevenZrPath();
  if (!exe)
    return Promise.reject(new Error("7z/7zr extractor not found"));
  fs.mkdirSync(dest, { recursive: true });

  return new Promise<void>((resolve, reject) => {
    const p = spawn(exe, ["x", archive, `-o${dest}`, "-y", "-bsp1"], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let lastPct = -1;
    let buf = "";
    let errOut = "";

    p.stdout?.on("data", (d: Buffer) => {
      buf += d.toString();
      const matches = [...buf.matchAll(/(\d{1,3})%/g)];
      if (matches.length > 0) {
        const latest = parseInt(matches[matches.length - 1][1], 10);
        if (!Number.isNaN(latest)) {
          const pct = Math.min(100, Math.max(0, latest));
          if (pct !== lastPct) {
            lastPct = pct;
            onProgress?.(pct);
          }
        }
        if (buf.length > 100) {
          buf = buf.slice(-32);
        }
      }
    });

    p.stderr?.on("data", (d: Buffer) => {
      errOut += d.toString();
    });

    p.on("error", reject);
    p.on("exit", (code) => {
      if (code === 0) {
        if (lastPct < 100) onProgress?.(100);
        resolve();
      } else {
        const detail = errOut.trim() ? `: ${errOut.trim()}` : "";
        reject(new Error(`7zr extract failed (exit ${code})${detail}`));
      }
    });
  });
}
