/** Direct Selection — interactive anchor & Bezier handle editor for shape layers. */
import Konva from "konva";
import { state } from "../../../state";
import { canvas } from "../../index";
import { history } from "../../../history";
import { imgToStage, stageToImg } from "../select/shared";
import { layerTextNodes } from "../text/shared";
import { computePathBBox, nodesToSvgPath } from "./path-math";
import type { PageLayer, PathNode } from "../../../../types";

let _layer: Konva.Layer | null = null;
let _editingLayerId: string | null = null;
let _selectedIdx: number | null = null;
let _boundKeys = false;
let _hintEl: HTMLDivElement | null = null;

function showPathHint(clientX: number, clientY: number, text: string): void {
  if (!_hintEl) {
    _hintEl = document.createElement("div");
    _hintEl.style.cssText =
      "position:fixed;z-index:9999;pointer-events:none;padding:3px 7px;border-radius:5px;" +
      "background:rgba(14,14,16,0.9);border:1px solid rgba(255,255,255,0.12);" +
      "color:#e4e4e7;font-size:11px;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.4);";
    document.body.appendChild(_hintEl);
  }
  _hintEl.textContent = text;
  _hintEl.style.left = clientX + 12 + "px";
  _hintEl.style.top = clientY + 12 + "px";
  _hintEl.style.display = "block";
}

function hidePathHint(): void {
  if (_hintEl) _hintEl.style.display = "none";
}

function rotateAround(
  px: number,
  py: number,
  cx: number,
  cy: number,
  deg: number,
): { x: number; y: number } {
  if (!deg) return { x: px, y: py };
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = px - cx;
  const dy = py - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

export function getEditingShapeId(): string | null {
  return _editingLayerId;
}

export function isEditingShapePath(layerId?: string): boolean {
  if (!_editingLayerId) return false;
  return layerId ? _editingLayerId === layerId : true;
}

function getEditLayer(): Konva.Layer | null {
  const stage = canvas.getStage();
  if (!stage) return null;
  if (!_layer || _layer.getStage() !== stage) {
    _layer = new Konva.Layer();
    stage.add(_layer);
    _layer.moveToTop();
  }
  return _layer;
}

function findEditingLayer(): PageLayer | null {
  if (!_editingLayerId) return null;
  const page = state.getActivePage();
  return page?.layers.find((l) => l.id === _editingLayerId) ?? null;
}

function updateLiveShapeNode(lay: PageLayer): void {
  const mainLayer = canvas.getLayer();
  if (!mainLayer || !lay.pathNodes) return;
  const group = layerTextNodes.find((n) => n.getAttr("layerId") === lay.id);
  const pathNode = group?.findOne<Konva.Path>(".layer-shape-path");
  if (pathNode) {
    pathNode.data(
      nodesToSvgPath(
        lay.pathNodes,
        lay.pathClosed !== false,
        lay.bbox.x,
        lay.bbox.y,
      ),
    );
    mainLayer.batchDraw();
  }
}

function findClosestT(
  a: PathNode,
  b: PathNode,
  pt: { x: number; y: number },
): number {
  const c1x = a.outX ?? a.x;
  const c1y = a.outY ?? a.y;
  const c2x = b.inX ?? b.x;
  const c2y = b.inY ?? b.y;
  let bestT = 0.5;
  let bestD = Infinity;
  const steps = 32;
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const mt = 1 - t;
    const x =
      mt * mt * mt * a.x +
      3 * mt * mt * t * c1x +
      3 * mt * t * t * c2x +
      t * t * t * b.x;
    const y =
      mt * mt * mt * a.y +
      3 * mt * mt * t * c1y +
      3 * mt * t * t * c2y +
      t * t * t * b.y;
    const d = Math.hypot(x - pt.x, y - pt.y);
    if (d < bestD) {
      bestD = d;
      bestT = t;
    }
  }
  return bestT;
}

