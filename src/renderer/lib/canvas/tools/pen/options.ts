/** Pen tool floating options bar — Selection vs Shape vs Line mode + Fill/Stroke. */
import * as storage from "../../../storage";
import { state } from "../../../state";
import type {
  ShapeStyle,
  StrokeDashPreset,
  StrokeLineCap,
  StrokeLineJoin,
} from "../../../../types";

export type PenMode = "selection" | "shape" | "line";

const PEN_PREF_KEY = "lumina-pen-prefs";

interface PenPrefs {
  mode: PenMode;
  fillOn: boolean;
  fill: string;
  strokeOn: boolean;
  stroke: string;
  strokeWidth: number;
  strokeDash: StrokeDashPreset;
  lineCap: StrokeLineCap;
  lineJoin: StrokeLineJoin;
}

const _prefs: PenPrefs = loadPrefs();
let _onCommit: (() => void) | null = null;
let _onCancel: (() => void) | null = null;
let _onStyleChange: (() => void) | null = null;
let _nodeCount = 0;

function loadPrefs(): PenPrefs {
  const def: PenPrefs = {
    mode: "selection",
    fillOn: true,
    fill: "#ffffff",
    strokeOn: true,
    stroke: "#111111",
    strokeWidth: 2,
    strokeDash: "solid",
    lineCap: "round",
    lineJoin: "round",
  };
  try {
    const raw = storage.getItem(PEN_PREF_KEY);
    if (!raw) return def;
    const p = JSON.parse(raw) as Partial<PenPrefs>;
    const mode: PenMode =
      p.mode === "shape" || p.mode === "line" ? p.mode : "selection";
    return {
      mode,
      fillOn: typeof p.fillOn === "boolean" ? p.fillOn : def.fillOn,
      fill: typeof p.fill === "string" ? p.fill : def.fill,
      strokeOn: typeof p.strokeOn === "boolean" ? p.strokeOn : def.strokeOn,
      stroke: typeof p.stroke === "string" ? p.stroke : def.stroke,
      strokeWidth:
        typeof p.strokeWidth === "number" && p.strokeWidth >= 0
          ? p.strokeWidth
          : def.strokeWidth,
      strokeDash:
        p.strokeDash === "dashed" ||
        p.strokeDash === "dotted" ||
        p.strokeDash === "dash-dot"
          ? p.strokeDash
          : def.strokeDash,
      lineCap:
        p.lineCap === "butt" || p.lineCap === "square"
          ? p.lineCap
          : def.lineCap,
      lineJoin:
        p.lineJoin === "miter" || p.lineJoin === "bevel"
          ? p.lineJoin
          : def.lineJoin,
    };
  } catch {
    return def;
  }
}

function savePrefs(): void {
  storage.setItem(PEN_PREF_KEY, JSON.stringify(_prefs));
}

export function getPenMode(): PenMode {
  return _prefs.mode;
}

export function getPenShapeStyle(opts?: {
  forceStroke?: boolean;
  noFill?: boolean;
}): ShapeStyle {
  return {
    fill: !opts?.noFill && _prefs.fillOn ? _prefs.fill : null,
    stroke: opts?.forceStroke || _prefs.strokeOn ? _prefs.stroke : null,
    strokeWidth: _prefs.strokeWidth,
    strokeDash: _prefs.strokeDash,
    lineCap: _prefs.lineCap,
    lineJoin: _prefs.lineJoin,
  };
}

export function getPenPrefs(): Readonly<PenPrefs> {
  return _prefs;
}

export function updatePenPrefs(patch: Partial<PenPrefs>): void {
  Object.assign(_prefs, patch);
  savePrefs();
  renderBar();
}

