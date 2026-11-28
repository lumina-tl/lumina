/** Paint options bar — brush/eraser/bucket/eyedropper controls. */
import {
  paintSettings,
  setPaintColor,
  setPaintSize,
  setPaintOpacity,
  setPaintHardness,
  setPaintTolerance,
  setPaintContiguous,
  resetPaintSettings,
} from "./shared";
import { clearSprite } from "./strokes";
import { syncOptionsBar } from ".";
import { wireSlider, setSliderFill } from "../../../ui/slider";
import { state } from "../../../state";

function bindNumericInput(
  input: HTMLInputElement,
  slider: HTMLInputElement | null,
  min: number,
  max: number,
  onChange: (val: number) => void,
): void {
  const commit = function (): void {
    let v = parseFloat(input.value);
    if (isNaN(v)) v = min;
    const clamped = Math.min(max, Math.max(min, Math.round(v)));
    input.value = String(clamped);
    if (slider) {
      slider.value = String(clamped);
      setSliderFill(slider);
    }
    onChange(clamped);
  };

  input.addEventListener("input", function () {
    const v = parseFloat(input.value);
    if (!isNaN(v)) {
      const clamped = Math.min(max, Math.max(min, Math.round(v)));
      if (slider) {
        slider.value = String(clamped);
        setSliderFill(slider);
      }
      onChange(clamped);
    }
  });

  input.addEventListener("change", commit);
  input.addEventListener("blur", commit);
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      commit();
      input.blur();
    }
  });
  input.addEventListener(
    "wheel",
    function (e) {
      e.preventDefault();
      const cur = parseFloat(input.value);
      const base = isNaN(cur) ? min : cur;
      const step = e.shiftKey ? 5 : 1;
      const delta = e.deltaY < 0 ? step : -step;
      const clamped = Math.min(max, Math.max(min, Math.round(base + delta)));
      input.value = String(clamped);
      if (slider) {
        slider.value = String(clamped);
        setSliderFill(slider);
      }
      onChange(clamped);
    },
    { passive: false },
  );
}

function wireSliderWheel(
  slider: HTMLInputElement,
  input: HTMLInputElement | null,
  min: number,
  max: number,
  onChange: (val: number) => void,
): void {
  slider.addEventListener(
    "wheel",
    function (e) {
      e.preventDefault();
      const cur = parseInt(slider.value, 10);
      const base = isNaN(cur) ? min : cur;
      const step = e.shiftKey ? 5 : 1;
      const delta = e.deltaY < 0 ? step : -step;
      const clamped = Math.min(max, Math.max(min, base + delta));
      slider.value = String(clamped);
      setSliderFill(slider);
      if (input) input.value = String(clamped);
      onChange(clamped);
    },
    { passive: false },
  );
}

export function initPaintOptions(): void {
  const el = document.getElementById("paint-options");
  if (!el) return;

  const color = el.querySelector<HTMLInputElement>("#paint-color");
  if (color) {
    color.addEventListener("input", function () {
      setPaintColor(color.value);
      clearSprite();
    });
  }

  const size = el.querySelector<HTMLInputElement>("#paint-size");
  const sizeVal = el.querySelector<HTMLInputElement>("#paint-size-value");
  if (size) {
    size.addEventListener("input", function () {
      const v = parseInt(size.value, 10);
      setPaintSize(v);
      if (sizeVal) sizeVal.value = String(v);
      clearSprite();
    });
    wireSlider(size);
    wireSliderWheel(size, sizeVal, 2, 300, function (v) {
      setPaintSize(v);
      clearSprite();
    });
  }
  if (sizeVal) {
    bindNumericInput(sizeVal, size, 2, 300, function (v) {
      setPaintSize(v);
      clearSprite();
    });
  }

  const opacity = el.querySelector<HTMLInputElement>("#paint-opacity");
  const opacityVal = el.querySelector<HTMLInputElement>("#paint-opacity-value");
  if (opacity) {
    opacity.addEventListener("input", function () {
      const v = parseInt(opacity.value, 10);
      setPaintOpacity(v / 100);
      if (opacityVal) opacityVal.value = String(v);
      clearSprite();
    });
    wireSlider(opacity);
    wireSliderWheel(opacity, opacityVal, 0, 100, function (v) {
      setPaintOpacity(v / 100);
      clearSprite();
    });
  }
  if (opacityVal) {
    bindNumericInput(opacityVal, opacity, 0, 100, function (v) {
      setPaintOpacity(v / 100);
      clearSprite();
    });
  }

  const hardness = el.querySelector<HTMLInputElement>("#paint-hardness");
  const hardnessVal = el.querySelector<HTMLInputElement>(
    "#paint-hardness-value",
  );
  if (hardness) {
    hardness.addEventListener("input", function () {
      const v = parseInt(hardness.value, 10);
      setPaintHardness(v);
      if (hardnessVal) hardnessVal.value = String(v);
      clearSprite();
    });
    wireSlider(hardness);
    wireSliderWheel(hardness, hardnessVal, 0, 100, function (v) {
      setPaintHardness(v);
      clearSprite();
    });
  }
  if (hardnessVal) {
    bindNumericInput(hardnessVal, hardness, 0, 100, function (v) {
      setPaintHardness(v);
      clearSprite();
    });
  }

  const tolerance = el.querySelector<HTMLInputElement>("#paint-tolerance");
  const toleranceVal = el.querySelector<HTMLInputElement>(
    "#paint-tolerance-value",
  );
  if (tolerance) {
    tolerance.addEventListener("input", function () {
      const v = parseInt(tolerance.value, 10);
      setPaintTolerance(v);
      if (toleranceVal) toleranceVal.value = String(v);
    });
    wireSlider(tolerance);
    wireSliderWheel(tolerance, toleranceVal, 0, 255, function (v) {
      setPaintTolerance(v);
    });
  }
  if (toleranceVal) {
    bindNumericInput(toleranceVal, tolerance, 0, 255, function (v) {
      setPaintTolerance(v);
    });
  }

  const contiguous = el.querySelector<HTMLInputElement>("#paint-contiguous");
  if (contiguous) {
    contiguous.addEventListener("change", function () {
      setPaintContiguous(contiguous.checked);
    });
  }

  // Reset to defaults — restores every setting and re-syncs the bar.
  const reset = el.querySelector<HTMLButtonElement>("#paint-reset");
  if (reset) {
    reset.addEventListener("click", function () {
      resetPaintSettings();
      clearSprite();
      syncOptionsBar(state.activeTool);
    });
  }
}