function insertNodeOnSegment(
  lay: PageLayer,
  segIdx: number,
  imgPt: { x: number; y: number },
): void {
  const nodes = lay.pathNodes;
  if (!nodes || nodes.length < 2) return;
  const nextIdx = (segIdx + 1) % nodes.length;
  const a = nodes[segIdx];
  const b = nodes[nextIdx];
  const curved =
    a.outX !== undefined ||
    a.outY !== undefined ||
    b.inX !== undefined ||
    b.inY !== undefined;

  if (!curved) {
    nodes.splice(segIdx + 1, 0, { x: imgPt.x, y: imgPt.y });
  } else {
    const t = findClosestT(a, b, imgPt);
    const lerp = (p: number, q: number) => p + (q - p) * t;
    const c1x = a.outX ?? a.x;
    const c1y = a.outY ?? a.y;
    const c2x = b.inX ?? b.x;
    const c2y = b.inY ?? b.y;

    const p01x = lerp(a.x, c1x);
    const p01y = lerp(a.y, c1y);
    const p12x = lerp(c1x, c2x);
    const p12y = lerp(c1y, c2y);
    const p23x = lerp(c2x, b.x);
    const p23y = lerp(c2y, b.y);

    const p012x = lerp(p01x, p12x);
    const p012y = lerp(p01y, p12y);
    const p123x = lerp(p12x, p23x);
    const p123y = lerp(p12y, p23y);

    const p0123x = Math.round(lerp(p012x, p123x));
    const p0123y = Math.round(lerp(p012y, p123y));

    a.outX = Math.round(p01x);
    a.outY = Math.round(p01y);
    b.inX = Math.round(p23x);
    b.inY = Math.round(p23y);
    nodes.splice(segIdx + 1, 0, {
      x: p0123x,
      y: p0123y,
      inX: Math.round(p012x),
      inY: Math.round(p012y),
      outX: Math.round(p123x),
      outY: Math.round(p123y),
    });
  }
  _selectedIdx = segIdx + 1;
  commitShapeGeometry(lay);
}

function commitShapeGeometry(lay: PageLayer): void {
  if (!lay.pathNodes) return;
  lay.bbox = computePathBBox(lay.pathNodes, lay.pathClosed !== false);
  history.snapshot();
  canvas.render();
  renderDirectSelectOverlay();
}

