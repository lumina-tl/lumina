/**
 * Lumina Canvas — Interactive Viewport Scrollbars
 * Two-way synchronized horizontal and vertical scrollbars for canvas panning.
 */
import { state } from "../state";
import { canvas } from "./index";
import { clampPan } from "./viewport";

let _trackV: HTMLElement | null = null;
let _thumbV: HTMLElement | null = null;
let _trackH: HTMLElement | null = null;
let _thumbH: HTMLElement | null = null;
let _initialized = false;

let _lastThumbH = 0;
let _lastThumbW = 0;
let _lastPanY = 0;
let _lastPanX = 0;
let _highlightTimerV: ReturnType<typeof setTimeout> | null = null;
let _highlightTimerH: ReturnType<typeof setTimeout> | null = null;

const _sampleCanvas = document.createElement("canvas");
_sampleCanvas.width = 1;
_sampleCanvas.height = 1;
const _sampleCtx = _sampleCanvas.getContext("2d", { willReadFrequently: true });

function _isRegionLight(
  img: HTMLImageElement,
  ix: number,
  iy: number,
): boolean {
  if (!_sampleCtx) return false;
  const cx = Math.max(0, Math.min(img.naturalWidth - 1, Math.round(ix)));
  const cy = Math.max(0, Math.min(img.naturalHeight - 1, Math.round(iy)));
  try {
    _sampleCtx.drawImage(img, cx, cy, 1, 1, 0, 0, 1, 1);
    const data = _sampleCtx.getImageData(0, 0, 1, 1).data;
    const lum = (0.299 * data[0] + 0.587 * data[1] + 0.114 * data[2]) / 255;
    return lum > 0.55;
  } catch {
    return false;
  }
}

export function highlightScrollbar(
  which: "v" | "h" | "both",
  durationMs: number = 1200,
): void {
  if (which === "v" || which === "both") {
    if (_trackV && !_trackV.classList.contains("hidden")) {
      _trackV.classList.add("highlighted");
      if (_highlightTimerV) clearTimeout(_highlightTimerV);
      _highlightTimerV = setTimeout(() => {
        _trackV?.classList.remove("highlighted");
      }, durationMs);
    }
  }
  if (which === "h" || which === "both") {
    if (_trackH && !_trackH.classList.contains("hidden")) {
      _trackH.classList.add("highlighted");
      if (_highlightTimerH) clearTimeout(_highlightTimerH);
      _highlightTimerH = setTimeout(() => {
        _trackH?.classList.remove("highlighted");
      }, durationMs);
    }
  }
}

canvas.updateScrollbars = updateScrollbars;

