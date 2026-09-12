/* ── Lumina Canvas — Viewport (zoom, pan, sidebar resize) ── */
import Konva from "konva";
import { state } from "../state";
import { ui } from "../ui";
import { canvas } from "./index";

/** Zoom constants — zoom level is relative to "fit" (1 = fit) */
const ZOOM_MAX = 64;
const ZOOM_MIN = 0.1;
const ZOOM_STEP = 1.2;

/** Clamp pan so the image can never be dragged fully out of view */
function _clampPan(): void {
  const container = document.getElementById("canvas-container");
  const page = state.getActivePage();
  if (!container || !page) {
    state._panX = 0;
    state._panY = 0;
    return;
  }
  const sr = canvas.getBaseScaleRatio();
  const imgW = page.naturalWidth * sr * (state._zoomLevel || 1);
  const imgH = page.naturalHeight * sr * (state._zoomLevel || 1);
  const cw = container.clientWidth;
  const ch = container.clientHeight;

  // Keep at least 50% of the image visible
  const marginX = Math.max(imgW, cw) / 2;
  const marginY = Math.max(imgH, ch) / 2;

  state._panX = Math.max(-marginX, Math.min(marginX, state._panX || 0));
  state._panY = Math.max(-marginY, Math.min(marginY, state._panY || 0));
}

/** Set zoom level (1 = fit). anchor: optional {x,y} screen point to zoom around */
canvas.setZoom = function (level, anchor) {
  const old = state._zoomLevel || 1;
  const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, level));
  if (next === old) return;

  if (anchor && next > old) {
    const container = document.getElementById("canvas-container");
    if (container) {
      const rect = container.getBoundingClientRect();
      const cx =
        anchor.x - rect.left - container.clientWidth / 2 - (state._panX || 0);
      const cy =
        anchor.y - rect.top - container.clientHeight / 2 - (state._panY || 0);
      const ratio = next / old;
      state._panX = (state._panX || 0) + cx * (1 - ratio);
      state._panY = (state._panY || 0) + cy * (1 - ratio);
    }
  } else {
    const ratio = next / old;
    state._panX = (state._panX || 0) * ratio;
    state._panY = (state._panY || 0) * ratio;
  }

  state._zoomLevel = next;
  _clampPan();
  ui.updateZoom();
  canvas.scheduleRender();
};

canvas.zoomIn = function () {
  canvas.setZoom((state._zoomLevel || 1) * ZOOM_STEP);
};

canvas.zoomOut = function () {
  canvas.setZoom((state._zoomLevel || 1) / ZOOM_STEP);
};

/** Reset zoom to fit AND re-center pan */
canvas.zoomReset = function () {
  state._zoomLevel = 1;
  state._panX = 0;
  state._panY = 0;
  ui.updateZoom();
  canvas.scheduleRender();
};

/** Wheel: ctrl+wheel or plain wheel = zoom at cursor */
canvas._initWheelZoom = function (): void {
  const container = document.getElementById("canvas-container");
  if (!container) return;
  container.addEventListener(
    "wheel",
    function (e) {
      const page = state.getActivePage();
      if (!page) return;
      e.preventDefault();
      if (e.deltaY < 0) {
        canvas.setZoom((state._zoomLevel || 1) * ZOOM_STEP, {
          x: e.clientX,
          y: e.clientY,
        });
      } else {
        canvas.setZoom((state._zoomLevel || 1) / ZOOM_STEP);
      }
    },
    { passive: false },
  );
};

/** Pan via select-tool background drag or middle-mouse drag */
let _panBound = false;
export function bindPanWhenStageReady(): void {
  if (_panBound || !canvas.getStage()) return;
  _panBound = true;
  canvas._initPanDrag();
}

canvas._initPanDrag = function (): void {
  let panning = false;
  let last: { x: number; y: number } | null = null;

  function bind(s: Konva.Stage | null): void {
    if (!s) return;
    s.on("mousedown touchstart", function (e) {
      const middleBtn = e.evt && e.evt.button === 1;
      const onBackground =
        e.target === s || (e.target.name && e.target.name() === "bg");
      if (middleBtn) {
        // middle-mouse pans regardless of tool
      } else if (state.activeTool === "select" && onBackground) {
        // select tool pans on background drag
      } else {
        return;
      }
      panning = true;
      last = { x: e.evt.clientX, y: e.evt.clientY };
      const container = document.getElementById("canvas-container");
      if (container) container.style.cursor = "grabbing";
      e.evt.preventDefault();
    });

    window.addEventListener("mousemove", function (e) {
      if (!panning || !last) return;
      state._panX = (state._panX || 0) + (e.clientX - last.x);
      state._panY = (state._panY || 0) + (e.clientY - last.y);
      last = { x: e.clientX, y: e.clientY };
      _clampPan();
      canvas.scheduleRender();
    });

    window.addEventListener("mouseup", function () {
      if (!panning) return;
      panning = false;
      const container = document.getElementById("canvas-container");
      if (!container) return;
      const t = state.activeTool;
      const isPaint =
        t === "brush" || t === "eraser" || t === "bucket" || t === "eyedropper";
      container.style.cursor =
        t === "lasso" || t === "rect"
          ? "crosshair"
          : t === "text"
            ? "text"
            : isPaint
              ? "none"
              : "default";
    });
  }

  bind(canvas.getStage());
};

/** Wire zoom control buttons in the overlay */
canvas._initZoomControls = function (): void {
  const btnIn = document.getElementById("btn-zoom-in");
  const btnOut = document.getElementById("btn-zoom-out");
  const btnFit = document.getElementById("btn-zoom-fit");
  if (btnIn)
    btnIn.addEventListener("click", function () {
      canvas.zoomIn();
    });
  if (btnOut)
    btnOut.addEventListener("click", function () {
      canvas.zoomOut();
    });
  if (btnFit)
    btnFit.addEventListener("click", function () {
      canvas.zoomReset();
    });
};

/** Sidebar resize */
canvas._initSidebarResize = function (): void {
  const sidebarEl = document.getElementById("sidebar");
  const resizeHandle = document.getElementById("sidebar-resize");
  if (!sidebarEl || !resizeHandle) return;

  let dragging = false;
  resizeHandle.addEventListener("mousedown", function (e) {
    dragging = true;
    e.preventDefault();
  });
  document.addEventListener("mousemove", function (e) {
    if (!dragging) return;
    let newWidth = window.innerWidth - e.clientX;
    newWidth = Math.max(180, Math.min(400, newWidth));
    sidebarEl.style.width = newWidth + "px";
    state.sidebarWidth = newWidth;
  });
  document.addEventListener("mouseup", function () {
    if (dragging) {
      dragging = false;
      canvas.render();
    }
  });
};
