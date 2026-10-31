/** Lumina UI Helpers */
import { state } from "../state";
import * as i18n from "../i18n";
import { canvas } from "../canvas/index";
import { createIcons } from "./icons";
import {
  showConfirm,
  showConfirmDiscard,
  showDialog,
  type ConfirmOptions,
  type ConfirmDiscardOptions,
  type DiscardChoice,
  type ShowDialogOptions,
  type DialogButton,
} from "./dialog";

type ToastType = "info" | "warn" | "error" | "success" | "running";

interface ToastEl extends HTMLDivElement {
  _timer?: ReturnType<typeof setTimeout> | null;
}

interface ActiveToastState {
  msg: string;
  type: ToastType;
  duration: number;
  endTime: number;
}

/** Format bytes as human-readable size */
function _fmtSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes >= 1024 * 1024 * 1024)
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return Math.round(bytes / 1024) + " KB";
}

/** Rolling window of samples for download speed estimate */
let _dlSamples: Array<{ t: number; b: number }> = [];

let _currentToast: ActiveToastState | null = null;
let _toastTimer: ReturnType<typeof setTimeout> | null = null;

const toastIconNames: Record<ToastType, string> = {
  info: "info",
  warn: "alert-triangle",
  error: "circle-x",
  success: "circle-check",
  running: "loader-2",
};

function _esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hideDynamicIsland(immediate: boolean = false): void {
  const island = document.getElementById("dynamic-island");
  if (!island) return;
  island.classList.remove("active");
  if (immediate) {
    island.classList.add("hidden");
  } else {
    setTimeout(() => {
      if (!island.classList.contains("active")) {
        island.classList.add("hidden");
      }
    }, 120);
  }
}

function hidePipelineSubCapsule(immediate: boolean = false): void {
  const capsule = document.getElementById("pipeline-sub-capsule");
  if (!capsule) return;
  capsule.classList.remove("active");
  if (immediate) {
    capsule.classList.add("hidden");
  } else {
    setTimeout(() => {
      if (!capsule.classList.contains("active")) {
        capsule.classList.add("hidden");
      }
    }, 120);
  }
}

function renderDynamicIsland(msg: string, type: ToastType): void {
  const island = document.getElementById("dynamic-island");
  const actionsEl = document.getElementById("dynamic-island-actions");
  if (!island || !actionsEl) return;

  island.className = `dynamic-island active type-${type}`;
  island.classList.remove("hidden");

  const iconName = toastIconNames[type] || "info";
  const iconWrap = island.querySelector<HTMLElement>(".dynamic-island-content");
  if (iconWrap) {
    iconWrap.innerHTML = `<i class="dynamic-island-icon" data-lucide="${iconName}"></i><span class="dynamic-island-text" id="dynamic-island-text">${_esc(msg)}</span>`;
  }

  actionsEl.innerHTML = "";
  if (type === "error") {
    const copyBtn = document.createElement("button");
    copyBtn.className = "dynamic-island-btn copy-btn";
    copyBtn.title = "Copy error message";
    copyBtn.innerHTML = '<i data-lucide="copy"></i><span>Copy</span>';
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (navigator.clipboard) {
        navigator.clipboard.writeText(msg).then(() => {
          copyBtn.innerHTML =
            '<i data-lucide="check" class="text-emerald-400"></i><span>Copied!</span>';
          createIcons({ nameAttr: "data-lucide", attrs: {}, root: copyBtn });
          setTimeout(() => {
            copyBtn.innerHTML = '<i data-lucide="copy"></i><span>Copy</span>';
            createIcons({ nameAttr: "data-lucide", attrs: {}, root: copyBtn });
          }, 1500);
        });
      }
    });
    actionsEl.appendChild(copyBtn);

    const closeBtn = document.createElement("button");
    closeBtn.className = "dynamic-island-btn close-btn";
    closeBtn.title = "Dismiss";
    closeBtn.innerHTML = '<i data-lucide="x"></i>';
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      ui.dismissToast(null);
    });
    actionsEl.appendChild(closeBtn);
  } else if (type !== "running") {
    const closeBtn = document.createElement("button");
    closeBtn.className = "dynamic-island-btn close-btn";
    closeBtn.title = "Dismiss";
    closeBtn.innerHTML = '<i data-lucide="x"></i>';
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      ui.dismissToast(null);
    });
    actionsEl.appendChild(closeBtn);
  }

  createIcons({ nameAttr: "data-lucide", attrs: {}, root: island });
}

