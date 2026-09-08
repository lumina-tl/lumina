/* ── CUDA runtime manager ──
 * Downloads the onnxruntime-gpu runtime to userData (not the installer),
 * so app updates never re-download ~1.3 GB of NVIDIA DLLs. The CUDA
 * installer no longer bundles ort/cuda.7z — the app fetches it once on
 * first run, verifies sha512, extracts with the bundled 7zr.exe, then
 * the backend starts against userData/runtime/cuda.
 *
 * Download coordination (single mutex): CUDA runtime has the HIGHEST
 * priority. While it is downloading, the app-update download and every
 * model download (including AngleNet/aux) wait in line — they queue
 * behind it instead of racing on the same network pipe.
 */
import { app, BrowserWindow } from "electron";
import { spawn } from "child_process";
import fs from "fs";
import http from "http";
import https from "https";
import path from "path";
import { createHash } from "crypto";
import { IPC } from "../shared/bridge";
import type {
  RuntimeInfo,
  RuntimeProgress,
  RuntimeState,
} from "../shared/bridge";

/** Marker + installed dir live under userData so updates never touch them. */
const RUNTIME_DIR = () => path.join(app.getPath("userData"), "runtime");
const CUDA_DIR = () => path.join(RUNTIME_DIR(), "cuda");
const MARKER_FILE = () => path.join(RUNTIME_DIR(), "cuda-runtime.json");

/** Where the CUDA runtime archive is published — one asset per release tag,
 *  so the app fetches the archive that ships alongside its own version.
 *  CI uploads cuda-runtime.7z + cuda-runtime.json to every release. */
const RUNTIME_RELEASE_BASE = () =>
  `https://github.com/lumina-tl/lumina/releases/download/v${app.getVersion()}`;

/** Installed onnxruntime variant — "cuda" | "dml" | "none".
 *  New CUDA installers carry NO ORT folder (the app downloads it at first
 *  run), so the variant comes from the bundle manifest.json. Legacy folders
 *  still win for old installs that ship the runtime in resources/ort. */
export function installerVariant(): string {
  const res = process.resourcesPath;
  const has = (d: string) => fs.existsSync(path.join(d, "onnxruntime"));
  if (has(path.join(res, "ort", "cuda"))) return "cuda"; // legacy bundled
  if (has(path.join(res, "ort", "dml"))) return "dml"; // bundled DML
  try {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(res, "manifest.json"), "utf-8"),
    ) as { variant?: string };
    if (manifest?.variant === "cuda" || manifest?.variant === "dml") {
      return manifest.variant;
    }
  } catch {
    /* no manifest (dev / old bundle) */
  }
  return "none";
}

/** Resolve the active ORT folder. CUDA runtime in userData wins over the
 *  legacy bundled cuda, then bundled dml. Returns null → no onnxruntime. */
export function activeOrtDir(): string | null {
  const has = (d: string) => fs.existsSync(path.join(d, "onnxruntime"));
  const res = process.resourcesPath;
  const userCuda = CUDA_DIR();
  if (has(userCuda)) return userCuda; // downloaded by app (new)
  const bundledCuda = path.join(res, "ort", "cuda");
  if (has(bundledCuda)) return bundledCuda; // legacy bundled (old installers)
  const bundledDml = path.join(res, "ort", "dml");
  if (has(bundledDml)) return bundledDml;
  return null;
}

interface RuntimeMarker {
  version: string;
  sha512: string;
  size: number;
}

let _window: BrowserWindow | null = null;
let _state: RuntimeState = "missing";
let _version: string | undefined;
let _error: string | undefined;
let _progress = 0;

/** Single global download mutex — shared with update + model downloads. */
let _active: Promise<unknown> = Promise.resolve();
let _queueDepth = 0;

/** Acquire the global download queue; the task runs after prior ones end. */
export function withDownloadMutex<T>(task: () => Promise<T>): Promise<T> {
  if (_queueDepth === 0) _pushBusy(true);
  _queueDepth++;
  const next = _active.then(task, task);
  // Keep the chain alive even when a task rejects.
  _active = next.then(
    () => undefined,
    () => undefined,
  );
  next.finally(() => {
    _queueDepth--;
    if (_queueDepth === 0) _pushBusy(false);
  });
  return next;
}

