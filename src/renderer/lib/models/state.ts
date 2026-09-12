/** Shared mutable state for the model manager. */
import type { DeviceInfo, DownloadProgress, ModelInfo } from "../../types";
import type { RuntimeProgress } from "../../types";

export const SELECTED_KEY = "lumina:selectedModels";
export const USE_GPU_KEY = "lumina:useGpu";

/** Persisted GPU toggle — default ON. Applied to the backend at startup. */
export function useGpuSetting(): boolean {
  try {
    return localStorage.getItem(USE_GPU_KEY) !== "0";
  } catch {
    return true;
  }
}

export function loadSelected(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SELECTED_KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveSelected(sel: Record<string, string>): void {
  localStorage.setItem(SELECTED_KEY, JSON.stringify(sel));
}

export function el(id: string): HTMLElement | null {
  return document.getElementById(id);
}

/** Mutable shared state across the models module. */
export const s = {
  models: [] as ModelInfo[],
  hasImage: false,
  downloading: false,
  runtimeBusy: false,
  device: null as DeviceInfo | null,
  progressCbs: [] as Array<(p: DownloadProgress) => void>,
  runtimeCbs: [] as Array<(p: RuntimeProgress) => void>,
  deviceCbs: [] as Array<(d: DeviceInfo | null) => void>,
};