export function renderDirectSelectOverlay(): void {
  const editLayer = getEditLayer();
  if (!editLayer) return;
  editLayer.destroyChildren();

  const lay = findEditingLayer();
  if (!lay || lay.type !== "shape" || !lay.pathNodes?.length) {
    _editingLayerId = null;
    _selectedIdx = null;
    editLayer.batchDraw();
    return;
  }

  const nodes = lay.pathNodes;
  const closed = lay.pathClosed !== false;
  const rot = lay.typography?.rotation || 0;
  const origin = imgToStage(lay.bbox.x, lay.bbox.y);
  const toStagePt = (ix: number, iy: number) => {
    const p = imgToStage(ix, iy);
    return rotateAround(p.x, p.y, origin.x, origin.y, rot);
  };
  const toImgPt = (sx: number, sy: number) => {
    const unrot = rotateAround(sx, sy, origin.x, origin.y, -rot);
    return stageToImg(unrot.x, unrot.y);
  };

  // Outline in stage coords
  const stageNodes: PathNode[] = nodes.map((n) => {
    const p = toStagePt(n.x, n.y);
    const out: PathNode = { x: p.x, y: p.y };
    if (n.inX !== undefined && n.inY !== undefined) {
      const inp = toStagePt(n.inX, n.inY);
      out.inX = inp.x;
      out.inY = inp.y;
    }
    if (n.outX !== undefined && n.outY !== undefined) {
      const outp = toStagePt(n.outX, n.outY);
      out.outX = outp.x;
      out.outY = outp.y;
    }
    return out;
  });

  const segCount = closed ? nodes.length : nodes.length - 1;
  for (let sIdx = 0; sIdx < segCount; sIdx++) {
    const a = stageNodes[sIdx];
    const b = stageNodes[(sIdx + 1) % nodes.length];
    const segPath = new Konva.Path({
      data: nodesToSvgPath([a, b], false),
      stroke: "#3b82f6",
      strokeWidth: 1,
      hitStrokeWidth: 12,
      listening: true,
    });
    segPath.on("mouseenter", (e) => {
      const st = canvas.getStage();
      if (st) st.container().style.cursor = "crosshair";
      showPathHint(e.evt.clientX, e.evt.clientY, "Click to add anchor");
    });
    segPath.on("mousemove", (e) => {
      showPathHint(e.evt.clientX, e.evt.clientY, "Click to add anchor");
    });
    segPath.on("mouseleave", () => {
      const st = canvas.getStage();
      if (st) st.container().style.cursor = "";
      hidePathHint();
    });
    segPath.on("mousedown", (e) => {
      e.cancelBubble = true;
    });
    segPath.on("click tap", (e) => {
      e.cancelBubble = true;
      hidePathHint();
      const pos = canvas.getStage()?.getPointerPosition();
      if (!pos) return;
      insertNodeOnSegment(lay, sIdx, toImgPt(pos.x, pos.y));
    });
    editLayer.add(segPath);
  }

  nodes.forEach((n, idx) => {
    const sp = stageNodes[idx];
    const isSel = _selectedIdx === idx;

    const addHandle = (kind: "in" | "out", hx: number, hy: number) => {
      const line = new Konva.Line({
        points: [sp.x, sp.y, hx, hy],
        stroke: "#60a5fa",
        strokeWidth: 1,
        listening: false,
      });
      editLayer.add(line);

      const dot = new Konva.Circle({
        x: hx,
        y: hy,
        radius: 3.5,
        fill: "#ffffff",
        stroke: "#3b82f6",
        strokeWidth: 1.5,
        draggable: true,
      });
      dot.on("mousedown", (e) => {
        e.cancelBubble = true;
      });
      dot.on("dragmove", (e) => {
        const img = toImgPt(dot.x(), dot.y());
        const dx = img.x - n.x;
        const dy = img.y - n.y;
        if (kind === "in") {
          n.inX = img.x;
          n.inY = img.y;
          if (!e.evt?.altKey && n.outX !== undefined && n.outY !== undefined) {
            n.outX = n.x - dx;
            n.outY = n.y - dy;
          }
        } else {
          n.outX = img.x;
          n.outY = img.y;
          if (!e.evt?.altKey && n.inX !== undefined && n.inY !== undefined) {
            n.inX = n.x - dx;
            n.inY = n.y - dy;
          }
        }
        line.points([sp.x, sp.y, dot.x(), dot.y()]);
        updateLiveShapeNode(lay);
      });
      dot.on("dragend", () => {
        commitShapeGeometry(lay);
      });
      editLayer.add(dot);
    };

    if (sp.inX !== undefined && sp.inY !== undefined) {
      addHandle("in", sp.inX, sp.inY);
    }
    if (sp.outX !== undefined && sp.outY !== undefined) {
      addHandle("out", sp.outX, sp.outY);
    }

    const size = 7;
    const anchor = new Konva.Rect({
      x: sp.x - size / 2,
      y: sp.y - size / 2,
      width: size,
      height: size,
      fill: isSel ? "#e94560" : "#ffffff",
      stroke: isSel ? "#ffffff" : "#3b82f6",
      strokeWidth: 1.5,
      draggable: true,
    });
    anchor.on("mousedown", (e) => {
      e.cancelBubble = true;
      _selectedIdx = idx;
    });
    anchor.on("click tap", (e) => {
      e.cancelBubble = true;
      _selectedIdx = idx;
      renderDirectSelectOverlay();
    });
    anchor.on("dragmove", () => {
      const cx = anchor.x() + size / 2;
      const cy = anchor.y() + size / 2;
      const img = toImgPt(cx, cy);
      const dx = img.x - n.x;
      const dy = img.y - n.y;
      n.x = img.x;
      n.y = img.y;
      if (n.inX !== undefined && n.inY !== undefined) {
        n.inX += dx;
        n.inY += dy;
      }
      if (n.outX !== undefined && n.outY !== undefined) {
        n.outX += dx;
        n.outY += dy;
      }
      updateLiveShapeNode(lay);
    });
    anchor.on("dragend", () => {
      commitShapeGeometry(lay);
    });
    editLayer.add(anchor);
  });

  editLayer.moveToTop();
  editLayer.batchDraw();
}

function bindKeysOnce(): void {
  if (_boundKeys) return;
  _boundKeys = true;
  window.addEventListener(
    "keydown",
    (e) => {
      if (!_editingLayerId) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        e.stopImmediatePropagation();
        stopShapePathEdit();
      } else if (
        (e.key === "Backspace" || e.key === "Delete") &&
        _selectedIdx !== null
      ) {
        const lay = findEditingLayer();
        const minNodes = lay?.pathClosed !== false ? 3 : 2;
        if (lay?.pathNodes && lay.pathNodes.length > minNodes) {
          e.preventDefault();
          e.stopImmediatePropagation();
          lay.pathNodes.splice(_selectedIdx, 1);
          _selectedIdx = null;
          commitShapeGeometry(lay);
        }
      }
    },
    true,
  );
}

export function startShapePathEdit(layerId: string): void {
  bindKeysOnce();
  _editingLayerId = layerId;
  _selectedIdx = null;
  canvas.selectLayer(layerId);
  canvas.render();
  renderDirectSelectOverlay();
}

export function stopShapePathEdit(): void {
  hidePathHint();
  if (!_editingLayerId) return;
  _editingLayerId = null;
  _selectedIdx = null;
  if (_layer) {
    _layer.destroyChildren();
    _layer.batchDraw();
  }
  canvas.render();
}
