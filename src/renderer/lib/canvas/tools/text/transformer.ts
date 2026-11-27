/** Text Tool — Transformer (move / resize / scale font) */
import Konva from "konva";
import { state } from "../../../state";
import { canvas } from "../../index";
import { sidebar } from "../../../sidebar";
import { history } from "../../../history";
import { layerTextNodes, stageToImg } from "./shared";
import { isEditingShapePath } from "../pen/direct-select";

let _textTransformers: Konva.Transformer[] = [];

export function getTransformer(): Konva.Transformer | null {
  return _textTransformers[0] || null;
}

export function getTransformers(): Konva.Transformer[] {
  return _textTransformers;
}

export function resetTransformer(): void {
  _textTransformers.forEach((tr) => tr.destroy());
  _textTransformers = [];
}

function createTextTransformer(node: Konva.Group): Konva.Transformer {
  const tr = new Konva.Transformer({
    nodes: [node],
    rotateEnabled: false,
    keepRatio: false,
    enabledAnchors: [
      "top-left",
      "top-center",
      "top-right",
      "middle-left",
      "middle-right",
      "bottom-left",
      "bottom-center",
      "bottom-right",
    ],
    anchorStroke: "#e94560",
    anchorFill: "#ffffff",
    anchorSize: 7,
    anchorStrokeWidth: 1.5,
    borderStroke: "#e94560",
    borderStrokeWidth: 1,
    padding: 0,
    ignoreStroke: true,
  });
  tr.on("transformend", function () {
    commitNodesTransform([node]);
  });
  return tr;
}

/** Attach individual transformers to each selected layer's node */
export function syncTransformerSelection(): void {
  const page = state.getActivePage();
  const konvaLayer = canvas.getLayer();
  resetTransformer();
  if (!konvaLayer || !page) return;

  const selIds =
    page._selectedLayerIds && page._selectedLayerIds.length > 0
      ? page._selectedLayerIds
      : page._selectedLayerId
        ? [page._selectedLayerId]
        : [];
  const nodes = selIds
    .map(function (selId) {
      return layerTextNodes.find(function (n) {
        return n.getAttr("layerId") === selId;
      });
    })
    .filter(function (n): n is Konva.Group {
      return !!n;
    });

  const canDrag =
    state.activeTool === "select" || state.activeTool === "text";

  layerTextNodes.forEach((n) => {
    const lid = n.getAttr("layerId") as string;
    const lay = page.layers.find((l) => l.id === lid);
    const locked = !!lay?.locked;
    n.listening(!locked);
    n.draggable(canDrag && !locked && !isEditingShapePath(lid));
  });

  if (nodes.length > 0) {
    const trNodes = nodes.filter((n) => {
      const lid = n.getAttr("layerId") as string;
      const lay = page.layers.find((l) => l.id === lid);
      return !lay?.locked && !isEditingShapePath(lid);
    });
    if (!canDrag && state.activeTool !== "lasso" && state.activeTool !== "rect") {
      nodes.forEach((n) => n.draggable(false));
    } else {
      trNodes.forEach((node) => {
        if (canDrag) node.draggable(true);
        node.listening(true);
        const tr = createTextTransformer(node);
        konvaLayer.add(tr);
        _textTransformers.push(tr);
      });
    }
  }
}

/** Wrap an angle to (-180, 180] */
function normalizeRotation(deg: number): number {
  let r = ((deg % 360) + 360) % 360;
  if (r > 180) r -= 360;
  return Math.round(r);
}

/** Commit transforms of one or more nodes back to the layer model */
export function commitNodesTransform(nodes: Konva.Group[]): void {
  const page = state.getActivePage();
  if (!page || !nodes.length) return;
  const sr = canvas.getScaleRatio();

  for (const node of nodes) {
    const id = node.getAttr("layerId") as string;
    const lay = page.layers.find(function (l) {
      return l.id === id;
    });
    if (!lay) continue;

    const sx = node.scaleX();
    const sy = node.scaleY();
    const rot = normalizeRotation(node.rotation() || 0);
    const pureRotate = Math.abs(sx - 1) < 0.001 && Math.abs(sy - 1) < 0.001;

    const rect = node.findOne<Konva.Rect>(".layer-text-box");
    const localW = rect ? (rect.width() * sx) / sr : lay.bbox.w;
    const localH = rect ? (rect.height() * sy) / sr : lay.bbox.h;

    const oldX = lay.bbox.x;
    const oldY = lay.bbox.y;
    const oldW = Math.max(1, lay.bbox.w);
    const oldH = Math.max(1, lay.bbox.h);

    const p = stageToImg(node.x(), node.y());
    lay.bbox.x = p.x;
    lay.bbox.y = p.y;
    lay.bbox.w = Math.max(8, Math.round(localW));
    lay.bbox.h = Math.max(8, Math.round(localH));
    lay.bbox.rotation = rot;
    lay.typography.rotation = rot;

    if (lay.type === "shape" && lay.pathNodes) {
      const rx = pureRotate ? 1 : lay.bbox.w / oldW;
      const ry = pureRotate ? 1 : lay.bbox.h / oldH;
      const mapX = (v: number) => Math.round(lay.bbox.x + (v - oldX) * rx);
      const mapY = (v: number) => Math.round(lay.bbox.y + (v - oldY) * ry);
      lay.pathNodes.forEach((pt) => {
        pt.x = mapX(pt.x);
        pt.y = mapY(pt.y);
        if (pt.inX !== undefined) pt.inX = mapX(pt.inX);
        if (pt.inY !== undefined) pt.inY = mapY(pt.inY);
        if (pt.outX !== undefined) pt.outX = mapX(pt.outX);
        if (pt.outY !== undefined) pt.outY = mapY(pt.outY);
      });
    }

    if (state.activeTool === "select" && !pureRotate) {
      if (lay.typography.fontSize !== null) {
        const ratio = Math.sqrt(Math.abs(sx * sy));
        lay.typography.fontSize = Math.max(
          4,
          Math.round(lay.typography.fontSize * ratio),
        );
      }
    }
    node.scaleX(1);
    node.scaleY(1);
  }

  canvas.render();
  sidebar.render();
  history.snapshot();
}

/** Commit a transform back to the layer model */
export function onNodeTransformEnd(node: Konva.Group): void {
  commitNodesTransform([node]);
}
