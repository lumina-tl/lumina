/** Floating formatting toolbar above active in-place text editor. */
import { canvas } from "../../index";
import { state } from "../../../state";
import { imgToStage, getEditingLayerId } from "./shared";
import { typeSection } from "../../../sidebar/type-section";
import { createIcons } from "../../../ui/icons";
import { removeEditor, getEditorSelection } from "./editor";
import { getStyleAtSelection } from "./spans";
import { fontDisplayName } from "../../../utils/font-loader";
import type { PageLayer } from "../../../../types";

let _bar: HTMLDivElement | null = null;
let _lastLayerId: string | null = null;
let _customOffset: { dx: number; dy: number } | null = null;
let _flipBottom = false;
let _typingTimer: number | null = null;

export function notifyTyping(): void {
  if (!_bar || _bar.style.display === "none") return;
  _bar.classList.add("text-format-typing");
  if (_typingTimer !== null) {
    window.clearTimeout(_typingTimer);
  }
  _typingTimer = window.setTimeout(() => {
    _bar?.classList.remove("text-format-typing");
    _typingTimer = null;
  }, 750);
}

export function setFormatBarDim(dim: boolean): void {
  if (!_bar || _bar.style.display === "none") return;
  if (dim) {
    _bar.classList.add("text-format-dim");
  } else {
    _bar.classList.remove("text-format-dim");
  }
}

function _getBar(): HTMLDivElement {
  if (_bar) return _bar;
  const container = document.getElementById("canvas-container");
  if (!container) throw new Error("canvas-container not found");
  _bar = document.createElement("div");
  _bar.id = "text-format-bar";
  _bar.className = "text-format-bar";
  _bar.addEventListener("mouseenter", () => {
    if (_typingTimer !== null) {
      window.clearTimeout(_typingTimer);
      _typingTimer = null;
    }
    _bar?.classList.remove("text-format-typing", "text-format-dim");
  });
  container.appendChild(_bar);
  return _bar;
}

function _mkBtn(
  iconName: string,
  cls: string,
  onClick: () => void,
  title?: string,
): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = `text-format-btn ${cls}`.trim();
  if (title) b.title = title;
  // Prevent button click from stealing focus or selection from editor
  b.addEventListener("mousedown", (e) => e.preventDefault());
  b.innerHTML = `<i data-lucide="${iconName}" class="w-3.5 h-3.5 shrink-0"></i>`;
  b.addEventListener("click", onClick);
  return b;
}

function _mkDivider(): HTMLDivElement {
  const d = document.createElement("div");
  d.className = "text-format-divider";
  return d;
}

