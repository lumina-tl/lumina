/** Session dirty flag + active save path. */
import { state } from "../state";

let _dirty = false;
let _savePath: string | null = null;
let _listener: (() => void) | null = null;

export function setDirtyListener(cb: (() => void) | null): void {
  _listener = cb;
}

export function markDirty(): void {
  if (_dirty) return;
  _dirty = true;
  _listener?.();
}

export function clearDirty(): void {
  if (!_dirty) return;
  _dirty = false;
  _listener?.();
}

export function isDirty(): boolean {
  return _dirty;
}

export function setSavePath(p: string | null): void {
  _savePath = p;
  _listener?.();
}

export function getSavePath(): string | null {
  return _savePath;
}

/** Notify the UI without changing state (e.g. after page count changes) */
export function notifyDirtyUI(): void {
  _listener?.();
}

/* ── Status-bar + button states driven by dirty flag ── */
export function updateDirtyUI(): void {
  const el = document.getElementById("status-project");
  const path = getSavePath();
  const name = path ? (path.split(/[\\/]/).pop() as string) : "";
  if (el) el.textContent = name ? (isDirty() ? name + " •" : name) : "";
  document.title = isDirty() ? "Lumina •" : "Lumina";

  const hasPages = state.pages.length > 0;
  const saveBtn = document.getElementById("btn-save");
  const saveAsBtn = document.getElementById("btn-save-as");
  const exportBtn = document.getElementById("btn-export");
  const exportAllBtn = document.getElementById("btn-export-all");
  if (saveBtn) (saveBtn as HTMLButtonElement).disabled = !hasPages;
  if (saveAsBtn) (saveAsBtn as HTMLButtonElement).disabled = !hasPages;
  if (exportBtn) (exportBtn as HTMLButtonElement).disabled = !hasPages;
  if (exportAllBtn) (exportAllBtn as HTMLButtonElement).disabled = !hasPages;
}