function renderBar(): void {
  const bar = document.getElementById("pen-options");
  if (!bar) return;
  const active = state.activeTool === "pen";
  bar.classList.toggle("hidden", !active);
  if (!active) return;

  bar.innerHTML = "";

  const modeWrap = document.createElement("div");
  modeWrap.className = "paint-opt";
  const mkModeBtn = (mode: PenMode, label: string) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className =
      "px-2 py-0.5 rounded text-[0.68rem] transition-colors " +
      (_prefs.mode === mode
        ? "bg-lumina text-white font-medium"
        : "bg-surface-3 text-text-secondary hover:text-text-primary");
    b.textContent = label;
    b.addEventListener("click", () => {
      _prefs.mode = mode;
      savePrefs();
      renderBar();
      _onStyleChange?.();
    });
    return b;
  };
  modeWrap.append(
    mkModeBtn("selection", "Selection"),
    mkModeBtn("shape", "Shape"),
    mkModeBtn("line", "Line"),
  );
  bar.appendChild(modeWrap);

  if (_prefs.mode === "shape") {
    const fillLbl = document.createElement("label");
    fillLbl.className = "paint-opt paint-opt-color cursor-pointer";
    const fillChk = document.createElement("input");
    fillChk.type = "checkbox";
    fillChk.checked = _prefs.fillOn;
    fillChk.addEventListener("change", () => {
      _prefs.fillOn = fillChk.checked;
      savePrefs();
      renderBar();
      _onStyleChange?.();
    });
    const fillTxt = document.createElement("span");
    fillTxt.className = "paint-opt-label";
    fillTxt.textContent = "Fill";
    const fillClr = document.createElement("input");
    fillClr.type = "color";
    fillClr.value = _prefs.fill;
    fillClr.disabled = !_prefs.fillOn;
    fillClr.addEventListener("input", () => {
      _prefs.fill = fillClr.value;
      savePrefs();
      _onStyleChange?.();
    });
    fillLbl.append(fillChk, fillTxt, fillClr);
    bar.appendChild(fillLbl);
  }

  if (_prefs.mode === "shape" || _prefs.mode === "line") {
    const isLine = _prefs.mode === "line";
    const strokeActive = isLine || _prefs.strokeOn;

    const strokeLbl = document.createElement("label");
    strokeLbl.className = "paint-opt paint-opt-color cursor-pointer";
    if (!isLine) {
      const strokeChk = document.createElement("input");
      strokeChk.type = "checkbox";
      strokeChk.checked = _prefs.strokeOn;
      strokeChk.addEventListener("change", () => {
        _prefs.strokeOn = strokeChk.checked;
        savePrefs();
        renderBar();
        _onStyleChange?.();
      });
      strokeLbl.appendChild(strokeChk);
    }
    const strokeTxt = document.createElement("span");
    strokeTxt.className = "paint-opt-label";
    strokeTxt.textContent = "Stroke";
    const strokeClr = document.createElement("input");
    strokeClr.type = "color";
    strokeClr.value = _prefs.stroke;
    strokeClr.disabled = !strokeActive;
    strokeClr.addEventListener("input", () => {
      _prefs.stroke = strokeClr.value;
      savePrefs();
      _onStyleChange?.();
    });
    const strokeW = document.createElement("input");
    strokeW.type = "number";
    strokeW.min = "0";
    strokeW.max = "200";
    strokeW.value = String(_prefs.strokeWidth);
    strokeW.disabled = !strokeActive;
    strokeW.className = "paint-opt-input";
    strokeW.addEventListener("input", () => {
      _prefs.strokeWidth = Math.max(0, Math.min(200, Number(strokeW.value) || 0));
      savePrefs();
      _onStyleChange?.();
    });
    strokeW.addEventListener("change", () => {
      _prefs.strokeWidth = Math.max(0, Math.min(200, Number(strokeW.value) || 0));
      strokeW.value = String(_prefs.strokeWidth);
      savePrefs();
      _onStyleChange?.();
    });
    strokeW.addEventListener(
      "wheel",
      (e) => {
        if (strokeW.disabled) return;
        e.preventDefault();
        const step = e.shiftKey ? 5 : 1;
        const delta = e.deltaY < 0 ? step : -step;
        _prefs.strokeWidth = Math.max(
          0,
          Math.min(200, _prefs.strokeWidth + delta),
        );
        strokeW.value = String(_prefs.strokeWidth);
        savePrefs();
        _onStyleChange?.();
      },
      { passive: false },
    );
    const unit = document.createElement("span");
    unit.className = "paint-opt-unit";
    unit.textContent = "px";

    const dashSel = document.createElement("select");
    dashSel.className = "paint-opt-select";
    dashSel.disabled = !strokeActive;
    for (const [val, label] of [
      ["solid", "Solid"],
      ["dashed", "Dashed"],
      ["dotted", "Dotted"],
      ["dash-dot", "Dash-Dot"],
    ] as const) {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = label;
      opt.selected = _prefs.strokeDash === val;
      dashSel.appendChild(opt);
    }
    dashSel.addEventListener("change", () => {
      _prefs.strokeDash = dashSel.value as StrokeDashPreset;
      savePrefs();
      _onStyleChange?.();
    });

    const capSel = document.createElement("select");
    capSel.className = "paint-opt-select";
    capSel.disabled = !strokeActive;
    for (const [val, label] of [
      ["round", "Round"],
      ["butt", "Butt"],
      ["square", "Square"],
    ] as const) {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = label;
      opt.selected = _prefs.lineCap === val;
      capSel.appendChild(opt);
    }
    capSel.addEventListener("change", () => {
      _prefs.lineCap = capSel.value as StrokeLineCap;
      savePrefs();
      _onStyleChange?.();
    });

    strokeLbl.append(strokeTxt, strokeClr, strokeW, unit, dashSel, capSel);
    bar.appendChild(strokeLbl);
  }

  const canCommit =
    _prefs.mode === "shape" || _prefs.mode === "line"
      ? _nodeCount >= 2
      : _nodeCount >= 3;
  if (canCommit) {
    const okBtn = document.createElement("button");
    okBtn.type = "button";
    okBtn.className =
      "px-2 py-0.5 rounded text-[0.68rem] bg-lumina text-white font-medium";
    okBtn.textContent =
      _prefs.mode === "line"
        ? "Create Line"
        : _prefs.mode === "shape"
          ? "Create Shape"
          : "Make Selection";
    okBtn.addEventListener("click", () => _onCommit?.());
    bar.appendChild(okBtn);
  }
  if (_nodeCount > 0) {
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className =
      "px-2 py-0.5 rounded text-[0.68rem] bg-surface-3 text-text-secondary hover:text-text-primary";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => _onCancel?.());
    bar.appendChild(cancelBtn);
  }
}

export function syncPenOptionsBar(
  nodeCount: number,
  onCommit?: () => void,
  onCancel?: () => void,
  onStyleChange?: () => void,
): void {
  _nodeCount = nodeCount;
  if (onCommit) _onCommit = onCommit;
  if (onCancel) _onCancel = onCancel;
  if (onStyleChange) _onStyleChange = onStyleChange;
  renderBar();
}