function _push(progress: RuntimeProgress): void {
  if (progress.state === "downloading") {
    _state = "downloading";
    if (progress.percent != null) _progress = progress.percent;
  } else if (progress.state === "extracting") {
    _state = "extracting";
    _progress = 100;
  } else if (progress.state === "ready") {
    _state = "ready";
    _version = progress.version;
    _error = undefined;
    _progress = 100;
  } else if (progress.state === "error") {
    _state = "error";
    _error = progress.error;
  }
  if (_window && !_window.isDestroyed()) {
    _window.webContents.send(IPC.runtimeProgress, progress);
  }
}

/** Broadcast the global download-busy flag (gates model download buttons). */
function _pushBusy(busy: boolean): void {
  if (_window && !_window.isDestroyed()) {
    _window.webContents.send(IPC.runtimeBusy, busy);
  }
}

/** Read the installed marker, or null when the runtime is missing. */
function readMarker(): RuntimeMarker | null {
  try {
    if (!fs.existsSync(MARKER_FILE())) return null;
    return JSON.parse(fs.readFileSync(MARKER_FILE(), "utf-8")) as RuntimeMarker;
  } catch {
    return null;
  }
}

/** Whether the CUDA runtime is available. True for DML installs (no runtime
 *  needed), for legacy installs that already carry the bundled runtime in
 *  resources/ort/cuda, or once the app-downloaded copy is complete. */
export function isCudaRuntimeReady(): boolean {
  if (installerVariant() !== "cuda") return true; // DML needs no runtime
  const res = process.resourcesPath;
  // Legacy bundled runtime (pre-Option-A installers) — adopt it, no download.
  if (
    fs.existsSync(
      path.join(res, "ort", "cuda", "onnxruntime", "capi", "onnxruntime.dll"),
    )
  ) {
    return true;
  }
  const m = readMarker();
  if (!m) return false;
  return fs.existsSync(
    path.join(CUDA_DIR(), "onnxruntime", "capi", "onnxruntime.dll"),
  );
}

export function runtimeStatus(): RuntimeInfo {
  const variant = installerVariant();
  const m = readMarker();
  const ready = isCudaRuntimeReady();
  return {
    variant,
    state: variant === "cuda" ? (ready ? "ready" : _state) : "ready",
    version: m?.version || _version,
    progress: _progress,
    error: _error,
    busy: _queueDepth > 0,
  };
}