function renderPipelineSubCapsule(msg: string, type: ToastType): void {
  const bar = document.getElementById("pipeline-bar");
  const capsule = document.getElementById("pipeline-sub-capsule");
  const textEl = document.getElementById("pipeline-sub-text");
  const actionsEl = document.getElementById("pipeline-sub-actions");
  if (!capsule || !textEl || !actionsEl) return;

  // Only show sub-capsule if pipeline bar is active and not minimized
  if (
    !bar ||
    bar.classList.contains("hidden") ||
    bar.classList.contains("minimized-state")
  ) {
    hidePipelineSubCapsule(true);
    return;
  }

  capsule.className = `pipeline-sub-capsule active type-${type}`;
  capsule.classList.remove("hidden");

  const iconName = toastIconNames[type] || "info";
  const iconEl = capsule.querySelector<HTMLElement>(".sub-capsule-icon");
  if (iconEl) {
    iconEl.setAttribute("data-lucide", iconName);
  }
  textEl.textContent = msg;

  actionsEl.innerHTML = "";
  if (type === "error") {
    const copyBtn = document.createElement("button");
    copyBtn.className = "sub-capsule-btn";
    copyBtn.title = "Copy error";
    copyBtn.innerHTML = '<i data-lucide="copy"></i>';
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (navigator.clipboard) {
        navigator.clipboard.writeText(msg).then(() => {
          copyBtn.innerHTML =
            '<i data-lucide="check" class="text-emerald-400"></i>';
          createIcons({ nameAttr: "data-lucide", attrs: {}, root: copyBtn });
          setTimeout(() => {
            copyBtn.innerHTML = '<i data-lucide="copy"></i>';
            createIcons({ nameAttr: "data-lucide", attrs: {}, root: copyBtn });
          }, 1500);
        });
      }
    });
    actionsEl.appendChild(copyBtn);

    const closeBtn = document.createElement("button");
    closeBtn.className = "sub-capsule-btn";
    closeBtn.title = "Dismiss";
    closeBtn.innerHTML = '<i data-lucide="x"></i>';
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      ui.dismissToast(null);
    });
    actionsEl.appendChild(closeBtn);
  }

  createIcons({ nameAttr: "data-lucide", attrs: {}, root: capsule });
}

function _applyToastPlacement(immediate: boolean = false): void {
  if (!_currentToast) {
    hideDynamicIsland(immediate);
    hidePipelineSubCapsule(immediate);
    return;
  }

  const bar = document.getElementById("pipeline-bar");
  const isDockedActive =
    bar &&
    !bar.classList.contains("hidden") &&
    !bar.classList.contains("minimized-state");

  if (isDockedActive) {
    hideDynamicIsland(true);
    renderPipelineSubCapsule(_currentToast.msg, _currentToast.type);
  } else {
    hidePipelineSubCapsule(true);
    renderDynamicIsland(_currentToast.msg, _currentToast.type);
  }
}

