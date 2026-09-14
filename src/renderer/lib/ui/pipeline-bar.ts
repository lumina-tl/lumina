/**
 * Floating, draggable pipeline bar over the canvas with expandable model selectors,
 * auto-hide/dimming, minimize toggle, and run-all sequence.
 */
import * as i18n from "../i18n";
import { models } from "../models";
import {
  pipeline,
  loadPreset,
  savePreset,
  PRESETS,
  type PresetId,
} from "../pipeline";
import { translateSettings } from "../pipeline/translate";
import { settings } from "../settings/index";
import { state } from "../state";
import { canvas } from "../canvas/index";
import { createIcons } from "./icons";
import { RECOMMENDED } from "../models/descriptions";
import type { ModelInfo } from "../../types";
import { ui } from "./index";

const POS_STORAGE_KEY = "lumina-pipeline-bar-pos";
const MINIMIZED_STORAGE_KEY = "lumina-pipeline-bar-minimized";

let _bar: HTMLElement | null = null;
let _dragHandle: HTMLElement | null = null;
let _pill: HTMLElement | null = null;
let _activeDropdown: string | null = null;
let _dimTimeout: ReturnType<typeof setTimeout> | null = null;
let _hideTimer: ReturnType<typeof setTimeout> | null = null;

function _esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Save position to localStorage */
function _savePos(x: number, y: number): void {
  try {
    localStorage.setItem(POS_STORAGE_KEY, JSON.stringify({ x, y }));
  } catch {
    /* ignore */
  }
}

/** Load position from localStorage */
function _loadPos(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(POS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return null;
}

/** Position and clamp within #canvas-area bounds */
function _applyPosition(x: number, y: number): void {
  if (!_bar) return;
  const parent = _bar.parentElement;
  if (!parent) return;

  const maxLeft = Math.max(8, parent.clientWidth - _bar.offsetWidth - 8);
  const maxTop = Math.max(8, parent.clientHeight - _bar.offsetHeight - 8);

  const clampedX = Math.min(Math.max(8, x), maxLeft);
  const clampedY = Math.min(Math.max(8, y), maxTop);

  _bar.classList.add("custom-pos");
  _bar.style.left = `${clampedX}px`;
  _bar.style.top = `${clampedY}px`;
  _bar.style.transform = "none";
}

/** Set default centered position at top of workspace canvas */
function _setDefaultPosition(): void {
  if (!_bar) return;
  _bar.classList.remove("custom-pos");
  _bar.style.left = "50%";
  _bar.style.top = "12px";
  _bar.style.transform = "";
}

/** Initialize dragging behavior */
function _initDrag(): void {
  if (!_bar || !_dragHandle) return;

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initLeft = 0;
  let initTop = 0;

  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    // Don't drag if clicking buttons or dropdowns
    if (
      (e.target as HTMLElement).closest(
        "button, .pipeline-dropdown, select, input, .pipeline-sub-capsule",
      )
    ) {
      return;
    }
    isDragging = true;
    _closeDropdowns();
    _bar?.classList.add("dragging");
    startX = e.clientX;
    startY = e.clientY;
    initLeft = _bar?.offsetLeft ?? 0;
    initTop = _bar?.offsetTop ?? 0;
    if (_bar) {
      _bar.classList.add("custom-pos");
      _bar.style.transform = "none";
      _bar.style.left = `${initLeft}px`;
      _bar.style.top = `${initTop}px`;
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    e.preventDefault();
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!isDragging || !_bar) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    _applyPosition(initLeft + dx, initTop + dy);
  };

  const onMouseUp = () => {
    if (!isDragging || !_bar) return;
    isDragging = false;
    _bar.classList.remove("dragging");
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    _savePos(_bar.offsetLeft, _bar.offsetTop);
  };

  _dragHandle.addEventListener("mousedown", onMouseDown);
}

/** Minimize / Expand toggle with smooth animation */
function _setMinimized(min: boolean): void {
  if (!_bar) return;
  _closeDropdowns();
  if (_hideTimer) {
    clearTimeout(_hideTimer);
    _hideTimer = null;
  }

  const restoreBtn = document.getElementById("btn-pipeline-restore");

  if (min) {
    localStorage.setItem(MINIMIZED_STORAGE_KEY, "1");
    _bar.classList.add("minimized-state");
    restoreBtn?.classList.remove("hidden");
    if (restoreBtn) createIcons({ root: restoreBtn });

    // Instantly transition active toast to Header Dynamic Island
    ui.syncToastPlacement();

    _hideTimer = setTimeout(() => {
      _bar?.classList.add("hidden");
    }, 220);
  } else {
    localStorage.setItem(MINIMIZED_STORAGE_KEY, "0");
    restoreBtn?.classList.add("hidden");

    _bar.classList.remove("hidden");
    // Force layout reflow before removing minimized-state for transition to trigger
    void _bar.offsetWidth;
    _bar.classList.remove("minimized-state");

    // Instantly transition active toast to Docked Sub-Capsule
    ui.syncToastPlacement();
  }
}

