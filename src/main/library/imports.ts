/** Imports — image picker + recents. */
import { BrowserWindow, dialog } from "electron";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { IPC } from "../../shared/bridge";
import { handle } from "../core/ipc";
import { recordRecent } from "./recents";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "bmp"];
const IMAGE_FILTERS = [
  { name: "Images", extensions: IMAGE_EXTENSIONS },
];

async function listImages(folder: string): Promise<string[]> {
  const folders = [folder];
  const files: string[] = [];
  while (folders.length > 0) {
    const current = folders.pop() as string;
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        folders.push(entryPath);
      } else if (
        entry.isFile() &&
        IMAGE_EXTENSIONS.includes(
          path.extname(entry.name).slice(1).toLowerCase(),
        )
      ) {
        files.push(entryPath);
      }
    }
  }
  return files.sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );
}

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
  handle(IPC.importImageFolder, async () => {
    const result = await dialog.showOpenDialog(win, {
      title: "Import Manga Folder",
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const folderPath = result.filePaths[0];
    const filePaths = await listImages(folderPath);
    filePaths.forEach((p) => recordRecent("image", p));
    return { filePaths, folderName: path.basename(folderPath) };
  });
}
