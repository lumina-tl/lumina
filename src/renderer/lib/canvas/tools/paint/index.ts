/** Paint tool — public entry point & stage interactions. */
import { state } from "../../../state";
import { canvas } from "../../index";
import { tools } from "../../../ui/tools";
import { setSliderFill } from "../../../ui/slider";
import { setPaintColor, stageToImg, paintSettings } from "./shared";
import { isPaintTool } from "./guard";
import { sampleComposite } from "./sampler";
import {
  updateCursor,
  hideCursor,
  refreshCursor,
  showSampleChip,
  hideSampleChip,
} from "./cursor";
import { handleBucket } from "./bucket";
import { handleStroke } from "./stroke";
import { clearCleanupCanvas } from "./shared";
import { clearSprite } from "./strokes";
import { hitTransformer } from "../../hit-transformer";
let _bound = false;
let _stageBound = false;
/** Previous tool — momentary eyedropper returns here after sampling */
let _prevTool = "brush";
/** Ignore paint strokes briefly after an eyedropper sample (ghost mouse/touch). */
let _ignorePaintUntil = 0;

// ── Stage interactions ──

/** Allow re-bind after destroyStage() creates a fresh Konva stage. */
export function resetStageBinding(): void {
  _stageBound = false;
}

function bindStage(): void {
  if (_stageBound) return;
  const bindWhenReady = function (): void {
    const stage = canvas.getStage();
    if (!stage) {
      setTimeout(bindWhenReady, 500);
      return;
    }
    _stageBound = true;

    stage.on("mousemove", function (e) {
      if (!isPaintTool()) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;
      updateCursor(pos.x, pos.y, e.evt.altKey);
      const container = document.getElementById("canvas-container");
      if (!container) return;
      // Don't override a live pan (middle-mouse drag shows "grabbing").
      if (container.style.cursor === "grabbing") return;
      // All paint tools use the custom cursor — hide the OS cursor on BOTH
      // the container and stage.content (stage.content paints over canvas).
      container.style.cursor = "none";
      if (stage.content) stage.content.style.cursor = "none";
    });

    stage.on("mousedown touchstart", function (e) {
      if (!isPaintTool()) return;
      if (e.evt.button !== 0) return;
      // Never paint when grabbing box handles.
      if (hitTransformer(e.target)) return;
      const page = state.getActivePage();
      if (!page) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;
      e.cancelBubble = true;

      const img = stageToImg(pos.x, pos.y);
      const tool = state.activeTool;

      // Alt+click from any paint tool = momentary eyedropper
      if (e.evt.altKey && tool !== "eyedropper") {
        const hex = sampleComposite(page, img.x, img.y);
        if (hex) {
          setPaintColor(hex);
          syncOptions();
          showSampleChip(pos.x, pos.y, hex, canvas.getScaleRatio());
        }
        _ignorePaintUntil = Date.now() + 400;
        flashAlt();
        return;
      }

      if (tool === "eyedropper") {
        const hex = sampleComposite(page, img.x, img.y);
        _ignorePaintUntil = Date.now() + 400;
        _prevTool = "brush";
        tools.setActive("brush");
        if (hex) {
          setPaintColor(hex);
          syncOptions();
          showSampleChip(pos.x, pos.y, hex, canvas.getScaleRatio());
        }
        flashAlt();
        return;
      }

      // Ghost mouse/touch after eyedropper must not paint / demand a mask.
      if (Date.now() < _ignorePaintUntil) return;

      if (tool === "bucket") {
        handleBucket(page, img);
        return;
      }

      // Brush / eraser — start a stroke
      handleStroke(page, img, tool as "brush" | "eraser");
    });
  };
  bindWhenReady();
}

// ── Options bar sync (color swatch etc. after eyedropper sample) ──

function syncOptions(): void {
  const el = document.getElementById("paint-options");
  if (!el) return;
  const s = paintSettings();
  const color = el.querySelector<HTMLInputElement>("#paint-color");
  if (color) color.value = s.color;
  // Painted strokes use the new color — sprite is rebuilt on next stamp.
  clearSprite();
}

// ── Public entry ──

// Alt held = momentary eyedropper: switch the cursor look AND highlight
// the eyedropper tool button so it's obvious sampling will happen on
// click. keydown/keyup (not mousemove) covers the no-pointer-motion case.
let _altDown = false;
const altButton = function (): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(
    '#tools-panel .tool-btn[data-tool="eyedropper"]',
  );
};
const setAltIndicator = function (on: boolean): void {
  const btn = altButton();
  if (btn) btn.classList.toggle("alt-highlight", on);
};
function clearAlt(): void {
  if (!_altDown) return;
  _altDown = false;
  refreshCursor(false);
  setAltIndicator(false);
}

let _flashTimer = 0;
/** Brief highlight pulse when a sample is actually taken (Alt+click or
 *  eyedropper click). Windows can send the Alt keyup early on Alt+click
 *  (menu-activation key), killing the held-highlight before mousedown —
 *  this re-asserts it so the sampling moment is visibly indicated. */
