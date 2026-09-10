/** Fonts — scan system fonts. */
import fs from "fs";
import path from "path";
import { IPC } from "../../shared/bridge";
import type { FontInfo } from "../../shared/bridge";
import { handle } from "../core/ipc";

function readMeta(
  buf: Buffer,
  numTables: number,
  dirOffset: number,
): { weight: number; italic: boolean } {
  let weight = 400;
  let italic = false;
  for (let i = 0; i < numTables; i++) {
    const off = dirOffset + i * 16;
    if (buf.slice(off, off + 4).toString() === "OS/2") {
      const tableOff = buf.readUInt32BE(off + 8);
      weight = buf.readUInt16BE(tableOff + 4);
      italic = (buf.readUInt16BE(tableOff + 62) & 1) === 1;
      break;
    }
  }
  return { weight, italic };
}

function readFamily(filePath: string): string | null {
  try {
    const buf = fs.readFileSync(filePath);
    let dirOffset = 12;
    if (buf.slice(0, 4).toString() === "ttcf") {
      dirOffset = buf.readUInt32BE(12) + 12;
    }
    const numTables = buf.readUInt16BE(dirOffset - 8);
    for (let i = 0; i < numTables; i++) {
      const off = dirOffset + i * 16;
      if (buf.slice(off, off + 4).toString() !== "name") continue;
      const nameOff = buf.readUInt32BE(off + 8);
      const count = buf.readUInt16BE(nameOff + 2);
      const strOff = nameOff + buf.readUInt16BE(nameOff + 4);
      for (let j = 0; j < count; j++) {
        const rec = nameOff + 6 + j * 12;
        if (buf.readUInt16BE(rec + 6) !== 1) continue;
        const len = buf.readUInt16BE(rec + 8);
        const o = buf.readUInt16BE(rec + 10);
        const platform = buf.readUInt16BE(rec);
        return platform === 3 || platform === 0
          ? buf
              .slice(strOff + o, strOff + o + len)
              .swap16()
              .toString("utf16le")
          : buf.slice(strOff + o, strOff + o + len).toString("latin1");
      }
      break;
    }
  } catch {
    /* unreadable — fallback filename */
  }
  return null;
}

function fontDirs(): string[] {
  const dirs: string[] = [];
  if (process.platform === "win32") {
    dirs.push(path.join(process.env.WINDIR || "C:\\Windows", "Fonts"));
    const local = path.join(
      process.env.LOCALAPPDATA || "",
      "Microsoft",
      "Windows",
      "Fonts",
    );
    if (fs.existsSync(local)) dirs.push(local);
  } else if (process.platform === "darwin") {
    dirs.push("/Library/Fonts", "/System/Library/Fonts");
    if (process.env.HOME)
      dirs.push(path.join(process.env.HOME, "Library", "Fonts"));
  } else {
    dirs.push("/usr/share/fonts", "/usr/local/share/fonts");
    if (process.env.HOME) dirs.push(path.join(process.env.HOME, ".fonts"));
  }
  return dirs;
}

function scanFonts(): FontInfo[] {
  const fonts: FontInfo[] = [];
  const seen = new Set<string>();
  const validExts = new Set([".ttf", ".otf"]);
  const pushFile = (filePath: string, fallback: string) => {
    try {
      const buf = fs.readFileSync(filePath);
      const family = readFamily(filePath) || fallback;
      const meta = readMeta(buf, buf.readUInt16BE(4), 12);
      const key = `${family}|${meta.weight}|${meta.italic}`;
      if (!seen.has(key)) {
        seen.add(key);
        fonts.push({ family, path: filePath, ...meta });
      }
    } catch {
      fonts.push({
        family: fallback,
        path: filePath,
        weight: 400,
        italic: false,
      });
    }
  };
  for (const dir of fontDirs()) {
    let entries: import("fs").Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isFile()) {
        if (!validExts.has(path.extname(entry.name).toLowerCase())) continue;
        pushFile(
          path.join(dir, entry.name),
          entry.name.replace(/\.[^.]+$/, ""),
        );
      } else if (entry.isDirectory()) {
        let sub: import("fs").Dirent[];
        try {
          sub = fs.readdirSync(path.join(dir, entry.name), {
            withFileTypes: true,
          });
        } catch {
          continue;
        }
        for (const s of sub) {
          if (!s.isFile()) continue;
          if (!validExts.has(path.extname(s.name).toLowerCase())) continue;
          pushFile(
            path.join(dir, entry.name, s.name),
            s.name.replace(/\.[^.]+$/, ""),
          );
        }
      }
    }
  }
  fonts.sort((a, b) => a.family.localeCompare(b.family));
  return fonts;
}

export function registerFontHandlers(): void {
  handle(IPC.getFonts, async () => scanFonts());
}
