/** Download — fetch buffer + file with progress. */
import fs from "fs";
import http from "http";
import https from "https";

export function fetchBuffer(url: string, redirects = 5): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https:") ? https : http;
    const req = mod.get(
      url,
      { headers: { "User-Agent": "Lumina/0.3.0" } },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
          res.resume();
          const loc = res.headers.location;
          if (!loc || redirects <= 0) {
            reject(new Error(`Too many redirects for ${url}`));
            return;
          }
          resolve(fetchBuffer(new URL(loc, url).toString(), redirects - 1));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          res.resume();
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      },
    );
    req.on("error", reject);
  });
}

export function downloadFile(
  url: string,
  dest: string,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const part = dest + ".part";
    try {
      fs.rmSync(part, { force: true });
    } catch {
      /* ignore */
    }
    const out = fs.createWriteStream(part);
    const mod = url.startsWith("https:") ? https : http;
    let settled = false;

    const cleanup = (): void => {
      try {
        fs.rmSync(part, { force: true });
      } catch {
        /* ignore */
      }
    };
    const fail = (e: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(e);
    };

    const req = mod.get(
      url,
      { headers: { "User-Agent": "Lumina/0.3.1" } },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
          res.resume();
          const loc = res.headers.location;
          if (!loc) {
            fail(new Error(`Redirect without location for ${url}`));
            return;
          }
          out.close(() => {
            if (settled) return;
            downloadFile(new URL(loc, url).toString(), dest, onProgress).then(
              resolve,
              fail,
            );
          });
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          fail(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        res.on("error", fail);
        const total = Number(res.headers["content-length"] || 0);
        let done = 0;
        res.on("data", (chunk: Buffer) => {
          done += chunk.length;
          onProgress?.(done, total);
        });
        res.pipe(out);
      },
    );
    req.on("error", fail);
    out.on("finish", () => {
      out.close(() => {
        if (settled) return;
        settled = true;
        try {
          fs.rmSync(dest, { force: true });
          fs.renameSync(part, dest);
          resolve();
        } catch (e) {
          cleanup();
          reject(
            new Error(
              `failed to finalize download: ${String((e as Error)?.message || e)}`,
            ),
          );
        }
      });
    });
    out.on("error", fail);
  });
}
