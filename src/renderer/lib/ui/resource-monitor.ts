/**
 * Lumina Status Bar Resource Monitor
 * Real-time monitoring for CPU load, system RAM, GPU VRAM, and loaded AI models.
 */
import * as i18n from "../i18n";
import { ui } from "./index";
import { createIcons } from "./icons";

interface CpuMetrics {
  percent: number;
}

interface MemoryMetrics {
  used: number;
  total: number;
  percent: number;
  device?: string | null;
}

interface LoadedModelsMetrics {
  count: number;
  loaded: string[];
}

export interface SystemResources {
  cpu: CpuMetrics;
  ram: MemoryMetrics;
  vram?: MemoryMetrics | null;
  models: LoadedModelsMetrics;
}

let _pollTimer: ReturnType<typeof setInterval> | null = null;
let _isPopoverOpen = false;
let _latestData: SystemResources | null = null;
let _isPolling = false;

function _getBarClass(percent: number): string {
  if (percent >= 85) return "danger";
  if (percent >= 70) return "warning";
  return "";
}

/** Render content inside the popover */
function _renderPopover(data: SystemResources | null): void {
  const popover = document.getElementById("status-res-popover");
  if (!popover) return;

  if (!data) {
    popover.innerHTML = `
      <div class="flex items-center justify-center py-6 text-text-muted gap-2">
        <i data-lucide="loader-2" class="w-4 h-4 animate-spin text-lumina"></i>
        <span>${i18n.t("progress.processing")}</span>
      </div>
    `;
    createIcons({
      nameAttr: "data-lucide",
      attrs: {},
      root: popover,
    });
    return;
  }

  const hasVram = !!(data.vram && data.vram.total > 0);
  const deviceName = hasVram ? data.vram?.device || "Dedicated GPU" : "CPU / Integrated";

  const cpuPct = Math.round(data.cpu.percent);
  const ramPct = Math.round(data.ram.percent);
  const vramPct = hasVram ? Math.round(data.vram!.percent) : 0;

  const modelsCount = data.models.count;
  const modelsList = data.models.loaded;

  popover.innerHTML = `
    <div class="status-res-popover-head">
      <div class="status-res-popover-title">
        <i data-lucide="cpu" class="w-3.5 h-3.5 text-lumina"></i>
        <span>${i18n.t("resources.title")}</span>
      </div>
      <span class="status-res-popover-device" title="${deviceName}">${deviceName}</span>
    </div>

    <div class="status-res-metrics">
      <!-- CPU -->
      <div class="status-res-row">
        <div class="status-res-row-head">
          <span class="status-res-row-name">${i18n.t("resources.cpu")}</span>
          <span class="status-res-row-val">${cpuPct}%</span>
        </div>
        <div class="status-res-bar-track">
          <div class="status-res-bar-fill ${_getBarClass(cpuPct)}" style="width: ${cpuPct}%"></div>
        </div>
      </div>

      <!-- RAM -->
      <div class="status-res-row">
        <div class="status-res-row-head">
          <span class="status-res-row-name">${i18n.t("resources.ram")}</span>
          <span class="status-res-row-val">${data.ram.used.toFixed(1)} / ${data.ram.total.toFixed(1)} GB (${ramPct}%)</span>
        </div>
        <div class="status-res-bar-track">
          <div class="status-res-bar-fill ${_getBarClass(ramPct)}" style="width: ${ramPct}%"></div>
        </div>
      </div>

      <!-- VRAM (if available) -->
      ${
        hasVram
          ? `
      <div class="status-res-row">
        <div class="status-res-row-head">
          <span class="status-res-row-name">${i18n.t("resources.vram")}</span>
          <span class="status-res-row-val">${data.vram!.used.toFixed(1)} / ${data.vram!.total.toFixed(1)} GB (${vramPct}%)</span>
        </div>
        <div class="status-res-bar-track">
          <div class="status-res-bar-fill ${_getBarClass(vramPct)}" style="width: ${vramPct}%"></div>
        </div>
      </div>`
          : ""
      }
    </div>

    <!-- Loaded models -->
    <div class="status-res-models-sec">
      <div class="status-res-models-head">
        <span>${i18n.t("resources.activeModels")} (${modelsCount})</span>
        ${
          modelsCount > 0
            ? `<button class="btn dialog-btn-danger status-res-unload-btn" id="btn-unload-models">${i18n.t("resources.unloadAll")}</button>`
            : ""
        }
      </div>
      <div class="status-res-models-list">
        ${
          modelsCount > 0
            ? modelsList
                .map((m) => `<span class="status-res-model-tag">${m}</span>`)
                .join("")
            : `<span class="status-res-models-empty">${i18n.t("resources.noModels")}</span>`
        }
      </div>
    </div>
  `;

  createIcons({
    nameAttr: "data-lucide",
    attrs: {},
    root: popover,
  });

  document.getElementById("btn-unload-models")?.addEventListener("click", (e) => {
    e.stopPropagation();
    void resourceMonitor.unloadModels();
  });
}