export function showFormatBar(layerId: string): void {
  const bar = _getBar();
  const page = state.getActivePage();
  if (!page) return;
  const layer = page.layers.find((l) => l.id === layerId);
  if (!layer) return;

  if (_lastLayerId !== layerId) {
    _customOffset = null;
    _flipBottom = false;
    _lastLayerId = layerId;
  }

  bar.innerHTML = "";
  const typo = layer.typography;

  // 0. Drag handle & flip button
  const dragHandle = document.createElement("div");
  dragHandle.className = "text-format-drag-handle";
  dragHandle.title = "Drag to reposition";
  dragHandle.innerHTML = `<i data-lucide="grip-vertical" class="w-3.5 h-3.5"></i>`;
  dragHandle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const container = document.getElementById("canvas-container");
    if (!container) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const initialLeft = bar.offsetLeft;
    const initialTop = bar.offsetTop;
    const barW = bar.offsetWidth || 280;
    const barH = bar.offsetHeight || 32;
    const maxLeft = Math.max(8, container.clientWidth - barW - 8);
    const maxTop = Math.max(8, container.clientHeight - barH - 8);

    const onMouseMove = (ev: MouseEvent) => {
      const curLeft = Math.max(
        8,
        Math.min(maxLeft, initialLeft + (ev.clientX - startX)),
      );
      const curTop = Math.max(
        8,
        Math.min(maxTop, initialTop + (ev.clientY - startY)),
      );
      bar.style.left = `${curLeft}px`;
      bar.style.top = `${curTop}px`;

      const id = getEditingLayerId();
      const pActive = state.getActivePage();
      const targetLay = pActive?.layers.find((l) => l.id === id);
      if (targetLay) {
        const p = imgToStage(targetLay.bbox.x, targetLay.bbox.y);
        _customOffset = { dx: curLeft - p.x, dy: curTop - p.y };
      }
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  });
  bar.appendChild(dragHandle);

  const flipBtn = _mkBtn(
    "arrow-down-up",
    "",
    () => {
      _customOffset = null;
      _flipBottom = !_flipBottom;
      updateFormatBarPosition();
    },
    "Flip position (top / bottom)",
  );
  bar.appendChild(flipBtn);
  bar.appendChild(_mkDivider());

  // 1. Font selector button
  const fontBtn = document.createElement("button");
  fontBtn.id = "format-font-btn";
  fontBtn.className = "text-format-btn text-format-font-btn";
  fontBtn.title = "Change font";
  fontBtn.addEventListener("mousedown", (e) => e.preventDefault());
  const fontName = fontDisplayName(typo.fontFamily);
  fontBtn.innerHTML = `<span>${fontName}</span><i data-lucide="chevron-down" class="w-3 h-3 ml-0.5 opacity-60"></i>`;
  if (typo.fontFamily) fontBtn.style.fontFamily = typo.fontFamily;
  fontBtn.addEventListener("click", () => {
    document.getElementById("type-font-trigger")?.click();
  });
  bar.appendChild(fontBtn);

  bar.appendChild(_mkDivider());

  // 2. Color picker swatch
  const colorWrap = document.createElement("div");
  colorWrap.className = "text-format-color-wrap";
  colorWrap.id = "format-color-wrap";
  colorWrap.title = "Text color";
  colorWrap.style.backgroundColor = typo.color || "#111111";

  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.id = "format-color-input";
  colorInput.value = typo.color || "#111111";
  colorInput.addEventListener("input", function () {
    colorWrap.style.backgroundColor = this.value;
    typeSection.apply({ color: this.value }, { snapshot: false });
  });
  colorInput.addEventListener("change", function () {
    colorWrap.style.backgroundColor = this.value;
    typeSection.apply({ color: this.value }, { snapshot: true });
  });
  colorWrap.appendChild(colorInput);
  bar.appendChild(colorWrap);

  bar.appendChild(_mkDivider());

  // 3. Font size stepper (- / val / +)
  const decBtn = _mkBtn(
    "minus",
    "",
    () => {
      const cur = typo.fontSize || Math.round(layer.bbox.h * 0.6);
      const next = Math.max(8, cur - 2);
      typeSection.apply({ fontSize: next });
      _refreshSizeDisplay(next);
    },
    "Decrease size",
  );
  bar.appendChild(decBtn);

  const sizeVal = document.createElement("span");
  sizeVal.id = "format-size-val";
  sizeVal.className =
    "text-[0.68rem] font-mono text-zinc-300 px-1 min-w-[20px] text-center";
  sizeVal.textContent = String(typo.fontSize || Math.round(layer.bbox.h * 0.6));
  bar.appendChild(sizeVal);

  const incBtn = _mkBtn(
    "plus",
    "",
    () => {
      const cur = typo.fontSize || Math.round(layer.bbox.h * 0.6);
      const next = Math.min(144, cur + 2);
      typeSection.apply({ fontSize: next });
      _refreshSizeDisplay(next);
    },
    "Increase size",
  );
  bar.appendChild(incBtn);

  bar.appendChild(_mkDivider());

  // 4. Bold toggle
  const boldBtn = _mkBtn(
    "bold",
    typo.fontWeight >= 700 ? "active" : "",
    () => {
      const isBold = typo.fontWeight >= 700;
      const nextWeight = isBold ? 400 : 700;
      typeSection.apply({ fontWeight: nextWeight });
      boldBtn.classList.toggle("active", !isBold);
    },
    "Bold",
  );
  boldBtn.id = "format-bold-btn";
  bar.appendChild(boldBtn);

  // 5. Italic toggle
  const italicBtn = _mkBtn(
    "italic",
    typo.fontStyle === "italic" ? "active" : "",
    () => {
      const isItalic = typo.fontStyle === "italic";
      const nextStyle = isItalic ? "normal" : "italic";
      typeSection.apply({ fontStyle: nextStyle });
      italicBtn.classList.toggle("active", !isItalic);
    },
    "Italic",
  );
  italicBtn.id = "format-italic-btn";
  bar.appendChild(italicBtn);

  bar.appendChild(_mkDivider());

  // 6. Alignments
  for (const align of ["left", "center", "right"] as const) {
    const btn = _mkBtn(
      `align-${align}`,
      typo.align === align ? "active" : "",
      () => {
        typeSection.apply({ align });
        bar.querySelectorAll("[data-format-align]").forEach((el) => {
          el.classList.toggle(
            "active",
            el.getAttribute("data-format-align") === align,
          );
        });
      },
      `Align ${align}`,
    );
    btn.setAttribute("data-format-align", align);
    bar.appendChild(btn);
  }

  bar.appendChild(_mkDivider());

  // 7. Done commit button
  const doneBtn = _mkBtn(
    "check",
    "text-emerald-400 hover:text-emerald-300",
    () => {
      removeEditor(true);
    },
    "Commit text (Enter)",
  );
  bar.appendChild(doneBtn);

  createIcons({ root: bar });
  updateFormatBarPosition();
  bar.style.display = "flex";
}