export const ui = {
  showProgress(show: boolean): void {
    const el = document.getElementById("progress-overlay");
    if (el) el.classList.toggle("show", show);
  },
  setActive(id: string): void {
    const el = document.getElementById(id);
    if (el) el.className = "step active";
  },
  setDone(id: string): void {
    const el = document.getElementById(id);
    if (el) el.className = "step done";
  },

  /** Show detection step in progress overlay */
  showStep(id: string): void {
    ui.showProgress(true);
    ui.setActive(id);
  },

  /** Show toast notification — routes to Sub-Capsule if Pipeline bar is docked, or Dynamic Island if minimized/hidden */
  toast(msg: string, type?: ToastType, duration?: number): ToastEl {
    type = type || "info"; // info | warn | error | success | running
    if (duration == null) duration = type === "error" ? 12000 : 3500;

    if (_toastTimer) {
      clearTimeout(_toastTimer);
      _toastTimer = null;
    }

    _currentToast = {
      msg,
      type,
      duration,
      endTime: duration > 0 ? Date.now() + duration : 0,
    };

    _applyToastPlacement(true);

    const toastHandle = document.createElement("div") as ToastEl;
    toastHandle.textContent = msg;

    if (duration > 0) {
      _toastTimer = setTimeout(() => {
        ui.dismissToast(null);
      }, duration);
      toastHandle._timer = _toastTimer;
    }

    return toastHandle;
  },

  /** Update message of currently active toast */
  updateToast(toast: ToastEl | null, msg: string): void {
    if (toast) toast.textContent = msg;
    if (_currentToast) {
      _currentToast.msg = msg;
      const islandText = document.getElementById("dynamic-island-text");
      if (islandText) islandText.textContent = msg;
      const subText = document.getElementById("pipeline-sub-text");
      if (subText) subText.textContent = msg;
    }
  },

  /** Dismiss active toast */
  dismissToast(toast: ToastEl | null): void {
    if (_toastTimer) {
      clearTimeout(_toastTimer);
      _toastTimer = null;
    }
    if (toast && toast._timer) {
      clearTimeout(toast._timer);
    }
    _currentToast = null;

    hideDynamicIsland(false);
    hidePipelineSubCapsule(false);
  },

  /** Sync toast placement instantly on bar state changes (minimize / restore / show / hide) */
  syncToastPlacement(): void {
    _applyToastPlacement(true);
  },

  /** Bottom-right download notification with progress bar.
   *  Returns element; update via updateDownloadToast().
   *  Pass onCancel to show a cancel button in the bar. */
  downloadToast(msg: string, onCancel?: () => void): HTMLElement {
    // Remove stale download toast if any
    const old = document.getElementById("dl-toast");
    if (old) old.remove();

    let container = document.getElementById("toast-container-br");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container-br";
      document.body.appendChild(container);
    }

    const el = document.createElement("div");
    el.id = "dl-toast";
    el.className = "dl-toast";
    el.innerHTML =
      '<div class="dl-toast-content">' +
      '<div class="dl-header">' +
      '<div class="dl-header-left">' +
      '<i data-lucide="loader-2" class="dl-icon-spinner"></i>' +
      '<span class="dl-title" id="dl-msg">' +
      _esc(msg) +
      "</span>" +
      "</div>" +
      '<div class="dl-header-right">' +
      '<span class="dl-pct" id="dl-pct">0%</span>' +
      '<button class="dl-action-btn" id="dl-minimize" title="' +
      _esc(i18n.t("toast.minimizeDownload")) +
      '"><i data-lucide="chevron-down" class="w-3.5 h-3.5"></i></button>' +
      (onCancel
        ? '<button class="dl-action-btn btn-cancel" id="dl-cancel" title="' +
          _esc(i18n.t("toast.cancelDownload")) +
          '"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>'
        : "") +
      "</div>" +
      "</div>" +
      '<div class="dl-track">' +
      '<div class="dl-bar" id="dl-bar"></div>' +
      "</div>" +
      '<div class="dl-meta">' +
      '<span id="dl-progress-size">0 KB / 0 KB</span>' +
      '<span id="dl-speed"></span>' +
      "</div>" +
      "</div>";

    const statusDl = document.getElementById("status-download");
    const statusLabel = document.getElementById("status-dl-label");
    const statusPct = document.getElementById("status-dl-pct");
    const statusSpeed = document.getElementById("status-dl-speed");

    if (statusLabel) statusLabel.textContent = msg;
    if (statusPct) statusPct.textContent = "0%";
    if (statusSpeed) statusSpeed.textContent = "";
    if (statusDl) {
      statusDl.classList.add("hidden");
      statusDl.onclick = () => {
        statusDl.classList.add("hidden");
        el.classList.remove("hidden");
        requestAnimationFrame(() => el.classList.add("show"));
      };
    }

    const minBtn = el.querySelector<HTMLButtonElement>("#dl-minimize");
    minBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      el.classList.remove("show");
      el.classList.add("hidden");
      if (statusDl) statusDl.classList.remove("hidden");
    });

    if (onCancel) {
      const cancelBtn = el.querySelector<HTMLButtonElement>("#dl-cancel");
      cancelBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        cancelBtn.disabled = true;
        onCancel();
      });
    }

    container.appendChild(el);
    createIcons({ nameAttr: "data-lucide", attrs: {}, root: el });
    requestAnimationFrame(() => {
      el.classList.add("show");
    });
    return el;
  },

  /** Dismiss active download toast with transition */
  dismissDownloadToast(): void {
    const statusDl = document.getElementById("status-download");
    if (statusDl) statusDl.classList.add("hidden");

    const el = document.getElementById("dl-toast");
    if (!el) return;
    el.classList.remove("show");
    setTimeout(() => {
      el.remove();
    }, 220);
  },

  /** Update the active download toast progress */
  updateDownloadToast(
    progress: number,
    downloaded: number,
    total: number,
  ): void {
    const pctText = Math.round(progress || 0) + "%";
    const statusPct = document.getElementById("status-dl-pct");
    if (statusPct) statusPct.textContent = pctText;

    const el = document.getElementById("dl-toast");
    const pctEl = document.getElementById("dl-pct");
    const barEl = document.getElementById("dl-bar");
    const sizeEl = document.getElementById("dl-progress-size");
    const speedEl = document.getElementById("dl-speed");
    const statusSpeed = document.getElementById("status-dl-speed");

    if (pctEl) pctEl.textContent = pctText;
    if (barEl) barEl.style.width = Math.min(100, progress || 0) + "%";
    if (sizeEl && total > 0) {
      sizeEl.textContent = _fmtSize(downloaded) + " / " + _fmtSize(total);
    }
    if (speedEl || statusSpeed) {
      const now = Date.now();
      _dlSamples.push({ t: now, b: downloaded });
      // keep ~5s window
      while (_dlSamples.length > 1 && now - _dlSamples[0].t > 5000) {
        _dlSamples.shift();
      }
      const first = _dlSamples[0];
      const dt = (now - first.t) / 1000;
      if (dt >= 1 && downloaded >= first.b) {
        const speedStr = _fmtSize((downloaded - first.b) / dt) + "/s";
        if (speedEl) speedEl.textContent = speedStr;
        if (statusSpeed) statusSpeed.textContent = "(" + speedStr + ")";
      }
    }
  },

  /** Show error in status bar */
  showError(msg: string): void {
    const el = document.getElementById("status-detections");
    if (el) {
      const orig = el.textContent;
      el.textContent = i18n.t("error.prefix", { message: msg });
      el.classList.add("text-red-500");
      setTimeout(() => {
        el.textContent = orig;
        el.classList.remove("text-red-500");
      }, 4000);
    }
  },

  /** Re-render canvas on window resize */
  initResize(): void {
    window.addEventListener("resize", () => {
      if (canvas.getStage()) {
        if (state._resizeTimer) clearTimeout(state._resizeTimer);
        state._resizeTimer = setTimeout(() => {
          canvas.render();
        }, 150);
      }
    });
  },

  /** Update zoom display (status bar + overlay control).
   *  Zoom 1 = "fit", so show actual % relative to 100% = natural size. */
  updateZoom(): void {
    const fitRatio = canvas.getBaseScaleRatio();
    const pct = Math.round((state._zoomLevel || 1) * fitRatio * 100) + "%";
    const el = document.getElementById("status-zoom");
    if (el) el.textContent = pct;
    const val = document.getElementById("zoom-value");
    if (val) val.textContent = pct;
  },

  /** Update page indicator */
  updatePageIndicator(): void {
    const el = document.getElementById("page-indicator");
    const page = state.getActivePage();
    if (!page) {
      if (el) el.classList.add("hidden");
      return;
    }
    const total = state.pages.length;
    const idx = (state.activePageIdx as number) + 1;
    if (el) {
      el.textContent = idx + " / " + total;
      el.classList.toggle("hidden", total <= 1);
    }
    // Zoom controls visible when a page is loaded
    const zoomCtl = document.getElementById("zoom-controls");
    if (zoomCtl) zoomCtl.classList.remove("hidden");
    // Update status page
    const statusPage = document.getElementById("status-page");
    if (statusPage) {
      statusPage.textContent =
        page.fileName +
        " (" +
        page.naturalWidth +
        "×" +
        page.naturalHeight +
        ")";
    }
  },

  /** Modal confirmation dialog */
  confirm: showConfirm,

  /** Unsaved changes confirmation dialog */
  confirmDiscard: showConfirmDiscard,

  /** Generic modal dialog */
  dialog: showDialog,
};

export {
  showConfirm,
  showConfirmDiscard,
  showDialog,
  type ConfirmOptions,
  type ConfirmDiscardOptions,
  type DiscardChoice,
  type ShowDialogOptions,
  type DialogButton,
};