export function updateScrollbars(): void {
  if (!_trackV || !_thumbV || !_trackH || !_thumbH) {
    _trackV = document.getElementById("canvas-scrollbar-v");
    _thumbV = document.getElementById("canvas-scrollbar-thumb-v");
    _trackH = document.getElementById("canvas-scrollbar-h");
    _thumbH = document.getElementById("canvas-scrollbar-thumb-h");
    if (!_trackV || !_thumbV || !_trackH || !_thumbH) return;
  }

  const container = document.getElementById("canvas-container");
  const page = state.getActivePage();
  if (!container || !page) {
    _trackV.classList.add("hidden");
    _trackH.classList.add("hidden");
    return;
  }

  const cw = container.clientWidth;
  const ch = container.clientHeight;
  if (cw <= 0 || ch <= 0) return;

  const sr = canvas.getBaseScaleRatio();
  const zoom = state._zoomLevel || 1;
  const imgW = page.naturalWidth * sr * zoom;
  const imgH = page.naturalHeight * sr * zoom;

  const marginX = Math.max(imgW, cw) / 2;
  const marginY = Math.max(imgH, ch) / 2;
  const off = canvas.getOffset ? canvas.getOffset() : { x: 0, y: 0 };
  const currentSr = canvas.getScaleRatio ? canvas.getScaleRatio() : sr;

  // ── Vertical Scrollbar ──
  const panY = state._panY || 0;
  const needsV = imgH > ch || Math.abs(panY) > 1;
  if (!needsV) {
    _trackV.classList.add("hidden");
  } else {
    _trackV.classList.remove("hidden");
    const trackH = _trackV.clientHeight;
    if (trackH > 0) {
      const visibleRatioY = Math.min(1, ch / imgH);
      const thumbH = Math.max(24, Math.round(trackH * visibleRatioY));
      _thumbV.style.height = `${thumbH}px`;

      if (
        (_lastThumbH !== 0 && Math.abs(thumbH - _lastThumbH) > 1) ||
        Math.abs(panY - _lastPanY) > 2
      ) {
        highlightScrollbar("v");
      }
      _lastThumbH = thumbH;
      _lastPanY = panY;

      const maxThumbTop = Math.max(0, trackH - thumbH);
      const tY = Math.max(0, Math.min(1, (marginY - panY) / (2 * marginY)));
      const thumbTop = Math.round(tY * maxThumbTop);
      _thumbV.style.top = `${thumbTop}px`;

      // Detect background brightness under the vertical thumb
      const screenX = cw - 8;
      const screenY = 28 + thumbTop + thumbH / 2;
      const imgX = (screenX - off.x) / currentSr;
      const imgY = (screenY - off.y) / currentSr;
      const inImg =
        imgX >= 0 &&
        imgX < page.naturalWidth &&
        imgY >= 0 &&
        imgY < page.naturalHeight;
      const isLight =
        inImg && page.image ? _isRegionLight(page.image, imgX, imgY) : false;
      _trackV.classList.toggle("theme-light", isLight);
    }
  }

  // ── Horizontal Scrollbar ──
  const panX = state._panX || 0;
  const needsH = imgW > cw || Math.abs(panX) > 1;
  if (!needsH) {
    _trackH.classList.add("hidden");
  } else {
    _trackH.classList.remove("hidden");
    const trackW = _trackH.clientWidth;
    if (trackW > 0) {
      const visibleRatioX = Math.min(1, cw / imgW);
      const thumbW = Math.max(24, Math.round(trackW * visibleRatioX));
      _thumbH.style.width = `${thumbW}px`;

      if (
        (_lastThumbW !== 0 && Math.abs(thumbW - _lastThumbW) > 1) ||
        Math.abs(panX - _lastPanX) > 2
      ) {
        highlightScrollbar("h");
      }
      _lastThumbW = thumbW;
      _lastPanX = panX;

      const maxThumbLeft = Math.max(0, trackW - thumbW);
      const tX = Math.max(0, Math.min(1, (marginX - panX) / (2 * marginX)));
      const thumbLeft = Math.round(tX * maxThumbLeft);
      _thumbH.style.left = `${thumbLeft}px`;

      // Detect background brightness under the horizontal thumb
      const screenX = 130 + thumbLeft + thumbW / 2;
      const screenY = ch - 8;
      const imgX = (screenX - off.x) / currentSr;
      const imgY = (screenY - off.y) / currentSr;
      const inImg =
        imgX >= 0 &&
        imgX < page.naturalWidth &&
        imgY >= 0 &&
        imgY < page.naturalHeight;
      const isLight =
        inImg && page.image ? _isRegionLight(page.image, imgX, imgY) : false;
      _trackH.classList.toggle("theme-light", isLight);
    }
  }
}

