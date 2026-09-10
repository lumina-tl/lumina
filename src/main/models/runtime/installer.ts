/** CUDA runtime — download/verify/extract. */
import { app, BrowserWindow } from "electron";
import fs from "fs";
import path from "path";
import { IPC } from "../../../shared/bridge";
import type {
  RuntimeInfo,
  RuntimeProgress,
  RuntimeState,
} from "../../../shared/bridge";
import { handle, send } from "../../core/ipc";
import { isDownloadBusy, withDownloadMutex } from "../../core/mutex";
import { fetchBuffer, downloadFile } from "./download";
import { extract7z, sha512File } from "./extract";
import {
  cudaDir,
  installerVariant,
  isCudaRuntimeReady,
  markerFile,
  readMarker,
  runtimeDir,
  type RuntimeMarker,
} from "./variant";

let win: BrowserWindow | null = null;
let state: RuntimeState = "missing";
let version: string | undefined;
let error: string | undefined;
let progress = 0;

function runtimeVersionBase(): string {
  return `https://github.com/lumina-tl/lumina/releases/download/v${app.getVersion()}`;
}

function push(p: RuntimeProgress): void {
  if (p.state === "downloading") {
    state = "downloading";
    if (p.percent != null) progress = p.percent;
  } else if (p.state === "extracting") {
    state = "extracting";
    progress = p.percent ?? 0;
  } else if (p.state === "ready") {
    state = "ready";
    version = p.version;
    error = undefined;
    progress = 100;
  } else if (p.state === "error") {
    state = "error";
    error = p.error;
  }
  send(win, IPC.runtimeProgress, p);
}

export function getRuntimeStatus(): RuntimeInfo {
  const variant = installerVariant();
  const marker = readMarker();
  const ready = isCudaRuntimeReady();
  return {
    variant,
    state: variant === "cuda" ? (ready ? "ready" : state) : "ready",
    version: marker?.version || version,
    progress,
    error,
    busy: isDownloadBusy(),
  };
}

async function ensureInternal(): Promise<void> {
  if (installerVariant() !== "cuda") return;

  let info: { url: string; sha512: string; version: string } | null = null;
  try {
    const raw = JSON.parse(
      (await fetchBuffer(`${runtimeVersionBase()}/cuda-runtime.json`)).toString(
        "utf-8",
      ),
    );
    if (raw?.url && raw?.sha512) info = raw;
  } catch {
    /* manifest unreachable */
  }

  if (!info?.url || !info?.sha512) {
    if (isCudaRuntimeReady()) return;
    push({
      state: "error",
      error:
        "Runtime manifest not found. The release may not be published yet.",
    });
    return;
  }

  const existing = readMarker();
  const dllExists = fs.existsSync(
    path.join(cudaDir(), "onnxruntime", "capi", "onnxruntime.dll"),
  );
  if (
    existing &&
    dllExists &&
    existing.version === info.version &&
    existing.sha512 === info.sha512
  ) {
    return;
  }

  state = "downloading";
  error = undefined;
  progress = 0;
  push({ state: "downloading", percent: 0 });

  const archive = path.join(runtimeDir(), "cuda.7z");
  fs.mkdirSync(runtimeDir(), { recursive: true });

  const archiveUrl = /^https?:\/\//i.test(info.url)
    ? info.url
    : `${runtimeVersionBase()}/${info.url}`;
  try {
    let lastPct = -1;
    await downloadFile(archiveUrl, archive, (done, total) => {
      if (total > 0) {
        const pct = Math.min(100, Math.round((done / total) * 100));
        if (pct !== lastPct) {
          lastPct = pct;
          progress = pct;
          push({
            state: "downloading",
            percent: pct,
            transferred: done,
            total,
          });
        }
      }
    });
    const got = await sha512File(archive);
    if (got !== info.sha512) {
      throw new Error(`sha512 mismatch: expected ${info.sha512}, got ${got}`);
    }
    push({ state: "extracting", percent: 0 });
    await extract7z(archive, cudaDir(), (pct) => {
      push({ state: "extracting", percent: pct });
    });
    try {
      fs.unlinkSync(archive);
    } catch {
      /* Defender may hold handle; marker decides readiness */
    }
    const marker: RuntimeMarker = {
      version: info.version,
      sha512: info.sha512,
      size: fs.statSync(
        path.join(cudaDir(), "onnxruntime", "capi", "onnxruntime.dll"),
      ).size,
    };
    fs.writeFileSync(markerFile(), JSON.stringify(marker, null, 2));
    push({ state: "ready", version: info.version });
  } catch (e) {
    fs.rmSync(archive, { force: true });
    fs.rmSync(archive + ".part", { force: true });
    fs.rmSync(cudaDir(), { recursive: true, force: true });
    push({ state: "error", error: String((e as Error)?.message || e) });
  }
}

export function ensureCudaRuntime(): Promise<void> {
  return withDownloadMutex(() => ensureInternal());
}

export function registerRuntimeHandlers(target: BrowserWindow | null): void {
  win = target;
  handle(IPC.runtimeStatus, () => getRuntimeStatus());
}
