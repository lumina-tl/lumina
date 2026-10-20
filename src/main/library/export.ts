/** Export — save rendered pages to disk. */
import { dialog } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import fs from "fs";
import path from "path";
import {
  IPC,
  type ExportPayload,
  type ExportResult,
} from "../../shared/bridge";
import { handle, windowFromEvent } from "../core/ipc";
import { log } from "../core/logger";
import { pdfWrite } from "./pdf";

async function handleExport(
  event: IpcMainInvokeEvent,
  payload: ExportPayload,
): Promise<ExportResult> {
  if (!payload.files.length) return { canceled: false, dir: null, count: 0 };
  if (payload.format === "pdf") {
    const res = await dialog.showSaveDialog(windowFromEvent(event)!, {
      title: "Export PDF",
      defaultPath: "export.pdf",
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (res.canceled || !res.filePath)
      return { canceled: true, dir: null, count: 0 };
    let filePath = res.filePath;
    if (!filePath.toLowerCase().endsWith(".pdf")) filePath += ".pdf";
    fs.writeFileSync(filePath, Buffer.from(await pdfWrite(payload.files)));
    log.info(`PDF exported: ${filePath} (${payload.files.length} page(s))`);
    return {
      canceled: false,
      dir: path.dirname(filePath),
      count: payload.files.length,
    };
  }
  const res = await dialog.showOpenDialog(windowFromEvent(event)!, {
    title: "Export Images",
    properties: ["openDirectory", "createDirectory"],
  });
  if (res.canceled || !res.filePaths[0])
    return { canceled: true, dir: null, count: 0 };
  const dir = res.filePaths[0];
  const ext = payload.format === "jpg" ? ".jpg" : ".png";
  let written = 0;
  for (const f of payload.files) {
    const rawBase = path.basename(f.fileName, path.extname(f.fileName));
    const base =
      rawBase.replace(/[<>:"/\\|?*\x00-\x1f]/g, " ").trim() || "page";
    fs.writeFileSync(path.join(dir, base + ext), Buffer.from(f.data));
    written++;
  }
  log.info(`Export done: ${dir} (${written} file(s), ${payload.format})`);
  return { canceled: false, dir, count: written };
}

async function handleExportOcrText(
  event: IpcMainInvokeEvent,
  content: string,
): Promise<{ canceled: boolean; filePath?: string }> {
  const res = await dialog.showSaveDialog(windowFromEvent(event)!, {
    title: "Export OCR Text",
    defaultPath: "ocr.txt",
    filters: [{ name: "Text File", extensions: ["txt"] }],
  });
  if (res.canceled || !res.filePath) return { canceled: true };
  fs.writeFileSync(res.filePath, content, "utf-8");
  log.info(`OCR text exported: ${res.filePath}`);
  return { canceled: false, filePath: res.filePath };
}

export function registerExportHandlers(): void {
  handle(IPC.exportImages, handleExport);
  handle(IPC.exportOcrText, handleExportOcrText);
}
