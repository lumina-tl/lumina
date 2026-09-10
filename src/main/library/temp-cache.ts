/** Temp PNG — paint snapshot cache. */
import fs from "fs";
import path from "path";
import {
  IPC,
  type TempPngWritePayload,
  type TempPngWriteResult,
} from "../../shared/bridge";
import { CACHE_DIR } from "../backend/cache";
import { handle } from "../core/ipc";

function safeName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim() || "cleanup";
}

function handleWriteTempPng(
  _e: unknown,
  payload: TempPngWritePayload,
): TempPngWriteResult {
  const subdir = (payload.subdir || "cleanup")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .trim();
  const base = safeName(payload.name || "cleanup");
  const dir = path.join(CACHE_DIR, subdir);
  fs.mkdirSync(dir, { recursive: true });
  let file = path.join(dir, `${base}-1.png`);
  let n = 1;
  while (fs.existsSync(file)) {
    n++;
    file = path.join(dir, `${base}-${n}.png`);
  }
  fs.writeFileSync(file, Buffer.from(payload.data));
  return { path: file };
}

export function registerTempCacheHandlers(): void {
  handle(IPC.writeTempPng, handleWriteTempPng);
}
