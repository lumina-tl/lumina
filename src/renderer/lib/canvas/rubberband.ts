/** Rubberband marquee selection for the Select tool */
import Konva from "konva";
import { state } from "../state";
import { canvas } from "./index";
import { isSpacePressed } from "./viewport";
import { hitTransformer } from "./hit-transformer";

let _bound = false;
let _rubberbandRect: Konva.Rect | null = null;
let _startX = 0;
let _startY = 0;
let _active = false;
let _hasMoved = false;
let _isModifier = false;

export function resetRubberbandBinding(): void {
  _bound = false;
  if (_rubberbandRect) {
    _rubberbandRect.destroy();
    _rubberbandRect = null;
  }
  _active = false;
}

function _isTextOrDetTarget(target: unknown, stage: unknown): boolean {
  let node = target as {
    name?: () => string;
    getParent?: () => unknown;
    getAttr?: (k: string) => unknown;
  } | null;
  while (node && node !== stage) {
    const name = node.name ? node.name() : "";
    if (
      name === "layer-text" ||
      name === "layer-text-box" ||
      name === "layer-text-glyphs" ||
      name === "det-group" ||
      name === "det-box" ||
      name === "det-badge"
    ) {
      return true;
    }
    if (node.getAttr && node.getAttr("layerId")) return true;
    node = node.getParent ? (node.getParent() as typeof node) : null;
  }
  return false;
}

export function bindRubberband(): void {
  const stage = canvas.getStage();
  const layer = canvas.getLayer();
  if (!stage || !layer) return;
  if (_bound) return;
  _bound = true;

  stage.on("mousedown touchstart", function (e) {
    if (state.activeTool !== "select") return;
    if (e.evt && e.evt.button !== 0 && e.evt.button !== undefined) return;
    if (isSpacePressed()) return;
    if (hitTransformer(e.target)) return;
    if (_isTextOrDetTarget(e.target, stage)) return;

    const pos = stage.getPointerPosition();
    if (!pos) return;

    _startX = pos.x;
    _startY = pos.y;
    _active = true;
    _hasMoved = false;
    _isModifier = !!(
      e.evt &&
      (e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey)
    );

    if (_rubberbandRect) {
      _rubberbandRect.destroy();
      _rubberbandRect = null;
    }

    _rubberbandRect = new Konva.Rect({
      x: _startX,
      y: _startY,
      width: 0,
      height: 0,
      stroke: canvas.TEXT_COLOR,
      strokeWidth: 1,
      dash: [4, 4],
      fill: "rgba(0, 255, 136, 0.08)",
      listening: false,
    });
    layer.add(_rubberbandRect);
  });

  window.addEventListener("mousemove", function () {
    if (!_active || !_rubberbandRect) return;
    const stage = canvas.getStage();
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;

    const dx = pos.x - _startX;
    const dy = pos.y - _startY;
    if (!_hasMoved && Math.hypot(dx, dy) >= 4) {
      _hasMoved = true;
    }

    if (_hasMoved) {
      const rx = Math.min(_startX, pos.x);
      const ry = Math.min(_startY, pos.y);
      const rw = Math.abs(dx);
      const rh = Math.abs(dy);
      _rubberbandRect.position({ x: rx, y: ry });
      _rubberbandRect.size({ width: rw, height: rh });
      canvas.getLayer()?.batchDraw();
    }
  });

  window.addEventListener("mouseup", function (e) {
    if (!_active) return;
    _active = false;

    let rx = 0;
    let ry = 0;
    let rw = 0;
    let rh = 0;

    if (_rubberbandRect) {
      rx = _rubberbandRect.x();
      ry = _rubberbandRect.y();
      rw = _rubberbandRect.width();
      rh = _rubberbandRect.height();
      _rubberbandRect.destroy();
      _rubberbandRect = null;
      canvas.getLayer()?.batchDraw();
    }

    const page = state.getActivePage();
    if (!page) return;

    if (!_hasMoved || rw < 4 || rh < 4) {
      if (!_isModifier) {
        canvas.selectTextDetection(null);
      }
      return;
    }

    // Convert stage rect to image coordinates
    const sr = canvas.getScaleRatio() || 1;
    const off = canvas.getOffset();
    const ix = (rx - off.x) / sr;
    const iy = (ry - off.y) / sr;
    const iw = rw / sr;
    const ih = rh / sr;

    const boxIntersects = function (b: {
      x: number;
      y: number;
      w: number;
      h: number;
    }): boolean {
      return !(
        b.x > ix + iw ||
        b.x + b.w < ix ||
        b.y > iy + ih ||
        b.y + b.h < iy
      );
    };

    const isDetMode = state.showDetBoxes && page.inpaintMasks.length === 0;

    if (isDetMode) {
      const hitIndices: number[] = [];
      (page.textDetections || []).forEach((det, i) => {
        if (boxIntersects(det.bbox)) {
          hitIndices.push(i);
        }
      });

      let finalIndices = hitIndices;
      if (_isModifier && page._selectedTextIndices) {
        finalIndices = Array.from(
          new Set([...page._selectedTextIndices, ...hitIndices]),
        );
      }
      canvas.selectMultipleTextDetections(finalIndices);
    } else {
      const hitIds: string[] = [];
      (page.layers || []).forEach((l) => {
        if (!l.visible) return;
        if (boxIntersects(l.bbox)) {
          hitIds.push(l.id);
        }
      });

      let finalIds = hitIds;
      if (_isModifier && page._selectedLayerIds) {
        finalIds = Array.from(new Set([...page._selectedLayerIds, ...hitIds]));
      }
      canvas.selectMultipleLayers(finalIds);
    }
  });
}
