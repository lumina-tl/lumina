/** Imports — image picker + recents. */
import { BrowserWindow, dialog } from "electron";
import { IPC } from "../../shared/bridge";
import { handle } from "../core/ipc";
import { recordRecent } from "./recents";

const IMAGE_FILTERS = [
  { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "bmp"] },
];

export function registerImportHandlers(win: BrowserWindow): void {
  handle(IPC.importImage, async () => {
    const result = await dialog.showOpenDialog(win, {
      title: "Import Manga Page",
      filters: IMAGE_FILTERS,
      properties: ["openFile"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    recordRecent("image", filePath);
    return filePath;
  });
  handle(IPC.importImages, async () => {
    const result = await dialog.showOpenDialog(win, {
      title: "Import Manga Pages",
      filters: IMAGE_FILTERS,
      properties: ["openFile", "multiSelections"],
    });
    if (result.canceled || result.filePaths.length === 0) return [];
    result.filePaths.forEach((p) => recordRecent("image", p));
    return result.filePaths;
  });
}
