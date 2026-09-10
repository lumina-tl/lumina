/** Extract — sha512 + 7z archive extract. */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { createHash } from "crypto";

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
  const candidates = [
    path.join(res, "7zr.exe"),
    path.join(res, "resources", "7zr.exe"),
    path.join(res, "ort", "7zr.exe"),
  ];
  return candidates.find((c) => fs.existsSync(c)) || null;
}

function countFiles7z(archive: string): Promise<number> {
  const exe = sevenZrPath();
  if (!exe)
    return Promise.reject(new Error("7zr.exe not found in app resources"));
  return new Promise((resolve, reject) => {
    const p = spawn(exe, ["l", archive], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    p.stdout?.on("data", (d: Buffer) => {
      out += d.toString();
    });
    p.on("error", reject);
    p.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`7zr list failed (exit ${code})`));
        return;
      }
      const m = out.match(/Files:\s+(\d+)/i);
      resolve(m ? parseInt(m[1], 10) : 0);
    });
  });
}

export function extract7z(
  archive: string,
  dest: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const exe = sevenZrPath();
  if (!exe)
    return Promise.reject(new Error("7zr.exe not found in app resources"));
  fs.mkdirSync(dest, { recursive: true });
  return countFiles7z(archive).then(
    (totalFiles) =>
      new Promise<void>((resolve, reject) => {
        const p = spawn(exe, ["x", archive, `-o${dest}`, "-y"], {
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        });
        let extracted = 0;
        let lastPct = -1;
        p.stdout?.on("data", (d: Buffer) => {
          const matches = d.toString().match(/Extracting/g);
          if (matches) {
            extracted += matches.length;
            if (totalFiles > 0) {
              const pct = Math.min(
                100,
                Math.round((extracted / totalFiles) * 100),
              );
              if (pct !== lastPct) {
                lastPct = pct;
                onProgress?.(pct);
              }
            }
          }
        });
        p.on("error", reject);
        p.on("exit", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`7zr extract failed (exit ${code})`));
        });
      }),
  );
}
