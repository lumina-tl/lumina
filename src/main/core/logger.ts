/** Main-process logger — direct stdout + renderer IPC handler. */
import { ipcMain } from "electron";
import { IPC } from "../../shared/bridge";
import {
  LEVEL_NUM,
  LEVEL_COLOR,
  RESET,
  type LogLevel,
} from "../../shared/logger";

const minLevel: number =
  LEVEL_NUM[(process.env.LOG_LEVEL ?? "info").toLowerCase() as LogLevel] ??
  LEVEL_NUM.info;

function ts(): string {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

function emit(level: LogLevel, tag: string, msg: string): void {
  if (LEVEL_NUM[level] < minLevel) return;
  const color = LEVEL_COLOR[level];
  const levelStr = level.toUpperCase().padEnd(5);
  const line = `${color}[${ts()}] [${levelStr}] [${tag}] ${msg}${RESET}`;
  process.stdout.write(line + "\n");
}

/** Register IPC handler so renderer logs route through main. */
export function registerLogHandler(): void {
  ipcMain.on(IPC.log, (_e, level: LogLevel, tag: string, msg: string) => {
    emit(level, tag, msg);
  });
}

/** Main-process logger — defaults to "main" tag. */
export const log = {
  debug: (msg: string, tag?: string) => emit("debug", tag ?? "main", msg),
  info: (msg: string, tag?: string) => emit("info", tag ?? "main", msg),
  warn: (msg: string, tag?: string) => emit("warn", tag ?? "main", msg),
  error: (msg: string, tag?: string) => emit("error", tag ?? "main", msg),
};
