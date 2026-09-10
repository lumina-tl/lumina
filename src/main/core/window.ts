/** App window — create, focus, close guard, open path. */
import { BrowserWindow, shell } from "electron";
import path from "path";
import { IPC } from "../../shared/bridge";
import { handle, send } from "./ipc";
import { MAIN_DIR } from "./paths";

let win: BrowserWindow | null = null;
let allowClose = false;
let pendingOpenPath: string | null = null;

export function getWindow(): BrowserWindow | null {
  return win;
}

export function getPendingOpenPath(): string | null {
  return pendingOpenPath;
}

export function setPendingOpenPath(p: string | null): void {
  pendingOpenPath = p;
}

export function findLumiPath(args: string[]): string | null {
  for (const a of args) {
    if (!a || a.startsWith("-")) continue;
    if (a.startsWith("--") && a.includes("=")) continue;
    if (a.trim().toLowerCase().endsWith(".lmi")) return a;
  }
  return null;
}

export function createWindow(): BrowserWindow {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "Lumina",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(MAIN_DIR, "../preload/preload.cjs"),
    },
  });
  win.loadFile(path.join(MAIN_DIR, "../renderer/index.html"));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://"))
      void shell.openExternal(url);
    return { action: "deny" };
  });
  win.on("close", (e) => {
    if (allowClose) return;
    const wc = win?.webContents;
    if (!wc || wc.isLoading()) return;
    e.preventDefault();
    wc.send(IPC.requestCloseCheck);
  });
  win.on("closed", () => {
    win = null;
    allowClose = false;
  });
  handle(IPC.pendingOpenPath, () => pendingOpenPath);
  handle(IPC.confirmClose, (_e, ok: boolean) => {
    allowClose = !!ok;
    if (allowClose && win) win.close();
  });
  return win;
}

export function focusWindow(openPath?: string | null): void {
  if (!win) {
    if (openPath) pendingOpenPath = openPath;
    return;
  }
  if (win.isMinimized()) win.restore();
  win.focus();
  if (openPath) send(win, IPC.openProjectRequest, openPath);
}
