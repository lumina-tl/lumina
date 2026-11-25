/** Pen tool — Bezier path drawing (Selection + Vector Shape output). */
import { state } from "../../../state";
import { canvas } from "../../index";
import { history } from "../../../history";
import { sidebar } from "../../../sidebar";
import * as i18n from "../../../i18n";
import { imgToStage, stageToImg } from "../select/shared";
import { commitSelectionShape } from "../select/interactions";
import { computePathBBox, flattenPathToPolygon } from "./path-math";
import { clearPenOverlay, renderPenOverlay } from "./overlay";
import {
  getPenMode,
  getPenShapeStyle,
  syncPenOptionsBar,
} from "./options";
import {
  getEditingShapeId,
  isEditingShapePath,
  renderDirectSelectOverlay,
  stopShapePathEdit,
} from "./direct-select";
import { defaultTypography, type PageLayer, type PathNode } from "../../../../types";

const CLOSE_RADIUS_PX = 8;

let _stageBound = false;
let _keysBound = false;
let _nodes: PathNode[] = [];
let _redoNodes: PathNode[] = [];
let _dragging = false;
let _hoverImg: { x: number; y: number } | null = null;
let _modifier: "add" | "subtract" | null = null;

function isPenTool(): boolean {
  return state.activeTool === "pen";
}

function isNearFirstNode(sx: number, sy: number): boolean {
  if (_nodes.length < 3) return false;
  const first = imgToStage(_nodes[0].x, _nodes[0].y);
  return Math.hypot(sx - first.x, sy - first.y) <= CLOSE_RADIUS_PX;
}

function resetPath(): void {
  _nodes = [];
  _redoNodes = [];
  _dragging = false;
  _hoverImg = null;
  _modifier = null;
  clearPenOverlay();
  syncPenOptionsBar(0, commitPath, resetPath);
}

function commitPathAsSelection(): void {
  if (_nodes.length < 3) {
    resetPath();
    return;
  }
  const pts = flattenPathToPolygon(_nodes, true, 14);
  const mod = _modifier;
  resetPath();
  if (pts.length >= 3) {
    commitSelectionShape({ kind: "polygon", points: pts }, mod);
  }
}

function commitPathAsShape(): void {
  const page = state.getActivePage();
  if (!page || _nodes.length < 2) {
    resetPath();
    return;
  }
  const closed = _nodes.length >= 3;
  const nodes = _nodes.map((n) => ({ ...n }));
  const bbox = computePathBBox(nodes, closed);
  const shapeCount = page.layers.filter((l) => l.type === "shape").length;
  const layer: PageLayer = {
    id: "shape-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    type: "shape",
    name: `${i18n.t("layers.kindShape")} ${shapeCount + 1}`,
    bbox,
    typography: defaultTypography(),
    visible: true,
    opacity: 1,
    pathNodes: nodes,
    pathClosed: closed,
    shapeStyle: getPenShapeStyle(),
  };
  page.layers.unshift(layer);
  resetPath();
  canvas.selectLayer(layer.id);
  canvas.render();
  sidebar.render();
  history.snapshot();
}

function commitPath(): void {
  if (getPenMode() === "shape") commitPathAsShape();
  else commitPathAsSelection();
}

export function resetPenStage(): void {
  _stageBound = false;
}

