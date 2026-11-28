/** Shape inspector panel — Fill, Stroke, Transform, Path actions (matches Type layout). */
import { state } from "../state";
import { canvas } from "../canvas/index";
import { history } from "../history";
import {
  getPenPrefs,
  updatePenPrefs,
} from "../canvas/tools/pen/options";
import type {
  PageLayer,
  StrokeDashPreset,
  StrokeLineCap,
  StrokeLineJoin,
} from "../../types";

function selectedShapeLayer(): PageLayer | null {
  const page = state.getActivePage();
  if (!page || !page._selectedLayerId) return null;
  const lay = page.layers.find((l) => l.id === page._selectedLayerId);
  return lay && lay.type === "shape" ? lay : null;
}

function mkGrid(cols: string): HTMLElement {
  const d = document.createElement("div");
  d.className = "grid gap-1.5";
  d.style.gridTemplateColumns = cols;
  return d;
}

function mkField(label: string, control: HTMLElement): HTMLElement {
  const w = document.createElement("div");
  w.className = "flex flex-col gap-0.5 min-w-0";
  const l = document.createElement("span");
  l.className = "type-field-label";
  l.textContent = label;
  w.append(l, control);
  return w;
}

function mkColorRow(
  on: boolean,
  color: string,
  onToggle: (checked: boolean, clr: HTMLInputElement) => void,
  onColor: (val: string, commit: boolean) => void,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "flex items-center gap-1 min-w-0";

  const tog = document.createElement("button");
  tog.type = "button";
  tog.className = "type-align-btn px-2" + (on ? " active" : "");
  tog.textContent = on ? "ON" : "OFF";

  const clr = document.createElement("input");
  clr.type = "color";
  clr.className = "type-color-well type-color-well-flex" + (on ? "" : " off");
  clr.value = color;
  clr.disabled = !on;

  let active = on;
  tog.addEventListener("click", () => {
    active = !active;
    tog.classList.toggle("active", active);
    tog.textContent = active ? "ON" : "OFF";
    clr.disabled = !active;
    clr.classList.toggle("off", !active);
    onToggle(active, clr);
  });
  clr.addEventListener("input", () => onColor(clr.value, false));
  clr.addEventListener("change", () => onColor(clr.value, true));

  wrap.append(tog, clr);
  return wrap;
}

function mkNumInput(
  val: number,
  min: number,
  max: number,
  step: number,
  disabled: boolean,
  onChange: (v: number, commit: boolean) => void,
): HTMLInputElement {
  const inp = document.createElement("input");
  inp.type = "number";
  inp.min = String(min);
  inp.max = String(max);
  inp.step = String(step);
  inp.className = "field-select w-full text-right";
  inp.value = String(val);
  inp.disabled = disabled;
  inp.addEventListener("input", () => {
    const v = Math.max(min, Math.min(max, Number(inp.value) || 0));
    onChange(v, false);
  });
  inp.addEventListener("change", () => {
    const v = Math.max(min, Math.min(max, Number(inp.value) || 0));
    inp.value = String(v);
    onChange(v, true);
  });
  inp.addEventListener(
    "wheel",
    (e) => {
      if (inp.disabled) return;
      e.preventDefault();
      const cur = Number(inp.value) || 0;
      const s = e.shiftKey ? step * 5 : step;
      const delta = e.deltaY < 0 ? s : -s;
      const v = Math.max(min, Math.min(max, cur + delta));
      inp.value = String(v);
      onChange(v, true);
    },
    { passive: false },
  );
  return inp;
}

function mkSelect<T extends string>(
  options: Array<[T, string]>,
  value: T,
  disabled: boolean,
  onChange: (v: T) => void,
): HTMLSelectElement {
  const sel = document.createElement("select");
  sel.className = "field-select w-full";
  sel.disabled = disabled;
  for (const [val, label] of options) {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = label;
    opt.selected = val === value;
    sel.appendChild(opt);
  }
  sel.addEventListener("change", () => onChange(sel.value as T));
  return sel;
}