function fetchBuffer(url: string, redirects = 5): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https:") ? https : http;
    const req = mod.get(
      url,
      { headers: { "User-Agent": "Lumina/0.3.0" } },
      (res) => {
        // GitHub release downloads 302 to objects.githubusercontent.com —
        // follow the redirect chain (manifest.json is a small file).
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
          res.resume();
          const loc = res.headers.location;
          if (!loc || redirects <= 0) {
            reject(new Error(`Too many redirects for ${url}`));
            return;
          }
          const next = new URL(loc, url).toString();
          resolve(fetchBuffer(next, redirects - 1));
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

/**
 * Download a file to `dest` (.part), streaming with progress.
 * Follows redirects (GitHub release assets 302 to the CDN).
 *
 * Robustness notes (first-run CUDA runtime download):
 * - Every cleanup / rename is guarded — a missing .part must never throw
 *   (createWriteStream opens the file asynchronously, so the file may not
 *   exist yet when a 3xx response arrives).
 * - `settled` prevents double resolve/reject when multiple events race.
 * - `res` errors are handled too, otherwise a mid-transfer network drop
 *   would leave the promise hanging forever (no toast, silent stall).
 */
function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const part = dest + ".part";
    // Reset any stale .part before starting.
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
          const next = new URL(loc, url).toString();
          // Hop to the next URL. Nothing was written to this stream yet —
          // close it and let the recursive call create a fresh .part.
          out.close(() => {
            if (settled) return;
            downloadFile(next, dest).then(resolve, fail);
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
        res.on("data", (chunk) => {
          done += chunk.length;
          if (total > 0) {
            const pct = Math.min(100, Math.round((done / total) * 100));
            if (pct !== _progress) {
              _progress = pct;
              _push({
                state: "downloading",
                percent: pct,
                transferred: done,
                total,
              });
            }
          }
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
          // .part -> final: callers expect the file at `dest`.
          fs.rmSync(dest, { force: true }); // stale leftover from a crash
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

/** Streamed sha512 — the runtime archive is >1 GB, never load it whole. */
async function sha512File(file: string): Promise<string> {
  const h = createHash("sha512");
  await new Promise<void>((resolve, reject) => {
    const rs = fs.createReadStream(file);
    rs.on("data", (c: Buffer) => h.update(c));
    rs.on("end", () => resolve());
    rs.on("error", reject);
  });
  return h.digest("hex");
}

/** 7zr.exe ships next to the app (resources/7zr.exe) in CUDA installs. */
function sevenZrPath(): string | null {
  const res = process.resourcesPath;
  const candidates = [
    path.join(res, "7zr.exe"),
    path.join(res, "resources", "7zr.exe"),
    path.join(res, "ort", "7zr.exe"),
  ];
  return candidates.find((c) => fs.existsSync(c)) || null;
}

/** Extract the runtime archive with 7zr.exe (async — 1.2GB, don't freeze UI).
 *  `windowsHide` suppresses the terminal window that would otherwise pop up
 *  for the spawned 7zr.exe on Windows. */
function extract7z(archive: string, dest: string): Promise<void> {
  const exe = sevenZrPath();
  if (!exe)
    return Promise.reject(new Error("7zr.exe not found in app resources"));
  fs.mkdirSync(dest, { recursive: true });
  return new Promise((resolve, reject) => {
    const p = spawn(exe, ["x", archive, `-o${dest}`, "-y"], {
      windowsHide: true,
      stdio: "ignore",
    });
    p.on("error", (e) => reject(e));
    p.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`7zr extract failed (exit ${code})`));
    });
  });
}

/** Install the CUDA runtime from the published archive (mutex-wrapped). */
export function ensureCudaRuntime(): Promise<void> {
  return withDownloadMutex(() => _ensureCudaRuntime());
}

async function _ensureCudaRuntime(): Promise<void> {
  if (installerVariant() !== "cuda" || isCudaRuntimeReady()) return;

  _state = "downloading";
  _error = undefined;
  _progress = 0;
  _push({ state: "downloading", percent: 0 });

  // Resolve the archive + checksum from the release feed.
  const infoUrl = `${RUNTIME_RELEASE_BASE()}/cuda-runtime.json`;
  let info: { url: string; sha512: string; version: string } | null = null;
  try {
    const raw = JSON.parse((await fetchBuffer(infoUrl)).toString("utf-8"));
    if (raw?.url && raw?.sha512) info = raw;
  } catch (e) {
    // Release not published yet — fall back to the well-known asset name.
    _push({
      state: "error",
      error: `Runtime manifest not found (${String((e as Error)?.message || e)}). The release may not be published yet.`,
    });
    return;
  }

  const archive = path.join(RUNTIME_DIR(), "cuda.7z");
  fs.mkdirSync(RUNTIME_DIR(), { recursive: true });
  if (!info?.url || !info?.sha512) {
    _push({
      state: "error",
      error: "Runtime manifest is missing url/sha512 fields.",
    });
    return;
  }
  // Manifest stores a relative asset name — resolve against the release base.
  const archiveUrl = /^https?:\/\//i.test(info.url)
    ? info.url
    : `${RUNTIME_RELEASE_BASE()}/${info.url}`;
  try {
    await downloadFile(archiveUrl, archive);
    const got = await sha512File(archive);
    if (got !== info.sha512) {
      throw new Error(`sha512 mismatch: expected ${info.sha512}, got ${got}`);
    }
    _push({ state: "extracting" });
    await extract7z(archive, CUDA_DIR());
    try {
      fs.unlinkSync(archive); // best-effort — retried next launch
    } catch {
      /* Defender/indexer may hold a handle; the marker decides readiness */
    }
    const marker: RuntimeMarker = {
      version: info.version,
      sha512: info.sha512,
      size: fs.statSync(
        path.join(CUDA_DIR(), "onnxruntime", "capi", "onnxruntime.dll"),
      ).size,
    };
    fs.writeFileSync(MARKER_FILE(), JSON.stringify(marker, null, 2));
    _push({ state: "ready", version: info.version });
  } catch (e) {
    // Clean up a partial archive so the next launch retries from scratch.
    fs.rmSync(archive, { force: true });
    fs.rmSync(archive + ".part", { force: true });
    _push({
      state: "error",
      error: String((e as Error)?.message || e),
    });
  }
}

export function registerRuntimeIpc(win: BrowserWindow | null): void {
  _window = win;
}
