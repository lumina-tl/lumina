/** Bbox + rotation → PSD transform matrix + box bounds. */
import type { BBox } from "../../../types";

/** PSD transform: [scaleX, skewY, skewX, scaleY, translateX, translateY] */
export function bboxToTransform(
  bbox: BBox,
  offsetX = 0,
  offsetY = 0,
): number[] {
  const rad = ((bbox.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // PSD origin is top-left of the bounding box after rotation.
  // Use center of bbox as rotation pivot, then shift origin to top-left.
  const cx = bbox.w / 2;
  const cy = bbox.h / 2;
  const tx = offsetX + bbox.x + cx - (cos * cx - sin * cy);
  const ty = offsetY + bbox.y + cy - (sin * cx + cos * cy);
  return [cos, sin, -sin, cos, tx, ty];
}

/** PSD box bounds: [left, top, right, bottom] relative to layer. */
export function bboxToBoxBounds(bbox: BBox): number[] {
  return [0, 0, bbox.w, bbox.h];
}