export const shapeSection = {
  build(host: HTMLElement): void {
    host.className = "p-2 flex flex-col gap-1.5";
    host.id = "shape-body";

    const lay = selectedShapeLayer();
    const prefs = getPenPrefs();

    if (lay && !lay.shapeStyle) {
      lay.shapeStyle = { fill: "#ffffff", stroke: "#111111", strokeWidth: 2 };
    }
    const fillOn = lay ? !!lay.shapeStyle!.fill : prefs.fillOn;
    const fillVal = lay ? lay.shapeStyle!.fill || "#ffffff" : prefs.fill;
    const strokeOn = lay ? !!lay.shapeStyle!.stroke : prefs.strokeOn;
    const strokeVal = lay ? lay.shapeStyle!.stroke || "#111111" : prefs.stroke;
    const strokeWVal = lay ? (lay.shapeStyle!.strokeWidth ?? 2) : prefs.strokeWidth;
    const strokeDashVal: StrokeDashPreset = lay
      ? (lay.shapeStyle!.strokeDash ?? "solid")
      : prefs.strokeDash;
    const lineCapVal: StrokeLineCap = lay
      ? (lay.shapeStyle!.lineCap ?? "round")
      : prefs.lineCap;
    const lineJoinVal: StrokeLineJoin = lay
      ? (lay.shapeStyle!.lineJoin ?? "round")
      : prefs.lineJoin;

    let widthInp: HTMLInputElement | null = null;
    let dashSel: HTMLSelectElement | null = null;
    let capSel: HTMLSelectElement | null = null;
    let joinSel: HTMLSelectElement | null = null;

    // Row 1: Fill + Stroke
    const row1 = mkGrid("minmax(0,1fr) minmax(0,1fr)");
    row1.appendChild(
      mkField(
        "Fill",
        mkColorRow(
          fillOn,
          fillVal,
          (checked, clr) => {
            if (lay) {
              lay.shapeStyle!.fill = checked ? clr.value : null;
              canvas.render();
              history.snapshot();
            } else {
              updatePenPrefs({ fillOn: checked });
            }
          },
          (val, commit) => {
            if (lay) {
              lay.shapeStyle!.fill = val;
              canvas.render();
              if (commit) history.snapshot();
            } else {
              updatePenPrefs({ fill: val });
            }
          },
        ),
      ),
    );
    row1.appendChild(
      mkField(
        "Stroke",
        mkColorRow(
          strokeOn,
          strokeVal,
          (checked, clr) => {
            if (widthInp) widthInp.disabled = !checked;
            if (dashSel) dashSel.disabled = !checked;
            if (capSel) capSel.disabled = !checked;
            if (joinSel) joinSel.disabled = !checked;
            if (lay) {
              lay.shapeStyle!.stroke = checked ? clr.value : null;
              canvas.render();
              history.snapshot();
            } else {
              updatePenPrefs({ strokeOn: checked });
            }
          },
          (val, commit) => {
            if (lay) {
              lay.shapeStyle!.stroke = val;
              canvas.render();
              if (commit) history.snapshot();
            } else {
              updatePenPrefs({ stroke: val });
            }
          },
        ),
      ),
    );
    host.appendChild(row1);

    // Row 2: Width + Opacity
    const row2 = mkGrid("minmax(0,1fr) minmax(0,1fr)");
    widthInp = mkNumInput(strokeWVal, 0, 200, 1, !strokeOn, (v, commit) => {
      if (lay) {
        lay.shapeStyle!.strokeWidth = v;
        canvas.render();
        if (commit) history.snapshot();
      } else {
        updatePenPrefs({ strokeWidth: v });
      }
    });
    const opInp = mkNumInput(
      lay ? Math.round((lay.opacity ?? 1) * 100) : 100,
      0,
      100,
      5,
      !lay,
      (v, commit) => {
        if (!lay) return;
        lay.opacity = v / 100;
        canvas.render();
        if (commit) history.snapshot();
      },
    );
    row2.append(mkField("Width (px)", widthInp), mkField("Opacity (%)", opInp));
    host.appendChild(row2);

    // Row 3: Stroke Style + Cap + Join
    const row3 = mkGrid("minmax(0,1.2fr) minmax(0,1fr) minmax(0,1fr)");
    dashSel = mkSelect<StrokeDashPreset>(
      [
        ["solid", "Solid"],
        ["dashed", "Dashed"],
        ["dotted", "Dotted"],
        ["dash-dot", "Dash-Dot"],
      ],
      strokeDashVal,
      !strokeOn,
      (v) => {
        if (lay) {
          lay.shapeStyle!.strokeDash = v;
          canvas.render();
          history.snapshot();
        } else {
          updatePenPrefs({ strokeDash: v });
        }
      },
    );
    capSel = mkSelect<StrokeLineCap>(
      [
        ["round", "Round"],
        ["butt", "Butt"],
        ["square", "Square"],
      ],
      lineCapVal,
      !strokeOn,
      (v) => {
        if (lay) {
          lay.shapeStyle!.lineCap = v;
          canvas.render();
          history.snapshot();
        } else {
          updatePenPrefs({ lineCap: v });
        }
      },
    );
    joinSel = mkSelect<StrokeLineJoin>(
      [
        ["round", "Round"],
        ["miter", "Miter"],
        ["bevel", "Bevel"],
      ],
      lineJoinVal,
      !strokeOn,
      (v) => {
        if (lay) {
          lay.shapeStyle!.lineJoin = v;
          canvas.render();
          history.snapshot();
        } else {
          updatePenPrefs({ lineJoin: v });
        }
      },
    );
    row3.append(
      mkField("Style", dashSel),
      mkField("Cap", capSel),
      mkField("Join", joinSel),
    );
    host.appendChild(row3);
  },

  refresh(): void {
    const host = document.getElementById("shape-body");
    if (!host) return;
    host.innerHTML = "";
    this.build(host);
  },
};
