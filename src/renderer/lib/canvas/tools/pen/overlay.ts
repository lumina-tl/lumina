/** Pen tool overlay — live Bezier path, rubber-band preview, anchors & handles. */
import Konva from "konva";
import { canvas } from "../../index";
import { imgToStage } from "../select/shared";
import { nodesToSvgPath } from "./path-math";
import type { PathNode } from "../../../../types";

let _layer: Konva.Layer | null = null;

function getLayer(): Konva.Layer | null {
  const stage = canvas.getStage();
  if (!stage) return null;
  if (!_layer || _layer.getStage() !== stage) {
    _layer = new Konva.Layer({ listening: false });
    stage.add(_layer);
    _layer.moveToTop();
  }
  return _layer;
}

function toStageNodes(nodes: PathNode[]): PathNode[] {
  return nodes.map((n) => {
    const p = imgToStage(n.x, n.y);
    const out: PathNode = { x: p.x, y: p.y };
    if (n.inX !== undefined && n.inY !== undefined) {
      const inp = imgToStage(n.inX, n.inY);
      out.inX = inp.x;
      out.inY = inp.y;
    }
    if (n.outX !== undefined && n.outY !== undefined) {
      const outp = imgToStage(n.outX, n.outY);
      out.outX = outp.x;
      out.outY = outp.y;
    }
    return out;
  });
}

export function renderPenOverlay(
  nodes: PathNode[],
  hoverImg: { x: number; y: number } | null,
  hoverClosing: boolean,
): void {
  const layer = getLayer();
  if (!layer) return;
  layer.destroyChildren();
  if (nodes.length === 0) {
    layer.batchDraw();
    return;
  }

  const sNodes = toStageNodes(nodes);

  // Main path curve
  if (sNodes.length >= 2) {
    layer.add(
      new Konva.Path({
        data: nodesToSvgPath(sNodes, false),
        stroke: "#3b82f6",
        strokeWidth: 1.5,
        listening: false,
      }),
    );
  }

  // Rubber-band segment from last node to cursor
  if (hoverImg && sNodes.length >= 1) {
    const last = sNodes[sNodes.length - 1];
    const target = hoverClosing ? sNodes[0] : imgToStage(hoverImg.x, hoverImg.y);
    const previewNodes: PathNode[] = [
      { x: last.x, y: last.y, outX: last.outX, outY: last.outY },
      hoverClosing
        ? { x: target.x, y: target.y, inX: sNodes[0].inX, inY: sNodes[0].inY }
        : { x: target.x, y: target.y },
    ];
    layer.add(
      new Konva.Path({
        data: nodesToSvgPath(previewNodes, false),
        stroke: "#60a5fa",
        strokeWidth: 1,
        dash: [4, 4],
        listening: false,
      }),
    );
  }

  // Control handles + anchor points
  for (let i = 0; i < sNodes.length; i++) {
    const n = sNodes[i];
    const drawHandle = (hx: number, hy: number) => {
      layer.add(
        new Konva.Line({
          points: [n.x, n.y, hx, hy],
          stroke: "#60a5fa",
          strokeWidth: 1,
          listening: false,
        }),
      );
      layer.add(
        new Konva.Circle({
          x: hx,
          y: hy,
          radius: 3,
          fill: "#ffffff",
          stroke: "#3b82f6",
          strokeWidth: 1.2,
          listening: false,
        }),
      );
    };
    if (n.inX !== undefined && n.inY !== undefined) drawHandle(n.inX, n.inY);
    if (n.outX !== undefined && n.outY !== undefined) drawHandle(n.outX, n.outY);

    const isFirst = i === 0;
    const size = isFirst && hoverClosing ? 9 : 6;
    layer.add(
      new Konva.Rect({
        x: n.x - size / 2,
        y: n.y - size / 2,
        width: size,
        height: size,
        fill: isFirst && hoverClosing ? "#3b82f6" : "#ffffff",
        stroke: "#3b82f6",
        strokeWidth: 1.5,
        listening: false,
      }),
    );
  }

  layer.moveToTop();
  layer.batchDraw();
}

export function clearPenOverlay(): void {
  if (!_layer) return;
  _layer.destroyChildren();
  _layer.batchDraw();
}
