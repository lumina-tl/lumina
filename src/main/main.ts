/** App entry — boot, window, backend, handlers. */
import { app, BrowserWindow, Menu } from "electron";
import { loadEnvFile } from "./backend/env";

loadEnvFile();

// Configure Wayland/X11 auto-detection on Linux before app readiness.
if (process.platform === "linux") {
  const ozoneHint =
    process.env.LUMINA_OZONE_PLATFORM ||
    process.env.ELECTRON_OZONE_PLATFORM_HINT ||
    "auto";
  app.commandLine.appendSwitch("ozone-platform-hint", ozoneHint);
  app.commandLine.appendSwitch(
    "enable-features",
    "WaylandWindowDecorations,UseOzonePlatform",
  );
  app.commandLine.appendSwitch("enable-wayland-ime");
  app.commandLine.appendSwitch("disable-dev-shm-usage");
  if (process.env.LUMINA_NO_SANDBOX === "1") {
    app.commandLine.appendSwitch("no-sandbox");
  }
  if (process.env.LUMINA_DISABLE_GPU === "1") {
    app.disableHardwareAcceleration();
  }
}
import { IPC } from "../shared/bridge";
import { send } from "./core/ipc";
import { onDownloadBusyChange } from "./core/mutex";
import {
  createWindow,
  findLumiPath,
  focusWindow,
  getWindow,
  setPendingOpenPath,
} from "./core/window";
import { clearExtractedCache, prepareCache } from "./backend/cache";
import { spawnBackend, stopBackend } from "./backend/spawn";
import { registerApiHandlers } from "./backend/proxy";
import { registerConfigHandlers } from "./system/config";
import { registerSecretHandlers } from "./system/secrets";
import { registerFontHandlers } from "./system/fonts";
import { registerFontMarketHandlers } from "./system/font-market";
import { registerTranslationHandlers } from "./system/translations";
import { registerUpdaterHandlers } from "./system/updater";
import { registerDeviceHandlers } from "./models/device";
import { registerDownloadHandlers } from "./models/downloads";
import {
  ensureCudaRuntime,
  registerRuntimeHandlers,
} from "./models/runtime/installer";
import { installerVariant, isCudaRuntimeReady } from "./models/runtime/variant";
import { registerImportHandlers } from "./library/imports";
import { registerRecentHandlers } from "./library/recents";
import { registerProjectHandlers } from "./library/project";
import { registerExportHandlers } from "./library/export";
import { registerTempCacheHandlers } from "./library/temp-cache";
import { registerLogHandler } from "./core/logger";

/** Wire all IPC handlers for a new window. */
function registerAll(win: BrowserWindow): void {
  registerApiHandlers();
  registerDeviceHandlers();
  registerDownloadHandlers(win);
  registerRuntimeHandlers(win);
  registerSecretHandlers();
  registerConfigHandlers();
  registerFontHandlers();
  registerFontMarketHandlers();
  registerTranslationHandlers();
  registerUpdaterHandlers(win);
  registerProjectHandlers();
  registerExportHandlers();
  registerTempCacheHandlers();
  registerImportHandlers(win);
  registerRecentHandlers();
}

function bootWindow(): BrowserWindow {
  const win = createWindow();
  registerAll(win);
  return win;
}

onDownloadBusyChange((busy) => send(getWindow(), IPC.runtimeBusy, busy));

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  registerLogHandler();

  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }
  app.on("second-instance", (_e, argv) => {
    focusWindow(findLumiPath(argv));
  });

  setPendingOpenPath(findLumiPath(process.argv.slice(1)));

  prepareCache();
  await spawnBackend();
  bootWindow();

  if (installerVariant() === "cuda" && !isCudaRuntimeReady()) {
    await ensureCudaRuntime();
    stopBackend();
    await spawnBackend();
    send(getWindow(), IPC.checkModel);
  }
});

app.on("window-all-closed", () => {
  stopBackend();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  clearExtractedCache();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    bootWindow();
  }
});