export function initScrollbars(): void {
  if (_initialized) return;
  _initialized = true;

  _trackV = document.getElementById("canvas-scrollbar-v");
  _thumbV = document.getElementById("canvas-scrollbar-thumb-v");
  _trackH = document.getElementById("canvas-scrollbar-h");
  _thumbH = document.getElementById("canvas-scrollbar-thumb-h");
  if (!_trackV || !_thumbV || !_trackH || !_thumbH) return;

  // ── Vertical Thumb Drag ──
  _thumbV.addEventListener("mousedown", function (e) {
    e.preventDefault();
    e.stopPropagation();

    const startClientY = e.clientY;
    const startPanY = state._panY || 0;
    _thumbV?.classList.add("dragging");

    const onMouseMove = (moveEvt: MouseEvent) => {
      const container = document.getElementById("canvas-container");
      const page = state.getActivePage();
      if (!container || !page || !_trackV || !_thumbV) return;

      const sr = canvas.getBaseScaleRatio();
      const zoom = state._zoomLevel || 1;
      const imgH = page.naturalHeight * sr * zoom;
      const ch = container.clientHeight;
      const marginY = Math.max(imgH, ch) / 2;

      const trackH = _trackV.clientHeight;
      const thumbH = _thumbV.clientHeight;
      const maxThumbTop = trackH - thumbH;
      if (maxThumbTop <= 0) return;

      const deltaY = moveEvt.clientY - startClientY;
      const deltaPanY = -(deltaY * (2 * marginY)) / maxThumbTop;
      state._panY = startPanY + deltaPanY;
      clampPan();
      canvas.scheduleRender();
    };

    const onMouseUp = () => {
      _thumbV?.classList.remove("dragging");
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  });

  // ── Vertical Track Click (Jump) ──
  _trackV.addEventListener("mousedown", function (e) {
    if (e.target === _thumbV) return;
    const container = document.getElementById("canvas-container");
    const page = state.getActivePage();
    if (!container || !page || !_trackV || !_thumbV) return;

    const rect = _trackV.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const trackH = _trackV.clientHeight;
    const thumbH = _thumbV.clientHeight;
    const maxThumbTop = trackH - thumbH;
    if (maxThumbTop <= 0) return;

    const sr = canvas.getBaseScaleRatio();
    const zoom = state._zoomLevel || 1;
    const imgH = page.naturalHeight * sr * zoom;
    const ch = container.clientHeight;
    const marginY = Math.max(imgH, ch) / 2;

    const targetTop = Math.max(0, Math.min(maxThumbTop, clickY - thumbH / 2));
    const tY = targetTop / maxThumbTop;
    state._panY = marginY - tY * (2 * marginY);
    clampPan();
    canvas.scheduleRender();
  });

  // ── Horizontal Thumb Drag ──
  _thumbH.addEventListener("mousedown", function (e) {
    e.preventDefault();
    e.stopPropagation();

    const startClientX = e.clientX;
    const startPanX = state._panX || 0;
    _thumbH?.classList.add("dragging");

    const onMouseMove = (moveEvt: MouseEvent) => {
      const container = document.getElementById("canvas-container");
      const page = state.getActivePage();
      if (!container || !page || !_trackH || !_thumbH) return;

      const sr = canvas.getBaseScaleRatio();
      const zoom = state._zoomLevel || 1;
      const imgW = page.naturalWidth * sr * zoom;
      const cw = container.clientWidth;
      const marginX = Math.max(imgW, cw) / 2;

      const trackW = _trackH.clientWidth;
      const thumbW = _thumbH.clientWidth;
      const maxThumbLeft = trackW - thumbW;
      if (maxThumbLeft <= 0) return;

      const deltaX = moveEvt.clientX - startClientX;
      const deltaPanX = -(deltaX * (2 * marginX)) / maxThumbLeft;
      state._panX = startPanX + deltaPanX;
      clampPan();
      canvas.scheduleRender();
    };

    const onMouseUp = () => {
      _thumbH?.classList.remove("dragging");
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  });

  // ── Horizontal Track Click (Jump) ──
  _trackH.addEventListener("mousedown", function (e) {
    if (e.target === _thumbH) return;
    const container = document.getElementById("canvas-container");
    const page = state.getActivePage();
    if (!container || !page || !_trackH || !_thumbH) return;

    const rect = _trackH.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const trackW = _trackH.clientWidth;
    const thumbW = _thumbH.clientWidth;
    const maxThumbLeft = trackW - thumbW;
    if (maxThumbLeft <= 0) return;

    const sr = canvas.getBaseScaleRatio();
    const zoom = state._zoomLevel || 1;
    const imgW = page.naturalWidth * sr * zoom;
    const cw = container.clientWidth;
    const marginX = Math.max(imgW, cw) / 2;

    const targetLeft = Math.max(0, Math.min(maxThumbLeft, clickX - thumbW / 2));
    const tX = targetLeft / maxThumbLeft;
    state._panX = marginX - tX * (2 * marginX);
    clampPan();
    canvas.scheduleRender();
  });

  window.addEventListener("resize", function () {
    updateScrollbars();
  });
}
