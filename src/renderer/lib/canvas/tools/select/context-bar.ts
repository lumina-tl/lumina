/** Select tool — floating action bar near active selection. */
import { canvas } from "../../index";
import { state } from "../../../state";
import * as i18n from "../../../i18n";
import { createIcons } from "../../../ui/icons";
import {
  selections,
  activeSelection,
  selectionAABB,
  imgToStage,
  clearSelections,
  shapeAABB,
  isHoleShape,
} from "./shared";
import { refreshOverlay } from "./render";
import { toDetection } from "./actions/to-detection";
import { inpaint } from "../../../pipeline/inpaint";

let _bar: HTMLDivElement | null = null;

function _getBar(): HTMLDivElement {
  if (_bar) return _bar;
  const container = document.getElementById("canvas-container");
  if (!container) throw new Error("canvas-container not found");
  _bar = document.createElement("div");
  _bar.id = "selectool-bar";
  _bar.className = "selectool-bar";
  container.appendChild(_bar);
  return _bar;
}

function _mkBtn(
  iconName: string,
  label: string | null,
  cls: string,
  onClick: () => void,
  title?: string,
): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = cls;
  if (title) b.title = title;

  const icon = document.createElement("i");
  icon.dataset.lucide = iconName;
  icon.className = "w-3.5 h-3.5 shrink-0";
  b.appendChild(icon);

  if (label) {
    const span = document.createElement("span");
    span.textContent = label;
    b.appendChild(span);
  }
  b.addEventListener("click", onClick);
  return b;
}

function _mkDivider(): HTMLDivElement {
  const d = document.createElement("div");
  d.className = "selectool-bar-divider";
  return d;
}

function _selectedBoxes() {
  return selections.flatMap((selection) =>
    selection.shapes
      .filter((shape) => !isHoleShape(selection.shapes, shape))
      .map(shapeAABB),
  );
}

export function showContextBar(): void {
  const bar = _getBar();
  const sel = activeSelection();
  if (!sel) {
    hideContextBar();
    return;
  }
  const count = selections.length;
  bar.innerHTML = "";

  // Primary: Detect
  const detectBtn = _mkBtn(
    "type",
    count > 1 ? i18n.t("selectool.convertAll") : i18n.t("selectool.convert"),
    "selectool-bar-btn",
    function () {
      toDetection();
    },
  );
  if (count > 1) {
    const badge = document.createElement("span");
    badge.className = "selectool-bar-count";
    badge.textContent = String(count);
    detectBtn.appendChild(badge);
  }
  bar.appendChild(detectBtn);

  // Inpaint: Clean
  bar.appendChild(
    _mkBtn(
      "sparkles",
      i18n.t("selectool.cleanArea"),
      "selectool-bar-btn",
      function () {
        const boxes = _selectedBoxes();
        void inpaint.runBoxes(boxes).then((success) => {
          if (!success) return;
          clearSelections();
          refreshOverlay();
          hideContextBar();
        });
      },
    ),
  );

  // Erase: Erase mask
  bar.appendChild(
    _mkBtn(
      "eraser",
      i18n.t("selectool.eraseArea"),
      "selectool-bar-btn",
      function () {
        const boxes = _selectedBoxes();
        void inpaint.eraseBoxes(boxes).then((success) => {
          if (!success) return;
          clearSelections();
          refreshOverlay();
          hideContextBar();
        });
      },
    ),
  );

  bar.appendChild(_mkDivider());

  // Clear / Cancel selection (icon only)
  bar.appendChild(
    _mkBtn(
      "x",
      null,
      "selectool-bar-btn selectool-bar-btn-icon",
      function () {
        clearSelections();
        refreshOverlay();
        hideContextBar();
      },
      i18n.t("selectool.clear"),
    ),
  );

  createIcons({ root: bar });
  bar.style.display = "flex";
  positionBar();
}

export function syncContextBar(): void {
  if (selections.length === 0) hideContextBar();
  else showContextBar();
}

export function hideContextBar(): void {
  if (_bar) _bar.style.display = "none";
}

function positionBar(): void {
  const sel = activeSelection();
  const bar = _getBar();
  const container = document.getElementById("canvas-container");
  if (!sel || !container) return;
  const bbox = selectionAABB(sel);
  const a = imgToStage(bbox.x, bbox.y);
  const b = imgToStage(bbox.x + bbox.w, bbox.y + bbox.h);
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);

  let top = y - 8;
  bar.style.transform = "translate(-50%, -100%)";
  if (top < 8) {
    top = y + h + 8;
    bar.style.transform = "translate(-50%, 0)";
  }
  const halfWidth = bar.offsetWidth / 2;
  const left =
    halfWidth * 2 + 16 > container.clientWidth
      ? container.clientWidth / 2
      : Math.max(
          halfWidth + 8,
          Math.min(container.clientWidth - halfWidth - 8, x + w / 2),
        );
  bar.style.left = left + "px";
  bar.style.top = top + "px";
}

// ── Track the main render loop: ants + bar follow zoom/pan/page switch ──
canvas._syncSelectOverlay = function (): void {
  if (!state.getActivePage()) {
    clearSelections();
    refreshOverlay();
    hideContextBar();
    return;
  }
  refreshOverlay();
  if (selections.length > 0 && activeSelection()) positionBar();
  else hideContextBar();
};