/** Close all model dropdown popovers */
function _closeDropdowns(): void {
  _activeDropdown = null;
  document.querySelectorAll(".pipeline-dropdown").forEach((el) => {
    el.classList.add("hidden");
    el.innerHTML = "";
  });
  document.querySelectorAll(".pipeline-chevron").forEach((el) => {
    el.classList.remove("active");
  });
}

/* ── Pipeline Preset ── */

const _presetLabels: Record<string, string> = {
  full: "Full Pipeline",
  clean: "Clean Only",
};

function _updatePresetLabel(): void {
  const label = document.getElementById("btn-pipeline-all-label");
  const id = loadPreset();
  if (label) label.textContent = _presetLabels[id] || "Full Pipeline";
}

function _togglePresetDropdown(btn: HTMLElement): void {
  const dropdown = document.getElementById("dropdown-preset");
  if (!dropdown) return;

  if (_activeDropdown === "preset") {
    _closeDropdowns();
    return;
  }

  _closeDropdowns();
  _activeDropdown = "preset";
  btn.classList.add("active");
  dropdown.classList.remove("hidden");

  const current = loadPreset();
  let html = `<div class="pipeline-dropdown-header">
    <span>Pipeline Preset</span>
  </div>
  <div class="pipeline-dropdown-list">`;

  for (const p of PRESETS) {
    const isSelected = p.id === current;
    html += `
      <div class="pipeline-dropdown-item ${isSelected ? "selected" : ""}" data-preset-id="${_esc(p.id)}">
        <div class="pipeline-item-check">
          ${isSelected ? '<i data-lucide="check" class="w-3.5 h-3.5 text-lumina"></i>' : ""}
        </div>
        <div class="pipeline-item-name">${_esc(p.label)}</div>
      </div>`;
  }

  html += `</div>`;
  dropdown.innerHTML = html;

  dropdown.querySelectorAll(".pipeline-dropdown-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      const presetId = item.getAttribute("data-preset-id") as PresetId | null;
      if (!presetId) return;
      savePreset(presetId);
      _updatePresetLabel();
      _closeDropdowns();
    });
  });

  createIcons({ root: dropdown });
}

/** Render and toggle dropdown popover */
function _toggleDropdown(
  kind: "detect" | "ocr" | "translate" | "inpaint",
  btn: HTMLElement,
): void {
  const dropdown = document.getElementById(`dropdown-${kind}`);
  if (!dropdown) return;

  if (_activeDropdown === kind) {
    _closeDropdowns();
    return;
  }

  _closeDropdowns();
  _activeDropdown = kind;
  btn.classList.add("active");
  dropdown.classList.remove("hidden");

  if (kind === "translate") {
    _renderTranslateDropdown(dropdown);
  } else {
    _renderModelDropdown(kind, dropdown);
  }

  createIcons({ root: dropdown });
}

