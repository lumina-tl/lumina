/** Recents — recent projects/images store. */
import crypto from "crypto";
import { app } from "electron";
import fs from "fs";
import path from "path";
import { IPC } from "../../shared/bridge";
import type { RecentEntry, RecentKind, RecentsData } from "../../shared/bridge";
import { handle } from "../core/ipc";

const FILE_NAME = "recents.json";
const MAX_PER_KIND = 10;

interface RecentsStore {
  projects: RecentEntry[];
  images: RecentEntry[];
}

function filePath(): string {
  return path.join(app.getPath("userData"), FILE_NAME);
}

function readAll(): RecentsStore {
  try {
    const data = JSON.parse(fs.readFileSync(filePath(), "utf-8"));
    return {
      projects: Array.isArray(data?.projects) ? data.projects : [],
      images: Array.isArray(data?.images) ? data.images : [],
    };
  } catch {
    return { projects: [], images: [] };
  }
}

function writeAll(data: RecentsStore): void {
  const file = filePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, file);
}

export function saveProjectThumb(projectPath: string, data: Buffer): string {
  const dir = path.join(app.getPath("userData"), "project-thumbs");
  fs.mkdirSync(dir, { recursive: true });
  const hash = crypto.createHash("sha1").update(projectPath).digest("hex");
  const dest = path.join(dir, `${hash}.jpg`);
  fs.writeFileSync(dest, data);
  return dest;
}

function pushEntry(
  list: RecentEntry[],
  kind: RecentKind,
  p: string,
  thumbPath?: string,
): void {
  const prev = list.find((e) => e.path === p);
  const resolvedThumb =
    thumbPath ||
    (prev?.thumbPath && fs.existsSync(prev.thumbPath)
      ? prev.thumbPath
      : undefined);
  const entry: RecentEntry = {
    kind,
    path: p,
    name: path.basename(p),
    ts: Date.now(),
    ...(resolvedThumb ? { thumbPath: resolvedThumb } : {}),
  };
  const rest = list.filter((e) => e.path !== p);
  list.length = 0;
  list.push(entry, ...rest.slice(0, MAX_PER_KIND - 1));
}

export function recordRecent(
  kind: RecentKind,
  p: string,
  thumbPath?: string,
): void {
  if (!p) return;
  const data = readAll();
  pushEntry(data[kind === "project" ? "projects" : "images"], kind, p, thumbPath);
  writeAll(data);
}

function listRecents(): RecentsData {
  const data = readAll();
  const exists = (e: RecentEntry) => fs.existsSync(e.path);
  return {
    projects: data.projects.filter(exists).map((e) =>
      e.thumbPath && !fs.existsSync(e.thumbPath)
        ? { ...e, thumbPath: undefined }
        : e,
    ),
    images: data.images.filter(exists),
  };
}

export function removeRecent(p: string): void {
  const data = readAll();
  const removedThumbs = data.projects
    .filter((e) => e.path === p && e.thumbPath)
    .map((e) => e.thumbPath as string);
  data.projects = data.projects.filter((e) => e.path !== p);
  data.images = data.images.filter((e) => e.path !== p);
  writeAll(data);
  for (const t of removedThumbs) {
    const stillUsed = data.projects.some((e) => e.thumbPath === t);
    if (!stillUsed) {
      try {
        fs.unlinkSync(t);
      } catch {
        /* ignore missing */
      }
    }
  }
}

export function registerRecentHandlers(): void {
  handle(IPC.recentsList, () => listRecents());
  handle(IPC.recentsRemove, (_e, p: string) => removeRecent(String(p ?? "")));
}
