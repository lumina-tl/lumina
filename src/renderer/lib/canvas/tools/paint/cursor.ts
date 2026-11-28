/** Paint cursor — crosshair + tool icon + brush circle. */
import { state } from "../../../state";
import { canvas } from "../../index";
import { createIcons } from "../../../ui/icons";
import { paintSettings } from "./shared";
import { isPaintTool } from "./guard";

const TOOL_ICONS: Record<string, string> = {
  brush: "brush",
  eraser: "eraser",
  bucket: "paint-bucket",
  eyedropper: "pipette",
};

let _cursor: HTMLDivElement | null = null;
let _lastX = 0;
let _lastY = 0;

function cursorEl(): HTMLDivElement | null {
  if (_cursor && _cursor.isConnected) return _cursor;
  const container = document.getElementById("canvas-container");
  if (!container) return null;
  _cursor = document.createElement("div");
  _cursor.id = "paint-cursor";
  _cursor.innerHTML =
    '<div class="pc-reticle">' +
    '<div class="pc-cross-h"></div>' +
    '<div class="pc-cross-v"></div>' +
    '<div class="pc-ibeam">' +
    '<div class="pc-ibeam-v"></div>' +
    '<div class="pc-ibeam-top"></div>' +
    '<div class="pc-ibeam-mid"></div>' +
    '<div class="pc-ibeam-bot"></div>' +
    "</div>" +
    '<div class="pc-circle"></div>' +
    "</div>" +
    '<div class="pc-icon"><i data-lucide="brush"></i></div>';
  container.appendChild(_cursor);
  return _cursor;
}

export function hideCursor(): void {
  if (_cursor) _cursor.style.display = "none";
}

/** Re-render cursor at last known pointer position (Alt key toggle). */
export function refreshCursor(altKey: boolean): void {
  updateCursor(_lastX, _lastY, altKey);
}

/* ── Sample feedback chip ──
 * After an eyedropper click, show a small swatch + hex label at the sampled
 * point so the user instantly sees the color that was picked. Fades out.
 */
let _chip: HTMLDivElement | null = null;
let _chipTimer = 0;

export function showSampleChip(
  x: number,
  y: number,
  hex: string,
  scale: number,
): void {
  const container = document.getElementById("canvas-container");
  if (!container) return;
  if (!_chip) {
    _chip = document.createElement("div");
    _chip.className = "pc-sample-chip";
    _chip.innerHTML =
      '<div class="pc-sample-swatch"></div>' +
      '<div class="pc-sample-hex"></div>';
    container.appendChild(_chip);
  }
  _chip.querySelector<HTMLElement>(".pc-sample-swatch")!.style.background = hex;
  _chip.querySelector<HTMLElement>(".pc-sample-hex")!.textContent = hex;
  _chip.style.left = x + "px";
  _chip.style.top = y + "px";
  _chip.style.display = "flex";
  // 1px per image pixel — label stays readable even when zoomed way out.
  const k = Math.max(0.7, Math.min(1.4, scale));
  _chip.style.transform = "translate(-50%, -130%) scale(" + k + ")";
  _chip.classList.remove("pc-chip-out");
  window.clearTimeout(_chipTimer);
  _chipTimer = window.setTimeout(function () {
    if (_chip) _chip.classList.add("pc-chip-out");
  }, 900);
}

export function hideSampleChip(): void {
  if (_chip) _chip.style.display = "none";
}

const CROSSHAIR_TOOLS = new Set(["lasso", "rect", "pen"]);

export function isCustomCursorTool(tool: string = state.activeTool): boolean {
  return (
    tool === "brush" ||
    tool === "eraser" ||
    tool === "bucket" ||
    tool === "eyedropper" ||
    tool === "text" ||
    CROSSHAIR_TOOLS.has(tool)
  );
}

export function updateCursor(sx: number, sy: number, altKey = false): void {
  _lastX = sx;
  _lastY = sy;
  const el = cursorEl();
  if (!el) return;
  const tool = state.activeTool;
  if (!isCustomCursorTool(tool)) {
    el.style.display = "none";
    return;
  }
  const isCrosshairTool = CROSSHAIR_TOOLS.has(tool);
  const isTextTool = tool === "text";
  // Alt held from any paint tool = momentary eyedropper look.
  const effective =
    !isCrosshairTool && !isTextTool && altKey && tool !== "eyedropper"
      ? "eyedropper"
      : tool;
  const isStroke = effective === "brush" || effective === "eraser";
  const sr = canvas.getScaleRatio();
  const size = Math.max(2, paintSettings().size * sr);

  el.style.display = "block";
  el.style.left = sx + "px";
  el.style.top = sy + "px";

  // Crosshair lines: bucket/eyedropper and selection/pen crosshair tools.
  const showLines =
    isCrosshairTool || effective === "bucket" || effective === "eyedropper";
  const h = el.querySelector<HTMLElement>(".pc-cross-h");
  const v = el.querySelector<HTMLElement>(".pc-cross-v");
  if (h) h.style.display = showLines ? "block" : "none";
  if (v) v.style.display = showLines ? "block" : "none";

  // Inverted I-beam reticle: text tool only.
  const ibeam = el.querySelector<HTMLElement>(".pc-ibeam");
  if (ibeam) ibeam.style.display = isTextTool ? "block" : "none";

  // Brush-size circle: brush/eraser only.
  const circle = el.querySelector<HTMLElement>(".pc-circle");
  if (circle) {
    circle.style.display = isStroke ? "block" : "none";
    if (isStroke) {
      circle.style.width = size + "px";
      circle.style.height = size + "px";
      circle.classList.toggle("pc-eraser", effective === "eraser");
    }
  }

  // Tool icon: paint tools only (selection/pen/text use a clean inverted reticle).
  const icon = el.querySelector<HTMLElement>(".pc-icon");
  if (icon) {
    if (isCrosshairTool || isTextTool) {
      icon.style.display = "none";
    } else {
      icon.style.display = "flex";
      const name = TOOL_ICONS[effective] || "brush";
      if (icon.getAttribute("data-icon-name") !== name) {
        icon.setAttribute("data-icon-name", name);
        icon.innerHTML = '<i data-lucide="' + name + '"></i>';
        createIcons({ root: icon });
      }
      const off = isStroke ? Math.max(8, size * 0.55) : 8;
      icon.style.left = off + "px";
      icon.style.top = off + "px";
    }
  }
}
