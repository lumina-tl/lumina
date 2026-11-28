/** Path geometry helpers — cubic Bezier flattening, SVG path string, bbox. */
import type {
  BBox,
  PathNode,
  StrokeDashPreset,
  StrokeLineCap,
} from "../../../../types";

/** Compute Canvas/Konva dash array scaled by strokeWidth. */
export function getStrokeDashArray(
  preset: StrokeDashPreset | undefined,
  strokeWidth: number,
  lineCap: StrokeLineCap = "round",
): number[] {
  const w = Math.max(1, strokeWidth);
  const dot = lineCap === "round" ? 0.1 : w;
  switch (preset) {
    case "dashed":
      return [w * 3, w * 2];
    case "dotted":
      return [dot, w * 2.2];
    case "dash-dot":
      return [w * 3, w * 1.5, dot, w * 1.5];
    default:
      return [];
  }
}

function cubicAt(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number,
): number {
  const mt = 1 - t;
  return (
    mt * mt * mt * p0 +
    3 * mt * mt * t * p1 +
    3 * mt * t * t * p2 +
    t * t * t * p3
  );
}

function hasCurve(a: PathNode, b: PathNode): boolean {
  return (
    a.outX !== undefined ||
    a.outY !== undefined ||
    b.inX !== undefined ||
    b.inY !== undefined
  );
}

/** Flatten Bezier path nodes (image coords) into polygon points. */
export function flattenPathToPolygon(
  nodes: PathNode[],
  closed = true,
  segmentsPerCurve = 12,
): Array<{ x: number; y: number }> {
  if (nodes.length === 0) return [];
  if (nodes.length === 1) return [{ x: nodes[0].x, y: nodes[0].y }];

  const pts: Array<{ x: number; y: number }> = [];
  const count = closed ? nodes.length : nodes.length - 1;

  for (let i = 0; i < count; i++) {
    const a = nodes[i];
    const b = nodes[(i + 1) % nodes.length];
    if (i === 0) pts.push({ x: a.x, y: a.y });

    if (!hasCurve(a, b)) {
      if (i < nodes.length - 1 || !closed) {
        pts.push({ x: b.x, y: b.y });
      }
      continue;
    }

    const c1x = a.outX ?? a.x;
    const c1y = a.outY ?? a.y;
    const c2x = b.inX ?? b.x;
    const c2y = b.inY ?? b.y;
    for (let s = 1; s <= segmentsPerCurve; s++) {
      if (s === segmentsPerCurve && closed && i === count - 1) break;
      const t = s / segmentsPerCurve;
      pts.push({
        x: Math.round(cubicAt(a.x, c1x, c2x, b.x, t)),
        y: Math.round(cubicAt(a.y, c1y, c2y, b.y, t)),
      });
    }
  }
  return pts;
}

/** Convert PathNode[] to an SVG path data string (optionally offset by -ox, -oy). */
export function nodesToSvgPath(
  nodes: PathNode[],
  closed: boolean,
  ox = 0,
  oy = 0,
): string {
  if (nodes.length === 0) return "";
  const parts: string[] = [`M ${nodes[0].x - ox} ${nodes[0].y - oy}`];
  const count = closed ? nodes.length : nodes.length - 1;

  for (let i = 0; i < count; i++) {
    const a = nodes[i];
    const b = nodes[(i + 1) % nodes.length];
    if (!hasCurve(a, b)) {
      parts.push(`L ${b.x - ox} ${b.y - oy}`);
    } else {
      const c1x = (a.outX ?? a.x) - ox;
      const c1y = (a.outY ?? a.y) - oy;
      const c2x = (b.inX ?? b.x) - ox;
      const c2y = (b.inY ?? b.y) - oy;
      parts.push(
        `C ${c1x} ${c1y}, ${c2x} ${c2y}, ${b.x - ox} ${b.y - oy}`,
      );
    }
  }
  if (closed && nodes.length >= 2) parts.push("Z");
  return parts.join(" ");
}

/** Compute bounding box of a path in image coords. */
export function computePathBBox(nodes: PathNode[], closed: boolean): BBox {
  const pts = flattenPathToPolygon(nodes, closed, 16);
  if (pts.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = pts[0].x;
  let minY = pts[0].y;
  let maxX = pts[0].x;
  let maxY = pts[0].y;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].x < minX) minX = pts[i].x;
    if (pts[i].y < minY) minY = pts[i].y;
    if (pts[i].x > maxX) maxX = pts[i].x;
    if (pts[i].y > maxY) maxY = pts[i].y;
  }
  return {
    x: minX,
    y: minY,
    w: Math.max(1, maxX - minX),
    h: Math.max(1, maxY - minY),
  };
}