export function bindPenStage(): void {
  if (_stageBound) return;
  const stage = canvas.getStage();
  if (!stage) return;
  _stageBound = true;

  stage.on("mousedown", (e) => {
    if (isEditingShapePath() && state.activeTool === "select") {
      let cur: { getAttr?: (k: string) => unknown; getParent?: () => unknown } | null =
        e.target as unknown as { getAttr?: (k: string) => unknown; getParent?: () => unknown };
      let hitSameShape = false;
      while (cur && cur !== (stage as unknown)) {
        if (cur.getAttr?.("layerId") === getEditingShapeId()) {
          hitSameShape = true;
          break;
        }
        cur = (cur.getParent?.() as { getAttr?: (k: string) => unknown; getParent?: () => unknown } | null) ?? null;
      }
      if (!hitSameShape) {
        stopShapePathEdit();
        return;
      }
    }
    if (!isPenTool() || e.evt.button !== 0) return;
    if (!state.getActivePage()) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;

    if (isNearFirstNode(pos.x, pos.y)) {
      commitPath();
      return;
    }

    if (_nodes.length === 0) {
      _modifier = e.evt.shiftKey ? "add" : e.evt.altKey ? "subtract" : null;
    }

    const imgPt = stageToImg(pos.x, pos.y);
    _nodes.push({ x: imgPt.x, y: imgPt.y });
    _redoNodes = [];
    _dragging = true;
    _hoverImg = imgPt;
    renderPenOverlay(_nodes, _hoverImg, false);
    syncPenOptionsBar(_nodes.length, commitPath, resetPath);
  });

  stage.on("mousemove", (e) => {
    if (!isPenTool()) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const imgPt = stageToImg(pos.x, pos.y);
    _hoverImg = imgPt;

    if (_dragging && _nodes.length > 0) {
      const last = _nodes[_nodes.length - 1];
      const dx = imgPt.x - last.x;
      const dy = imgPt.y - last.y;
      if (Math.hypot(dx, dy) > 1) {
        last.outX = imgPt.x;
        last.outY = imgPt.y;
        if (!e.evt.altKey) {
          last.inX = last.x - dx;
          last.inY = last.y - dy;
        }
      }
      renderPenOverlay(_nodes, null, false);
      return;
    }

    if (_nodes.length > 0) {
      renderPenOverlay(_nodes, _hoverImg, isNearFirstNode(pos.x, pos.y));
    }
  });
}

export function bindPenTool(): void {
  if (_keysBound) return;
  _keysBound = true;
  bindPenStage();

  window.addEventListener("mouseup", () => {
    if (!_dragging) return;
    _dragging = false;
    if (_nodes.length > 0) {
      renderPenOverlay(_nodes, _hoverImg, false);
    }
  });

  window.addEventListener(
    "keydown",
    (e) => {
      if (!isPenTool()) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && !e.altKey && k === "z" && !e.shiftKey && _nodes.length > 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const popped = _nodes.pop();
        if (popped) _redoNodes.push(popped);
        _dragging = false;
        if (_nodes.length === 0) {
          clearPenOverlay();
          syncPenOptionsBar(0, commitPath, resetPath);
        } else {
          renderPenOverlay(_nodes, _hoverImg, false);
          syncPenOptionsBar(_nodes.length, commitPath, resetPath);
        }
        return;
      }
      if (
        mod &&
        !e.altKey &&
        ((k === "z" && e.shiftKey) || k === "y") &&
        _redoNodes.length > 0
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const restored = _redoNodes.pop();
        if (restored) _nodes.push(restored);
        _dragging = false;
        renderPenOverlay(_nodes, _hoverImg, false);
        syncPenOptionsBar(_nodes.length, commitPath, resetPath);
        return;
      }

      if (_nodes.length === 0) return;

      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        resetPath();
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        const popped = _nodes.pop();
        if (popped) _redoNodes.push(popped);
        _dragging = false;
        if (_nodes.length === 0) {
          clearPenOverlay();
          syncPenOptionsBar(0, commitPath, resetPath);
        } else {
          renderPenOverlay(_nodes, _hoverImg, false);
          syncPenOptionsBar(_nodes.length, commitPath, resetPath);
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        commitPath();
      }
    },
    true,
  );

  // Re-align overlay on zoom/pan
  const origRender = canvas.render;
  canvas.render = function () {
    origRender.apply(this, arguments as never);
    if (isPenTool() && _nodes.length > 0) {
      renderPenOverlay(_nodes, _hoverImg, false);
    }
    if (isEditingShapePath()) {
      renderDirectSelectOverlay();
    }
  };
}

const origOnToolChange = canvas.onToolChange;
canvas.onToolChange = function (tool: string): void {
  origOnToolChange(tool);
  if (tool !== "pen") resetPath();
  else syncPenOptionsBar(_nodes.length, commitPath, resetPath);
  if (tool !== "select" && tool !== "pen") stopShapePathEdit();
};

const origSwitchPage = canvas.switchPage;
canvas.switchPage = function (idx: number): void {
  origSwitchPage(idx);
  resetPath();
  stopShapePathEdit();
};