/** Update status bar chip values */
function _updateChip(data: SystemResources): void {
  const chip = document.getElementById("status-resources");
  if (!chip) return;

  const cpuEl = document.getElementById("status-res-cpu");
  const ramEl = document.getElementById("status-res-ram");
  const vramEl = document.getElementById("status-res-vram");
  const vramSep = document.getElementById("status-res-vram-sep");
  const modelsEl = document.getElementById("status-res-models");

  if (cpuEl) cpuEl.textContent = `CPU ${Math.round(data.cpu.percent)}%`;
  if (ramEl) ramEl.textContent = `RAM ${data.ram.used.toFixed(1)}G`;

  if (data.vram && data.vram.total > 0) {
    if (vramEl) {
      vramEl.textContent = `VRAM ${data.vram.used.toFixed(1)}G`;
      vramEl.classList.remove("hidden");
    }
    if (vramSep) vramSep.classList.remove("hidden");
  } else {
    if (vramEl) vramEl.classList.add("hidden");
    if (vramSep) vramSep.classList.add("hidden");
  }

  if (modelsEl) {
    if (data.models.count > 0) {
      modelsEl.textContent = `${data.models.count} model${data.models.count > 1 ? "s" : ""}`;
      modelsEl.classList.remove("hidden");
    } else {
      modelsEl.classList.add("hidden");
    }
  }

  // Warning state
  const maxMemPct = Math.max(
    data.ram.percent,
    data.vram ? data.vram.percent : 0,
  );
  chip.classList.toggle("danger", maxMemPct >= 85);
  chip.classList.toggle("warning", maxMemPct >= 70 && maxMemPct < 85);

  if (_isPopoverOpen) {
    _renderPopover(data);
  }
}

export const resourceMonitor = {
  /** Start background polling and event handlers */
  init(): void {
    const chip = document.getElementById("status-resources");
    const popover = document.getElementById("status-res-popover");
    if (!chip || !popover) return;

    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      this.togglePopover();
    });

    popover.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    document.addEventListener("click", (e) => {
      if (
        _isPopoverOpen &&
        !(e.target as HTMLElement).closest("#status-res-popover") &&
        !(e.target as HTMLElement).closest("#status-resources")
      ) {
        this.hidePopover();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && _isPopoverOpen) {
        this.hidePopover();
      }
    });

    window.addEventListener("resize", () => {
      if (_isPopoverOpen) {
        this._updatePopoverPos();
      }
    });

    // Start polling
    this.startPolling();

    // Adjust poll interval on visibility change
    document.addEventListener("visibilitychange", () => {
      this.startPolling();
    });
  },

  startPolling(): void {
    if (_pollTimer) clearInterval(_pollTimer);
    const interval = document.hidden ? 6000 : 3000;
    _pollTimer = setInterval(() => {
      void this.poll();
    }, interval);
    void this.poll();
  },

  stopPolling(): void {
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
  },

  async poll(): Promise<void> {
    if (_isPolling) return;
    _isPolling = true;
    try {
      const res = await window.lumina.apiPost<SystemResources>(
        "/system/resources",
        {},
      );
      if (res && res.cpu && res.ram) {
        _latestData = res;
        _updateChip(res);
      }
    } catch {
      // Backend maybe loading / restarting — ignore
    } finally {
      _isPolling = false;
    }
  },

  togglePopover(): void {
    if (_isPopoverOpen) {
      this.hidePopover();
    } else {
      this.showPopover();
    }
  },

  _updatePopoverPos(): void {
    const popover = document.getElementById("status-res-popover");
    const chip = document.getElementById("status-resources");
    if (!popover || !chip) return;
    const r = chip.getBoundingClientRect();
    const bottomOffset = Math.max(8, window.innerHeight - r.top + 6);
    const rightOffset = Math.max(8, window.innerWidth - r.right);
    popover.style.bottom = `${bottomOffset}px`;
    popover.style.right = `${rightOffset}px`;
    popover.style.left = "auto";
    popover.style.top = "auto";
  },

  showPopover(): void {
    const popover = document.getElementById("status-res-popover");
    const chip = document.getElementById("status-resources");
    if (!popover || !chip) return;

    _isPopoverOpen = true;
    chip.classList.add("active");
    this._updatePopoverPos();
    popover.classList.remove("hidden");

    _renderPopover(_latestData);
    void this.poll();
  },

  hidePopover(): void {
    const popover = document.getElementById("status-res-popover");
    const chip = document.getElementById("status-resources");
    _isPopoverOpen = false;
    if (chip) chip.classList.remove("active");
    if (popover) popover.classList.add("hidden");
  },

  async unloadModels(): Promise<void> {
    try {
      await window.lumina.apiPost("/system/unload-models", {});
      ui.toast(i18n.t("resources.modelsUnloaded"), "success", 2500);
      await this.poll();
    } catch (err) {
      ui.toast(String(err), "error");
    }
  },
};
