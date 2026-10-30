/** Text Tool — Transformer (move / resize / scale font) */
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
    // anchors, colored border). All 8 anchors; keepRatio false so corner
    // drags free-resize instead of locking aspect. padding MUST stay 0:
    // Konva draws the rotate stem without padding but places the rotater
    // WITH padding — any padding > 0 leaves a stub line past the handle.
    transformer = new Konva.Transformer({
      rotateEnabled: true,
      rotateAnchorOffset: 24,
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
    konvaLayer.add(transformer);
  }
}

/** Attach the transformer to the selected layer's node (if any).
 *  Red chrome = text-layer selection. Det-box mode uses green chrome, with
 *  one exception: a still-selected free-text box (just created) keeps red
 *  handles until blank-click deselects it. */
export function syncTransformerSelection(): void {
  const page = state.getActivePage();
  ensureTransformer();
  if (!transformer) return;
  const selId = page ? page._selectedLayerId : null;
  const selLayer = selId
    ? page!.layers.find(function (l) {
        return l.id === selId;
      })
    : null;
  const node = selId
    ? layerTextNodes.find(function (n) {
        return n.getAttr("layerId") === selId;
      })
    : null;

  // Always paint text-box chrome so typeset layers stay visible even when
  // green detection overlays are also on.
  layerTextNodes.forEach(function (n) {
    const box = n.findOne<Konva.Rect>(".layer-text-box");
    if (!box) return;
    if (n === node) {
      box.stroke("#e94560");
      box.strokeWidth(2);
      box.dash([]);
      return;
    }
    const glyphs = n.findOne<Konva.Text>(".layer-text-glyphs");
    const hasText = !!(glyphs && glyphs.text() && glyphs.text().trim());
    if (hasText) {
      // Filled: light solid outline so the box reads as a text frame.
      box.stroke("rgba(233, 69, 96, 0.45)");
      box.strokeWidth(1);
      box.dash([]);
    } else {
      box.stroke("rgba(233, 69, 96, 0.55)");
      box.strokeWidth(1);
      box.dash([6, 4]);
    }
  });

  // Det-box mode: green chrome owns dialogue picks — only a still-selected
  // free-text keeps red handles. Still leave box strokes painted above.
  if (state.showDetBoxes && !(selLayer && selLayer.type === "text-free" && node)) {
    transformer.nodes([]);
    layerTextNodes.forEach(function (n) {
      n.draggable(false);
    });
    return;
  }

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
      node.listening(true);
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
