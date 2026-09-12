/** Shared log types + ANSI formatting. */

export type LogLevel = "debug" | "info" | "warn" | "error";

export const LEVEL_NUM: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** ANSI escape per level — gray / dim / yellow / red. */
export const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: "\x1b[90m",
  info: "\x1b[0m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
};

export const RESET = "\x1b[0m";
