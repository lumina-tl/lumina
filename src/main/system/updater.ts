/** Updater — check/download/install app updates. */
import { app, BrowserWindow, shell } from "electron";
import updaterPkg from "electron-updater";
import { IPC } from "../../shared/bridge";
import type { CheckUpdateResult, UpdateProgress } from "../../shared/bridge";
import { handle, send } from "../core/ipc";
import { withDownloadMutex } from "../core/mutex";
import { clearExtractedCache } from "../backend/cache";
import { stopBackend } from "../backend/spawn";
import { installerVariant } from "../models/runtime/variant";
import { readConfig } from "./config";

const { autoUpdater } = updaterPkg;

const UPDATE_URL = "https://github.com/lumina-tl/lumina/releases";
const NIGHTLY_FEED_URL =
  "https://github.com/lumina-tl/lumina/releases/download/nightly";

type UpdateChannel = "stable" | "nightly";

let win: BrowserWindow | null = null;
let checking = false;
let downloading = false;
let downloadedVersion: string | null = null;
let lastCheckedChannel: UpdateChannel | null = null;

function getUpdateChannel(): UpdateChannel {
  const saved = readConfig().settings["lumina-update-channel"];
  if (saved === "nightly" || saved === "stable") return saved;
  return app.getVersion().includes("-nightly.") ? "nightly" : "stable";
}

function configureFeed(channel: UpdateChannel): void {
  const variant = installerVariant() === "cuda" ? "cuda" : "dml";
  const isNightlyBuild = app.getVersion().includes("-nightly.");
  if (channel === "nightly") {
    autoUpdater.allowPrerelease = true;
    autoUpdater.allowDowngrade = true;
    autoUpdater.setFeedURL({
      provider: "generic",
      url: NIGHTLY_FEED_URL,
      channel: variant,
    });
  } else {
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = isNightlyBuild;
    autoUpdater.setFeedURL({
      provider: "github",
      owner: "lumina-tl",
      repo: "lumina",
      channel: variant,
    });
  }
}

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

function push(p: UpdateProgress): void {
  send(win, IPC.updateProgress, p);
}

autoUpdater.on("download-progress", (p) => {
  push({
    state: "downloading",
    percent: p.percent,
    transferred: p.transferred,
    total: p.total,
    speed: p.bytesPerSecond,
  });
});

autoUpdater.on("update-downloaded", (info) => {
  downloading = false;
  downloadedVersion = info.version;
  push({ state: "downloaded", version: info.version });
});

autoUpdater.on("error", (e) => {
  if (!downloading) return;
  downloading = false;
  push({ state: "error", error: String((e as Error)?.message || e) });
});

function checkOnce(): Promise<CheckUpdateResult> {
  const current = app.getVersion();
  return new Promise((resolve) => {
    let done = false;
    const finish = (r: CheckUpdateResult) => {
      if (done) return;
      done = true;
      resolve(r);
    };
    autoUpdater.once("update-available", (info: { version: string }) => {
      finish({
        available: true,
        current,
        latest: info.version,
        url: UPDATE_URL,
      });
    });
    autoUpdater.once("update-not-available", () =>
      finish({ available: false, current }),
    );
    autoUpdater.once("error", (e: unknown) =>
      finish({ available: false, error: String((e as Error)?.message || e) }),
    );
    void autoUpdater
      .checkForUpdates()
      .catch((e: unknown) =>
        finish({ available: false, error: String((e as Error)?.message || e) }),
      );
  });
}

export function registerUpdaterHandlers(target: BrowserWindow | null): void {
  win = target;
  handle(IPC.appInfo, () => ({
    version: app.getVersion(),
    isPackaged: app.isPackaged,
  }));
  handle(IPC.checkForUpdates, async () => {
    if (!app.isPackaged) return { available: false, error: "dev" };
    const channel = getUpdateChannel();
    if (lastCheckedChannel && lastCheckedChannel !== channel) {
      downloadedVersion = null;
    }
    if (downloadedVersion) {
      return {
        available: true,
        current: app.getVersion(),
        latest: downloadedVersion,
        url: UPDATE_URL,
      };
    }
    if (checking) return { available: false };
    checking = true;
    lastCheckedChannel = channel;
    configureFeed(channel);
    const res = await checkOnce();
    checking = false;
    return res;
  });
  handle(IPC.downloadUpdate, async () => {
    if (downloading || downloadedVersion) return;
    downloading = true;
    try {
      await withDownloadMutex(() => autoUpdater.downloadUpdate());
    } catch (e) {
      downloading = false;
      push({ state: "error", error: String((e as Error)?.message || e) });
    }
  });
  handle(IPC.installUpdate, async () => {
    if (!downloadedVersion) return;
    push({ state: "installing", version: downloadedVersion });
    try {
      await stopBackend();
      clearExtractedCache();
    } catch {
      /* proceed with install even if cache cleanup fails */
    }
    autoUpdater.quitAndInstall(false, true);
  });
  handle(IPC.openUpdateUrl, (_e, url: string) => {
    if (url) void shell.openExternal(url);
  });
}