/** Render Model Picker Dropdown (Detect, OCR, Inpaint) */
function _renderModelDropdown(
  kind: "detect" | "ocr" | "inpaint",
  root: HTMLElement,
): void {
  const list = models.list().filter((m) => m.kind === kind);
  const current = models.selectedModel(kind);
  const recId = RECOMMENDED[kind] || "";

  const titleMap: Record<string, string> = {
    detect: i18n.t("models.tabDetect") || "Detection Models",
    ocr: i18n.t("models.tabOcr") || "OCR Models",
    inpaint: i18n.t("models.tabInpaint") || "Inpainting Models",
  };

  let html = `<div class="pipeline-dropdown-header">
    <span>${_esc(titleMap[kind])}</span>
  </div>
  <div class="pipeline-dropdown-list">`;

  if (list.length === 0) {
    html += `<div class="pipeline-dropdown-empty">No models available</div>`;
  } else {
    for (const m of list) {
      const isSelected = m.id === current;
      const isRec = m.id === recId;
      const isReady = m.ready;

      html += `
        <div class="pipeline-dropdown-item ${isSelected ? "selected" : ""}" data-model-id="${_esc(m.id)}" data-ready="${isReady}">
          <div class="pipeline-item-check">
            ${isSelected ? '<i data-lucide="check" class="w-3.5 h-3.5 text-lumina"></i>' : ""}
          </div>
          <div class="pipeline-item-name">
            ${_esc(m.name)}
            ${isRec ? '<span class="pipeline-badge pipeline-badge-rec">REC</span>' : ""}
          </div>
          <div class="pipeline-item-status">
            ${
              isReady
                ? '<span class="pipeline-badge pipeline-badge-ready">Ready</span>'
                : '<span class="pipeline-badge pipeline-badge-dl"><i data-lucide="download" class="w-3 h-3"></i> Get</span>'
            }
          </div>
        </div>
      `;
    }
  }

  html += `</div>
  <div class="pipeline-dropdown-footer">
    <button class="pipeline-dropdown-link" id="link-open-model-settings">
      <i data-lucide="settings" class="w-3 h-3"></i>
      <span>Manage Models...</span>
    </button>
  </div>`;

  root.innerHTML = html;

  // Item click handling
  root.querySelectorAll(".pipeline-dropdown-item").forEach((item) => {
    item.addEventListener("click", async (e) => {
      e.stopPropagation();
      const modelId = item.getAttribute("data-model-id");
      const ready = item.getAttribute("data-ready") === "true";
      if (!modelId) return;

      if (ready) {
        models.setSelectedModel(kind, modelId);
        models.refreshButtons();
        _closeDropdowns();
      } else {
        // Download model
        _closeDropdowns();
        await models.download([modelId]);
      }
    });
  });

  root
    .querySelector("#link-open-model-settings")
    ?.addEventListener("click", (e) => {
      e.stopPropagation();
      _closeDropdowns();
      settings.open("models");
    });
}

/** Render Translation Provider Dropdown */
function _renderTranslateDropdown(root: HTMLElement): void {
  const cfg = translateSettings.load();
  const currentProvider = cfg.provider || "gemini";

  const providers = [
    {
      id: "gemini",
      name: "Google Gemini",
      sub: cfg.geminiModel || "gemini-2.0-flash",
    },
    {
      id: "openrouter",
      name: "OpenRouter",
      sub: cfg.openrouterModel || "openai/gpt-4o-mini",
    },
    { id: "grok", name: "xAI Grok", sub: cfg.grokModel || "grok-3" },
    {
      id: "custom",
      name: "Custom LLM",
      sub: cfg.llmModel || "openai-compatible",
    },
  ];

  let html = `<div class="pipeline-dropdown-header">
    <span>${_esc(i18n.t("translate.provider") || "Translation Provider")}</span>
  </div>
  <div class="pipeline-dropdown-list">`;

  for (const p of providers) {
    const isSelected = p.id === currentProvider;
    html += `
      <div class="pipeline-dropdown-item ${isSelected ? "selected" : ""}" data-provider-id="${_esc(p.id)}">
        <div class="pipeline-item-check">
          ${isSelected ? '<i data-lucide="check" class="w-3.5 h-3.5 text-lumina"></i>' : ""}
        </div>
        <div class="pipeline-item-name">${_esc(p.name)}</div>
      </div>
    `;
  }

  html += `</div>
  <div class="pipeline-dropdown-footer">
    <button class="pipeline-dropdown-link" id="link-open-trans-settings">
      <i data-lucide="settings" class="w-3 h-3"></i>
      <span>Translation Settings...</span>
    </button>
  </div>`;

  root.innerHTML = html;

  root.querySelectorAll(".pipeline-dropdown-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      const providerId = item.getAttribute("data-provider-id") as
        | "gemini"
        | "openrouter"
        | "grok"
        | "custom";
      if (providerId) {
        cfg.provider = providerId;
        translateSettings.save(cfg);
        _closeDropdowns();
      }
    });
  });

  root
    .querySelector("#link-open-trans-settings")
    ?.addEventListener("click", (e) => {
      e.stopPropagation();
      _closeDropdowns();
      settings.open("translate");
    });
}