function _refreshSizeDisplay(size: number): void {
  const el = document.getElementById("format-size-val");
  if (el) el.textContent = String(size);
}

export function updateFormatBar(layer: PageLayer): void {
  if (!_bar || _bar.style.display === "none") return;
  const sel = getEditorSelection();
  const typo = sel
    ? getStyleAtSelection(layer, sel.start, sel.end)
    : layer.typography;

  const fontBtn = document.getElementById("format-font-btn");
  if (fontBtn) {
    const span = fontBtn.querySelector("span");
    const name = fontDisplayName(typo.fontFamily);
    if (span) span.textContent = name;
    if (typo.fontFamily) fontBtn.style.fontFamily = typo.fontFamily;
  }

  const colorWrap = document.getElementById("format-color-wrap");
  const colorInput = document.getElementById(
    "format-color-input",
  ) as HTMLInputElement | null;
  if (colorWrap && typo.color) colorWrap.style.backgroundColor = typo.color;
  if (colorInput && typo.color) colorInput.value = typo.color;

  const sizeVal = document.getElementById("format-size-val");
  if (sizeVal) {
    sizeVal.textContent = String(
      typo.fontSize || Math.round(layer.bbox.h * 0.6),
    );
  }

  const boldBtn = document.getElementById("format-bold-btn");
  if (boldBtn) boldBtn.classList.toggle("active", typo.fontWeight >= 700);

  const italicBtn = document.getElementById("format-italic-btn");
  if (italicBtn)
    italicBtn.classList.toggle("active", typo.fontStyle === "italic");

  _bar.querySelectorAll("[data-format-align]").forEach((el) => {
    el.classList.toggle(
      "active",
      el.getAttribute("data-format-align") === typo.align,
    );
  });
}

export function updateFormatBarPosition(): void {
  if (!_bar || _bar.style.display === "none") return;
  const id = getEditingLayerId();
  if (!id) return;
  const page = state.getActivePage();
  if (!page) return;
  const lay = page.layers.find((l) => l.id === id);
  if (!lay) return;

  const sr = canvas.getScaleRatio();
  const p = imgToStage(lay.bbox.x, lay.bbox.y);
  const lw = Math.max(8, lay.bbox.w * sr);
  const lh = Math.max(8, lay.bbox.h * sr);

  const barW = _bar.offsetWidth || 280;
  const barH = _bar.offsetHeight || 32;

  const container = document.getElementById("canvas-container");
  const maxLeft = Math.max(
    8,
    (container?.clientWidth ?? window.innerWidth) - barW - 8,
  );
  const maxTop = Math.max(
    8,
    (container?.clientHeight ?? window.innerHeight) - barH - 8,
  );

  let left: number;
  let top: number;

  if (_customOffset) {
    left = p.x + _customOffset.dx;
    top = p.y + _customOffset.dy;
  } else {
    left = p.x + lw / 2 - barW / 2;
    if (_flipBottom) {
      top = p.y + lh + 8;
      if (top > maxTop) top = p.y - barH - 8;
    } else {
      top = p.y - barH - 8;
      if (top < 8) top = p.y + lh + 8;
    }
  }

  left = Math.max(8, Math.min(left, maxLeft));
  top = Math.max(8, Math.min(top, maxTop));

  _bar.style.left = `${left}px`;
  _bar.style.top = `${top}px`;
}

export function hideFormatBar(): void {
  if (_bar) {
    _bar.style.display = "none";
    _bar.classList.remove("text-format-typing", "text-format-dim");
  }
  if (_typingTimer !== null) {
    window.clearTimeout(_typingTimer);
    _typingTimer = null;
  }
}
