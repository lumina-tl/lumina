/** Model manager public API — composes state, selection, buttons, progress. */
import * as i18n from "../i18n";
import { describe } from "./descriptions";
import type { DeviceInfo, DownloadProgress, ModelInfo } from "../../types";
import type { RuntimeProgress } from "../../types";
import {
  s,
  useGpuSetting,
  loadSelected,
  saveSelected,
  USE_GPU_KEY,
} from "./state";
import { resolveSelected, selectedReady, allReady } from "./selection";
import { updateButtons } from "./buttons";
import { initProgressHandlers } from "./progress";

// Wire progress handlers once at import time.
initProgressHandlers();

export const models = {
  /** Fetch model registry and refresh header button states. */
  async check(): Promise<ModelInfo[]> {
    try {
      const res = await window.lumina.checkModel();
      s.models = res.models || [];
      const lang = i18n.lang();
      s.models.forEach((m) => {
        const desc = describe(m.id, lang);
        if (desc) m.description = desc;
      });
      updateButtons();
    } catch {
      /* backend not ready yet — keep last state */
    }
    return s.models;
  },

  /** Fetch device/GPU info once and notify subscribers. */
  async refreshDevice(): Promise<DeviceInfo | null> {
    try {
      if (!useGpuSetting()) {
        s.device = await window.lumina.setUseGpu(false);
      } else {
        s.device = await window.lumina.getDevice();
      }
      for (const cb of s.deviceCbs) cb(s.device);
    } catch {
      s.device = null;
    }
    return s.device;
  },

  /** Last known device info (null until refreshDevice succeeds). */
  device(): DeviceInfo | null {
    return s.device;
  },

  /** Whether the user opted into GPU acceleration (persisted). */
  useGpu(): boolean {
    return useGpuSetting();
  },

  /** Toggle GPU acceleration (live — no restart needed). */
  async setUseGpu(v: boolean): Promise<DeviceInfo | null> {
    localStorage.setItem(USE_GPU_KEY, v ? "1" : "0");
    try {
      s.device = await window.lumina.setUseGpu(v);
    } catch {
      s.device = null;
    }
    for (const cb of s.deviceCbs) cb(s.device);
    return s.device;
  },

  /** Subscribe to device info changes. Returns an unsubscribe fn. */
  onDeviceChange(cb: (d: DeviceInfo | null) => void): () => void {
    s.deviceCbs.push(cb);
    return function () {
      const i = s.deviceCbs.indexOf(cb);
      if (i >= 0) s.deviceCbs.splice(i, 1);
    };
  },

  /** True when every registered model is installed. */
  allReady(): boolean {
    return allReady();
  },

  /** True when the selected model of the given kind is installed. */
  ready(kind: string): boolean {
    return selectedReady(kind);
  },

  list(): ModelInfo[] {
    return s.models;
  },

  /** Page import state — pipeline buttons also depend on this. */
  setHasImage(v: boolean): void {
    s.hasImage = v;
    updateButtons();
  },

  /** Download the given model ids; empty array = all missing. */
  async download(ids: string[]): Promise<void> {
    await window.lumina.downloadModel(ids);
    await this.check();
  },

  /** Active model id for a kind (e.g. "inpaint" → "lama_manga"). */
  selectedModel(kind: string): string {
    return resolveSelected(kind);
  },

  setSelectedModel(kind: string, id: string): void {
    const sel = loadSelected();
    sel[kind] = id;
    saveSelected(sel);
  },

  /** Re-evaluate header buttons + warn badge from the current selection. */
  refreshButtons(): void {
    updateButtons();
  },

  /** Raw persisted pick for a kind (even if not installed yet) — for UI display. */
  pickedModel(kind: string): string {
    const sel = loadSelected();
    const list = s.models.filter((m) => m.kind === kind);
    if (!list.length) return "";
    return list.some((m) => m.id === sel[kind]) ? sel[kind] : "";
  },

  /** Subscribe to live download progress. Returns an unsubscribe fn. */
  onProgress(cb: (p: DownloadProgress) => void): () => void {
    s.progressCbs.push(cb);
    return function () {
      const i = s.progressCbs.indexOf(cb);
      if (i >= 0) s.progressCbs.splice(i, 1);
    };
  },

  /** Subscribe to CUDA runtime download progress. */
  onRuntimeProgress(cb: (p: RuntimeProgress) => void): () => void {
    const fn = (p: RuntimeProgress) => cb(p);
    s.runtimeCbs.push(fn);
    return function () {
      const i = s.runtimeCbs.indexOf(fn);
      if (i >= 0) s.runtimeCbs.splice(i, 1);
    };
  },

  /** True while a model download is in flight (auto-save skips). */
  isDownloading(): boolean {
    return s.downloading;
  },

  /** True while any download (model / CUDA runtime / app update) runs. */
  isBusy(): boolean {
    return s.downloading || s.runtimeBusy;
  },

  /** CUDA runtime install state (pull once; live via onRuntimeProgress). */
  async refreshRuntime(): Promise<void> {
    try {
      const st = await window.lumina.getRuntimeStatus();
      s.runtimeBusy = st.state === "downloading";
    } catch {
      s.runtimeBusy = false;
    }
  },
};

// After the CUDA runtime installs, main restarts the backend and pushes this
// — refresh the model registry so ready flags + GPU badges come back live.
window.lumina.onCheckModel(() => {
  void models.check().then(() => models.refreshButtons());
});
