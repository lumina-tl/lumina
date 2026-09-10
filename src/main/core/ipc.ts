/** IPC helpers — handle, send, window lookup. */
import { BrowserWindow, ipcMain } from "electron";
import type { IpcMainInvokeEvent } from "electron";

export function handle(
  channel: string,
  listener: (event: IpcMainInvokeEvent, ...args: never[]) => unknown,
): void {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, listener as (...args: unknown[]) => unknown);
}

export function windowFromEvent(
  event: IpcMainInvokeEvent,
): BrowserWindow | undefined {
  return BrowserWindow.fromWebContents(event.sender) ?? undefined;
}

export function send(
  win: BrowserWindow | null,
  channel: string,
  ...args: unknown[]
): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, ...args);
  }
}
