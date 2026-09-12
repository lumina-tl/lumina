/* ── Text Tool — Transformer (move / resize / scale font) ── */
import Konva from "konva";
import { state } from "../../../state";
import { canvas } from "../../index";
import { sidebar } from "../../../sidebar";
import { history } from "../../../history";
import { layerTextNodes, stageToImg } from "./shared";

let transformer: Konva.Transformer | null = null;

export function getTransformer(): Konva.Transformer | null {
  return transformer;
}

export function resetTransformer(): void {
  if (transformer) {
    transformer.destroy();
    transformer = null;
  }
}

function ensureTransformer(): void {
  const konvaLayer = canvas.getLayer();
  if (!konvaLayer) return;
  if (!transformer) {
    // Same visual language as the detection transformer (white square
    // anchors, colored border) — but all 8 anchors so the text box can be
    // resized in width, height, or both. padding keeps the handles outside
    // the editor textarea while typing.
    //
    // Konva's rotater rotates the box around its center WITHOUT writing
    // scale (rotateAroundCenter only changes rotation/x/y), so a pure
    // rotation keeps the local box size — auto-fit font stays stable.
    transformer = new Konva.Transformer({
      rotateEnabled: true,
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
      anchorFill: "#fff",
      anchorSize: 8,
      borderStroke: "#e94560",
      borderStrokeWidth: 1,
      padding: 6,
    });
    konvaLayer.add(transformer);
  }
}

/** Attach the transformer to the selected layer's node (if any) */
export function syncTransformerSelection(): void {
  const page = state.getActivePage();
  ensureTransformer();
  if (!transformer) return;
  const selId = page ? page._selectedLayerId : null;
  const node = selId
    ? layerTextNodes.find(function (n) {
        return n.getAttr("layerId") === selId;
      })
    : null;
  if (node) {
    // Paint tools own the pointer — never let a text node drag over a
    // brush stroke (the brush needs the mousedown).
    const paint =
      state.activeTool === "brush" ||
      state.activeTool === "eraser" ||
      state.activeTool === "bucket" ||
      state.activeTool === "eyedropper";
    if (paint) {
      transformer.nodes([]);
      node.draggable(false);
    } else {
      transformer.nodes([node]);
      node.draggable(true);
    }
  } else {
    transformer.nodes([]);
  }
}

/** Wrap an angle to (-180, 180] */
function normalizeRotation(deg: number): number {
  let r = ((deg % 360) + 360) % 360;
  if (r > 180) r -= 360;
  return Math.round(r);
}

/** Commit a transform back to the layer model */
export function onNodeTransformEnd(node: Konva.Group): void {
  const page = state.getActivePage();
  if (!page) return;
  const id = node.getAttr("layerId") as string;
  const lay = page.layers.find(function (l) {
    return l.id === id;
  });
  if (!lay) return;

  const sx = node.scaleX();
  const sy = node.scaleY();

  // The Transformer rotates the GROUP as a whole (box + glyphs together,
  // Photoshop-style) and writes the total rotation to the node. The node's
  // rotation IS the final angle — commit it directly (no reset), so the
  // box rotates visually.
  const rot = normalizeRotation(node.rotation() || 0);

  const sr = canvas.getScaleRatio();
  const pureRotate = Math.abs(sx - 1) < 0.001 && Math.abs(sy - 1) < 0.001;

  // Box size: bbox.w/h are LOCAL box dimensions (the box is rotated via
  // bbox.rotation), so derive them from the un-rotated local rect scaled
  // by the transform. The AABB (getClientRect) grows with rotation — using
  // it here would inflate a rotated box on every resize.
  const rect = node.findOne<Konva.Rect>(".layer-text-box");
  const localW = rect ? (rect.width() * sx) / sr : lay.bbox.w;
  const localH = rect ? (rect.height() * sy) / sr : lay.bbox.h;

  // Position: node.x()/y() is the LOCAL top-left (frame parent, before
  // rotation — Konva applies translate → rotate → scale), which is exactly
  // what nodeFactory reconstructs from bbox.x/y + bbox.rotation. For pure
  // rotation Konva moves x/y around the box center; for resize it tracks
  // the dragged top-left. Committing the AABB (getClientRect) here would
  // shift the box whenever rotation ≠ 0.
  const p = stageToImg(node.x(), node.y());
  lay.bbox.x = p.x;
  lay.bbox.y = p.y;
  lay.bbox.w = Math.max(8, Math.round(localW));
  lay.bbox.h = Math.max(8, Math.round(localH));
  lay.bbox.rotation = rot;
  // Keep the box rotation and the glyph rotation in sync.
  lay.typography.rotation = rot;

  if (state.activeTool === "select" && !pureRotate) {
    // Free transform (Move tool): box AND font scale together.
    if (lay.typography.fontSize !== null) {
      const ratio = Math.sqrt(Math.abs(sx * sy));
      lay.typography.fontSize = Math.max(
        4,
        Math.round(lay.typography.fontSize * ratio),
      );
    }
  }
  // Text tool: box-only resize (Photoshop text box) — explicit font size
  // stays fixed and the text re-wraps; auto-fit (fontSize null) re-fits on
  // the next render.

  canvas.render();
  sidebar.render();
  history.snapshot();
}
