/** Renderer-process logger — sends to main via IPC. */
import type { LogLevel } from "../../shared/logger";

function emit(level: LogLevel, tag: string, msg: string): void {
  window.lumina.log(level, tag, msg);
}

export const log = {
  debug: (tag: string, msg: string) => emit("debug", tag, msg),
  info: (tag: string, msg: string) => emit("info", tag, msg),
  warn: (tag: string, msg: string) => emit("warn", tag, msg),
  error: (tag: string, msg: string) => emit("error", tag, msg),
};
