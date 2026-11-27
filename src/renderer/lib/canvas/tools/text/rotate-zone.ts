/** Photoshop-style Free Transform rotation zone outside active Transformers. */
import type Konva from "konva";
import { state } from "../../../state";
import { canvas } from "../../index";
import { isSpacePressed } from "../../viewport";
import { commitNodesTransform, getTransformers } from "./transformer";

const ROTATE_ZONE_PX = 24;

export const ROTATE_CURSOR =
  `url("data:image/svg+xml;utf8,` +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">` +
      `<path d="M16.5 6.5A6.5 6.5 0 0 0 5.6 10M7.5 17.5A6.5 6.5 0 0 0 18.4 14" fill="none" stroke="#000" stroke-width="3.2" stroke-linecap="round"/>` +
      `<path d="M13.5 3.5L17.5 6.5L14 9.5M10.5 20.5L6.5 17.5L10 14.5" fill="none" stroke="#000" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="M16.5 6.5A6.5 6.5 0 0 0 5.6 10M7.5 17.5A6.5 6.5 0 0 0 18.4 14" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>` +
      `<path d="M13.5 3.5L17.5 6.5L14 9.5M10.5 20.5L6.5 17.5L10 14.5" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>` +
      `</svg>`,
  ) +
  `") 12 12, crosshair`;

interface RotateDragState {
  active: boolean;
  tr: Konva.Transformer;
  node: Konva.Group;
  center: { x: number; y: number };
  startPointerAngle: number;
  startRot: number;
  startX: number;
  startY: number;
}

let _drag: RotateDragState | null = null;
let _bound = false;

export function resetRotateZoneBinding(): void {
  _bound = false;
  _drag = null;
}

export function isRotating(): boolean {
  return !!_drag?.active;
}

export function isOverResizeAnchor(target: unknown): boolean {
  const t = target as {
    name?: () => string;
    getParent?: () => { className?: string } | null;
  } | null;
  if (!t || !t.getParent) return false;
  if (t.getParent()?.className !== "Transformer") return false;
  const name = t.name ? t.name().replace(/ ?_anchor$/, "") : "";
  return !!name && name !== "rotater";
}

export function findRotateZoneTransformer(pos: {
  x: number;
  y: number;
}): Konva.Transformer | null {
  if (state.activeTool !== "select" && state.activeTool !== "text") {
    return null;
  }
  const transformers = getTransformers();
  for (let i = transformers.length - 1; i >= 0; i--) {
    const tr = transformers[i];
    const w = tr.width();
    const h = tr.height();
    if (w <= 0 || h <= 0) continue;
    const local = tr.getTransform().copy().invert().point(pos);
    // Inside the bounding box is move, not rotate.
    if (local.x >= 0 && local.x <= w && local.y >= 0 && local.y <= h) {
      continue;
    }
    const dx = Math.max(0, -local.x, local.x - w);
    const dy = Math.max(0, -local.y, local.y - h);
    const dist = Math.hypot(dx, dy);
    if (dist > 0 && dist <= ROTATE_ZONE_PX) {
      return tr;
    }
  }
  return null;
}

export function isInRotateZone(
  pos: { x: number; y: number } | null | undefined,
  target: unknown,
): boolean {
  if (_drag?.active) return true;
  if (!pos || isOverResizeAnchor(target)) return false;
  return !!findRotateZoneTransformer(pos);
}

export function bindRotateZone(): void {
  const stage = canvas.getStage();
  if (!stage || _bound) return;
  _bound = true;

  const onWindowMove = (ev: MouseEvent) => {
    if (!_drag?.active) return;
    const s = canvas.getStage();
    if (!s) return;
    s.setPointersPositions(ev);
    const pos = s.getPointerPosition();
    if (!pos) return;

    const { tr, node, center, startPointerAngle, startRot, startX, startY } =
      _drag;
    const curAngle =
      Math.atan2(pos.y - center.y, pos.x - center.x) * (180 / Math.PI);
    let nextRot = startRot + (curAngle - startPointerAngle);
    if (ev.shiftKey) {
      nextRot = Math.round(nextRot / 15) * 15;
    }
    const appliedRad = ((nextRot - startRot) * Math.PI) / 180;
    const vx = startX - center.x;
    const vy = startY - center.y;
    const cos = Math.cos(appliedRad);
    const sin = Math.sin(appliedRad);

    node.x(center.x + vx * cos - vy * sin);
    node.y(center.y + vx * sin + vy * cos);
    node.rotation(nextRot);
    tr.forceUpdate();
    canvas.getLayer()?.batchDraw();
  };

  const onWindowUp = () => {
    if (!_drag?.active) return;
    const { node, startRot } = _drag;
    _drag = null;
    window.removeEventListener("mousemove", onWindowMove);
    window.removeEventListener("mouseup", onWindowUp);
    if (Math.abs(node.rotation() - startRot) > 0.01) {
      commitNodesTransform([node]);
    }
  };

  stage.on("mousedown touchstart", function (e) {
    if (state.activeTool !== "select" && state.activeTool !== "text") return;
    if (e.evt && e.evt.button !== 0 && e.evt.button !== undefined) return;
    if (isSpacePressed()) return;
    if (isOverResizeAnchor(e.target)) return;

    const pos = stage.getPointerPosition();
    if (!pos) return;
    const tr = findRotateZoneTransformer(pos);
    if (!tr) return;

    const node = tr.nodes()[0] as Konva.Group | undefined;
    if (!node) return;

    const center = tr.getTransform().point({
      x: tr.width() / 2,
      y: tr.height() / 2,
    });
    const startPointerAngle =
      Math.atan2(pos.y - center.y, pos.x - center.x) * (180 / Math.PI);

    _drag = {
      active: true,
      tr,
      node,
      center,
      startPointerAngle,
      startRot: node.rotation() || 0,
      startX: node.x(),
      startY: node.y(),
    };
    e.cancelBubble = true;
    window.addEventListener("mousemove", onWindowMove);
    window.addEventListener("mouseup", onWindowUp);
  });
}