/** Wire auto-hide / dimming when user interacts with canvas */
function _initAutoHide(): void {
  const canvasContainer = document.getElementById("canvas-container");
  if (!canvasContainer || !_bar) return;

  const setDimmed = (dim: boolean) => {
    if (!_bar) return;
    if (dim) {
      // Don't dim if hovering directly over pipeline bar
      if (_bar.matches(":hover")) return;
      _bar.classList.add("dimmed");
    } else {
      _bar.classList.remove("dimmed");
    }
  };

  canvasContainer.addEventListener("pointerdown", () => {
    setDimmed(true);
  });

  document.addEventListener("pointerup", () => {
    if (_dimTimeout) clearTimeout(_dimTimeout);
    _dimTimeout = setTimeout(() => setDimmed(false), 200);
  });

  _bar.addEventListener("mouseenter", () => {
    setDimmed(false);
  });
}

export const pipelineBar = {
  /** Initialize floating bar */
  init(): void {
    _bar = document.getElementById("pipeline-bar");
    if (!_bar) return;

    _dragHandle = _bar.querySelector(".pipeline-drag-handle");
    _pill = _bar.querySelector(".pipeline-bar-pill");

    _initDrag();
    _initAutoHide();

    // Restore position
    const saved = _loadPos();
    if (saved) {
      _applyPosition(saved.x, saved.y);
    } else {
      _setDefaultPosition();
    }

    // Restore minimized state
    const isMin = localStorage.getItem(MINIMIZED_STORAGE_KEY) === "1";
    if (isMin) {
      _setMinimized(true);
    }

    // Minimize button on floating bar
    _bar
      .querySelector("#btn-pipeline-minimize")
      ?.addEventListener("click", (e) => {
        e.stopPropagation();
        _setMinimized(true);
      });

    // Restore button in header right
    const restoreBtn = document.getElementById("btn-pipeline-restore");
    restoreBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      _setMinimized(false);
    });

    // Model dropdown triggers
    const kinds: Array<"detect" | "ocr" | "translate" | "inpaint"> = [
      "detect",
      "ocr",
      "translate",
      "inpaint",
    ];
    kinds.forEach((k) => {
      const chevron = _bar?.querySelector(
        `#btn-${k}-model`,
      ) as HTMLElement | null;
      if (chevron) {
        chevron.addEventListener("click", (e) => {
          e.stopPropagation();
          _toggleDropdown(k, chevron);
        });
      }
    });

    // Run pipeline preset button
    const allBtn = _bar.querySelector("#btn-pipeline-all");
    allBtn?.addEventListener("click", async () => {
      _closeDropdowns();
      await pipeline.runPreset(loadPreset());
    });

    // Preset dropdown chevron
    const presetChevron = _bar.querySelector(
      "#btn-pipeline-preset-chevron",
    ) as HTMLElement | null;
    if (presetChevron) {
      presetChevron.addEventListener("click", (e) => {
        e.stopPropagation();
        _togglePresetDropdown(presetChevron);
      });
    }

    // Set initial label
    _updatePresetLabel();

    // Close dropdowns on outside click or escape
    document.addEventListener("click", (e) => {
      if (!(e.target as HTMLElement).closest("#pipeline-bar")) {
        _closeDropdowns();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        _closeDropdowns();
      }
    });

    window.addEventListener("resize", () => {
      const saved = _loadPos();
      if (_bar && saved) {
        _applyPosition(saved.x, saved.y);
      }
    });

    createIcons({ root: _bar });
  },

  /** Show pipeline bar or restore button when canvas/image is active */
  show(): void {
    if (!_bar) return;
    const isMin = localStorage.getItem(MINIMIZED_STORAGE_KEY) === "1";
    const restoreBtn = document.getElementById("btn-pipeline-restore");
    if (isMin) {
      _bar.classList.add("hidden");
      _bar.classList.add("minimized-state");
      restoreBtn?.classList.remove("hidden");
      if (restoreBtn) createIcons({ root: restoreBtn });
    } else {
      restoreBtn?.classList.add("hidden");
      _bar.classList.remove("hidden");
      void _bar.offsetWidth;
      _bar.classList.remove("minimized-state");
      if (!_bar.classList.contains("custom-pos")) {
        _setDefaultPosition();
      }
    }
    ui.syncToastPlacement();
  },

  /** Hide pipeline bar and restore button (e.g. on landing screen) */
  hide(): void {
    if (!_bar) return;
    _closeDropdowns();
    _bar.classList.add("hidden");
    document.getElementById("btn-pipeline-restore")?.classList.add("hidden");
    ui.syncToastPlacement();
  },

  /** Set minimized mode manually */
  setMinimized(min: boolean): void {
    _setMinimized(min);
  },
};
