/** Recents — recent projects/images store. */
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

function pushEntry(list: RecentEntry[], kind: RecentKind, p: string): void {
  const entry: RecentEntry = {
    kind,
    path: p,
    name: path.basename(p),
    ts: Date.now(),
  };
  const rest = list.filter((e) => e.path !== p);
  list.length = 0;
  list.push(entry, ...rest.slice(0, MAX_PER_KIND - 1));
}

export function recordRecent(kind: RecentKind, p: string): void {
  if (!p) return;
  const data = readAll();
  pushEntry(data[kind === "project" ? "projects" : "images"], kind, p);
  writeAll(data);
}

function listRecents(): RecentsData {
  const data = readAll();
  const exists = (e: RecentEntry) => fs.existsSync(e.path);
  return {
    projects: data.projects.filter(exists),
    images: data.images.filter(exists),
  };
}

export function removeRecent(p: string): void {
  const data = readAll();
  data.projects = data.projects.filter((e) => e.path !== p);
  data.images = data.images.filter((e) => e.path !== p);
  writeAll(data);
}

export function registerRecentHandlers(): void {
  handle(IPC.recentsList, () => listRecents());
  handle(IPC.recentsRemove, (_e, p: string) => removeRecent(String(p ?? "")));
}