function flashAlt(): void {
  setAltIndicator(true);
  refreshCursor(true);
  window.clearTimeout(_flashTimer);
  _flashTimer = window.setTimeout(function () {
    if (!_altDown) {
      setAltIndicator(false);
      refreshCursor(false);
    }
  }, 300);
}

export function bindPaintTool(): void {
  bindStage();
  if (_bound) return;
  _bound = true;

  // Keep the previous tool for the momentary eyedropper. Entering eyedropper
  // records whatever tool we came from (any tool); the momentary return out
  // of eyedropper must NOT re-record "eyedropper" itself.
  const _origSetActive = tools.setActive;
  tools.setActive = function (toolId: string): void {
    const t = state.activeTool;
    if (t !== "eyedropper" && toolId === "eyedropper") _prevTool = t;
    _origSetActive(toolId);
  };

  const onKeyDown = function (e: KeyboardEvent): void {
    if (e.key !== "Alt") return;
    if (!isPaintTool() || state.activeTool === "eyedropper") return;
    e.preventDefault(); // don't let the window menu bar grab focus
    if (_altDown) return;
    _altDown = true;
    refreshCursor(true);
    setAltIndicator(true);
  };
  const onKeyUp = function (e: KeyboardEvent): void {
    if (e.key !== "Alt") return;
    clearAlt();
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", clearAlt);
}

// ── Tool change: show/hide options bar + brush cursor ──

const _origOnToolChange = canvas.onToolChange;
canvas.onToolChange = function (tool: string): void {
  _origOnToolChange(tool);
  syncOptionsBar(tool);
  // Switching tools cancels any pending momentary-eyedropper highlight.
  clearAlt();
  hideSampleChip();
  if (!isPaintTool()) {
    hideCursor();
    // Leaving a paint tool — reset the OS cursor on BOTH the container and
    // stage.content (paintool's mousemove only runs while a paint tool is
    // active, so neither gets restored on its own).
    const container = document.getElementById("canvas-container");
    const stage = canvas.getStage();
    if (container) container.style.cursor = "";
    if (stage && stage.content) stage.content.style.cursor = "";
  }
};

/** Rebuild visibility + values of the header options bar for `tool`. */
export function syncOptionsBar(tool: string): void {
  const el = document.getElementById("paint-options");
  if (!el) return;
  const s = paintSettings();
  const show =
    tool === "brush" ||
    tool === "eraser" ||
    tool === "bucket" ||
    tool === "eyedropper";
  el.classList.toggle("hidden", !show);
  if (!show) return;

  const setVis = function (sel: string, on: boolean): void {
    const n = el.querySelector<HTMLElement>(sel);
    if (n) n.style.display = on ? "" : "none";
  };

  setVis(".paint-opt-color", tool === "brush" || tool === "bucket");
  setVis(".paint-opt-size", tool === "brush" || tool === "eraser");
  setVis(
    ".paint-opt-opacity",
    tool === "brush" || tool === "eraser" || tool === "bucket",
  );
  setVis(".paint-opt-hardness", tool === "brush" || tool === "eraser");
  setVis(".paint-opt-tolerance", tool === "bucket");
  setVis(".paint-opt-contiguous", tool === "bucket");
  setVis(".paint-opt-hint", tool === "eyedropper");

  const color = el.querySelector<HTMLInputElement>("#paint-color");
  if (color) color.value = s.color;
  const size = el.querySelector<HTMLInputElement>("#paint-size");
  if (size) {
    size.value = String(s.size);
    setSliderFill(size);
    const l = el.querySelector<HTMLElement>("#paint-size-value");
    if (l) {
      if (l instanceof HTMLInputElement) l.value = String(Math.round(s.size));
      else l.textContent = String(Math.round(s.size));
    }
  }
  const opacity = el.querySelector<HTMLInputElement>("#paint-opacity");
  if (opacity) {
    const opPct = Math.round(s.opacity * 100);
    opacity.value = String(opPct);
    setSliderFill(opacity);
    const l = el.querySelector<HTMLElement>("#paint-opacity-value");
    if (l) {
      if (l instanceof HTMLInputElement) l.value = String(opPct);
      else l.textContent = opPct + "%";
    }
  }
  const hardness = el.querySelector<HTMLInputElement>("#paint-hardness");
  if (hardness) {
    hardness.value = String(s.hardness);
    setSliderFill(hardness);
    const l = el.querySelector<HTMLElement>("#paint-hardness-value");
    if (l) {
      if (l instanceof HTMLInputElement) l.value = String(s.hardness);
      else l.textContent = s.hardness + "%";
    }
  }
  const tolerance = el.querySelector<HTMLInputElement>("#paint-tolerance");
  if (tolerance) {
    tolerance.value = String(s.tolerance);
    setSliderFill(tolerance);
    const l = el.querySelector<HTMLElement>("#paint-tolerance-value");
    if (l) {
      if (l instanceof HTMLInputElement) l.value = String(s.tolerance);
      else l.textContent = String(s.tolerance);
    }
  }
  const contiguous = el.querySelector<HTMLInputElement>("#paint-contiguous");
  if (contiguous) contiguous.checked = s.contiguous;
}

export { clearCleanupCanvas };
